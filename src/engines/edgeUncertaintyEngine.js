import { num } from "../edge/edgeMath.js";

export function analyzeEdgeUncertainty(project = {}, options = {}) {
  const hazard = project.breakoutHazard || {};
  const h24 = hazard.horizons?.["24h"] || {};
  const dna = project.eventSequenceDNA || {};
  const residual = project.residualAlpha || {};
  const firewall = project.fakeMomentumFirewall || {};
  const safetyBlocked = project.threeClockEdge?.safetyState === "BLOCKED" || project.threeClockDivergenceState === "SAFETY_BLOCKED";

  const sample = num(h24.sampleSize) || 0;
  const low = num(h24.intervalLowPct);
  const high = num(h24.intervalHighPct);
  const intervalWidth = low !== null && high !== null ? high - low : null;
  const dnaSimilarity = num(dna.bestSimilarity);
  const residualSimilarity = num(residual.blindspotSimilarity);
  const fakeRisk = num(firewall.riskScore) || 0;

  let oodScore = 0;
  if (dnaSimilarity === null || dnaSimilarity < 55) oodScore += 35;
  if (residualSimilarity === null) oodScore += 20;
  if (project.structuralBreakState === "MULTIVARIATE_STRUCTURAL_BREAK" && dnaSimilarity !== null && dnaSimilarity < 70) oodScore += 25;
  if (project.downstreamAdoptionState === "EXTERNAL_ADOPTION_ACCELERATING" && dnaSimilarity !== null && dnaSimilarity < 60) oodScore += 15;
  oodScore = Math.min(100, oodScore);

  const reasons = [];
  if (safetyBlocked) reasons.push("DETERMINISTIC_SAFETY_BLOCK");
  if (fakeRisk >= 70) reasons.push("ACTIVITY_QUALITY_FAILURE");
  if (sample < Number(options.minimumHazardSample || 15)) reasons.push("LOW_HAZARD_SAMPLE");
  if (intervalWidth === null || intervalWidth > Number(options.maximumIntervalWidthPct || 42)) reasons.push("WIDE_EMPIRICAL_INTERVAL");
  if (oodScore >= 60) reasons.push("OUT_OF_DISTRIBUTION");

  const abstain = reasons.length > 0;
  const state = safetyBlocked
    ? "ABSTAIN_SAFETY"
    : fakeRisk >= 70
      ? "ABSTAIN_ACTIVITY_QUALITY"
      : oodScore >= 60
        ? "ABSTAIN_OUT_OF_DISTRIBUTION"
        : sample < 15 || intervalWidth === null || intervalWidth > 42
          ? "ABSTAIN_UNCERTAIN"
          : "EMPIRICALLY_BOUNDED";

  return {
    ...project,
    edgeUncertainty: {
      state,
      abstain,
      reasons,
      hazardSampleSize: sample,
      hazard24hIntervalPct: low === null || high === null ? null : [low, high],
      intervalWidthPct: intervalWidth,
      outOfDistributionScore: oodScore,
      sequenceSimilarityPct: dnaSimilarity,
      residualBlindspotSimilarityPct: residualSimilarity,
      calibrationMethod: "EMPIRICAL_WILSON_INTERVAL_PLUS_OOD_GUARD",
      warning: "This is not a conformal guarantee. It is an empirical uncertainty guard that forces abstention when evidence is sparse, wide, or out-of-distribution.",
      shadowOnly: true,
    },
    edgeAbstain: abstain,
    edgeUncertaintyState: state,
  };
}

export function analyzeEdgeUncertaintyBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => analyzeEdgeUncertainty(project, options));
}
