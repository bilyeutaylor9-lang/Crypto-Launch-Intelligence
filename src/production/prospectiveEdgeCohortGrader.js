import {
  finite,
  mean,
  percentile,
  seededRandom,
  stableHash,
  strictIdentity,
  timestamp,
} from "./productionMath.js";
import {
  PROSPECTIVE_EDGE_CERTIFICATE_GOVERNANCE,
  prospectiveEpisodeIntegrityHash,
} from "./prospectiveEdgeCohortLedger.js";
import { exactMarketObservationIntegrityHash } from "./exactMarketObservationLedger.js";

function routeCompatible(episode = {}, observation = {}) {
  const expected = strictIdentity(episode);
  const actual = strictIdentity(observation);
  if (!expected || !actual || expected.identityKey !== actual.identityKey) return false;
  return !expected.poolAddress || !actual.poolAddress || expected.poolAddress === actual.poolAddress;
}

function observedAt(row = {}) {
  return timestamp(row.observedAt || row.timestamp);
}

function episodeIntegrityFailures(episode = {}, asOfMs, options = {}) {
  const failures = [];
  const identity = strictIdentity(episode);
  const decisionMs = timestamp(episode.decisionAt);
  const sourceMs = timestamp(episode.sourceObservedAt);
  const price = finite(episode.signalPriceUsd);
  const maximumSourceAgeMinutes = Math.max(
    1,
    Number(
      episode.strategyDefinition?.maximumSourceAgeMinutes ||
      options.maximumSourceAgeMinutes ||
      90
    ),
  );
  if (episode.experimentDesign !== "FROZEN_PROSPECTIVE_MATCHED_COHORT_V1") failures.push("INVALID_EXPERIMENT_DESIGN");
  if (!identity || episode.exactIdentityVerified !== true) failures.push("INVALID_EXACT_IDENTITY");
  else if (episode.identityKey !== identity.identityKey || episode.routeKey !== identity.routeKey) failures.push("IDENTITY_KEY_MISMATCH");
  if (decisionMs === null || decisionMs > asOfMs) failures.push("INVALID_DECISION_TIME");
  if (sourceMs === null || decisionMs === null || sourceMs > decisionMs) failures.push("INVALID_POINT_IN_TIME_SOURCE");
  else if (decisionMs - sourceMs > maximumSourceAgeMinutes * 60_000) failures.push("STALE_POINT_IN_TIME_SOURCE");
  else if (
    finite(episode.sourceAgeMinutesAtDecision) === null ||
    Math.abs((decisionMs - sourceMs) / 60_000 - finite(episode.sourceAgeMinutesAtDecision)) > 0.01
  ) failures.push("SOURCE_AGE_AUDIT_MISMATCH");
  if (price === null || price <= 0) failures.push("INVALID_SIGNAL_PRICE");
  if (!episode.strategyFingerprint || !episode.strategyDefinition) failures.push("MISSING_STRATEGY_DEFINITION");
  else if (stableHash(episode.strategyDefinition) !== episode.strategyFingerprint) failures.push("STRATEGY_FINGERPRINT_MISMATCH");
  else if (episode.strategyVersion !== episode.strategyDefinition.strategyVersion) failures.push("STRATEGY_VERSION_MISMATCH");
  if (
    !episode.codeCommitSha ||
    episode.codeCommitSha !== episode.strategyDefinition?.codeCommitSha
  ) failures.push("MISSING_OR_MISMATCHED_CODE_VERSION");
  if (
    !episode.freezeIntegrityHash ||
    episode.freezeIntegrityHash !== prospectiveEpisodeIntegrityHash(episode)
  ) failures.push("FROZEN_EPISODE_CONTENT_HASH_MISMATCH");
  if (episode.strategyDefinition?.evaluationPolicy?.version !== "PROSPECTIVE_EDGE_CERTIFICATE_V1") {
    failures.push("MISSING_FROZEN_EVALUATION_POLICY");
  }
  if (episode.strategyDefinition?.controlPoolDefinition !== "SAME_SCORING_PIPELINE_UNSELECTED_V1") {
    failures.push("INVALID_CONTROL_POOL_DEFINITION");
  }
  if (episode.strategyDefinition?.candidateSourceTimestampPolicy !== "EXPLICIT_PER_CANDIDATE_SOURCE_TIMESTAMP_REQUIRED_V1") {
    failures.push("INVALID_CANDIDATE_SOURCE_TIMESTAMP_POLICY");
  }
  if (
    finite(episode.strategyDefinition?.minimumComparableFeatures) === null ||
    finite(episode.strategyDefinition?.minimumComparableFeatures) < PROSPECTIVE_EDGE_CERTIFICATE_GOVERNANCE.minimumComparableFeatures
  ) failures.push("INSUFFICIENT_CONTROL_MATCH_FEATURE_POLICY");
  if (!Array.isArray(episode.outcomeHorizonsHours) || !episode.outcomeHorizonsHours.includes(Number(options.horizonHours || 24))) {
    failures.push("HORIZON_NOT_PREDECLARED");
  }
  if (episode.controlsFrozenBeforeOutcomes !== true || episode.outcomeKnownAtFreeze !== false) failures.push("OUTCOME_FREEZE_INTEGRITY_FAILURE");
  if (episode.shadowOnly !== true || episode.productionInfluence !== false) failures.push("INVALID_RESEARCH_GOVERNANCE");
  if (episode.automaticTrading !== false || episode.automaticPromotion !== false) failures.push("INVALID_AUTOMATION_GOVERNANCE");
  if (episode.role === "TREATMENT") {
    if (episode.parentTreatmentEpisodeId) failures.push("TREATMENT_HAS_PARENT");
  } else if (episode.role === "CONTROL_MATCHED") {
    if (!episode.parentTreatmentEpisodeId) failures.push("CONTROL_MISSING_PARENT");
    if (finite(episode.matchDistance) === null || finite(episode.comparableMatchFeatures) === null) failures.push("CONTROL_MATCH_EVIDENCE_MISSING");
  } else {
    failures.push("INVALID_EPISODE_ROLE");
  }
  const expectedCohortId = episode.runId && decisionMs !== null && episode.strategyFingerprint
    ? stableHash([
        "PROSPECTIVE_EDGE_COHORT_V1",
        new Date(decisionMs).toISOString(),
        episode.strategyFingerprint,
        episode.runId,
      ].join("|")).slice(0, 40)
    : null;
  if (!episode.runId || episode.cohortId !== expectedCohortId) failures.push("COHORT_ID_INTEGRITY_FAILURE");
  const expectedEpisodeId = expectedCohortId && identity
    ? stableHash([
        "PROSPECTIVE_EDGE_COHORT_MEMBER_V1",
        expectedCohortId,
        episode.role,
        identity.routeKey,
        episode.parentTreatmentEpisodeId || "ROOT",
      ].join("|")).slice(0, 40)
    : null;
  if (!episode.episodeId || episode.episodeId !== expectedEpisodeId) failures.push("EPISODE_ID_INTEGRITY_FAILURE");
  return [...new Set(failures)];
}

function cohortTopologyFailures(episodes = []) {
  const failuresByEpisodeId = new Map();
  const byEpisodeId = new Map(episodes.map((row) => [row.episodeId, row]));
  const controlsByParent = new Map();
  const controlRoutesByCohort = new Map();
  const add = (episodeId, failure) => {
    failuresByEpisodeId.set(episodeId, [
      ...(failuresByEpisodeId.get(episodeId) || []),
      failure,
    ]);
  };
  for (const row of episodes) {
    if (row.role !== "CONTROL_MATCHED") continue;
    controlsByParent.set(row.parentTreatmentEpisodeId, [
      ...(controlsByParent.get(row.parentTreatmentEpisodeId) || []),
      row,
    ]);
    const parent = byEpisodeId.get(row.parentTreatmentEpisodeId);
    if (!parent || parent.role !== "TREATMENT") {
      add(row.episodeId, "CONTROL_PARENT_NOT_FOUND");
      continue;
    }
    if (parent.cohortId !== row.cohortId || parent.strategyFingerprint !== row.strategyFingerprint) {
      add(row.episodeId, "CONTROL_PARENT_COHORT_MISMATCH");
    }
    if (timestamp(parent.decisionAt) !== timestamp(row.decisionAt) || parent.sourceObservedAt !== row.sourceObservedAt) {
      add(row.episodeId, "CONTROL_PARENT_POINT_IN_TIME_MISMATCH");
    }
    if (strictIdentity(parent)?.chain !== strictIdentity(row)?.chain || parent.identityKey === row.identityKey) {
      add(row.episodeId, "CONTROL_PARENT_IDENTITY_MISMATCH");
    }
    const maximumDistance = finite(row.strategyDefinition?.maximumControlDistance);
    const minimumFeatures = finite(row.strategyDefinition?.minimumComparableFeatures);
    if (
      maximumDistance === null ||
      finite(row.matchDistance) > maximumDistance ||
      minimumFeatures === null ||
      finite(row.comparableMatchFeatures) < minimumFeatures
    ) {
      add(row.episodeId, "CONTROL_MATCH_POLICY_VIOLATION");
    }
    const cohortKey = `${row.strategyFingerprint}:${row.cohortId}`;
    const seenRoutes = controlRoutesByCohort.get(cohortKey) || new Set();
    if (seenRoutes.has(row.routeKey)) add(row.episodeId, "CONTROL_REUSED_WITHIN_COHORT");
    seenRoutes.add(row.routeKey);
    controlRoutesByCohort.set(cohortKey, seenRoutes);
  }
  for (const treatment of episodes.filter((row) => row.role === "TREATMENT")) {
    if (!(controlsByParent.get(treatment.episodeId) || []).length) {
      add(treatment.episodeId, "TREATMENT_HAS_NO_FROZEN_CONTROL");
    }
  }
  return new Map(
    [...failuresByEpisodeId.entries()].map(([episodeId, failures]) => [
      episodeId,
      [...new Set(failures)],
    ]),
  );
}

function gradingOptionsFromFrozenPolicy(episodes = [], options = {}) {
  const policy = episodes[0]?.strategyDefinition?.evaluationPolicy || null;
  if (!policy || policy.version !== "PROSPECTIVE_EDGE_CERTIFICATE_V1") {
    return { ...options, evaluationPolicyFrozenBeforeOutcomes: false };
  }
  const governance = PROSPECTIVE_EDGE_CERTIFICATE_GOVERNANCE;
  const configured = (key, fallback) => finite(policy[key]) ?? fallback;
  return {
    ...options,
    horizonHours: governance.primaryHorizonHours,
    toleranceHours: Math.min(governance.maximumOutcomeToleranceHours, Math.max(1, configured("outcomeToleranceHours", governance.maximumOutcomeToleranceHours))),
    targetReturnPct: governance.targetReturnPct,
    catastrophicReturnPct: governance.catastrophicReturnPct,
    minimumAppliedRoundTripCostBps: governance.minimumAppliedRoundTripCostBps,
    conservativeMissingCostBps: Math.max(governance.minimumConservativeMissingCostBps, configured("conservativeMissingCostBps", governance.minimumConservativeMissingCostBps)),
    minimumResolvedPairs: Math.max(governance.minimumResolvedPairs, configured("minimumResolvedPairs", governance.minimumResolvedPairs)),
    minimumUniqueProjects: Math.max(governance.minimumUniqueProjects, configured("minimumUniqueProjects", governance.minimumUniqueProjects)),
    minimumCohorts: Math.max(governance.minimumCohorts, configured("minimumCohorts", governance.minimumCohorts)),
    replicationWindowDays: Math.max(governance.minimumReplicationWindowDays, configured("replicationWindowDays", governance.minimumReplicationWindowDays)),
    minimumReplicationWindows: Math.max(governance.minimumReplicationWindows, configured("minimumReplicationWindows", governance.minimumReplicationWindows)),
    minimumPairsPerReplicationWindow: Math.max(governance.minimumPairsPerReplicationWindow, configured("minimumPairsPerReplicationWindow", governance.minimumPairsPerReplicationWindow)),
    minimumPairCaptureRate: Math.max(governance.minimumPairCaptureRate, configured("minimumPairCaptureRate", governance.minimumPairCaptureRate)),
    minimumEpisodeCaptureRate: Math.max(governance.minimumEpisodeCaptureRate, configured("minimumEpisodeCaptureRate", governance.minimumEpisodeCaptureRate)),
    minimumExplicitExecutionCostCoverage: Math.max(governance.minimumExplicitExecutionCostCoverage, configured("minimumExplicitExecutionCostCoverage", governance.minimumExplicitExecutionCostCoverage)),
    maximumP90MatchDistance: Math.min(governance.maximumP90MatchDistance, configured("maximumP90MatchDistance", governance.maximumP90MatchDistance)),
    minimumReturnEdgePct: Math.max(governance.minimumReturnEdgePct, configured("minimumReturnEdgePct", governance.minimumReturnEdgePct)),
    minimumHitRateEdge: Math.max(governance.minimumHitRateEdge, configured("minimumHitRateEdge", governance.minimumHitRateEdge)),
    maximumCatastropheDelta: Math.min(governance.maximumCatastropheDelta, configured("maximumCatastropheDelta", governance.maximumCatastropheDelta)),
    iterations: Math.max(governance.minimumBootstrapIterations, configured("bootstrapIterations", governance.minimumBootstrapIterations)),
    seed: governance.bootstrapSeed,
    initialAnalysisCheckpointPairs: governance.initialAnalysisCheckpointPairs,
    analysisCheckpointMultiplier: governance.analysisCheckpointMultiplier,
    sequentialFamilyWiseAlpha: governance.sequentialFamilyWiseAlpha,
    evaluationPolicyFrozenBeforeOutcomes: true,
    frozenEvaluationPolicy: policy,
  };
}

function resolvedCost(episode = {}, options = {}) {
  const explicit = finite(episode.frozenRoundTripExecutionCostBps);
  const referenceSizeUsd = finite(episode.frozenExecutionReferenceSizeUsd);
  const provenance = String(episode.frozenExecutionCostProvenance || "").trim();
  const minimumAppliedRoundTripCostBps = Math.max(
    PROSPECTIVE_EDGE_CERTIFICATE_GOVERNANCE.minimumAppliedRoundTripCostBps,
    Number(options.minimumAppliedRoundTripCostBps || 0),
  );
  if (explicit !== null && explicit >= 0 && referenceSizeUsd !== null && referenceSizeUsd > 0 && provenance) {
    return {
      bps: Math.max(explicit, minimumAppliedRoundTripCostBps),
      explicit: true,
      source: "FROZEN_SIZE_SPECIFIC_EXECUTION_ESTIMATE",
      referenceSizeUsd,
      provenance,
    };
  }
  return {
    bps: Math.max(0, Number(options.conservativeMissingCostBps || 200)),
    explicit: false,
    source: "CONSERVATIVE_MISSING_COST_POLICY",
    referenceSizeUsd: referenceSizeUsd !== null && referenceSizeUsd > 0 ? referenceSizeUsd : null,
    provenance: provenance || null,
  };
}

export function resolveProspectiveEpisodeOutcome(episode = {}, observations = [], options = {}) {
  const decisionMs = timestamp(episode.decisionAt);
  const asOfMs = timestamp(options.asOf || options.now || new Date().toISOString());
  const horizonHours = Number(options.horizonHours || 24);
  const toleranceHours = Number(options.toleranceHours || Math.max(1, horizonHours * 0.35));
  const startPriceUsd = finite(episode.signalPriceUsd);
  if (!strictIdentity(episode) || decisionMs === null || asOfMs === null || startPriceUsd === null || startPriceUsd <= 0) return null;
  if (decisionMs > asOfMs) return null;
  const targetMs = decisionMs + horizonHours * 3_600_000;
  const maximumMs = targetMs + toleranceHours * 3_600_000;
  if (asOfMs < targetMs) return null;

  const match = (Array.isArray(observations) ? observations : [])
    .filter((row) => {
      const at = observedAt(row);
      const price = finite(row.priceUsd);
      return routeCompatible(episode, row) &&
        at !== null &&
        at <= asOfMs &&
        at >= targetMs &&
        at <= maximumMs &&
        price !== null &&
        price > 0;
    })
    .sort((left, right) =>
      Math.abs(observedAt(left) - targetMs) - Math.abs(observedAt(right) - targetMs) ||
      observedAt(left) - observedAt(right)
    )[0];
  if (!match) return null;

  const endPriceUsd = finite(match.priceUsd);
  const grossReturnPct = ((endPriceUsd / startPriceUsd) - 1) * 100;
  const cost = resolvedCost(episode, options);
  const netReturnPct = grossReturnPct - cost.bps / 100;
  return {
    episodeId: episode.episodeId,
    cohortId: episode.cohortId,
    strategyFingerprint: episode.strategyFingerprint,
    role: episode.role,
    parentTreatmentEpisodeId: episode.parentTreatmentEpisodeId || null,
    identityKey: episode.identityKey,
    routeKey: episode.routeKey,
    chain: episode.chain,
    tokenAddress: episode.tokenAddress,
    poolAddress: episode.poolAddress || null,
    decisionAt: episode.decisionAt,
    targetAt: new Date(targetMs).toISOString(),
    outcomeObservedAt: new Date(observedAt(match)).toISOString(),
    horizonHours,
    startPriceUsd,
    endPriceUsd,
    grossReturnPct,
    roundTripExecutionCostBps: cost.bps,
    executionCostExplicit: cost.explicit,
    executionCostSource: cost.source,
    executionReferenceSizeUsd: cost.referenceSizeUsd,
    executionCostProvenance: cost.provenance,
    netReturnPct,
    hit: netReturnPct >= Number(options.targetReturnPct || 25),
    catastrophicLoss: netReturnPct <= Number(options.catastrophicReturnPct || -50),
    exactIdentityVerified: true,
    controlsFrozenBeforeOutcomes: episode.controlsFrozenBeforeOutcomes === true,
  };
}

function buildPairs(episodes = [], outcomes = []) {
  const outcomeByEpisode = new Map(outcomes.map((row) => [row.episodeId, row]));
  const controlsByParent = new Map();
  for (const episode of episodes.filter((row) => row.role === "CONTROL_MATCHED")) {
    controlsByParent.set(episode.parentTreatmentEpisodeId, [
      ...(controlsByParent.get(episode.parentTreatmentEpisodeId) || []),
      episode,
    ]);
  }

  return episodes.filter((row) => row.role === "TREATMENT").flatMap((treatment) => {
    const treatedOutcome = outcomeByEpisode.get(treatment.episodeId);
    const frozenControls = controlsByParent.get(treatment.episodeId) || [];
    const controls = frozenControls
      .map((episode) => ({ episode, outcome: outcomeByEpisode.get(episode.episodeId) }))
      .filter((row) => row.outcome);
    if (!treatedOutcome || !controls.length) return [];

    const controlNetReturns = controls.map((row) => row.outcome.netReturnPct);
    const treatmentHit = treatedOutcome.hit ? 1 : 0;
    const controlHitRate = mean(controls.map((row) => row.outcome.hit ? 1 : 0));
    const treatmentCatastrophic = treatedOutcome.catastrophicLoss ? 1 : 0;
    const controlCatastrophicRate = mean(controls.map((row) => row.outcome.catastrophicLoss ? 1 : 0));
    return [{
      pairId: treatment.episodeId,
      cohortId: treatment.cohortId,
      identityKey: treatment.identityKey,
      decisionAt: treatment.decisionAt,
      treatment,
      treatmentOutcome: treatedOutcome,
      controls,
      frozenControlCount: frozenControls.length,
      resolvedControlCount: controls.length,
      controlOutcomeComplete: controls.length === frozenControls.length,
      treatmentNetReturnPct: treatedOutcome.netReturnPct,
      controlMeanNetReturnPct: mean(controlNetReturns),
      averageNetReturnEdgePct: treatedOutcome.netReturnPct - mean(controlNetReturns),
      hitRateEdge: treatmentHit - controlHitRate,
      catastrophicLossDelta: treatmentCatastrophic - controlCatastrophicRate,
    }];
  });
}

function clusterBootstrap(pairs = [], metric, clusterKey, options = {}) {
  const estimate = mean(pairs.map((row) => finite(row[metric])).filter((value) => value !== null));
  const clusters = new Map();
  for (const pair of pairs) {
    const key = clusterKey(pair);
    if (!key) continue;
    clusters.set(key, [...(clusters.get(key) || []), pair]);
  }
  const groups = [...clusters.values()];
  if (groups.length < 2 || estimate === null) {
    return { status: "INSUFFICIENT_CLUSTERS", clusters: groups.length, estimate, lower: null, upper: null };
  }

  const iterations = Math.max(400, Number(options.iterations || 1600));
  const random = seededRandom(Number(options.seed || 81073));
  const estimates = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sampled = Array.from(
      { length: groups.length },
      () => groups[Math.floor(random() * groups.length)],
    ).flat();
    const value = mean(sampled.map((row) => finite(row[metric])).filter((entry) => entry !== null));
    if (value !== null) estimates.push(value);
  }
  estimates.sort((left, right) => left - right);
  const alpha = Math.min(0.25, Math.max(0.000001, Number(options.confidenceAlpha || 0.05)));
  return {
    status: estimates.length ? "AVAILABLE" : "UNAVAILABLE",
    method: "cluster-bootstrap",
    clusters: groups.length,
    iterations,
    estimate,
    confidenceLevel: 1 - alpha,
    lower: percentile(estimates, alpha / 2),
    upper: percentile(estimates, 1 - alpha / 2),
  };
}

function predeclaredAnalysisCheckpoint(pairs = [], options = {}) {
  const initialPairs = Math.max(
    PROSPECTIVE_EDGE_CERTIFICATE_GOVERNANCE.initialAnalysisCheckpointPairs,
    Number(options.initialAnalysisCheckpointPairs || 0),
  );
  const multiplier = Math.max(
    PROSPECTIVE_EDGE_CERTIFICATE_GOVERNANCE.analysisCheckpointMultiplier,
    Number(options.analysisCheckpointMultiplier || 0),
  );
  const ordered = [...pairs].sort((left, right) =>
    timestamp(left.decisionAt) - timestamp(right.decisionAt) ||
    String(left.pairId).localeCompare(String(right.pairId))
  );
  if (ordered.length < initialPairs) {
    return {
      state: "AWAITING_PREDECLARED_ANALYSIS_CHECKPOINT",
      initialPairs,
      multiplier,
      ordinal: 0,
      pairCount: 0,
      nextPairCount: initialPairs,
      pairs: [],
    };
  }
  let pairCount = initialPairs;
  let ordinal = 1;
  while (Math.ceil(pairCount * multiplier) <= ordered.length) {
    pairCount = Math.ceil(pairCount * multiplier);
    ordinal += 1;
  }
  return {
    state: "PREDECLARED_ANALYSIS_CHECKPOINT_AVAILABLE",
    initialPairs,
    multiplier,
    ordinal,
    pairCount,
    nextPairCount: Math.ceil(pairCount * multiplier),
    pairs: ordered.slice(0, pairCount),
  };
}

function conservativeInterval(pairs, metric, options = {}) {
  const identity = clusterBootstrap(
    pairs,
    metric,
    (row) => row.identityKey,
    { ...options, seed: Number(options.seed || 81073) + 11 },
  );
  const cohort = clusterBootstrap(
    pairs,
    metric,
    (row) => row.cohortId,
    { ...options, seed: Number(options.seed || 81073) + 29 },
  );
  const available = identity.status === "AVAILABLE" && cohort.status === "AVAILABLE";
  return {
    status: available ? "AVAILABLE" : "INSUFFICIENT_INDEPENDENT_CLUSTERS",
    method: "conservative-envelope-of-identity-and-time-cohort-bootstraps",
    estimate: identity.estimate ?? cohort.estimate,
    lower: available ? Math.min(identity.lower, cohort.lower) : null,
    upper: available ? Math.max(identity.upper, cohort.upper) : null,
    identityBootstrap: identity,
    cohortBootstrap: cohort,
  };
}

function replicationWindows(pairs = [], options = {}) {
  const windowDays = Math.max(1, Number(options.replicationWindowDays || 14));
  const windowMs = windowDays * 86_400_000;
  const byWindow = new Map();
  for (const pair of pairs) {
    const at = timestamp(pair.decisionAt);
    if (at === null) continue;
    const key = String(Math.floor(at / windowMs));
    byWindow.set(key, [...(byWindow.get(key) || []), pair]);
  }
  const minimumPairsPerWindow = Math.max(1, Number(options.minimumPairsPerReplicationWindow || 10));
  const windows = [...byWindow.entries()]
    .map(([key, rows]) => ({
      windowKey: key,
      startAt: new Date(Number(key) * windowMs).toISOString(),
      pairs: rows.length,
      uniqueProjects: new Set(rows.map((row) => row.identityKey)).size,
      averageNetReturnEdgePct: mean(rows.map((row) => row.averageNetReturnEdgePct)),
      hitRateEdge: mean(rows.map((row) => row.hitRateEdge)),
      catastrophicLossDelta: mean(rows.map((row) => row.catastrophicLossDelta)),
    }))
    .sort((left, right) => left.startAt.localeCompare(right.startAt));
  const qualified = windows.filter((row) => row.pairs >= minimumPairsPerWindow);
  const minimumReturnEdgePct = Number(options.minimumReturnEdgePct || 3);
  const minimumHitRateEdge = Number(options.minimumHitRateEdge || 0.03);
  const positive = qualified.filter((row) =>
    row.averageNetReturnEdgePct >= minimumReturnEdgePct &&
    row.hitRateEdge >= minimumHitRateEdge &&
    row.catastrophicLossDelta <= Number(options.maximumCatastropheDelta || 0.02)
  );
  const minimumWindows = Math.max(2, Number(options.minimumReplicationWindows || 3));
  return {
    windowDays,
    minimumPairsPerWindow,
    minimumWindows,
    windows,
    qualifiedWindows: qualified.length,
    positiveQualifiedWindows: positive.length,
    pass: qualified.length >= minimumWindows && positive.length === qualified.length,
  };
}

function gradeStrategy(episodes = [], observations = [], options = {}) {
  const asOf = options.asOf || options.now || new Date().toISOString();
  const asOfMs = timestamp(asOf);
  const horizonHours = Number(options.horizonHours || 24);
  const targetReturnPct = Number(options.targetReturnPct || 25);
  const toleranceHours = Number(options.toleranceHours || Math.max(1, horizonHours * 0.35));
  const outcomes = episodes
    .map((episode) => resolveProspectiveEpisodeOutcome(episode, observations, {
      ...options,
      asOf,
      horizonHours,
      targetReturnPct,
      toleranceHours,
    }))
    .filter(Boolean);
  const partiallyOrFullyResolvedPairs = buildPairs(episodes, outcomes);
  const allPairs = partiallyOrFullyResolvedPairs.filter((row) => row.controlOutcomeComplete);
  const checkpoint = predeclaredAnalysisCheckpoint(allPairs, options);
  const pairs = checkpoint.pairs;
  const strategyTrialOrdinal = Math.max(1, Number(options.strategyTrialOrdinal || 1));
  const checkpointOrdinal = Math.max(1, Number(checkpoint.ordinal || 1));
  const globalSequentialAlpha = Math.min(
    PROSPECTIVE_EDGE_CERTIFICATE_GOVERNANCE.sequentialFamilyWiseAlpha,
    Math.max(0.000001, Number(options.sequentialFamilyWiseAlpha || 0.05)),
  );
  const confidenceAlpha = globalSequentialAlpha *
    (1 / (strategyTrialOrdinal * (strategyTrialOrdinal + 1))) *
    (1 / (checkpointOrdinal * (checkpointOrdinal + 1)));
  const inferenceOptions = {
    ...options,
    confidenceAlpha,
    iterations: Math.max(
      Number(options.iterations || 0),
      Math.ceil(20 / confidenceAlpha),
    ),
  };
  const treatments = episodes.filter((row) => row.role === "TREATMENT");
  const matureEpisodes = episodes.filter((episode) => {
    const decisionMs = timestamp(episode.decisionAt);
    return decisionMs !== null && asOfMs !== null && asOfMs >= decisionMs + horizonHours * 3_600_000;
  });
  const matureTreatments = matureEpisodes.filter((row) => row.role === "TREATMENT");
  const resolvedEpisodeIds = new Set(outcomes.map((row) => row.episodeId));
  const capturedEpisodes = matureEpisodes.filter((row) => resolvedEpisodeIds.has(row.episodeId));
  const pairCaptureRate = matureTreatments.length ? allPairs.length / matureTreatments.length : null;
  const episodeCaptureRate = matureEpisodes.length ? capturedEpisodes.length / matureEpisodes.length : null;
  const resolvedControls = pairs.flatMap((pair) => pair.controls);
  const explicitCostRows = [
    ...pairs.map((pair) => pair.treatmentOutcome),
    ...resolvedControls.map((row) => row.outcome),
  ];
  const executionCostCoverage = explicitCostRows.length
    ? explicitCostRows.filter((row) => row.executionCostExplicit).length / explicitCostRows.length
    : null;
  const matchDistances = pairs.flatMap((pair) => pair.controls)
    .map((row) => finite(row.episode.matchDistance))
    .filter((value) => value !== null);
  const matchP90 = percentile(matchDistances, 0.90);

  const returnEdge = conservativeInterval(pairs, "averageNetReturnEdgePct", inferenceOptions);
  const hitEdge = conservativeInterval(pairs, "hitRateEdge", { ...inferenceOptions, seed: Number(options.seed || 81073) + 101 });
  const catastrophe = conservativeInterval(pairs, "catastrophicLossDelta", { ...inferenceOptions, seed: Number(options.seed || 81073) + 211 });
  const replication = replicationWindows(pairs, options);

  const minimumResolvedPairs = Math.max(1, Number(options.minimumResolvedPairs || 250));
  const minimumUniqueProjects = Math.max(1, Number(options.minimumUniqueProjects || 80));
  const minimumCohorts = Math.max(2, Number(options.minimumCohorts || 30));
  const uniqueProjects = new Set(pairs.map((row) => row.identityKey)).size;
  const resolvedCohorts = new Set(pairs.map((row) => row.cohortId)).size;
  const enoughData = pairs.length >= minimumResolvedPairs &&
    uniqueProjects >= minimumUniqueProjects &&
    resolvedCohorts >= minimumCohorts &&
    resolvedControls.length >= minimumResolvedPairs;
  const capturePass = pairCaptureRate !== null &&
    episodeCaptureRate !== null &&
    pairCaptureRate >= Number(options.minimumPairCaptureRate || 0.95) &&
    episodeCaptureRate >= Number(options.minimumEpisodeCaptureRate || 0.95);
  const executionCostPass = executionCostCoverage !== null &&
    executionCostCoverage >= Number(options.minimumExplicitExecutionCostCoverage || 0.80);
  const matchQualityPass = matchP90 !== null &&
    matchP90 <= Number(options.maximumP90MatchDistance || 1.25);
  const returnVerified = returnEdge.lower !== null &&
    returnEdge.lower >= Number(options.minimumReturnEdgePct || 3);
  const hitVerified = hitEdge.lower !== null &&
    hitEdge.lower >= Number(options.minimumHitRateEdge || 0.03);
  const catastropheSafe = catastrophe.upper !== null &&
    catastrophe.upper <= Number(options.maximumCatastropheDelta || 0.02);
  const interimSafety = {
    observations: allPairs.length,
    includesPostCheckpointPairs: allPairs.length > pairs.length,
    averageNetReturnEdgePct: mean(allPairs.map((row) => row.averageNetReturnEdgePct)),
    hitRateEdge: mean(allPairs.map((row) => row.hitRateEdge)),
    catastrophicLossDelta: mean(allPairs.map((row) => row.catastrophicLossDelta)),
  };
  interimSafety.pass = allPairs.length === 0 || (
    interimSafety.averageNetReturnEdgePct >= 0 &&
    interimSafety.hitRateEdge >= 0 &&
    interimSafety.catastrophicLossDelta <= Number(options.maximumCatastropheDelta || 0.02)
  );
  const unresolvedOrIncompletePairs = Math.max(0, matureTreatments.length - allPairs.length);
  const sensitivityDenominator = allPairs.length + unresolvedOrIncompletePairs;
  const missingnessSensitivity = {
    policy: "UNRESOLVED_TREATMENT_OR_CONTROL_PAIR_ASSUMED_MAXIMALLY_ADVERSE_V1",
    matureTreatments: matureTreatments.length,
    fullyResolvedPairs: allPairs.length,
    unresolvedOrIncompletePairs,
    worstCaseAverageNetReturnEdgePct: sensitivityDenominator
      ? (
          allPairs.reduce((sum, row) => sum + row.averageNetReturnEdgePct, 0) +
          unresolvedOrIncompletePairs * -200
        ) / sensitivityDenominator
      : null,
    worstCaseHitRateEdge: sensitivityDenominator
      ? (
          allPairs.reduce((sum, row) => sum + row.hitRateEdge, 0) +
          unresolvedOrIncompletePairs * -1
        ) / sensitivityDenominator
      : null,
    worstCaseCatastrophicLossDelta: sensitivityDenominator
      ? (
          allPairs.reduce((sum, row) => sum + row.catastrophicLossDelta, 0) +
          unresolvedOrIncompletePairs
        ) / sensitivityDenominator
      : null,
  };
  missingnessSensitivity.pass = sensitivityDenominator > 0 &&
    missingnessSensitivity.worstCaseAverageNetReturnEdgePct >= Number(options.minimumReturnEdgePct || 3) &&
    missingnessSensitivity.worstCaseHitRateEdge >= Number(options.minimumHitRateEdge || 0.03) &&
    missingnessSensitivity.worstCaseCatastrophicLossDelta <= Number(options.maximumCatastropheDelta || 0.02);

  const blockers = [];
  if (!episodes.length) blockers.push("NO_FROZEN_PROSPECTIVE_COHORTS");
  if (checkpoint.state !== "PREDECLARED_ANALYSIS_CHECKPOINT_AVAILABLE") blockers.push("AWAITING_PREDECLARED_ANALYSIS_CHECKPOINT");
  if (pairs.length < minimumResolvedPairs) blockers.push("NEED_MORE_RESOLVED_MATCHED_PAIRS");
  if (uniqueProjects < minimumUniqueProjects) blockers.push("NEED_MORE_UNIQUE_TREATMENT_PROJECTS");
  if (resolvedCohorts < minimumCohorts) blockers.push("NEED_MORE_INDEPENDENT_TIME_COHORTS");
  if (resolvedControls.length < minimumResolvedPairs) blockers.push("NEED_MORE_RESOLVED_FROZEN_CONTROLS");
  if (!capturePass) blockers.push("OUTCOME_CAPTURE_BELOW_MINIMUM");
  if (!executionCostPass) blockers.push("EXPLICIT_EXECUTION_COST_COVERAGE_BELOW_MINIMUM");
  if (!matchQualityPass) blockers.push("MATCH_QUALITY_BELOW_MINIMUM");
  if (!replication.pass) blockers.push("EDGE_NOT_REPLICATED_ACROSS_PREDECLARED_TIME_WINDOWS");
  if (!returnVerified) blockers.push("NET_RETURN_EDGE_NOT_VERIFIED");
  if (!hitVerified) blockers.push("HIT_RATE_EDGE_NOT_VERIFIED");
  if (!catastropheSafe) blockers.push("CATASTROPHIC_LOSS_SAFETY_NOT_VERIFIED");
  if (!interimSafety.pass) blockers.push("INTERIM_FORWARD_SAFETY_REVOCATION");
  if (!missingnessSensitivity.pass) blockers.push("MISSING_OUTCOME_WORST_CASE_SENSITIVITY_FAILED");

  let edgeState = "UNVERIFIED_INSUFFICIENT_FORWARD_EVIDENCE";
  if (!episodes.length) edgeState = "UNVERIFIED_NO_FROZEN_COHORTS";
  else if (enoughData && capturePass && executionCostPass && matchQualityPass && replication.pass && interimSafety.pass && missingnessSensitivity.pass) {
    if (returnVerified && hitVerified && catastropheSafe) edgeState = "VERIFIED_FORWARD_EDGE";
    else if ((returnEdge.estimate ?? 0) > 0 && (hitEdge.estimate ?? 0) > 0 && catastropheSafe) edgeState = "EMERGING_FORWARD_EDGE";
    else edgeState = "NO_VERIFIED_EDGE";
  } else if (enoughData) {
    edgeState = "UNVERIFIED_EVIDENCE_QUALITY_GATES";
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date(timestamp(asOf)).toISOString(),
    evidenceDesign: "FROZEN_PROSPECTIVE_MATCHED_COHORTS_V1",
    strategyVersion: episodes[0]?.strategyVersion || null,
    strategyFingerprint: episodes[0]?.strategyFingerprint || null,
    edgeState,
    horizonHours,
    targetReturnPct,
    sample: {
      frozenEpisodes: episodes.length,
      frozenTreatments: treatments.length,
      matureEpisodes: matureEpisodes.length,
      resolvedEpisodes: capturedEpisodes.length,
      matureTreatments: matureTreatments.length,
      totalResolvedMatchedPairs: allPairs.length,
      partiallyResolvedMatchedPairs: partiallyOrFullyResolvedPairs.length - allPairs.length,
      resolvedMatchedPairs: pairs.length,
      resolvedControlOutcomes: resolvedControls.length,
      uniqueTreatmentProjects: uniqueProjects,
      resolvedCohorts,
    },
    sequentialInference: {
      policy: "PREDECLARED_DOUBLING_SAMPLE_CHECKPOINTS_WITH_ALPHA_SPENDING_V1",
      checkpointState: checkpoint.state,
      checkpointPairCount: checkpoint.pairCount,
      nextCheckpointPairCount: checkpoint.nextPairCount,
      checkpointOrdinal: checkpoint.ordinal,
      strategyTrialOrdinal,
      globalFamilyWiseAlpha: globalSequentialAlpha,
      allocatedAlpha: confidenceAlpha,
      confidenceLevel: 1 - confidenceAlpha,
      bootstrapIterations: inferenceOptions.iterations,
    },
    interimSafety,
    missingnessSensitivity,
    capture: {
      pairCaptureRate,
      episodeCaptureRate,
      pass: capturePass,
    },
    executionCosts: {
      explicitCoverage: executionCostCoverage,
      medianReferenceSizeUsd: percentile(explicitCostRows.map((row) => row.executionReferenceSizeUsd), 0.5),
      minimumAppliedRoundTripCostBps: Number(options.minimumAppliedRoundTripCostBps || PROSPECTIVE_EDGE_CERTIFICATE_GOVERNANCE.minimumAppliedRoundTripCostBps),
      conservativeMissingCostBps: Math.max(0, Number(options.conservativeMissingCostBps || 200)),
      pass: executionCostPass,
    },
    matchQuality: {
      matchedControls: matchDistances.length,
      meanDistance: mean(matchDistances),
      p90Distance: matchP90,
      pass: matchQualityPass,
    },
    performance: {
      treatmentMeanNetReturnPct: mean(pairs.map((row) => row.treatmentNetReturnPct)),
      matchedControlMeanNetReturnPct: mean(pairs.map((row) => row.controlMeanNetReturnPct)),
      averageNetReturnEdgePct: returnEdge,
      hitRateEdge: hitEdge,
      catastrophicLossDelta: catastrophe,
    },
    replication,
    gates: {
      enoughData,
      capturePass,
      executionCostPass,
      matchQualityPass,
      replicationPass: replication.pass,
      returnVerified,
      hitVerified,
      catastropheSafe,
      missingnessSensitivityPass: missingnessSensitivity.pass,
      minimumResolvedPairs,
      minimumUniqueProjects,
      minimumCohorts,
      minimumPairCaptureRate: Number(options.minimumPairCaptureRate || 0.95),
      minimumEpisodeCaptureRate: Number(options.minimumEpisodeCaptureRate || 0.95),
      minimumExplicitExecutionCostCoverage: Number(options.minimumExplicitExecutionCostCoverage || 0.80),
    },
    blockers,
    pairs: pairs.slice(-Math.max(1, Number(options.reportPairLimit || 5000))),
    policy: {
      prospectiveFreezeRequired: true,
      postOutcomeControlSelectionProhibited: true,
      immutableCodeVersionRequired: true,
      frozenContentIntegrityRequired: true,
      economicThresholdsAppliedToConfidenceBounds: true,
      optionalStoppingControlledByPredeclaredCheckpoints: true,
      repeatedStrategySearchControlledByAlphaSpending: true,
      interimDataCanRevokeButNeverGrantCertificate: true,
      unresolvedOutcomesEvaluatedWithMaximallyAdverseSensitivity: true,
      exactIdentityRequired: true,
      poolRequiredWhenKnownByBothSides: true,
      netOfFrozenExecutionCosts: true,
      timeAndIdentityClusteredConfidenceIntervals: true,
      latestStrategyEvaluatedWithoutBestStrategySelection: true,
      evaluationPolicyFrozenBeforeOutcomes: options.evaluationPolicyFrozenBeforeOutcomes === true,
      frozenEvaluationPolicy: options.frozenEvaluationPolicy || null,
      automaticTrading: false,
      automaticPromotion: false,
    },
  };
}

export function gradeProspectiveEdgeCohorts(episodes = [], observations = [], options = {}) {
  const asOf = options.asOf || options.now || new Date().toISOString();
  const asOfMs = timestamp(asOf);
  if (asOfMs === null) throw new Error("A valid as-of timestamp is required to grade prospective edge cohorts");
  const attemptedEpisodes = Array.isArray(episodes) ? episodes : [];
  const episodeAuditRows = attemptedEpisodes.map((row) => ({
    row,
    failures: episodeIntegrityFailures(row, asOfMs, options),
  }));
  const claimedLatestStrategyFingerprint = episodeAuditRows
    .filter(({ row }) => row.strategyFingerprint && timestamp(row.decisionAt) !== null && timestamp(row.decisionAt) <= asOfMs)
    .map(({ row }) => ({ fingerprint: row.strategyFingerprint, decisionMs: timestamp(row.decisionAt) }))
    .sort((left, right) => right.decisionMs - left.decisionMs)[0]?.fingerprint || null;
  const validCandidates = episodeAuditRows.filter((entry) => !entry.failures.length).map((entry) => entry.row);
  const duplicateEpisodeIds = new Set();
  const seenEpisodeIds = new Set();
  for (const row of validCandidates) {
    if (!row.episodeId || seenEpisodeIds.has(row.episodeId)) duplicateEpisodeIds.add(row.episodeId || "MISSING_EPISODE_ID");
    else seenEpisodeIds.add(row.episodeId);
  }
  const validEpisodes = validCandidates.filter((row) => row.episodeId && !duplicateEpisodeIds.has(row.episodeId));
  const topologyFailures = cohortTopologyFailures(validEpisodes);
  const attemptedObservations = Array.isArray(observations) ? observations : [];
  const requireObservationLedgerIntegrity = options.requireObservationLedgerIntegrity === true;
  const observationAudit = attemptedObservations.reduce((audit, row) => {
    const at = observedAt(row);
    const identity = strictIdentity(row);
    const price = finite(row.priceUsd);
    const integrityPass = !requireObservationLedgerIntegrity || (
      Boolean(row.observationIntegrityHash) &&
      row.observationIntegrityHash === exactMarketObservationIntegrityHash(row)
    );
    if (!integrityPass) audit.integrityFailure += 1;
    else if (!identity) audit.invalidIdentity += 1;
    else if (at === null) audit.invalidTimestamp += 1;
    else if (at > asOfMs) audit.futureTimestamp += 1;
    else if (price === null || price <= 0) audit.invalidPrice += 1;
    else audit.accepted += 1;
    return audit;
  }, {
    accepted: 0,
    invalidIdentity: 0,
    invalidTimestamp: 0,
    futureTimestamp: 0,
    invalidPrice: 0,
    integrityFailure: 0,
  });
  const safeObservations = attemptedObservations.filter((row) => {
    const at = observedAt(row);
    const integrityPass = !requireObservationLedgerIntegrity || (
      Boolean(row.observationIntegrityHash) &&
      row.observationIntegrityHash === exactMarketObservationIntegrityHash(row)
    );
    return integrityPass &&
      strictIdentity(row) &&
      at !== null &&
      at <= asOfMs &&
      finite(row.priceUsd) > 0;
  });
  const byStrategy = new Map();
  for (const episode of validEpisodes) {
    byStrategy.set(episode.strategyFingerprint, [
      ...(byStrategy.get(episode.strategyFingerprint) || []),
      episode,
    ]);
  }
  const strategyTrialOrdinal = new Map(
    [...byStrategy.entries()]
      .map(([fingerprint, rows]) => ({
        fingerprint,
        firstDecisionAt: Math.min(...rows.map((row) => timestamp(row.decisionAt)).filter((value) => value !== null)),
      }))
      .sort((left, right) =>
        left.firstDecisionAt - right.firstDecisionAt ||
        left.fingerprint.localeCompare(right.fingerprint)
      )
      .map((row, index) => [row.fingerprint, index + 1]),
  );
  const latestStrategyFingerprint = claimedLatestStrategyFingerprint;
  const strategies = Object.fromEntries(
    [...byStrategy.entries()].map(([fingerprint, rows]) => [
      fingerprint,
      gradeStrategy(
        rows,
        safeObservations,
        gradingOptionsFromFrozenPolicy(rows, {
          ...options,
          asOf,
          strategyTrialOrdinal: strategyTrialOrdinal.get(fingerprint) || 1,
        }),
      ),
    ])
  );
  const rawCurrent = latestStrategyFingerprint && strategies[latestStrategyFingerprint]
    ? strategies[latestStrategyFingerprint]
    : gradeStrategy([], safeObservations, { ...options, asOf });
  // The evidence ledger is append-only. Any malformed, duplicated, or invalidly
  // linked row can change a capture denominator, so certification fails closed
  // for the entire loaded ledger instead of quietly quarantining older damage.
  const prospectiveLedgerIntegrityPass = episodeAuditRows.every((entry) => !entry.failures.length) &&
    duplicateEpisodeIds.size === 0 &&
    topologyFailures.size === 0;
  const observationLedgerIntegrityPass = !requireObservationLedgerIntegrity ||
    observationAudit.integrityFailure === 0;
  const currentLedgerIntegrityPass = prospectiveLedgerIntegrityPass && observationLedgerIntegrityPass;
  const integrityBlockers = [
    ...(!prospectiveLedgerIntegrityPass ? ["PROSPECTIVE_COHORT_LEDGER_INTEGRITY_FAILURE"] : []),
    ...(!observationLedgerIntegrityPass ? ["EXACT_MARKET_OBSERVATION_LEDGER_INTEGRITY_FAILURE"] : []),
  ];
  const current = currentLedgerIntegrityPass
    ? rawCurrent
    : {
        ...rawCurrent,
        edgeState: prospectiveLedgerIntegrityPass
          ? "UNVERIFIED_MARKET_OBSERVATION_LEDGER_INTEGRITY"
          : "UNVERIFIED_PROSPECTIVE_LEDGER_INTEGRITY",
        blockers: [...new Set([
          ...(rawCurrent.blockers || []),
          ...integrityBlockers,
        ])],
      };
  if (latestStrategyFingerprint) strategies[latestStrategyFingerprint] = current;
  const failureCounts = {};
  for (const { failures } of episodeAuditRows) {
    for (const failure of failures) failureCounts[failure] = (failureCounts[failure] || 0) + 1;
  }
  for (const failures of topologyFailures.values()) {
    for (const failure of failures) failureCounts[failure] = (failureCounts[failure] || 0) + 1;
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date(asOfMs).toISOString(),
    evidenceDesign: "FROZEN_PROSPECTIVE_MATCHED_COHORTS_V1",
    edgeState: current.edgeState,
    latestStrategyFingerprint,
    strategyCount: Object.keys(strategies).length,
    current,
    strategies,
    inputAudit: {
      episodesAttempted: attemptedEpisodes.length,
      validProspectiveEpisodes: validEpisodes.length,
      invalidProspectiveEpisodes: episodeAuditRows.filter((entry) => entry.failures.length).length,
      duplicateEpisodeIds: [...duplicateEpisodeIds],
      topologyFailureEpisodeIds: [...topologyFailures.keys()],
      currentStrategyLedgerIntegrityPass: currentLedgerIntegrityPass,
      prospectiveCohortLedgerIntegrityPass: prospectiveLedgerIntegrityPass,
      exactMarketObservationLedgerIntegrityRequired: requireObservationLedgerIntegrity,
      exactMarketObservationLedgerIntegrityPass: observationLedgerIntegrityPass,
      episodeIntegrityFailureCounts: failureCounts,
      observationsAttempted: attemptedObservations.length,
      exactPastOrPresentObservations: safeObservations.length,
      observationsRejected: attemptedObservations.length - safeObservations.length,
      rejectionReasons: {
        invalidIdentity: observationAudit.invalidIdentity,
        invalidTimestamp: observationAudit.invalidTimestamp,
        futureTimestamp: observationAudit.futureTimestamp,
        invalidPrice: observationAudit.invalidPrice,
        integrityFailure: observationAudit.integrityFailure,
      },
    },
    certificateEligible: current.edgeState === "VERIFIED_FORWARD_EDGE",
    automaticTrading: false,
    automaticPromotion: false,
  };
}

export const __prospectiveEdgeGraderHooks = {
  routeCompatible,
  observedAt,
  episodeIntegrityFailures,
  cohortTopologyFailures,
  gradingOptionsFromFrozenPolicy,
  resolvedCost,
  buildPairs,
  clusterBootstrap,
  predeclaredAnalysisCheckpoint,
  conservativeInterval,
  replicationWindows,
  gradeStrategy,
};
