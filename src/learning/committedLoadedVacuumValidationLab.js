import fs from "node:fs";
import path from "node:path";

import { median, num } from "../edge/edgeMath.js";
import { selectMatchedControls } from "./matchedControlSelector.js";

const REPORT = path.resolve("reports", "committed-loaded-vacuum-validation.json");
const PRIMARY_HOURS = 168;
const HORIZONS = [6, 24, 72, 168];

function ts(value) { const t = Date.parse(value || ""); return Number.isFinite(t) ? t : null; }
function pct(start, end) { const a = num(start), b = num(end); return a !== null && b !== null && a > 0 && b > 0 ? ((b - a) / a) * 100 : null; }
function mean(values = []) { const a = values.map(num).filter((v) => v !== null); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; }
function round(value, digits = 4) { const n = num(value); return n === null ? null : Number(n.toFixed(digits)); }
function percent(successes, total) { return total ? Number(((successes / total) * 100).toFixed(1)) : null; }

function snapshotMap(snapshots = []) {
  const map = new Map();
  for (const row of Array.isArray(snapshots) ? snapshots : []) {
    if (!row?.key || !ts(row.timestamp) || num(row.priceUsd) === null || Number(row.priceUsd) <= 0) continue;
    map.set(row.key, [...(map.get(row.key) || []), row]);
  }
  for (const rows of map.values()) rows.sort((a, b) => ts(a.timestamp) - ts(b.timestamp));
  return map;
}

function nearestAtOrAfter(rows = [], targetMs, toleranceHours) {
  const max = targetMs + toleranceHours * 3_600_000;
  return rows.find((row) => ts(row.timestamp) >= targetMs && ts(row.timestamp) <= max) || null;
}

export function resolveValidationOutcome(observation = {}, rows = [], options = {}) {
  const startMs = ts(observation.observedAt);
  const startPrice = num(observation.priceUsd);
  if (!startMs || startPrice === null || startPrice <= 0) return null;
  const horizonHours = Number(options.primaryHorizonHours || PRIMARY_HOURS);
  const endMs = startMs + horizonHours * 3_600_000;
  const future = rows.filter((row) => {
    const at = ts(row.timestamp);
    return at && at > startMs && at <= endMs && num(row.priceUsd) !== null && Number(row.priceUsd) > 0;
  });
  if (!future.length) return null;

  const path = future.map((row) => ({ observedAt: row.timestamp, hours: (ts(row.timestamp) - startMs) / 3_600_000, returnPct: pct(startPrice, row.priceUsd) }));
  const plus25 = path.find((row) => row.returnPct !== null && row.returnPct >= 25) || null;
  const minus15 = path.find((row) => row.returnPct !== null && row.returnPct <= -15) || null;
  let plus25BeforeMinus15 = null;
  if (plus25 || minus15) plus25BeforeMinus15 = Boolean(plus25 && (!minus15 || ts(plus25.observedAt) < ts(minus15.observedAt)));

  const fixed = Object.fromEntries(HORIZONS.map((hours) => {
    const target = startMs + hours * 3_600_000;
    const tolerance = Math.max(1, Math.min(24, hours * 0.35));
    const row = nearestAtOrAfter(future, target, tolerance);
    return [String(hours), row ? round(pct(startPrice, row.priceUsd), 4) : null];
  }));
  const returns = path.map((row) => row.returnPct).filter((v) => v !== null);
  const last = future.at(-1);
  return {
    observedSnapshots: future.length,
    observationCoverageHours: round((ts(last.timestamp) - startMs) / 3_600_000, 3),
    plus25BeforeMinus15,
    timeToPlus25Hours: plus25 ? round(plus25.hours, 3) : null,
    timeToMinus15Hours: minus15 ? round(minus15.hours, 3) : null,
    maxFavorableExcursionPct: returns.length ? round(Math.max(...returns), 4) : null,
    maxAdverseExcursionPct: returns.length ? round(Math.min(...returns), 4) : null,
    fixedHorizonReturnPct: fixed,
    primaryEndReturnPct: round(pct(startPrice, last.priceUsd), 4),
    pathResolution: "DISCRETE_OUTCOME_SNAPSHOTS",
    warning: "Threshold ordering is resolved only from stored snapshots. Moves between snapshots may be missed.",
  };
}

function firstTreatmentEpisodes(observations = [], options = {}) {
  const cooldownMs = Math.max(1, Number(options.treatmentCooldownHours || 72)) * 3_600_000;
  const byProject = new Map();
  for (const row of (Array.isArray(observations) ? observations : []).filter((row) => row?.treatment && ts(row.observedAt)).sort((a, b) => ts(a.observedAt) - ts(b.observedAt))) {
    const prior = byProject.get(row.identityKey) || [];
    const last = prior.at(-1);
    if (!last || ts(row.observedAt) - ts(last.observedAt) >= cooldownMs) {
      prior.push(row);
      byProject.set(row.identityKey, prior);
    }
  }
  return [...byProject.values()].flat().sort((a, b) => ts(a.observedAt) - ts(b.observedAt));
}

function outcomeStats(rows = []) {
  const resolved = rows.filter((row) => row?.outcome);
  const ordered = resolved.filter((row) => row.outcome.plus25BeforeMinus15 !== null);
  const wins = ordered.filter((row) => row.outcome.plus25BeforeMinus15 === true).length;
  const falseIgnitions = resolved.filter((row) => row.outcome.maxFavorableExcursionPct !== null && row.outcome.maxFavorableExcursionPct < 25 && row.outcome.maxAdverseExcursionPct !== null && row.outcome.maxAdverseExcursionPct <= -15).length;
  const returns = Object.fromEntries(HORIZONS.map((h) => [String(h), median(resolved.map((row) => row.outcome.fixedHorizonReturnPct[String(h)]).filter((v) => v !== null))]));
  return {
    resolved: resolved.length,
    thresholdOrdered: ordered.length,
    plus25BeforeMinus15Pct: percent(wins, ordered.length),
    falseIgnitionPct: percent(falseIgnitions, resolved.length),
    medianMaxFavorableExcursionPct: round(median(resolved.map((row) => row.outcome.maxFavorableExcursionPct).filter((v) => v !== null))),
    medianMaxAdverseExcursionPct: round(median(resolved.map((row) => row.outcome.maxAdverseExcursionPct).filter((v) => v !== null))),
    medianTimeToPlus25Hours: round(median(resolved.map((row) => row.outcome.timeToPlus25Hours).filter((v) => v !== null))),
    medianReturnPctByHorizon: Object.fromEntries(Object.entries(returns).map(([k, v]) => [k, round(v)])),
  };
}

function seeded(seed = 1337) {
  let state = seed >>> 0;
  return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 2 ** 32; };
}

function pairDifference(pair) {
  if (!pair?.treated?.outcome || !pair.controls?.length) return null;
  const t = pair.treated.outcome.plus25BeforeMinus15;
  if (t === null) return null;
  const controls = pair.controls.map((c) => c.outcome?.plus25BeforeMinus15).filter((v) => v !== null);
  if (!controls.length) return null;
  return (t ? 1 : 0) - controls.filter(Boolean).length / controls.length;
}

function clusterBootstrapRiskDifference(pairs = [], options = {}) {
  const usable = pairs.filter((pair) => pairDifference(pair) !== null);
  if (usable.length < 5) return { pointEstimatePct: null, lower95Pct: null, upper95Pct: null, clusters: 0 };
  const clusters = new Map();
  for (const pair of usable) clusters.set(pair.treated.observation.identityKey, [...(clusters.get(pair.treated.observation.identityKey) || []), pair]);
  const keys = [...clusters.keys()];
  const rand = seeded(Number(options.bootstrapSeed || 7331));
  const reps = Math.max(200, Number(options.bootstrapReplicates || 1000));
  const samples = [];
  for (let r = 0; r < reps; r += 1) {
    const sampledPairs = [];
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[Math.floor(rand() * keys.length)];
      sampledPairs.push(...clusters.get(key));
    }
    const diffs = sampledPairs.map(pairDifference).filter((v) => v !== null);
    if (diffs.length) samples.push(mean(diffs));
  }
  samples.sort((a, b) => a - b);
  const q = (p) => samples[Math.min(samples.length - 1, Math.max(0, Math.floor((samples.length - 1) * p)))];
  const point = mean(usable.map(pairDifference));
  return { pointEstimatePct: round(point * 100, 2), lower95Pct: round(q(0.025) * 100, 2), upper95Pct: round(q(0.975) * 100, 2), clusters: keys.length };
}

function stateLadder(observations = [], byKey = new Map(), options = {}) {
  const states = ["NO_CALIBRATED_ARRIVAL_EVIDENCE", "ARRIVAL_EVIDENCE_SHADOW", "ARRIVAL_PRESSURE_BUILDING_SHADOW", "COMMITTED_LOADED_VACUUM_SHADOW"];
  const result = {};
  for (const state of states) {
    const seen = new Set();
    const rows = [];
    for (const observation of observations.filter((row) => row.capitalArrivalState === state).sort((a, b) => ts(a.observedAt) - ts(b.observedAt))) {
      if (seen.has(observation.identityKey)) continue;
      seen.add(observation.identityKey);
      rows.push({ observation, outcome: resolveValidationOutcome(observation, byKey.get(observation.identityKey) || [], options) });
    }
    result[state] = outcomeStats(rows);
  }
  return result;
}

function promotionDecision(pairs = [], treatedStats = {}, controlStats = {}, bootstrap = {}, observations = [], options = {}) {
  const treatedResolved = treatedStats.resolved || 0;
  const uniqueProjects = new Set(pairs.filter((p) => p.treated?.outcome).map((p) => p.treated.observation.identityKey)).size;
  const dates = pairs.filter((p) => p.treated?.outcome).map((p) => ts(p.treated.observation.observedAt)).filter(Boolean);
  const spanDays = dates.length > 1 ? (Math.max(...dates) - Math.min(...dates)) / 86_400_000 : 0;
  const blockers = [];
  if (treatedResolved < Number(options.minResolvedTreatments || 100)) blockers.push("NEED_MORE_RESOLVED_TREATMENTS");
  if (uniqueProjects < Number(options.minUniqueProjects || 50)) blockers.push("NEED_MORE_UNIQUE_PROJECTS");
  if (spanDays < Number(options.minSpanDays || 56)) blockers.push("NEED_LONGER_TIME_SPAN");
  if (bootstrap.lower95Pct === null || bootstrap.lower95Pct <= 0) blockers.push("MATCHED_RISK_DIFFERENCE_NOT_POSITIVE_AT_95CI");
  const lift168 = num(treatedStats.medianReturnPctByHorizon?.["168"]) !== null && num(controlStats.medianReturnPctByHorizon?.["168"]) !== null
    ? treatedStats.medianReturnPctByHorizon["168"] - controlStats.medianReturnPctByHorizon["168"] : null;
  if (lift168 === null || lift168 <= 0) blockers.push("NO_POSITIVE_168H_MEDIAN_RETURN_LIFT");
  if (treatedStats.falseIgnitionPct !== null && controlStats.falseIgnitionPct !== null && treatedStats.falseIgnitionPct > controlStats.falseIgnitionPct + Number(options.maxFalseIgnitionPenaltyPct || 5)) blockers.push("FALSE_IGNITION_RATE_TOO_HIGH");
  return {
    state: blockers.length ? "SHADOW_VALIDATION_INCOMPLETE" : "REVIEW_FOR_INDEPENDENT_REPLICATION",
    blockers,
    treatedResolved,
    uniqueProjects,
    spanDays: round(spanDays, 1),
    median168hReturnLiftPct: round(lift168, 2),
    automaticProductionPromotion: false,
  };
}

export function buildCommittedLoadedVacuumValidation(observations = [], snapshots = [], options = {}) {
  const byKey = snapshotMap(snapshots);
  const treatments = firstTreatmentEpisodes(observations, options);
  const pairs = [];
  for (const treatment of treatments) {
    const controls = selectMatchedControls(treatment, observations, options).map((control) => ({
      observation: control,
      outcome: resolveValidationOutcome(control, byKey.get(control.identityKey) || [], options),
    }));
    pairs.push({
      treated: { observation: treatment, outcome: resolveValidationOutcome(treatment, byKey.get(treatment.identityKey) || [], options) },
      controls,
    });
  }
  const treatedRows = pairs.map((pair) => pair.treated);
  const controlRows = pairs.flatMap((pair) => pair.controls);
  const treatedStats = outcomeStats(treatedRows);
  const controlStats = outcomeStats(controlRows);
  const bootstrap = clusterBootstrapRiskDifference(pairs, options);
  const promotion = promotionDecision(pairs, treatedStats, controlStats, bootstrap, observations, options);
  const matchedPairsResolved = pairs.filter((pair) => pair.treated.outcome && pair.controls.some((c) => c.outcome)).length;
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    status: treatments.length ? (treatedStats.resolved ? "POINT_IN_TIME_MATCHED_VALIDATION" : "WAITING_FOR_FUTURE_OUTCOMES") : "COLLECTING_TREATMENT_HISTORY",
    treatmentDefinition: "First COMMITTED_LOADED_VACUUM_SHADOW observation per project after a configurable cooldown. All features are frozen before outcomes.",
    primaryOutcome: "+25% observed before -15% within 168h using discrete stored outcome snapshots",
    observations: observations.length,
    treatments: treatments.length,
    matchedPairsResolved,
    treatedPerformance: treatedStats,
    matchedControlPerformance: controlStats,
    matchedRiskDifferenceBootstrap95: bootstrap,
    stateLadder: stateLadder(observations, byKey, options),
    promotion,
    pairs: pairs.slice(-5000),
    shadowOnly: true,
    rankingInfluence: false,
    policy: "No signal is reconstructed from future information. Controls must be same-chain, non-treated, observed no later than the treated signal, and preferably share the supply-vacuum state. Code versions are not crossed by default. This lab can only recommend independent replication; it never promotes production ranking automatically.",
  };
}

export function runCommittedLoadedVacuumValidation(observations = [], snapshots = [], options = {}) {
  const report = buildCommittedLoadedVacuumValidation(observations, snapshots, options);
  if (options.writeReport !== false) {
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  }
  return report;
}

export const COMMITTED_LOADED_VACUUM_VALIDATION_REPORT = REPORT;
export const __committedLoadedVacuumValidationHooks = { snapshotMap, firstTreatmentEpisodes, outcomeStats, clusterBootstrapRiskDifference, pairDifference, promotionDecision };
