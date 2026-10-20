import test from "node:test";
import assert from "node:assert/strict";

import { getPairByAddress } from "../src/data/dexScreenerConnector.js";
import { getGeckoPoolByAddress } from "../src/data/geckoTerminalConnector.js";

const POOL = `0x${"a".repeat(40)}`;

test("DexScreener opt-in receipt capture receives exact malformed response bytes before parsing", async () => {
  const body = "{ definitely not json";
  let receipt = null;
  await assert.rejects(
    getPairByAddress("base", POOL, {
      now: "2026-10-20T00:00:00.000Z",
      fetchImpl: async () => new Response(body, { status: 200, headers: { date: "Mon, 20 Oct 2026 00:00:00 GMT", "content-type": "application/json" } }),
      onResponseBytes: async (value) => { receipt = value; },
    }),
    SyntaxError,
  );
  assert.equal(receipt.provider, "dexscreener");
  assert.equal(receipt.status, 200);
  assert.equal(receipt.requestedAt, "2026-10-20T00:00:00.000Z");
  assert.equal(receipt.headers.contentType, "application/json");
  assert.equal(receipt.rawBytes.toString("utf8"), body);
});

test("raw receipt timestamp is taken after a delayed body resolves", async () => {
  let bodyResolved = false;
  let receipt = null;
  const response = {
    ok: true,
    status: 200,
    headers: { get: () => null },
    arrayBuffer: async () => {
      bodyResolved = true;
      return Buffer.from('{"pairs":[]}');
    },
  };
  await getPairByAddress("base", POOL, {
    requestedAt: "2026-10-20T00:00:00.000Z",
    now: () => bodyResolved ? "2026-10-20T00:00:05.000Z" : "2026-10-20T00:00:00.000Z",
    fetchImpl: async () => response,
    onResponseBytes: async (value) => { receipt = value; },
  });
  assert.equal(receipt.requestedAt, "2026-10-20T00:00:00.000Z");
  assert.equal(receipt.receivedAt, "2026-10-20T00:00:05.000Z");
});

test("invalid injected receipt clock does not fall back to wall clock", async () => {
  await assert.rejects(
    getPairByAddress("base", POOL, {
      now: "not-a-clock",
      fetchImpl: async () => new Response('{"pairs":[]}', { status: 200 }),
      onResponseBytes: async () => {},
    }),
    /valid timestamp/,
  );
});

test("an interrupted response body remains a provider failure eligible for independent fallback", async () => {
  const failure = new Error("body transport interrupted"); failure.name = "AbortError";
  await assert.rejects(getPairByAddress("base", POOL, {
    fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => { throw failure; } }),
    onResponseBytes: () => assert.fail("an incomplete body must not be advertised as original complete bytes"),
  }), error => error === failure && error.responseReceiptCaptureFailure !== true);
});

test("Gecko capture receives 429 bytes and exposes retry scheduling metadata", async () => {
  const body = '{"error":"slow down"}';
  let receipt = null;
  await assert.rejects(
    getGeckoPoolByAddress("base", POOL, {
      maxAttempts: 1,
      now: "2026-10-20T00:00:00.000Z",
      fetchImpl: async () => new Response(body, { status: 429, headers: { "retry-after": "7", "content-type": "application/json" } }),
      onResponseBytes: async (value) => { receipt = value; },
    }),
    (error) => error.statusCode === 429 && error.retryAfterMs === 7_000,
  );
  assert.equal(receipt.provider, "geckoterminal");
  assert.equal(receipt.status, 429);
  assert.equal(receipt.rawBytes.toString("utf8"), body);
});

test("receipt callback failure is visible and Gecko does not retry it", async () => {
  let calls = 0;
  await assert.rejects(
    getGeckoPoolByAddress("base", POOL, {
      maxAttempts: 3,
      fetchImpl: async () => {
        calls += 1;
        return new Response('{"data":{}}', { status: 200 });
      },
      onResponseBytes: async () => { throw new Error("receipt storage unavailable"); },
    }),
    /receipt storage unavailable/,
  );
  assert.equal(calls, 1);
});

test("opt-in capture fails visibly rather than inventing bytes from parsed JSON", async () => {
  let calls = 0;
  await assert.rejects(
    getGeckoPoolByAddress("base", POOL, {
      maxAttempts: 3,
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ data: {} }) };
      },
      onResponseBytes: async () => assert.fail("no bytes should be synthesized"),
    }),
    /raw-capable response/,
  );
  assert.equal(calls, 1);
});

test("legacy callers still parse successful responses without raw capture", async () => {
  const payload = { pairs: [{ chainId: "base", pairAddress: POOL }] };
  const result = await getPairByAddress("base", POOL, {
    fetchImpl: async () => new Response(JSON.stringify(payload), { status: 200 }),
  });
  assert.deepEqual(result, payload);
});
