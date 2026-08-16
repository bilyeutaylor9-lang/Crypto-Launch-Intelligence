import fs from "node:fs";
import path from "node:path";

import { median } from "../edge/edgeMath.js";
import { buildCommittedLoadedVacuumValidation } from "./committedLoadedVacuumValidationLab.js";

const REPORT = path.resolve("reports", "committed-loaded-vacuum-execution-reality.json");
const PRIMARY_HOURS = 168;
const HORIZONS = Object.freeze([6, 24, 72, 168]);
export const PRE_REGISTERED_COST_MULTIPLIERS = Object.freeze([1, 1.5, 2]);

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function ts(value) { const parsed = Date.parse(value || ""); return Number.isFinite(parsed) ? parsed : null; }
function round(value, digits = 4) { const n = finite(value); return n === null ? null : Number(n.toFixed(digits)); }
function mean(values = []) { const active = values.map(finite).filter((value) => value !== null); return active.length ? active.reduce((sum, value) => sum + value, 0) / active.length : null; }
function percent(successes, total) { return total ? round((successes / total) * 100, 2) : null; }
function grossReturnPct(start, end) { const a = finite(start), b = finite(end); return a !== null && b !== null && a > 0 && b > 0 ? ((b - a) / a) * 100 : null; }

function snapshotMap(snapshots = []) {
  const map = new Map();
  for (const row of Array.isArray(snapshots) ? snapshots : []) {
    const at = ts(row?.timestamp);
    const price = finite(row?.priceUsd);
    if (!row?.key || !at || price === null || price <= 0) continue;
    map.set(row.key, [...(map.get(row.key) || []), row]);
  }
  for (const rows of map.values()) rows.sort((a, b) => ts(a.timestamp) - ts(b.timestamp));
  return map;
}

function nearestAtOrAfter(rows = [], targetMs, toleranceHours) {
  const maxMs = targetMs + toleranceHours * 3_600_000;
  return rows.find((row) => ts(row.timestamp) >= targetMs && ts(row.timestamp) <= maxMs) || null;
}

export function resolveNetExecutionOutcome(observation = {}, rows = [], options = {}) {
  const startMs = ts(observation.observedAt);
  const startPrice = finite(observation.priceUsd);
  const baseCostBps = finite(observation.roundTripExecutionCostBps);
  const multiplier = finite(options.costMultiplier) ?? 1;
  if (!startMs || startPrice === null || startPrice <= 0) return { state: "OUTCOME_UNAVAILABLE", reason: "MISSING_START_PRICE_OR_TIME" };
  if (baseCostBps === null || baseCostBps < 0) return { state: "EXECUTION_COST_UNKNOWN", reason: "NO_FROZEN_ROUND_TRIP_COST_BPS" };
  const costBps = baseCostBps * Math.max(0, multiplier);
  const costPct = costBps / 100;
  const horizonHours = Number(options.primaryHorizonHours || PRIMARY_HOURS);
  const endMs = startMs + horizonHours * 3_600_000;
  const future = rows.filter((row) => {
    const at = ts(row.timestamp);
    const price = finite(row.priceUsd);
    return at && at > startMs && at <= endMs && price !== null && price > 0;
  });
  if (!future.length) return { state: "OUTCOME_UNAVAILABLE", reason: "NO_FUTURE_SNAPSHOTS", frozenRoundTripExecutionCostBps: baseCostBps, appliedRoundTripExecutionCostBps: costBps };
  const path = future.map((row) => {
    const gross = grossReturnPct(startPrice, row.priceUsd);
    return {
      observedAt: row.timestamp,
      hours: (ts(row.timestamp) - startMs) / 3_600_000,
      grossReturnPct: gross,
      netReturnPct: gross === null ? null : gross - costPct,
    };
  });
  const plus25 = path.find((row) => row.netReturnPct !== null && row.netReturnPct >= 25) || null;
  const minus15 = path.find((row) => row.netReturnPct !== null && row.netReturnPct <= -15) || null;
  const plus25BeforeMinus15Net = plus25 || minus15 ? Boolean(plus25 && (!minus15 || ts(plus25.observedAt) < ts(minus15.observedAt))) : null;
  const netReturns = path.map((row) => row.netReturnPct).filter((value) => value !== null);
  const fixedHorizonNetReturnPct = Object.fromEntries(HORIZONS.map((hours) => {
    const targetMs = startMs + hours * 3_600_000;
    const tolerance = Math.max(1, Math.min(24, hours * 0.35));
    const row = nearestAtOrAfter(future, targetMs, tolerance);
    const gross = row ? grossReturnPct(startPrice, row.priceUsd) : null;
    return [String(hours), gross === null ? null : round(gross - costPct, 4)];
  }));
  return {
    state: "NET_EXECUTION_OUTCOME_RESOLVED",
    frozenRoundTripExecutionCostBps: baseCostBps,
    costMultiplier: multiplier,
    appliedRoundTripExecutionCostBps: round(costBps, 4),
    plus25BeforeMinus15Net,
    timeToNetPlus25Hours: plus25 ? round(plus25.hours, 3) : null,
    timeToNetMinus15Hours: minus15 ? round(minus15.hours, 3) : null,
    maxNetFavorableExcursionPct: netReturns.length ? round(Math.max(...netReturns), 4) : null,
    maxNetAdverseExcursionPct: netReturns.length ? round(Math.min(...netReturns), 4) : null,
    fixedHorizonNetReturnPct,
    executionCostProvenance: observation.executionCostProvenance || null,
    warning: "Net outcomes subtract the frozen pre-signal round-trip cost estimate from each gross return. Future liquidity/cost data is never used. If frozen cost evidence is absent, the episode is excluded rather than treated as zero cost.",
  };
}

function netPairDifference(pair = {}, outcomeByObservation = new Map()) {
  const treated = outcomeByObservation.get(pair?.treated?.observation);
  if (treated?.state !== "NET_EXECUTION_OUTCOME_RESOLVED" || typeof treated.plus25BeforeMinus15Net !== "boolean") return null;
  const controls = (pair.controls || []).map((row) => outcomeByObservation.get(row.observation)).filter((outcome) => outcome?.state === "NET_EXECUTION_OUTCOME_RESOLVED" && typeof outcome.plus25BeforeMinus15Net === "boolean");
  if (!controls.length) return null;
  return (treated.plus25BeforeMinus15Net ? 1 : 0) - controls.filter((outcome) => outcome.plus25BeforeMinus15Net).length / controls.length;
}

function net168hLift(pair = {}, outcomeByObservation = new Map()) {
  const treated = finite(outcomeByObservation.get(pair?.treated?.observation)?.fixedHorizonNetReturnPct?.["168"]);
  if (treated === null) return null;
  const controls = (pair.controls || []).map((row) => finite(outcomeByObservation.get(row.observation)?.fixedHorizonNetReturnPct?.["168"])).filter((value) => value !== null);
  if (!controls.length) return null;
  return treated - mean(controls);
}

function scenarioSummary(pairs = [], byKey = new Map(), multiplier = 1) {
  const outcomeByObservation = new Map();
  const allRows = pairs.flatMap((pair) => [pair.treated, ...(pair.controls || [])]);
  for (const row of allRows) {
    if (!row?.observation || outcomeByObservation.has(row.observation)) continue;
    outcomeByObservation.set(row.observation, resolveNetExecutionOutcome(row.observation, byKey.get(row.observation.identityKey) || [], { costMultiplier: multiplier }));
  }
  const diffs = pairs.map((pair) => netPairDifference(pair, outcomeByObservation)).filter((value) => value !== null);
  const lifts = pairs.map((pair) => net168hLift(pair, outcomeByObservation)).filter((value) => value !== null);
  const treatedOutcomes = pairs.map((pair) => outcomeByObservation.get(pair.treated.observation)).filter((outcome) => outcome?.state === "NET_EXECUTION_OUTCOME_RESOLVED");
  const ordered = treatedOutcomes.filter((outcome) => typeof outcome.plus25BeforeMinus15Net === "boolean");
  const wins = ordered.filter((outcome) => outcome.plus25BeforeMinus15Net).length;
  return {
    costMultiplier: multiplier,
    costCoveredTreatmentsWithOutcomes: treatedOutcomes.length,
    netMatchedPairs: diffs.length,
    treatedNetPlus25BeforeMinus15Pct: percent(wins, ordered.length),
    matchedNetPrimaryRiskDifferencePct: diffs.length ? round(mean(diffs) * 100, 3) : null,
    medianNet168hReturnLiftPct: lifts.length ? round(median(lifts), 3) : null,
  };
}

function executionDecision(baseScenario = {}, stressScenario = {}, coverage = {}, options = {}) {
  const minCoveredTreatments = Math.max(1, Number(options.minCostCoveredTreatments || 50));
  const minNetMatchedPairs = Math.max(1, Number(options.minNetMatchedPairs || 30));
  const minCoveragePct = Number(options.minExecutionCostCoveragePct || 60);
  const maturityBlockers = [];
  if ((coverage.explicitCostTreatments || 0) < minCoveredTreatments) maturityBlockers.push("NEED_MORE_COST_COVERED_TREATMENTS");
  if ((baseScenario.netMatchedPairs || 0) < minNetMatchedPairs) maturityBlockers.push("NEED_MORE_NET_MATCHED_PAIRS");
  if (coverage.treatmentCostCoveragePct === null || coverage.treatmentCostCoveragePct < minCoveragePct) maturityBlockers.push("EXECUTION_COST_COVERAGE_TOO_LOW");
  if (maturityBlockers.length) return { state: "EXECUTION_REALITY_COLLECTING", blockers: maturityBlockers, maturityBlockers, evidenceBlockers: [] };

  const evidenceBlockers = [];
  if (finite(baseScenario.matchedNetPrimaryRiskDifferencePct) === null || baseScenario.matchedNetPrimaryRiskDifferencePct <= 0) evidenceBlockers.push("NET_PRIMARY_EFFECT_NOT_POSITIVE");
  if (finite(baseScenario.medianNet168hReturnLiftPct) === null || baseScenario.medianNet168hReturnLiftPct <= 0) evidenceBlockers.push("NET_168H_RETURN_LIFT_NOT_POSITIVE");
  if (finite(stressScenario.matchedNetPrimaryRiskDifferencePct) === null || stressScenario.matchedNetPrimaryRiskDifferencePct <= 0) evidenceBlockers.push("EDGE_FAILS_2X_COST_STRESS");
  return {
    state: evidenceBlockers.length ? "EXECUTION_REALITY_NOT_SUPPORTED_SHADOW" : "EXECUTION_REALITY_SUPPORTED_SHADOW",
    blockers: evidenceBlockers,
    maturityBlockers: [],
    evidenceBlockers,
  };
}

export function buildCommittedLoadedVacuumExecutionReality(observations = [], snapshots = [], options = {}) {
  const validation = buildCommittedLoadedVacuumValidation(observations, snapshots, {
    ...options,
    minResolvedTreatments: Number(options.validationMinResolvedTreatments || 1_000_000),
    minUniqueProjects: Number(options.validationMinUniqueProjects || 1_000_000),
    minSpanDays: Number(options.validationMinSpanDays || 1_000_000),
  });
  const pairs = validation.pairs;
  const byKey = snapshotMap(snapshots);
  const treatmentRows = pairs.map((pair) => pair.treated?.observation).filter(Boolean);
  const explicitCostTreatments = treatmentRows.filter((row) => finite(row.roundTripExecutionCostBps) !== null && row.roundTripExecutionCostBps >= 0).length;
  const coverage = {
    treatmentEpisodes: treatmentRows.length,
    explicitCostTreatments,
    treatmentCostCoveragePct: percent(explicitCostTreatments, treatmentRows.length),
    missingCostIsZero: false,
  };
  const costStress = PRE_REGISTERED_COST_MULTIPLIERS.map((multiplier) => scenarioSummary(pairs, byKey, multiplier));
  const base = costStress.find((row) => row.costMultiplier === 1) || costStress[0];
  const stress = costStress.find((row) => row.costMultiplier === 2) || costStress.at(-1);
  const decision = executionDecision(base, stress, coverage, options);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    state: decision.state,
    observations: observations.length,
    outcomeSnapshots: snapshots.length,
    coverage,
    preRegisteredCostMultipliers: PRE_REGISTERED_COST_MULTIPLIERS,
    costStress,
    decision,
    shadowOnly: true,
    rankingInfluence: false,
    automaticProductionPromotion: false,
    policy: "V13 execution reality uses only explicit round-trip cost evidence frozen at signal time. Unknown cost is excluded, never zero-filled. Cost stress multipliers are fixed in advance at 1x/1.5x/2x and future liquidity is never used to repair a historical cost estimate.",
  };
}

export function runCommittedLoadedVacuumExecutionReality(observations = [], snapshots = [], options = {}) {
  const report = buildCommittedLoadedVacuumExecutionReality(observations, snapshots, options);
  if (options.writeReport !== false) {
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  }
  return report;
}

export const COMMITTED_LOADED_VACUUM_EXECUTION_REALITY_REPORT = REPORT;
export const __committedLoadedVacuumExecutionRealityHooks = {
  snapshotMap,
  nearestAtOrAfter,
  netPairDifference,
  net168hLift,
  scenarioSummary,
  executionDecision,
};
