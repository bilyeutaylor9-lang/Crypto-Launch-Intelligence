import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { summarizeRecoveryAttempts, summarizeRecoveryOutcomes } from "../src/reports/recoveredOpportunityWatchlistReportEngine.js";
import { summarizeDataStarvation } from "../src/reports/dataStarvationRootCauseReportEngine.js";

const tokenAddress = "0x1111111111111111111111111111111111111111";
const poolAddress = "0x2222222222222222222222222222222222222222";

test("recovery counters exclude deferred candidates even with stale rescue flags", () => {
  const stale = { ...candidate("RECOVERED"), deepEvaluationState: "DEFERRED_BEFORE_DEEP",
    starvationRecoveryResult: "RECOVERED", promotedToAdvancedResearch: true,
    promotedToDeepResearch: true, dataStarvationMissingEvidence: [{ recoverable: true }] };
  assert.deepEqual(summarizeRecoveryOutcomes([stale, candidate("NO_RECOVERY")]), {
    recoveredThisScan: 0, fullyRecoveredThisScan: 0, partiallyRecoveredThisScan: 0,
    promotedToAdvancedResearch: 0, promotedToDeepResearch: 0, stillUnresolved: 0,
  });
});

test("recovered identities distinguish matching symbols and preserve exact chain and pool", () => {
  const base = { ...candidate("RECOVERED"), symbol: "DUP", tokenAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
  const alias = { ...base, chain: "Base", tokenAddress: base.tokenAddress.toUpperCase().replace("0X", "0x") };
  assert.equal(summarizeRecoveryOutcomes([base, alias]).recoveredThisScan, 1);
  assert.equal(summarizeRecoveryOutcomes([base, { ...base, tokenAddress: poolAddress }]).recoveredThisScan, 2);
  assert.equal(summarizeRecoveryOutcomes([base, { ...base, chain: "arbitrum" }]).recoveredThisScan, 2);
  assert.equal(summarizeRecoveryOutcomes([base, { ...base, poolAddress: tokenAddress }]).recoveredThisScan, 2);
  assert.equal(summarizeRecoveryOutcomes([
    { symbol: "DUP", activeEvidenceRecoveryStatus: "PARTIAL_RECOVERY" },
    { symbol: "DUP", activeEvidenceRecoveryStatus: "PARTIAL_RECOVERY" },
  ]).recoveredThisScan, 2);
  const solana = { ...base, chain: "solana", poolAddress: null, tokenAddress: "A".repeat(32) };
  assert.equal(summarizeRecoveryOutcomes([solana, { ...solana, tokenAddress: "a".repeat(32) }]).recoveredThisScan, 2);
});

function candidate(status) {
  return { chain: "base", tokenAddress, poolAddress, deepEvaluationState: "DEEP_EVALUATED",
    activeEvidenceRecoveryStatus: status, activeEvidenceRecovery: {
      waves: ["WAVE1"], attemptedFields: ["creatorAddress"], recoveredFields: [],
      unrecoveredFields: ["creatorAddress"], attempts: [{ status: "PROVIDER_RECOVERY_QUEUED" }],
      providerAttempts: [{ provider: "blockscout-deployer", status: "CIRCUIT_OPEN", reason: "Provider failed" }],
    } };
}

test("recovery diagnostics retain unsuccessful attempts without claiming recovered evidence", () => {
  const rows = summarizeRecoveryAttempts([candidate("RECOVERED"), candidate("PARTIAL_RECOVERY"), candidate("NO_RECOVERY")]);
  assert.equal(rows.length, 3);
  const failed = rows[2];
  assert.equal(failed.status, "NO_RECOVERY");
  assert.equal(failed.tokenAddress, tokenAddress);
  assert.equal(failed.poolAddress, poolAddress);
  assert.deepEqual(failed.recoveredFields, []);
  assert.deepEqual(failed.attemptedFields, ["creatorAddress"]);
  assert.deepEqual(failed.waves, ["WAVE1"]);
  assert.equal(failed.providerAttempts[0].status, "CIRCUIT_OPEN");
  assert.equal(failed.attempts[0].status, "PROVIDER_RECOVERY_QUEUED");
});

test("deferred and nonselected candidates cannot enter attempted recovery results", () => {
  assert.deepEqual(summarizeRecoveryAttempts([
    candidate("NOT_SELECTED"), candidate("DEFERRED_BEFORE_DEEP"),
    { ...candidate("NO_RECOVERY"), deepEvaluationState: "DEFERRED_BEFORE_DEEP" },
  ]), []);
});

test("failed symbol-only recovery cannot manufacture contract or pool identity", () => {
  const row = summarizeRecoveryAttempts([{ symbol: "DUP", activeEvidenceRecoveryStatus: "NO_RECOVERY" }])[0];
  assert.equal(row.tokenAddress, null);
  assert.equal(row.poolAddress, null);
  assert.equal(row.canonicalId, null);
});

test("starvation audit retains exact identity and core fields for provider triage", () => {
  const project = { ...candidate("NO_RECOVERY"), dataStarvationStatus: "CORE_DATA_STARVED",
    coreDataStarved: true, coreMissingEvidence: [{ canonicalField: "creatorAddress" }], advisoryDataGaps: true };
  const row = summarizeDataStarvation([project]).topProjects[0];
  assert.equal(row.tokenAddress, tokenAddress);
  assert.equal(row.poolAddress, poolAddress);
  assert.equal(row.coreDataStarved, true);
  assert.equal(row.advisoryDataGaps, true);
  assert.deepEqual(row.coreMissingFields, ["creatorAddress"]);
  assert.equal(row.deepEvaluationState, "DEEP_EVALUATED");
});

test("published recovery artifact includes failed attempts without promoting the watchlist", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "recovery-diagnostics-"));
  try {
    const moduleUrl = new URL("../src/reports/recoveredOpportunityWatchlistReportEngine.js", import.meta.url).href;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e",
      `import { writeRecoveredOpportunityWatchlistReport } from ${JSON.stringify(moduleUrl)};
       writeRecoveredOpportunityWatchlistReport(${JSON.stringify([candidate("NO_RECOVERY"), candidate("NOT_SELECTED"),
         { ...candidate("RECOVERED"), deepEvaluationState: "DEFERRED_BEFORE_DEEP", starvationRescueEligible: true,
           dataStarvationStatus: "RECOVERABLE_GAPS", dataStarvationMissingEvidence: [{ recoverable: true }] }])});`],
    { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const artifact = JSON.parse(fs.readFileSync(path.join(dir, "reports/starvation-recovery-results.json"), "utf8"));
    const watchlist = JSON.parse(fs.readFileSync(path.join(dir, "reports/recovered-opportunity-watchlist.json"), "utf8"));
    assert.equal(artifact.recoveryResults.length, 1);
    assert.equal(artifact.recoveryResults[0].status, "NO_RECOVERY");
    assert.equal(artifact.recoveredThisScan, 0);
    assert.equal(artifact.fullyRecoveredThisScan, 0);
    assert.equal(artifact.stillUnresolved, 0);
    assert.equal(watchlist.status, "NO_RECOVERABLE_OPPORTUNITIES");
    assert.deepEqual(watchlist.watchlist, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
