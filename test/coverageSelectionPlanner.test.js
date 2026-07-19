import test from "node:test";
import assert from "node:assert/strict";

import { planCoverageSelection } from "../src/discovery/coverageSelectionPlanner.js";
import { rankAndLimitCandidates } from "../src/discoveryManager.js";
import { identityKeyForProject } from "../src/discovery/projectIdentityGraph.js";

function evmAddress(seed = 0) {
  const hex = [...String(seed)]
    .map((char) => char.charCodeAt(0).toString(16))
    .join("")
    .slice(0, 40);
  return `0x${hex.padStart(40, "0")}`;
}

function numericSeed(seed = "") {
  return [...String(seed || "1")].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function base58Seed(seed = 0) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = Math.max(1, numericSeed(seed));
  let encoded = "";
  while (value > 0) {
    encoded = alphabet[value % alphabet.length] + encoded;
    value = Math.floor(value / alphabet.length);
  }
  return encoded || "1";
}

function solanaAddress(seed = 0) {
  return `So${base58Seed(seed).padStart(40, "1")}`;
}

function project({
  name,
  symbol,
  chain = "base",
  address,
  source = "dexscreener",
  priority = 0,
  createdAt = "2026-07-15T00:00:00.000Z",
} = {}) {
  return {
    name,
    symbol,
    chain,
    address: address || (chain === "solana" ? solanaAddress(symbol || name) : evmAddress(symbol || name)),
    source,
    discoverySources: [source],
    discoveryPriorityScore: priority,
    pairCreatedAt: createdAt,
  };
}

test("coverage selection reserves deep-research capacity for underrepresented chains", () => {
  const baseProjects = Array.from({ length: 12 }, (_, index) =>
    project({ name: `Base ${index}`, symbol: `B${index}`, priority: 100 - index })
  );
  const solana = project({
    name: "Solana Early",
    symbol: "SOLR",
    chain: "solana",
    source: "github",
    priority: 5,
    createdAt: "2026-07-14T00:00:00.000Z",
  });
  const arbitrum = project({
    name: "Arbitrum Early",
    symbol: "ARBR",
    chain: "arbitrum",
    source: "google-news",
    priority: 4,
    createdAt: "2026-07-01T00:00:00.000Z",
  });

  const plan = planCoverageSelection([...baseProjects, solana, arbitrum], { limit: 10 });
  const selectedSymbols = new Set(plan.selected.map((candidate) => candidate.symbol));

  assert.ok(selectedSymbols.has("SOLR"));
  assert.ok(selectedSymbols.has("ARBR"));
  assert.equal(plan.report.selectedCount, 10);
  assert.ok(plan.report.selectedByReason.COVERAGE_RESERVE >= 2);
});

test("coverage selection merges exact duplicate identities without consuming extra review slots", () => {
  const oneAddress = evmAddress(111);
  const first = project({ name: "One Asset", symbol: "ONE", address: oneAddress, priority: 80 });
  const duplicate = project({
    name: "One Asset duplicate feed",
    symbol: "ONE",
    address: oneAddress,
    source: "geckoterminal",
    priority: 20,
  });
  const distinct = project({ name: "Distinct", symbol: "DST", address: evmAddress(222), priority: 70 });

  const plan = planCoverageSelection([first, duplicate, distinct], { limit: 3 });

  assert.equal(plan.selected.length, 2);
  assert.equal(plan.report.duplicateIdentityCount, 1);
  assert.equal(plan.deferred.find((candidate) => candidate.symbol === "ONE").researchSelectionReason, "DUPLICATE_IDENTITY");
});

test("deferred identities are scheduled by the rotation reserve before newly seen lower-priority candidates", () => {
  const highest = project({ name: "Highest", symbol: "HIGH", priority: 100 });
  const coverage = project({ name: "Coverage", symbol: "COVER", priority: 90 });
  const deferred = project({ name: "Deferred", symbol: "DEFER", priority: 2 });
  const newCandidate = project({ name: "New", symbol: "NEW", priority: 1 });
  const deferredKey = identityKeyForProject(deferred);

  const plan = planCoverageSelection([highest, coverage, deferred, newCandidate], {
    limit: 3,
    history: {
      projects: {
        [deferredKey]: {
          deferredCount: 4,
          queuedCount: 0,
          lastQueuedAt: "2026-07-01T00:00:00.000Z",
        },
      },
    },
    runSequence: 2,
  });

  const selected = plan.selected.find((candidate) => candidate.symbol === "DEFER");
  assert.equal(selected.researchSelectionReason, "DEFERRED_ROTATION");
});

test("discovery cap uses the same balanced selection policy", () => {
  const baseProjects = Array.from({ length: 12 }, (_, index) =>
    project({ name: `Base ${index}`, symbol: `BASE${index}`, priority: 100 - index })
  );
  const solana = project({
    name: "Solana Discovery",
    symbol: "SOLD",
    chain: "solana",
    source: "github",
    priority: 5,
    createdAt: "2026-07-14T00:00:00.000Z",
  });
  const arbitrum = project({
    name: "Arbitrum Discovery",
    symbol: "ARBD",
    chain: "arbitrum",
    source: "google-news",
    priority: 4,
    createdAt: "2026-07-01T00:00:00.000Z",
  });

  const ranked = rankAndLimitCandidates([...baseProjects, solana, arbitrum], { maxCandidates: 10 });
  const selectedSymbols = new Set(ranked.limited.map((candidate) => candidate.symbol));

  assert.ok(selectedSymbols.has("SOLD"));
  assert.ok(selectedSymbols.has("ARBD"));
  assert.equal(ranked.selection.selectedCount, 10);
});
