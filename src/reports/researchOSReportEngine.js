import fs from "fs";
import path from "path";
import { summarizeAlphaLab } from "../engines/autonomousAlphaLabEngine.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function compact(project = {}) {
  return {
    rank: project.pipelineRank || 0,
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    lifecycleStage: project.strongBuyLifecycleStage || "Unknown",
    aiVerdict: project.aiEcosystemVerdict || "Unknown",
    aiScore: project.aiEcosystemScore || 0,
    confidenceAdjustedScore: project.confidenceAdjustedScore || 0,
    bestHorizon: project.multiTimeframeIntelligence?.bestHorizon || "Unknown",
    multiTimeframeIntelligence: project.multiTimeframeIntelligence || {},
    scenarioPlan: project.scenarioPlan || {},
    redTeamReview: project.redTeamReview || {},
    aiDisagreement: project.aiDisagreement || {},
    autonomousResearchTasks: project.autonomousResearchTasks || [],
    whyNow: project.whyNow || {},
    alphaLabScore: project.alphaLabScore || 0,
    alphaLabStatus: project.alphaLabStatus || "Unknown",
    alphaLabBestStrategy: project.alphaLabBestStrategy || null,
    metaCouncil: project.metaCouncil || {},
    quantumReasoningBrain: project.quantumReasoningBrain || {},
    quantumBrainScore: project.quantumBrainScore || 0,
    worldModelScore: project.worldModelScore || 0,
    knowledgeGraph: project.knowledgeGraph || {},
    marketRegimeGovernor: project.marketRegimeGovernor || {},
    marketScientistScore: project.marketScientistScore || 0,
    autonomousMarketScientist: project.autonomousMarketScientist || {},
    causalHypotheses: project.causalHypotheses || [],
    counterfactualAnalysis: project.counterfactualAnalysis || [],
    falsePositiveAutopsy: project.falsePositiveAutopsy || {},
    alphaDecayDetector: project.alphaDecayDetector || {},
    humanPreferenceFit: project.humanPreferenceFit || {},
  };
}

export function writeResearchOSReports(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const researchOS = {
    generatedAt: new Date().toISOString(),
    totalProjects: projects.length,
    lifecycleCounts: {
      aiStrongBuy: projects.filter((project) => project.strongBuyLifecycleStage === "AI Strong Buy").length,
      preStrongBuy: projects.filter((project) => project.strongBuyLifecycleStage === "Pre-Strong Buy").length,
      priorityWatch: projects.filter((project) => project.strongBuyLifecycleStage === "Priority Watch").length,
      watch: projects.filter((project) => project.strongBuyLifecycleStage === "Watch").length,
      invalidated: projects.filter((project) => project.strongBuyLifecycleStage === "Invalidated").length,
    },
    highDisagreement: projects
      .filter((project) => project.aiDisagreement?.level === "High")
      .sort((a, b) => num(b.aiDisagreement?.score) - num(a.aiDisagreement?.score))
      .slice(0, 25)
      .map(compact),
    redTeamBlocks: projects
      .filter((project) => project.redTeamReview?.status === "Block")
      .sort((a, b) => num(b.redTeamReview?.score) - num(a.redTeamReview?.score))
      .slice(0, 25)
      .map(compact),
    strongBuyPipeline: projects
      .filter((project) =>
        ["AI Strong Buy", "Pre-Strong Buy", "Priority Watch"].includes(project.strongBuyLifecycleStage)
      )
      .sort((a, b) => num(b.aiEcosystemScore) - num(a.aiEcosystemScore))
      .slice(0, 50)
      .map(compact),
    topScenarios: projects
      .slice()
      .sort((a, b) => num(b.scenarioPlan?.bullCase?.score) - num(a.scenarioPlan?.bullCase?.score))
      .slice(0, 25)
      .map(compact),
    researchQueue: projects
      .filter((project) => (project.autonomousResearchTasks || []).some((task) => task.priority === "High"))
      .slice(0, 50)
      .map(compact),
    quantumBrain: projects
      .slice()
      .sort((a, b) => num(b.quantumBrainScore) - num(a.quantumBrainScore))
      .slice(0, 25)
      .map(compact),
    worldModel: projects
      .slice()
      .sort((a, b) => num(b.worldModelScore) - num(a.worldModelScore))
      .slice(0, 25)
      .map(compact),
    marketScientist: projects
      .slice()
      .sort((a, b) => num(b.marketScientistScore) - num(a.marketScientistScore))
      .slice(0, 25)
      .map(compact),
  };
  const alphaLab = summarizeAlphaLab(projects);

  const researchOSPath = path.join(reportsDir, "research-os.json");
  const alphaLabPath = path.join(reportsDir, "alpha-lab.json");

  fs.writeFileSync(researchOSPath, JSON.stringify(researchOS, null, 2));
  fs.writeFileSync(alphaLabPath, JSON.stringify(alphaLab, null, 2));

  return {
    researchOSPath,
    alphaLabPath,
    researchOS,
    alphaLab,
  };
}
