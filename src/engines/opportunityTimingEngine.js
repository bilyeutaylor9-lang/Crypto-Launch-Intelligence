// src/engines/opportunityTimingEngine.js

/**
 * Opportunity Timing Engine
 *
 * Purpose:
 * Evaluates whether a project is entering a favorable
 * timing window based on momentum, catalysts, liquidity,
 * smart-wallet rotation, and risk stability.
 */

export function scoreOpportunityTiming(project = {}) {
  return timingModel(project).score;
}

export function classifyOpportunityTiming(score = 0) {
  if (score >= 85) return "prime timing window";
  if (score >= 65) return "favorable timing";
  if (score >= 45) return "early timing";
  return "not ready";
}

export function analyzeOpportunityTiming(project = {}) {
  const timing = timingModel(project);
  const opportunityTimingScore = timing.score;

  return {
    ...project,
    opportunityTimingScore,
    opportunityTimingLevel: classifyOpportunityTiming(opportunityTimingScore),
    opportunityTimingComponents: timing.components,
    opportunityTimingRisks: timing.risks,
    lateChaseRiskScore: timing.risks.lateChaseRisk,
    timingWindowReasons: timing.reasons,

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Opportunity Timing Engine",
        signal: "Favorable timing window",
        confidence: Math.min(opportunityTimingScore / 100, 1),
        impact: opportunityTimingScore >= 60 ? "Positive" : "Neutral",
        components: timing.components
      }
    ],

    alerts: [
      ...(project.alerts || []),
      ...(opportunityTimingScore >= 80
        ? ["Prime opportunity timing window detected."]
        : [])
    ]
  };
}

export function analyzeOpportunityTimingBatch(projects = []) {
  return projects
    .map(analyzeOpportunityTiming)
    .sort((a, b) => b.opportunityTimingScore - a.opportunityTimingScore);
}

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function weighted(items = []) {
  const active = items.filter((item) => Number.isFinite(Number(item.score)));
  const weight = active.reduce((sum, item) => sum + item.weight, 0);
  if (!weight) return 0;
  return Math.round(
    clamp(active.reduce((sum, item) => sum + clamp(item.score) * item.weight, 0) / weight)
  );
}

function inverseRisk(value = 0) {
  return 100 - clamp(value);
}

function scoreLeadIndicator(leader = 0, lagging = 0) {
  const lead = clamp(leader);
  const lag = clamp(lagging);
  return Math.round(clamp(50 + lead * 0.62 - lag * 0.38));
}

function alreadyPumpedRisk(project = {}) {
  return Math.max(
    clamp(num(project.priceChange24h) * 1.5),
    clamp(num(project.priceChange7d) * 0.8),
    clamp(num(project.priceChange30d) * 0.35),
    clamp(num(project.alreadyPumpedRiskScore)),
    clamp(num(project.lateChaseRiskScore))
  );
}

function catalystCountdownScore(project = {}) {
  const events = [
    ...(Array.isArray(project.liveCatalystEvents) ? project.liveCatalystEvents : []),
    ...(Array.isArray(project.catalystTimeline) ? project.catalystTimeline : []),
  ];
  const days = events
    .map((event) => event.daysUntil ?? event.daysAway ?? event.windowDays)
    .filter((value) => Number.isFinite(Number(value)))
    .map(Number)
    .sort((a, b) => a - b)[0];

  if (days !== undefined) {
    if (days <= 1) return 82;
    if (days <= 3) return 95;
    if (days <= 7) return 90;
    if (days <= 14) return 78;
    if (days <= 30) return 62;
    return 42;
  }

  return weighted([
    { score: project.liveCatalystRadarScore, weight: 1.2 },
    { score: project.catalystCalendarScore, weight: 1.0 },
    { score: project.catalystScore, weight: 0.8 },
    { score: project.roadmapCatalystProfitScore, weight: 0.8 },
  ]);
}

function timingModel(project = {}) {
  const pumpedRisk = alreadyPumpedRisk(project);
  const narrativeSaturation = Math.max(
    clamp(project.narrativeSaturationScore),
    clamp(project.socialAccelerationScore),
    clamp(project.xSocialScore),
    clamp(project.narrativeHeatScore)
  );
  const lateChaseRisk = Math.round(
    clamp(pumpedRisk * 0.55 + narrativeSaturation * 0.25 + clamp(project.sellPressureScore) * 0.2)
  );
  const components = {
    notAlreadyPumped: inverseRisk(pumpedRisk),
    breakoutDistance: weighted([
      { score: project.momentumCompressionScore, weight: 1.2 },
      { score: project.preBreakoutMomentumScore, weight: 1.0 },
      { score: project.earlyBreakoutScore, weight: 0.8 },
      { score: project.volatilityExpansionScore, weight: 0.6 },
    ]),
    liquidityBeforePrice: scoreLeadIndicator(
      Math.max(num(project.liquidityExpansionScore), num(project.activeLiquidityTruthScore), num(project.liquidityGrowthPct24h)),
      Math.max(num(project.priceChange24h), num(project.priceChange7d) * 0.5)
    ),
    buyersBeforeRetail: scoreLeadIndicator(
      Math.max(num(project.buyPressureScore), num(project.organicBuyerScore), num(project.buyerGrowthPct24h)),
      Math.max(num(project.socialAccelerationScore), num(project.xSocialScore), num(project.narrativeHeatScore) * 0.65)
    ),
    smartWalletBeforeRetail: scoreLeadIndicator(
      Math.max(num(project.smartWalletArrivalScore), num(project.smartMoneyAccumulationScore), num(project.smartMoneyRotationScore)),
      Math.max(num(project.xSocialScore), num(project.socialAccelerationScore), num(project.volumeChange24hPct) * 0.5)
    ),
    catalystCountdown: catalystCountdownScore(project),
    unsaturatedNarrative: inverseRisk(narrativeSaturation),
    priceCompression: weighted([
      { score: project.momentumCompressionScore, weight: 1.0 },
      { score: project.volatilityCompressionScore, weight: 0.8 },
      { score: project.quietAccumulationScore, weight: 0.8 },
    ]),
    momentumFreshness: weighted([
      { score: project.accelerationScore, weight: 1.0 },
      { score: project.velocityScore, weight: 0.9 },
      { score: project.trendChangeScore, weight: 0.8 },
      { score: project.momentumShiftScore, weight: 0.8 },
      { score: project.capitalFlowScore, weight: 0.7 },
    ]),
    lowSellPressure: inverseRisk(project.sellPressureScore),
  };

  const raw = weighted([
    { score: components.notAlreadyPumped, weight: 14 },
    { score: components.breakoutDistance, weight: 12 },
    { score: components.liquidityBeforePrice, weight: 12 },
    { score: components.buyersBeforeRetail, weight: 11 },
    { score: components.smartWalletBeforeRetail, weight: 11 },
    { score: components.catalystCountdown, weight: 10 },
    { score: components.unsaturatedNarrative, weight: 8 },
    { score: components.priceCompression, weight: 9 },
    { score: components.momentumFreshness, weight: 9 },
    { score: components.lowSellPressure, weight: 4 },
  ]);
  const riskPenalty = lateChaseRisk >= 70 ? 14 : lateChaseRisk >= 55 ? 7 : 0;
  const score = Math.round(clamp(raw - riskPenalty));
  const reasons = Object.entries(components)
    .filter(([, value]) => num(value) >= 65)
    .sort((a, b) => num(b[1]) - num(a[1]))
    .slice(0, 5)
    .map(([key, value]) => `${key}: ${Math.round(value)}`);

  return {
    score,
    components,
    risks: {
      alreadyPumpedRisk: Math.round(clamp(pumpedRisk)),
      narrativeSaturation: Math.round(clamp(narrativeSaturation)),
      lateChaseRisk,
    },
    reasons,
  };
}
