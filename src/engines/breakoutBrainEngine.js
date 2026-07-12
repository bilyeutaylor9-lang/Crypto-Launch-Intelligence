/**
 * Breakout Brain Engine
 *
 * Purpose:
 * Runs thousands of deterministic Monte Carlo-style scenario paths and marks
 * the top three best-available near-term breakout research candidates.
 *
 * This is a research-ranking engine, not a prediction guarantee or financial advice.
 */

const DEFAULT_SIMULATIONS = Number(
  process.env.BREAKOUT_BRAIN_SIMULATIONS ||
    process.env.QUANTUM_FIELD_SCENARIOS ||
    4096
);
const DEFAULT_MIN_SELECTIONS = Number(process.env.BREAKOUT_BRAIN_MIN_SELECTIONS || 3);

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function hashSeed(value = "") {
  let hash = 2166136261;
  const text = String(value || "breakout-brain");

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededRandom(seed = 1) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + num(value), 0) / values.length;
}

function quantile(values = [], q = 0.5) {
  if (!values.length) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * q))
  );

  return sorted[index];
}

function weightedAverage(items = []) {
  const active = items.filter((item) => num(item.score) > 0);

  if (!active.length) return 0;

  const total = active.reduce((sum, item) => sum + num(item.score) * item.weight, 0);
  const weight = active.reduce((sum, item) => sum + item.weight, 0);

  return clamp(total / weight);
}

function profileFor(project = {}) {
  const risk = weightedAverage([
    { score: project.trapRiskScore, weight: 1.2 },
    { score: project.riskScore, weight: 1.0 },
    { score: project.sellPressureScore, weight: 0.9 },
    { score: project.externalRiskScore, weight: 0.7 },
    { score: project.tokenUnlockRiskScore, weight: 0.7 },
    { score: project.vestingPressureScore, weight: 0.7 },
    { score: project.quantumOutcomeField?.collapseProbability, weight: 0.8 },
  ]);

  return {
    narrative: weightedAverage([
      { score: project.narrativeHeatScore, weight: 1.1 },
      { score: project.narrativeForecastScore, weight: 1.0 },
      { score: project.narrativeScore, weight: 0.8 },
      { score: project.infrastructureNarrativeScore, weight: 0.7 },
    ]),
    catalyst: weightedAverage([
      { score: project.catalystCalendarScore, weight: 1.0 },
      { score: project.liveCatalystRadarScore, weight: 1.1 },
      { score: project.roadmapProfitabilityScore, weight: 0.9 },
      { score: project.exchangeProbabilityScore, weight: 0.7 },
      { score: project.launchReadinessScore, weight: 0.8 },
    ]),
    momentum: weightedAverage([
      { score: project.earlyBreakoutScore, weight: 1.1 },
      { score: project.momentumShiftScore, weight: 1.0 },
      { score: project.accelerationScore, weight: 0.9 },
      { score: project.velocityScore, weight: 0.7 },
      { score: project.volatilityExpansionScore, weight: 0.7 },
    ]),
    flows: weightedAverage([
      { score: project.capitalFlowScore, weight: 1.0 },
      { score: project.buyPressureScore, weight: 1.0 },
      { score: project.liquidityExpansionScore, weight: 0.9 },
      { score: project.liquidityScore, weight: 0.8 },
    ]),
    smartMoney: weightedAverage([
      { score: project.smartMoneyAccumulationScore, weight: 1.1 },
      { score: project.smartWalletPerformanceScore, weight: 0.9 },
      { score: project.smartWalletScore, weight: 0.8 },
      { score: project.whaleActivityScore ?? project.whaleScore, weight: 0.8 },
    ]),
    social: weightedAverage([
      { score: project.xSocialScore, weight: 1.0 },
      { score: project.socialAccelerationScore, weight: 0.9 },
      { score: project.externalSignalScore, weight: 0.7 },
      { score: project.institutionalWatchScore, weight: 0.7 },
    ]),
    proof: weightedAverage([
      { score: project.proofScore, weight: 1.0 },
      { score: project.evidenceQualityScore, weight: 0.8 },
      { score: project.sourceReliabilityScore, weight: 0.8 },
      { score: project.sourceTruthScore, weight: 0.8 },
      { score: project.dataConfidenceScore, weight: 0.7 },
    ]),
    learning: weightedAverage([
      { score: project.prePump?.score, weight: 1.1 },
      { score: project.prePumpPatternScore, weight: 1.0 },
      { score: project.outcomeLearningScore, weight: 0.9 },
      { score: project.signalCombinationScore, weight: 0.9 },
      { score: project.autoLearningWeightScore, weight: 0.8 },
    ]),
    institutional: weightedAverage([
      { score: project.autonomousAlphaOSScore, weight: 1.0 },
      { score: project.causalAlphaScore, weight: 0.9 },
      { score: project.strategyLabScore, weight: 0.9 },
      { score: project.simulationBrainScore, weight: 0.9 },
      { score: project.aiEcosystemScore, weight: 0.8 },
      { score: project.institutionalVNextScore, weight: 0.8 },
    ]),
    risk,
    antiChase:
      project.prePump?.status === "ALREADY_PUMPED"
        ? 100
        : project.prePump?.status === "LATE_CHASE"
        ? 65
        : 0,
  };
}

function breakoutDrift(profile = {}, project = {}) {
  return (
    profile.narrative * 0.16 +
    profile.catalyst * 0.15 +
    profile.momentum * 0.18 +
    profile.flows * 0.15 +
    profile.smartMoney * 0.14 +
    profile.social * 0.1 +
    profile.learning * 0.12 +
    profile.institutional * 0.12 -
    profile.risk * 0.2 -
    profile.antiChase * 0.24 -
    24
  );
}

function volatility(profile = {}, project = {}) {
  const liquidityDampener =
    num(project.liquidityUsd) >= 1_000_000 || profile.flows >= 70
      ? 8
      : profile.flows < 35
      ? -8
      : 0;

  return clamp(
    18 +
      profile.momentum * 0.2 +
      profile.social * 0.15 +
      num(project.volatilityExpansionScore) * 0.2 +
      profile.risk * 0.22 -
      liquidityDampener,
    10,
    95
  );
}

function runSimulations(project = {}, profile = {}, simulations = DEFAULT_SIMULATIONS) {
  const id = [
    project.chain,
    project.address,
    project.pairAddress,
    project.symbol,
    project.name,
  ]
    .filter(Boolean)
    .join(":");
  const random = seededRandom(hashSeed(id || JSON.stringify(project).slice(0, 120)));
  const drift = breakoutDrift(profile, project);
  const vol = volatility(profile, project);
  const catalystChance = clamp(profile.catalyst * 0.72 + profile.proof * 0.12, 5, 78) / 100;
  const smartMoneyChance = clamp(profile.smartMoney * 0.64 + profile.flows * 0.12, 4, 70) / 100;
  const socialChance = clamp(profile.social * 0.7, 3, 74) / 100;
  const riskChance = clamp(profile.risk * 0.7 + profile.antiChase * 0.2, 2, 82) / 100;
  const returns = [];

  for (let index = 0; index < simulations; index += 1) {
    const sentimentShock = (random() - 0.5) * vol * 2.4;
    const liquidityShock = (random() - 0.5) * Math.max(10, vol * 0.75);
    const catalystHit = random() < catalystChance ? profile.catalyst * (0.22 + random() * 0.42) : 0;
    const smartMoneyHit = random() < smartMoneyChance ? profile.smartMoney * (0.18 + random() * 0.34) : 0;
    const socialReflexivity = random() < socialChance ? profile.social * (0.12 + random() * 0.34) : 0;
    const learningTilt = (profile.learning - 50) * (0.1 + random() * 0.14);
    const riskEvent = random() < riskChance ? -profile.risk * (0.2 + random() * 0.75) : 0;
    const chasePenalty = profile.antiChase ? -profile.antiChase * (0.15 + random() * 0.35) : 0;

    returns.push(
      Math.round(
        drift +
          sentimentShock +
          liquidityShock +
          catalystHit +
          smartMoneyHit +
          socialReflexivity +
          learningTilt +
          riskEvent +
          chasePenalty
      )
    );
  }

  return returns;
}

function topDrivers(profile = {}) {
  return [
    ["Narrative", profile.narrative],
    ["Catalyst", profile.catalyst],
    ["Momentum", profile.momentum],
    ["Flows", profile.flows],
    ["Smart Money", profile.smartMoney],
    ["Social", profile.social],
    ["Learning", profile.learning],
    ["Institutional Stack", profile.institutional],
  ]
    .map(([driver, score]) => ({ driver, score: Math.round(score) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function breakoutDecision(score = 0, probabilities = {}, selected = false) {
  if (selected && score >= 72 && probabilities.collapseProbability <= 28) {
    return "Top Breakout Candidate";
  }
  if (selected) return "Best Available Breakout Candidate";
  if (score >= 72) return "Breakout Watch";
  if (score >= 55) return "Developing Breakout";
  return "Low Breakout Priority";
}

export function analyzeBreakoutBrain(project = {}, options = {}) {
  const simulations = Math.max(1000, Number(options.simulations || DEFAULT_SIMULATIONS));
  const profile = profileFor(project);
  const returns = runSimulations(project, profile, simulations);
  const expectedReturn30dPct = Math.round(average(returns));
  const bestCaseReturnPct = quantile(returns, 0.9);
  const baseCaseReturnPct = quantile(returns, 0.5);
  const bearCaseReturnPct = quantile(returns, 0.1);
  const positiveProbability = Math.round((returns.filter((value) => value > 0).length / returns.length) * 100);
  const breakoutProbability = Math.round((returns.filter((value) => value >= 40).length / returns.length) * 100);
  const doubleProbability = Math.round((returns.filter((value) => value >= 100).length / returns.length) * 100);
  const tripleProbability = Math.round((returns.filter((value) => value >= 200).length / returns.length) * 100);
  const collapseProbability = Math.round((returns.filter((value) => value <= -35).length / returns.length) * 100);
  const asymmetry =
    Math.abs(bestCaseReturnPct) / Math.max(1, Math.abs(bearCaseReturnPct));
  const proofGap = Math.max(0, 58 - profile.proof);
  const riskPenalty = profile.risk * 0.2 + collapseProbability * 0.18 + profile.antiChase * 0.16;
  const breakoutBrainScore = Math.round(
    clamp(
      positiveProbability * 0.16 +
        breakoutProbability * 0.26 +
        doubleProbability * 0.16 +
        tripleProbability * 0.08 +
        clamp(expectedReturn30dPct + 20) * 0.16 +
        clamp(asymmetry * 18) * 0.1 +
        profile.proof * 0.08 -
        riskPenalty -
        proofGap * 0.12
    )
  );
  const confidenceScore = Math.round(
    clamp(profile.proof * 0.42 + num(project.dataConfidenceScore) * 0.24 + (100 - profile.risk) * 0.22 + profile.flows * 0.12)
  );

  return {
    ...project,
    breakoutBrainScore,
    breakoutBrainConfidenceScore: confidenceScore,
    breakoutBrainConfidence:
      confidenceScore >= 78 ? "High" : confidenceScore >= 58 ? "Medium" : confidenceScore >= 38 ? "Developing" : "Low",
    breakoutProbabilitySoon: breakoutProbability,
    blowUpProbabilitySoon: breakoutProbability,
    breakoutExpectedReturn30dPct: expectedReturn30dPct,
    breakoutBestCaseReturnPct: bestCaseReturnPct,
    breakoutBearCaseReturnPct: bearCaseReturnPct,
    breakoutMonteCarlo: {
      simulations,
      simulationMode: "deterministic seeded Monte Carlo quantum scenario field",
      expectedReturn30dPct,
      bestCaseReturnPct,
      baseCaseReturnPct,
      bearCaseReturnPct,
      positiveProbability,
      breakoutProbability,
      doubleProbability,
      tripleProbability,
      collapseProbability,
      asymmetryRatio: Number(asymmetry.toFixed(2)),
      confidenceScore,
      profile: Object.fromEntries(
        Object.entries(profile).map(([key, value]) => [key, Math.round(value)])
      ),
      topDrivers: topDrivers(profile),
      riskControls: [
        collapseProbability >= 30 ? "Collapse probability elevated; require liquidity/proof confirmation." : "Collapse probability acceptable for research queue.",
        profile.antiChase > 0 ? "Anti-chase penalty active; avoid late entries until reset." : "No major anti-chase state detected.",
        profile.proof < 58 ? "Proof gap remains; verify roadmap, liquidity, team, and source stack." : "Proof stack is strong enough for deeper review.",
      ],
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Breakout Brain Engine",
        signal: "near-term breakout Monte Carlo scenario ranking",
        score: breakoutBrainScore,
        confidence: confidenceScore / 100,
        impact: breakoutBrainScore >= 72 ? "Strong Positive" : breakoutBrainScore >= 55 ? "Positive" : "Neutral",
        reasons: [
          `${simulations} scenario paths tested.`,
          `Breakout probability ${breakoutProbability}%; double probability ${doubleProbability}%; collapse probability ${collapseProbability}%.`,
          `Top drivers: ${topDrivers(profile).map((item) => item.driver).join(", ") || "none"}.`,
        ],
      },
    ],
  };
}

export function analyzeBreakoutBrainBatch(projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const minSelections = Math.max(1, Number(options.minSelections || DEFAULT_MIN_SELECTIONS));
  const analyzed = safeProjects.map((project) => analyzeBreakoutBrain(project, options));
  const ranked = [...analyzed].sort((a, b) => {
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
  const selected = new Map(
    ranked.slice(0, Math.min(minSelections, ranked.length)).map((project, index) => [
      project,
      index + 1,
    ])
  );
  const rankByProject = new Map(ranked.map((project, index) => [project, index + 1]));

  return analyzed
    .map((project) => {
      const selectedRank = selected.get(project) || null;
      const rank = rankByProject.get(project) || 0;
      const decision = breakoutDecision(
        project.breakoutBrainScore,
        project.breakoutMonteCarlo,
        Boolean(selectedRank)
      );

      return {
        ...project,
        breakoutBrainRank: rank,
        breakoutBrainSelected: Boolean(selectedRank),
        breakoutBrainSelectionRank: selectedRank,
        breakoutBrainDecision: decision,
        breakoutBrainVerdict: decision,
        breakoutBrainGuarantee:
          selectedRank !== null
            ? "Selected by top-three best-available guarantee"
            : "Not selected by top-three best-available guarantee",
      };
    })
    .sort((a, b) => num(a.pipelineRank || a.breakoutBrainRank) - num(b.pipelineRank || b.breakoutBrainRank));
}
