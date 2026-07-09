// src/engines/confidenceAdjustedRankEngine.js

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

export function analyzeConfidenceAdjustedRankBatch(projects = []) {
  const ranked = [...projects]
    .map((project) => {
      const opportunity = num(project.pipelineScore ?? project.opportunityScore ?? project.score);
      const dataConfidence = num(project.dataConfidenceScore || 45);
      const sourceReliability = num(project.sourceReliabilityScore || 45);
      const proof = num(project.proofScore || 40);
      const narrativeHeat = num(project.narrativeHeatScore || 0);
      const change = num(project.projectChangeScore || 50);
      const trapRisk = num(project.trapRiskScore || 0);
      const risk = num(project.signalProfile?.risk || project.riskScore || 0);
      const adjusted = Math.round(
        clamp(
          opportunity * 0.42 +
            dataConfidence * 0.16 +
            sourceReliability * 0.14 +
            proof * 0.12 +
            narrativeHeat * 0.08 +
            change * 0.08 -
            trapRisk * 0.22 -
            risk * 0.08
        )
      );

      return {
        ...project,
        confidenceAdjustedScore: adjusted,
        institutionalRankScore: adjusted,
        confidenceAdjustedRankBreakdown: {
          opportunity,
          dataConfidence,
          sourceReliability,
          proof,
          narrativeHeat,
          projectChange: change,
          trapRisk,
          risk,
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
