import test from "node:test";
import assert from "node:assert/strict";

import { jsonRpcBatch } from "../src/sensors/rpcJsonClient.js";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("RPC batch client falls back to bounded individual calls when batches are rejected", async () => {
  const originalFetch = globalThis.fetch;
  let batchCalls = 0;
  let singleCalls = 0;
  globalThis.fetch = async (_url, options = {}) => {
    const payload = JSON.parse(options.body);
    if (Array.isArray(payload)) {
      batchCalls += 1;
      return response({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "batch disabled" } });
    }
    singleCalls += 1;
    return response({ jsonrpc: "2.0", id: payload.id, result: `result:${payload.method}` });
  };

  try {
    const rows = await jsonRpcBatch("https://rpc.example", [
      { method: "first", params: [] },
      { method: "second", params: [] },
      { method: "third", params: [] },
    ], {
      retries: 0,
      sequentialFallbackConcurrency: 2,
      maxSequentialFallbackCalls: 3,
    });
    assert.equal(batchCalls, 1);
    assert.equal(singleCalls, 3);
    assert.deepEqual(rows.map((row) => row.result), ["result:first", "result:second", "result:third"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("RPC sequential fallback preserves per-call failures", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options = {}) => {
    const payload = JSON.parse(options.body);
    if (Array.isArray(payload)) return response({ error: { code: -32600 } });
    if (payload.method === "broken") {
      return response({ jsonrpc: "2.0", id: payload.id, error: { code: -32000, message: "broken call" } });
    }
    return response({ jsonrpc: "2.0", id: payload.id, result: "ok" });
  };

  try {
    const rows = await jsonRpcBatch("https://rpc.example", [
      { method: "working", params: [] },
      { method: "broken", params: [] },
    ], { retries: 0 });
    assert.equal(rows[0].result, "ok");
    assert.equal(rows[1].result, null);
    assert.match(rows[1].error.message, /broken call/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("RPC sequential fallback refuses unbounded provider expansion", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => response({ error: { code: -32600 } });

  try {
    await assert.rejects(
      jsonRpcBatch("https://rpc.example", [
        { method: "first", params: [] },
        { method: "second", params: [] },
      ], { retries: 0, maxSequentialFallbackCalls: 1 }),
      /above the bounded limit of 1/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
