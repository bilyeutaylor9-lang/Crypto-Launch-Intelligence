import fs from "node:fs";
import path from "node:path";

import { median } from "../edge/edgeMath.js";
import { frozenEdgeCostEvidence, normalizeEdgeEpisode, prepareEdgeEpisodes } from "./edgeProductionEpisodeStore.js";
import { deduplicateEdgeRecords, edgeAsOfMs } from "./matchedControlSelector.js";

const REPORT_FILE = path.resolve("reports", "edge-mechanism-contrast.json");

function finite(value) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 4) {
  const parsed = finite(value);
  return parsed === null ? null : Number(parsed.toFixed(digits));
}

const MECHANISMS = Object.freeze([
  {
    key: "capitalArrival",
    label: "Capital Arrival",
    value: (features) => finite(features.sixHourExpectedArrivalToIgnitionRatio),
    strong: (value) => value >= 1,
    definition: "sixHourExpectedArrivalToIgnitionRatio >= 1",
  },
  {
    key: "sellerExhaustion",
    label: "Seller Exhaustion",
    value: (features) => finite(features.sellerExhaustionScore),
    strong: (value) => value >= 60,
    definition: "sellerExhaustionScore >= 60",
  },
  {
    key: "buyerReplacement",
    label: "Buyer Replacement",
    value: (features) => finite(features.buyerReplacementScore),
    strong: (value) => value >= 60,
    definition: "buyerReplacementScore >= 60",
  },
  {
    key: "supplyVacuum",
    label: "Supply Vacuum Integrity",
    value: (features) => typeof features.supplyVacuumSupported === "boolean" ? features.supplyVacuumSupported : null,
    strong: (value) => value === true,
    definition: "supplyVacuumSupported === true",
  },
]);

function contrastFor(records = [], mechanism = {}, options = {}) {
  const rows = records.flatMap((record) => {
    const netReturnPct = finite(record.outcomes?.["168h"]?.netReturnPct);
    const value = mechanism.value(record.episode?.frozenFeatures || {});
    if (netReturnPct === null || value === null) return [];
    return [{
      identityKey: record.episode.identityKey,
      episodeId: record.episode.episodeId,
      netReturnPct,
      strong: mechanism.strong(value),
      value,
    }];
  });
  const strong = rows.filter((row) => row.strong);
  const weak = rows.filter((row) => !row.strong);
  const minPerSide = Math.max(1, Number(options.minMechanismSamplesPerSide || 10));
  const strongMedian = median(strong.map((row) => row.netReturnPct));
  const weakMedian = median(weak.map((row) => row.netReturnPct));
  const mature = strong.length >= minPerSide && weak.length >= minPerSide &&
    new Set(strong.map((row) => row.identityKey)).size >= minPerSide &&
    new Set(weak.map((row) => row.identityKey)).size >= minPerSide &&
    new Set(rows.map((row) => row.identityKey)).size >= Number(options.minMechanismUniqueProjects || 15);
  return {
    key: mechanism.key,
    label: mechanism.label,
    predeclaredDefinition: mechanism.definition,
    observed: rows.length,
    uniqueProjects: new Set(rows.map((row) => row.identityKey)).size,
    strongSamples: strong.length,
    weakSamples: weak.length,
    strongUniqueProjects: new Set(strong.map((row) => row.identityKey)).size,
    weakUniqueProjects: new Set(weak.map((row) => row.identityKey)).size,
    strongMedianNet168hReturnPct: round(strongMedian),
    weakMedianNet168hReturnPct: round(weakMedian),
    strongMinusWeakMedianNet168hPct: strongMedian === null || weakMedian === null
      ? null
      : round(strongMedian - weakMedian),
    state: mature ? "MECHANISM_CONTRAST_OBSERVED" : "MECHANISM_CONTRAST_INSUFFICIENT_EVIDENCE",
    rankingInfluence: false,
  };
}

export function buildEdgeMechanismContrast(outcomeLab = {}, options = {}) {
  const now = edgeAsOfMs(options);
  const unique = deduplicateEdgeRecords(outcomeLab.records || [], (record) => record?.episode?.episodeId);
  const prepared = prepareEdgeEpisodes(unique.rows.map((record) => record.episode), { now });
  const eligibleIds = new Set(prepared.episodes.map((episode) => episode.episodeId));
  const treatments = unique.rows.flatMap((record) => {
    if (!eligibleIds.has(record.episode.episodeId)) return [];
    const episode = normalizeEdgeEpisode(record.episode, { now });
    if (!episode || episode.role !== "TREATMENT") return [];
    const terminal = record.outcomes?.["168h"];
    const cost = frozenEdgeCostEvidence(episode, { now }).costBps;
    const target = Date.parse(episode.signalObservedAt) + 168 * 3_600_000;
    const observed = Date.parse(terminal?.observedAt || "");
    const gross = finite(terminal?.grossReturnPct), net = finite(terminal?.netReturnPct);
    if (cost === null || gross === null || net === null || terminal.state !== "NET_OUTCOME_RESOLVED" || terminal.observed !== true ||
        !Number.isFinite(observed) || observed < target || observed > target + 24 * 3_600_000 || observed > now ||
        Date.parse(episode.frozenAt) > target || Date.parse(terminal.targetAt) !== target ||
        terminal.observationId !== `${episode.episodeId}:168h` ||
        finite(terminal.frozenRoundTripExecutionCostBps) !== cost || Math.abs(net - (gross - cost / 100)) > 0.00011) return [];
    return [{ ...record, episode }];
  });
  const contrasts = MECHANISMS.map((mechanism) => contrastFor(treatments, mechanism, options));
  const mature = contrasts.filter((row) => row.state === "MECHANISM_CONTRAST_OBSERVED");
  const strongest = [...mature]
    .filter((row) => finite(row.strongMinusWeakMedianNet168hPct) !== null)
    .sort((left, right) => Math.abs(right.strongMinusWeakMedianNet168hPct) - Math.abs(left.strongMinusWeakMedianNet168hPct))[0] || null;
  return {
    schemaVersion: 1,
    generatedAt: new Date(now).toISOString(),
    state: mature.length ? "MECHANISM_CONTRASTS_AVAILABLE" : "MECHANISM_CONTRASTS_COLLECTING",
    treatmentRecords: treatments.length,
    integrity: { ...prepared.integrity, duplicateRecords: unique.duplicates,
      conflictingEpisodeIds: [...new Set([...unique.conflicts, ...prepared.integrity.conflictingEpisodeIds])] },
    contrasts,
    strongestObservedContrast: strongest,
    policy: "Contrasts use exact terminal 168h net outcomes and frozen features only. They diagnose mechanisms; they do not alter the alpha hypothesis, ranking, or selection.",
    hypothesisChanged: false,
    rankingInfluence: false,
    scoringInfluence: false,
  };
}

export function runEdgeMechanismContrast(outcomeLab = {}, options = {}) {
  const report = buildEdgeMechanismContrast(outcomeLab, options);
  if (options.writeReport !== false) {
    const file = options.reportFile || REPORT_FILE;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

export const EDGE_MECHANISM_CONTRAST_REPORT = REPORT_FILE;
export const __edgeMechanismContrastHooks = { finite, contrastFor, MECHANISMS };
