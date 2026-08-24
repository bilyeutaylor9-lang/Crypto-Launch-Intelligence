import fs from "node:fs";
import path from "node:path";

import {
  finite,
  stableHash,
  strictIdentity,
  timestamp,
} from "./productionMath.js";

const FILE = path.resolve("data", "prospective-edge-cohorts.jsonl");
const DEFAULT_MAX_BYTES = 128 * 1024 * 1024;
const DEFAULT_LIMIT = 250_000;

export const PROSPECTIVE_EDGE_STRATEGY_VERSION = "PRODUCTION_SHADOW_SELECTION_V2";
export const PROSPECTIVE_EDGE_HORIZONS_HOURS = Object.freeze([24, 168]);
export const PROSPECTIVE_EDGE_CERTIFICATE_GOVERNANCE = Object.freeze({
  primaryHorizonHours: 24,
  maximumOutcomeToleranceHours: 8,
  targetReturnPct: 25,
  catastrophicReturnPct: -50,
  minimumAppliedRoundTripCostBps: 100,
  minimumConservativeMissingCostBps: 200,
  minimumResolvedPairs: 250,
  minimumUniqueProjects: 80,
  minimumCohorts: 30,
  minimumReplicationWindowDays: 14,
  minimumReplicationWindows: 3,
  minimumPairsPerReplicationWindow: 10,
  minimumPairCaptureRate: 0.95,
  minimumEpisodeCaptureRate: 0.95,
  minimumExplicitExecutionCostCoverage: 0.80,
  minimumComparableFeatures: 5,
  maximumP90MatchDistance: 1.25,
  minimumReturnEdgePct: 3,
  minimumHitRateEdge: 0.03,
  maximumCatastropheDelta: 0.02,
  minimumBootstrapIterations: 2000,
  bootstrapSeed: 81073,
  initialAnalysisCheckpointPairs: 250,
  analysisCheckpointMultiplier: 2,
  sequentialFamilyWiseAlpha: 0.05,
});

function iso(value) {
  const parsed = timestamp(value);
  return parsed === null ? null : new Date(parsed).toISOString();
}

function readTail(file = FILE, maxBytes = DEFAULT_MAX_BYTES) {
  if (!fs.existsSync(file)) return [];
  const stat = fs.statSync(file);
  const bytes = Math.min(stat.size, Math.max(1024, Number(maxBytes) || DEFAULT_MAX_BYTES));
  const start = Math.max(0, stat.size - bytes);
  const buffer = Buffer.alloc(bytes);
  const descriptor = fs.openSync(file, "r");
  try {
    fs.readSync(descriptor, buffer, 0, bytes, start);
  } finally {
    fs.closeSync(descriptor);
  }
  const lines = buffer.toString("utf8").split("\n");
  if (start > 0) lines.shift();
  return lines.filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; }
    catch {
      return [{
        __prospectiveLedgerParseFailure: true,
        malformedLineHash: stableHash(line),
      }];
    }
  });
}

function firstFinite(...values) {
  for (const value of values) {
    const parsed = finite(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function executionCostBps(row = {}) {
  const explicit = firstFinite(
    row.roundTripExecutionCostBps,
    row.frozenRoundTripExecutionCostBps,
    row.executionAwareEV?.roundTripExecutionCostBps,
    row.executionAwareEV?.estimatedRoundTripCostBps,
    row.executionCosts?.roundTripBps,
  );
  if (explicit !== null && explicit >= 0) return explicit;

  const buyImpactPct = firstFinite(
    row.buyPriceImpactPct,
    row.executionAwareEV?.buyPriceImpactPct,
  );
  const sellImpactPct = firstFinite(
    row.sellPriceImpactPct,
    row.executionAwareEV?.sellPriceImpactPct,
  );
  if (buyImpactPct !== null && sellImpactPct !== null) {
    return Math.max(0, (buyImpactPct + sellImpactPct) * 100);
  }
  return null;
}

function frozenFeatures(row = {}, asOf = null) {
  const asOfMs = timestamp(asOf);
  const launchedMs = timestamp(row.pairCreatedAt || row.poolCreatedAt || row.launchedAt);
  return {
    liquidityUsd: firstFinite(row.liquidityUsd, row.activeLiquidityUsd, row.marketData?.liquidityUsd),
    marketCapUsd: firstFinite(row.marketCapUsd, row.marketCap, row.circulatingMarketCapUsd, row.marketData?.marketCap),
    volume24hUsd: firstFinite(row.volume24hUsd, row.volume24h, row.dexVolume24hUsd, row.marketData?.volume24h),
    evidenceCoveragePct: firstFinite(row.evidenceCoveragePct, row.evidenceCoverageScore, row.dataConfidence),
    riskScore: firstFinite(row.riskScore, row.riskScorePct, row.trapRiskScore),
    priceChange24hPct: firstFinite(row.priceChange24hPct, row.priceChange?.h24),
    ageHours: firstFinite(
      row.ageHours,
      row.tokenAgeHours,
      asOfMs !== null && launchedMs !== null && launchedMs <= asOfMs
        ? (asOfMs - launchedMs) / 3_600_000
        : null,
    ),
    narrative: row.narrative || row.primaryNarrative || row.category || null,
    sector: row.sector || row.projectSector || null,
    portfolioResearchScore: firstFinite(row.portfolioResearchScore, row.combinedResearchScore, row.governor?.alphaOSScore),
    captureableExpectedValuePct: firstFinite(row.captureableExpectedValuePct, row.executionAwareEV?.captureableExpectedValuePct),
    lateChaseProbabilityPct: firstFinite(row.lateChaseProbabilityPct, row.opportunityHalfLife?.lateChaseProbabilityPct),
    globalMarketRegimeState: row.globalMarketRegimeState || row.marketRegime || row.regimeState || null,
  };
}

function logDistance(left, right) {
  if (left === null || right === null || left < 0 || right < 0) return null;
  return Math.abs(Math.log1p(left) - Math.log1p(right));
}

function linearDistance(left, right, scale = 100) {
  if (left === null || right === null) return null;
  return Math.abs(left - right) / Math.max(1, scale);
}

export function prospectiveControlDistance(treatment = {}, control = {}, options = {}) {
  const left = frozenFeatures(treatment, options.asOf);
  const right = frozenFeatures(control, options.asOf);
  const fields = [
    [logDistance(left.marketCapUsd, right.marketCapUsd), 1.5],
    [logDistance(left.liquidityUsd, right.liquidityUsd), 1.5],
    [logDistance(left.volume24hUsd, right.volume24hUsd), 1.0],
    [linearDistance(left.evidenceCoveragePct, right.evidenceCoveragePct), 0.5],
    [linearDistance(left.riskScore, right.riskScore), 0.5],
    [linearDistance(left.priceChange24hPct, right.priceChange24hPct, 50), 0.75],
    [logDistance(left.ageHours, right.ageHours), 1.0],
    [left.narrative && right.narrative ? (String(left.narrative).toLowerCase() === String(right.narrative).toLowerCase() ? 0 : 1) : null, 0.75],
    [left.sector && right.sector ? (String(left.sector).toLowerCase() === String(right.sector).toLowerCase() ? 0 : 0.5) : null, 0.25],
  ];
  let weighted = 0;
  let usedWeight = 0;
  let comparableFeatures = 0;
  for (const [distance, weight] of fields) {
    if (distance === null) continue;
    weighted += distance * weight;
    usedWeight += weight;
    comparableFeatures += 1;
  }
  if (!usedWeight) return { distance: Infinity, comparableFeatures: 0 };
  return {
    distance: Number((weighted / usedWeight).toFixed(8)),
    comparableFeatures,
  };
}

export function buildProspectiveStrategyFingerprint(options = {}) {
  const policy = options.evaluationPolicy || {};
  const governance = PROSPECTIVE_EDGE_CERTIFICATE_GOVERNANCE;
  const definition = {
    strategyVersion: options.strategyVersion || PROSPECTIVE_EDGE_STRATEGY_VERSION,
    codeCommitSha: String(
      options.codeCommitSha ||
      process.env.GITHUB_SHA ||
      process.env.EDGE_CODE_VERSION ||
      ""
    ).trim() || null,
    modelVersion: options.modelVersion || "shadow-v1",
    featureSchemaVersion: options.featureSchemaVersion || "production-feature-v1",
    configFingerprint: options.configFingerprint || null,
    selectionEngine: "PRODUCTION_SHADOW_DIVERSIFIED_RESEARCH_BUDGET_V2",
    controlPoolDefinition: options.controlPoolDefinition || "SAME_SCORING_PIPELINE_UNSELECTED_V1",
    candidateSourceTimestampPolicy: options.requireRowSourceObservedAt === true
      ? "EXPLICIT_PER_CANDIDATE_SOURCE_TIMESTAMP_REQUIRED_V1"
      : "COHORT_SOURCE_TIMESTAMP_FALLBACK_V1",
    maximumSelections: Math.max(1, Number(options.maximumSelections || 25)),
    controlsPerTreatment: Math.max(1, Number(options.maxControls || 3)),
    minimumComparableFeatures: Math.max(
      governance.minimumComparableFeatures,
      Number(options.minimumComparableFeatures || governance.minimumComparableFeatures),
    ),
    maximumControlDistance: Number(options.maximumControlDistance || 1.5),
    treatmentCooldownHours: Math.max(1, Number(options.treatmentCooldownHours || 168)),
    maximumSourceAgeMinutes: Math.max(1, Number(options.maximumSourceAgeMinutes || 90)),
    outcomeHorizonsHours: options.outcomeHorizonsHours || PROSPECTIVE_EDGE_HORIZONS_HOURS,
    evaluationPolicy: {
      version: "PROSPECTIVE_EDGE_CERTIFICATE_V1",
      primaryHorizonHours: governance.primaryHorizonHours,
      outcomeToleranceHours: Math.min(
        governance.maximumOutcomeToleranceHours,
        Math.max(1, firstFinite(policy.outcomeToleranceHours, options.outcomeToleranceHours) ?? governance.maximumOutcomeToleranceHours),
      ),
      targetReturnPct: governance.targetReturnPct,
      catastrophicReturnPct: governance.catastrophicReturnPct,
      conservativeMissingCostBps: Math.max(
        governance.minimumConservativeMissingCostBps,
        firstFinite(policy.conservativeMissingCostBps, options.conservativeMissingCostBps) ?? governance.minimumConservativeMissingCostBps,
      ),
      minimumAppliedRoundTripCostBps: governance.minimumAppliedRoundTripCostBps,
      minimumResolvedPairs: Math.max(governance.minimumResolvedPairs, firstFinite(policy.minimumResolvedPairs, options.minimumResolvedPairs) ?? governance.minimumResolvedPairs),
      minimumUniqueProjects: Math.max(governance.minimumUniqueProjects, firstFinite(policy.minimumUniqueProjects, options.minimumUniqueProjects) ?? governance.minimumUniqueProjects),
      minimumCohorts: Math.max(governance.minimumCohorts, firstFinite(policy.minimumCohorts, options.minimumCohorts) ?? governance.minimumCohorts),
      replicationWindowDays: Math.max(governance.minimumReplicationWindowDays, firstFinite(policy.replicationWindowDays, options.replicationWindowDays) ?? governance.minimumReplicationWindowDays),
      minimumReplicationWindows: Math.max(governance.minimumReplicationWindows, firstFinite(policy.minimumReplicationWindows, options.minimumReplicationWindows) ?? governance.minimumReplicationWindows),
      minimumPairsPerReplicationWindow: Math.max(governance.minimumPairsPerReplicationWindow, firstFinite(policy.minimumPairsPerReplicationWindow, options.minimumPairsPerReplicationWindow) ?? governance.minimumPairsPerReplicationWindow),
      minimumPairCaptureRate: Math.max(governance.minimumPairCaptureRate, firstFinite(policy.minimumPairCaptureRate, options.minimumPairCaptureRate) ?? governance.minimumPairCaptureRate),
      minimumEpisodeCaptureRate: Math.max(governance.minimumEpisodeCaptureRate, firstFinite(policy.minimumEpisodeCaptureRate, options.minimumEpisodeCaptureRate) ?? governance.minimumEpisodeCaptureRate),
      minimumExplicitExecutionCostCoverage: Math.max(governance.minimumExplicitExecutionCostCoverage, firstFinite(policy.minimumExplicitExecutionCostCoverage, options.minimumExplicitExecutionCostCoverage) ?? governance.minimumExplicitExecutionCostCoverage),
      maximumP90MatchDistance: Math.min(governance.maximumP90MatchDistance, firstFinite(policy.maximumP90MatchDistance, options.maximumP90MatchDistance) ?? governance.maximumP90MatchDistance),
      minimumReturnEdgePct: Math.max(governance.minimumReturnEdgePct, firstFinite(policy.minimumReturnEdgePct, options.minimumReturnEdgePct) ?? governance.minimumReturnEdgePct),
      minimumHitRateEdge: Math.max(governance.minimumHitRateEdge, firstFinite(policy.minimumHitRateEdge, options.minimumHitRateEdge) ?? governance.minimumHitRateEdge),
      maximumCatastropheDelta: Math.min(governance.maximumCatastropheDelta, firstFinite(policy.maximumCatastropheDelta, options.maximumCatastropheDelta) ?? governance.maximumCatastropheDelta),
      bootstrapIterations: Math.max(governance.minimumBootstrapIterations, firstFinite(policy.bootstrapIterations, options.bootstrapIterations) ?? governance.minimumBootstrapIterations),
      bootstrapSeed: governance.bootstrapSeed,
      confidenceLevel: 0.95,
      uncertaintyMethod: "CONSERVATIVE_IDENTITY_AND_TIME_COHORT_BOOTSTRAP_ENVELOPE_V1",
      sequentialInferencePolicy: "PREDECLARED_DOUBLING_SAMPLE_CHECKPOINTS_WITH_ALPHA_SPENDING_V1",
      initialAnalysisCheckpointPairs: governance.initialAnalysisCheckpointPairs,
      analysisCheckpointMultiplier: governance.analysisCheckpointMultiplier,
      sequentialFamilyWiseAlpha: governance.sequentialFamilyWiseAlpha,
    },
  };
  return {
    definition,
    fingerprint: stableHash(definition),
  };
}

export function prospectiveEpisodeIntegrityHash(episode = {}) {
  const { freezeIntegrityHash: _ignored, ...payload } = episode;
  return stableHash(payload);
}

export function sealProspectiveEdgeEpisode(episode = {}) {
  const { freezeIntegrityHash: _ignored, ...payload } = episode;
  return {
    ...payload,
    freezeIntegrityHash: stableHash(payload),
  };
}

export function evaluateProspectiveSourceFreshness(sourceObservedAtValue, decisionAtValue, options = {}) {
  const decisionAt = iso(decisionAtValue);
  const sourceObservedAt = iso(sourceObservedAtValue);
  const decisionMs = timestamp(decisionAt);
  const sourceMs = timestamp(sourceObservedAt);
  const maximumSourceAgeMinutes = Math.max(1, Number(options.maximumSourceAgeMinutes || 90));
  if (decisionMs === null || sourceMs === null) {
    return { state: "MISSING_POINT_IN_TIME_SOURCE", eligible: false, decisionAt, sourceObservedAt, sourceAgeMinutes: null, maximumSourceAgeMinutes };
  }
  if (sourceMs > decisionMs) {
    return { state: "FUTURE_POINT_IN_TIME_SOURCE", eligible: false, decisionAt, sourceObservedAt, sourceAgeMinutes: null, maximumSourceAgeMinutes };
  }
  const sourceAgeMinutes = Number(((decisionMs - sourceMs) / 60_000).toFixed(4));
  if (sourceAgeMinutes > maximumSourceAgeMinutes) {
    return { state: "STALE_POINT_IN_TIME_SOURCE", eligible: false, decisionAt, sourceObservedAt, sourceAgeMinutes, maximumSourceAgeMinutes };
  }
  return { state: "FRESH_POINT_IN_TIME_SOURCE", eligible: true, decisionAt, sourceObservedAt, sourceAgeMinutes, maximumSourceAgeMinutes };
}

function episodeRecord(row, context, role, parentTreatmentEpisodeId = null, match = null) {
  const identity = strictIdentity(row);
  const signalPriceUsd = firstFinite(row.priceUsd, row.price, row.marketData?.priceUsd);
  if (!identity || signalPriceUsd === null || signalPriceUsd <= 0) return null;
  const sourceFreshness = evaluateProspectiveSourceFreshness(
    row.sourceObservedAt || row.marketObservedAt || context.sourceObservedAt,
    context.decisionAt,
    { maximumSourceAgeMinutes: context.strategy.definition.maximumSourceAgeMinutes },
  );
  if (!sourceFreshness.eligible) return null;
  const episodeId = stableHash([
    "PROSPECTIVE_EDGE_COHORT_MEMBER_V1",
    context.cohortId,
    role,
    identity.routeKey,
    parentTreatmentEpisodeId || "ROOT",
  ].join("|")).slice(0, 40);

  return sealProspectiveEdgeEpisode({
    schemaVersion: 1,
    experimentDesign: "FROZEN_PROSPECTIVE_MATCHED_COHORT_V1",
    cohortId: context.cohortId,
    episodeId,
    role,
    parentTreatmentEpisodeId,
    decisionAt: context.decisionAt,
    sourceObservedAt: sourceFreshness.sourceObservedAt,
    sourceAgeMinutesAtDecision: sourceFreshness.sourceAgeMinutes,
    strategyVersion: context.strategy.definition.strategyVersion,
    strategyFingerprint: context.strategy.fingerprint,
    strategyDefinition: context.strategy.definition,
    runId: context.runId,
    codeCommitSha: context.codeCommitSha,
    chain: identity.chain,
    tokenAddress: identity.tokenAddress,
    poolAddress: identity.poolAddress,
    identityKey: identity.identityKey,
    routeKey: identity.routeKey,
    symbol: row.symbol || null,
    name: row.name || null,
    selectionRank: role === "TREATMENT" ? context.selectionRank : null,
    matchDistance: match?.distance ?? null,
    comparableMatchFeatures: match?.comparableFeatures ?? null,
    signalPriceUsd,
    frozenRoundTripExecutionCostBps: executionCostBps(row),
    frozenExecutionReferenceSizeUsd: firstFinite(
      row.executionReferenceSizeUsd,
      row.executionAwareEV?.referenceSizeUsd,
      row.executionCosts?.referenceSizeUsd,
      row.tradeSizeUsd,
    ),
    frozenExecutionCostProvenance: row.executionCostProvenance ||
      row.executionReality?.provenance ||
      row.executionCostEvidence?.provenance ||
      row.executionCosts?.provenance ||
      null,
    frozenFeatures: frozenFeatures(row, sourceFreshness.sourceObservedAt),
    outcomeHorizonsHours: [...context.strategy.definition.outcomeHorizonsHours],
    exactIdentityVerified: true,
    controlsFrozenBeforeOutcomes: true,
    outcomeKnownAtFreeze: false,
    shadowOnly: true,
    productionInfluence: false,
    automaticTrading: false,
    automaticPromotion: false,
  });
}

function latestTreatmentTimes(episodes = [], strategyFingerprint) {
  const latest = new Map();
  for (const row of episodes) {
    if (row.role !== "TREATMENT" || row.strategyFingerprint !== strategyFingerprint) continue;
    const at = timestamp(row.decisionAt);
    if (at === null) continue;
    latest.set(row.identityKey, Math.max(at, latest.get(row.identityKey) || 0));
  }
  return latest;
}

export function freezeProspectiveEdgeCohort(selections = [], universeRows = [], options = {}) {
  const freshness = evaluateProspectiveSourceFreshness(
    options.sourceObservedAt,
    options.now || new Date().toISOString(),
    options,
  );
  const { decisionAt, sourceObservedAt } = freshness;
  const decisionMs = timestamp(decisionAt);
  const maximumSourceAgeMinutes = freshness.maximumSourceAgeMinutes;
  const strategy = buildProspectiveStrategyFingerprint(options);
  const baseAudit = {
    selectionsAttempted: Array.isArray(selections) ? selections.length : 0,
    universeAttempted: Array.isArray(universeRows) ? universeRows.length : 0,
    sourceObservedAt,
    decisionAt,
    maximumSourceAgeMinutes,
    strategyFingerprint: strategy.fingerprint,
  };

  if (freshness.state === "MISSING_POINT_IN_TIME_SOURCE") {
    return { state: "COHORT_REJECTED_MISSING_POINT_IN_TIME_SOURCE", episodes: [], audit: baseAudit, strategy };
  }
  if (freshness.state === "FUTURE_POINT_IN_TIME_SOURCE") {
    return { state: "COHORT_REJECTED_FUTURE_SOURCE", episodes: [], audit: { ...baseAudit, sourceAgeMinutes: null }, strategy };
  }
  const sourceAgeMinutes = freshness.sourceAgeMinutes;
  if (freshness.state === "STALE_POINT_IN_TIME_SOURCE") {
    return { state: "COHORT_REJECTED_STALE_SOURCE", episodes: [], audit: { ...baseAudit, sourceAgeMinutes }, strategy };
  }
  if (!strategy.definition.codeCommitSha) {
    return {
      state: "COHORT_REJECTED_UNVERSIONED_STRATEGY",
      episodes: [],
      audit: { ...baseAudit, sourceAgeMinutes },
      strategy,
    };
  }

  const requireRowSourceObservedAt = options.requireRowSourceObservedAt === true;
  const candidateFreshness = (row) => {
    const rowSource = row?.sourceObservedAt || row?.marketObservedAt || null;
    if (requireRowSourceObservedAt && !iso(rowSource)) return false;
    return evaluateProspectiveSourceFreshness(
      rowSource || sourceObservedAt,
      decisionAt,
      { maximumSourceAgeMinutes },
    ).eligible;
  };

  const seenSelectionIdentities = new Set();
  const attemptedExactSelections = (Array.isArray(selections) ? selections : [])
    .filter((row) => strictIdentity(row) && firstFinite(row.priceUsd, row.price, row.marketData?.priceUsd) > 0);
  const exactSelections = (Array.isArray(selections) ? selections : [])
    .filter((row) => {
      const identity = strictIdentity(row);
      if (
        !identity ||
        seenSelectionIdentities.has(identity.identityKey) ||
        !(firstFinite(row.priceUsd, row.price, row.marketData?.priceUsd) > 0) ||
        !candidateFreshness(row)
      ) return false;
      seenSelectionIdentities.add(identity.identityKey);
      return true;
    })
    .slice(0, strategy.definition.maximumSelections);
  const selectedIdentityKeys = new Set(exactSelections.map((row) => strictIdentity(row).identityKey));
  const universe = (Array.isArray(universeRows) ? universeRows : [])
    .filter((row) => {
      const identity = strictIdentity(row);
      return identity &&
        !selectedIdentityKeys.has(identity.identityKey) &&
        firstFinite(row.priceUsd, row.price, row.marketData?.priceUsd) > 0 &&
        candidateFreshness(row);
    });
  const existingEpisodes = Array.isArray(options.existingEpisodes)
    ? options.existingEpisodes
    : loadProspectiveEdgeCohorts(options);
  const latestByIdentity = latestTreatmentTimes(existingEpisodes, strategy.fingerprint);
  const priorControlIdentities = new Set(
    existingEpisodes
      .filter((row) => row.strategyFingerprint === strategy.fingerprint && row.role === "CONTROL_MATCHED")
      .map((row) => strictIdentity(row)?.identityKey)
      .filter(Boolean),
  );
  const priorEpisodeIdentities = new Set(
    existingEpisodes
      .filter((row) => row.strategyFingerprint === strategy.fingerprint)
      .map((row) => strictIdentity(row)?.identityKey)
      .filter(Boolean),
  );
  const cooldownMs = strategy.definition.treatmentCooldownHours * 3_600_000;
  const runId = options.runId || `prospective-edge-${decisionMs}`;
  const cohortId = stableHash([
    "PROSPECTIVE_EDGE_COHORT_V1",
    decisionAt,
    strategy.fingerprint,
    runId,
  ].join("|")).slice(0, 40);
  const usedControlIdentities = new Set();
  const episodes = [];
  const unmatchedSelections = [];
  let cooldownSkipped = 0;
  let priorControlSelectionSkipped = 0;

  for (let index = 0; index < exactSelections.length; index += 1) {
    const treatment = exactSelections[index];
    const identity = strictIdentity(treatment);
    if (priorControlIdentities.has(identity.identityKey)) {
      priorControlSelectionSkipped += 1;
      continue;
    }
    const priorAt = latestByIdentity.get(identity.identityKey);
    if (priorAt && decisionMs - priorAt < cooldownMs) {
      cooldownSkipped += 1;
      continue;
    }

    const matches = universe
      .filter((candidate) => {
        const candidateIdentity = strictIdentity(candidate);
        return candidateIdentity.chain === identity.chain &&
          !priorEpisodeIdentities.has(candidateIdentity.identityKey) &&
          !usedControlIdentities.has(candidateIdentity.identityKey);
      })
      .map((candidate) => ({
        candidate,
        ...prospectiveControlDistance(treatment, candidate, { asOf: sourceObservedAt }),
      }))
      .filter((row) =>
        row.comparableFeatures >= strategy.definition.minimumComparableFeatures &&
        Number.isFinite(row.distance) &&
        row.distance <= strategy.definition.maximumControlDistance
      )
      .sort((left, right) =>
        left.distance - right.distance ||
        strictIdentity(left.candidate).identityKey.localeCompare(strictIdentity(right.candidate).identityKey)
      )
      .slice(0, strategy.definition.controlsPerTreatment);

    if (!matches.length) {
      unmatchedSelections.push(identity.identityKey);
      continue;
    }

    const context = {
      cohortId,
      decisionAt,
      sourceObservedAt,
      sourceAgeMinutesAtDecision: Number(sourceAgeMinutes.toFixed(4)),
      strategy,
      runId,
      codeCommitSha: strategy.definition.codeCommitSha,
      selectionRank: index + 1,
    };
    const treatmentEpisode = episodeRecord(treatment, context, "TREATMENT");
    if (!treatmentEpisode) continue;
    episodes.push(treatmentEpisode);
    latestByIdentity.set(identity.identityKey, decisionMs);

    for (const match of matches) {
      const controlIdentity = strictIdentity(match.candidate);
      const controlEpisode = episodeRecord(
        match.candidate,
        context,
        "CONTROL_MATCHED",
        treatmentEpisode.episodeId,
        match,
      );
      if (!controlEpisode) continue;
      episodes.push(controlEpisode);
      usedControlIdentities.add(controlIdentity.identityKey);
    }
  }

  const treatments = episodes.filter((row) => row.role === "TREATMENT");
  const controls = episodes.filter((row) => row.role === "CONTROL_MATCHED");
  return {
    state: treatments.length ? "PROSPECTIVE_EDGE_COHORT_FROZEN" : "NO_MATCHABLE_PROSPECTIVE_SELECTIONS",
    cohortId,
    strategy,
    episodes,
    audit: {
      ...baseAudit,
      sourceAgeMinutes: Number(sourceAgeMinutes.toFixed(4)),
      exactSelections: exactSelections.length,
      selectionsRejectedForCandidateSourceFreshness: Math.max(0, attemptedExactSelections.length - exactSelections.length),
      exactControlUniverse: universe.length,
      rowSourceTimestampRequired: requireRowSourceObservedAt,
      treatmentsFrozen: treatments.length,
      controlsFrozen: controls.length,
      cooldownSkipped,
      priorControlSelectionSkipped,
      priorStrategyIdentitiesExcludedFromControlPool: priorEpisodeIdentities.size,
      unmatchedSelections,
      outcomeFieldsReadDuringFreeze: false,
      controlsSelectedBeforeOutcomes: true,
    },
  };
}

export function loadProspectiveEdgeCohorts(options = {}) {
  return readTail(options.file || FILE, options.maxBytes)
    .slice(-Math.max(1, Number(options.limit || DEFAULT_LIMIT)));
}

export function appendProspectiveEdgeCohorts(episodes = [], options = {}) {
  const file = options.file || FILE;
  const existing = readTail(file, options.maxBytes);
  const ids = new Set(existing.map((row) => row.episodeId).filter(Boolean));
  const attempted = Array.isArray(episodes) ? episodes : [];
  const integrityEligible = attempted.filter((row) =>
    row?.episodeId &&
    row?.codeCommitSha &&
    row.freezeIntegrityHash === prospectiveEpisodeIntegrityHash(row)
  );
  const fresh = integrityEligible
    .filter((row) => row?.episodeId && !ids.has(row.episodeId));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fresh.length) {
    const descriptor = fs.openSync(file, "a");
    try {
      fs.writeSync(descriptor, `${fresh.map((row) => JSON.stringify(row)).join("\n")}\n`);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
  }
  const retentionMaxBytes = finite(options.retentionMaxBytes);
  if (
    retentionMaxBytes !== null &&
    retentionMaxBytes > 0 &&
    fs.existsSync(file) &&
    fs.statSync(file).size > retentionMaxBytes
  ) {
    const retained = readTail(file, Math.floor(retentionMaxBytes * 0.75));
    fs.writeFileSync(file, retained.map((row) => JSON.stringify(row)).join("\n") + (retained.length ? "\n" : ""));
  }
  return {
    file,
    attempted: attempted.length,
    saved: fresh.length,
    duplicates: integrityEligible.length - fresh.length,
    rejectedIntegrity: attempted.length - integrityEligible.length,
    episodes: fresh,
  };
}

export function captureProspectiveEdgeCohort(selections = [], universeRows = [], options = {}) {
  const frozen = freezeProspectiveEdgeCohort(selections, universeRows, options);
  const persistence = options.persist === false
    ? { file: options.file || FILE, attempted: frozen.episodes.length, saved: 0, duplicates: 0, rejectedIntegrity: 0, episodes: [] }
    : appendProspectiveEdgeCohorts(frozen.episodes, options);
  return { ...frozen, persistence };
}

export const PROSPECTIVE_EDGE_COHORT_FILE = FILE;
export const __prospectiveEdgeCohortHooks = {
  iso,
  readTail,
  firstFinite,
  executionCostBps,
  frozenFeatures,
  episodeRecord,
  latestTreatmentTimes,
};
