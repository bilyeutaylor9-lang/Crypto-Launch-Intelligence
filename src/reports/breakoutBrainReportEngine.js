import fs from "fs";
import path from "path";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function projectRow(project = {}, rank = 0) {
  return {
    rank,
    selected: Boolean(project.breakoutBrainSelected),
    selectionRank: project.breakoutBrainSelectionRank || null,
    name: project.name || "Unknown",
    symbol: project.symbol || "Unknown",
    chain: project.chain || "unknown",
    pipelineRank: project.pipelineRank || null,
    pipelineScore: project.pipelineScore || 0,
    breakoutBrainScore: project.breakoutBrainScore || 0,
    breakoutBrainDecision: project.breakoutBrainDecision || "Unknown",
    breakoutProbabilitySoon: project.breakoutProbabilitySoon || 0,
    blowUpProbabilitySoon: project.blowUpProbabilitySoon || 0,
    expectedReturn30dPct: project.breakoutExpectedReturn30dPct || 0,
    bestCaseReturnPct: project.breakoutBestCaseReturnPct || 0,
    bearCaseReturnPct: project.breakoutBearCaseReturnPct || 0,
    confidence: project.breakoutBrainConfidence || "Unknown",
    confidenceScore: project.breakoutBrainConfidenceScore || 0,
    simulations: project.breakoutMonteCarlo?.simulations || 0,
    positiveProbability: project.breakoutMonteCarlo?.positiveProbability || 0,
    doubleProbability: project.breakoutMonteCarlo?.doubleProbability || 0,
    tripleProbability: project.breakoutMonteCarlo?.tripleProbability || 0,
    collapseProbability: project.breakoutMonteCarlo?.collapseProbability || 0,
    asymmetryRatio: project.breakoutMonteCarlo?.asymmetryRatio || 0,
    topDrivers: project.breakoutMonteCarlo?.topDrivers || [],
    riskControls: project.breakoutMonteCarlo?.riskControls || [],
    alphaTags: project.alphaTags || [],
    riskFlags: project.riskFlags || [],
    thesis: project.opportunityThesis || "",
  };
}

export function writeBreakoutBrainReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const ranked = [...projects]
    .filter((project) => project.breakoutMonteCarlo)
    .sort((a, b) => {
      const aScore =
        num(a.breakoutBrainScore) * 0.5 +
        num(a.breakoutProbabilitySoon) * 0.24 +
        num(a.breakoutExpectedReturn30dPct) * 0.14 -
        num(a.breakoutMonteCarlo?.collapseProbability) * 0.18 +
        num(a.breakoutBrainConfidenceScore) * 0.12;
      const bScore =
        num(b.breakoutBrainScore) * 0.5 +
        num(b.breakoutProbabilitySoon) * 0.24 +
        num(b.breakoutExpectedReturn30dPct) * 0.14 -
        num(b.breakoutMonteCarlo?.collapseProbability) * 0.18 +
        num(b.breakoutBrainConfidenceScore) * 0.12;

      return bScore - aScore;
    });
  const selected = ranked
    .filter((project) => project.breakoutBrainSelected)
    .sort((a, b) => num(a.breakoutBrainSelectionRank) - num(b.breakoutBrainSelectionRank));
  const topBoard = ranked.slice(0, 25);

  const report = {
    generatedAt: new Date().toISOString(),
    description:
      "Breakout Brain ranks near-term breakout research candidates using deterministic Monte Carlo quantum scenario simulations. It is not financial advice.",
    totalProjects: projects.length,
    simulatedProjects: ranked.length,
    selectedCount: selected.length,
    requiredSelections: Number(process.env.BREAKOUT_BRAIN_MIN_SELECTIONS || 3),
    defaultSimulations: Number(
      process.env.BREAKOUT_BRAIN_SIMULATIONS ||
        process.env.QUANTUM_FIELD_SCENARIOS ||
        4096
    ),
    topThree: selected.map((project, index) => projectRow(project, index + 1)),
    breakoutBoard: topBoard.map((project, index) => projectRow(project, index + 1)),
  };

  const filePath = path.join(reportsDir, "breakout-brain.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return { filePath, report };
}
