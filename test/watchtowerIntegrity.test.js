import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeWatchtower,
  opportunityAlertEligible,
} from "../src/engines/watchtowerEngine.js";
import { projectWatchId } from "../src/learning/projectWatchlistStore.js";
import { watchtowerAlertRetentionEligible } from "../src/learning/watchtowerStore.js";
import { buildWatchtowerPerformanceReport } from "../src/learning/watchtowerPerformanceEngine.js";
import { publicUniverseLedgerRecordEligible } from "../src/reports/universeLedgerReportEngine.js";

const BASE_TOKEN = "0x1111111111111111111111111111111111111111";

test("positive watchtower alerts require an exact chain and contract identity", () => {
  const unresolved = {
    name: "Repository Research",
    symbol: "REPO",
    chain: "base",
    pipelineScore: 92,
  };
  const exact = {
    ...unresolved,
    name: "Utility Protocol",
    symbol: "UTIL",
    tokenAddress: BASE_TOKEN,
  };

  assert.equal(opportunityAlertEligible(unresolved), false);
  assert.equal(analyzeWatchtower([unresolved], { persist: false }).alerts.length, 0);
  assert.equal(opportunityAlertEligible(exact), true);
  assert.equal(analyzeWatchtower([exact], { persist: false }).alerts[0]?.type, "New Priority Candidate");
});

test("meme candidates retain risk warnings but cannot emit opportunity alerts", () => {
  const project = {
    name: "Midas Toad",
    symbol: "MIDASTOAD",
    chain: "base",
    tokenAddress: BASE_TOKEN,
    pipelineScore: 80,
    externalRiskScore: 75,
  };
  const watchStore = {
    projects: {
      [projectWatchId(project)]: {
        history: [{ score: 80, externalRiskScore: 0 }],
      },
    },
  };

  const result = analyzeWatchtower([project], { persist: false, watchStore });

  assert.deepEqual(result.alerts, []);
  assert.deepEqual(result.internalAlerts.map((alert) => alert.type), ["Risk Escalation"]);
  assert.equal(result.brief.topOpportunities.length, 0);
});

test("watchtower retention purges legacy positive alerts without the institutional policy marker", () => {
  assert.equal(
    watchtowerAlertRetentionEligible({ type: "New Priority Candidate", project: "TOAD / SOL" }),
    false
  );
  assert.equal(
    watchtowerAlertRetentionEligible({
      type: "New Priority Candidate",
      project: "Utility Protocol",
      opportunityPolicyEligible: true,
    }),
    true
  );
  assert.equal(
    watchtowerAlertRetentionEligible({ type: "Risk Escalation", project: "Midas Toad" }),
    true
  );
});

test("public performance and universe samples exclude legacy meme pollution", () => {
  const performance = buildWatchtowerPerformanceReport({
    alerts: [
      { type: "Risk Escalation", project: "Midas Toad", symbol: "MIDASTOAD" },
      {
        type: "New Priority Candidate",
        project: "Utility Protocol",
        symbol: "UTIL",
        chain: "base",
        tokenAddress: BASE_TOKEN,
        opportunityPolicyEligible: true,
      },
    ],
    snapshots: [],
  });

  assert.equal(performance.totalAlerts, 1);
  assert.equal(
    publicUniverseLedgerRecordEligible({
      canonicalIdentity: { name: "Pump Guy", symbol: "PUMPGUY", chain: "solana" },
      sourceCoverage: { sources: ["dexscreener"] },
    }),
    false
  );
  assert.equal(
    publicUniverseLedgerRecordEligible({
      canonicalIdentity: { name: "Utility Protocol", symbol: "UTIL", chain: "base" },
      sourceCoverage: { sources: ["dexscreener"] },
    }),
    true
  );
});
