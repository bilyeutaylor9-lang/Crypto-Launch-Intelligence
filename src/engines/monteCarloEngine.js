// src/engines/monteCarloEngine.js

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function randomNormal() {
  let u = 0;
  let v = 0;

  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();

  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function getBaseVolatility(project = {}) {
  const priceChange = Math.abs(num(project.priceChange24h));
  const volatilityScore = num(project.volatilityExpansionScore);

  return Math.max(
    0.03,
    Math.min(0.35, priceChange / 100 || volatilityScore / 300 || 0.08)
  );
}

function getDrift(project = {}) {
  const signalScore = num(project.pipelineScore ?? project.opportunityScore ?? project.score);
  const momentum = num(project.momentumShiftScore);
  const capitalFlow = num(project.capitalFlowScore);
  const buyPressure = num(project.buyPressureScore);
  const smartMoney = num(project.smartMoneyAccumulationScore);
  const catalyst = num(project.catalystScore ?? project.catalystCalendarScore);
  const risk = num(project.riskScore);
  const sellPressure = num(project.sellPressureScore);

  const positive =
    signalScore * 0.25 +
    momentum * 0.15 +
    capitalFlow * 0.15 +
    buyPressure * 0.12 +
    smartMoney * 0.18 +
    catalyst * 0.15;

  const negative = risk * 0.18 + sellPressure * 0.15;

  return (positive - negative - 45) / 1000;
}

function percentile(values = [], p = 50) {
  if (!values.length) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((p / 100) * (sorted.length - 1));

  return sorted[index];
}

export function runMonteCarlo(project = {}, options = {}) {
  const simulations = Number(options.simulations || 1000);
  const days = Number(options.days || 180);
  const startPrice = num(project.priceUsd ?? project.price) || 1;

  const drift = getDrift(project);
  const dailyVolatility = getBaseVolatility(project);

  const finalPrices = [];
  const returns = [];

  for (let i = 0; i < simulations; i++) {
    let price = startPrice;

    for (let day = 0; day < days; day++) {
      const shock = randomNormal() * dailyVolatility;
      const dailyReturn = drift + shock;

      price = Math.max(0.00000001, price * Math.exp(dailyReturn));
    }

    finalPrices.push(price);
    returns.push(((price - startPrice) / startPrice) * 100);
  }

  const medianReturn = percentile(returns, 50);
  const bearReturn = percentile(returns, 10);
  const bullReturn = percentile(returns, 90);
  const moonshotReturn = percentile(returns, 95);

  const probability2x = returns.filter((r) => r >= 100).length / simulations;
  const probability5x = returns.filter((r) => r >= 400).length / simulations;
  const probability10x = returns.filter((r) => r >= 900).length / simulations;
  const probabilityLoss = returns.filter((r) => r < 0).length / simulations;

  const monteCarloScore = clamp(
    probability2x * 35 +
      probability5x * 30 +
      probability10x * 25 +
      Math.max(0, medianReturn) * 0.1 -
      probabilityLoss * 20
  );

  return {
    simulations,
    days,
    startPrice,
    drift,
    dailyVolatility,

    bearCasePrice: percentile(finalPrices, 10),
    medianPrice: percentile(finalPrices, 50),
    bullCasePrice: percentile(finalPrices, 90),
    moonshotPrice: percentile(finalPrices, 95),

    bearReturn,
    medianReturn,
    bullReturn,
    moonshotReturn,

    probability2x: Number((probability2x * 100).toFixed(2)),
    probability5x: Number((probability5x * 100).toFixed(2)),
    probability10x: Number((probability10x * 100).toFixed(2)),
    probabilityLoss: Number((probabilityLoss * 100).toFixed(2)),

    monteCarloScore: Math.round(monteCarloScore),
  };
}

function levelForScore(score = 0) {
  if (score >= 85) return "asymmetric moonshot profile";
  if (score >= 70) return "strong upside profile";
  if (score >= 50) return "positive risk/reward";
  if (score >= 30) return "speculative setup";
  return "weak simulation profile";
}

export function analyzeMonteCarlo(project = {}, options = {}) {
  const monteCarlo = runMonteCarlo(project, options);
  const monteCarloLevel = levelForScore(monteCarlo.monteCarloScore);

  return {
    ...project,

    monteCarlo,
    monteCarloScore: monteCarlo.monteCarloScore,
    monteCarloLevel,

    intelligenceSignals: {
      ...(project.intelligenceSignals || {}),
      monteCarlo: {
        score: monteCarlo.monteCarloScore,
        level: monteCarloLevel,
        results: monteCarlo,
      },
    },

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Monte Carlo Engine",
        signal: "Probabilistic upside/downside simulation",
        score: monteCarlo.monteCarloScore,
        confidence: clamp(monteCarlo.monteCarloScore / 100, 0, 1),
        impact:
          monteCarlo.monteCarloScore >= 70
            ? "Strong Positive"
            : monteCarlo.monteCarloScore >= 50
            ? "Positive"
            : "Neutral",
        reasons: [
          `Median simulated return: ${monteCarlo.medianReturn.toFixed(2)}%.`,
          `2x probability: ${monteCarlo.probability2x}%.`,
          `5x probability: ${monteCarlo.probability5x}%.`,
          `Loss probability: ${monteCarlo.probabilityLoss}%.`,
        ],
      },
    ],

    alerts: [
      ...(project.alerts || []),
      ...(monteCarlo.monteCarloScore >= 85
        ? ["Monte Carlo shows asymmetric moonshot profile."]
        : monteCarlo.monteCarloScore >= 70
        ? ["Monte Carlo shows strong upside profile."]
        : []),
    ],
  };
}

export function analyzeMonteCarloBatch(projects = [], options = {}) {
  return projects
    .map((project) => analyzeMonteCarlo(project, options))
    .sort((a, b) => Number(b.monteCarloScore || 0) - Number(a.monteCarloScore || 0));
}
