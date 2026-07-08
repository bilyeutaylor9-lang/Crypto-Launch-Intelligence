import { loadScanMemory } from "../learning/scanMemoryStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function scoresFromProject(project = {}) {
  return {
    narrative: num(project.narrativeScore),
    narrativeForecast: num(project.narrativeForecastScore),
    launch: num(project.launchReadinessScore),
    launchStaking: num(project.narrativeLaunchStakingScore),
    liquidity: num(project.liquidityScore),
    liquidityExpansion: num(project.liquidityExpansionScore),
    momentum: num(project.momentumShiftScore),
    acceleration: num(project.accelerationScore),
    capitalFlow: num(project.capitalFlowScore),
    buyPressure: num(project.buyPressureScore),
    smartMoney: num(project.smartMoneyAccumulationScore),
    smartWallet: num(project.smartWalletPerformanceScore),
    catalyst: num(project.catalystScore),
    catalystCalendar: num(project.catalystCalendarScore),
    xSocial: num(project.xSocialScore),
    institutionalWatch: num(project.institutionalWatchScore),
    learning: num(project.learningEdgeScore),
    outcomeLearning: num(project.outcomeLearningScore),
    quantum: num(project.quantumOpportunityScore),
    collapse: num(project.quantumOutcomeField?.collapseProbability),
    risk: num(project.riskScore),
    sellPressure: num(project.sellPressureScore),
    stakingMomentum: num(project.stakingMomentumScore),
    stakingRisk: num(project.stakingRiskScore),
    pipeline: num(project.pipelineScore ?? project.opportunityScore ?? project.score),
  };
}

function scoresFromRecord(record = {}) {
  const scores = record.scores || {};
  const signals = record.signals || {};

  return {
    narrative: num(scores.narrative),
    narrativeForecast: num(scores.narrativeForecast),
    launch: num(scores.launchReadiness),
    launchStaking: num(scores.narrativeLaunchStaking),
    liquidity: num(scores.liquidity),
    liquidityExpansion: num(scores.liquidityExpansion),
    momentum: num(scores.momentumShift),
    acceleration: num(scores.acceleration),
    capitalFlow: num(scores.capitalFlow),
    buyPressure: num(scores.buyPressure),
    smartMoney: num(scores.smartMoneyAccumulation),
    smartWallet: num(scores.smartWalletPerformance),
    catalyst: num(scores.catalyst),
    catalystCalendar: num(scores.catalystCalendar),
    xSocial: num(scores.xSocial),
    institutionalWatch: num(scores.institutionalWatch),
    learning: num(scores.learningEdge),
    outcomeLearning: num(scores.outcomeLearning),
    quantum: num(scores.quantumOpportunity),
    collapse: num(signals.quantumOutcomeField?.collapseProbability),
    risk: num(scores.risk),
    sellPressure: num(scores.sellPressure),
    stakingMomentum: num(scores.stakingMomentum),
    stakingRisk: num(scores.stakingRisk),
    pipeline: num(scores.pipeline),
  };
}

const COMBO_RULES = [
  {
    id: "narrative_launch_liquidity",
    name: "Narrative + launch + liquidity",
    type: "winner",
    weight: 10,
    match: (s) =>
      Math.max(s.narrative, s.narrativeForecast) >= 65 &&
      Math.max(s.launch, s.launchStaking, s.catalystCalendar) >= 55 &&
      Math.max(s.liquidity, s.liquidityExpansion) >= 55,
  },
  {
    id: "smart_money_flow",
    name: "Smart money plus capital flow",
    type: "winner",
    weight: 11,
    match: (s) =>
      Math.max(s.smartMoney, s.smartWallet) >= 65 &&
      Math.max(s.capitalFlow, s.buyPressure, s.liquidityExpansion) >= 60,
  },
  {
    id: "momentum_catalyst",
    name: "Momentum plus catalyst window",
    type: "winner",
    weight: 8,
    match: (s) =>
      Math.max(s.momentum, s.acceleration) >= 60 &&
      Math.max(s.catalyst, s.catalystCalendar) >= 60,
  },
  {
    id: "learning_confirmed_asymmetry",
    name: "Learning-confirmed asymmetry",
    type: "winner",
    weight: 9,
    match: (s) =>
      Math.max(s.learning, s.outcomeLearning) >= 65 &&
      (s.quantum === 0 || s.quantum >= 55) &&
      s.risk < 70,
  },
  {
    id: "quantum_asymmetry",
    name: "Quantum upside without collapse",
    type: "winner",
    weight: 8,
    match: (s) => s.quantum >= 65 && (s.collapse === 0 || s.collapse < 30),
  },
  {
    id: "institutional_social_flow",
    name: "Institutional attention with social and flow",
    type: "winner",
    weight: 9,
    match: (s) =>
      Math.max(s.institutionalWatch, s.xSocial) >= 70 &&
      Math.max(s.capitalFlow, s.buyPressure, s.liquidity) >= 55 &&
      s.risk < 70,
  },
  {
    id: "social_without_liquidity_trap",
    name: "Social heat without liquidity",
    type: "trap",
    weight: 12,
    match: (s) => s.xSocial >= 70 && Math.max(s.liquidity, s.liquidityExpansion) < 45,
  },
  {
    id: "staking_yield_risk_trap",
    name: "Staking hype with elevated yield risk",
    type: "trap",
    weight: 10,
    match: (s) =>
      Math.max(s.stakingMomentum, s.launchStaking) >= 60 &&
      Math.max(s.stakingRisk, s.risk) >= 60,
  },
  {
    id: "sell_pressure_risk_trap",
    name: "Sell pressure overrides signal quality",
    type: "trap",
    weight: 11,
    match: (s) =>
      Math.max(s.sellPressure, s.risk) >= 75 &&
      Math.max(s.momentum, s.xSocial, s.narrative) >= 60,
  },
  {
    id: "weak_confirmation_trap",
    name: "Single-signal setup without confirmation",
    type: "trap",
    weight: 7,
    match: (s) => {
      const active = [
        s.narrative,
        s.liquidity,
        s.momentum,
        s.smartMoney,
        s.catalyst,
        s.xSocial,
        s.learning,
      ].filter((score) => score >= 55).length;
      return active <= 1 && Math.max(s.xSocial, s.narrative, s.momentum) >= 65;
    },
  },
];

function learnComboPriors(memory = []) {
  const priors = new Map();

  for (const rule of COMBO_RULES) {
    priors.set(rule.id, {
      id: rule.id,
      samples: 0,
      avgScore: 0,
      strongRate: 0,
    });
  }

  for (const record of memory) {
    const scores = scoresFromRecord(record);
    const pipeline = scores.pipeline;

    for (const rule of COMBO_RULES) {
      if (!rule.match(scores)) continue;

      const current = priors.get(rule.id);
      const samples = current.samples + 1;
      current.avgScore = (current.avgScore * current.samples + pipeline) / samples;
      current.strongRate =
        (current.strongRate * current.samples + (pipeline >= 75 ? 100 : 0)) / samples;
      current.samples = samples;
    }
  }

  return priors;
}

function scoreCombo(rule = {}, prior = {}) {
  const learnedAdjustment =
    prior.samples >= 5
      ? clamp((prior.avgScore - 55) * 0.18 + (prior.strongRate - 35) * 0.08, -6, 8)
      : 0;
  const direction = rule.type === "trap" ? -1 : 1;

  return direction * (rule.weight + learnedAdjustment);
}

export function analyzeSignalCombinations(project = {}, context = {}) {
  const scores = scoresFromProject(project);
  const priors = context.priors || new Map();
  const activeCombinations = COMBO_RULES.filter((rule) => rule.match(scores)).map((rule) => {
    const prior = priors.get(rule.id) || {};

    return {
      id: rule.id,
      name: rule.name,
      type: rule.type,
      edge: Number(scoreCombo(rule, prior).toFixed(2)),
      learnedSamples: prior.samples || 0,
      learnedAverageScore: Math.round(prior.avgScore || 0),
      learnedStrongRate: Math.round(prior.strongRate || 0),
    };
  });

  const winningCombinations = activeCombinations.filter((combo) => combo.type === "winner");
  const trapCombinations = activeCombinations.filter((combo) => combo.type === "trap");
  const rawEdge = activeCombinations.reduce((sum, combo) => sum + combo.edge, 0);
  const comboScore = Math.round(clamp(50 + rawEdge));
  const summary =
    comboScore >= 70
      ? "Strong multi-signal recipe detected."
      : comboScore <= 38
      ? "Trap-style signal recipe detected."
      : "Signal combinations are mixed or early.";

  return {
    ...project,
    signalCombinationScore: comboScore,
    signalCombinationEdge: Number(rawEdge.toFixed(2)),
    activeSignalCombinations: activeCombinations,
    winningSignalCombinations: winningCombinations,
    trapSignalCombinations: trapCombinations,
    signalCombinations: {
      score: comboScore,
      edge: Number(rawEdge.toFixed(2)),
      activeCount: activeCombinations.length,
      winningCount: winningCombinations.length,
      trapCount: trapCombinations.length,
      summary,
      active: activeCombinations,
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Signal Combination Engine",
        signal: "Learned multi-signal recipes",
        score: comboScore,
        confidence: Math.min(0.9, 0.45 + activeCombinations.length * 0.08),
        impact: comboScore >= 65 ? "Positive" : comboScore <= 40 ? "Negative" : "Neutral",
        reasons: [
          `${winningCombinations.length} winning recipes and ${trapCombinations.length} trap recipes active.`,
          summary,
        ],
      },
    ],
  };
}

export function analyzeSignalCombinationsBatch(projects = []) {
  const priors = learnComboPriors(loadScanMemory());
  return projects.map((project) => analyzeSignalCombinations(project, { priors }));
}
