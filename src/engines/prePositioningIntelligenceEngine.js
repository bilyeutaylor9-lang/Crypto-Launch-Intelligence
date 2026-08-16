import { clamp, num } from "../edge/edgeMath.js";

function observedCapital(project = {}) {
  return project.prePositioningCapital || project.ignitionRawSensors?.prePositioningCapital || null;
}

export function analyzePrePositioningIntelligence(project = {}, options = {}) {
  const raw = options.observation || observedCapital(project);
  if (!raw || ["UNOBSERVED", "NO_TRACKED_WALLETS", "NO_USD_STABLECOIN_CONFIGURATION", "STABLECOIN_METADATA_UNRESOLVED", "SENSOR_FAILED", "UNSUPPORTED_CHAIN"].includes(raw.status) || raw.state === "UNOBSERVED") {
    return {
      ...project,
      prePositioningIntelligence: {
        state: "UNOBSERVED",
        confidencePct: null,
        stagedCapitalUsd: null,
        targetProximityCapitalUsd: null,
        candidateAdjustedStagedCapitalUsd: null,
        targetingConfidencePct: null,
        shadowOnly: true,
        rankingInfluence: false,
      },
      prePositioningState: "UNOBSERVED",
      prePositioningScore: 0,
    };
  }

  const fresh = num(raw.observedFreshCapitalUsd) ?? 0;
  const executionReady = num(raw.executionReadyCapitalUsd) ?? 0;
  const targeted = num(raw.targetProximityCapitalUsd) ?? 0;
  const deployed = num(raw.visibleDeployedToTargetUsd) ?? 0;
  const sensorConfidence = num(raw.confidencePct) ?? 35;
  const preparedWallets = num(raw.capitalConvergence?.preparedWalletCount) ?? 0;
  const distinctSources = num(raw.capitalConvergence?.distinctFundingSourceCount) ?? 0;
  const largestSourceShare = num(raw.capitalConvergence?.largestFundingSourceSharePct);
  const distinctConvergence = raw.capitalConvergence?.state === "DISTINCT_SOURCE_CAPITAL_CONVERGENCE";

  const targetingConfidencePct = targeted > 0
    ? 90
    : deployed > 0
      ? 100
      : raw.targetingEvidenceMode === "ECOSYSTEM_EXECUTION_PREPARATION_ONLY"
        ? 20
        : 35;
  const candidateAdjustedStagedCapitalUsd = executionReady > 0
    ? executionReady * (targetingConfidencePct / 100)
    : 0;
  const score = clamp(
    Math.min(45, Math.log10(Math.max(1, fresh)) * 8) +
    Math.min(25, executionReady > 0 ? 15 + preparedWallets * 3 : 0) +
    (distinctConvergence ? 15 : 0) +
    (targeted > 0 ? 15 : deployed > 0 ? 12 : 0) -
    (largestSourceShare !== null && largestSourceShare >= 80 && preparedWallets >= 2 ? 12 : 0),
    0,
    100
  );

  let state = raw.state || "OBSERVED_PRE_POSITIONING";
  if (deployed > 0 && raw.state === "FIRST_BUY") state = "FIRST_BUY";
  if (deployed > 0 && raw.state === "CONFIRMED_FLOW") state = "CONFIRMED_FLOW";

  return {
    ...project,
    prePositioningIntelligence: {
      state,
      score: Math.round(score),
      confidencePct: Math.round(clamp(sensorConfidence)),
      observedFreshCapitalUsd: fresh,
      stagedCapitalUsd: executionReady,
      targetProximityCapitalUsd: targeted,
      visibleDeployedToTargetUsd: deployed,
      candidateAdjustedStagedCapitalUsd: Number(candidateAdjustedStagedCapitalUsd.toFixed(2)),
      targetingConfidencePct,
      preparedWalletCount: preparedWallets,
      distinctFundingSourceCount: distinctSources,
      largestFundingSourceSharePct: largestSourceShare,
      capitalConvergenceState: raw.capitalConvergence?.state || null,
      targetingEvidenceMode: raw.targetingEvidenceMode || null,
      source: raw.source || "PRE_POSITIONING_CAPITAL_SENSOR",
      shadowOnly: true,
      rankingInfluence: false,
      warning: "Execution-ready capital is observed upstream purchasing power, not a promise that it will buy this token. Candidate-adjusted staged capital is deliberately discounted unless direct target-proximity evidence exists.",
    },
    prePositioningState: state,
    prePositioningScore: Math.round(score),
    stagedCapitalUsd: project.stagedCapitalUsd ?? executionReady,
    targetProximityCapitalUsd: project.targetProximityCapitalUsd ?? targeted,
    candidateAdjustedStagedCapitalUsd: project.candidateAdjustedStagedCapitalUsd ?? candidateAdjustedStagedCapitalUsd,
  };
}

export function analyzePrePositioningIntelligenceBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => analyzePrePositioningIntelligence(project, options));
}
