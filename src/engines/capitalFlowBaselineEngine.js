import { normalizeCapitalFlowObservation } from "../data/capitalFlowNormalizer.js";
import { loadCapitalFlowObservations } from "../data/capitalFlowObservationStore.js";
import { numberOrNull, percentRatio } from "../math/numericSafety.js";
import { ewma, median, medianAbsoluteDeviation, percentileRank, robustZScore } from "../math/robustStatistics.js";
import { elapsedSeconds, velocity, acceleration, forwardReturnPct, priceFlowGap } from "../math/timeSeriesMetrics.js";

const WINDOWS = Object.freeze({
  "5m": 5 * 60,
  "15m": 15 * 60,
  "1h": 60 * 60,
  "4h": 4 * 60 * 60,
  "24h": 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
});

function byProject(observations = []) {
  const grouped = new Map();
  for (const observation of observations) {
    if (!observation.canonicalProjectId) continue;
    const current = grouped.get(observation.canonicalProjectId) || [];
    current.push(observation);
    grouped.set(observation.canonicalProjectId, current);
  }
  for (const rows of grouped.values()) {
    rows.sort((a, b) => Date.parse(a.observedAt || 0) - Date.parse(b.observedAt || 0));
  }
  return grouped;
}

function windowSummary(rows = [], seconds = 3600, now = new Date()) {
  const cutoff = now.getTime() - seconds * 1000;
  const scoped = rows.filter((row) => Date.parse(row.observedAt || "") >= cutoff);
  const netFlows = scoped.map((row) => numberOrNull(row.netFlowUsd)).filter((value) => value !== null);
  const positiveNetFlows = netFlows.filter((value) => value > 0);
  return {
    observedWindows: scoped.length,
    netFlowUsd: netFlows.length ? netFlows.reduce((sum, value) => sum + value, 0) : null,
    medianNetFlowUsd: median(netFlows),
    minimumNetFlowUsd: netFlows.length ? Math.min(...netFlows) : null,
    positiveWindowRatio: scoped.length ? positiveNetFlows.length / scoped.length : null,
    ewmaNetFlowUsd: ewma(netFlows, { halfLife: Math.max(1, scoped.length / 2) }),
  };
}

function consecutivePositive(rows = []) {
  let count = 0;
  for (const row of [...rows].reverse()) {
    const flow = numberOrNull(row.netFlowUsd);
    if (flow === null || flow <= 0) break;
    count += 1;
  }
  return count;
}

function newestPair(rows = []) {
  if (rows.length < 2) return [null, rows.at(-1) || null];
  return [rows.at(-2), rows.at(-1)];
}

function baselineFor(current = {}, rows = [], allObservations = []) {
  const [previous, latest] = newestPair(rows);
  const currentObservation = latest || current;
  const elapsed = previous && currentObservation ? elapsedSeconds(previous.observedAt, currentObservation.observedAt) : null;
  const previousFlowVelocity = rows.length >= 3
    ? velocity(rows.at(-3)?.netFlowUsd, previous?.netFlowUsd, elapsedSeconds(rows.at(-3)?.observedAt, previous?.observedAt))
    : null;
  const currentFlowVelocity = previous && currentObservation
    ? velocity(previous.netFlowUsd, currentObservation.netFlowUsd, elapsed)
    : null;
  const flowAcceleration = previousFlowVelocity !== null && currentFlowVelocity !== null
    ? acceleration(previousFlowVelocity, currentFlowVelocity, elapsed)
    : null;
  const flowPopulation = rows.map((row) => row.netFlowUsd);
  const priceReturns = rows.slice(1).map((row, index) => forwardReturnPct(rows[index].priceUsd, row.priceUsd));
  const netFlowChanges = rows.slice(1).map((row, index) => {
    const previousFlow = numberOrNull(rows[index].netFlowUsd);
    const nextFlow = numberOrNull(row.netFlowUsd);
    return previousFlow === null || nextFlow === null ? null : nextFlow - previousFlow;
  });
  const netFlowGrowthZ = robustZScore(netFlowChanges.at(-1), netFlowChanges);
  const priceReturnZ = robustZScore(priceReturns.at(-1), priceReturns);
  const allFlows = allObservations.map((row) => row.netFlowUsd);
  const dexLiquidity = numberOrNull(currentObservation.dexLiquidityUsd);
  const marketCap = numberOrNull(currentObservation.circulatingMarketCapUsd);
  const netFlow = numberOrNull(currentObservation.netFlowUsd);
  const buyVolume = numberOrNull(currentObservation.buyVolumeUsd);
  const sellVolume = numberOrNull(currentObservation.sellVolumeUsd);
  const buyTransactions = numberOrNull(currentObservation.buyTransactions);
  const sellTransactions = numberOrNull(currentObservation.sellTransactions);
  const previousBuyTransactions = numberOrNull(previous?.buyTransactions);
  const previousSellTransactions = numberOrNull(previous?.sellTransactions);
  const currentTransactions = buyTransactions !== null || sellTransactions !== null
    ? (buyTransactions || 0) + (sellTransactions || 0)
    : null;
  const previousTransactions = previousBuyTransactions !== null || previousSellTransactions !== null
    ? (previousBuyTransactions || 0) + (previousSellTransactions || 0)
    : null;
  const currentUniqueBuyers = numberOrNull(currentObservation.uniqueBuyers);
  const previousUniqueBuyers = numberOrNull(previous?.uniqueBuyers);
  const liquidityAdded = numberOrNull(currentObservation.liquidityAddedUsd);
  const liquidityRemoved = numberOrNull(currentObservation.liquidityRemovedUsd);
  const previousLiquidity = numberOrNull(previous?.dexLiquidityUsd);
  const currentLiquidity = dexLiquidity;

  return {
    observationCount: rows.length,
    previousObservationAt: previous?.observedAt || null,
    latestObservationAt: currentObservation.observedAt || null,
    netFlowUsd: netFlow,
    trailingMedianNetFlowUsd: median(flowPopulation),
    trailingMadNetFlowUsd: medianAbsoluteDeviation(flowPopulation),
    netFlowRobustZ: robustZScore(netFlow, flowPopulation),
    peerFlowPercentile: percentileRank(netFlow, allFlows),
    flowToLiquidityPct: percentRatio(netFlow, dexLiquidity, { denominatorFloor: 1000 }),
    flowToMarketCapPct: percentRatio(netFlow, marketCap, { denominatorFloor: 10000 }),
    buySellVolumeRatio: buyVolume !== null && sellVolume !== null && sellVolume > 0 ? buyVolume / sellVolume : null,
    buyerSellerRatio: buyTransactions !== null && sellTransactions !== null && sellTransactions > 0 ? buyTransactions / sellTransactions : null,
    uniqueBuyerGrowthPct: currentUniqueBuyers !== null && previousUniqueBuyers !== null
      ? percentRatio(currentUniqueBuyers - previousUniqueBuyers, previousUniqueBuyers, { denominatorFloor: 1 })
      : null,
    transactionGrowthPct: currentTransactions !== null && previousTransactions !== null
      ? percentRatio(currentTransactions - previousTransactions, previousTransactions, { denominatorFloor: 1 })
      : null,
    volumeAcceleration: null,
    flowVelocity: currentFlowVelocity,
    flowAcceleration,
    normalizedFlowAcceleration: flowAcceleration === null
      ? null
      : flowAcceleration / Math.max(1, Math.abs(median(flowPopulation) || 0)),
    liquidityGrowthPct: previousLiquidity !== null && currentLiquidity !== null
      ? percentRatio(currentLiquidity - previousLiquidity, previousLiquidity, { denominatorFloor: 1000 })
      : percentRatio(liquidityAdded, dexLiquidity, { denominatorFloor: 1000 }),
    liquidityRemovalPct: percentRatio(liquidityRemoved, dexLiquidity, { denominatorFloor: 1000 }),
    priceAcceleration: null,
    priceFlowGap: priceFlowGap(netFlowGrowthZ, priceReturnZ),
    flowPersistence: {
      positiveWindowRatio: windowSummary(rows, WINDOWS["24h"]).positiveWindowRatio,
      flowSignConsistency: windowSummary(rows, WINDOWS["24h"]).positiveWindowRatio,
      medianNetFlow: windowSummary(rows, WINDOWS["24h"]).medianNetFlowUsd,
      minimumNetFlow: windowSummary(rows, WINDOWS["24h"]).minimumNetFlowUsd,
      consecutivePositiveWindows: consecutivePositive(rows),
      exponentiallyWeightedNetFlow: windowSummary(rows, WINDOWS["24h"]).ewmaNetFlowUsd,
      flowReversalFrequency: rows.length <= 1
        ? null
        : rows.slice(1).filter((row, index) => Math.sign(numberOrNull(row.netFlowUsd) || 0) !== Math.sign(numberOrNull(rows[index].netFlowUsd) || 0)).length / (rows.length - 1),
    },
    rollingWindows: Object.fromEntries(
      Object.entries(WINDOWS).map(([label, seconds]) => [label, windowSummary(rows, seconds)])
    ),
    observationCoveragePct: Math.round(
      [
        currentObservation.canonicalProjectId,
        currentObservation.chainId,
        currentObservation.tokenAddress,
        currentObservation.poolAddress,
        currentObservation.priceUsd,
        currentObservation.dexLiquidityUsd,
        currentObservation.netFlowUsd,
        currentObservation.uniqueBuyers,
      ].filter((value) => value !== null && value !== undefined && value !== "").length / 8 * 100
    ),
    sourceFreshnessScore: currentObservation.sourceTimestamp
      ? Math.round(Math.max(0, Math.min(100, 100 * Math.exp(-Math.log(2) * ((Date.now() - Date.parse(currentObservation.sourceTimestamp)) / 1000) / WINDOWS["1h"]))))
      : 35,
  };
}

export function analyzeCapitalFlowBaseline(project = {}, options = {}) {
  const currentObservation = normalizeCapitalFlowObservation(project, options);
  const history = options.observations || loadCapitalFlowObservations({ limit: options.historyLimit || 10000 });
  const grouped = byProject([...history, currentObservation]);
  const projectRows = grouped.get(currentObservation.canonicalProjectId) || [currentObservation];
  const baseline = baselineFor(currentObservation, projectRows, [...history, currentObservation]);

  return {
    ...project,
    capitalFlowObservation: currentObservation,
    capitalFlowBaseline: baseline,
    capitalFlowBaselineStatus: baseline.observationCount >= 2 ? "TRACKED" : "PRELIMINARY",
  };
}

export function analyzeCapitalFlowBaselineBatch(projects = [], options = {}) {
  const history = options.observations || loadCapitalFlowObservations({ limit: options.historyLimit || 10000 });
  return (Array.isArray(projects) ? projects : []).map((project) =>
    analyzeCapitalFlowBaseline(project, { ...options, observations: history })
  );
}
