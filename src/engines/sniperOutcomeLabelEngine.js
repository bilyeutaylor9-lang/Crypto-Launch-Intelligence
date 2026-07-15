import { clamp, num, SNIPER_OUTCOME_LABELS } from "../sniper/sniperFramework.js";

const DEFAULT_THRESHOLDS = {
  sniperReturnPct: 100,
  sniperMaxDrawdownPct: 25,
  minExitLiquidityUsd: 25_000,
  targetHorizonDays: 30,
};

function outcomeSource(project = {}) {
  return {
    ...(project.futureOutcomes || {}),
    ...(project.outcomeMetrics || {}),
    ...(project.sniperOutcomeMetrics || {}),
    ...project,
  };
}

function drawdown(value = 0) {
  return Math.abs(num(value));
}

function maxReturn(outcome = {}) {
  return Math.max(
    num(outcome.maximumReturn1d),
    num(outcome.maximumReturn3d),
    num(outcome.maximumReturn7d),
    num(outcome.maximumReturn14d),
    num(outcome.maximumReturn30d),
    num(outcome.maximumReturn60d),
    num(outcome.maximumReturn90d),
    num(outcome.maxReturnPct),
    num(outcome.maximumUpsidePct)
  );
}

function maxDrawdown(outcome = {}) {
  return Math.max(
    drawdown(outcome.maximumDrawdown1d),
    drawdown(outcome.maximumDrawdown7d),
    drawdown(outcome.maximumDrawdown30d),
    drawdown(outcome.maximumDrawdown90d),
    drawdown(outcome.maxDrawdownPct),
    drawdown(outcome.maximumDrawdownPct)
  );
}

function bestLiquidityAfter(outcome = {}) {
  return Math.max(
    num(outcome.liquidityAfter1d),
    num(outcome.liquidityAfter7d),
    num(outcome.liquidityAfter30d),
    num(outcome.liquidityUsd),
    num(outcome.exitLiquidityUsd)
  );
}

function reachedBeforeLoss(upsidePct, lossPct, outcome = {}) {
  const explicit = outcome[`reached${upsidePct}PctBefore${lossPct}PctLoss`];
  if (explicit != null) return Boolean(explicit);
  return maxReturn(outcome) >= upsidePct && maxDrawdown(outcome) <= lossPct;
}

function hasEnoughOutcomeHistory(outcome = {}) {
  return Boolean(
    outcome.outcomeObserved ||
      outcome.maximumReturn1d != null ||
      outcome.maximumReturn7d != null ||
      outcome.maximumReturn30d != null ||
      outcome.maximumReturn90d != null ||
      outcome.maxReturnPct != null ||
      outcome.becameUntradeable ||
      outcome.contractWasExploited ||
      outcome.correctRejection
  );
}

export function createSniperOutcomeLabels(project = {}, options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds || {}) };
  const outcome = outcomeSource(project);
  const upside = maxReturn(outcome);
  const downside = maxDrawdown(outcome);
  const exitLiquidity = bestLiquidityAfter(outcome);
  const timeTo2x = num(outcome.timeTo2x || outcome.timeTo100Pct);
  const criticalFailure =
    outcome.becameUntradeable ||
    outcome.liquidityWasRemoved ||
    outcome.contractWasExploited ||
    outcome.projectWasAbandoned ||
    project.honeypotDetected;

  const fields = {
    reached25PctBefore15PctLoss: reachedBeforeLoss(25, 15, outcome),
    reached50PctBefore20PctLoss: reachedBeforeLoss(50, 20, outcome),
    reached100PctBefore25PctLoss: reachedBeforeLoss(100, 25, outcome),
    reached200PctBefore30PctLoss: reachedBeforeLoss(200, 30, outcome),
    reached400PctBefore40PctLoss: reachedBeforeLoss(400, 40, outcome),
    maximumReturn1d: num(outcome.maximumReturn1d),
    maximumReturn3d: num(outcome.maximumReturn3d),
    maximumReturn7d: num(outcome.maximumReturn7d),
    maximumReturn14d: num(outcome.maximumReturn14d),
    maximumReturn30d: num(outcome.maximumReturn30d),
    maximumReturn60d: num(outcome.maximumReturn60d),
    maximumReturn90d: num(outcome.maximumReturn90d),
    maximumDrawdown1d: drawdown(outcome.maximumDrawdown1d),
    maximumDrawdown7d: drawdown(outcome.maximumDrawdown7d),
    maximumDrawdown30d: drawdown(outcome.maximumDrawdown30d),
    maximumDrawdown90d: drawdown(outcome.maximumDrawdown90d),
    timeTo25Pct: outcome.timeTo25Pct ?? null,
    timeTo50Pct: outcome.timeTo50Pct ?? null,
    timeTo2x: outcome.timeTo2x ?? outcome.timeTo100Pct ?? null,
    timeTo3x: outcome.timeTo3x ?? outcome.timeTo200Pct ?? null,
    timeTo5x: outcome.timeTo5x ?? outcome.timeTo400Pct ?? null,
    liquidityAfter1d: num(outcome.liquidityAfter1d),
    liquidityAfter7d: num(outcome.liquidityAfter7d),
    liquidityAfter30d: num(outcome.liquidityAfter30d),
    becameUntradeable: Boolean(outcome.becameUntradeable),
    liquidityWasRemoved: Boolean(outcome.liquidityWasRemoved),
    contractWasExploited: Boolean(outcome.contractWasExploited),
    projectWasAbandoned: Boolean(outcome.projectWasAbandoned),
    majorExchangeListed: Boolean(outcome.majorExchangeListed),
    majorExchangeDelisted: Boolean(outcome.majorExchangeDelisted),
    catalystOccurred: Boolean(outcome.catalystOccurred),
    catalystFailed: Boolean(outcome.catalystFailed),
    insiderDistributionOccurred: Boolean(outcome.insiderDistributionOccurred),
    falseBreakout: Boolean(outcome.falseBreakout),
    successfulBreakout: Boolean(outcome.successfulBreakout),
    lateDiscovery: Boolean(outcome.lateDiscovery),
    correctRejection: Boolean(outcome.correctRejection),
  };

  let label = "INSUFFICIENT_HISTORY";
  if (hasEnoughOutcomeHistory(outcome)) {
    if (outcome.contractWasExploited || project.honeypotDetected || (outcome.becameUntradeable && upside < thresholds.sniperReturnPct)) {
      label = "RUG_OR_HONEYPOT";
    } else if (upside >= thresholds.sniperReturnPct && outcome.becameUntradeable) {
      label = "UNTRADEABLE_WINNER";
    } else if (outcome.majorExchangeDelisted || (project.distressedTrapBlock && upside >= 25 && downside >= 30)) {
      label = outcome.legitimateRecovery || project.legitimateReacceleration ? "DISTRESSED_RECOVERY" : "DEAD_CAT_BOUNCE";
    } else if (outcome.lateDiscovery || ["ALREADY_PUMPED", "LATE_CHASE"].includes(project.preBreakoutMomentumStage)) {
      label = upside >= thresholds.sniperReturnPct ? "LATE_DISCOVERY" : "FAILED_BREAKOUT";
    } else if (outcome.falseBreakout || (upside >= 25 && downside >= 35)) {
      label = "FAILED_BREAKOUT";
    } else if (downside >= 40 && upside < 25) {
      label = "IMMEDIATE_DUMP";
    } else if (upside < 25 && downside >= 15) {
      label = "SLOW_BLEED";
    } else if (fields.correctRejection || (project.sniperQualified === false && upside < 25 && !criticalFailure)) {
      label = "CORRECT_REJECTION";
    } else if (
      upside >= thresholds.sniperReturnPct &&
      downside <= thresholds.sniperMaxDrawdownPct &&
      exitLiquidity >= thresholds.minExitLiquidityUsd &&
      !criticalFailure &&
      (!timeTo2x || timeTo2x <= thresholds.targetHorizonDays * 24)
    ) {
      label = "SNIPER_SUCCESS";
    } else if (upside >= thresholds.sniperReturnPct && !criticalFailure) {
      label = "EARLY_BUT_SUCCESSFUL";
    } else {
      label = "TOO_EARLY";
    }
  }

  return {
    ...fields,
    primarySniperOutcomeLabel: label,
    sniperOutcomeLabel: label,
    sniperOutcomeLabelConfidence: label === "INSUFFICIENT_HISTORY" ? 25 : clamp(55 + (upside >= 100 ? 15 : 0) + (downside > 0 ? 10 : 0)),
    sniperTrainingEligible: label !== "INSUFFICIENT_HISTORY",
    sniperOutcomeSchemaVersion: "sniper-outcome-v1",
    supportedSniperOutcomeLabels: SNIPER_OUTCOME_LABELS,
  };
}

export function analyzeSniperOutcomeLabels(project = {}, options = {}) {
  return {
    ...project,
    sniperOutcomeLabels: createSniperOutcomeLabels(project, options),
    ...createSniperOutcomeLabels(project, options),
  };
}

export function analyzeSniperOutcomeLabelsBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => analyzeSniperOutcomeLabels(project, options));
}
