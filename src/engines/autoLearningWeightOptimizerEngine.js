import { summarizePaperTradingOutcomes } from "../learning/paperTradingOutcomeStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

const ENGINE_FAMILIES = [
  {
    id: "strategy",
    label: "Strategy Lab",
    projectScore: (project) => project.strategyLabScore,
    memoryScore: (memory) => memory.winRate,
  },
  {
    id: "causal",
    label: "Causal Brain",
    projectScore: (project) => project.causalAlphaScore,
    memoryScore: (memory) => 50 + memory.averageReturnPct,
  },
  {
    id: "simulation",
    label: "Simulation Brain",
    projectScore: (project) => project.simulationBrainScore,
    memoryScore: (memory) => memory.winRate,
  },
  {
    id: "proof",
    label: "Proof / Source",
    projectScore: (project) => Math.max(num(project.proofScore), num(project.sourceTruthScore), num(project.sourceReliabilityScore)),
    memoryScore: (memory) => 50 + Math.min(30, memory.evaluatedRecords),
  },
  {
    id: "risk",
    label: "Risk Governor",
    projectScore: (project) => 100 - Math.max(num(project.trapRiskScore), num(project.sellPressureScore), num(project.riskScore)),
    memoryScore: (memory) => 100 - Math.max(0, 50 - memory.winRate),
  },
  {
    id: "github",
    label: "GitHub Pro",
    projectScore: (project) => project.githubProScore,
    memoryScore: () => 50,
  },
];

function familyAverage(projects = [], family = {}) {
  const scores = projects.map((project) => num(family.projectScore(project))).filter((score) => score > 0);
  if (!scores.length) return 0;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

export function buildAutoLearningWeights(projects = [], memory = summarizePaperTradingOutcomes()) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const families = ENGINE_FAMILIES.map((family) => {
    const avgProjectScore = familyAverage(safeProjects, family);
    const memorySignal = clamp(family.memoryScore(memory));
    const confidence = Math.round(clamp((memory.evaluatedRecords || 0) * 3 + (avgProjectScore > 0 ? 30 : 0)));
    const weight = Number(
      (0.75 + clamp(avgProjectScore * 0.45 + memorySignal * 0.55) / 100 * 0.9).toFixed(2)
    );

    return {
      id: family.id,
      label: family.label,
      weight,
      avgProjectScore,
      memorySignal,
      confidence,
      action:
        confidence < 45
          ? "Collect More Outcomes"
          : weight >= 1.35
          ? "Increase Weight"
          : weight <= 1.0
          ? "Reduce Weight"
          : "Maintain",
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    memorySamples: memory.totalRecords || 0,
    evaluatedSamples: memory.evaluatedRecords || 0,
    globalPaperWinRate: memory.winRate || 0,
    globalAverageReturnPct: memory.averageReturnPct || 0,
    families,
    weights: Object.fromEntries(families.map((family) => [family.id, family.weight])),
  };
}

export function analyzeAutoLearningWeightOptimizerBatch(projects = []) {
  const memory = summarizePaperTradingOutcomes();
  const optimizer = buildAutoLearningWeights(projects, memory);
  const weights = optimizer.weights || {};

  return (Array.isArray(projects) ? projects : []).map((project) => {
    const optimizedScore = Math.round(
      clamp(
        num(project.strategyLabScore) * (weights.strategy || 1) * 0.16 +
          num(project.causalAlphaScore) * (weights.causal || 1) * 0.18 +
          num(project.simulationBrainScore) * (weights.simulation || 1) * 0.14 +
          Math.max(num(project.proofScore), num(project.sourceTruthScore), num(project.sourceReliabilityScore)) *
            (weights.proof || 1) *
            0.16 +
          (100 - Math.max(num(project.trapRiskScore), num(project.sellPressureScore), num(project.riskScore))) *
            (weights.risk || 1) *
            0.16 +
          num(project.githubProScore) * (weights.github || 1) * 0.08 +
          num(project.autonomousAlphaOSScore) * 0.12
      )
    );

    return {
      ...project,
      autoLearningWeightScore: optimizedScore,
      autoLearningWeightVerdict:
        optimizedScore >= 72
          ? "Weight-Optimized Priority"
          : optimizedScore >= 58
          ? "Weight-Optimized Watch"
          : "Needs More Learning",
      autoLearningWeights: optimizer.weights,
      autoLearningWeightOptimizer: optimizer,
      evidence: [
        ...(project.evidence || []),
        {
          engine: "Auto-Learning Weight Optimizer",
          signal: "paper outcome guided engine-family weight suggestions",
          score: optimizedScore,
          confidence: Math.min(0.82, 0.3 + (memory.evaluatedRecords || 0) / 60),
          impact: optimizedScore >= 65 ? "Positive" : "Neutral",
          reasons: [
            `Paper win rate ${memory.winRate || 0}% across ${memory.evaluatedRecords || 0} evaluated records.`,
          ],
        },
      ],
    };
  });
}

export function summarizeAutoLearningWeightOptimizer(projects = []) {
  return buildAutoLearningWeights(projects);
}
