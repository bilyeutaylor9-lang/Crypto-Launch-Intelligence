import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  classifyProspectiveEntryTrialRecord,
  PROSPECTIVE_ENTRY_EDGE_TRIALS,
} from "./prospectiveEntryEdgeTrialRegistry.js";

const FILE = path.resolve("data", "prospective-entry-edge-episodes.jsonl");
const MAX_BYTES = 48 * 1024 * 1024;

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function episodeId(classification = {}, role = "TREATMENT", parentTreatmentEpisodeId = null) {
  return crypto.createHash("sha256").update([
    classification.trialId,
    classification.signalObservedAt,
    classification.identityKey,
    classification.poolAddress,
    role,
    parentTreatmentEpisodeId || "ROOT",
  ].join("|")).digest("hex").slice(0, 32);
}

function matchDistance(treatment = {}, control = {}) {
  const logDistance = (left, right) => {
    const a = finite(left);
    const b = finite(right);
    if (!(a > 0) || !(b > 0)) return 1.5;
    return Math.min(3, Math.abs(Math.log10(a) - Math.log10(b)));
  };
  return (
    logDistance(treatment.marketCap, control.marketCap) * 1.3 +
    logDistance(treatment.liquidityUsd, control.liquidityUsd) * 1.5 +
    logDistance(treatment.volume24h, control.volume24h) +
    (treatment.chain === control.chain ? 0 : 2) +
    (treatment.executableAtSignal === control.executableAtSignal ? 0 : 0.75)
  );
}

function frozenEpisode(record = {}, classification = {}, role, parentTreatmentEpisodeId = null, distance = null) {
  return {
    schemaVersion: 1,
    trialId: classification.trialId,
    trialSchemaVersion: classification.trialSchemaVersion,
    declaredAt: classification.declaredAt,
    episodeId: episodeId(classification, role, parentTreatmentEpisodeId),
    role,
    parentTreatmentEpisodeId,
    signalObservedAt: classification.signalObservedAt,
    codeCommitSha: record.codeCommitSha || process.env.GITHUB_SHA || null,
    scanRunId: record.scanRunId || null,
    chain: classification.chain,
    tokenAddress: classification.tokenAddress,
    poolAddress: classification.poolAddress,
    identityKey: classification.identityKey,
    symbol: record.symbol || null,
    name: record.name || null,
    signalPriceUsd: finite(record.market?.priceUsd),
    marketCap: finite(record.market?.marketCap),
    liquidityUsd: finite(record.market?.liquidityUsd),
    volume24h: finite(record.market?.volume24h),
    liveCatalystRadarScore: classification.liveCatalystRadarScore,
    richTokenScore: classification.richTokenScore,
    executableAtSignal: classification.executableAtSignal,
    safetyState: classification.safetyState,
    identityState: classification.identityState,
    routeTruthStatus: classification.routeTruthStatus,
    estimatedRoundTripSlippagePct: classification.estimatedRoundTripSlippagePct,
    matchDistance: finite(distance),
    exactIdentityFrozen: true,
    outcomeHorizonHours: 168,
    postDeclaration: true,
    rankingInfluence: false,
    scoringInfluence: false,
    realMoneyOrderCreated: false,
  };
}

function readRows(file = FILE) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

export function loadProspectiveEntryEdgeEpisodes(options = {}) {
  return readRows(options.file || FILE).slice(-Math.max(1, Number(options.limit || 100_000)));
}

export function buildProspectiveEntryEdgeCohort(records = [], options = {}) {
  const trial = options.trial || PROSPECTIVE_ENTRY_EDGE_TRIALS[0];
  const classified = (Array.isArray(records) ? records : []).flatMap((record) => {
    const classification = classifyProspectiveEntryTrialRecord(record, trial);
    return classification ? [{ record, classification }] : [];
  });
  const treatments = classified.filter((row) => row.classification.role === "TREATMENT");
  const controls = classified.filter((row) => row.classification.role === "CONTROL_POOL");
  const maxControls = Math.max(1, Number(options.maxControls || 3));
  const episodes = [];
  for (const treatment of treatments) {
    const treatmentEpisode = frozenEpisode(
      treatment.record,
      treatment.classification,
      "TREATMENT"
    );
    const matched = controls
      .filter((control) => control.classification.identityKey !== treatment.classification.identityKey)
      .map((control) => ({
        ...control,
        distance: matchDistance(
          { ...treatment.record.market, ...treatment.classification },
          { ...control.record.market, ...control.classification }
        ),
      }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, maxControls);
    if (!matched.length) continue;
    episodes.push(treatmentEpisode);
    for (const control of matched) {
      episodes.push(frozenEpisode(
        control.record,
        control.classification,
        "CONTROL_MATCHED",
        treatmentEpisode.episodeId,
        control.distance
      ));
    }
  }
  return {
    trialId: trial.trialId,
    classifiedRecords: classified.length,
    treatmentCandidates: treatments.length,
    controlCandidates: controls.length,
    matchedTreatments: episodes.filter((row) => row.role === "TREATMENT").length,
    matchedControls: episodes.filter((row) => row.role === "CONTROL_MATCHED").length,
    episodes,
  };
}

export function captureProspectiveEntryEdgeCohort(records = [], options = {}) {
  const cohort = buildProspectiveEntryEdgeCohort(records, options);
  if (options.persist === false) return { ...cohort, saved: 0, duplicates: 0, file: options.file || FILE };
  const file = options.file || FILE;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = readRows(file);
  const ids = new Set(existing.map((row) => row.episodeId).filter(Boolean));
  const fresh = cohort.episodes.filter((row) => !ids.has(row.episodeId));
  if (fresh.length) fs.appendFileSync(file, `${fresh.map((row) => JSON.stringify(row)).join("\n")}\n`);
  if (fs.existsSync(file) && fs.statSync(file).size > Number(options.maxBytes || MAX_BYTES)) {
    const retained = readRows(file).slice(-50_000);
    fs.writeFileSync(file, `${retained.map((row) => JSON.stringify(row)).join("\n")}\n`);
  }
  return {
    ...cohort,
    saved: fresh.length,
    duplicates: cohort.episodes.length - fresh.length,
    file,
  };
}

export const PROSPECTIVE_ENTRY_EDGE_EPISODE_FILE = FILE;
export const __prospectiveEntryEdgeEpisodeHooks = { finite, episodeId, matchDistance, frozenEpisode, readRows };
