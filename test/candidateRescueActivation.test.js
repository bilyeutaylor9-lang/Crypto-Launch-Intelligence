import test from "node:test";
import assert from "node:assert/strict";

import { buildCandidateRescueExpansion } from "../src/data/candidateRescueExpansionEngine.js";

function candidate(index = 0) {
  const narratives = ["ai", "depin", "rwa", "oracle"];
  const chains = ["base", "solana", "ethereum", "arbitrum"];
  return {
    name: `Utility ${index}`,
    symbol: `UTL${index}`,
    chain: chains[index % chains.length],
    description: `${narratives[index % narratives.length]} infrastructure protocol`,
    liquidityUsd: 10000 + index,
    volume24h: 5000 + index,
  };
}

test("candidate rescue activates on discovery target shortfall percentage", () => {
  const rescue = buildCandidateRescueExpansion(
    Array.from({ length: 80 }, (_, index) => candidate(index)),
    { targetCoverage: { targetCandidates: 100, currentCount: 80 }, sourceReports: {} },
    { rescueThreshold: 10, rescueShortfallPct: 10, rescueLimit: 10 }
  );

  assert.equal(rescue.report.status, "USED");
  assert.equal(rescue.report.targetShortfallPct, 20);
  assert.ok(rescue.report.reasons.some((reason) => reason.includes("shortfall")));
});

test("candidate rescue treats auth, rate-limit, region and timeout statuses as degraded", () => {
  const rescue = buildCandidateRescueExpansion(
    Array.from({ length: 80 }, (_, index) => candidate(index)),
    {
      targetCoverage: { targetCandidates: 80, currentCount: 80 },
      sourceReports: {
        coingecko: { status: "RATE_LIMITED" },
        birdeye: { status: "AUTH_REQUIRED" },
        native: { status: "TIMEOUT" },
      },
    },
    { rescueThreshold: 10, rescueShortfallPct: 10, rescueLimit: 10 }
  );

  assert.equal(rescue.report.status, "USED");
  assert.deepEqual(rescue.report.failedSources.sort(), ["birdeye", "coingecko", "native"]);
  assert.equal(rescue.report.degradedSources.length, 3);
});

test("candidate rescue backfill excludes meme-only rescue rows", () => {
  const rescue = buildCandidateRescueExpansion(
    Array.from({ length: 80 }, (_, index) => candidate(index)),
    { targetCoverage: { targetCandidates: 100, currentCount: 80 }, sourceReports: {} },
    { rescueThreshold: 10, rescueShortfallPct: 10, rescueLimit: 100 }
  );

  assert.ok(!rescue.report.topAdded.some((item) => item.symbol === "BRETT"));
  assert.ok(!rescue.candidates.some((item) => /\bmeme\b/i.test(item.description || "")));
});
