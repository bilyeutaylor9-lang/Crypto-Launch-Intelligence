const DEFAULT_HORIZONS = [
  { id: "1h", hours: 1, toleranceHours: 0.5 },
  { id: "24h", hours: 24, toleranceHours: 3 },
  { id: "7d", hours: 24 * 7, toleranceHours: 24 },
  { id: "30d", hours: 24 * 30, toleranceHours: 72 },
];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function optionalNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function clampReturn(value = 0) {
  return Math.max(-100, Math.min(10000, num(value)));
}

function timestampMs(value = null) {
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function iso(value = null) {
  const parsed = timestampMs(value);
  return parsed == null ? null : new Date(parsed).toISOString();
}

function firstNumber(values = []) {
  for (const value of values) {
    const parsed = optionalNumber(value);
    if (parsed != null && parsed > 0) return parsed;
  }
  return null;
}

function priceUsd(snapshot = {}) {
  return firstNumber([
    snapshot.priceUsd,
    snapshot.price,
    snapshot.entryPriceUsd,
    snapshot.executionPriceUsd,
    snapshot.marketData?.priceUsd,
  ]);
}

function liquidityUsd(snapshot = {}) {
  return firstNumber([
    snapshot.liquidityUsd,
    snapshot.dexLiquidityUsd,
    snapshot.stableExitLiquidityUsd,
    snapshot.exitLiquidityUsd,
    snapshot.marketData?.liquidityUsd,
  ]);
}

function costPct(source = {}) {
  return Math.max(
    0,
    num(source.executionCostPct) +
      num(source.gasCostPct) +
      num(source.slippagePct) +
      num(source.priceImpactPct) +
      num(source.buyTaxPct) +
      num(source.sellTaxPct) +
      num(source.transferTaxPct)
  );
}

function returnPct(entryPrice = 0, exitPrice = 0, totalCostPct = 0) {
  if (!entryPrice || !exitPrice) return null;
  return Number(clampReturn(((exitPrice - entryPrice) / entryPrice) * 100 - Math.max(0, totalCostPct)).toFixed(4));
}

function labelFor(netReturnPct = null, outcome = {}) {
  if (outcome.becameUntradeable || outcome.liquidityWasRemoved || outcome.deadToken || outcome.delisted) return "FAILED_UNTRADEABLE";
  if (netReturnPct == null) return "MISSING";
  if (netReturnPct >= 100) return "EXECUTABLE_2X";
  if (netReturnPct >= 50) return "STRONG_WINNER";
  if (netReturnPct >= 20) return "POSITIVE";
  if (netReturnPct <= -50) return "MAJOR_LOSS";
  if (netReturnPct <= -20) return "LOSS";
  return "FLAT";
}

export function selectPointInTimeSnapshot(decisionAt = "", snapshots = [], horizon = {}) {
  const decisionMs = timestampMs(decisionAt);
  if (decisionMs == null) {
    return {
      status: "MISSING_DECISION_TIME",
      targetAt: null,
      toleranceHours: horizon.toleranceHours,
      snapshot: null,
    };
  }

  const targetMs = decisionMs + num(horizon.hours) * 3600000;
  const toleranceMs = num(horizon.toleranceHours) * 3600000;
  const candidates = (Array.isArray(snapshots) ? snapshots : [])
    .map((snapshot) => ({
      snapshot,
      observedMs: timestampMs(snapshot.observedAt || snapshot.timestamp || snapshot.createdAt),
    }))
    .filter(({ observedMs, snapshot }) => observedMs != null && priceUsd(snapshot) != null)
    .filter(({ observedMs }) => Math.abs(observedMs - targetMs) <= toleranceMs)
    .sort((a, b) => Math.abs(a.observedMs - targetMs) - Math.abs(b.observedMs - targetMs));

  if (!candidates.length) {
    return {
      status: "MISSING_SNAPSHOT_WITHIN_TOLERANCE",
      targetAt: new Date(targetMs).toISOString(),
      toleranceHours: horizon.toleranceHours,
      snapshot: null,
    };
  }

  return {
    status: "FOUND",
    targetAt: new Date(targetMs).toISOString(),
    toleranceHours: horizon.toleranceHours,
    snapshot: candidates[0].snapshot,
    snapshotAt: new Date(candidates[0].observedMs).toISOString(),
    deltaHours: Number(((candidates[0].observedMs - targetMs) / 3600000).toFixed(2)),
  };
}

function pathUntil(decisionAt = "", endAt = "", snapshots = []) {
  const startMs = timestampMs(decisionAt);
  const endMs = timestampMs(endAt);
  if (startMs == null || endMs == null) return [];
  return (Array.isArray(snapshots) ? snapshots : [])
    .map((snapshot) => ({
      snapshot,
      observedMs: timestampMs(snapshot.observedAt || snapshot.timestamp || snapshot.createdAt),
    }))
    .filter(({ observedMs, snapshot }) => observedMs != null && observedMs >= startMs && observedMs <= endMs && priceUsd(snapshot) != null)
    .sort((a, b) => a.observedMs - b.observedMs)
    .map(({ snapshot }) => snapshot);
}

export function judgePointInTimeHorizon(decision = {}, snapshots = [], horizon = {}) {
  const decisionAt = decision.decisionAt || decision.decidedAt || decision.timestamp;
  const entryPrice = firstNumber([
    decision.executableEntryPriceUsd,
    decision.entryPriceUsd,
    decision.marketSnapshot?.priceUsd,
    decision.priceUsd,
  ]);
  const selected = selectPointInTimeSnapshot(decisionAt, snapshots, horizon);

  if (selected.status !== "FOUND" || !entryPrice) {
    return {
      horizon: horizon.id,
      status: selected.status === "FOUND" ? "MISSING_ENTRY_PRICE" : selected.status,
      targetAt: selected.targetAt,
      toleranceHours: horizon.toleranceHours,
      label: "MISSING",
      netExecutableReturnPct: null,
      grossReturnPct: null,
      maxFavorableExcursionPct: null,
      maxAdverseExcursionPct: null,
      exitLiquidityUsd: null,
      usedScannerScoreAsOutcome: false,
      notes: ["Outcome V2 records missing outcomes as missing, never neutral."],
    };
  }

  const exit = selected.snapshot;
  const exitPrice = priceUsd(exit);
  const totalCostPct = costPct(decision.executionSnapshot || decision) + costPct(exit);
  const netExecutableReturnPct = returnPct(entryPrice, exitPrice, totalCostPct);
  const grossReturnPct = returnPct(entryPrice, exitPrice, 0);
  const path = pathUntil(decisionAt, selected.snapshotAt, snapshots);
  const pathReturns = path.map((snapshot) => returnPct(entryPrice, priceUsd(snapshot), totalCostPct)).filter((value) => value != null);
  const maxFavorableExcursionPct = pathReturns.length ? Math.max(...pathReturns) : netExecutableReturnPct;
  const maxAdverseExcursionPct = pathReturns.length ? Math.min(...pathReturns) : netExecutableReturnPct;

  return {
    horizon: horizon.id,
    status: "LABELED",
    targetAt: selected.targetAt,
    snapshotAt: selected.snapshotAt,
    deltaHours: selected.deltaHours,
    toleranceHours: horizon.toleranceHours,
    label: labelFor(netExecutableReturnPct, exit),
    netExecutableReturnPct,
    grossReturnPct,
    executionCostPct: Number(totalCostPct.toFixed(4)),
    maxFavorableExcursionPct: Number(num(maxFavorableExcursionPct).toFixed(4)),
    maxAdverseExcursionPct: Number(num(maxAdverseExcursionPct).toFixed(4)),
    exitLiquidityUsd: liquidityUsd(exit),
    becameUntradeable: Boolean(exit.becameUntradeable || exit.deadToken || exit.liquidityWasRemoved),
    usedScannerScoreAsOutcome: false,
    notes: [
      "Outcome is based on token price path and execution costs.",
      "Future scanner scores are excluded from the label.",
    ],
  };
}

export function judgePointInTimeOutcomeV2(decision = {}, snapshots = [], options = {}) {
  const horizons = options.horizons || DEFAULT_HORIZONS;
  const labels = horizons.map((horizon) => judgePointInTimeHorizon(decision, snapshots, horizon));
  const labeled = labels.filter((label) => label.status === "LABELED");

  return {
    schemaVersion: "point-in-time-outcome-v2",
    decisionAt: iso(decision.decisionAt || decision.decidedAt || decision.timestamp),
    projectKey: decision.projectKey || decision.permanentProjectKey || null,
    status: labeled.length ? "PARTIAL_OR_COMPLETE" : "PENDING",
    labeledCount: labeled.length,
    missingCount: labels.length - labeled.length,
    labels,
    rules: [
      "Primary outcome is net executable token return.",
      "Future scanner score is never used as a success label.",
      "Snapshots outside the horizon tolerance remain missing.",
      "Missing outcomes are missing, not neutral.",
      "Dead tokens, removed liquidity, and unavailable exits are explicit negative outcomes.",
    ],
  };
}

export const POINT_IN_TIME_OUTCOME_V2_HORIZONS = DEFAULT_HORIZONS;
