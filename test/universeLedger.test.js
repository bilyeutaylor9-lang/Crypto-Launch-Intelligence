import test from "node:test";
import assert from "node:assert/strict";

import {
  buildUniverseLedgerRecord,
  buildUniverseLedgerSnapshot,
} from "../src/learning/universeLedgerStore.js";

test("universe ledger promotes selected projects with authoritative final fields", () => {
  const record = buildUniverseLedgerRecord(
    {
      name: "Ledger Alpha",
      symbol: "LGA",
      chain: "base",
      address: "0x0000000000000000000000000000000000000a11",
      pairAddress: "0x0000000000000000000000000000000000000b11",
      discoverySources: ["dexscreener", "github", "roadmap"],
      contractVerified: true,
      instantSafetyStatus: "PASS",
      instantSafetyScore: 80,
      liquidityUsd: 900000,
      liquidityScore: 75,
      githubProScore: 72,
      developerActivityScore: 70,
      organicBuyerScore: 68,
      catalystCalendarScore: 66,
      tokenomicsScore: 64,
      trapRiskScore: 12,
      riskScore: 15,
      discoveryPriorityScore: 88,
    },
    { selected: true, rank: 1 }
  );

  assert.equal(record.finalState, "PROMOTED");
  assert.equal(record.finalQualified, true);
  assert.equal(record.processing.stage, "DEEP_SNIPER_QUEUE");
  assert.ok(record.dataCoverageScore >= 40);
  assert.equal(record.finalEvidenceFamilies.identity.status, "confirmed");
  assert.equal(record.finalEvidenceFamilies.manipulationRisk.status, "clear");
  assert.ok(record.finalInvalidationConditions.length > 0);
});

test("universe ledger blocks rejected or unresolved identity projects", () => {
  const record = buildUniverseLedgerRecord(
    {
      name: "Unresolved Hype",
      symbol: "HYPE",
      chain: "solana",
      discoverySources: ["x-social"],
      xSocialScore: 90,
      priceChange24h: 180,
      trapRiskScore: 86,
      riskScore: 82,
    },
    { rejected: true }
  );

  assert.equal(record.finalState, "BLOCKED");
  assert.equal(record.finalQualified, false);
  assert.equal(record.processing.stage, "BLOCKED");
  assert.ok(record.finalBlockingReasons.includes("canonical identity unresolved"));
  assert.ok(record.finalBlockingReasons.includes("manipulation-risk family active"));
});

test("universe ledger snapshot accounts for full target coverage", () => {
  const selected = {
    name: "Selected",
    symbol: "SEL",
    chain: "base",
    address: "0x0000000000000000000000000000000000000c11",
    contractVerified: true,
    instantSafetyStatus: "PASS",
    liquidityUsd: 500000,
    discoveryPriorityScore: 80,
  };
  const rejected = {
    name: "Rejected",
    symbol: "REJ",
    chain: "base",
    trapRiskScore: 90,
  };
  const snapshot = buildUniverseLedgerSnapshot([selected, rejected], {
    selected: [selected],
    rejected: [rejected],
    ranked: [selected],
    targetCandidates: 39000,
  });

  assert.equal(snapshot.records.length, 2);
  assert.equal(snapshot.totals.promoted, 1);
  assert.equal(snapshot.totals.blocked, 1);
  assert.equal(snapshot.totals.targetMet, false);
  assert.equal(snapshot.totals.targetShortfall, 38998);
});
