import { auditPointInTimeRecord } from "../backtest/pointInTimeLeakageGuard.js";
import { buildCalibrationReport } from "./probabilityCalibrationEngine.js";
import { compareChampionChallenger } from "./championChallengerGovernor.js";
import { evaluateEdgeDecay } from "./edgeDecayMonitor.js";
import { exactMarketObservationIntegrityHash } from "./exactMarketObservationLedger.js";
import {
  CLI15_PREDICTION_CONTRACT_VERSION,
  PROSPECTIVE_EDGE_HORIZONS_HOURS,
  predictionContractIntegrityHash,
  prospectiveEpisodeIntegrityHash,
} from "./prospectiveEdgeCohortLedger.js";
import {
  resolveProspectiveEpisodeOutcome,
} from "./prospectiveEdgeCohortGrader.js";
import { gradeIntegrityScopedProspectiveEdgeCohorts } from "./integrityScopedProspectiveEdgeGrader.js";
import {
  finite,
  mean,
  median,
  percentile,
  stableHash,
  strictIdentity,
  timestamp,
} from "./productionMath.js";

export const CLI15_VERSION = "CLI15_FORWARD_ALPHA_VALIDATION_OS_V1";
export const CLI15_HORIZONS_HOURS = PROSPECTIVE_EDGE_HORIZONS_HOURS;

export const CLI15_DEFAULT_POLICY = Object.freeze({
  version: CLI15_VERSION,
  primaryHorizonHours: 24,
  horizonsHours: CLI15_HORIZONS_HOURS,
  minimumContractIntegrityRate: 1,
  minimumPrimaryCalibrationSamples: 100,
  maximumPrimaryCalibrationError: 0.08,
  maximumCatastrophicLossDelta: 0.02,
  requireLiveSourceHealth: true,
  requireExecutablePaperCanary: true,
  requireVerifiedChampionBaseline: true,
  requireVerifiedForwardCertificate: true,
  precisionAtK: [1, 5, 10, 25],
  automaticPromotion: false,
  automaticTrading: false,
  humanApprovalRequired: true,
});

function toleranceHours(horizonHours) {
  const policy = new Map([
    [1, 0.5],
    [6, 2],
    [24, 8],
    [168, 24],
    [720, 72],
  ]);
  return policy.get(Number(horizonHours)) ?? Math.max(1, Math.min(72, Number(horizonHours) * 0.20));
}

function routeCompatible(left = {}, right = {}) {
  const expected = strictIdentity(left);
  const actual = strictIdentity(right);
  if (!expected || !actual || expected.identityKey !== actual.identityKey) return false;
  return !expected.poolAddress || !actual.poolAddress || expected.poolAddress === actual.poolAddress;
}

function observationAt(row = {}) {
  return timestamp(row.observedAt || row.timestamp || row.outcomeObservedAt);
}

function rounded(value, digits = 8) {
  const parsed = finite(value);
  return parsed === null ? null : Number(parsed.toFixed(digits));
}

function safeObservations(rows = [], asOf, requireIntegrity = true) {
  const asOfMs = timestamp(asOf);
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const at = observationAt(row);
    const price = finite(row.priceUsd);
    const integrity = !requireIntegrity || (
      Boolean(row.observationIntegrityHash) &&
      row.observationIntegrityHash === exactMarketObservationIntegrityHash(row)
    );
    return integrity && strictIdentity(row) && at !== null && at <= asOfMs && price !== null && price > 0;
  });
}

function predictionContractFailures(episode = {}, asOfMs) {
  const failures = [];
  const contract = episode.frozenPrediction;
  const identity = strictIdentity(episode);
  const decisionMs = timestamp(episode.decisionAt);
  const sourceMs = timestamp(episode.sourceObservedAt);
  if (episode.role !== "TREATMENT") failures.push("NOT_A_TREATMENT_PREDICTION");
  if (!identity || episode.identityKey !== identity?.identityKey || episode.routeKey !== identity?.routeKey) {
    failures.push("EXACT_IDENTITY_BINDING_FAILURE");
  }
  if (decisionMs === null || decisionMs > asOfMs) failures.push("INVALID_DECISION_TIMESTAMP");
  if (sourceMs === null || decisionMs === null || sourceMs > decisionMs) failures.push("FUTURE_OR_MISSING_SOURCE_TIMESTAMP");
  if (!episode.codeCommitSha || !episode.strategyFingerprint || !episode.strategyVersion) failures.push("UNVERSIONED_PREDICTION");
  if (!episode.freezeIntegrityHash || episode.freezeIntegrityHash !== prospectiveEpisodeIntegrityHash(episode)) {
    failures.push("EPISODE_INTEGRITY_HASH_FAILURE");
  }
  if (episode.strategyDefinition?.predictionContractVersion !== CLI15_PREDICTION_CONTRACT_VERSION) {
    failures.push("LEGACY_PREDICTION_CONTRACT");
  }
  if (!contract) return [...new Set([...failures, "MISSING_FROZEN_PREDICTION_CONTRACT"])];
  if (contract.contractVersion !== CLI15_PREDICTION_CONTRACT_VERSION) failures.push("PREDICTION_CONTRACT_VERSION_FAILURE");
  if (!contract.contractIntegrityHash || contract.contractIntegrityHash !== predictionContractIntegrityHash(contract)) {
    failures.push("PREDICTION_CONTRACT_INTEGRITY_HASH_FAILURE");
  }
  if (
    contract.identityKey !== episode.identityKey ||
    contract.routeKey !== episode.routeKey ||
    contract.decisionAt !== episode.decisionAt ||
    contract.sourceObservedAt !== episode.sourceObservedAt ||
    contract.strategyFingerprint !== episode.strategyFingerprint ||
    contract.strategyVersion !== episode.strategyVersion ||
    contract.codeCommitSha !== episode.codeCommitSha
  ) failures.push("PREDICTION_CONTRACT_BINDING_FAILURE");
  if (
    !contract.featureSnapshot ||
    contract.featureSnapshotHash !== stableHash(contract.featureSnapshot) ||
    stableHash(contract.featureSnapshot) !== stableHash(episode.frozenFeatures)
  ) failures.push("FEATURE_SNAPSHOT_INTEGRITY_FAILURE");
  if (stableHash(contract.targetHorizonsHours || []) !== stableHash(episode.outcomeHorizonsHours || [])) {
    failures.push("PREDECLARED_HORIZON_BINDING_FAILURE");
  }
  const temporal = auditPointInTimeRecord(contract);
  if (!temporal.valid) failures.push(...temporal.violations.map((row) => `TEMPORAL_${row.type}`));
  if (
    contract.outcomeKnownAtFreeze !== false ||
    contract.futureEvidencePresent !== false ||
    contract.exactIdentityVerified !== true ||
    contract.shadowOnly !== true ||
    contract.automaticTrading !== false ||
    contract.automaticPromotion !== false
  ) failures.push("PREDICTION_CONTRACT_GOVERNANCE_FAILURE");
  const probabilities = Object.values(contract.probabilitiesPct || {});
  if (probabilities.some((value) => value !== null && (finite(value) === null || value < 0 || value > 100))) {
    failures.push("INVALID_FROZEN_PROBABILITY");
  }
  return [...new Set(failures)];
}

export function auditForwardPredictionContracts(episodes = [], options = {}) {
  const asOf = options.asOf || options.now || new Date().toISOString();
  const asOfMs = timestamp(asOf);
  if (asOfMs === null) throw new Error("CLI 15 prediction-contract audit requires a valid as-of timestamp");
  const treatments = (Array.isArray(episodes) ? episodes : []).filter((row) => row?.role === "TREATMENT");
  const latestStrategyFingerprint = treatments
    .filter((row) => timestamp(row.decisionAt) !== null && timestamp(row.decisionAt) <= asOfMs)
    .sort((left, right) => timestamp(right.decisionAt) - timestamp(left.decisionAt))[0]?.strategyFingerprint || null;
  const current = latestStrategyFingerprint
    ? treatments.filter((row) => row.strategyFingerprint === latestStrategyFingerprint)
    : [];
  const rows = current.map((episode) => ({
    episodeId: episode.episodeId || null,
    identityKey: episode.identityKey || null,
    decisionAt: episode.decisionAt || null,
    contractVersion: episode.frozenPrediction?.contractVersion || null,
    contractIntegrityHash: episode.frozenPrediction?.contractIntegrityHash || null,
    failures: predictionContractFailures(episode, asOfMs),
  }));
  const valid = rows.filter((row) => !row.failures.length);
  const failureCounts = {};
  for (const row of rows) {
    for (const failure of row.failures) failureCounts[failure] = (failureCounts[failure] || 0) + 1;
  }
  const integrityRate = rows.length ? valid.length / rows.length : null;
  const pass = rows.length > 0 && integrityRate >= Number(options.minimumContractIntegrityRate ?? 1);
  return {
    state: pass
      ? "CLI15_PREDICTION_CONTRACTS_VERIFIED"
      : rows.length
        ? "CLI15_PREDICTION_CONTRACT_INTEGRITY_FAILURE"
        : "CLI15_NO_FROZEN_PREDICTIONS",
    asOf: new Date(asOfMs).toISOString(),
    latestStrategyFingerprint,
    currentContracts: rows.length,
    validContracts: valid.length,
    invalidContracts: rows.length - valid.length,
    integrityRate,
    pass,
    failureCounts,
    rows: rows.slice(-Math.max(1, Number(options.reportLimit || 5000))),
    policy: {
      exactChainAddressIdentityRequired: true,
      poolBindingRequiredWhenKnown: true,
      immutableFeatureSnapshotRequired: true,
      codeModelConfigVersionRequired: true,
      futureEvidenceProhibited: true,
      outcomesAtFreezeProhibited: true,
      automaticTrading: false,
      automaticPromotion: false,
    },
  };
}

function pathExcursions(episode = {}, observations = [], horizonHours, tolerance) {
  const decisionMs = timestamp(episode.decisionAt);
  const start = finite(episode.signalPriceUsd);
  if (decisionMs === null || start === null || start <= 0) return null;
  const maximumMs = decisionMs + (Number(horizonHours) + Number(tolerance)) * 3_600_000;
  const prices = observations
    .filter((row) => routeCompatible(episode, row) && observationAt(row) >= decisionMs && observationAt(row) <= maximumMs)
    .sort((left, right) => observationAt(left) - observationAt(right))
    .map((row) => finite(row.priceUsd))
    .filter((value) => value !== null && value > 0);
  if (!prices.length) return null;
  let peak = start;
  let maximumDrawdownPct = 0;
  for (const price of prices) {
    peak = Math.max(peak, price);
    maximumDrawdownPct = Math.min(maximumDrawdownPct, ((price / peak) - 1) * 100);
  }
  const returns = prices.map((price) => ((price / start) - 1) * 100);
  return {
    observations: prices.length,
    maximumFavorableExcursionPct: rounded(Math.max(...returns)),
    maximumAdverseExcursionPct: rounded(Math.min(...returns)),
    maximumDrawdownPct: rounded(maximumDrawdownPct),
  };
}

function horizonCalibration(outcomes = [], episodeById = new Map(), horizonHours, policy = {}) {
  const forecast = Number(horizonHours) === 24
    ? { field: "plus25", thresholdPct: 25 }
    : Number(horizonHours) === 168
      ? { field: "plus100", thresholdPct: 100 }
      : null;
  if (!forecast) {
    return {
      state: "NO_PREDECLARED_PROBABILITY_FOR_HORIZON",
      samples: 0,
      forecast: null,
    };
  }
  const rows = outcomes.flatMap((outcome) => {
    const probabilityPct = finite(episodeById.get(outcome.episodeId)?.frozenPrediction?.probabilitiesPct?.[forecast.field]);
    if (probabilityPct === null) return [];
    return [{
      probability: probabilityPct / 100,
      actual: outcome.netReturnPct >= forecast.thresholdPct,
    }];
  });
  return {
    ...buildCalibrationReport(rows, {
      minimumSamples: Number(policy.minimumPrimaryCalibrationSamples || 100),
      maximumEce: Number(policy.maximumPrimaryCalibrationError || 0.08),
    }),
    forecast,
  };
}

function precisionAtK(outcomes = [], episodeById = new Map(), values = []) {
  return Object.fromEntries(values.map((value) => {
    const k = Math.max(1, Number(value));
    const rows = outcomes.filter((outcome) => Number(episodeById.get(outcome.episodeId)?.selectionRank) <= k);
    return [String(k), {
      samples: rows.length,
      plus25Precision: rows.length ? rows.filter((row) => row.netReturnPct >= 25).length / rows.length : null,
      positiveReturnPrecision: rows.length ? rows.filter((row) => row.netReturnPct > 0).length / rows.length : null,
      meanNetReturnPct: mean(rows.map((row) => row.netReturnPct)),
    }];
  }));
}

function pairHorizonOutcomes(episodes = [], outcomes = []) {
  const outcomeByEpisode = new Map(outcomes.map((row) => [row.episodeId, row]));
  const controlsByParent = new Map();
  for (const episode of episodes.filter((row) => row.role === "CONTROL_MATCHED")) {
    controlsByParent.set(episode.parentTreatmentEpisodeId, [
      ...(controlsByParent.get(episode.parentTreatmentEpisodeId) || []),
      episode,
    ]);
  }
  return episodes.filter((row) => row.role === "TREATMENT").flatMap((treatment) => {
    const treatmentOutcome = outcomeByEpisode.get(treatment.episodeId);
    const frozenControls = controlsByParent.get(treatment.episodeId) || [];
    const controls = frozenControls
      .map((episode) => ({ episode, outcome: outcomeByEpisode.get(episode.episodeId) }))
      .filter((row) => row.outcome);
    if (!treatmentOutcome || !controls.length || controls.length !== frozenControls.length) return [];
    const controlReturns = controls.map((row) => row.outcome.netReturnPct);
    return [{
      pairId: treatment.episodeId,
      cohortId: treatment.cohortId,
      identityKey: treatment.identityKey,
      decisionAt: treatment.decisionAt,
      treatment,
      treatmentOutcome,
      controls,
      treatmentNetReturnPct: treatmentOutcome.netReturnPct,
      controlMeanNetReturnPct: mean(controlReturns),
      averageNetReturnEdgePct: treatmentOutcome.netReturnPct - mean(controlReturns),
      hitRateEdge: (treatmentOutcome.netReturnPct >= 25 ? 1 : 0) - mean(controls.map((row) => row.outcome.netReturnPct >= 25 ? 1 : 0)),
      catastrophicLossDelta: (treatmentOutcome.netReturnPct <= -50 ? 1 : 0) - mean(controls.map((row) => row.outcome.netReturnPct <= -50 ? 1 : 0)),
    }];
  });
}

export function evaluateForwardHorizon(episodes = [], observations = [], options = {}) {
  const asOf = options.asOf || options.now || new Date().toISOString();
  const asOfMs = timestamp(asOf);
  const horizonHours = Number(options.horizonHours || 24);
  const tolerance = Number(options.toleranceHours ?? toleranceHours(horizonHours));
  if (asOfMs === null) throw new Error("CLI 15 horizon evaluation requires a valid as-of timestamp");
  const declared = (Array.isArray(episodes) ? episodes : []).filter((episode) =>
    Array.isArray(episode.outcomeHorizonsHours) && episode.outcomeHorizonsHours.map(Number).includes(horizonHours)
  );
  const mature = declared.filter((episode) => {
    const decisionMs = timestamp(episode.decisionAt);
    return decisionMs !== null && asOfMs >= decisionMs + horizonHours * 3_600_000;
  });
  const outcomes = mature.map((episode) => {
    const outcome = resolveProspectiveEpisodeOutcome(episode, observations, {
      asOf,
      horizonHours,
      toleranceHours: tolerance,
      targetReturnPct: 25,
      catastrophicReturnPct: -50,
      conservativeMissingCostBps: 200,
    });
    if (!outcome) return null;
    return {
      ...outcome,
      path: pathExcursions(episode, observations, horizonHours, tolerance),
    };
  }).filter(Boolean);
  const episodeById = new Map(declared.map((row) => [row.episodeId, row]));
  const treatmentOutcomes = outcomes.filter((row) => episodeById.get(row.episodeId)?.role === "TREATMENT");
  const controlOutcomes = outcomes.filter((row) => episodeById.get(row.episodeId)?.role === "CONTROL_MATCHED");
  const pairs = pairHorizonOutcomes(declared, outcomes);
  const matureTreatments = mature.filter((row) => row.role === "TREATMENT");
  const matureEpisodes = mature.length;
  const captureRate = matureEpisodes ? outcomes.length / matureEpisodes : null;
  const pairCaptureRate = matureTreatments.length ? pairs.length / matureTreatments.length : null;
  const averageReturnEdgePct = mean(pairs.map((row) => row.averageNetReturnEdgePct));
  const hitRateEdge = mean(pairs.map((row) => row.hitRateEdge));
  const catastrophicLossDelta = mean(pairs.map((row) => row.catastrophicLossDelta));
  const safetyStop = pairs.length >= Number(options.minimumSafetySample || 20) && (
    (averageReturnEdgePct ?? 0) < 0 ||
    (catastrophicLossDelta ?? 1) > Number(options.maximumCatastrophicLossDelta ?? 0.02)
  );
  const state = !matureEpisodes
    ? "AWAITING_HORIZON_MATURITY"
    : safetyStop
      ? "HORIZON_SAFETY_STOP"
      : (captureRate ?? 0) < Number(options.minimumCaptureRate || 0.95)
        ? "HORIZON_OUTCOME_CAPTURE_INCOMPLETE"
        : (averageReturnEdgePct ?? 0) > 0 && (hitRateEdge ?? 0) >= 0
          ? "HORIZON_EDGE_POSITIVE"
          : "HORIZON_EVIDENCE_COLLECTING";
  return {
    state,
    horizonHours,
    toleranceHours: tolerance,
    sample: {
      declaredEpisodes: declared.length,
      matureEpisodes,
      resolvedEpisodes: outcomes.length,
      matureTreatments: matureTreatments.length,
      resolvedTreatments: treatmentOutcomes.length,
      resolvedControls: controlOutcomes.length,
      fullyResolvedMatchedPairs: pairs.length,
      uniqueTreatmentProjects: new Set(treatmentOutcomes.map((row) => row.identityKey)).size,
      cohorts: new Set(pairs.map((row) => row.cohortId)).size,
      episodeCaptureRate: captureRate,
      pairCaptureRate,
    },
    performance: {
      treatmentMeanNetReturnPct: mean(treatmentOutcomes.map((row) => row.netReturnPct)),
      treatmentMedianNetReturnPct: median(treatmentOutcomes.map((row) => row.netReturnPct)),
      matchedControlMeanNetReturnPct: mean(controlOutcomes.map((row) => row.netReturnPct)),
      averageNetReturnEdgePct: averageReturnEdgePct,
      hitRateEdge,
      catastrophicLossDelta,
      plus25HitRate: treatmentOutcomes.length
        ? treatmentOutcomes.filter((row) => row.netReturnPct >= 25).length / treatmentOutcomes.length
        : null,
      positiveReturnRate: treatmentOutcomes.length
        ? treatmentOutcomes.filter((row) => row.netReturnPct > 0).length / treatmentOutcomes.length
        : null,
      catastrophicLossRate: treatmentOutcomes.length
        ? treatmentOutcomes.filter((row) => row.netReturnPct <= -50).length / treatmentOutcomes.length
        : null,
      medianMaximumAdverseExcursionPct: median(treatmentOutcomes.map((row) => row.path?.maximumAdverseExcursionPct)),
      medianMaximumDrawdownPct: median(treatmentOutcomes.map((row) => row.path?.maximumDrawdownPct)),
    },
    precisionAtK: precisionAtK(treatmentOutcomes, episodeById, options.precisionAtK || [1, 5, 10, 25]),
    calibration: horizonCalibration(treatmentOutcomes, episodeById, horizonHours, options),
    safetyStop,
    outcomes: outcomes.slice(-Math.max(1, Number(options.outcomeReportLimit || 5000))),
    pairs: pairs.slice(-Math.max(1, Number(options.pairReportLimit || 5000))),
  };
}

function groupedPerformance(outcomes = [], episodeById = new Map(), field, fallback = "UNKNOWN") {
  const groups = new Map();
  for (const outcome of outcomes) {
    const episode = episodeById.get(outcome.episodeId) || {};
    const raw = typeof field === "function" ? field(episode) : episode.frozenFeatures?.[field];
    const key = String(raw || fallback);
    groups.set(key, [...(groups.get(key) || []), outcome]);
  }
  return [...groups.entries()]
    .map(([key, rows]) => ({
      key,
      samples: rows.length,
      meanNetReturnPct: mean(rows.map((row) => row.netReturnPct)),
      plus25HitRate: rows.filter((row) => row.netReturnPct >= 25).length / rows.length,
      catastrophicLossRate: rows.filter((row) => row.netReturnPct <= -50).length / rows.length,
    }))
    .sort((left, right) => right.samples - left.samples || left.key.localeCompare(right.key));
}

export function segmentForwardPerformance(episodes = [], horizonReport = {}) {
  const episodeById = new Map((Array.isArray(episodes) ? episodes : []).map((row) => [row.episodeId, row]));
  const treatments = (horizonReport.outcomes || []).filter((row) => episodeById.get(row.episodeId)?.role === "TREATMENT");
  const scoreTier = (episode) => {
    const score = finite(episode.frozenPrediction?.scores?.selection);
    if (score === null) return "UNKNOWN";
    if (score >= 90) return "90-100";
    if (score >= 80) return "80-89";
    if (score >= 70) return "70-79";
    if (score >= 60) return "60-69";
    return "BELOW-60";
  };
  return {
    chain: groupedPerformance(treatments, episodeById, (episode) => episode.chain),
    regime: groupedPerformance(treatments, episodeById, "globalMarketRegimeState"),
    narrative: groupedPerformance(treatments, episodeById, "narrative"),
    scoreTier: groupedPerformance(treatments, episodeById, scoreTier),
  };
}

function metricsFromStrategy(strategy = {}) {
  const pairs = Array.isArray(strategy.pairs) ? strategy.pairs : [];
  const outcomes = pairs.map((row) => row.treatmentOutcome).filter(Boolean);
  return {
    samples: pairs.length,
    averageReturnPct: mean(outcomes.map((row) => row.netReturnPct)),
    plus25HitRate: outcomes.length ? outcomes.filter((row) => row.netReturnPct >= 25).length / outcomes.length : null,
    catastrophicLossRate: outcomes.length ? outcomes.filter((row) => row.netReturnPct <= -50).length / outcomes.length : null,
  };
}

function latestDecisionAt(strategy = {}) {
  return Math.max(0, ...(strategy.pairs || []).map((row) => timestamp(row.decisionAt) || 0));
}

export function evaluateChampionChallengerGovernance(certificate = {}, options = {}) {
  const currentFingerprint = certificate.latestStrategyFingerprint || null;
  const current = certificate.current || {};
  const candidates = Object.entries(certificate.strategies || {})
    .filter(([fingerprint, strategy]) => fingerprint !== currentFingerprint && strategy.edgeState === "VERIFIED_FORWARD_EDGE")
    .sort((left, right) => latestDecisionAt(right[1]) - latestDecisionAt(left[1]));
  const priorChampion = options.championMetrics || (candidates[0]
    ? { fingerprint: candidates[0][0], ...metricsFromStrategy(candidates[0][1]) }
    : null);
  const challengerMetrics = metricsFromStrategy(current);
  if (!priorChampion) {
    return {
      state: "NO_VERIFIED_CHAMPION_BASELINE",
      champion: null,
      challenger: { fingerprint: currentFingerprint, ...challengerMetrics },
      automaticPromotion: false,
      rollbackRequired: false,
    };
  }
  return {
    champion: priorChampion,
    challenger: { fingerprint: currentFingerprint, ...challengerMetrics },
    ...compareChampionChallenger(priorChampion, challengerMetrics, {
      minimumSamples: Number(options.minimumSamples || 200),
      minimumReturnImprovementPct: Number(options.minimumReturnImprovementPct || 3),
      minimumHitRateImprovement: Number(options.minimumHitRateImprovement || 0.03),
      maximumCatastrophicDelta: Number(options.maximumCatastrophicDelta || 0.02),
      rollbackCatastrophicDelta: Number(options.rollbackCatastrophicDelta || 0.05),
      canaryPassed: options.canaryPassed === true,
    }),
  };
}

export function buildFrozenBenchmarkComparison(certificate = {}) {
  const pairs = certificate.current?.pairs || [];
  const randomEdges = [];
  const momentumEdges = [];
  for (const pair of pairs) {
    const controls = pair.controls || [];
    if (!controls.length) continue;
    const randomControl = [...controls].sort((left, right) =>
      stableHash(`${pair.pairId}|${left.episode?.routeKey}`).localeCompare(
        stableHash(`${pair.pairId}|${right.episode?.routeKey}`)
      )
    )[0];
    const momentumControl = [...controls].sort((left, right) =>
      (finite(right.episode?.frozenFeatures?.priceChange24hPct) ?? -Infinity) -
      (finite(left.episode?.frozenFeatures?.priceChange24hPct) ?? -Infinity)
    )[0];
    if (randomControl?.outcome) randomEdges.push(pair.treatmentNetReturnPct - randomControl.outcome.netReturnPct);
    if (momentumControl?.outcome) momentumEdges.push(pair.treatmentNetReturnPct - momentumControl.outcome.netReturnPct);
  }
  return {
    matchedEligibleUnselected: {
      state: pairs.length ? "AVAILABLE" : "INSUFFICIENT_FROZEN_PAIRS",
      samples: pairs.length,
      averageNetReturnEdgePct: certificate.current?.performance?.averageNetReturnEdgePct?.estimate ?? null,
      conservativeLowerBoundPct: certificate.current?.performance?.averageNetReturnEdgePct?.lower ?? null,
    },
    deterministicRandomEligibleControl: {
      state: randomEdges.length ? "AVAILABLE" : "INSUFFICIENT_FROZEN_CONTROLS",
      samples: randomEdges.length,
      averageNetReturnEdgePct: mean(randomEdges),
      definition: "One deterministically selected member of each pre-outcome frozen eligible control pool.",
    },
    frozenMomentumControl: {
      state: momentumEdges.length ? "AVAILABLE" : "INSUFFICIENT_FROZEN_CONTROLS",
      samples: momentumEdges.length,
      averageNetReturnEdgePct: mean(momentumEdges),
      definition: "Highest frozen 24-hour momentum member of each pre-outcome eligible control pool.",
    },
    marketIndex: {
      state: "EXACT_HORIZON_INDEX_PRICE_SERIES_NOT_AVAILABLE",
      samples: 0,
      averageNetReturnEdgePct: null,
      fabricatedFallbackAllowed: false,
    },
  };
}

export function evaluateCli15PromotionGate(inputs = {}, options = {}) {
  const policy = { ...CLI15_DEFAULT_POLICY, ...(options.policy || {}) };
  const contractAudit = inputs.contractAudit || {};
  const certificate = inputs.certificate || {};
  const primary = inputs.primaryHorizon || {};
  const canary = inputs.canary || {};
  const sources = inputs.sourceReadiness || {};
  const challenger = inputs.championChallenger || {};
  const decay = inputs.edgeDecay || {};
  const horizonReports = Object.values(inputs.horizons || {});

  const integrityStops = [];
  if (contractAudit.currentContracts > 0 && contractAudit.pass !== true) integrityStops.push("CLI15_PREDICTION_CONTRACT_INTEGRITY_FAILURE");
  if (certificate.inputAudit?.currentStrategyLedgerIntegrityPass === false) integrityStops.push("FORWARD_EVIDENCE_LEDGER_INTEGRITY_FAILURE");

  const safetyStops = [];
  if (certificate.current?.interimSafety?.pass === false) safetyStops.push("INTERIM_FORWARD_EDGE_REVOCATION");
  if (certificate.current?.gates?.enoughData === true && ["NO_VERIFIED_EDGE", "UNVERIFIED_EVIDENCE_QUALITY_GATES"].includes(certificate.edgeState)) {
    safetyStops.push("MATURE_FORWARD_EDGE_FAILED");
  }
  if (decay.state === "DECAYING") safetyStops.push("EDGE_DECAY_KILL_SWITCH");
  if (horizonReports.some((row) => row.state === "HORIZON_SAFETY_STOP")) safetyStops.push("MULTI_HORIZON_SAFETY_STOP");
  if (String(canary.state || "").endsWith("_STOP")) safetyStops.push(canary.state);
  if (challenger.rollbackRequired === true) safetyStops.push("CHALLENGER_CATASTROPHIC_LOSS_ROLLBACK");

  const blockers = [];
  if (!contractAudit.currentContracts) blockers.push("NO_CLI15_FROZEN_PREDICTIONS");
  else if (contractAudit.pass !== true) blockers.push("PREDICTION_CONTRACT_GATE_FAILED");
  if (policy.requireVerifiedForwardCertificate && certificate.edgeState !== "VERIFIED_FORWARD_EDGE") blockers.push("FORWARD_EDGE_CERTIFICATE_NOT_VERIFIED");
  if (primary.calibration?.state !== "CALIBRATED") blockers.push("PRIMARY_PROBABILITY_CALIBRATION_NOT_VERIFIED");
  if (policy.requireExecutablePaperCanary && canary.state !== "PAPER_CANARY_EDGE_SUPPORTED") blockers.push("EXECUTABLE_PAPER_CANARY_NOT_PASSED");
  if (policy.requireLiveSourceHealth && sources.liveReady !== true) blockers.push("LIVE_DATA_SOURCE_HEALTH_NOT_VERIFIED");
  if (policy.requireVerifiedChampionBaseline && challenger.state !== "CHAMPION_ELIGIBLE") blockers.push("CHAMPION_CHALLENGER_PROMOTION_GATE_NOT_PASSED");

  const allBlockers = [...new Set([...integrityStops, ...safetyStops, ...blockers])];
  const state = safetyStops.length
    ? "CLI15_EDGE_DEGRADED"
    : integrityStops.length
      ? "CLI15_INTEGRITY_BLOCKED"
      : allBlockers.length
        ? "CLI15_COLLECTING_FORWARD_EVIDENCE"
        : "CLI15_HUMAN_PROMOTION_REVIEW_ELIGIBLE";
  return {
    state,
    edgeVerdict: safetyStops.length ? "DEGRADED" : allBlockers.length ? "UNPROVEN" : "PROVEN",
    integrityStops,
    safetyStops,
    blockers: allBlockers,
    killSwitch: {
      armed: true,
      triggered: integrityStops.length > 0 || safetyStops.length > 0,
      reasons: [...integrityStops, ...safetyStops],
      blocksNewSelectionInfluence: true,
      blocksRealMoneyExecution: true,
    },
    rollback: {
      required: integrityStops.length > 0 || safetyStops.length > 0,
      target: inputs.championChallenger?.champion?.fingerprint || "LAST_VERIFIED_CHAMPION",
      automaticShadowSelectionRollback: true,
      realMoneyAction: false,
    },
    promotion: {
      eligibleForHumanReview: state === "CLI15_HUMAN_PROMOTION_REVIEW_ELIGIBLE",
      automaticPromotion: false,
      humanApprovalRequired: true,
      realMoneyTradingAuthorized: false,
    },
    policyHash: stableHash(policy),
    policy,
  };
}

export function buildForwardAlphaValidationOS(inputs = {}, options = {}) {
  const asOf = options.asOf || options.now || new Date().toISOString();
  const policy = { ...CLI15_DEFAULT_POLICY, ...(options.policy || {}) };
  const episodes = Array.isArray(inputs.episodes) ? inputs.episodes : [];
  const observations = safeObservations(
    inputs.observations || [],
    asOf,
    options.requireObservationLedgerIntegrity !== false,
  );
  const certificate = inputs.certificate || gradeIntegrityScopedProspectiveEdgeCohorts(episodes, inputs.observations || [], {
    asOf,
    requireObservationLedgerIntegrity: options.requireObservationLedgerIntegrity !== false,
  });
  const contractAudit = auditForwardPredictionContracts(episodes, {
    asOf,
    minimumContractIntegrityRate: policy.minimumContractIntegrityRate,
  });
  const currentEpisodes = contractAudit.latestStrategyFingerprint
    ? episodes.filter((row) => row.strategyFingerprint === contractAudit.latestStrategyFingerprint)
    : [];
  const horizons = Object.fromEntries(policy.horizonsHours.map((horizonHours) => [
    String(horizonHours),
    evaluateForwardHorizon(currentEpisodes, observations, {
      asOf,
      horizonHours,
      precisionAtK: policy.precisionAtK,
      minimumPrimaryCalibrationSamples: policy.minimumPrimaryCalibrationSamples,
      maximumPrimaryCalibrationError: policy.maximumPrimaryCalibrationError,
      maximumCatastrophicLossDelta: policy.maximumCatastrophicLossDelta,
    }),
  ]));
  const primary = horizons[String(policy.primaryHorizonHours)] || {};
  const edgeDecay = evaluateEdgeDecay(
    (primary.outcomes || []).map((row) => ({
      ...row,
      generatedAt: row.outcomeObservedAt,
    })),
    { now: asOf, minimumRecentSamples: 30, minimumPriorSamples: 60 },
  );
  const canary = inputs.canary || { state: "PAPER_CANARY_NOT_AVAILABLE", metrics: {} };
  const championChallenger = evaluateChampionChallengerGovernance(certificate, {
    championMetrics: inputs.championMetrics || null,
    canaryPassed: canary.state === "PAPER_CANARY_EDGE_SUPPORTED",
  });
  const benchmarkComparison = buildFrozenBenchmarkComparison(certificate);
  const promotionGate = evaluateCli15PromotionGate({
    contractAudit,
    certificate,
    primaryHorizon: primary,
    canary,
    sourceReadiness: inputs.sourceReadiness || {},
    championChallenger,
    edgeDecay,
    horizons,
  }, { policy });
  return {
    schemaVersion: 1,
    cliVersion: "15.0",
    systemVersion: CLI15_VERSION,
    generatedAt: new Date(timestamp(asOf)).toISOString(),
    state: promotionGate.state,
    edgeVerdict: promotionGate.edgeVerdict,
    predictionContracts: contractAudit,
    forwardCertificate: certificate,
    multiHorizon: horizons,
    primaryCalibration: primary.calibration || null,
    edgeDecay,
    benchmarkComparison,
    segments: segmentForwardPerformance(currentEpisodes, primary),
    championChallenger,
    executableCanary: canary,
    dataSourceReadiness: inputs.sourceReadiness || { state: "SOURCE_READINESS_REPORT_NOT_AVAILABLE", liveReady: false },
    promotionGate,
    proofQuestion: "Using only information available at decision time, did the strategy outperform frozen eligible alternatives after execution costs?",
    proofAnswer: promotionGate.edgeVerdict,
    policy: {
      immutablePredictions: true,
      multiHorizonMaturation: true,
      exactIdentityRequired: true,
      temporalLeakageFailClosed: true,
      frozenMatchedControlsRequired: true,
      executionCostsRequired: true,
      calibrationRequired: true,
      championChallengerRequired: true,
      executablePaperCanaryRequired: true,
      automaticShadowRollbackOnSafetyFailure: true,
      automaticTrading: false,
      automaticPromotion: false,
    },
  };
}

export const __forwardAlphaValidationHooks = {
  toleranceHours,
  routeCompatible,
  observationAt,
  safeObservations,
  predictionContractFailures,
  pathExcursions,
  horizonCalibration,
  precisionAtK,
  pairHorizonOutcomes,
  metricsFromStrategy,
};
