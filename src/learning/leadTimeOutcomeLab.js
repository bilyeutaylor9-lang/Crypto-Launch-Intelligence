import fs from "fs";
import path from "path";
import {
  canonicalIdentityKey,
  hoursBetween,
  num,
  pctChange,
  timestampOf,
} from "../edge/edgeMath.js";
import { loadAsymmetricEdgeObservations } from "./asymmetricEdgeObservationStore.js";

const DATA_FILE = path.resolve("data", "asymmetric-edge-outcomes.json");
const REPORT_FILE = path.resolve("reports", "asymmetric-edge-outcome-lab.json");
const DEFAULT_HORIZONS = [6, 24, 72, 168];

function snapshotKey(snapshot = {}) {
  return snapshot.key || canonicalIdentityKey(snapshot);
}

function snapshotMap(snapshots = []) {
  const map = new Map();
  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    const key = snapshotKey(snapshot);
    if (!key || !snapshot.timestamp || num(snapshot.priceUsd) === null) continue;
    map.set(key, [...(map.get(key) || []), snapshot]);
  }
  for (const rows of map.values()) rows.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  return map;
}

function thresholdOutcome(observation = {}, snapshots = [], horizonHours = 24, options = {}) {
  const startAt = observation.observedAt;
  const startPrice = num(observation.priceUsd);
  if (!startAt || startPrice === null || startPrice <= 0) return null;
  const upsideThresholdPct = Number(options.upsideThresholdPct ?? 25);
  const downsideThresholdPct = Number(options.downsideThresholdPct ?? -15);

  const future = snapshots
    .map((snapshot) => ({
      snapshot,
      elapsedHours: hoursBetween(startAt, snapshot.timestamp),
      returnPct: pctChange(startPrice, snapshot.priceUsd),
    }))
    .filter((item) => item.elapsedHours !== null && item.elapsedHours > 0 && item.elapsedHours <= horizonHours && item.returnPct !== null)
    .sort((a, b) => a.elapsedHours - b.elapsedHours);

  const upside = future.find((item) => item.returnPct >= upsideThresholdPct) || null;
  const downside = future.find((item) => item.returnPct <= downsideThresholdPct) || null;
  let firstThreshold = "NEITHER_OBSERVED";
  if (upside && downside) firstThreshold = upside.elapsedHours <= downside.elapsedHours ? "UPSIDE" : "DOWNSIDE";
  else if (upside) firstThreshold = "UPSIDE";
  else if (downside) firstThreshold = "DOWNSIDE";

  const last = future.at(-1) || null;
  const maxReturnPct = future.length ? Math.max(...future.map((item) => item.returnPct)) : null;
  const minReturnPct = future.length ? Math.min(...future.map((item) => item.returnPct)) : null;

  return {
    horizonHours,
    observations: future.length,
    firstThreshold,
    firstUpsideHours: upside?.elapsedHours ?? null,
    firstDownsideHours: downside?.elapsedHours ?? null,
    maxReturnPct,
    minReturnPct,
    endReturnPct: last?.returnPct ?? null,
    lastObservedHours: last?.elapsedHours ?? null,
  };
}

export function buildLeadTimeOutcomeLab(edgeObservations = [], outcomeSnapshots = [], options = {}) {
  const horizons = (options.horizons || DEFAULT_HORIZONS).map(Number).filter((value) => value > 0);
  const byKey = snapshotMap(outcomeSnapshots);
  const rows = [];

  for (const observation of Array.isArray(edgeObservations) ? edgeObservations : []) {
    const snapshots = byKey.get(observation.identityKey) || [];
    if (!snapshots.length || num(observation.priceUsd) === null) continue;
    const outcomes = Object.fromEntries(
      horizons.map((horizon) => [String(horizon), thresholdOutcome(observation, snapshots, horizon, options)])
    );
    if (!Object.values(outcomes).some((outcome) => outcome?.observations)) continue;
    rows.push({
      identityKey: observation.identityKey,
      observedAt: observation.observedAt,
      symbol: observation.symbol || null,
      chain: observation.chain || null,
      priceUsd: observation.priceUsd,
      productionScore: observation.productionScore,
      projectClockScore: observation.projectClockScore,
      capitalClockScore: observation.capitalClockScore,
      attentionClockScore: observation.attentionClockScore,
      divergenceScore: observation.divergenceScore,
      divergenceState: observation.divergenceState,
      leadStage: observation.leadStage,
      leadStageLabel: observation.leadStageLabel,
      structuralBreakScore: observation.structuralBreakScore,
      structuralBreakState: observation.structuralBreakState,
      fakeMomentumRiskScore: observation.fakeMomentumRiskScore,
      residualBlindspotSimilarity: observation.residualBlindspotSimilarity,
      sequenceSimilarity: observation.sequenceSimilarity,
      outcomes,
    });
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: rows.length >= 30 ? "EXPLORATORY_SAMPLE" : "INSUFFICIENT_SAMPLE",
    rows: rows.length,
    uniqueProjects: new Set(rows.map((row) => row.identityKey)).size,
    horizons,
    upsideThresholdPct: Number(options.upsideThresholdPct ?? 25),
    downsideThresholdPct: Number(options.downsideThresholdPct ?? -15),
    records: rows,
    warning:
      "Threshold timing is based only on observed future snapshots. An unobserved intra-window move can be missed; this lab never assumes continuous price coverage.",
  };

  if (options.persist !== false) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(options.dataFile || DATA_FILE, JSON.stringify(report, null, 2));
  }
  if (options.writeReport !== false) {
    fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
    fs.writeFileSync(options.reportFile || REPORT_FILE, JSON.stringify({ ...report, records: rows.slice(-500) }, null, 2));
  }
  return report;
}

export function loadLeadTimeOutcomeLab(options = {}) {
  const file = options.dataFile || DATA_FILE;
  if (!fs.existsSync(file)) return { status: "MISSING", rows: 0, records: [], horizons: DEFAULT_HORIZONS };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : { status: "INVALID", rows: 0, records: [] };
  } catch {
    return { status: "INVALID", rows: 0, records: [] };
  }
}

async function loadDefaultOutcomeSnapshots(options = {}) {
  if (Array.isArray(options.outcomeSnapshots)) return options.outcomeSnapshots;
  const { loadOutcomeSnapshots } = await import("./outcomeSnapshotStore.js");
  return loadOutcomeSnapshots();
}

export async function refreshLeadTimeOutcomeLab(options = {}) {
  const edgeObservations = Array.isArray(options.edgeObservations)
    ? options.edgeObservations
    : loadAsymmetricEdgeObservations(options.store || {});
  const outcomeSnapshots = await loadDefaultOutcomeSnapshots(options);
  return buildLeadTimeOutcomeLab(edgeObservations, outcomeSnapshots, options);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  refreshLeadTimeOutcomeLab()
    .then((report) => console.log(JSON.stringify({ ...report, records: undefined }, null, 2)))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
