import fs from "fs";
import path from "path";
import { summarizePaperTradingOutcomeLab } from "../engines/paperTradingOutcomeLabEngine.js";
import { summarizeAutoLearningWeightOptimizer } from "../engines/autoLearningWeightOptimizerEngine.js";
import { summarizeSourceTruth } from "../engines/sourceTruthEngine.js";
import { summarizeGithubIntelligencePro } from "../engines/githubIntelligenceProEngine.js";
import { summarizeAutonomousAlphaOS } from "../engines/autonomousAlphaOSEngine.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function maxRisk(project = {}) {
  return Math.max(
    num(project.trapRiskScore),
    num(project.sellPressureScore),
    num(project.externalRiskScore),
    num(project.tokenUnlockRiskScore),
    num(project.vestingPressureScore),
    num(project.falsePositiveSimilarity)
  );
}

function compact(project = {}) {
  return {
    rank: project.autonomousAlphaOSRank || project.pipelineRank || 0,
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    pipelineScore: project.pipelineScore || 0,
    alphaOSScore: project.autonomousAlphaOSScore || 0,
    alphaOSVerdict: project.autonomousAlphaOSVerdict || "Unknown",
    autoLearningWeightScore: project.autoLearningWeightScore || 0,
    paperOutcomeLabScore: project.paperOutcomeLabScore || 0,
    paperOutcomeLabVerdict: project.paperOutcomeLabVerdict || "Unknown",
    strategy: project.bestAutonomousStrategy?.name || "No Strategy",
    strategyWinRate: project.paperStrategyWinRate || 0,
    causalDriver: project.causalSignalGraph?.primaryDriver?.label || "Unknown",
    sourceTruthScore: project.sourceTruthScore || 0,
    sourceTruthVerdict: project.sourceTruthVerdict || "Unknown",
    githubProScore: project.githubProScore || 0,
    githubProVerdict: project.githubProVerdict || "Unknown",
    risk: maxRisk(project),
    nextActions: project.autonomousAlphaOSNextActions || [],
  };
}

export function buildAlphaDashboardV2(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const alphaOS = summarizeAutonomousAlphaOS(safeProjects);
  const paperLab = summarizePaperTradingOutcomeLab(safeProjects);
  const optimizer = summarizeAutoLearningWeightOptimizer(safeProjects);
  const sourceTruth = summarizeSourceTruth(safeProjects);
  const githubPro = summarizeGithubIntelligencePro(safeProjects);
  const topCandidates = [...safeProjects]
    .sort(
      (a, b) =>
        num(b.autoLearningWeightScore || b.autonomousAlphaOSScore) -
        num(a.autoLearningWeightScore || a.autonomousAlphaOSScore)
    )
    .slice(0, 50)
    .map(compact);

  return {
    generatedAt: new Date().toISOString(),
    totalProjects: safeProjects.length,
    headline: {
      topCandidate: topCandidates[0] || null,
      alphaOSBrief: alphaOS.commanderBrief,
      paperWinRate: paperLab.memory?.winRate || 0,
      evaluatedPaperTrades: paperLab.memory?.evaluatedRecords || 0,
      bestSource: sourceTruth.sources?.[0] || null,
      bestGithubProject: githubPro.topRepositories?.[0] || null,
    },
    counts: {
      alphaOSStrongBuy: alphaOS.counts?.strongBuyResearch || 0,
      alphaOSBestAvailable: alphaOS.counts?.bestAvailable || 0,
      alphaOSPriority: alphaOS.counts?.priorityResearch || 0,
      paperPromotions: paperLab.promoteStrategyCount || 0,
      paperDowngrades: paperLab.downgradeStrategyCount || 0,
      verifiedSourceStacks: sourceTruth.verifiedStacks || 0,
      weakSourceStacks: sourceTruth.weakStacks || 0,
      eliteGithubSignals: githubPro.eliteBuilderSignals || 0,
      healthyGithubSignals: githubPro.healthyBuilderSignals || 0,
    },
    topCandidates,
    paperTradingOutcomeLab: paperLab,
    autoLearningWeightOptimizer: optimizer,
    sourceTruth,
    githubIntelligencePro: githubPro,
    operatorNotes: [
      "Treat every Alpha OS call as research until paper outcome history confirms the strategy.",
      "Increase trust only when source truth, causal driver, and paper outcome evidence agree.",
      "A best-available candidate is not a buy signal; it is the strongest candidate when the field is weak.",
    ],
  };
}

export function writeAlphaDashboardV2Report(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = buildAlphaDashboardV2(projects);
  const filePath = path.join(reportsDir, "alpha-dashboard-v2.json");
  const paperLabPath = path.join(reportsDir, "paper-trading-lab.json");
  const weightOptimizerPath = path.join(reportsDir, "weight-optimizer.json");
  const sourceTruthPath = path.join(reportsDir, "source-truth.json");
  const githubProPath = path.join(reportsDir, "github-intelligence-pro.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  fs.writeFileSync(paperLabPath, JSON.stringify(report.paperTradingOutcomeLab, null, 2));
  fs.writeFileSync(weightOptimizerPath, JSON.stringify(report.autoLearningWeightOptimizer, null, 2));
  fs.writeFileSync(sourceTruthPath, JSON.stringify(report.sourceTruth, null, 2));
  fs.writeFileSync(githubProPath, JSON.stringify(report.githubIntelligencePro, null, 2));

  return {
    filePath,
    paperLabPath,
    weightOptimizerPath,
    sourceTruthPath,
    githubProPath,
    report,
  };
}
