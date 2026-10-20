import fs from "node:fs";
import path from "node:path";

import { EDGE_PRODUCTION_HORIZONS, edgeTimestampsValid, normalizeEdgeEpisode, prepareEdgeEpisodes } from "./edgeProductionEpisodeStore.js";
import { canonicalEdgeIdentity, deduplicateEdgeRecords, edgeAsOfMs } from "./matchedControlSelector.js";
import { edgeEvidenceToleranceHours } from "./edgeEvidenceProbe.js";

const REPORT_FILE = path.resolve("reports", "edge-evidence-health.json");

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function percent(numerator, denominator) {
  return denominator ? Number(((numerator / denominator) * 100).toFixed(2)) : null;
}

export function findExactEdgeOutcome(episode = {}, horizonHours, outcomes = [], options = {}) {
  const nowMs = edgeAsOfMs(options);
  const normalized = normalizeEdgeEpisode(episode, { now: nowMs });
  if (!normalized || !EDGE_PRODUCTION_HORIZONS.includes(Number(horizonHours))) return null;
  const { chain, tokenAddress, poolAddress } = normalized;
  const signalMs = timestamp(episode.signalObservedAt || episode.frozenAt);
  if (signalMs === null) return null;
  const targetMs = signalMs + Number(horizonHours) * 3_600_000;
  const maximumMs = targetMs + edgeEvidenceToleranceHours(horizonHours) * 3_600_000;
  const frozenMs = timestamp(episode.frozenAt);
  if (targetMs > nowMs || (frozenMs !== null && frozenMs > targetMs)) return null;
  const related = (Array.isArray(outcomes) ? outcomes : []).filter((row) =>
    row?.episodeId === episode.episodeId && Number(row.horizonHours) === Number(horizonHours));
  const unique = deduplicateEdgeRecords(related, (row) => row.observationId || `${row.episodeId}:${row.horizonHours}:${row.observedAt}`);
  const points = deduplicateEdgeRecords(unique.rows, (row) => `${row.episodeId}:${row.horizonHours}:${timestamp(row.observedAt)}`);
  if (unique.conflicts.length || points.conflicts.length) return null;
  return points.rows
    .filter((row) => {
      if (row.episodeId !== episode.episodeId || Number(row.horizonHours) !== Number(horizonHours)) return false;
      const identity = canonicalEdgeIdentity(row);
      const observedMs = timestamp(row.observedAt);
      const exactStatus = ["EXACT_BASE_TOKEN_POOL_MATCH", "EXACT_BASE_TOKEN_MATCH_POOL_CAPTURED"].includes(row.provenance?.verificationStatus);
      return identity?.chain === chain && identity.tokenAddress === tokenAddress &&
        (!poolAddress || identity.poolAddress === poolAddress) && edgeTimestampsValid(row, nowMs) &&
        (!row.observationId || row.observationId === `${episode.episodeId}:${Number(horizonHours)}h`) &&
        (row.targetAt === undefined || timestamp(row.targetAt) === targetMs) &&
        (row.signalObservedAt === undefined || timestamp(row.signalObservedAt) === signalMs) &&
        (row.role === undefined || row.role === episode.role) &&
        (row.parentTreatmentEpisodeId === undefined || row.parentTreatmentEpisodeId === episode.parentTreatmentEpisodeId) &&
        observedMs >= targetMs && observedMs <= maximumMs &&
        (frozenMs === null || observedMs >= frozenMs) &&
        (typeof row.priceUsd === "number" || typeof row.priceUsd === "string") &&
        Number.isFinite(Number(row.priceUsd)) && Number(row.priceUsd) > 0 && exactStatus;
    })
    .sort((left, right) => timestamp(left.observedAt) - timestamp(right.observedAt))[0] || null;
}

function horizonHealth(episodes = [], outcomes = [], horizonHours, nowMs) {
  const rows = [];
  for (const episode of episodes) {
    const signalMs = timestamp(episode.signalObservedAt || episode.frozenAt);
    if (!episode.episodeId || !signalMs) continue;
    const targetMs = signalMs + horizonHours * 3_600_000;
    const deadlineMs = targetMs + edgeEvidenceToleranceHours(horizonHours) * 3_600_000;
    const outcome = findExactEdgeOutcome(episode, horizonHours, outcomes, { now: nowMs });
    let state = "NOT_DUE";
    if (outcome) state = "RESOLVED_EXACT";
    else if (nowMs >= targetMs && nowMs <= deadlineMs) state = "DUE_IN_COLLECTION_WINDOW";
    else if (nowMs > deadlineMs) state = "MISSED_UNKNOWN";
    rows.push({ episode, state, outcome, targetMs, deadlineMs });
  }
  const resolved = rows.filter((row) => row.state === "RESOLVED_EXACT").length;
  const missed = rows.filter((row) => row.state === "MISSED_UNKNOWN").length;
  const pending = rows.filter((row) => row.state === "DUE_IN_COLLECTION_WINDOW").length;
  const notDue = rows.filter((row) => row.state === "NOT_DUE").length;
  return {
    horizonHours,
    episodes: rows.length,
    resolved,
    missedUnknown: missed,
    pending,
    notDue,
    matureExpected: resolved + missed,
    coveragePct: percent(resolved, resolved + missed),
    treatmentResolved: rows.filter((row) => row.state === "RESOLVED_EXACT" && row.episode.role === "TREATMENT").length,
    controlResolved: rows.filter((row) => row.state === "RESOLVED_EXACT" && String(row.episode.role).startsWith("CONTROL_")).length,
  };
}

export function buildEdgeEvidenceHealth(episodes = [], outcomes = [], options = {}) {
  const nowMs = edgeAsOfMs(options), now = new Date(nowMs).toISOString();
  const prepared = prepareEdgeEpisodes(episodes, { now: nowMs });
  const exactEpisodes = prepared.episodes;
  const byHorizon = Object.fromEntries(EDGE_PRODUCTION_HORIZONS.map((hours) => [
    `${hours}h`,
    horizonHealth(exactEpisodes, outcomes, hours, nowMs),
  ]));
  const horizonRows = Object.values(byHorizon);
  const resolved = horizonRows.reduce((sum, row) => sum + row.resolved, 0);
  const missedUnknown = horizonRows.reduce((sum, row) => sum + row.missedUnknown, 0);
  const matureExpected = resolved + missedUnknown;
  const overallCoveragePct = percent(resolved, matureExpected);
  const terminal = byHorizon["168h"];
  const minMatureOutcomes = Math.max(1, Number(options.minMatureOutcomes || 5));
  const minCoveragePct = Number(options.minCoveragePct || 80);
  const minTerminalMatureOutcomes = Math.max(1, Number(options.minTerminalMatureOutcomes || 5));
  const minTerminalCoveragePct = Number(options.minTerminalCoveragePct || 75);
  const blockers = [];
  if (prepared.integrity.conflictingEpisodeIds.length || prepared.integrity.invalidEpisodes) blockers.push("EPISODE_IDENTITY_OR_TIME_INTEGRITY_FAILURE");
  if (matureExpected >= minMatureOutcomes && overallCoveragePct < minCoveragePct) {
    blockers.push("OVERALL_EXACT_OUTCOME_COVERAGE_TOO_LOW");
  }
  if (terminal.matureExpected >= minTerminalMatureOutcomes && terminal.coveragePct < minTerminalCoveragePct) {
    blockers.push("TERMINAL_168H_COVERAGE_TOO_LOW");
  }
  const probe = options.probeReport || null;
  if (probe?.state === "EDGE_EVIDENCE_PROVIDER_DEGRADED" && Number(probe.dueEpisodes || 0) >= minMatureOutcomes) {
    blockers.push("CURRENT_PROVIDER_CYCLE_DEGRADED");
  }

  let state = "AUTOPILOT_EVIDENCE_WARMING";
  if (blockers.length) state = "AUTOPILOT_EVIDENCE_COVERAGE_BLOCKED";
  else if (matureExpected >= minMatureOutcomes) state = "AUTOPILOT_EVIDENCE_HEALTHY";
  return {
    schemaVersion: 1,
    generatedAt: now,
    state,
    exactBaseEpisodes: exactEpisodes.length,
    integrity: prepared.integrity,
    treatments: exactEpisodes.filter((row) => row.role === "TREATMENT").length,
    controls: exactEpisodes.filter((row) => String(row.role).startsWith("CONTROL_")).length,
    matureExpected,
    resolved,
    missedUnknown,
    overallCoveragePct,
    byHorizon,
    blockers,
    thresholds: {
      minMatureOutcomes,
      minCoveragePct,
      minTerminalMatureOutcomes,
      minTerminalCoveragePct,
    },
    missingOutcomePolicy: "MISSED_OBSERVATIONS_REMAIN_UNKNOWN_AND_NEVER_BECOME_ZERO_RETURN_OR_FAILED_TRADES",
    rankingInfluence: false,
    automaticProductionPromotion: false,
  };
}

export function runEdgeEvidenceHealth(episodes = [], outcomes = [], options = {}) {
  const report = buildEdgeEvidenceHealth(episodes, outcomes, options);
  if (options.writeReport !== false) {
    const file = options.reportFile || REPORT_FILE;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

export const EDGE_EVIDENCE_HEALTH_REPORT = REPORT_FILE;
export const __edgeEvidenceHealthHooks = { timestamp, percent, exactOutcomeFor: findExactEdgeOutcome, horizonHealth };
