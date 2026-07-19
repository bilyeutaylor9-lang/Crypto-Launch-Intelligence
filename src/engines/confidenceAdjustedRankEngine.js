// src/engines/confidenceAdjustedRankEngine.js

import { calculateEvidenceCoverage, numericMetric } from "../kernel/evidenceCoverage.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function first(project = {}, keys = []) {
  for (const key of keys) {
    const value = key.split(".").reduce((current, part) => current?.[part], project);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function metric(project = {}, keys = [], label = "") {
  const value = first(project, keys);
  return numericMetric({
    label,
    value,
    source: "confidence-adjusted-rank",
    timestamp: project.scannedAt || project.updatedAt || project.observationTimestamp || new Date().toISOString(),
    confidence: value === null ? 0 : 70,
    freshness: project.staleEvidenceCount > 0 ? "STALE" : "CURRENT_OR_UNKNOWN",
    provenance: keys.join("|"),
  });
}

export function analyzeConfidenceAdjustedRankBatch(projects = []) {
  const ranked = [...projects]
    .map((project) => {
      const evidenceCoverage = calculateEvidenceCoverage([
        metric(project, ["pipelineScore", "opportunityScore", "score"], "opportunity score"),
        metric(project, ["dataConfidenceScore"], "data confidence"),
        metric(project, ["sourceReliabilityScore"], "source reliability"),
        metric(project, ["proofScore"], "proof score"),
        metric(project, ["narrativeHeatScore"], "narrative heat"),
        metric(project, ["projectChangeScore"], "project change"),
        metric(project, ["trapRiskScore"], "trap risk"),
        metric(project, ["signalProfile.risk", "riskScore"], "risk score"),
      ]);
      const opportunity = num(first(project, ["pipelineScore", "opportunityScore", "score"]));
      const dataConfidence = num(first(project, ["dataConfidenceScore"]));
      const sourceReliability = num(first(project, ["sourceReliabilityScore"]));
      const proof = num(first(project, ["proofScore"]));
      const narrativeHeat = num(first(project, ["narrativeHeatScore"]));
      const change = num(first(project, ["projectChangeScore"]));
      const trapRisk = num(first(project, ["trapRiskScore"]));
      const risk = num(first(project, ["signalProfile.risk", "riskScore"]));
      const adjusted = Math.round(
        clamp(
          opportunity * 0.42 +
            dataConfidence * 0.16 +
            sourceReliability * 0.14 +
            proof * 0.12 +
            narrativeHeat * 0.08 +
            change * 0.08 -
            trapRisk * 0.22 -
            risk * 0.08 -
            evidenceCoverage.confidencePenalty * 0.35
        )
      );

      return {
        ...project,
        confidenceAdjustedScore: adjusted,
        institutionalRankScore: adjusted,
        confidenceAdjustedEvidenceCoverage: evidenceCoverage.evidenceCoveragePercent,
        confidenceAdjustedDataState:
          evidenceCoverage.evidenceCoveragePercent >= 80
            ? "VERIFIED"
            : evidenceCoverage.evidenceCoveragePercent >= 50
              ? "PARTIAL"
              : "UNKNOWN",
        confidenceAdjustedRankBreakdown: {
          opportunity,
          dataConfidence,
          sourceReliability,
          proof,
          narrativeHeat,
          projectChange: change,
          trapRisk,
          risk,
          evidenceCoverage,
        },
      };
    })
    .sort((a, b) => b.confidenceAdjustedScore - a.confidenceAdjustedScore);

  const total = ranked.length;

  return ranked.map((project, index) => ({
    ...project,
    confidenceAdjustedRank: index + 1,
    confidenceAdjustedPercentile:
      total <= 1 ? 100 : Math.round(((total - index) / total) * 100),
  }));
}
