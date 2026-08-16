import fs from "node:fs";
import path from "node:path";

import { median, num } from "../edge/edgeMath.js";
import { buildCommittedLoadedVacuumValidation } from "./committedLoadedVacuumValidationLab.js";

const REPORT = path.resolve("reports", "committed-loaded-vacuum-regime-robustness.json");

export const PRE_REGISTERED_REGIME_STATES = Object.freeze([
  "RISK_ON_EXPANSION",
  "RISK_ON_FRAGILE",
  "NEUTRAL_SELECTIVE",
  "RISK_OFF_STRESS",
  "UNOBSERVED",
  "UNKNOWN",
]);

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, digits = 4) {
  const n = finite(value);
  return n === null ? null : Number(n.toFixed(digits));
}

function mean(values = []) {
  const active = values.map(finite).filter((value) => value !== null);
  return active.length ? active.reduce((sum, value) => sum + value, 0) / active.length : null;
}

function pct(successes, total) {
  return total ? round((successes / total) * 100, 2) : null;
}

function pairPrimaryDifference(pair = {}) {
  const treated = pair?.treated?.outcome?.plus25BeforeMinus15;
  if (typeof treated !== "boolean") return null;
  const controls = (pair.controls || []).map((row) => row?.outcome?.plus25BeforeMinus15).filter((value) => typeof value === "boolean");
  if (!controls.length) return null;
  return (treated ? 1 : 0) - controls.filter(Boolean).length / controls.length;
}

function pair168hLift(pair = {}) {
  const treated = finite(pair?.treated?.outcome?.fixedHorizonReturnPct?.["168"]);
  if (treated === null) return null;
  const controls = (pair.controls || []).map((row) => finite(row?.outcome?.fixedHorizonReturnPct?.["168"])).filter((value) => value !== null);
  if (!controls.length) return null;
  return treated - mean(controls);
}

function pairFalseIgnitionDifference(pair = {}) {
  const classify = (outcome = {}) => {
    const mfe = finite(outcome.maxFavorableExcursionPct);
    const mae = finite(outcome.maxAdverseExcursionPct);
    if (mfe === null || mae === null) return null;
    return mfe < 25 && mae <= -15 ? 1 : 0;
  };
  const treated = classify(pair?.treated?.outcome);
  if (treated === null) return null;
  const controls = (pair.controls || []).map((row) => classify(row?.outcome)).filter((value) => value !== null);
  if (!controls.length) return null;
  return treated - mean(controls);
}

function regimeOf(observation = {}) {
  const raw = String(observation.globalMarketRegimeState || "UNKNOWN").trim().toUpperCase();
  return PRE_REGISTERED_REGIME_STATES.includes(raw) ? raw : "UNKNOWN";
}

function liquidityTier(observation = {}) {
  const value = finite(observation.liquidityUsd);
  if (value === null) return "UNKNOWN";
  if (value < 250_000) return "LT_250K";
  if (value < 1_000_000) return "250K_TO_1M";
  return "GTE_1M";
}

function marketCapTier(observation = {}) {
  const value = finite(observation.marketCapUsd);
  if (value === null) return "UNKNOWN";
  if (value < 10_000_000) return "LT_10M";
  if (value < 50_000_000) return "10M_TO_50M";
  return "GTE_50M";
}

function arrivalTier(observation = {}) {
  const value = finite(observation.sixHourExpectedArrivalToIgnitionRatio);
  if (value === null) return "UNKNOWN";
  if (value < 1.25) return "1_00_TO_1_25";
  if (value < 1.75) return "1_25_TO_1_75";
  if (value < 2.5) return "1_75_TO_2_50";
  return "GTE_2_50";
}

function chainOf(observation = {}) {
  return String(observation.chain || "UNKNOWN").toLowerCase();
}

function summarizePairs(pairs = [], minPairs = 5) {
  const primary = pairs.map(pairPrimaryDifference).filter((value) => value !== null);
  const lift168 = pairs.map(pair168hLift).filter((value) => value !== null);
  const falseIgnition = pairs.map(pairFalseIgnitionDifference).filter((value) => value !== null);
  return {
    pairs: pairs.length,
    resolvedPrimaryPairs: primary.length,
    qualifying: primary.length >= minPairs,
    primaryRiskDifferencePct: primary.length ? round(mean(primary) * 100, 3) : null,
    median168hReturnLiftPct: lift168.length ? round(median(lift168), 3) : null,
    falseIgnitionDifferencePct: falseIgnition.length ? round(mean(falseIgnition) * 100, 3) : null,
  };
}

function stratify(pairs = [], keyFn, options = {}) {
  const minPairs = Math.max(1, Number(options.minPairsPerStratum || 5));
  const groups = new Map();
  for (const pair of pairs) {
    const key = keyFn(pair?.treated?.observation || {});
    groups.set(key, [...(groups.get(key) || []), pair]);
  }
  return Object.fromEntries([...groups.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([key, rows]) => [key, summarizePairs(rows, minPairs)]));
}

function leaveOneRegimeOut(pairs = [], options = {}) {
  const present = [...new Set(pairs.map((pair) => regimeOf(pair?.treated?.observation || {})))].filter((state) => !["UNKNOWN", "UNOBSERVED"].includes(state));
  return present.map((state) => {
    const retained = pairs.filter((pair) => regimeOf(pair?.treated?.observation || {}) !== state);
    return { excludedRegime: state, ...summarizePairs(retained, Math.max(1, Number(options.minPairsLeaveOneOut || 5))) };
  });
}

function robustnessDecision(regimeSummary = {}, overall = {}, options = {}) {
  const minQualifiedRegimes = Math.max(1, Number(options.minQualifiedRegimes || 3));
  const minOverallPairs = Math.max(1, Number(options.minPairsOverall || 5));
  const minPositiveRegimePct = Number(options.minPositiveRegimePct || 67);
  const maxWorstRegimeRiskDifferencePct = Number(options.maxWorstRegimeRiskDifferencePct ?? -5);
  const known = Object.entries(regimeSummary).filter(([state, row]) => !["UNKNOWN", "UNOBSERVED"].includes(state) && row.qualifying);
  const positive = known.filter(([, row]) => finite(row.primaryRiskDifferencePct) !== null && row.primaryRiskDifferencePct > 0);
  const riskDiffs = known.map(([, row]) => finite(row.primaryRiskDifferencePct)).filter((value) => value !== null);
  const positivePct = pct(positive.length, known.length);
  const worst = riskDiffs.length ? Math.min(...riskDiffs) : null;
  const maturityBlockers = [];
  if ((overall.resolvedPrimaryPairs || 0) < minOverallPairs) maturityBlockers.push("NEED_MORE_RESOLVED_MATCHED_PAIRS");
  if (known.length < minQualifiedRegimes) maturityBlockers.push("NEED_MORE_QUALIFIED_MARKET_REGIMES");
  if (maturityBlockers.length) {
    return {
      state: "REGIME_ROBUSTNESS_COLLECTING",
      blockers: maturityBlockers,
      maturityBlockers,
      evidenceBlockers: [],
      qualifiedRegimes: known.length,
      positiveQualifiedRegimePct: positivePct,
      worstQualifiedRegimeRiskDifferencePct: round(worst, 3),
    };
  }
  const evidenceBlockers = [];
  if (positivePct === null || positivePct < minPositiveRegimePct) evidenceBlockers.push("EDGE_NOT_DIRECTIONALLY_STABLE_ACROSS_REGIMES");
  if (worst === null || worst < maxWorstRegimeRiskDifferencePct) evidenceBlockers.push("WORST_REGIME_EFFECT_TOO_NEGATIVE");
  if (finite(overall.primaryRiskDifferencePct) === null || overall.primaryRiskDifferencePct <= 0) evidenceBlockers.push("OVERALL_PRIMARY_EFFECT_NOT_POSITIVE");
  return {
    state: evidenceBlockers.length ? "REGIME_FRAGILE_SHADOW" : "REGIME_ROBUSTNESS_SUPPORTED_SHADOW",
    blockers: evidenceBlockers,
    maturityBlockers: [],
    evidenceBlockers,
    qualifiedRegimes: known.length,
    positiveQualifiedRegimePct: positivePct,
    worstQualifiedRegimeRiskDifferencePct: round(worst, 3),
  };
}

export function buildCommittedLoadedVacuumRegimeRobustness(observations = [], snapshots = [], options = {}) {
  const validation = buildCommittedLoadedVacuumValidation(observations, snapshots, {
    ...options,
    minResolvedTreatments: Number(options.validationMinResolvedTreatments || 1_000_000),
    minUniqueProjects: Number(options.validationMinUniqueProjects || 1_000_000),
    minSpanDays: Number(options.validationMinSpanDays || 1_000_000),
  });
  const pairs = validation.pairs.filter((pair) => pair?.treated?.outcome && pair.controls?.some((row) => row?.outcome));
  const minPairs = Math.max(1, Number(options.minPairsOverall || 5));
  const overall = summarizePairs(pairs, minPairs);
  const byRegime = stratify(pairs, regimeOf, options);
  const decision = robustnessDecision(byRegime, overall, options);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    state: decision.state,
    observations: observations.length,
    resolvedMatchedPairs: pairs.length,
    overall,
    byGlobalMarketRegime: byRegime,
    byChain: stratify(pairs, chainOf, options),
    byLiquidityTier: stratify(pairs, liquidityTier, options),
    byMarketCapTier: stratify(pairs, marketCapTier, options),
    bySixHourArrivalTier: stratify(pairs, arrivalTier, options),
    leaveOneRegimeOut: leaveOneRegimeOut(pairs, options),
    decision,
    preRegisteredRegimes: PRE_REGISTERED_REGIME_STATES,
    shadowOnly: true,
    rankingInfluence: false,
    automaticProductionPromotion: false,
    policy: "V13 uses only pre-signal frozen regime/covariate fields and pre-registered strata. UNKNOWN and UNOBSERVED are reported, never imputed. The lab does not optimize regime cut points or change the V10 signal definition.",
  };
}

export function runCommittedLoadedVacuumRegimeRobustness(observations = [], snapshots = [], options = {}) {
  const report = buildCommittedLoadedVacuumRegimeRobustness(observations, snapshots, options);
  if (options.writeReport !== false) {
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  }
  return report;
}

export const COMMITTED_LOADED_VACUUM_REGIME_ROBUSTNESS_REPORT = REPORT;
export const __committedLoadedVacuumRegimeRobustnessHooks = {
  pairPrimaryDifference,
  pair168hLift,
  pairFalseIgnitionDifference,
  regimeOf,
  liquidityTier,
  marketCapTier,
  arrivalTier,
  summarizePairs,
  stratify,
  leaveOneRegimeOut,
  robustnessDecision,
};
