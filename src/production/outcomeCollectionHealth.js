import fs from "node:fs";
import path from "node:path";

import { outcomeHorizonToleranceHours } from "../learning/outcomeCalibrationEngine.js";
import { loadExactMarketObservations } from "./exactMarketObservationLedger.js";
import { loadProspectiveEdgeCohorts } from "./prospectiveEdgeCohortLedger.js";
import { strictIdentity, timestamp } from "./productionMath.js";
import { writeAtomicJson } from "./atomicArtifactStore.js";

export const OUTCOME_COLLECTION_HORIZONS = Object.freeze([1, 24, 168, 720]);
const HEALTHY_PROBE_STATES = new Set(["PASS", "PARTIAL", "NO_OUTCOMES_DUE"]);

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  } catch {
    return fallback;
  }
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function episodeAt(episode = {}) {
  return timestamp(episode.decisionAt || episode.signalObservedAt || episode.frozenAt);
}

function exactObservationMatches(episode = {}, observation = {}, horizonHours) {
  const episodeIdentity = strictIdentity(episode);
  const observationIdentity = strictIdentity(observation);
  const frozenAt = episodeAt(episode);
  const observedAt = timestamp(observation.observedAt || observation.sourceObservedAt);
  if (
    !episodeIdentity ||
    !observationIdentity ||
    frozenAt === null ||
    observedAt === null ||
    observation.exactIdentityVerified !== true ||
    finite(observation.priceUsd) === null ||
    finite(observation.priceUsd) <= 0 ||
    episodeIdentity.chain !== observationIdentity.chain ||
    episodeIdentity.tokenAddress !== observationIdentity.tokenAddress ||
    (episodeIdentity.poolAddress && episodeIdentity.poolAddress !== observationIdentity.poolAddress)
  ) return false;

  const targetAt = frozenAt + Number(horizonHours) * 3_600_000;
  const deadlineAt = targetAt + outcomeHorizonToleranceHours(horizonHours) * 3_600_000;
  return observedAt >= targetAt && observedAt <= deadlineAt;
}

export function summarizeMaturedOutcomes(episodes = [], observations = [], options = {}) {
  const nowMs = timestamp(options.now || new Date().toISOString());
  const horizons = Array.isArray(options.horizons) && options.horizons.length
    ? options.horizons.map(Number).filter((value) => value > 0)
    : OUTCOME_COLLECTION_HORIZONS;
  const candidates = (Array.isArray(episodes) ? episodes : []).filter((episode) =>
    ["TREATMENT", "CONTROL_MATCHED"].includes(episode?.role) &&
    strictIdentity(episode) &&
    episodeAt(episode) !== null
  );

  return Object.fromEntries(horizons.map((horizonHours) => {
    const rows = candidates.map((episode) => {
      const frozenAt = episodeAt(episode);
      const targetAt = frozenAt + horizonHours * 3_600_000;
      const deadlineAt = targetAt + outcomeHorizonToleranceHours(horizonHours) * 3_600_000;
      const resolved = (Array.isArray(observations) ? observations : []).some((observation) =>
        exactObservationMatches(episode, observation, horizonHours)
      );
      return {
        mature: nowMs !== null && nowMs >= targetAt,
        due: nowMs !== null && nowMs >= targetAt && nowMs <= deadlineAt,
        missed: nowMs !== null && nowMs > deadlineAt && !resolved,
        resolved,
        treatment: episode.role === "TREATMENT",
      };
    });
    const mature = rows.filter((row) => row.mature);
    const resolved = mature.filter((row) => row.resolved);
    return [`${horizonHours}h`, {
      horizonHours,
      matureExpected: mature.length,
      resolvedExact: resolved.length,
      unresolvedDue: rows.filter((row) => row.due && !row.resolved).length,
      missedUnknown: rows.filter((row) => row.missed).length,
      treatmentsResolved: resolved.filter((row) => row.treatment).length,
      controlsResolved: resolved.filter((row) => !row.treatment).length,
      coveragePct: mature.length ? Number(((resolved.length / mature.length) * 100).toFixed(2)) : null,
    }];
  }));
}

function gradingSummary(report = {}) {
  const sample = report?.current?.sample || report?.sample || {};
  return {
    state: report?.edgeState || report?.state || "NOT_AVAILABLE",
    frozenTreatments: Number(sample?.frozenTreatments || report?.frozenTreatments || 0),
    frozenControls: Number(sample?.frozenControls || report?.frozenControls || 0),
    resolvedMatchedPairs: Number(sample?.resolvedMatchedPairs || report?.resolvedMatchedPairs || 0),
    controlCoveragePct: finite(sample?.controlCoveragePct ?? report?.controlCoveragePct),
  };
}

/**
 * Builds a compact, fail-closed health report for the evidence loop. It is
 * observational only: no score, candidate, model, or execution behaviour is
 * allowed to depend on this report.
 */
export function buildOutcomeCollectionHealth(options = {}) {
  const now = new Date(options.now || Date.now()).toISOString();
  const nowMs = timestamp(now);
  const probe = options.probeReport ?? readJson(options.probeReportFile || "reports/outcome-probe.json", null);
  const restore = options.restoreReport ?? readJson(
    options.restoreReportFile || "reports/forward-evidence-restore.json",
    null,
  );
  const sync = options.syncReport ?? readJson(
    options.syncReportFile || "reports/forward-evidence-sync.json",
    null,
  );
  const verify = options.verifyReport ?? readJson(
    options.verifyReportFile || "reports/forward-evidence-verify.json",
    null,
  );
  const episodes = options.episodes ?? loadProspectiveEdgeCohorts(options.episodeStore || {});
  const observations = options.observations ?? loadExactMarketObservations(options.observationStore || {});
  const grade = options.gradeReport ?? readJson(
    options.gradeReportFile || "reports/prospective-edge-cohort-grade.json",
    {},
  );
  const certificate = options.edgeVerificationReport ?? readJson(
    options.edgeVerificationReportFile || "reports/edge-verification-certificate.json",
    {},
  );
  const maximumAgeMinutes = Math.max(1, Number(options.maximumAgeMinutes || 180));
  const probeAtMs = timestamp(probe?.generatedAt);
  const ageMinutes = probeAtMs === null || nowMs === null
    ? null
    : Number(Math.max(0, (nowMs - probeAtMs) / 60_000).toFixed(2));
  const persistence = {
    restore: restore?.state || "MISSING",
    sync: sync?.state || "MISSING",
    verify: verify?.state || "MISSING",
    verified: verify?.state === "REMOTE_FORWARD_EVIDENCE_VERIFIED" && verify?.verified === true,
    localRecords: Number(verify?.localRecords || sync?.localRecords || 0),
    remoteRecords: Number(verify?.remoteRecords || sync?.remoteRecordsBeforeSync || 0),
    missingRemoteRecordCount: Number(verify?.missingRemoteRecordCount || 0),
    appendOnlyIntegrityPass: verify?.appendOnlyIntegrityPass === true,
    reconciliation: verify?.reconciliation || sync?.reconciliation || restore?.reconciliation || {
      state: "UNKNOWN",
      reconciled: null,
    },
  };
  const observationsByHorizon = summarizeMaturedOutcomes(episodes, observations, {
    now,
    horizons: options.horizons,
  });
  const workflowSteps = {
    probe: options.probeStepOutcome || process.env.OUTCOME_PROBE_STEP_OUTCOME || null,
    restore: options.restoreStepOutcome || process.env.FORWARD_EVIDENCE_RESTORE_STEP_OUTCOME || null,
    sync: options.syncStepOutcome || process.env.FORWARD_EVIDENCE_SYNC_STEP_OUTCOME || null,
    verify: options.verifyStepOutcome || process.env.FORWARD_EVIDENCE_VERIFY_STEP_OUTCOME || null,
  };
  const failedWorkflowStep = Object.values(workflowSteps).some((outcome) => outcome && outcome !== "success");
  const probeValid = HEALTHY_PROBE_STATES.has(probe?.status);
  const stale = probeAtMs === null || ageMinutes === null || ageMinutes > maximumAgeMinutes;
  const invalid = !probeValid ||
    Number(probe?.exactLedgerObservationsRejected || 0) > 0 ||
    persistence.restore !== "REMOTE_FORWARD_EVIDENCE_RESTORED" ||
    persistence.sync !== "REMOTE_FORWARD_EVIDENCE_SYNCED" ||
    !persistence.verified ||
    persistence.reconciliation?.state === "FORWARD_EVIDENCE_RECONCILIATION_REQUIRED" ||
    failedWorkflowStep;
  const state = stale
    ? "OUTCOME_COLLECTION_STALE"
    : invalid
      ? "OUTCOME_COLLECTION_INVALID"
      : "OUTCOME_COLLECTION_HEALTHY";

  const report = {
    schemaVersion: 1,
    generatedAt: now,
    state,
    lastSuccessfulProbeAt: probeValid ? probe.generatedAt : null,
    freshness: {
      ageMinutes,
      maximumAgeMinutes,
      state: stale ? "STALE" : "FRESH",
    },
    probe: {
      status: probe?.status || "MISSING",
      dueCandidates: Number(probe?.dueCandidates || 0),
      duePredictions: Number(probe?.duePredictions || 0),
      exactLedgerObservationsSaved: Number(probe?.exactLedgerObservationsSaved || 0),
      exactLedgerObservationsRejected: Number(probe?.exactLedgerObservationsRejected || 0),
      maturedObservationsByHorizon: probe?.maturedObservationsByHorizon || {},
      unresolvedCandidates: Number(probe?.unresolvedCandidates || 0),
    },
    workflowSteps,
    durablePersistence: persistence,
    maturedObservationsByHorizon: observationsByHorizon,
    grading: gradingSummary(grade),
    edgeVerification: {
      state: certificate?.edgeState || certificate?.state || "NOT_AVAILABLE",
      forwardOnly: certificate?.forwardOnly === true || null,
    },
    policy: {
      rankingInfluence: false,
      automaticTrading: false,
      automaticPromotion: false,
      historicalOrBackfilledEvidenceCountsAsForwardProof: false,
      unknownOutcomePolicy: "UNKNOWN",
    },
  };
  if (options.writeReport !== false) {
    writeAtomicJson(options.reportFile || "reports/outcome-collection-health.json", report);
  }
  return report;
}

export const __outcomeCollectionHealthHooks = { exactObservationMatches, gradingSummary };
