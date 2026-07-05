/**
 * Crypto Launch Intelligence
 * Signal Performance Engine
 *
 * Purpose:
 * Learns which intelligence signals historically led to strong outcomes.
 * This turns scan memory into a feedback loop.
 */

const DEFAULT_SIGNAL_KEYS = [
  "finalScore",
  "opportunityScore",
  "prePumpScore",
  "momentumScore",
  "narrativeScore",
  "liquidityScore",
  "smartMoneyScore",
  "smartWalletScore",
  "developerActivityScore",
  "githubScore",
  "communityGrowthScore",
  "socialAccelerationScore",
  "catalystScore",
  "partnershipScore",
  "tokenomicsScore",
  "riskScore"
];

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getPriceChange(project = {}) {
  return num(
    project.outcomeTracking?.outcome?.priceChangePct ??
      project.outcome?.priceChangePct ??
      project.priceChangePct
  );
}

function labelWinRate(priceChangePct = 0) {
  if (priceChangePct >= 50) return "winner";
  if (priceChangePct <= -20) return "loser";
  return "neutral";
}

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + num(value), 0) / values.length;
}

function median(values = []) {
  if (!values.length) return 0;

  const sorted = [...values].map((value) => num(value)).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
}

function percentile(values = [], percentileValue = 0.75) {
  if (!values.length) return 0;

  const sorted = [...values].map((value) => num(value)).sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(percentileValue * sorted.length))
  );

  return sorted[index];
}

function getSignalValue(project = {}, key = "") {
  return num(project[key]);
}

function analyzeSignal(projects = [], signalKey = "") {
  const samples = [];

  for (const project of projects) {
    const signalValue = getSignalValue(project, signalKey);
    const priceChangePct = getPriceChange(project);

    if (!Number.isFinite(signalValue)) continue;

    samples.push({
      signalValue,
      priceChangePct,
      label: labelWinRate(priceChangePct)
    });
  }

  const highSignalSamples = samples.filter((sample) => sample.signalValue >= 70);
  const winnerSamples = highSignalSamples.filter((sample) => sample.label === "winner");
  const loserSamples = highSignalSamples.filter((sample) => sample.label === "loser");

  const averageOutcome = average(highSignalSamples.map((sample) => sample.priceChangePct));
  const medianOutcome = median(highSignalSamples.map((sample) => sample.priceChangePct));

  return {
    signalKey,
    totalSamples: samples.length,
    highSignalSamples: highSignalSamples.length,
    highSignalWinRate:
      highSignalSamples.length > 0
        ? (winnerSamples.length / highSignalSamples.length) * 100
        : 0,
    highSignalLossRate:
      highSignalSamples.length > 0
        ? (loserSamples.length / highSignalSamples.length) * 100
        : 0,
    averageOutcome,
    medianOutcome,
    seventyFifthPercentileOutcome: percentile(
      highSignalSamples.map((sample) => sample.priceChangePct),
      0.75
    ),
    confidence:
      highSignalSamples.length >= 50
        ? "high"
        : highSignalSamples.length >= 20
          ? "medium"
          : highSignalSamples.length >= 8
            ? "low"
            : "insufficient"
  };
}

export function analyzeSignalPerformance(projects = [], signalKeys = DEFAULT_SIGNAL_KEYS) {
  const results = signalKeys.map((key) => analyzeSignal(projects, key));

  const rankedSignals = [...results].sort((a, b) => {
    if (b.highSignalWinRate !== a.highSignalWinRate) {
      return b.highSignalWinRate - a.highSignalWinRate;
    }

    return b.averageOutcome - a.averageOutcome;
  });

  return {
    generatedAt: new Date().toISOString(),
    sampleCount: projects.length,
    rankedSignals,
    strongestSignals: rankedSignals.slice(0, 10),
    weakestSignals: rankedSignals.slice(-10)
  };
}

export function attachSignalPerformanceSummary(projects = []) {
  const performance = analyzeSignalPerformance(projects);

  return projects.map((project) => ({
    ...project,
    signalPerformanceContext: {
      strongestHistoricalSignals: performance.strongestSignals.map((signal) => ({
        signalKey: signal.signalKey,
        winRate: Number(signal.highSignalWinRate.toFixed(2)),
        averageOutcome: Number(signal.averageOutcome.toFixed(2)),
        confidence: signal.confidence
      }))
    }
  }));
}

export default {
  analyzeSignalPerformance,
  attachSignalPerformanceSummary
};
