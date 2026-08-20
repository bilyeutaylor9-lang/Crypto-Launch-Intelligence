import fs from "node:fs";
import path from "node:path";

import { median } from "../edge/edgeMath.js";
import { EDGE_PRODUCTION_HORIZONS } from "./edgeProductionEpisodeStore.js";
import { findExactEdgeOutcome } from "./edgeEvidenceHealthGovernor.js";

const REPORT_FILE = path.resolve("reports", "edge-evidence-outcome-lab.json");

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 4) {
  const parsed = finite(value);
  return parsed === null ? null : Number(parsed.toFixed(digits));
}

function mean(values = []) {
  const active = values.map(finite).filter((value) => value !== null);
  return active.length ? active.reduce((sum, value) => sum + value, 0) / active.length : null;
}

function percent(numerator, denominator) {
  return denominator ? round((numerator / denominator) * 100, 2) : null;
}

function returnPct(entry, exit) {
  const start = finite(entry);
  const end = finite(exit);
  return start !== null && start > 0 && end !== null && end > 0
    ? ((end - start) / start) * 100
    : null;
}

function episodeHorizonOutcome(episode = {}, outcomes = [], horizonHours) {
  const observation = findExactEdgeOutcome(episode, horizonHours, outcomes);
  if (!observation) {
    return {
      state: "OUTCOME_UNKNOWN",
      horizonHours,
      observed: false,
      grossReturnPct: null,
      netReturnPct: null,
    };
  }
  const grossReturnPct = returnPct(episode.signalPriceUsd, observation.priceUsd);
  const costBps = finite(episode.frozenRoundTripExecutionCostBps);
  return {
    state: costBps === null ? "GROSS_OUTCOME_ONLY_EXECUTION_COST_UNKNOWN" : "NET_OUTCOME_RESOLVED",
    horizonHours,
    observed: true,
    targetAt: observation.targetAt,
    observedAt: observation.observedAt,
    grossReturnPct: round(grossReturnPct),
    frozenRoundTripExecutionCostBps: costBps,
    netReturnPct: costBps === null || grossReturnPct === null
      ? null
      : round(grossReturnPct - costBps / 100),
    observationId: observation.observationId,
  };
}

export function resolveTerminal168Outcome(episode = {}, outcomes = []) {
  const path = EDGE_PRODUCTION_HORIZONS
    .map((hours) => episodeHorizonOutcome(episode, outcomes, hours))
    .filter((row) => row.observed)
    .sort((left, right) => timestamp(left.observedAt) - timestamp(right.observedAt));
  const upside = path.find((row) => row.grossReturnPct >= 25) || null;
  const downside = path.find((row) => row.grossReturnPct <= -15) || null;
  const terminal = path.find((row) => row.horizonHours === 168) || null;
  let plus25BeforeMinus15 = null;
  let state = "UNKNOWN_TERMINAL_168H_OBSERVATION_MISSING";
  if (upside) {
    plus25BeforeMinus15 = !downside || timestamp(upside.observedAt) < timestamp(downside.observedAt);
    state = plus25BeforeMinus15 ? "UPSIDE_HIT_FIRST" : "DOWNSIDE_HIT_FIRST";
  } else if (downside) {
    plus25BeforeMinus15 = false;
    state = "DOWNSIDE_HIT_FIRST";
  } else if (terminal) {
    plus25BeforeMinus15 = false;
    state = "NO_HIT_WITH_TERMINAL_168H_OBSERVATION";
  }
  return {
    state,
    plus25BeforeMinus15,
    terminal168Observed: Boolean(terminal),
    firstUpsideObservedAt: upside?.observedAt || null,
    firstDownsideObservedAt: downside?.observedAt || null,
    pathObservations: path.length,
  };
}

function episodeRecord(episode = {}, outcomes = []) {
  return {
    episode,
    outcomes: Object.fromEntries(EDGE_PRODUCTION_HORIZONS.map((hours) => [
      `${hours}h`,
      episodeHorizonOutcome(episode, outcomes, hours),
    ])),
    terminal168: resolveTerminal168Outcome(episode, outcomes),
  };
}

function matchedPairs(records = [], horizonHours) {
  const treatments = records.filter((row) => row.episode.role === "TREATMENT");
  const controls = records.filter((row) => String(row.episode.role).startsWith("CONTROL_"));
  const key = `${horizonHours}h`;
  const rows = [];
  for (const treatment of treatments) {
    const treatedReturn = finite(treatment.outcomes[key]?.netReturnPct);
    if (treatedReturn === null) continue;
    const matched = controls.filter((row) =>
      row.episode.parentTreatmentEpisodeId === treatment.episode.episodeId &&
      finite(row.outcomes[key]?.netReturnPct) !== null
    );
    const controlReturns = matched.map((row) => row.outcomes[key].netReturnPct);
    if (!controlReturns.length) continue;
    const controlMedianNetReturnPct = median(controlReturns);
    rows.push({
      treatmentEpisodeId: treatment.episode.episodeId,
      treatmentIdentityKey: treatment.episode.identityKey,
      treatmentObservedAt: treatment.episode.signalObservedAt,
      treatmentNetReturnPct: treatedReturn,
      controlEpisodes: matched.length,
      controlMedianNetReturnPct: round(controlMedianNetReturnPct),
      matchedNetLiftPct: round(treatedReturn - controlMedianNetReturnPct),
    });
  }
  return rows;
}

function seeded(seed = 9321) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function clusteredBootstrap(pairs = [], options = {}) {
  const usable = pairs.filter((row) => finite(row.matchedNetLiftPct) !== null);
  const clusters = new Map();
  for (const row of usable) {
    clusters.set(row.treatmentIdentityKey, [...(clusters.get(row.treatmentIdentityKey) || []), row]);
  }
  const keys = [...clusters.keys()];
  if (keys.length < 5) {
    return { clusters: keys.length, pointEstimatePct: round(mean(usable.map((row) => row.matchedNetLiftPct))), lower95Pct: null, upper95Pct: null };
  }
  const random = seeded(Number(options.bootstrapSeed || 9321));
  const samples = [];
  const repetitions = Math.max(500, Number(options.bootstrapReplicates || 2000));
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const sampled = [];
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[Math.floor(random() * keys.length)];
      sampled.push(...clusters.get(key).map((row) => row.matchedNetLiftPct));
    }
    samples.push(mean(sampled));
  }
  samples.sort((left, right) => left - right);
  const quantile = (fraction) => samples[Math.max(0, Math.min(samples.length - 1, Math.floor((samples.length - 1) * fraction)))];
  return {
    clusters: keys.length,
    pointEstimatePct: round(mean(usable.map((row) => row.matchedNetLiftPct))),
    lower95Pct: round(quantile(0.025)),
    upper95Pct: round(quantile(0.975)),
  };
}

function summarizeHorizon(records = [], horizonHours, options = {}) {
  const key = `${horizonHours}h`;
  const treatments = records.filter((row) => row.episode.role === "TREATMENT");
  const controls = records.filter((row) => String(row.episode.role).startsWith("CONTROL_"));
  const treatedNet = treatments.map((row) => row.outcomes[key]?.netReturnPct).filter((value) => finite(value) !== null);
  const controlNet = controls.map((row) => row.outcomes[key]?.netReturnPct).filter((value) => finite(value) !== null);
  const pairs = matchedPairs(records, horizonHours);
  const bootstrap = clusteredBootstrap(pairs, options);
  return {
    horizonHours,
    treatmentEpisodes: treatments.length,
    controlEpisodes: controls.length,
    treatmentNetResolved: treatedNet.length,
    controlNetResolved: controlNet.length,
    matchedPairs: pairs.length,
    uniqueTreatmentProjects: new Set(pairs.map((row) => row.treatmentIdentityKey)).size,
    treatmentMedianNetReturnPct: round(median(treatedNet)),
    controlMedianNetReturnPct: round(median(controlNet)),
    matchedMedianNetLiftPct: round(median(pairs.map((row) => row.matchedNetLiftPct))),
    matchedMeanNetLiftPct: round(mean(pairs.map((row) => row.matchedNetLiftPct))),
    matchedPositiveLiftRatePct: percent(pairs.filter((row) => row.matchedNetLiftPct > 0).length, pairs.length),
    clusteredBootstrap95: bootstrap,
    pairs: pairs.slice(-5000),
  };
}

function verificationDecision(summary = {}, health = {}, options = {}) {
  const blockers = [];
  const minMatchedPairs = Math.max(1, Number(options.minMatchedPairs || 30));
  const minUniqueProjects = Math.max(1, Number(options.minUniqueProjects || 20));
  const minSpanDays = Math.max(1, Number(options.minSpanDays || 56));
  const minMatchedNetLiftPct = Number(options.minMatchedNetLiftPct || 3);
  const dates = (summary.pairs || []).map((row) => timestamp(row.treatmentObservedAt)).filter(Boolean);
  const spanDays = dates.length > 1 ? (Math.max(...dates) - Math.min(...dates)) / 86_400_000 : 0;
  if (health.state === "AUTOPILOT_EVIDENCE_COVERAGE_BLOCKED") blockers.push("EVIDENCE_COVERAGE_BLOCKED");
  if (summary.matchedPairs < minMatchedPairs) blockers.push("NEED_MORE_MATCHED_168H_PAIRS");
  if (summary.uniqueTreatmentProjects < minUniqueProjects) blockers.push("NEED_MORE_UNIQUE_TREATMENT_PROJECTS");
  if (spanDays < minSpanDays) blockers.push("NEED_LONGER_OUT_OF_SAMPLE_SPAN");
  if (finite(summary.matchedMeanNetLiftPct) === null || summary.matchedMeanNetLiftPct < minMatchedNetLiftPct) blockers.push("MATCHED_NET_LIFT_BELOW_MINIMUM");
  if (finite(summary.matchedMedianNetLiftPct) === null || summary.matchedMedianNetLiftPct <= 0) blockers.push("MATCHED_MEDIAN_NET_LIFT_NOT_POSITIVE");
  if (finite(summary.clusteredBootstrap95?.lower95Pct) === null || summary.clusteredBootstrap95.lower95Pct <= 0) blockers.push("CLUSTERED_95CI_NOT_POSITIVE");
  return {
    state: blockers.length ? "EDGE_NOT_YET_VERIFIED" : "VERIFIED_MATCHED_NET_EDGE",
    blockers,
    matchedPairs: summary.matchedPairs,
    uniqueTreatmentProjects: summary.uniqueTreatmentProjects,
    spanDays: round(spanDays, 2),
    thresholds: { minMatchedPairs, minUniqueProjects, minSpanDays, minMatchedNetLiftPct },
    productionPromotionAllowed: false,
    humanReviewRequired: true,
  };
}

export function buildEdgeEvidenceOutcomeLab(episodes = [], outcomes = [], health = {}, options = {}) {
  const records = (Array.isArray(episodes) ? episodes : []).map((episode) => episodeRecord(episode, outcomes));
  const byHorizon = Object.fromEntries(EDGE_PRODUCTION_HORIZONS.map((hours) => [
    `${hours}h`,
    summarizeHorizon(records, hours, options),
  ]));
  const verification = verificationDecision(byHorizon["168h"], health, options);
  const treatmentTerminal = records.filter((row) => row.episode.role === "TREATMENT");
  const unknownTerminal = treatmentTerminal.filter((row) => row.terminal168.plus25BeforeMinus15 === null).length;
  return {
    schemaVersion: 1,
    generatedAt: new Date(options.now || Date.now()).toISOString(),
    state: health.state === "AUTOPILOT_EVIDENCE_COVERAGE_BLOCKED"
      ? "AUTOPILOT_EVIDENCE_COVERAGE_BLOCKED"
      : verification.state,
    evidenceHealthState: health.state || "UNKNOWN",
    episodes: records.length,
    treatments: treatmentTerminal.length,
    controls: records.length - treatmentTerminal.length,
    treatmentTerminal168: {
      resolvedLabels: treatmentTerminal.length - unknownTerminal,
      unknownLabels: unknownTerminal,
      hitRatePct: percent(
        treatmentTerminal.filter((row) => row.terminal168.plus25BeforeMinus15 === true).length,
        treatmentTerminal.length - unknownTerminal
      ),
    },
    byHorizon,
    verification,
    records: records.slice(-5000),
    missingOutcomePolicy: "A_NO_HIT_LABEL_REQUIRES_AN_EXACT_TERMINAL_168H_OBSERVATION_OR_AN_ACTUAL_DOWNSIDE_THRESHOLD_OBSERVATION",
    hypothesisChanged: false,
    rankingInfluence: false,
    scoringInfluence: false,
    automaticProductionPromotion: false,
  };
}

export function runEdgeEvidenceOutcomeLab(episodes = [], outcomes = [], health = {}, options = {}) {
  const report = buildEdgeEvidenceOutcomeLab(episodes, outcomes, health, options);
  if (options.writeReport !== false) {
    const file = options.reportFile || REPORT_FILE;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

export const EDGE_EVIDENCE_OUTCOME_LAB_REPORT = REPORT_FILE;
export const __edgeEvidenceOutcomeLabHooks = {
  finite,
  timestamp,
  mean,
  percent,
  returnPct,
  episodeHorizonOutcome,
  episodeRecord,
  matchedPairs,
  clusteredBootstrap,
  summarizeHorizon,
  verificationDecision,
};
