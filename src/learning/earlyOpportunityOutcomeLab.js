function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function pctReturn(from, to) {
  if (!num(from) || !num(to)) return null;
  return Number((((num(to) - num(from)) / num(from)) * 100).toFixed(2));
}

function futureObservationAfter(observations = [], timestamp = "") {
  const base = Date.parse(timestamp || "");
  if (!Number.isFinite(base)) return [];
  return observations.filter((observation) => {
    const time = Date.parse(observation.observedAt || observation.timestamp || "");
    return Number.isFinite(time) && time > base;
  });
}

export function labelEarlyOpportunityOutcome(prediction = {}, observations = []) {
  const timestamp = prediction.predictionTimestamp || prediction.firstSeenAt || prediction.observedAt;
  const future = futureObservationAfter(observations, timestamp);
  const entryPrice = prediction.priceUsd ?? prediction.firstSeenPrice;
  if (!future.length || !num(entryPrice)) {
    return {
      status: "UNRESOLVED",
      reason: "Future observation after prediction timestamp is missing.",
      labels: {},
    };
  }
  const horizons = {
    return_1h: 1,
    return_6h: 6,
    return_24h: 24,
    return_3d: 72,
    return_7d: 168,
    return_30d: 720,
    return_90d: 2160,
  };
  const base = Date.parse(timestamp);
  const labels = {};
  for (const [field, hours] of Object.entries(horizons)) {
    const target = future.find((observation) => Date.parse(observation.observedAt || observation.timestamp) >= base + hours * 60 * 60 * 1000);
    labels[field] = target ? pctReturn(entryPrice, target.priceUsd ?? target.price) : null;
  }
  const returns = future.map((observation) => pctReturn(entryPrice, observation.priceUsd ?? observation.price)).filter((value) => value !== null);
  const drawdowns = returns.map((value) => Math.min(0, value));
  const maxReturn = returns.length ? Math.max(...returns) : null;
  const maxDrawdown = drawdowns.length ? Math.min(...drawdowns) : null;

  return {
    status: "LABELED",
    predictionTimestamp: timestamp,
    futureObservationCount: future.length,
    labels: {
      ...labels,
      hit_25pct_before_15pct_drawdown: maxReturn >= 25 && maxDrawdown >= -15,
      hit_50pct_before_25pct_drawdown: maxReturn >= 50 && maxDrawdown >= -25,
      hit_100pct_before_35pct_drawdown: maxReturn >= 100 && maxDrawdown >= -35,
      hit_300pct_before_60pct_drawdown: maxReturn >= 300 && maxDrawdown >= -60,
    },
    liquiditySurvival: future.some((observation) => num(observation.liquidityUsd) > 0),
    routeSurvival: future.some((observation) => observation.executionReady === true || observation.sellRouteAvailable === true),
  };
}

export function analyzeEarlyOpportunityOutcomes(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => ({
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || null,
    outcome: labelEarlyOpportunityOutcome(
      {
        predictionTimestamp: project.firstSeenAt || project.firstSeenOpportunity?.firstSeenAt,
        priceUsd: project.firstSeenOpportunity?.firstSeenPrice ?? project.priceUsd,
      },
      options.observations?.[project.projectId || project.symbol] || project.observations || []
    ),
  }));
}
