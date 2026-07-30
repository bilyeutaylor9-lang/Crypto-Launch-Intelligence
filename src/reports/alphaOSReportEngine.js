import fs from "fs";
import path from "path";
import { summarizeAutonomousStrategyLab } from "../engines/autonomousStrategyLabEngine.js";
import { summarizeCausalAlphaBrain } from "../engines/causalAlphaBrainEngine.js";
import { summarizeAutonomousAlphaOS } from "../engines/autonomousAlphaOSEngine.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function compact(project = {}) {
  return {
    rank: project.autonomousAlphaOSRank || project.pipelineRank || 0,
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    pipelineScore: project.pipelineScore || 0,
    strategyLabScore: project.strategyLabScore || 0,
    strategyLabVerdict: project.strategyLabVerdict || "Unknown",
    bestStrategy: project.bestAutonomousStrategy?.name || "No Strategy",
    strategyReadinessPct: project.strategyReadinessPct || 0,
    paperTradeScore: project.paperTradeScore || 0,
    paperTradingPlan: project.paperTradingPlan || {},
    causalAlphaScore: project.causalAlphaScore || 0,
    causalAlphaVerdict: project.causalAlphaVerdict || "Unknown",
    causalAlphaConfidence: project.causalAlphaConfidence || "Unknown",
    primaryDriver: project.causalSignalGraph?.primaryDriver || null,
    primaryBlocker: project.causalSignalGraph?.primaryBlocker || null,
    causalCounterfactuals: project.causalCounterfactuals || [],
    autonomousAlphaOSScore: project.autonomousAlphaOSScore || 0,
    autonomousAlphaOSVerdict: project.autonomousAlphaOSVerdict || "Unknown",
    autonomousAlphaOSMode: project.autonomousAlphaOSMode || "Unknown",
    autonomousAlphaOSConsensus: project.autonomousAlphaOSCouncil?.consensus || "Unknown",
    autonomousAlphaOSNextActions: project.autonomousAlphaOSNextActions || [],
    paperOutcomeLabScore: project.paperOutcomeLabScore || 0,
    paperOutcomeLabVerdict: project.paperOutcomeLabVerdict || "Unknown",
    paperStrategyWinRate: project.paperStrategyWinRate || 0,
    autoLearningWeightScore: project.autoLearningWeightScore || 0,
    autoLearningWeightVerdict: project.autoLearningWeightVerdict || "Unknown",
    sourceTruthScore: project.sourceTruthScore || 0,
    sourceTruthVerdict: project.sourceTruthVerdict || "Unknown",
    githubProScore: project.githubProScore || 0,
    githubProVerdict: project.githubProVerdict || "Unknown",
    risk: Math.max(
      num(project.trapRiskScore),
      num(project.sellPressureScore),
      num(project.externalRiskScore),
      num(project.tokenUnlockRiskScore),
      num(project.vestingPressureScore),
      num(project.falsePositiveSimilarity)
    ),
  };
}

export function writeAlphaOSReports(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const safeProjects = Array.isArray(projects) ? projects : [];
  const strategyLab = summarizeAutonomousStrategyLab(safeProjects);
  const causalBrain = summarizeCausalAlphaBrain(safeProjects);
  const alphaOSSummary = summarizeAutonomousAlphaOS(safeProjects, meta);
  const alphaOS = {
    ...alphaOSSummary,
    topStrategyCandidates: [...safeProjects]
      .sort((a, b) => num(b.strategyLabScore) - num(a.strategyLabScore))
      .slice(0, 30)
      .map(compact),
    topCausalCandidates: [...safeProjects]
      .sort((a, b) => num(b.causalAlphaScore) - num(a.causalAlphaScore))
      .slice(0, 30)
      .map(compact),
    topOSCandidates: alphaOSSummary.status === "PASS"
      ? [...safeProjects]
        .filter((project) =>
          project.autonomousAlphaOSVerdict ||
          (Object.prototype.hasOwnProperty.call(project, "autonomousAlphaOSScore") &&
            project.autonomousAlphaOSScore !== null &&
            Number.isFinite(Number(project.autonomousAlphaOSScore)))
        )
        .sort((a, b) => num(b.autonomousAlphaOSScore) - num(a.autonomousAlphaOSScore))
        .slice(0, 50)
        .map(compact)
      : [],
  };
  const strategyLabPath = path.join(reportsDir, "strategy-lab.json");
  const causalBrainPath = path.join(reportsDir, "causal-alpha-brain.json");
  const alphaOSPath = path.join(reportsDir, "autonomous-alpha-os.json");

  fs.writeFileSync(strategyLabPath, JSON.stringify(strategyLab, null, 2));
  fs.writeFileSync(causalBrainPath, JSON.stringify(causalBrain, null, 2));
  fs.writeFileSync(alphaOSPath, JSON.stringify(alphaOS, null, 2));

  return {
    strategyLabPath,
    causalBrainPath,
    alphaOSPath,
    strategyLab,
    causalBrain,
    alphaOS,
  };
}
