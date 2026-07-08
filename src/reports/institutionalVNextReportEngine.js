import fs from "fs";
import path from "path";

export function writeInstitutionalVNextReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const ranked = [...projects]
    .sort((a, b) => Number(b.institutionalVNextScore || 0) - Number(a.institutionalVNextScore || 0))
    .slice(0, 50)
    .map((project) => ({
      rank: project.pipelineRank || null,
      name: project.name || "Unknown",
      symbol: project.symbol || "Unknown",
      pipelineScore: project.pipelineScore || 0,
      institutionalVNextScore: project.institutionalVNextScore || 0,
      institutionalConfidenceScore: project.institutionalConfidenceScore || 0,
      institutionalConfidenceLevel: project.institutionalConfidenceLevel || "Unknown",
      evidenceQualityScore: project.evidenceQualityScore || 0,
      aiNarrativeMomentumScore: project.aiNarrativeMomentumScore || 0,
      launchProbabilityScore: project.launchProbabilityScore || 0,
      exchangeListingProbabilityV2Score: project.exchangeListingProbabilityV2Score || 0,
      tokenUnlockRiskScore: project.tokenUnlockRiskScore || 0,
      vestingPressureScore: project.vestingPressureScore || 0,
      stakingHealthScore: project.stakingHealthScore || 0,
      tvlGrowthScore: project.tvlGrowthScore || 0,
      ecosystemAdoptionScore: project.ecosystemAdoptionScore || 0,
      githubVelocityScore: project.githubVelocityScore || 0,
      socialSentimentAIScore: project.socialSentimentAIScore || 0,
      kolInfluenceScore: project.kolInfluenceScore || 0,
      walletClusterScore: project.walletClusterScore || 0,
      smartMoneyConvictionScore: project.smartMoneyConvictionScore || 0,
      liquidityMigrationScore: project.liquidityMigrationScore || 0,
      crossChainExpansionScore: project.crossChainExpansionScore || 0,
      macroNarrativeScore: project.macroNarrativeScore || 0,
      monteCarloV2Score: project.monteCarloV2Score || 0,
      dynamicEngineWeights: project.dynamicEngineWeights || {},
      explainabilitySummary: project.explainabilitySummary || "",
    }));

  const report = {
    generatedAt: new Date().toISOString(),
    totalProjects: projects.length,
    topVNextProjects: ranked,
  };

  const filePath = path.join(reportsDir, "institutional-vnext.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return filePath;
}
