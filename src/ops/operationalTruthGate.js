import fs from "node:fs";
import path from "node:path";

import { strictIdentity } from "../production/productionMath.js";
import { writeAtomicJson } from "../production/atomicArtifactStore.js";

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
  catch { return null; }
}

function ageMinutes(value, now) {
  const time = Date.parse(value || "");
  const nowMs = Date.parse(now || "");
  return Number.isFinite(time) && Number.isFinite(nowMs) ? (nowMs - time) / 60_000 : null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function evaluateOperationalTruth(sources = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const scope = options.scope || "production-shadow";
  const blockers = [];
  const warnings = [];
  const universe = sources.universe;
  const universeCandidates = Array.isArray(universe?.candidates) ? universe.candidates : [];
  const universeAgeMinutes = ageMinutes(universe?.generatedAt, now);
  const maximumUniverseAgeMinutes = Number(options.maximumUniverseAgeMinutes || (scope === "dashboard-shadow" ? 120 : 390));

  if (scope === "dashboard-shadow" || scope === "production-shadow") {
    if (!universe || typeof universe !== "object") blockers.push("EXACT_CANDIDATE_UNIVERSE_MISSING");
    else {
      if (universeAgeMinutes === null) blockers.push("EXACT_CANDIDATE_UNIVERSE_TIMESTAMP_INVALID");
      else if (universeAgeMinutes < -1) blockers.push("EXACT_CANDIDATE_UNIVERSE_FROM_FUTURE");
      else if (universeAgeMinutes > maximumUniverseAgeMinutes) blockers.push("EXACT_CANDIDATE_UNIVERSE_STALE");
      const invalidExactRows = universeCandidates.filter((candidate) => !strictIdentity(candidate)).length;
      if (invalidExactRows) blockers.push("CANDIDATE_UNIVERSE_CONTAINS_INEXACT_IDENTITY");
      if (Number(universe.exactCandidates ?? universeCandidates.length) !== universeCandidates.length) {
        blockers.push("CANDIDATE_UNIVERSE_COUNT_MISMATCH");
      }
      if (
        scope === "dashboard-shadow" &&
        options.codeCommitSha &&
        universe.codeCommitSha &&
        universe.codeCommitSha !== options.codeCommitSha
      ) blockers.push("CANDIDATE_UNIVERSE_COMMIT_MISMATCH");
      if (
        scope === "dashboard-shadow" &&
        options.workflowRunId &&
        String(universe.workflowRunId || "") !== String(options.workflowRunId)
      ) blockers.push("CANDIDATE_UNIVERSE_WORKFLOW_RUN_MISMATCH");
    }
    if (!sources.shadow || typeof sources.shadow !== "object") blockers.push("PRODUCTION_SHADOW_REPORT_MISSING");
    if (!sources.cohort || typeof sources.cohort !== "object") blockers.push("PROSPECTIVE_COHORT_REPORT_MISSING");
    const shadowCandidates = Array.isArray(sources.shadow?.candidates) ? sources.shadow.candidates : [];
    if (shadowCandidates.some((candidate) => !strictIdentity(candidate))) {
      blockers.push("PRODUCTION_SHADOW_CONTAINS_INEXACT_IDENTITY");
    }
    if (!universeCandidates.length) warnings.push("HONEST_EMPTY_EXACT_CANDIDATE_UNIVERSE");
    if (!shadowCandidates.length) warnings.push("NO_SHADOW_EDGE_SELECTED");
  }

  if (scope === "edge-truth") {
    if (!sources.acquisition || typeof sources.acquisition !== "object") {
      blockers.push("ACQUISITION_HEALTH_REPORT_MISSING");
    } else if (sources.acquisition.blockResearchAdvancement === true || sources.acquisition.healthy !== true) {
      blockers.push(...(sources.acquisition.blockers || ["ACQUISITION_NOT_HEALTHY"]));
    } else if (sources.acquisition.observationClass === "HEALTHY_NEGATIVE_EVIDENCE") {
      warnings.push("NO_CAPITAL_EVENT_OBSERVED_UNDER_COMPLETE_COVERAGE");
    }
  }

  const finalBlockers = unique(blockers);
  const finalWarnings = unique(warnings);
  const state = finalBlockers.length
    ? "OPERATIONAL_INFRASTRUCTURE_FAILURE"
    : finalWarnings.length
      ? "OPERATIONAL_HEALTHY_NO_EDGE_OR_EVENT"
      : "OPERATIONAL_HEALTHY";
  return {
    schemaVersion: 1,
    generatedAt: now,
    scope,
    state,
    pass: finalBlockers.length === 0,
    blockers: finalBlockers,
    warnings: finalWarnings,
    metrics: {
      exactCandidates: universeCandidates.length,
      shadowCandidates: Array.isArray(sources.shadow?.candidates) ? sources.shadow.candidates.length : 0,
      universeAgeMinutes: universeAgeMinutes === null ? null : Number(universeAgeMinutes.toFixed(2)),
      maximumUniverseAgeMinutes,
    },
    invariants: {
      noEdgeFoundIsNotInfrastructureFailure: true,
      noEventUnderCompleteCoverageIsNotFailure: true,
      missingOrStaleEvidenceFailsClosed: true,
      exactIdentityRequired: true,
      automaticTrading: false,
      automaticProductionPromotion: false,
    },
  };
}

export function runOperationalTruthGate(options = {}) {
  const scope = options.scope || "production-shadow";
  const sources = options.sources || {
    universe: readJson(options.universeFile || "data/edge-candidate-universe.json"),
    shadow: readJson(options.shadowFile || "reports/production-shadow-ranking.json"),
    cohort: readJson(options.cohortFile || "reports/prospective-edge-cohort-capture.json"),
    acquisition: readJson(options.acquisitionFile || "reports/acquisition-health-gate.json"),
  };
  const report = evaluateOperationalTruth(sources, {
    ...options,
    scope,
    codeCommitSha: options.codeCommitSha ?? process.env.GITHUB_SHA ?? null,
    workflowRunId: options.workflowRunId ?? process.env.GITHUB_RUN_ID ?? null,
  });
  if (options.writeReport !== false) writeAtomicJson("reports/operational-truth-gate.json", report);
  return report;
}

export const __operationalTruthGateHooks = { ageMinutes, readJson };
