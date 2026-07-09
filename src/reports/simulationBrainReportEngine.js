import fs from "fs";
import path from "path";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function compact(project = {}) {
  return {
    rank: project.simulationPortfolioRank || 0,
    pipelineRank: project.pipelineRank || 0,
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "Unknown",
    simulationBrainScore: project.simulationBrainScore || 0,
    marketMemoryTwinScore: project.marketMemoryTwinScore || 0,
    simulationDecision: project.simulationDecision || "Unknown",
    simulationConfidence: project.simulationConfidence || "Unknown",
    breakoutProbability30d: project.breakoutProbability30d || 0,
    expectedReturn7dPct: project.expectedReturn7dPct || 0,
    expectedReturn30dPct: project.expectedReturn30dPct || 0,
    expectedReturn90dPct: project.expectedReturn90dPct || 0,
    bearCaseDrawdownPct: project.bearCaseDrawdownPct || 0,
    falsePositiveSimilarity: project.falsePositiveSimilarity || 0,
    closestMarketAnalogs: project.closestMarketAnalogs || [],
    simulatedScenarios: project.simulatedScenarios || {},
    signalMutationTests: project.signalMutationTests || [],
    engineTournament: project.engineTournament || {},
    adversarialSimulationReview: project.adversarialSimulationReview || {},
    portfolioBrain: project.portfolioBrain || {},
    aiCouncil: {
      verdict: project.aiEcosystemVerdict || "Unknown",
      score: project.aiEcosystemScore || 0,
      confidence: project.aiEcosystemConfidence || "Unknown",
    },
    researchOS: {
      lifecycleStage: project.strongBuyLifecycleStage || "Unknown",
      redTeamStatus: project.redTeamReview?.status || "Unknown",
      disagreement: project.aiDisagreement?.level || "Unknown",
    },
    quantum: {
      decisionState: project.quantumDecisionState || "Unknown",
      bull: project.quantumBullProbability || 0,
      bear: project.quantumBearProbability || 0,
      entropy: project.convictionEntropy || "Unknown",
    },
  };
}

export function writeSimulationBrainReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const sorted = [...projects].sort((a, b) => num(b.simulationBrainScore) - num(a.simulationBrainScore));
  const report = {
    generatedAt: new Date().toISOString(),
    totalProjects: projects.length,
    counts: {
      strongBuyCandidates: projects.filter((project) => project.simulationDecision === "Simulation Strong Buy Candidate").length,
      priorityWatch: projects.filter((project) => project.simulationDecision === "Simulation Priority Watch").length,
      blockedByAdversary: projects.filter((project) => project.adversarialSimulationReview?.status === "Block").length,
      highConfidence: projects.filter((project) => project.simulationConfidence === "High").length,
    },
    topSimulationCandidates: sorted.slice(0, 50).map(compact),
    strongBuyCandidates: sorted
      .filter((project) => project.simulationDecision === "Simulation Strong Buy Candidate")
      .slice(0, 25)
      .map(compact),
    adversarialBlocks: sorted
      .filter((project) => project.adversarialSimulationReview?.status === "Block")
      .sort((a, b) => num(b.falsePositiveSimilarity) - num(a.falsePositiveSimilarity))
      .slice(0, 25)
      .map(compact),
    highestBreakoutProbability: sorted
      .slice()
      .sort((a, b) => num(b.breakoutProbability30d) - num(a.breakoutProbability30d))
      .slice(0, 25)
      .map(compact),
    highestExpectedReturn30d: sorted
      .slice()
      .sort((a, b) => num(b.expectedReturn30dPct) - num(a.expectedReturn30dPct))
      .slice(0, 25)
      .map(compact),
  };
  const filePath = path.join(reportsDir, "simulation-brain.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}
