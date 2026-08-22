import fs from "node:fs";
import path from "node:path";

import { analyzeExecutionProofRecoveryBatch } from "../engines/executionProofRecoveryEngine.js";
import { analyzeExecutionProofBatch } from "../engines/executionProofEngine.js";
import {
  analyzeRouteAccessibilityBatch,
  resolveAccessibilityPreferences,
} from "../engines/routeAccessibilityEngine.js";
import { analyzeFinalSelectionIntegrityBatch } from "../engines/finalSelectionIntegrityEngine.js";
import {
  buildQualificationFailureMicroscope,
  traceQualificationCandidate,
} from "./qualificationFailureMicroscope.js";

const DEFAULT_INPUT_FILE = path.resolve(
  process.env.QUALIFICATION_REPAIR_INPUT || "reports/report.json"
);
const DEFAULT_MICROSCOPE_FILE = path.resolve(
  process.env.QUALIFICATION_REPAIR_MICROSCOPE || "reports/qualification-failure-microscope.json"
);
const DEFAULT_REPORT_FILE = path.resolve("reports", "qualification-proof-repair.json");
const DEFAULT_REPAIRED_REPORT_FILE = path.resolve("reports", "report.proof-repaired.json");

const RECOVERABLE_UNKNOWN_GATES = new Set([
  "ROUTE_IDENTITY",
  "BUY_QUOTE",
  "SELL_QUOTE",
  "QUOTE_FRESHNESS",
  "ROUTE_DEPTH",
  "VERIFIED_SLIPPAGE",
  "USER_ACCESS",
]);

const RECOVERABLE_KNOWN_FAILURES = new Set([
  "BUY_QUOTE",
  "SELL_QUOTE",
  "QUOTE_FRESHNESS",
  "ROUTE_DEPTH",
  "VERIFIED_SLIPPAGE",
]);

function array(value) {
  return Array.isArray(value) ? value : [];
}

function lower(value = "") {
  return String(value ?? "").trim().toLowerCase();
}

function upper(value = "") {
  return String(value ?? "").trim().toUpperCase();
}

function readJson(file) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function extractProjects(payload = {}) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["projects", "opportunities", "candidates", "results", "tokens", "data"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function exactRepairIdentity(project = {}) {
  const trace = traceQualificationCandidate(project);
  const chain = lower(trace.chain);
  const token = lower(trace.tokenAddress);
  const pool = lower(trace.poolAddress);
  const addressPattern = /^0x[0-9a-f]{40}$/;
  if (!chain || !addressPattern.test(token) || !addressPattern.test(pool)) return null;
  return {
    key: `${chain}:${token}:${pool}`,
    chain,
    tokenAddress: token,
    poolAddress: pool,
  };
}

function traceIdentity(trace = {}) {
  const chain = lower(trace.chain);
  const token = lower(trace.tokenAddress);
  const pool = lower(trace.poolAddress);
  const addressPattern = /^0x[0-9a-f]{40}$/;
  if (!chain || !addressPattern.test(token) || !addressPattern.test(pool)) return null;
  return `${chain}:${token}:${pool}`;
}

function safetyOrIdentityBlocked(trace = {}) {
  return Boolean(
    trace.productionGates?.IDENTITY?.status === "FAIL" ||
    trace.productionGates?.SAFETY?.status === "FAIL"
  );
}

function confirmedAccessRestriction(trace = {}) {
  return trace.productionGates?.USER_ACCESS?.status === "FAIL";
}

function recoverableReason(trace = {}) {
  if (safetyOrIdentityBlocked(trace) || confirmedAccessRestriction(trace)) return null;
  for (const gate of RECOVERABLE_UNKNOWN_GATES) {
    const status = trace.productionGates?.[gate]?.status;
    if (status === "UNKNOWN") return { kind: "UNKNOWN", gate };
    if (status === "FAIL" && RECOVERABLE_KNOWN_FAILURES.has(gate)) {
      return { kind: "FAIL", gate };
    }
  }
  return null;
}

export function selectQualificationProofRepairTargets(projects = [], microscopeReport = null, options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const report =
    microscopeReport && Array.isArray(microscopeReport.candidates)
      ? microscopeReport
      : buildQualificationFailureMicroscope(safeProjects, options.microscope || {});

  const projectByIdentity = new Map();
  for (const project of safeProjects) {
    const identity = exactRepairIdentity(project);
    if (identity && !projectByIdentity.has(identity.key)) projectByIdentity.set(identity.key, project);
  }

  const targets = [];
  const skipped = [];
  for (const trace of report.candidates || []) {
    const identityKey = traceIdentity(trace);
    const reason = recoverableReason(trace);
    if (!identityKey) {
      skipped.push({ symbol: trace.symbol || null, reason: "EXACT_CHAIN_TOKEN_POOL_IDENTITY_REQUIRED" });
      continue;
    }
    const project = projectByIdentity.get(identityKey);
    if (!project) {
      skipped.push({ identityKey, symbol: trace.symbol || null, reason: "PROJECT_NOT_FOUND_BY_EXACT_IDENTITY" });
      continue;
    }
    if (!reason) {
      skipped.push({
        identityKey,
        symbol: trace.symbol || null,
        reason:
          safetyOrIdentityBlocked(trace)
            ? "KNOWN_IDENTITY_OR_SAFETY_BLOCK_NOT_REPAIRABLE"
            : confirmedAccessRestriction(trace)
              ? "CONFIRMED_ACCESS_RESTRICTION_NOT_REPAIRABLE"
              : "NO_RECOVERABLE_PROOF_GAP",
      });
      continue;
    }
    targets.push({
      identityKey,
      project,
      trace,
      repairReason: reason,
    });
  }

  const maxCandidates = Math.max(
    1,
    Number(
      options.maxCandidates ||
        process.env.QUALIFICATION_REPAIR_MAX_CANDIDATES ||
        25
    )
  );

  const ordered = targets
    .sort((a, b) => {
      const aRoute = a.trace.routeVerified ? 0 : 1;
      const bRoute = b.trace.routeVerified ? 0 : 1;
      return aRoute - bRoute ||
        String(a.repairReason.gate).localeCompare(String(b.repairReason.gate)) ||
        a.identityKey.localeCompare(b.identityKey);
    })
    .slice(0, maxCandidates);

  return {
    targets: ordered,
    skipped,
    microscopeReport: report,
    totalRecoverableTargets: targets.length,
    selectedTargets: ordered.length,
  };
}

export function resolveRepairAccessibilityOptions(options = {}) {
  if (options.accessibilityOptions) return options.accessibilityOptions;
  const env = options.env || process.env;
  const preferences = resolveAccessibilityPreferences(env);
  if (!String(env.USER_REGION || "").trim()) preferences.userRegion = "";
  if (!String(env.USER_STATE || "").trim()) preferences.userState = "";
  return { env, preferences };
}

function identityMap(projects = []) {
  const map = new Map();
  for (const project of projects) {
    const identity = exactRepairIdentity(project);
    if (identity) map.set(identity.key, project);
  }
  return map;
}

function mergeExactSubset(projects = [], repairedSubset = []) {
  const replacements = identityMap(repairedSubset);
  return projects.map((project) => {
    const identity = exactRepairIdentity(project);
    return identity && replacements.has(identity.key)
      ? replacements.get(identity.key)
      : project;
  });
}

function statusForGate(trace = {}, gateName = null) {
  if (!gateName) return null;
  return trace.productionGates?.[gateName]?.status || null;
}

function summarizeTargetChange(target, afterTrace) {
  const gateName = target.repairReason.gate;
  const beforeStatus = statusForGate(target.trace, gateName);
  const afterStatus = statusForGate(afterTrace, gateName);
  return {
    identityKey: target.identityKey,
    symbol: target.trace.symbol || null,
    repairKind: target.repairReason.kind,
    repairGate: gateName,
    beforeStatus,
    afterStatus,
    resolved: beforeStatus === "UNKNOWN" && afterStatus !== "UNKNOWN",
    refreshedKnownFailure: beforeStatus === "FAIL" && afterStatus !== "FAIL",
    becamePass: afterStatus === "PASS",
    becameKnownFailure: beforeStatus === "UNKNOWN" && afterStatus === "FAIL",
    finalSelectionBefore: target.trace.finalSelectionState || null,
    finalSelectionAfter: afterTrace?.finalSelectionState || null,
    finalQualifiedBefore: target.trace.finalSelectionQualified === true,
    finalQualifiedAfter: afterTrace?.finalSelectionQualified === true,
    firstKnownFailureAfter: afterTrace?.firstKnownFailure || null,
    firstUnknownAfter: afterTrace?.firstUnknown || null,
    firstMechanismFailureAfter: afterTrace?.firstMechanismFailure || null,
    firstMechanismUnknownAfter: afterTrace?.firstMechanismUnknown || null,
  };
}

function providerFailure(project = {}) {
  const values = [
    upper(project.executionProofRecovery?.status),
    upper(project.executionStatus || project.executionProofState),
    ...array(project.executionProofRecovery?.errors).map(upper),
    ...array(project.executionProof?.failureReasons).map(upper),
  ];
  return values.some((value) =>
    /PROVIDER_UNAVAILABLE|TIMEOUT|RATE_LIMIT|HTTP_429|HTTP_403|FETCH FAILED|MISSING API KEY/.test(value)
  );
}

export async function runQualificationProofRepair(options = {}) {
  const inputFile = path.resolve(options.inputFile || DEFAULT_INPUT_FILE);
  const microscopeFile = path.resolve(options.microscopeFile || DEFAULT_MICROSCOPE_FILE);
  const reportFile = path.resolve(options.reportFile || DEFAULT_REPORT_FILE);
  const repairedReportFile = path.resolve(options.repairedReportFile || DEFAULT_REPAIRED_REPORT_FILE);

  const payload = options.payload || readJson(inputFile);
  if (!payload) {
    const missing = {
      schemaVersion: 1,
      generatedAt: new Date(options.now || Date.now()).toISOString(),
      status: "REPAIR_INPUT_MISSING_OR_INVALID",
      inputFile,
      microscopeFile,
      selectedTargets: 0,
      repairedTargets: 0,
      providerFailures: 0,
      rankingInfluence: false,
      scoringInfluence: false,
      automaticTrading: false,
      automaticProductionPromotion: false,
    };
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(reportFile, `${JSON.stringify(missing, null, 2)}\n`);
    return missing;
  }

  const projects = extractProjects(payload);
  const microscope =
    options.microscopeReport ||
    readJson(microscopeFile) ||
    buildQualificationFailureMicroscope(projects, options.microscope || {});

  const selection = selectQualificationProofRepairTargets(projects, microscope, options);

  if (!selection.targets.length) {
    const noTargets = {
      schemaVersion: 1,
      generatedAt: new Date(options.now || Date.now()).toISOString(),
      status: "NO_RECOVERABLE_PROOF_TARGETS",
      inputFile,
      microscopeFile,
      sourceProjects: projects.length,
      selectedTargets: 0,
      repairedTargets: 0,
      providerFailures: 0,
      beforeDiagnostic: microscope.diagnostic || null,
      afterDiagnostic: microscope.diagnostic || null,
      skipped: selection.skipped.slice(0, 200),
      policy: {
        knownSafetyBlocksNeverRepaired: true,
        identityConflictsNeverRepaired: true,
        confirmedAccessRestrictionsNeverRepaired: true,
        missingProofNeverSyntheticPass: true,
        originalProductionReportOverwritten: false,
        rankingInfluence: false,
        scoringInfluence: false,
        automaticTrading: false,
        automaticProductionPromotion: false,
      },
    };
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(reportFile, `${JSON.stringify(noTargets, null, 2)}\n`);
    return noTargets;
  }

  const recoveryFn =
    options.analyzeExecutionProofRecoveryBatch ||
    analyzeExecutionProofRecoveryBatch;
  const proofFn =
    options.analyzeExecutionProofBatch ||
    analyzeExecutionProofBatch;
  const accessibilityFn =
    options.analyzeRouteAccessibilityBatch ||
    analyzeRouteAccessibilityBatch;
  const finalIntegrityFn =
    options.analyzeFinalSelectionIntegrityBatch ||
    analyzeFinalSelectionIntegrityBatch;

  const selectedProjects = selection.targets.map((row) => row.project);
  let repairedSubset;
  let engineError = null;

  try {
    const recovered = await recoveryFn(selectedProjects, {
      maxCandidates: selectedProjects.length,
      ...(options.recoveryOptions || {}),
    });
    const proofed = proofFn(recovered, options.executionProofOptions || {});
    const accessible = accessibilityFn(
      proofed,
      resolveRepairAccessibilityOptions(options)
    );
    repairedSubset = finalIntegrityFn(
      accessible,
      options.finalIntegrityOptions || {}
    );
  } catch (error) {
    engineError = error;
    repairedSubset = selectedProjects;
  }

  const merged = mergeExactSubset(projects, repairedSubset);
  const afterMicroscope = buildQualificationFailureMicroscope(
    merged,
    options.microscope || {}
  );
  const afterTraceMap = new Map(
    (afterMicroscope.candidates || [])
      .map((trace) => [traceIdentity(trace), trace])
      .filter(([key]) => Boolean(key))
  );
  const changes = selection.targets.map((target) =>
    summarizeTargetChange(
      target,
      afterTraceMap.get(target.identityKey) || target.trace
    )
  );
  const providerFailures = repairedSubset.filter(providerFailure).length;
  const resolvedUnknowns = changes.filter((row) => row.resolved).length;
  const becamePass = changes.filter((row) => row.becamePass).length;
  const becameKnownFailure = changes.filter((row) => row.becameKnownFailure).length;
  const newlyQualified = changes.filter(
    (row) => !row.finalQualifiedBefore && row.finalQualifiedAfter
  ).length;

  let status = "PROOF_REPAIR_NO_CHANGE";
  if (engineError) status = "REPAIR_ENGINE_FAILED";
  else if (resolvedUnknowns || becamePass || becameKnownFailure) {
    status =
      resolvedUnknowns === changes.length
        ? "PROOF_REPAIR_RESOLVED_ALL_SELECTED_GAPS"
        : "PROOF_REPAIR_PARTIAL";
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date(options.now || Date.now()).toISOString(),
    status,
    inputFile,
    microscopeFile,
    repairedReportFile,
    sourceProjects: projects.length,
    selectedTargets: selection.targets.length,
    totalRecoverableTargets: selection.totalRecoverableTargets,
    repairedTargets: engineError ? 0 : repairedSubset.length,
    providerFailures,
    resolvedUnknowns,
    becamePass,
    becameKnownFailure,
    newlyQualifiedDiagnosticOnly: newlyQualified,
    beforeDiagnostic: microscope.diagnostic || null,
    afterDiagnostic: afterMicroscope.diagnostic || null,
    beforeVerifiedRouteDeathMap: microscope.verifiedRouteDeathMap || {},
    afterVerifiedRouteDeathMap: afterMicroscope.verifiedRouteDeathMap || {},
    beforeFirstUnknownCounts: microscope.firstUnknownCounts || {},
    afterFirstUnknownCounts: afterMicroscope.firstUnknownCounts || {},
    beforeFirstKnownFailureCounts: microscope.firstKnownFailureCounts || {},
    afterFirstKnownFailureCounts: afterMicroscope.firstKnownFailureCounts || {},
    changes,
    skipped: selection.skipped.slice(0, 200),
    engineError: engineError?.message || null,
    policy: {
      researchDiagnosticOnly: true,
      knownSafetyBlocksNeverRepaired: true,
      identityConflictsNeverRepaired: true,
      confirmedAccessRestrictionsNeverRepaired: true,
      userRegionMustBeExplicitToResolveRegionSpecificAccess: true,
      missingProofNeverSyntheticPass: true,
      originalProductionReportOverwritten: false,
      rankingInfluence: false,
      scoringInfluence: false,
      automaticTrading: false,
      automaticProductionPromotion: false,
    },
  };

  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);

  if (options.writeRepairedReport !== false) {
    fs.mkdirSync(path.dirname(repairedReportFile), { recursive: true });
    fs.writeFileSync(
      repairedReportFile,
      `${JSON.stringify({
        ...payload,
        qualificationProofRepair: {
          generatedAt: report.generatedAt,
          status: report.status,
          diagnosticOnly: true,
          sourceReport: inputFile,
        },
        projects: merged,
      }, null, 2)}\n`
    );
  }

  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = await runQualificationProofRepair();
    console.log(JSON.stringify({
      status: report.status,
      selectedTargets: report.selectedTargets,
      repairedTargets: report.repairedTargets,
      resolvedUnknowns: report.resolvedUnknowns || 0,
      providerFailures: report.providerFailures || 0,
      beforeDiagnostic: report.beforeDiagnostic || null,
      afterDiagnostic: report.afterDiagnostic || null,
      beforeVerifiedRouteDeathMap: report.beforeVerifiedRouteDeathMap || {},
      afterVerifiedRouteDeathMap: report.afterVerifiedRouteDeathMap || {},
    }, null, 2));
    if (
      ["REPAIR_INPUT_MISSING_OR_INVALID", "REPAIR_ENGINE_FAILED"].includes(
        report.status
      )
    ) process.exitCode = 2;
  } catch (error) {
    console.error(error);
    process.exitCode = 2;
  }
}

export const QUALIFICATION_PROOF_REPAIR_REPORT = DEFAULT_REPORT_FILE;
export const __qualificationProofRepairHooks = {
  exactRepairIdentity,
  traceIdentity,
  recoverableReason,
  mergeExactSubset,
  providerFailure,
  extractProjects,
};
