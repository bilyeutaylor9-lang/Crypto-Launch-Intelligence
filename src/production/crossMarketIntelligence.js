import { clamp, finite, mean } from "./productionMath.js";

function correlation(xs = [], ys = []) {
  const pairs = xs.map((x, i) => [finite(x), finite(ys[i])]).filter(([x, y]) => x !== null && y !== null);
  if (pairs.length < 8) return null;
  const mx = mean(pairs.map(([x]) => x));
  const my = mean(pairs.map(([, y]) => y));
  let cov = 0, vx = 0, vy = 0;
  for (const [x, y] of pairs) {
    cov += (x - mx) * (y - my);
    vx += (x - mx) ** 2;
    vy += (y - my) ** 2;
  }
  return vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : null;
}

export function learnCrossMarketRelevance(rows = [], options = {}) {
  const targetField = options.targetField || "futureReturnPct";
  const factorFields = options.factorFields || [
    "btcReturnPct", "ethReturnPct", "btcVolatility", "stablecoinFlowUsd",
    "perpFundingRate", "openInterestChangePct", "liquidationUsd", "marketBreadthPct",
  ];
  const target = rows.map((row) => row[targetField]);
  const factors = factorFields.map((field) => {
    const corr = correlation(rows.map((row) => row[field]), target);
    const samples = rows.filter((row) => finite(row[field]) !== null && finite(row[targetField]) !== null).length;
    const shrink = samples / (samples + 40);
    const relevance = corr === null ? 0 : Math.abs(corr) * shrink;
    return {
      field,
      samples,
      correlation: corr,
      relevanceScore: clamp(relevance * 100, 0, 100),
      direction: corr === null ? "UNKNOWN" : corr >= 0 ? "POSITIVE" : "NEGATIVE",
    };
  }).sort((a, b) => b.relevanceScore - a.relevanceScore);

  return {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    factors,
    state: factors.some((f) => f.samples >= 30) ? "LEARNED_RELEVANCE_AVAILABLE" : "INSUFFICIENT_HISTORY",
    hardCodedMacroImportance: false,
    automaticTrading: false,
  };
}
