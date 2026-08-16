import { clamp, num } from "../edge/edgeMath.js";

function radarMatch(project = {}) {
  return project.chainCapitalRadarCandidate || project.ignitionRawSensors?.chainCapitalRadarCandidate || null;
}

export function analyzeCapitalDestinationIntelligence(project = {}, options = {}) {
  const match = options.match || radarMatch(project);
  if (!match) {
    return {
      ...project,
      capitalDestinationIntelligence: {
        state: "UNOBSERVED",
        confidencePct: null,
        radarExecutionReadyCapitalUsd: null,
        candidateAdjustedRadarCapitalUsd: null,
        convergingWalletCount: null,
        shadowOnly: true,
        rankingInfluence: false,
      },
    };
  }

  const ready = num(match.executionReadyCapitalUsd) ?? 0;
  const adjusted = num(match.candidateAdjustedRadarCapitalUsd) ?? 0;
  const wallets = Array.isArray(match.candidateWallets) ? match.candidateWallets.length : 0;
  const targetWallets = Array.isArray(match.targetProximityWallets) ? match.targetProximityWallets.length : 0;
  const distinctSources = num(match.convergence?.distinctFundingSourceCount) ?? 0;
  const largestSourceShare = num(match.convergence?.largestFundingSourceSharePct);
  const confidence = num(match.confidencePct) ?? 35;
  const independent = match.convergence?.state === "INDEPENDENT_CAPITAL_CONVERGENCE";

  let state = match.state || "CANDIDATE_PROXIMITY";
  if (wallets >= 2 && independent) state = "CAPITAL_CONVERGING_ON_CANDIDATE";
  if (targetWallets >= 2 && independent) state = "MULTI_WALLET_TARGET_PROXIMITY";

  const score = clamp(
    Math.min(35, Math.log10(Math.max(1, adjusted)) * 7) +
    Math.min(20, wallets * 5) +
    Math.min(20, targetWallets * 8) +
    (independent ? 15 : 0) +
    (distinctSources >= 3 ? 10 : distinctSources >= 2 ? 5 : 0) -
    (largestSourceShare !== null && largestSourceShare >= 80 && wallets >= 2 ? 15 : 0),
    0,
    100
  );

  return {
    ...project,
    capitalDestinationIntelligence: {
      state,
      score: Math.round(score),
      confidencePct: Math.round(clamp(confidence)),
      radarExecutionReadyCapitalUsd: ready,
      candidateAdjustedRadarCapitalUsd: adjusted,
      candidateWallets: match.candidateWallets || [],
      targetProximityWallets: match.targetProximityWallets || [],
      convergingWalletCount: wallets,
      targetProximityWalletCount: targetWallets,
      newlyDiscoveredWalletCount: match.newlyDiscoveredWalletCount ?? null,
      capitalConvergenceState: match.convergence?.state || null,
      distinctFundingSourceCount: distinctSources,
      largestFundingSourceSharePct: largestSourceShare,
      source: "CHAIN_WIDE_CAPITAL_RADAR_SENSOR",
      warning: "Candidate destination intelligence is shadow-only. Generic execution readiness is never treated as token-specific demand. Candidate assignment requires explicit target-specific evidence or prior target activity, and funding addresses are not beneficial-owner identities.",
      shadowOnly: true,
      rankingInfluence: false,
    },
    chainRadarCandidateAdjustedCapitalUsd: project.chainRadarCandidateAdjustedCapitalUsd ?? adjusted,
    chainRadarExecutionReadyCapitalUsd: project.chainRadarExecutionReadyCapitalUsd ?? ready,
  };
}

export function analyzeCapitalDestinationIntelligenceBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => analyzeCapitalDestinationIntelligence(project, options));
}
