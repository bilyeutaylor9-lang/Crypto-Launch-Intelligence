import { loadScanMemory } from "../learning/scanMemoryStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

const STRATEGIES = [
  {
    id: "ai_narrative_low_trap",
    name: "AI Narrative Low-Trap Breakout",
    description: "AI/narrative heat plus low trap risk and improving confidence.",
    match: (project) =>
      num(project.narrativeHeatScore) >= 70 &&
      num(project.trapRiskScore) < 45 &&
      num(project.confidenceAdjustedScore) >= 45,
  },
  {
    id: "liquidity_flow_catalyst",
    name: "Liquidity Flow Catalyst",
    description: "Liquidity/flow strength with catalyst timing.",
    match: (project) =>
      num(project.signalProfile?.flows) >= 55 &&
      num(project.catalystCalendarScore || project.catalystScore) >= 55 &&
      num(project.sellPressureScore) < 60,
  },
  {
    id: "proof_backed_pre_strong_buy",
    name: "Proof-Backed Pre-Strong Buy",
    description: "AI council pre-strong-buy with proof and evidence improving.",
    match: (project) =>
      ["Pre-Strong Buy", "AI Strong Buy"].includes(project.strongBuyLifecycleStage) &&
      num(project.proofScore) >= 55 &&
      num(project.dataConfidenceScore) >= 58,
  },
  {
    id: "risk_off_survivor",
    name: "Risk-Off Survivor",
    description: "Defensive setup with low trap risk and stronger source/data confidence.",
    match: (project) =>
      num(project.trapRiskScore) < 25 &&
      num(project.dataConfidenceScore) >= 65 &&
      num(project.sourceReliabilityScore) >= 45,
  },
];

function historicalStats(strategy = {}) {
  const records = loadScanMemory();
  const matches = records.filter((record) => {
    const scores = record.scores || {};
    const synthetic = {
      narrativeHeatScore: scores.narrativeHeat || scores.narrativeForecast || scores.narrative,
      confidenceAdjustedScore: scores.confidenceAdjusted || scores.pipeline,
      trapRiskScore: scores.trapRisk || scores.risk,
      proofScore: scores.proof,
      dataConfidenceScore: record.signals?.dataConfidenceScore,
      sourceReliabilityScore: scores.sourceReliability,
      sellPressureScore: scores.sellPressure,
      catalystCalendarScore: scores.catalystCalendar,
      catalystScore: scores.catalyst,
      signalProfile: { flows: scores.capitalFlow || scores.liquidity },
      strongBuyLifecycleStage: record.signals?.strongBuyLifecycleStage,
    };
    return strategy.match(synthetic);
  });
  const sampleSize = matches.length;
  const averageScore = sampleSize
    ? Math.round(matches.reduce((sum, record) => sum + num(record.scores?.pipeline), 0) / sampleSize)
    : 0;
  const estimatedWinRate = Math.round(clamp(42 + Math.min(25, sampleSize) + Math.max(0, averageScore - 55) * 0.5));
  const trapRate = Math.round(clamp(28 - Math.max(0, averageScore - 50) * 0.3 - Math.min(12, sampleSize / 2)));

  return {
    sampleSize,
    averageScore,
    estimatedWinRate,
    trapRate,
    status:
      sampleSize >= 20 && estimatedWinRate >= 58 && trapRate <= 22
        ? "Promote"
        : sampleSize >= 8
        ? "Paper Test"
        : "Cold Start",
  };
}

function matchStrategies(project = {}) {
  return STRATEGIES.filter((strategy) => strategy.match(project)).map((strategy) => {
    const stats = historicalStats(strategy);
    return {
      id: strategy.id,
      name: strategy.name,
      description: strategy.description,
      ...stats,
      confidence: stats.status === "Promote" ? "High" : stats.status === "Paper Test" ? "Medium" : "Low",
    };
  });
}

export function analyzeAutonomousAlphaLab(project = {}) {
  const matches = matchStrategies(project);
  const best = matches
    .slice()
    .sort((a, b) => b.estimatedWinRate - a.estimatedWinRate || a.trapRate - b.trapRate)[0];
  const alphaLabScore = best
    ? Math.round(clamp(best.estimatedWinRate * 0.72 + (100 - best.trapRate) * 0.28))
    : 0;

  return {
    ...project,
    alphaLabScore,
    alphaLabStrategies: matches,
    alphaLabBestStrategy: best || null,
    alphaLabStatus: best?.status || "No Match",
    metaCouncil: {
      approvedStrategies: matches.filter((strategy) => strategy.status === "Promote").map((strategy) => strategy.name),
      paperStrategies: matches.filter((strategy) => strategy.status === "Paper Test").map((strategy) => strategy.name),
      coldStartStrategies: matches.filter((strategy) => strategy.status === "Cold Start").map((strategy) => strategy.name),
      recommendation:
        best?.status === "Promote"
          ? "Strategy can influence live scoring."
          : best?.status === "Paper Test"
          ? "Keep strategy in simulation before promotion."
          : "Collect more examples before trusting this strategy.",
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Autonomous Alpha Lab",
        signal: "strategy discovery and simulation",
        score: alphaLabScore,
        confidence: best?.status === "Promote" ? 0.78 : best?.status === "Paper Test" ? 0.58 : 0.32,
        impact: alphaLabScore >= 65 ? "Positive" : "Neutral",
        reasons: best
          ? [`Best strategy: ${best.name}.`, `Estimated win rate ${best.estimatedWinRate}%, trap rate ${best.trapRate}%.`]
          : ["No active alpha-lab strategy matched this project."],
      },
    ],
  };
}

export function analyzeAutonomousAlphaLabBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeAutonomousAlphaLab);
}

export function summarizeAlphaLab(projects = []) {
  const strategyMap = new Map();

  for (const project of projects) {
    for (const strategy of project.alphaLabStrategies || []) {
      const current = strategyMap.get(strategy.id) || {
        ...strategy,
        activeProjects: 0,
        projects: [],
      };
      current.activeProjects += 1;
      current.projects.push(project.name || project.symbol || "Unknown");
      strategyMap.set(strategy.id, current);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    totalProjects: projects.length,
    activeStrategyCount: strategyMap.size,
    strategies: [...strategyMap.values()].sort((a, b) => b.estimatedWinRate - a.estimatedWinRate),
    selfCritique: [
      "Promote strategies only after enough outcome examples exist.",
      "Treat cold-start strategies as hypotheses, not proven alpha.",
      "High narrative heat without liquidity/proof confirmation should remain capped.",
    ],
  };
}
