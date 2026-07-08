/**
 * Quantum Outcome Field Engine
 *
 * Purpose:
 * Builds a deterministic multi-scenario outcome field for each project.
 * It estimates best/base/worst outcome paths using the project's current
 * signal profile, risk profile, liquidity, catalyst, social, and learning
 * signals. This is a research simulator, not a price prediction guarantee.
 */

const DEFAULT_SCENARIOS = Number(process.env.QUANTUM_FIELD_SCENARIOS || 384);

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function hashSeed(value = "") {
  let hash = 2166136261;
  const text = String(value);

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

function quantile(values = [], q = 0.5) {
  if (!values.length) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * q))
  );

  return sorted[index];
}

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + num(value), 0) / values.length;
}

function scoreSignalProfile(project = {}) {
  const narrative = clamp(
    num(project.signalProfile?.narrative) ||
      num(project.narrativeScore) * 0.4 +
        num(project.narrativeForecastScore) * 0.35 +
        num(project.infrastructureNarrativeScore) * 0.25
  );
  const launch = clamp(
    num(project.signalProfile?.launch) ||
      num(project.launchReadinessScore) * 0.4 +
        num(project.catalystCalendarScore) * 0.35 +
        num(project.exchangeProbabilityScore) * 0.25
  );
  const momentum = clamp(
    num(project.signalProfile?.momentum) ||
      num(project.momentumShiftScore) * 0.45 +
        num(project.accelerationScore) * 0.25 +
        num(project.earlyBreakoutScore) * 0.3
  );
  const flows = clamp(
    num(project.signalProfile?.flows) ||
      num(project.capitalFlowScore) * 0.35 +
        num(project.buyPressureScore) * 0.25 +
        num(project.liquidityScore) * 0.25 +
        num(project.liquidityExpansionScore) * 0.15
  );
  const smartMoney = clamp(
    num(project.signalProfile?.smartMoney) ||
      num(project.smartMoneyAccumulationScore) * 0.45 +
        num(project.smartWalletPerformanceScore) * 0.3 +
        num(project.whaleActivityScore ?? project.whaleScore) * 0.25
  );
  const social = clamp(
    num(project.signalProfile?.socialIntelligence) ||
      num(project.xSocialScore) * 0.55 +
        num(project.xSocialVelocityScore) * 0.25 +
        num(project.institutionalWatchScore) * 0.2
  );
  const learning = clamp(
    num(project.signalProfile?.learning) || num(project.learningEdgeScore)
  );
  const risk = clamp(
    num(project.signalProfile?.risk) ||
      num(project.riskScore) * 0.45 +
        num(project.sellPressureScore) * 0.25 +
        num(project.stakingRiskScore) * 0.2 +
        num(project.xBotRiskScore) * 0.1
  );

  return {
    narrative,
    launch,
    momentum,
    flows,
    smartMoney,
    social,
    learning,
    risk,
  };
}

function baseDrift(profile = {}, project = {}) {
  return (
    profile.narrative * 0.16 +
    profile.launch * 0.14 +
    profile.momentum * 0.18 +
    profile.flows * 0.16 +
    profile.smartMoney * 0.14 +
    profile.social * 0.1 +
    profile.learning * 0.08 +
    num(project.prePump?.score) * 0.1 -
    profile.risk * 0.18
  );
}

function volatilityFor(profile = {}, project = {}) {
  const baseVolatility =
    18 +
    profile.momentum * 0.22 +
    profile.social * 0.16 +
    num(project.volatilityExpansionScore) * 0.2 +
    profile.risk * 0.24;

  if (num(project.liquidityScore) >= 70 || num(project.liquidityUsd) >= 1000000) {
    return Math.max(12, baseVolatility - 8);
  }

  return baseVolatility;
}

function simulateOutcomes(project = {}, scenarioCount = DEFAULT_SCENARIOS) {
  const profile = scoreSignalProfile(project);
  const id = [
    project.chain,
    project.address,
    project.tokenAddress,
    project.pairAddress,
    project.symbol,
    project.name,
  ]
    .filter(Boolean)
    .join(":");
  const random = seededRandom(hashSeed(id || JSON.stringify(project).slice(0, 80)));
  const drift = baseDrift(profile, project);
  const volatility = volatilityFor(profile, project);
  const catalystBoost =
    profile.launch >= 70 || num(project.catalystScore) >= 70
      ? 18
      : profile.launch >= 55
      ? 9
      : 0;
  const smartMoneyBoost = profile.smartMoney >= 70 && profile.flows >= 60 ? 14 : 0;
  const collapseRisk =
    profile.risk * 0.45 +
    num(project.sellPressureScore) * 0.25 +
    num(project.stakingRiskScore) * 0.2 +
    num(project.xBotRiskScore) * 0.1;

  const outcomes = [];

  for (let index = 0; index < scenarioCount; index += 1) {
    const sentimentShock = (random() - 0.5) * volatility * 2;
    const liquidityShock = (random() - 0.5) * Math.max(8, volatility * 0.6);
    const catalystHit = random() < profile.launch / 140 ? catalystBoost : 0;
    const smartMoneyHit = random() < profile.smartMoney / 150 ? smartMoneyBoost : 0;
    const riskEvent = random() < collapseRisk / 180 ? collapseRisk * -0.9 : 0;
    const socialReflexivity =
      random() < profile.social / 130 ? profile.social * 0.22 : profile.social * -0.05;
    const learningTilt = (profile.learning - 50) * 0.18;

    outcomes.push(
      Math.round(
        drift +
          sentimentShock +
          liquidityShock +
          catalystHit +
          smartMoneyHit +
          riskEvent +
          socialReflexivity +
          learningTilt -
          20
      )
    );
  }

  return {
    profile,
    outcomes,
  };
}

function classifyField(expectedReturnPct = 0, collapseProbability = 0) {
  if (collapseProbability >= 35) return "Fragile Field";
  if (expectedReturnPct >= 80) return "Explosive Field";
  if (expectedReturnPct >= 45) return "Asymmetric Upside";
  if (expectedReturnPct >= 20) return "Positive Skew";
  if (expectedReturnPct >= 0) return "Neutral Field";
  return "Negative Skew";
}

export function analyzeQuantumOutcomeField(project = {}, options = {}) {
  const scenarioCount = Number(options.scenarios || DEFAULT_SCENARIOS);
  const { profile, outcomes } = simulateOutcomes(project, scenarioCount);
  const expectedReturnPct = Math.round(average(outcomes));
  const bestCaseReturnPct = quantile(outcomes, 0.9);
  const baseCaseReturnPct = quantile(outcomes, 0.5);
  const worstCaseReturnPct = quantile(outcomes, 0.1);
  const positiveProbability = Math.round(
    (outcomes.filter((outcome) => outcome > 0).length / outcomes.length) * 100
  );
  const doubleProbability = Math.round(
    (outcomes.filter((outcome) => outcome >= 100).length / outcomes.length) * 100
  );
  const collapseProbability = Math.round(
    (outcomes.filter((outcome) => outcome <= -40).length / outcomes.length) * 100
  );
  const asymmetryRatio = Number(
    (Math.abs(bestCaseReturnPct) / Math.max(1, Math.abs(worstCaseReturnPct))).toFixed(2)
  );
  const quantumOpportunityScore = Math.round(
    clamp(
      positiveProbability * 0.28 +
        doubleProbability * 0.22 +
        clamp(expectedReturnPct + 20) * 0.24 +
        clamp(asymmetryRatio * 20) * 0.16 -
        collapseProbability * 0.3
    )
  );
  const fieldState = classifyField(expectedReturnPct, collapseProbability);

  return {
    ...project,
    quantumOpportunityScore,
    quantumFieldState: fieldState,
    quantumOutcomeField: {
      scenarioCount,
      expectedReturnPct,
      bestCaseReturnPct,
      baseCaseReturnPct,
      worstCaseReturnPct,
      positiveProbability,
      doubleProbability,
      collapseProbability,
      asymmetryRatio,
      fieldState,
      signalProfile: profile,
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Quantum Outcome Field Engine",
        signal: "Scenario-tested opportunity distribution",
        score: quantumOpportunityScore,
        confidence: Math.min(0.9, scenarioCount / 500),
        impact:
          quantumOpportunityScore >= 70
            ? "Positive"
            : collapseProbability >= 35
            ? "Negative"
            : "Neutral",
        reasons: [
          `${scenarioCount} deterministic scenario paths tested.`,
          `Expected return field: ${expectedReturnPct}%.`,
          `Best/base/worst: ${bestCaseReturnPct}% / ${baseCaseReturnPct}% / ${worstCaseReturnPct}%.`,
          `Positive probability: ${positiveProbability}%, collapse probability: ${collapseProbability}%.`,
        ],
      },
    ],
  };
}

export function analyzeQuantumOutcomeFieldBatch(projects = [], options = {}) {
  return projects.map((project) => analyzeQuantumOutcomeField(project, options));
}
