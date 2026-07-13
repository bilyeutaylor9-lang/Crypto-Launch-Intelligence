import fs from "fs";
import path from "path";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function row(project = {}, rank = 0) {
  return {
    rank,
    name: project.name || "Unknown",
    symbol: project.symbol || "Unknown",
    chain: project.chain || "unknown",
    pipelineRank: project.pipelineRank || null,
    pipelineScore: project.pipelineScore || 0,
    highTechAlphaRank: project.highTechAlphaRank || rank,
    highTechAlphaScore: project.highTechAlphaScore || 0,
    verdict: project.highTechAlphaVerdict || "Unknown",
    confidence: project.highTechAlphaConfidence || "Unknown",
    commandDecision: project.highTechAlphaStack?.commandDecision || "",
    moduleCount: project.highTechAlphaStack?.moduleCount || 0,
    moduleScores: project.highTechModuleScores || {},
    strongestModules: project.highTechAlphaStack?.strongestModules || [],
    weakestModules: project.highTechAlphaStack?.weakestModules || [],
    blockers: project.highTechAlphaStack?.blockers || [],
    promotionTriggers: project.highTechAlphaStack?.promotionTriggers || [],
    killSwitches: project.highTechAlphaStack?.killSwitches || [],
    breakoutBrainScore: project.breakoutBrainScore || 0,
    breakoutProbabilitySoon: project.breakoutProbabilitySoon || 0,
    autonomousAlphaOSScore: project.autonomousAlphaOSScore || 0,
    sourceTruthScore: project.sourceTruthScore || 0,
    proofScore: project.proofScore || 0,
    trapRiskScore: project.trapRiskScore || 0,
  };
}

export function writeHighTechAlphaStackReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const ranked = [...projects]
    .filter((project) => project.highTechAlphaStack)
    .sort((a, b) => num(b.highTechAlphaScore) - num(a.highTechAlphaScore));
  const report = {
    generatedAt: new Date().toISOString(),
    description:
      "High-Tech Alpha Stack adds ten modules: meta-consensus, contradiction resolution, alpha half-life, liquidity stress, manipulation firewall, catalyst chain reaction, narrative rotation, portfolio fit, evidence gaps, and execution readiness.",
    totalProjects: projects.length,
    scoredProjects: ranked.length,
    alphaCandidates: ranked.filter((project) => project.highTechAlphaVerdict === "High-Tech Alpha Candidate").length,
    priorityResearch: ranked.filter((project) => project.highTechAlphaVerdict === "High-Tech Priority Research").length,
    moduleNames: [
      "Meta-Consensus Lattice",
      "Contradiction Resolver",
      "Alpha Half-Life Model",
      "Liquidity Stress Test",
      "Manipulation Firewall",
      "Catalyst Chain Reaction Map",
      "Narrative Rotation Radar",
      "Portfolio Fit Optimizer",
      "Evidence Gap Radar",
      "Execution Readiness Planner",
    ],
    topProjects: ranked.slice(0, 25).map((project, index) => row(project, index + 1)),
  };
  const filePath = path.join(reportsDir, "high-tech-alpha-stack.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return { filePath, report };
}
