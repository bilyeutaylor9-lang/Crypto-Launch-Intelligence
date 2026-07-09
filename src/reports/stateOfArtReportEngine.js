import fs from "fs";
import path from "path";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function compactProject(project = {}) {
  return {
    rank: project.pipelineRank || 0,
    confidenceAdjustedRank: project.confidenceAdjustedRank || 0,
    name: project.name || "Unknown",
    symbol: project.symbol || "Unknown",
    chain: project.chain || "Unknown",
    pipelineScore: project.pipelineScore || project.opportunityScore || 0,
    confidenceAdjustedScore: project.confidenceAdjustedScore || 0,
    institutionalRankScore: project.institutionalRankScore || 0,
    confidence: project.confidence || "Unknown",
    dataConfidence: project.dataConfidence || "Unknown",
    narrativeHeatScore: project.narrativeHeatScore || 0,
    narrativeHeatState: project.narrativeHeatState || "unknown",
    projectChangeScore: project.projectChangeScore || 0,
    projectChangeState: project.projectChangeState || "unknown",
    sourceReliabilityScore: project.sourceReliabilityScore || 0,
    trapRiskScore: project.trapRiskScore || 0,
    trapRiskLevel: project.trapRiskLevel || "unknown",
    alphaTags: project.alphaTags || [],
    riskFlags: project.riskFlags || [],
    thesis: project.opportunityThesis || project.whyThisMatters || "",
  };
}

export function writeStateOfArtReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const topConfidenceAdjusted = [...projects]
    .sort((a, b) => num(b.confidenceAdjustedScore) - num(a.confidenceAdjustedScore))
    .slice(0, 25)
    .map(compactProject);

  const hotNarratives = [...projects]
    .filter((project) => num(project.narrativeHeatScore) >= 60)
    .sort((a, b) => num(b.narrativeHeatScore) - num(a.narrativeHeatScore))
    .slice(0, 25)
    .map(compactProject);

  const improvingProjects = [...projects]
    .filter((project) => ["accelerating", "improving"].includes(project.projectChangeState))
    .sort((a, b) => num(b.projectChangeScore) - num(a.projectChangeScore))
    .slice(0, 25)
    .map(compactProject);

  const highTrapRisk = [...projects]
    .filter((project) => num(project.trapRiskScore) >= 60)
    .sort((a, b) => num(b.trapRiskScore) - num(a.trapRiskScore))
    .slice(0, 25)
    .map(compactProject);

  const reliableSources = [...projects]
    .filter((project) => num(project.sourceReliabilityScore) >= 70)
    .sort((a, b) => num(b.sourceReliabilityScore) - num(a.sourceReliabilityScore))
    .slice(0, 25)
    .map(compactProject);

  const report = {
    generatedAt: new Date().toISOString(),
    totalProjects: projects.length,
    counts: {
      topConfidenceAdjusted: topConfidenceAdjusted.length,
      hotNarratives: hotNarratives.length,
      improvingProjects: improvingProjects.length,
      highTrapRisk: highTrapRisk.length,
      reliableSources: reliableSources.length,
    },
    topConfidenceAdjusted,
    hotNarratives,
    improvingProjects,
    highTrapRisk,
    reliableSources,
    marketHeatMap: projects[0]?.narrativeHeatIndex?.marketHeatMap || [],
  };

  const filePath = path.join(reportsDir, "state-of-art-signals.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return filePath;
}
