import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHistoricalDataset, exactIdentity } from "../src/backtest/historicalDatasetBuilder.js";

test("dataset builder joins exact identities and walks the path before the target", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "core-backtest-"));
  const dataDir = path.join(root, "data");
  const reportDir = path.join(root, "reports");
  fs.mkdirSync(dataDir);
  fs.mkdirSync(reportDir);
  const address = "0x1111111111111111111111111111111111111111";
  const prediction = {
    id: address,
    chain: "base",
    symbol: "ONE",
    scannedAt: "2026-01-01T00:00:00.000Z",
    market: { priceUsd: 1, liquidityUsd: 100000, volume24h: 50000, priceChange24h: 5 },
    scores: { pipeline: 70 },
    futureOutcomes: { after7d: 999 },
  };
  fs.writeFileSync(path.join(dataDir, "scan-history.json"), JSON.stringify([prediction]));
  fs.writeFileSync(
    path.join(dataDir, "scan-history.jsonl"),
    `${JSON.stringify({ recordType: "scan-history", record: prediction })}\n`
  );
  fs.writeFileSync(
    path.join(dataDir, "outcome-snapshots.json"),
    JSON.stringify([
      { key: `base:${address}`, chain: "base", timestamp: "2026-01-02T00:00:00.000Z", priceUsd: 0.4, liquidityUsd: 90000 },
      { key: `base:${address}`, chain: "base", timestamp: "2026-01-08T00:00:00.000Z", priceUsd: 2.2, liquidityUsd: 100000 },
    ])
  );

  const dataset = buildHistoricalDataset({ dataDir, reportDir });
  assert.equal(dataset.records.length, 1);
  assert.equal(dataset.health.deduplicatedCount, 1);
  assert.equal(dataset.records[0].identityKey, `base:${address}`);
  assert.equal(dataset.records[0].outcome.targets.plus100Within168h.hit, true);
  assert.equal(dataset.records[0].outcome.catastrophicDrawdownBeforeTwoX, true);
  assert.equal(dataset.records[0].outcome.successfulSevenDayBreakout, false);
  assert.equal(dataset.leakageAudit.status, "PASS");
  assert.ok(dataset.health.leakageFieldsRemoved >= 1);
});

test("symbol-only candidates are quarantined", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "core-backtest-"));
  const dataDir = path.join(root, "data");
  const reportDir = path.join(root, "reports");
  fs.mkdirSync(dataDir);
  fs.mkdirSync(reportDir);
  fs.writeFileSync(
    path.join(dataDir, "scan-history.json"),
    JSON.stringify([{ id: "base:ABC", chain: "base", symbol: "ABC", scannedAt: "2026-01-01T00:00:00Z", market: { priceUsd: 1 } }])
  );
  fs.writeFileSync(path.join(dataDir, "outcome-snapshots.json"), "[]");
  const dataset = buildHistoricalDataset({ dataDir, reportDir });
  assert.equal(dataset.records.length, 0);
  assert.equal(dataset.health.quarantinedCount, 1);
});

test("legacy Solana keys are rejected when address casing was not preserved", () => {
  const mint = "So11111111111111111111111111111111111111112";
  assert.equal(exactIdentity({ chain: "solana", key: `solana:${mint.toLowerCase()}` }), null);
  assert.deepEqual(exactIdentity({ chain: "solana", tokenAddress: mint }), {
    chain: "solana",
    tokenAddress: mint,
    identityKey: `solana:${mint}`,
  });
});

test("provider categories and project slugs cannot masquerade as chain addresses", () => {
  assert.equal(
    exactIdentity({
      chain: "top-volume",
      id: "my-neighbor-alice",
      scannedAt: "2026-01-01T00:00:00.000Z",
    }),
    null
  );
  assert.equal(
    exactIdentity({ chain: "artificial-intelligence", id: "virtual-protocol" }),
    null
  );
});
