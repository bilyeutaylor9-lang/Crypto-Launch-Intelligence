import fs from "node:fs";
import path from "node:path";

import { buildCommittedLoadedVacuumValidation } from "./committedLoadedVacuumValidationLab.js";
import { replicationSpecHash, REPLICATION_SPEC } from "./committedLoadedVacuumReplicationPlanStore.js";

const REPORT = path.resolve("reports", "committed-loaded-vacuum-replication.json");

function finite(value) { if (value === null || value === undefined || value === "") return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function ts(value) { const t = Date.parse(value || ""); return Number.isFinite(t) ? t : null; }
function round(value, digits = 4) { const n = finite(value); return n === null ? null : Number(n.toFixed(digits)); }
function mean(values = []) { const a = values.map(finite).filter((v) => v !== null); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; }

function pairDifference(pair = {}) {
  const t = pair?.treated?.outcome?.plus25BeforeMinus15;
  if (t === null || typeof t !== "boolean") return null;
  const controls = (pair.controls || []).map((c) => c?.outcome?.plus25BeforeMinus15).filter((v) => typeof v === "boolean");
  if (!controls.length) return null;
  return (t ? 1 : 0) - controls.filter(Boolean).length / controls.length;
}

function timeBlockStability(pairs = [], options = {}) {
  const blockDays = Math.max(1, Number(options.timeBlockDays || 7));
  const minPairsPerBlock = Math.max(1, Number(options.minPairsPerBlock || 3));
  const blocks = new Map();
  for (const pair of pairs) {
    const at = ts(pair?.treated?.observation?.observedAt);
    const diff = pairDifference(pair);
    if (!at || diff === null) continue;
    const key = Math.floor(at / (blockDays * 86_400_000));
    blocks.set(key, [...(blocks.get(key) || []), diff]);
  }
  const rows = [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([key, diffs]) => ({
    blockStart: new Date(key * blockDays * 86_400_000).toISOString(),
    pairs: diffs.length,
    meanPrimaryRiskDifference: round(mean(diffs), 6),
  })).filter((row) => row.pairs >= minPairsPerBlock);
  const positive = rows.filter((row) => row.meanPrimaryRiskDifference > 0).length;
  return {
    blockDays,
    qualifyingBlocks: rows.length,
    positiveBlocks: positive,
    positiveDirectionPct: rows.length ? round((positive / rows.length) * 100, 2) : null,
    blocks: rows,
  };
}

function confirmationRows(plan = {}, observations = [], options = {}) {
  const cutoff = ts(plan.cutoffObservedAt);
  if (!cutoff) return [];
  return (Array.isArray(observations) ? observations : []).filter((row) => {
    const at = ts(row?.observedAt);
    if (!at || at <= cutoff) return false;
    if (options.allowLegacySignalVersion === true) return true;
    return row.signalDefinitionVersion === plan.signalDefinitionVersion;
  });
}

export function buildCommittedLoadedVacuumReplication(plan = null, observations = [], snapshots = [], options = {}) {
  if (!plan) {
    return {
      version: 1, generatedAt: new Date().toISOString(), state: "REPLICATION_NOT_ARMED", confirmationObservations: 0,
      shadowOnly: true, rankingInfluence: false, automaticProductionPromotion: false,
    };
  }
  const currentHash = replicationSpecHash();
  if (plan.signalSpecHash !== currentHash || plan.signalDefinitionVersion !== REPLICATION_SPEC.signalDefinitionVersion) {
    return {
      version: 1, generatedAt: new Date().toISOString(), state: "REPLICATION_SPEC_MISMATCH_FAIL_CLOSED",
      expectedSignalSpecHash: currentHash, planSignalSpecHash: plan.signalSpecHash || null,
      shadowOnly: true, rankingInfluence: false, automaticProductionPromotion: false,
    };
  }
  const rows = confirmationRows(plan, observations, options);
  const defaults = { ...REPLICATION_SPEC.confirmationDefaults, ...(plan.confirmationDefaults || {}), ...(options.confirmationDefaults || {}) };
  const validation = buildCommittedLoadedVacuumValidation(rows, snapshots, {
    ...options,
    minResolvedTreatments: defaults.minResolvedTreatments,
    minUniqueProjects: defaults.minUniqueProjects,
    minSpanDays: defaults.minSpanDays,
  });
  const resolvedPairs = validation.pairs.filter((pair) => pair?.treated?.outcome && pair.controls?.some((c) => c?.outcome));
  const resolvedTreatmentPairs = validation.pairs.filter((pair) => pair?.treated?.outcome);
  const uniqueProjects = new Set(resolvedTreatmentPairs.map((pair) => pair.treated.observation.identityKey)).size;
  const dates = resolvedTreatmentPairs.map((pair) => ts(pair.treated.observation.observedAt)).filter(Boolean);
  const spanDays = dates.length > 1 ? (Math.max(...dates) - Math.min(...dates)) / 86_400_000 : 0;
  const stability = timeBlockStability(resolvedPairs, options);
  const treated = validation.treatedPerformance;
  const controls = validation.matchedControlPerformance;
  const bootstrap = validation.matchedRiskDifferenceBootstrap95;
  const lift168 = finite(treated?.medianReturnPctByHorizon?.["168"]) !== null && finite(controls?.medianReturnPctByHorizon?.["168"]) !== null
    ? treated.medianReturnPctByHorizon["168"] - controls.medianReturnPctByHorizon["168"] : null;
  const falseDeterioration = finite(treated?.falseIgnitionPct) !== null && finite(controls?.falseIgnitionPct) !== null
    ? treated.falseIgnitionPct - controls.falseIgnitionPct : null;

  const maturityBlockers = [];
  if ((treated?.resolved || 0) < defaults.minResolvedTreatments) maturityBlockers.push("NEED_MORE_CONFIRMATION_TREATMENTS");
  if (uniqueProjects < defaults.minUniqueProjects) maturityBlockers.push("NEED_MORE_CONFIRMATION_PROJECTS");
  if (spanDays < defaults.minSpanDays) maturityBlockers.push("NEED_LONGER_CONFIRMATION_SPAN");
  if (stability.qualifyingBlocks < Math.max(2, Number(options.minQualifyingTimeBlocks || 3))) maturityBlockers.push("NEED_MORE_CONFIRMATION_TIME_BLOCKS");

  const evidenceBlockers = [];
  if (bootstrap?.lower95Pct === null || bootstrap.lower95Pct <= 0) evidenceBlockers.push("CONFIRMATION_PRIMARY_EFFECT_NOT_POSITIVE_AT_95CI");
  if (lift168 === null || lift168 <= 0) evidenceBlockers.push("CONFIRMATION_168H_RETURN_LIFT_NOT_POSITIVE");
  if (falseDeterioration !== null && falseDeterioration > defaults.maxFalseIgnitionDeteriorationPct) evidenceBlockers.push("CONFIRMATION_FALSE_IGNITION_DERIORATED");
  if (stability.positiveDirectionPct === null || stability.positiveDirectionPct < defaults.minPositiveTimeBlockPct) evidenceBlockers.push("CONFIRMATION_EFFECT_NOT_TIME_STABLE");

  const state = maturityBlockers.length
    ? "INDEPENDENT_REPLICATION_COLLECTING"
    : evidenceBlockers.length
      ? "INDEPENDENT_REPLICATION_FAILED"
      : "INDEPENDENT_REPLICATION_SUPPORTED_SHADOW";

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    state,
    plan: {
      armedAt: plan.armedAt,
      cutoffObservedAt: plan.cutoffObservedAt,
      signalDefinitionVersion: plan.signalDefinitionVersion,
      signalSpecHash: plan.signalSpecHash,
    },
    confirmationObservations: rows.length,
    confirmationTreatments: validation.treatments,
    resolvedTreatments: treated?.resolved || 0,
    resolvedMatchedPairs: validation.matchedPairsResolved,
    uniqueProjects,
    spanDays: round(spanDays, 2),
    matchedRiskDifferenceBootstrap95: bootstrap,
    median168hReturnLiftPct: round(lift168, 4),
    falseIgnitionDeteriorationPct: round(falseDeterioration, 4),
    timeBlockStability: stability,
    maturityBlockers,
    evidenceBlockers,
    confirmationValidation: validation,
    shadowOnly: true,
    rankingInfluence: false,
    automaticProductionPromotion: false,
    policy: "Confirmation observations must be strictly after the frozen cutoff and use the frozen signal definition. Failure does not trigger threshold retuning. Support remains shadow-only and requires human/independent review before any production experiment.",
  };
}

export function runCommittedLoadedVacuumReplication(plan = null, observations = [], snapshots = [], options = {}) {
  const report = buildCommittedLoadedVacuumReplication(plan, observations, snapshots, options);
  if (options.writeReport !== false) {
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  }
  return report;
}

export const COMMITTED_LOADED_VACUUM_REPLICATION_REPORT = REPORT;
export const __committedLoadedVacuumReplicationHooks = { pairDifference, timeBlockStability, confirmationRows };
