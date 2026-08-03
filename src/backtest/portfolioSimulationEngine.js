import { selectRankedRows } from "./rankingBacktestEngine.js";

function timestamp(value) {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function maximumDrawdown(equityCurve = []) {
  let peak = 0;
  let worst = 0;
  for (const point of equityCurve) {
    peak = Math.max(peak, point.equityUsd);
    if (peak > 0) worst = Math.max(worst, ((peak - point.equityUsd) / peak) * 100);
  }
  return worst;
}

function strictRouteReady(row) {
  return (
    row.buyQuoteVerified === true &&
    row.sellQuoteVerified === true &&
    row.outcome?.liquiditySurvived !== false
  );
}

function tradeExit(row, slippagePct) {
  const outcome = row.outcome || {};
  const entryAt = timestamp(row.scannedAt);
  const horizonAt = timestamp(outcome.exitObservedAt) || entryAt + 168 * 3600000;
  const candidates = [
    {
      reason: "SEVEN_DAY_HORIZON",
      at: horizonAt,
      grossReturnPct: Number(outcome.returnAt168hPct),
    },
  ];
  if (outcome.targets?.plus100Within168h?.hit && outcome.targets.plus100Within168h.observedAt) {
    candidates.push({
      reason: "TWO_X_TARGET",
      at: timestamp(outcome.targets.plus100Within168h.observedAt),
      grossReturnPct: 100,
    });
  }
  if (outcome.firstCatastrophicAt) {
    candidates.push({ reason: "FIFTY_PERCENT_STOP", at: timestamp(outcome.firstCatastrophicAt), grossReturnPct: -50 });
  }
  if (outcome.firstLiquidityFailureAt) {
    candidates.push({ reason: "LIQUIDITY_FAILURE", at: timestamp(outcome.firstLiquidityFailureAt), grossReturnPct: -100 });
  }
  if (outcome.firstSellRouteFailureAt) {
    candidates.push({ reason: "SELL_ROUTE_FAILURE", at: timestamp(outcome.firstSellRouteFailureAt), grossReturnPct: -100 });
  }
  const exit = candidates
    .filter((candidate) => candidate.at >= entryAt && Number.isFinite(candidate.grossReturnPct))
    .sort((left, right) => left.at - right.at)[0];
  if (!exit) return null;
  return {
    ...exit,
    netReturnPct: Math.max(-100, exit.grossReturnPct - slippagePct * 2),
  };
}

export function simulatePortfolio(rows = [], options = {}) {
  const initialCapitalUsd = Number(options.initialCapitalUsd ?? 10000);
  const k = Number(options.k ?? 10);
  const maximumPositions = Number(options.maximumPositions ?? 10);
  const slippagePct = Number(options.slippagePct ?? 1);
  const strict = options.strict === true;
  const scorer = options.scorer;
  const { selected } = selectRankedRows(rows, { scorer, k });
  const entries = selected
    .filter((row) => !strict || strictRouteReady(row))
    .sort((left, right) => timestamp(left.scannedAt) - timestamp(right.scannedAt) || left.__rank - right.__rank);
  const events = [];
  const active = [];
  const lastEntryByProject = new Map();
  const completed = [];
  const equityCurve = [];
  let cash = initialCapitalUsd;
  const positionCapitalUsd = initialCapitalUsd / maximumPositions;

  function markedEquity(at) {
    return cash + active.reduce((sum, position) => sum + position.capitalUsd, 0);
  }

  function closeThrough(at) {
    active.sort((left, right) => left.closeAt - right.closeAt);
    while (active.length && active[0].closeAt <= at) {
      const position = active.shift();
      const proceeds = position.capitalUsd * (1 + position.netReturnPct / 100);
      cash += Math.max(0, proceeds);
      completed.push(position);
      equityCurve.push({ at: new Date(position.closeAt).toISOString(), equityUsd: markedEquity(position.closeAt) });
    }
  }

  for (const row of entries) {
    const entryAt = timestamp(row.scannedAt);
    closeThrough(entryAt);
    const previousEntry = lastEntryByProject.get(row.identityKey) || 0;
    if (entryAt - previousEntry < 168 * 3600000) continue;
    if (active.length >= maximumPositions || cash < positionCapitalUsd) continue;
    const exit = tradeExit(row, slippagePct);
    if (!exit) continue;
    cash -= positionCapitalUsd;
    lastEntryByProject.set(row.identityKey, entryAt);
    active.push({
      identityKey: row.identityKey,
      openedAt: new Date(entryAt).toISOString(),
      closeAt: exit.at,
      capitalUsd: positionCapitalUsd,
      grossReturnPct: exit.grossReturnPct,
      netReturnPct: exit.netReturnPct,
      exitReason: exit.reason,
      maximumAdverseExcursionPct: Number(row.outcome?.maximumAdverseExcursionPct),
    });
    events.push({ type: "OPEN", at: new Date(entryAt).toISOString(), identityKey: row.identityKey });
    equityCurve.push({ at: new Date(entryAt).toISOString(), equityUsd: markedEquity(entryAt) });
  }
  closeThrough(Number.MAX_SAFE_INTEGER);

  const endingCapitalUsd = cash;
  const gains = completed.filter((position) => position.netReturnPct > 0);
  const losses = completed.filter((position) => position.netReturnPct < 0);
  return {
    status: completed.length ? "SIMULATED_RESEARCH_OUTCOMES" : "NO_ACTIONABLE_SELECTIONS",
    simulationType: strict ? "STRICT_VERIFIED_ROUTE" : "RESEARCH_ONLY_UNVERIFIED_ROUTE_ALLOWED",
    initialCapitalUsd,
    endingCapitalUsd: completed.length ? Number(endingCapitalUsd.toFixed(2)) : null,
    netReturnPct: completed.length
      ? Number((((endingCapitalUsd - initialCapitalUsd) / initialCapitalUsd) * 100).toFixed(4))
      : null,
    maximumDrawdownPct: completed.length ? Number(maximumDrawdown(equityCurve).toFixed(4)) : null,
    completedPositions: completed.length,
    uniqueProjects: new Set(completed.map((position) => position.identityKey)).size,
    profitablePositions: gains.length,
    losingPositions: losses.length,
    targetExitCount: completed.filter((position) => position.exitReason === "TWO_X_TARGET").length,
    stopExitCount: completed.filter((position) => position.exitReason === "FIFTY_PERCENT_STOP").length,
    failureExitCount: completed.filter((position) => /FAILURE/.test(position.exitReason)).length,
    slippagePctPerSide: slippagePct,
    roundTripSlippagePct: slippagePct * 2,
    maximumPositions,
    k,
    equityCurve,
    limitations: [
      strict
        ? "Strict simulation requires stored point-in-time buy and sell route verification."
        : "Research-only simulation is not an executable-profit claim because route proof may be absent.",
      "Historical gas, tax, and price-impact observations are not complete; only configured slippage is applied.",
      "Intrahorizon exits use observed snapshots, so events between snapshots are unknowable.",
    ],
  };
}

export function runSlippageSensitivity(rows = [], options = {}) {
  return [0.5, 1, 2, 5].map((slippagePct) => ({
    slippagePct,
    strict: simulatePortfolio(rows, { ...options, strict: true, slippagePct }),
    researchOnly: simulatePortfolio(rows, { ...options, strict: false, slippagePct }),
  }));
}
