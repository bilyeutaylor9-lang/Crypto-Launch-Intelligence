import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  selectQualificationProofRepairTargets,
  resolveRepairAccessibilityOptions,
  runQualificationProofRepair,
} from "../src/diagnostics/qualificationProofRepairOrchestrator.js";
import { buildQualificationFailureMicroscope } from "../src/diagnostics/qualificationFailureMicroscope.js";

const token = (n) => `0x${String(n).padStart(40, "0")}`;
const pool = (n) => `0x${String(1000 + n).padStart(40, "0")}`;

function project(i = 1, overrides = {}) {
  return {
    symbol: `P${i}`,
    chain: "base",
    tokenAddress: token(i),
    poolAddress: pool(i),
    deepEvaluationState: "DEEP_EVALUATED",
    coreEvidenceState: "CORE_EVIDENCE_READY",
    candidateProofState: {
      identity: {
        status: "VERIFIED",
        exactIdentityVerified: true,
        chain: "base",
        tokenAddress: token(i),
        poolAddress: pool(i),
      },
      safety: { status: "VERIFIED_SAFE", deterministicBlocks: [] },
      globalRoute: {
        status: "ROUTE_VERIFIED",
        buyQuoteVerified: true,
        sellQuoteVerified: true,
        depthVerified: true,
        slippageVerified: true,
        quoteFresh: true,
        quoteAgeSeconds: 30,
      },
      userAccess: { status: "UNKNOWN" },
    },
    finalSelectionState: "INSUFFICIENT_DATA",
    finalSelectionQualified: false,
    finalBlockingReasons: [],
    finalWarningReasons: [],
    canonicalThreeClockEdge: {
      qualifying: true,
      sequence: { state: "THREE_CLOCK_PRE_CONSENSUS" },
      priceMateriallyExtended: false,
    },
    capitalArrivalIntelligence: {
      state: "COMMITTED_LOADED_VACUUM_SHADOW",
      supplyVacuumSupported: true,
    },
    sellerInventoryState: "THINNING",
    sellerExhaustionScore: 70,
    ...overrides,
  };
}

test("unknown user access is recoverable when identity and safety pass", () => {
  const projects = [project(1)];
  const microscope = buildQualificationFailureMicroscope(projects);
  const selection = selectQualificationProofRepairTargets(projects, microscope);
  assert.equal(selection.selectedTargets, 1);
  assert.equal(selection.targets[0].repairReason.gate, "USER_ACCESS");
});

test("earlier advisory safety UNKNOWN does not hide a recoverable quote gap", () => {
  const p = project(1, {
    candidateProofState: {
      ...project(1).candidateProofState,
      safety: { status: "PARTIAL", deterministicBlocks: [] },
      globalRoute: {
        ...project(1).candidateProofState.globalRoute,
        buyQuoteVerified: false,
        sellQuoteVerified: false,
      },
    },
  });
  const microscope = buildQualificationFailureMicroscope([p]);
  assert.equal(microscope.candidates[0].firstUnknown, "SAFETY");
  const selection = selectQualificationProofRepairTargets([p], microscope);
  assert.equal(selection.selectedTargets, 1);
  assert.equal(selection.targets[0].repairReason.gate, "BUY_QUOTE");
});

test("known safety block is never a repair target", () => {
  const p = project(1, { honeypotDetected: true, finalSelectionState: "BLOCKED" });
  const selection = selectQualificationProofRepairTargets([p], buildQualificationFailureMicroscope([p]));
  assert.equal(selection.selectedTargets, 0);
});

test("identity conflict is never a repair target", () => {
  const p = project(1, { identityConflict: true, finalSelectionState: "IDENTITY_CONFLICT" });
  const selection = selectQualificationProofRepairTargets([p], buildQualificationFailureMicroscope([p]));
  assert.equal(selection.selectedTargets, 0);
});

test("confirmed access restriction is never retried", () => {
  const p = project(1, {
    candidateProofState: {
      ...project(1).candidateProofState,
      userAccess: { status: "CONFIRMED_RESTRICTED" },
    },
    finalSelectionState: "BLOCKED",
  });
  const selection = selectQualificationProofRepairTargets([p], buildQualificationFailureMicroscope([p]));
  assert.equal(selection.selectedTargets, 0);
});

test("stale quote is recoverable without lowering freshness threshold", () => {
  const p = project(1, {
    candidateProofState: {
      ...project(1).candidateProofState,
      globalRoute: {
        ...project(1).candidateProofState.globalRoute,
        quoteFresh: false,
        quoteAgeSeconds: 2000,
      },
      userAccess: { status: "CONFIRMED_AVAILABLE" },
    },
    finalSelectionState: "BLOCKED",
  });
  const microscope = buildQualificationFailureMicroscope([p], { maxQuoteAgeSeconds: 900 });
  const selection = selectQualificationProofRepairTargets([p], microscope, {
    microscope: { maxQuoteAgeSeconds: 900 },
  });
  assert.equal(selection.selectedTargets, 1);
  assert.equal(selection.targets[0].repairReason.gate, "QUOTE_FRESHNESS");
});

test("diagnostic layer refuses to assume a user region", () => {
  const options = resolveRepairAccessibilityOptions({
    env: {
      PREFERRED_EXCHANGES: "Coinbase",
      PREFERRED_WALLETS: "MetaMask",
      SUPPORTED_CHAINS: "base",
    },
  });
  assert.equal(options.preferences.userRegion, "");
  assert.equal(options.preferences.userState, "");
});

test("explicit region configuration is preserved", () => {
  const options = resolveRepairAccessibilityOptions({
    env: { USER_REGION: "US", USER_STATE: "CA" },
  });
  assert.equal(options.preferences.userRegion, "US");
  assert.equal(options.preferences.userState, "CA");
});

test("successful refresh can resolve UNKNOWN access to PASS", async () => {
  const p = project(1);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "proof-repair-"));
  const result = await runQualificationProofRepair({
    payload: { projects: [p] },
    microscopeReport: buildQualificationFailureMicroscope([p]),
    reportFile: path.join(dir, "repair.json"),
    repairedReportFile: path.join(dir, "repaired.json"),
    analyzeExecutionProofRecoveryBatch: async (projects) => projects,
    analyzeExecutionProofBatch: (projects) => projects,
    analyzeRouteAccessibilityBatch: (projects) =>
      projects.map((item) => ({ ...item, regionStatus: "CONFIRMED_AVAILABLE" })),
    analyzeFinalSelectionIntegrityBatch: (projects) =>
      projects.map((item) => ({
        ...item,
        candidateProofState: {
          ...item.candidateProofState,
          userAccess: { status: "CONFIRMED_AVAILABLE" },
        },
        finalSelectionState: "QUALIFIED",
        finalSelectionQualified: true,
      })),
  });
  assert.equal(result.resolvedUnknowns, 1);
  assert.equal(result.becamePass, 1);
  assert.equal(result.newlyQualifiedDiagnosticOnly, 1);
  assert.equal(result.policy.rankingInfluence, false);
  assert.equal(result.policy.automaticTrading, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("refresh can turn UNKNOWN into a known restriction without passing it", async () => {
  const p = project(1);
  const reportFile = path.join(os.tmpdir(), `repair-${Date.now()}.json`);
  const result = await runQualificationProofRepair({
    payload: { projects: [p] },
    microscopeReport: buildQualificationFailureMicroscope([p]),
    writeRepairedReport: false,
    reportFile,
    analyzeExecutionProofRecoveryBatch: async (projects) => projects,
    analyzeExecutionProofBatch: (projects) => projects,
    analyzeRouteAccessibilityBatch: (projects) => projects,
    analyzeFinalSelectionIntegrityBatch: (projects) =>
      projects.map((item) => ({
        ...item,
        candidateProofState: {
          ...item.candidateProofState,
          userAccess: { status: "CONFIRMED_RESTRICTED" },
        },
        finalSelectionState: "BLOCKED",
        finalSelectionQualified: false,
      })),
  });
  assert.equal(result.resolvedUnknowns, 1);
  assert.equal(result.becameKnownFailure, 1);
  assert.equal(result.becamePass, 0);
  fs.rmSync(reportFile, { force: true });
});

test("provider exception fails safe", async () => {
  const p = project(1);
  const reportFile = path.join(os.tmpdir(), `repair-fail-${Date.now()}.json`);
  const result = await runQualificationProofRepair({
    payload: { projects: [p] },
    microscopeReport: buildQualificationFailureMicroscope([p]),
    writeRepairedReport: false,
    reportFile,
    analyzeExecutionProofRecoveryBatch: async () => {
      throw new Error("provider unavailable");
    },
  });
  assert.equal(result.status, "REPAIR_ENGINE_FAILED");
  assert.equal(result.repairedTargets, 0);
  assert.match(result.engineError, /provider unavailable/);
  fs.rmSync(reportFile, { force: true });
});

test("no repairable targets returns a clean no-op", async () => {
  const p = project(1, {
    candidateProofState: {
      ...project(1).candidateProofState,
      userAccess: { status: "CONFIRMED_RESTRICTED" },
    },
    finalSelectionState: "BLOCKED",
  });
  const reportFile = path.join(os.tmpdir(), `repair-none-${Date.now()}.json`);
  const result = await runQualificationProofRepair({
    payload: { projects: [p] },
    microscopeReport: buildQualificationFailureMicroscope([p]),
    writeRepairedReport: false,
    reportFile,
  });
  assert.equal(result.status, "NO_RECOVERABLE_PROOF_TARGETS");
  assert.equal(result.selectedTargets, 0);
  fs.rmSync(reportFile, { force: true });
});

test("original production report is never overwritten", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "proof-separate-"));
  const inputFile = path.join(dir, "report.json");
  const repairedReportFile = path.join(dir, "report.proof-repaired.json");
  const original = { marker: "PRODUCTION_SOURCE", projects: [project(1)] };
  fs.writeFileSync(inputFile, JSON.stringify(original));
  await runQualificationProofRepair({
    inputFile,
    microscopeReport: buildQualificationFailureMicroscope(original.projects),
    reportFile: path.join(dir, "repair.json"),
    repairedReportFile,
    analyzeExecutionProofRecoveryBatch: async (projects) => projects,
    analyzeExecutionProofBatch: (projects) => projects,
    analyzeRouteAccessibilityBatch: (projects) => projects,
    analyzeFinalSelectionIntegrityBatch: (projects) => projects,
  });
  assert.equal(JSON.parse(fs.readFileSync(inputFile, "utf8")).marker, "PRODUCTION_SOURCE");
  assert.ok(fs.existsSync(repairedReportFile));
  fs.rmSync(dir, { recursive: true, force: true });
});
