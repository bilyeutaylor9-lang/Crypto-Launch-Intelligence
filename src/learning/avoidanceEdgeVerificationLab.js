import fs from "node:fs";
import path from "node:path";

import {
  buildOutcomeExamples,
  CALIBRATED_SIGNALS,
} from "./outcomeCalibrationEngine.js";
import { loadOutcomeSnapshots } from "./outcomeSnapshotStore.js";
import { loadScanMemory } from "./scanMemoryStore.js";

const REPORT_FILE = path.resolve("reports", "avoidance-edge-verification.json");
const HORIZON_HOURS = 168;

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
  const active = values.map(finite).filter((value) => value !== null);
  return active.length
    ? active.reduce((sum, value) => sum + value, 0) / active.length
    : null;
}

function cappedReturn(value, cap = 300) {
  const parsed = finite(value);
  return parsed === null ? null : Math.max(-cap, Math.min(cap, parsed));
}

function seeded(seed = 17_081) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function signalRows(signal = {}, examples = []) {
  return examples.flatMap((example) => {
    const score = finite(example.scores?.[signal.key]);
    const outcomeReturnPct = cappedReturn(example.primaryChangePct);
    if (score === null || score <= 0 || outcomeReturnPct === null) return [];
    return [{
      identityKey: example.key,
      scannedAt: example.scannedAt,
      outcomeAt: example.outcomeAt,
      score,
      group: score >= 60 ? "TRIGGERED" : "CONTROL_BELOW_THRESHOLD",
      outcomeReturnPct,
      verificationStatus: example.outcomeProvenance?.verificationStatus || null,
    }];
  });
}

function summarizeRows(rows = []) {
  const triggered = rows.filter((row) => row.group === "TRIGGERED");
  const controls = rows.filter((row) => row.group === "CONTROL_BELOW_THRESHOLD");
  const triggeredMean = mean(triggered.map((row) => row.outcomeReturnPct));
  const controlMean = mean(controls.map((row) => row.outcomeReturnPct));
  return {
    observations: rows.length,
    exactProjects: new Set(rows.map((row) => row.identityKey)).size,
    triggeredObservations: triggered.length,
    triggeredProjects: new Set(triggered.map((row) => row.identityKey)).size,
    controlObservations: controls.length,
    controlProjects: new Set(controls.map((row) => row.identityKey)).size,
    triggeredMeanReturnPct: round(triggeredMean),
    controlMeanReturnPct: round(controlMean),
    avoidanceEffectPct:
      triggeredMean === null || controlMean === null
        ? null
        : round(controlMean - triggeredMean),
  };
}

function clusteredBootstrap(rows = [], options = {}) {
  const clusters = new Map();
  for (const row of rows) {
    clusters.set(row.identityKey, [...(clusters.get(row.identityKey) || []), row]);
  }
  const keys = [...clusters.keys()];
  if (keys.length < 5) {
    return {
      clusters: keys.length,
      lower95Pct: null,
      upper95Pct: null,
      probabilityPositive: null,
    };
  }
  const random = seeded(Number(options.bootstrapSeed || 17_081));
  const repetitions = Math.max(500, Number(options.bootstrapReplicates || 5_000));
  const estimates = [];
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const sampled = [];
    for (let index = 0; index < keys.length; index += 1) {
      sampled.push(...clusters.get(keys[Math.floor(random() * keys.length)]));
    }
    const estimate = summarizeRows(sampled).avoidanceEffectPct;
    if (estimate !== null) estimates.push(estimate);
  }
  estimates.sort((left, right) => left - right);
  const quantile = (fraction) => estimates[
    Math.max(0, Math.min(
      estimates.length - 1,
      Math.floor((estimates.length - 1) * fraction)
    ))
  ];
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

function cohortSummaries(rows = [], options = {}) {
  const groups = new Map();
  for (const row of rows) {
    groups.set(row.scannedAt, [...(groups.get(row.scannedAt) || []), row]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => Date.parse(left) - Date.parse(right))
    .map(([scannedAt, cohortRows], index) => ({
      scannedAt,
      ...summarizeRows(cohortRows),
      clusteredBootstrap95: clusteredBootstrap(cohortRows, {
        ...options,
        bootstrapSeed: Number(options.bootstrapSeed || 17_081) + index + 1,
      }),
    }));
}

function verificationPolicy(options = {}) {
  return {
    minimumObservations: Number(options.minimumObservations || 100),
    minimumTriggeredProjects: Number(options.minimumTriggeredProjects || 20),
    minimumControlProjects: Number(options.minimumControlProjects || 30),
    minimumCohorts: Number(options.minimumCohorts || 3),
    minimumCohortTriggeredObservations: Number(
      options.minimumCohortTriggeredObservations || 10
    ),
    minimumCohortControlObservations: Number(
      options.minimumCohortControlObservations || 20
    ),
    minimumAvoidanceEffectPct: Number(options.minimumAvoidanceEffectPct || 3),
    minimumLatestCohortTriggeredProjects: Number(
      options.minimumLatestCohortTriggeredProjects || 15
    ),
    minimumLatestCohortControlProjects: Number(
      options.minimumLatestCohortControlProjects || 20
    ),
  };
}

function evaluateSignal(signal = {}, examples = [], options = {}) {
  const rows = signalRows(signal, examples);
  const summary = summarizeRows(rows);
  const cohorts = cohortSummaries(rows, options);
  const latestCohort = cohorts.at(-1) || null;
  const bootstrap = clusteredBootstrap(rows, options);
  const policy = verificationPolicy(options);
  const blockers = [];
  if (summary.observations < policy.minimumObservations) blockers.push("NEED_MORE_168H_OBSERVATIONS");
  if (summary.triggeredProjects < policy.minimumTriggeredProjects) blockers.push("NEED_MORE_TRIGGERED_PROJECTS");
  if (summary.controlProjects < policy.minimumControlProjects) blockers.push("NEED_MORE_CONTROL_PROJECTS");
  if (cohorts.length < policy.minimumCohorts) blockers.push("NEED_MORE_SCAN_COHORTS");
  if (cohorts.some((cohort) =>
    cohort.triggeredObservations < policy.minimumCohortTriggeredObservations ||
    cohort.controlObservations < policy.minimumCohortControlObservations
  )) blockers.push("COHORT_SAMPLE_TOO_SMALL");
  if (cohorts.some((cohort) =>
    finite(cohort.avoidanceEffectPct) === null ||
    cohort.avoidanceEffectPct < policy.minimumAvoidanceEffectPct
  )) blockers.push("AVOIDANCE_EFFECT_NOT_REPLICATED_ACROSS_COHORTS");
  if (
    summary.avoidanceEffectPct === null ||
    summary.avoidanceEffectPct < policy.minimumAvoidanceEffectPct
  ) blockers.push("AVOIDANCE_EFFECT_BELOW_MINIMUM");
  if (finite(bootstrap.lower95Pct) === null || bootstrap.lower95Pct <= 0) {
    blockers.push("PROJECT_CLUSTERED_95CI_NOT_POSITIVE");
  }
  if (
    !latestCohort ||
    latestCohort.triggeredProjects < policy.minimumLatestCohortTriggeredProjects ||
    latestCohort.controlProjects < policy.minimumLatestCohortControlProjects
  ) blockers.push("LATEST_COHORT_SAMPLE_TOO_SMALL");
  if (
    !latestCohort ||
    finite(latestCohort.clusteredBootstrap95?.lower95Pct) === null ||
    latestCohort.clusteredBootstrap95.lower95Pct <= 0
  ) blockers.push("LATEST_COHORT_95CI_NOT_POSITIVE");

  const timestamps = rows.map((row) => Date.parse(row.scannedAt)).filter(Number.isFinite);
  return {
    signal: signal.key,
    label: signal.label,
    threshold: 60,
    horizonHours: HORIZON_HOURS,
    state: blockers.length
      ? "AVOIDANCE_EDGE_NOT_VERIFIED"
      : "VERIFIED_SAME_REGIME_AVOIDANCE_EDGE",
    blockers,
    ...summary,
    projectClusteredBootstrap95: bootstrap,
    cohorts,
    latestCohort,
    signalCaptureSpanHours: timestamps.length > 1
      ? round((Math.max(...timestamps) - Math.min(...timestamps)) / 3_600_000, 2)
      : 0,
    verificationPolicy: policy,
  };
}

export function buildAvoidanceEdgeVerificationReport(options = {}) {
  const sourceExamples = options.examples || buildOutcomeExamples(
    options.memory || loadScanMemory(),
    options.snapshots || loadOutcomeSnapshots(),
    [HORIZON_HOURS],
    { ...options, requireVerifiedOutcomeProvenance: true }
  );
  const examples = sourceExamples.filter((example) =>
    Number(example.horizonHours) === HORIZON_HOURS &&
    [
      "EXACT_CHAIN_TOKEN_MATCH",
      "EXACT_CHAIN_TOKEN_POOL_MATCH",
    ].includes(example.outcomeProvenance?.verificationStatus)
  );
  const signals = CALIBRATED_SIGNALS
    .filter((signal) => signal.positive)
    .map((signal) => evaluateSignal(signal, examples, options))
    .sort((left, right) =>
      Number(right.projectClusteredBootstrap95?.lower95Pct || -Infinity) -
      Number(left.projectClusteredBootstrap95?.lower95Pct || -Infinity)
    );
  const verifiedEdges = signals.filter(
    (signal) => signal.state === "VERIFIED_SAME_REGIME_AVOIDANCE_EDGE"
  );
  return {
    schemaVersion: 1,
    generatedAt: new Date(options.now || Date.now()).toISOString(),
    state: verifiedEdges.length
      ? "VERIFIED_SAME_REGIME_AVOIDANCE_EDGE"
      : "NO_VERIFIED_AVOIDANCE_EDGE",
    horizonHours: HORIZON_HOURS,
    exactProviderOutcomeExamples: examples.length,
    exactProjects: new Set(examples.map((example) => example.key)).size,
    verifiedEdges,
    signals,
    validationClass: "OBSERVATIONAL_REPLICATED_EXCLUSION_EDGE",
    causalClaimAllowed: false,
    crossRegimeVerified: false,
    sameRegimeScope: true,
    picksForced: false,
    buySignalCreated: false,
    rankingInfluence: false,
    scoringInfluence: false,
    automaticExclusionAllowed: false,
    automaticProductionPromotion: false,
    policy: "A verified result identifies a replicated historical exclusion advantage only. It cannot create a buy, bypass any gate, or claim causality. Cross-regime confirmation remains required before broader production use.",
    limitations: [
      "Signal capture currently spans a short market window even though outcomes mature at 168 hours.",
      "Triggered and below-threshold projects are observational cohorts, not randomized assignments.",
      "Avoidance effects do not establish a tradable long or short return after execution costs.",
    ],
  };
}

export function runAvoidanceEdgeVerification(options = {}) {
  const report = buildAvoidanceEdgeVerificationReport(options);
  if (options.writeReport !== false) {
    const file = options.reportFile || REPORT_FILE;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(runAvoidanceEdgeVerification(), null, 2));
}

export const AVOIDANCE_EDGE_VERIFICATION_REPORT = REPORT_FILE;
export const __avoidanceEdgeVerificationHooks = {
  signalRows,
  summarizeRows,
  clusteredBootstrap,
  cohortSummaries,
  verificationPolicy,
  evaluateSignal,
};
