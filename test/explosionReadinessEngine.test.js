import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeExplosionReadinessBatch,
  calculateExplosionReadiness,
} from "../src/discovery/explosionReadinessEngine.js";
import { calculatePreIntelligenceFeatures } from "../src/discovery/preIntelligenceFeatureEngine.js";
import { planInstitutionalCandidateSelection } from "../src/discovery/institutionalCandidateSelector.js";
import { summarizeExplosionReadiness } from "../src/reports/explosionReadinessReportEngine.js";

const address = "0x1111111111111111111111111111111111111111";

function record(scannedAt, liquidityUsd, volume24hUsd, buyers) {
  return {
    id: address,
    scannedAt,
    pointInTime: {
      liquidity: { liquidityUsd },
      market: { volume24hUsd, priceUsd: 0.01 },
      buyers: { clusterAdjustedUniqueBuyers24h: buyers },
    },
  };
}

function coiled(overrides = {}) {
  return {
    name: "Coiled Protocol",
    symbol: "COIL",
    chain: "base",
    address,
    pairAddress: "0x2222222222222222222222222222222222222222",
    source: "dexscreener",
    discoverySources: ["dexscreener", "githubProjectDiscovery"],
    priceUsd: 0.015,
    priceChange24h: 5,
    liquidityUsd: 200_000,
    volume24h: 120_000,
    independentBuyers24h: 120,
    liquidityChange24hPct: 100,
    buyersChange24hPct: 100,
    volumeChange24hPct: 200,
    developerActivityChangePct: 100,
    githubCommits30d: 60,
    developerActivityScore: 85,
    socialAccelerationScore: 10,
    ...overrides,
  };
}

test("multi-scan capital and buyer acceleration can reach coiled readiness", () => {
  const [project] = analyzeExplosionReadinessBatch([coiled()], {
    historyRecords: [
      record("2026-08-07T00:00:00.000Z", 50_000, 20_000, 20),
      record("2026-08-08T00:00:00.000Z", 100_000, 40_000, 50),
    ],
  });

  assert.equal(project.explosionReadinessState, "COILED_ACCELERATION");
  assert.equal(project.explosionReadinessRankEligible, true);
  assert.ok(project.explosionReadinessScore >= 75);
  assert.equal(project.explosionReadinessHistoryCount, 2);
  assert.ok(project.explosionReadinessReasons.some((reason) => /buyer breadth/i.test(reason)));
});

test("missing evidence is not converted into a neutral readiness score", () => {
  const project = calculateExplosionReadiness({
    name: "Name Only",
    symbol: "NAME",
    source: "github",
    githubUrl: "https://github.com/example/name",
  });

  assert.equal(project.explosionReadinessScore, 0);
  assert.equal(project.explosionReadinessState, "INSUFFICIENT_EVIDENCE");
  assert.equal(project.explosionReadinessRankEligible, false);
  assert.ok(project.explosionReadinessMissingEvidence.includes("measured market evidence"));
});

test("disproportionate volume without liquidity or buyer support is not promoted", () => {
  const project = calculateExplosionReadiness(coiled({
    liquidityUsd: 100_000,
    volume24h: 5_000_000,
    independentBuyers24h: 10,
    liquidityChange24hPct: 0,
    buyersChange24hPct: 0,
    volumeChange24hPct: 500,
  }));

  assert.equal(project.explosionReadinessFakeVolumeConcern, true);
  assert.equal(project.explosionReadinessState, "LATE_OR_DISTORTED");
  assert.equal(project.explosionReadinessRankEligible, false);
});

test("already-extended price action cannot be labeled coiled acceleration", () => {
  const project = calculateExplosionReadiness(coiled({ priceChange24h: 120 }), {
    history: [
      record("2026-08-07T00:00:00.000Z", 50_000, 20_000, 20),
      record("2026-08-08T00:00:00.000Z", 100_000, 40_000, 50),
    ],
  });

  assert.equal(project.explosionReadinessState, "LATE_OR_DISTORTED");
  assert.notEqual(project.explosionReadinessState, "COILED_ACCELERATION");
});

test("identity-only discovery rows are capped and cannot enter ranking", () => {
  const features = calculatePreIntelligenceFeatures({
    name: "Repository Project",
    symbol: "REPO",
    source: "github",
    githubUrl: "https://github.com/example/repo",
    developerActivityScore: 100,
    githubProScore: 100,
  });

  assert.equal(features.preIntelligenceLane, "identity-only");
  assert.ok(features.preIntelligenceOpportunityScore <= 10);
  assert.equal(features.preIntelligenceRankEligible, false);
});

test("identity-only rows receive bounded enrichment and never advance", () => {
  const marketProjects = Array.from({ length: 30 }, (_, index) => coiled({
    name: `Market ${index}`,
    symbol: `M${index}`,
    address: `0x${String(index + 10).padStart(40, "0")}`,
    pairAddress: `0x${String(index + 100).padStart(40, "0")}`,
  }));
  const identityOnly = Array.from({ length: 20 }, (_, index) => ({
    name: `Repository ${index}`,
    symbol: `R${index}`,
    source: "githubProjectDiscovery",
    repository: `https://github.com/example/repository-${index}`,
    developerActivityScore: 100,
  }));
  const plan = planInstitutionalCandidateSelection([...marketProjects, ...identityOnly], {
    standardIntelligenceLimit: 20,
    advancedIntelligenceLimit: 20,
    deepIntelligenceLimit: 20,
    crawlerResearchLimit: 20,
    localAITopProjectLimit: 20,
    finalistDebateLimit: 10,
    finalistComparisonLimit: 5,
    historyRecords: [],
  });

  const enrichment = plan.selected.filter((project) => project.standardSelectionReason === "IDENTITY_ENRICHMENT_RESERVE");
  assert.ok(enrichment.length <= 1);
  assert.ok(plan.advanced.every((project) => project.preIntelligenceLane !== "identity-only"));
});

test("readiness report publishes no best candidate from watch or recovery states", () => {
  const report = summarizeExplosionReadiness([
    {
      name: "Recovery Only",
      symbol: "REC",
      explosionReadinessScore: 99,
      explosionReadinessState: "INSUFFICIENT_EVIDENCE",
      explosionReadinessRankEligible: false,
    },
    {
      name: "Watch Only",
      symbol: "WATCH",
      explosionReadinessScore: 70,
      explosionReadinessState: "WATCH",
      explosionReadinessRankEligible: false,
    },
  ]);

  assert.equal(report.bestEvidenceBackedCandidate, null);
  assert.equal(report.summary.bestEvidenceBackedCandidate, null);
  assert.equal(report.leaders.length, 0);
});
