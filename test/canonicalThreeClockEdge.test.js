import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  analyzeCanonicalThreeClockBatch,
  analyzeCanonicalThreeClockEdge,
} from "../src/engines/canonicalThreeClockEdgeEngine.js";
import {
  loadCanonicalThreeClockObservations,
  summarizeCanonicalThreeClockStore,
} from "../src/data/canonicalThreeClockObservationStore.js";
import { backfillCanonicalThreeClockHistory } from "../src/ops/backfillCanonicalThreeClockHistory.js";
import { generateReports } from "../src/reports/reportOrchestrator.js";

const history = Array.from({ length: 6 }, (_, index) => ({
  observedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  projectClock: { score: 20 + index }, capitalClock: { score: 18 + index }, attentionClock: { score: 25 + index }, qualifying: false,
}));

function project(overrides = {}) {
  return {
    chain: "base", symbol: "CLOCK", tokenAddress: "0x0000000000000000000000000000000000000c10", poolAddress: "0x0000000000000000000000000000000000000c20", priceUsd: 1, priceChange24h: 3, priceChange7d: 7,
    developerActivityScore: 90, projectChangeScore: 88, githubProScore: 80, liveCatalystRadarScore: 78, adoptionAccelerationScore: 75,
    capitalMigrationCoreScore: 86, capitalFlowScore: 84, smartWalletArrivalScore: 82, buyerBreadthAccelerationScore: 72, observedDeployedCapitalUsd: 210_000, stagedCommittedCapitalUsd: 30_000, probabilityWeightedInferredCapitalUsd: 12_000,
    socialAccelerationScore: 15, xSocialScore: 16, narrativeHeatScore: 18, holderGrowthScore: 16, volumeAccelerationScore: 14, newsCoverageScore: 12,
    ...overrides,
  };
}

test("canonical Three-Clock qualifies only with history, ordered acceleration, quiet attention, and no price extension", () => {
  const result = analyzeCanonicalThreeClockEdge(project(), { history });
  assert.equal(result.threeClockSequenceState, "THREE_CLOCK_PRE_CONSENSUS");
  assert.equal(result.threeClockQualifying, true);
  assert.equal(result.threeClockRankingInfluence, false);
  assert.equal(result.canonicalThreeClockEdge.capitalClock.capital.observedDeployedCapitalUsd, 210_000);
  assert.equal(result.canonicalThreeClockEdge.asymmetricPressureTwin.executableQuote, false);
});

test("canonical Three-Clock fails closed when history or attention evidence is insufficient", () => {
  assert.equal(analyzeCanonicalThreeClockEdge(project()).threeClockSequenceState, "INSUFFICIENT_HISTORY");
  assert.equal(analyzeCanonicalThreeClockEdge(project({ socialAccelerationScore: null, xSocialScore: null, narrativeHeatScore: null, holderGrowthScore: null, volumeAccelerationScore: null, newsCoverageScore: null, priceChange24h: null, priceChange7d: null }), { history }).threeClockSequenceState, "SEQUENCE_BROKEN");
});

test("canonical Three-Clock retires an extended, crowded setup", () => {
  const result = analyzeCanonicalThreeClockEdge(project({ socialAccelerationScore: 95, xSocialScore: 95, narrativeHeatScore: 95, priceChange24h: 80, priceChange7d: 160 }), { history });
  assert.equal(result.threeClockSequenceState, "PRICE_BREAKOUT");
  assert.equal(result.threeClockQualifying, false);
});

test("canonical Three-Clock backfill uses dated scanner history without inventing observations", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "three-clock-backfill-"));
  const scanHistoryPath = path.join(directory, "scan-history.json");
  const filePath = path.join(directory, "canonical.jsonl");
  const records = Array.from({ length: 5 }, (_, index) => ({
    id: "0x0000000000000000000000000000000000000c10", chain: "base", symbol: "CLOCK",
    scannedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    market: { priceUsd: 1, liquidityUsd: 100_000, priceChange24h: 2 },
    scores: { developer: 35 + index, projectChange: 32 + index, capitalFlow: 28 + index, smartWallet: 20 + index, socialAcceleration: 15, xSocial: 12, narrativeHeat: 17, velocity: 14, externalSignal: 10 },
  }));
  fs.writeFileSync(scanHistoryPath, JSON.stringify(records));
  const result = backfillCanonicalThreeClockHistory({ scanHistoryPath, filePath });
  assert.equal(result.eligibleProjects, 1);
  assert.equal(result.saved, 5);
  assert.equal(backfillCanonicalThreeClockHistory({ scanHistoryPath, filePath }).saved, 0);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("routine canonical observations persist only exact chain/token identities", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "three-clock-exact-observations-"));
  const filePath = path.join(directory, "canonical.jsonl");
  try {
    const analyzed = analyzeCanonicalThreeClockBatch([
      project(),
      project({ symbol: "SYMBOL_ONLY", tokenAddress: null, poolAddress: null }),
      project({ symbol: "BAD_CHAIN", chain: "coinpaprika" }),
    ], {
      history,
      persist: true,
      observedAt: "2026-08-24T12:00:00.000Z",
      store: { filePath },
    });
    const rows = loadCanonicalThreeClockObservations({ filePath });
    const summary = summarizeCanonicalThreeClockStore({ filePath });

    assert.equal(analyzed.length, 3);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].identityKey, "base:token:0x0000000000000000000000000000000000000c10");
    assert.equal(rows[0].chain, "base");
    assert.equal(summary.exactObservations, 1);
    assert.equal(summary.unresolvedOrLegacyObservations, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("unidentified shadow rows do not create canonical history", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "three-clock-no-identity-"));
  const filePath = path.join(directory, "canonical.jsonl");
  try {
    const [analyzed] = analyzeCanonicalThreeClockBatch([
      project({ symbol: "SYMBOL_ONLY", tokenAddress: null, poolAddress: null }),
    ], {
      persist: true,
      observedAt: "2026-08-24T12:00:00.000Z",
      store: { filePath },
    });

    assert.equal(analyzed.canonicalThreeClockEdge.shadowOnly, true);
    assert.equal(loadCanonicalThreeClockObservations({ filePath }).length, 0);
    assert.equal(summarizeCanonicalThreeClockStore({ filePath }).exactObservations, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("Three-Clock report reads full current scan results before generic report compaction", () => {
  const cwd = process.cwd();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "three-clock-report-"));
  try {
    const noisyProject = {
      ...Object.fromEntries(Array.from({ length: 140 }, (_, index) => [`scannerField${index}`, index])),
      ...project(),
    };
    const analyzed = analyzeCanonicalThreeClockEdge(noisyProject, {
      history,
      observedAt: "2026-08-24T12:00:00.000Z",
    });

    process.chdir(directory);
    generateReports([analyzed], { scanRunId: "three-clock-report-test", codeCommitSha: "test-sha" });
    const report = JSON.parse(fs.readFileSync(path.join(directory, "reports", "three-clock-edge.json"), "utf8"));

    assert.equal(report.analyzed, 1);
    assert.equal(report.qualifying, 1);
    assert.equal(report.stateCounts.THREE_CLOCK_PRE_CONSENSUS, 1);
    assert.equal(report.rankingInfluence, false);
  } finally {
    process.chdir(cwd);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
