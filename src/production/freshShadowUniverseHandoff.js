import { loadEdgeCandidateUniverse } from "../data/edgeCandidateUniverseStore.js";
import { runOperationalTruthGate } from "../ops/operationalTruthGate.js";
import { inspectScannerState } from "../ops/scannerStateBundle.js";
import { writeAtomicJson } from "./atomicArtifactStore.js";

function valueAfter(prefix, values = process.argv.slice(2)) {
  const exact = values.find((value) => value.startsWith(`${prefix}=`));
  if (exact) return exact.slice(prefix.length + 1);
  const index = values.indexOf(prefix);
  return index >= 0 ? values[index + 1] || null : null;
}

function handoffState(truth = {}) {
  if (truth.pass) return "FRESH_EXACT_SHADOW_UNIVERSE_READY";
  if ((truth.blockers || []).includes("EXACT_CANDIDATE_UNIVERSE_STALE")) {
    return "FRESH_EXACT_SHADOW_UNIVERSE_STALE";
  }
  return "FRESH_EXACT_SHADOW_UNIVERSE_INVALID";
}

/**
 * Makes the exact scanner-state handoff observable before Alpha OS can consume
 * it. This is deliberately a wrapper around the existing fail-closed truth
 * gate: it does not relax the 90-minute point-in-time policy.
 */
export function evaluateFreshShadowUniverseHandoff(options = {}) {
  const now = options.now || new Date().toISOString();
  const universe = options.universe || loadEdgeCandidateUniverse({ file: options.universeFile });
  const scannerState = options.scannerState || inspectScannerState({
    root: options.root,
    bundleFile: options.bundleFile,
  });
  const truth = options.truth || runOperationalTruthGate({
    scope: "shadow-universe",
    now,
    universeFile: options.universeFile,
    sources: { universe },
    maximumUniverseAgeMinutes: options.maximumUniverseAgeMinutes || 90,
    writeReport: options.writeTruthReport !== false,
  });
  const candidates = Array.isArray(universe?.candidates) ? universe.candidates : [];

  const report = {
    schemaVersion: 1,
    generatedAt: now,
    state: handoffState(truth),
    pass: truth.pass,
    source: {
      kind: options.source || "unknown",
      refreshWorkflowRunId: options.refreshWorkflowRunId || null,
      refreshWorkflowHeadSha: options.refreshWorkflowHeadSha || null,
      refreshAttempted: options.refreshAttempted === true,
    },
    scannerState: {
      state: scannerState.state,
      generatedAt: scannerState.generatedAt || scannerState.sourceGeneratedAt || null,
      codeCommitSha: scannerState.codeCommitSha || scannerState.sourceCodeCommitSha || null,
      exactUniverseIncluded: scannerState.exactUniverseIncluded === true,
    },
    universe: {
      generatedAt: universe?.generatedAt || null,
      ageMinutes: truth.metrics?.universeAgeMinutes ?? null,
      maximumAgeMinutes: truth.metrics?.maximumUniverseAgeMinutes ?? 90,
      candidateCount: candidates.length,
      exactCandidateCount: Number(universe?.exactCandidates ?? candidates.length),
      identityValid: !(truth.blockers || []).includes("CANDIDATE_UNIVERSE_CONTAINS_INEXACT_IDENTITY"),
      availabilityState: universe?.availabilityState || null,
    },
    truth,
  };

  if (options.writeReport !== false) {
    writeAtomicJson(options.reportFile || "reports/fresh-shadow-universe-handoff.json", report);
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = evaluateFreshShadowUniverseHandoff({
    source: valueAfter("--source"),
    refreshWorkflowRunId: valueAfter("--refresh-workflow-run-id"),
    refreshWorkflowHeadSha: valueAfter("--refresh-workflow-head-sha"),
    refreshAttempted: process.argv.includes("--refresh-attempted"),
  });
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 2;
}
