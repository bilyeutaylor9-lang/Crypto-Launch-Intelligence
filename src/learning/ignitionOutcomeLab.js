import fs from "fs";
import path from "path";

import { median, num } from "../edge/edgeMath.js";
import { loadIgnitionTwinObservations } from "./ignitionTwinObservationStore.js";
import { loadOutcomeSnapshots } from "./outcomeSnapshotStore.js";

const REPORT_FILE = path.resolve("reports", "ignition-outcome-lab.json");
const DEFAULT_HORIZONS = [1, 6, 24, 72, 168];
const TRACKED_STATES = new Set(["FORMING", "COMPRESSED", "ARMED", "IGNITING", "EXPANSION", "EXHAUSTION"]);

function timestamp(value) {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function returnPct(startPrice, endPrice) {
  const start = num(startPrice);
  const end = num(endPrice);
  if (start === null || end === null || start <= 0 || end <= 0) return null;
  return ((end - start) / start) * 100;
}

function toleranceHours(horizonHours) {
  return Math.max(1, Math.min(24, Number(horizonHours) * 0.35));
}

function snapshotsByKey(snapshots = []) {
  const map = new Map();
  for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
    if (!snapshot?.key || !timestamp(snapshot.timestamp) || num(snapshot.priceUsd) === null) continue;
    map.set(snapshot.key, [...(map.get(snapshot.key) || []), snapshot]);
  }
  for (const rows of map.values()) rows.sort((a, b) => timestamp(a.timestamp) - timestamp(b.timestamp));
  return map;
}

function resolveOutcome(observation = {}, rows = [], horizonHours = 24) {
  const startMs = timestamp(observation.observedAt);
  const startPrice = num(observation.priceUsd);
  if (!startMs || startPrice === null || startPrice <= 0) return null;
  const targetMs = startMs + horizonHours * 3_600_000;
  const maxMs = targetMs + toleranceHours(horizonHours) * 3_600_000;
  const match = rows.find((row) => {
    const at = timestamp(row.timestamp);
    return at && at >= targetMs && at <= maxMs && num(row.priceUsd) !== null && num(row.priceUsd) > 0;
  });
  if (!match) return null;
  return {
    horizonHours,
    targetAt: new Date(targetMs).toISOString(),
    observedAt: match.timestamp,
    returnPct: returnPct(startPrice, match.priceUsd),
    startPriceUsd: startPrice,
    endPriceUsd: num(match.priceUsd),
  };
}

function summarizeReturns(values = []) {
  const active = values.map(num).filter((value) => value !== null);
  const count = active.length;
  if (!count) return { sampleSize: 0, medianReturnPct: null, win25Pct: null, win50Pct: null, win100Pct: null, loss20Pct: null };
  const pct = (predicate) => Math.round((active.filter(predicate).length / count) * 1000) / 10;
  return {
    sampleSize: count,
    medianReturnPct: median(active),
    win25Pct: pct((value) => value >= 25),
    win50Pct: pct((value) => value >= 50),
    win100Pct: pct((value) => value >= 100),
    loss20Pct: pct((value) => value <= -20),
  };
}

export function buildIgnitionOutcomeLab(observations = [], snapshots = [], options = {}) {
  const horizons = Array.isArray(options.horizons) && options.horizons.length ? options.horizons : DEFAULT_HORIZONS;
  const byKey = snapshotsByKey(snapshots);
  const records = [];

  for (const observation of Array.isArray(observations) ? observations : []) {
    if (!TRACKED_STATES.has(observation.state) || !observation.identityKey) continue;
    const rows = byKey.get(observation.identityKey) || [];
    const outcomes = Object.fromEntries(
      horizons.map((horizon) => [String(horizon), resolveOutcome(observation, rows, horizon)])
    );
    records.push({
      identityKey: observation.identityKey,
      observedAt: observation.observedAt,
      state: observation.state,
      symbol: observation.symbol || null,
      ignitionCapitalUsd: num(observation.ignitionCapitalUsd),
      evidenceCoveragePct: num(observation.evidenceCoveragePct),
      outcomes,
    });
  }

  const byState = {};
  for (const state of TRACKED_STATES) {
    const stateRows = records.filter((row) => row.state === state);
    byState[state] = Object.fromEntries(horizons.map((horizon) => {
      const values = stateRows.map((row) => row.outcomes[String(horizon)]?.returnPct).filter((value) => value !== null && value !== undefined);
      return [String(horizon), summarizeReturns(values)];
    }));
  }

  return {
    version: 1,
    status: records.length ? "POINT_IN_TIME_EVALUATION" : "INSUFFICIENT_OUTCOME_HISTORY",
    generatedAt: new Date().toISOString(),
    horizons,
    records: records.slice(-5000),
    statePerformance: byState,
    policy: "This lab evaluates frozen historical Ignition Twin states only. It does not backfill signals from future information and does not promote production ranking by itself.",
  };
}

export function runIgnitionOutcomeLab(options = {}) {
  const observations = options.observations || loadIgnitionTwinObservations({ limit: options.observationLimit || 20000 });
  const snapshots = options.snapshots || loadOutcomeSnapshots();
  const report = buildIgnitionOutcomeLab(observations, snapshots, options);
  if (options.writeReport !== false) {
    fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(runIgnitionOutcomeLab(), null, 2));
}
