import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  appendExactMarketObservations,
  buildExactMarketObservation,
  exactMarketObservationIntegrityHash,
  loadExactMarketObservations,
} from "../src/production/exactMarketObservationLedger.js";
import { strictIdentityKey } from "../src/production/productionMath.js";
import { linkShadowPredictionsToOutcomes } from "../src/production/shadowOutcomeLinker.js";

const TOKEN = `0x${"1".repeat(40)}`;
const POOL = `0x${"2".repeat(40)}`;

test("strict forward identity never falls back to symbol or name", () => {
  assert.equal(strictIdentityKey({ chain: "base", symbol: "SAME" }), null);
  assert.equal(strictIdentityKey({ chain: "base", name: "Same Token" }), null);
  assert.equal(strictIdentityKey({ chain: "base", tokenAddress: TOKEN }), `base:${TOKEN}`);
});

test("exact market ledger rejects symbol-only rows and deduplicates exact observations", () => {
  assert.equal(buildExactMarketObservation({ chain: "base", symbol: "NOPE", priceUsd: 1 }, { observedAt: "2026-08-23T12:00:00Z" }), null);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exact-ledger-"));
  const file = path.join(dir, "observations.jsonl");
  const row = { chain: "base", tokenAddress: TOKEN, poolAddress: POOL, symbol: "EXACT", priceUsd: 1.25, liquidityUsd: 500000 };
  const first = appendExactMarketObservations([row], { file, observedAt: "2026-08-23T12:00:00Z", source: "test" });
  const second = appendExactMarketObservations([row], { file, observedAt: "2026-08-23T12:00:00Z", source: "test" });
  assert.equal(first.saved, 1);
  assert.equal(second.saved, 0);
  const loaded = loadExactMarketObservations({ file });
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].identityKey, `base:${TOKEN}`);
  assert.equal(loaded[0].exactIdentityVerified, true);
  assert.equal(loaded[0].observationIntegrityHash, exactMarketObservationIntegrityHash(loaded[0]));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("malformed exact-ledger lines surface an integrity sentinel instead of disappearing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exact-ledger-malformed-"));
  const file = path.join(dir, "observations.jsonl");
  fs.writeFileSync(file, "{not-json}\n");
  const loaded = loadExactMarketObservations({ file });
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].__exactObservationLedgerParseFailure, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("exact market ledger rejects observations from the future and can enforce freshness", () => {
  const row = { chain: "base", tokenAddress: TOKEN, poolAddress: POOL, priceUsd: 1.25 };
  assert.equal(buildExactMarketObservation(row, {
    observedAt: "2026-08-23T12:01:00Z",
    asOf: "2026-08-23T12:00:00Z",
  }), null);
  assert.equal(buildExactMarketObservation(row, {
    observedAt: "2026-08-23T10:00:00Z",
    asOf: "2026-08-23T12:00:00Z",
    maximumObservationAgeMinutes: 30,
  }), null);
  assert.ok(buildExactMarketObservation(row, {
    observedAt: "2026-08-23T11:45:00Z",
    asOf: "2026-08-23T12:00:00Z",
    maximumObservationAgeMinutes: 30,
  }));
});

test("shadow outcome truth cannot link two symbol-only rows", () => {
  const prediction = { chain: "base", symbol: "SAME", decisionAt: "2026-08-23T00:00:00Z", priceUsd: 1 };
  const outcome = { chain: "base", symbol: "SAME", observedAt: "2026-08-24T00:10:00Z", priceUsd: 2 };
  assert.deepEqual(linkShadowPredictionsToOutcomes([prediction], [outcome], { horizonHours: 24, maxLatenessHours: 1 }), []);
});

test("shadow outcome truth links exact token identity and enforces pool when both sides know it", () => {
  const prediction = { chain: "base", tokenAddress: TOKEN, poolAddress: POOL, decisionAt: "2026-08-23T00:00:00Z", priceUsd: 1 };
  const wrongPool = { chain: "base", tokenAddress: TOKEN, poolAddress: `0x${"3".repeat(40)}`, observedAt: "2026-08-24T00:05:00Z", priceUsd: 9 };
  const exact = { chain: "base", tokenAddress: TOKEN, poolAddress: POOL, observedAt: "2026-08-24T00:10:00Z", priceUsd: 1.5 };
  const linked = linkShadowPredictionsToOutcomes([prediction], [wrongPool, exact], { horizonHours: 24, maxLatenessHours: 1 });
  assert.equal(linked.length, 1);
  assert.equal(Number(linked[0].realizedReturnPct.toFixed(2)), 50);
});
