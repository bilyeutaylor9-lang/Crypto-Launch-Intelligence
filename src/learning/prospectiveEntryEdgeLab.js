import fs from "node:fs";
import path from "node:path";

import { buildOutcomeExamples } from "./outcomeCalibrationEngine.js";
import { loadOutcomeSnapshots } from "./outcomeSnapshotStore.js";
import { loadProspectiveEntryEdgeEpisodes } from "./prospectiveEntryEdgeEpisodeStore.js";
import { PROSPECTIVE_ENTRY_EDGE_TRIALS } from "./prospectiveEntryEdgeTrialRegistry.js";
import { loadScanMemory } from "./scanMemoryStore.js";

const REPORT_FILE = path.resolve("reports", "prospective-entry-edge.json");
const EXACT_STATUSES = new Set(["EXACT_CHAIN_TOKEN_MATCH", "EXACT_CHAIN_TOKEN_POOL_MATCH"]);

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 4) {
  const parsed = finite(value);
  return parsed === null ? null : Number(parsed.toFixed(digits));
}

function mean(values = []) {
  const rows = values.map(finite).filter((value) => value !== null);
  return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null;
}

function cappedReturn(value, cap = 300) {
  const parsed = finite(value);
  return parsed === null ? null : Math.max(-cap, Math.min(cap, parsed));
}

function executionCostPct(episode = {}, options = {}) {
  const floor = Math.max(0, Number(options.minimumRoundTripCostPct || 2));
  const observed = finite(episode.estimatedRoundTripSlippagePct);
  return round(observed === null ? floor : Math.max(floor, observed));
}

function seeded(seed = 91_711) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function exampleKey(identityKey, scannedAt) {
  return `${identityKey}|${scannedAt}`;
}

function resolvedEpisodeRows(episodes = [], examples = [], options = {}) {
  const byKey = new Map(examples.map((example) => [
    exampleKey(example.key, example.scannedAt),
    example,
  ]));
  return episodes.flatMap((episode) => {
    const example = byKey.get(exampleKey(episode.identityKey, episode.signalObservedAt));
    if (!example || !EXACT_STATUSES.has(example.outcomeProvenance?.verificationStatus)) return [];
    const grossReturnPct = cappedReturn(example.primaryChangePct);
    if (grossReturnPct === null) return [];
    const costPct = executionCostPct(episode, options);
    return [{
      ...episode,
      outcomeAt: example.outcomeAt,
      grossReturnPct,
      conservativeRoundTripCostPct: costPct,
      netReturnPct: round(grossReturnPct - costPct),
      outcomeVerificationStatus: example.outcomeProvenance.verificationStatus,
    }];
  });
}

function matchedPairs(rows = [], executableOnly = false) {
  const byEpisodeId = new Map(rows.map((row) => [row.episodeId, row]));
  const controlsByParent = new Map();
  for (const row of rows.filter((item) => item.role === "CONTROL_MATCHED")) {
    controlsByParent.set(row.parentTreatmentEpisodeId, [
      ...(controlsByParent.get(row.parentTreatmentEpisodeId) || []),
      row,
    ]);
  }
  return rows.filter((row) => row.role === "TREATMENT").flatMap((treatment) => {
    if (executableOnly && !treatment.executableAtSignal) return [];
    const controls = (controlsByParent.get(treatment.episodeId) || [])
      .filter((control) => !executableOnly || control.executableAtSignal);
    if (!controls.length || !byEpisodeId.has(treatment.episodeId)) return [];
    const controlMeanNetReturnPct = mean(controls.map((control) => control.netReturnPct));
    return [{
      pairId: treatment.episodeId,
      identityKey: treatment.identityKey,
      scannedAt: treatment.signalObservedAt,
      treatment,
      controls,
      treatmentNetReturnPct: treatment.netReturnPct,
      controlMeanNetReturnPct: round(controlMeanNetReturnPct),
      matchedEffectPct: round(treatment.netReturnPct - controlMeanNetReturnPct),
    }];
  });
}

function pairSummary(pairs = []) {
  const controls = pairs.flatMap((pair) => pair.controls);
  const treatmentMean = mean(pairs.map((pair) => pair.treatmentNetReturnPct));
  const controlMean = mean(pairs.map((pair) => pair.controlMeanNetReturnPct));
  return {
    resolvedTreatments: pairs.length,
    resolvedControls: controls.length,
    treatmentProjects: new Set(pairs.map((pair) => pair.identityKey)).size,
    controlProjects: new Set(controls.map((row) => row.identityKey)).size,
    treatmentMeanNetReturnPct: round(treatmentMean),
    controlMeanNetReturnPct: round(controlMean),
    matchedEffectPct: round(mean(pairs.map((pair) => pair.matchedEffectPct))),
    treatmentPositiveRatePct: pairs.length
      ? round((pairs.filter((pair) => pair.treatmentNetReturnPct > 0).length / pairs.length) * 100, 2)
      : null,
  };
}

function clusteredBootstrap(pairs = [], options = {}) {
  const clusters = new Map();
  for (const pair of pairs) clusters.set(pair.identityKey, [...(clusters.get(pair.identityKey) || []), pair]);
  const keys = [...clusters.keys()];
  if (keys.length < 5) return { clusters: keys.length, lower95Pct: null, upper95Pct: null, probabilityPositive: null };
  const random = seeded(Number(options.bootstrapSeed || 91_711));
  const repetitions = Math.max(500, Number(options.bootstrapReplicates || 5_000));
  const estimates = [];
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const sample = [];
    for (let index = 0; index < keys.length; index += 1) {
      sample.push(...clusters.get(keys[Math.floor(random() * keys.length)]));
    }
    const estimate = mean(sample.map((pair) => pair.matchedEffectPct));
    if (estimate !== null) estimates.push(estimate);
  }
  estimates.sort((left, right) => left - right);
  const quantile = (fraction) => estimates[Math.floor((estimates.length - 1) * fraction)];
  return {
    clusters: keys.length,
    lower95Pct: round(quantile(0.025)),
    upper95Pct: round(quantile(0.975)),
    probabilityPositive: round(
      estimates.filter((value) => value > 0).length / Math.max(1, estimates.length),
      6
    ),
  };
}

function cohortSummary(pairs = [], options = {}) {
  const byCohort = new Map();
  for (const pair of pairs) byCohort.set(pair.scannedAt, [...(byCohort.get(pair.scannedAt) || []), pair]);
  return [...byCohort.entries()].sort(([left], [right]) => Date.parse(left) - Date.parse(right)).map(([scannedAt, rows], index) => ({
    scannedAt,
    ...pairSummary(rows),
    bootstrap95: clusteredBootstrap(rows, { ...options, bootstrapSeed: Number(options.bootstrapSeed || 91_711) + index + 1 }),
  }));
}

function evaluateProspectiveCohort(pairs = [], trial = PROSPECTIVE_ENTRY_EDGE_TRIALS[0], options = {}) {
  const summary = pairSummary(pairs);
  const bootstrap95 = clusteredBootstrap(pairs, options);
  const cohorts = cohortSummary(pairs, options);
  const timestamps = pairs.map((pair) => Date.parse(pair.scannedAt)).filter(Number.isFinite);
  const captureSpanDays = timestamps.length > 1
    ? (Math.max(...timestamps) - Math.min(...timestamps)) / 86_400_000
    : 0;
  const policy = trial.verificationPolicy;
  const blockers = [];
  if (summary.resolvedTreatments < policy.minimumResolvedTreatments) blockers.push("NEED_MORE_RESOLVED_TREATMENTS");
  if (summary.resolvedControls < policy.minimumResolvedControls) blockers.push("NEED_MORE_RESOLVED_CONTROLS");
  if (summary.treatmentProjects < policy.minimumTreatmentProjects) blockers.push("NEED_MORE_TREATMENT_PROJECTS");
  if (summary.controlProjects < policy.minimumControlProjects) blockers.push("NEED_MORE_CONTROL_PROJECTS");
  if (cohorts.length < policy.minimumCohorts) blockers.push("NEED_MORE_PROSPECTIVE_COHORTS");
  if (captureSpanDays < policy.minimumCaptureSpanDays) blockers.push("NEED_LONGER_CAPTURE_SPAN");
  if (!(summary.treatmentMeanNetReturnPct >= policy.minimumMeanNetReturnPct)) blockers.push("MEAN_NET_RETURN_NOT_POSITIVE_ENOUGH");
  if (!(summary.matchedEffectPct >= policy.minimumMatchedEffectPct)) blockers.push("MATCHED_EFFECT_BELOW_MINIMUM");
  const positiveRatio = cohorts.length
    ? cohorts.filter((cohort) => finite(cohort.matchedEffectPct) > 0).length / cohorts.length
    : 0;
  if (positiveRatio < policy.minimumPositiveCohortRatio) blockers.push("EFFECT_NOT_REPLICATED_ACROSS_COHORTS");
  if (
    finite(bootstrap95.lower95Pct) === null ||
    bootstrap95.lower95Pct <= 0 ||
    finite(bootstrap95.probabilityPositive) < policy.minimumBootstrapProbabilityPositive
  ) blockers.push("PROJECT_CLUSTERED_CONFIDENCE_NOT_POSITIVE");
  const evidenceMature = (
    summary.resolvedTreatments >= policy.minimumResolvedTreatments &&
    summary.resolvedControls >= policy.minimumResolvedControls &&
    summary.treatmentProjects >= policy.minimumTreatmentProjects &&
    summary.controlProjects >= policy.minimumControlProjects &&
    cohorts.length >= policy.minimumCohorts &&
    captureSpanDays >= policy.minimumCaptureSpanDays
  );
  return {
    state: !evidenceMature
      ? "PROSPECTIVE_ENTRY_TRIAL_WARMING"
      : blockers.length
        ? "PROSPECTIVE_ENTRY_EDGE_NOT_VERIFIED"
        : "VERIFIED_PROSPECTIVE_ENTRY_EDGE",
    blockers,
    ...summary,
    bootstrap95,
    cohorts,
    positiveCohortRatio: round(positiveRatio, 4),
    captureSpanDays: round(captureSpanDays, 2),
    verificationPolicy: policy,
  };
}

function historicalDiscovery(examples = [], trial = PROSPECTIVE_ENTRY_EDGE_TRIALS[0]) {
  const declaredAtMs = Date.parse(trial.declaredAt);
  const rows = examples.filter((example) => {
    const catalyst = finite(example.scores?.liveCatalystRadar);
    const rich = finite(example.scores?.richToken);
    return Date.parse(example.scannedAt || "") < declaredAtMs &&
      catalyst !== null && catalyst > 0 && rich !== null && rich > 0 && rich < trial.thresholds.richTokenAvoidanceCeiling;
  });
  const treatments = rows.filter((row) => row.scores.liveCatalystRadar >= trial.thresholds.liveCatalystRadarScore);
  const controls = rows.filter((row) => row.scores.liveCatalystRadar < trial.thresholds.liveCatalystRadarScore);
  const treatmentMean = mean(treatments.map((row) => cappedReturn(row.primaryChangePct)));
  const controlMean = mean(controls.map((row) => cappedReturn(row.primaryChangePct)));
  return {
    state: "POST_HOC_DISCOVERY_ONLY",
    treatments: treatments.length,
    treatmentProjects: new Set(treatments.map((row) => row.key)).size,
    controls: controls.length,
    controlProjects: new Set(controls.map((row) => row.key)).size,
    treatmentMeanGrossReturnPct: round(treatmentMean),
    controlMeanGrossReturnPct: round(controlMean),
    unmatchedEffectPct: treatmentMean === null || controlMean === null ? null : round(treatmentMean - controlMean),
    mayVerifyEntryEdge: false,
  };
}

export function buildProspectiveEntryEdgeReport(options = {}) {
  const trial = options.trial || PROSPECTIVE_ENTRY_EDGE_TRIALS[0];
  const memory = options.memory || loadScanMemory();
  const examples = (options.examples || buildOutcomeExamples(
    memory,
    options.snapshots || loadOutcomeSnapshots(),
    [trial.horizonHours],
    { requireVerifiedOutcomeProvenance: true }
  )).filter((example) => EXACT_STATUSES.has(example.outcomeProvenance?.verificationStatus));
  const episodes = options.episodes || loadProspectiveEntryEdgeEpisodes(options.episodeStore || {});
  const resolvedRows = resolvedEpisodeRows(episodes, examples, options);
  const signalPairs = matchedPairs(resolvedRows, false);
  const executablePairs = matchedPairs(resolvedRows, true);
  const prospective = evaluateProspectiveCohort(executablePairs, trial, options);
  const state = !episodes.length
    ? "PROSPECTIVE_ENTRY_TRIAL_WAITING_FOR_FIRST_SCAN"
    : !resolvedRows.length
      ? "PROSPECTIVE_ENTRY_TRIAL_WARMING"
      : prospective.state;
  return {
    schemaVersion: 1,
    generatedAt: new Date(options.now || Date.now()).toISOString(),
    state,
    trial,
    historicalDiscovery: historicalDiscovery(examples, trial),
    prospectiveSignalCohort: {
      ...pairSummary(signalPairs),
      episodes: episodes.length,
      resolvedEpisodeRows: resolvedRows.length,
      note: "Signal-only observations diagnose the rule but cannot verify an executable edge.",
    },
    prospectiveExecutableCohort: prospective,
    outcomePolicy: "Only exact provider observations at 168h are accepted. Missing outcomes remain UNKNOWN.",
    costPolicy: `Every simulated round trip deducts at least ${executionCostPct({}, options)}%.`,
    discoveryContaminationPrevented: true,
    picksForced: false,
    scoringInfluence: false,
    rankingInfluence: false,
    automaticTrading: false,
    automaticProductionPromotion: false,
    policy: "Historical evidence only nominated the rule. Only post-declaration, frozen, matched, exact-outcome, execution-eligible cohorts can verify an entry edge.",
  };
}

export function runProspectiveEntryEdgeLab(options = {}) {
  const report = buildProspectiveEntryEdgeReport(options);
  if (options.writeReport !== false) {
    const file = options.reportFile || REPORT_FILE;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(runProspectiveEntryEdgeLab(), null, 2));
}

export const PROSPECTIVE_ENTRY_EDGE_REPORT_FILE = REPORT_FILE;
export const __prospectiveEntryEdgeLabHooks = {
  finite,
  executionCostPct,
  resolvedEpisodeRows,
  matchedPairs,
  pairSummary,
  clusteredBootstrap,
  evaluateProspectiveCohort,
  historicalDiscovery,
};
