import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { extractUnassignedCapitalPathFeatures } from "../learning/capitalPathFeatureExtractor.js";
import { capitalRadarProjectKey } from "../sensors/chainWideCapitalRadarSensor.js";

const DATA_DIR = path.resolve("data");
const FILE = path.join(DATA_DIR, "capital-path-learning-observations.jsonl");

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function lower(value = "") {
  return String(value || "").trim().toLowerCase();
}

function address(value = "") {
  const normalized = lower(value);
  return /^0x[0-9a-f]{40}$/.test(normalized) ? normalized : null;
}

function hash(parts = []) {
  return crypto.createHash("sha256").update(parts.map((part) => String(part ?? "")).join("|")).digest("hex").slice(0, 32);
}

function toIso(value) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function readRows(options = {}) {
  ensureDir();
  if (!fs.existsSync(FILE)) return [];
  const limit = Math.max(1, Number(options.limit || process.env.IGNITION_CAPITAL_PATH_HISTORY_LIMIT || 10_000));
  return fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean).slice(-limit).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function existingIds() {
  return new Set(readRows({ limit: 20_000 }).map((row) => row.recordId).filter(Boolean));
}

function appendRows(rows = []) {
  ensureDir();
  const ids = existingIds();
  const saved = [];
  for (const row of rows) {
    if (!row?.recordId || ids.has(row.recordId)) continue;
    ids.add(row.recordId);
    saved.push(row);
  }
  if (saved.length) fs.appendFileSync(FILE, saved.map((row) => JSON.stringify(row)).join("\n") + "\n");
  return { file: FILE, attempted: rows.length, saved: saved.length, records: saved };
}

export function appendCapitalPathFeatureSnapshots(radar = {}, options = {}) {
  const features = extractUnassignedCapitalPathFeatures(radar, options);
  const records = features.map((feature) => ({
    recordType: "PATH_FEATURE",
    recordId: `feature:${feature.snapshotId}`,
    snapshotId: feature.snapshotId,
    observedAt: feature.featureObservedAt,
    chain: feature.chain,
    walletAddress: feature.walletAddress,
    feature,
    shadowOnly: true,
  }));
  return appendRows(records);
}

export function observedTargetBuyEvents(projects = []) {
  const events = [];
  for (const [index, project] of (Array.isArray(projects) ? projects : []).entries()) {
    const projectKey = capitalRadarProjectKey(project, index);
    const chain = lower(project.chain || project.canonicalChain || project.network || project.chainId || "unknown");
    const tape = project.ignitionRawSensors?.eventTape?.events || project.lpEventTape?.events || project.eventTape?.events || [];
    for (const event of Array.isArray(tape) ? tape : []) {
      if (event?.eventType !== "SWAP" || event?.side !== "BUY") continue;
      const wallet = address(event.economicActorAddress || event.resolvedEconomicActor || event.actorAddress);
      if (!wallet) continue;
      const confidence = Number(event.actorResolutionConfidencePct ?? event.economicActorConfidencePct ?? (event.economicActorAddress ? 85 : 0));
      if (!Number.isFinite(confidence) || confidence < Number(process.env.IGNITION_CAPITAL_PATH_MIN_ACTOR_CONFIDENCE || 70)) continue;
      const outcomeObservedAt = toIso(event.eventTime || event.blockTime || event.observedAt || project.observedAt);
      if (!outcomeObservedAt) continue;
      events.push({
        chain,
        walletAddress: wallet,
        destinationProjectKey: projectKey,
        outcomeObservedAt,
        txHash: event.txHash || null,
        usdNotional: Number.isFinite(Number(event.usdNotional ?? event.quoteAmountUsd ?? event.amountUsd)) ? Number(event.usdNotional ?? event.quoteAmountUsd ?? event.amountUsd) : null,
        labelSource: "RESOLVED_TARGET_BUY",
        labelConfidencePct: Math.min(99, Math.max(70, confidence)),
      });
    }
  }
  return events.sort((a, b) => Date.parse(a.outcomeObservedAt) - Date.parse(b.outcomeObservedAt));
}

export function resolveCapitalPathOutcomes(projects = [], options = {}) {
  const rows = readRows({ limit: options.limit || 20_000 });
  const featureRows = rows.filter((row) => row.recordType === "PATH_FEATURE" && row.feature?.walletAddress);
  const alreadyResolved = new Set(rows.filter((row) => row.recordType === "PATH_OUTCOME").map((row) => row.snapshotId));
  const maxHorizonMs = Math.max(60_000, Number(options.maxHorizonHours || process.env.IGNITION_CAPITAL_PATH_MAX_HORIZON_HOURS || 168) * 3_600_000);
  const buyEvents = observedTargetBuyEvents(projects);
  const outcomes = [];

  for (const event of buyEvents) {
    const outcomeMs = Date.parse(event.outcomeObservedAt);
    const eligible = featureRows.filter((row) => {
      if (alreadyResolved.has(row.snapshotId)) return false;
      if (row.feature.chain !== event.chain || row.feature.walletAddress !== event.walletAddress) return false;
      const featureMs = Date.parse(row.feature.featureObservedAt || row.observedAt || "");
      return Number.isFinite(featureMs) && featureMs < outcomeMs && outcomeMs - featureMs <= maxHorizonMs;
    }).sort((a, b) => Date.parse(b.feature.featureObservedAt) - Date.parse(a.feature.featureObservedAt));
    const featureRow = eligible[0];
    if (!featureRow) continue;
    const outcome = {
      recordType: "PATH_OUTCOME",
      recordId: `outcome:${hash([featureRow.snapshotId, event.destinationProjectKey, event.outcomeObservedAt, event.txHash || ""])}`,
      snapshotId: featureRow.snapshotId,
      observedAt: event.outcomeObservedAt,
      outcomeObservedAt: event.outcomeObservedAt,
      destinationProjectKey: event.destinationProjectKey,
      chain: event.chain,
      walletAddress: event.walletAddress,
      labelSource: event.labelSource,
      labelConfidencePct: event.labelConfidencePct,
      txHash: event.txHash,
      leakageGuard: "Outcome timestamp must be strictly later than the feature snapshot. Same-observation approvals and target-specific feature fields are never accepted as labels.",
      shadowOnly: true,
    };
    outcomes.push(outcome);
    alreadyResolved.add(featureRow.snapshotId);
  }
  return appendRows(outcomes);
}

export function loadCapitalPathTrainingExamples(options = {}) {
  const rows = readRows(options);
  const features = new Map(rows.filter((row) => row.recordType === "PATH_FEATURE").map((row) => [row.snapshotId, row]));
  const examples = [];
  for (const outcome of rows.filter((row) => row.recordType === "PATH_OUTCOME")) {
    const featureRow = features.get(outcome.snapshotId);
    if (!featureRow?.feature) continue;
    const featureMs = Date.parse(featureRow.feature.featureObservedAt || featureRow.observedAt || "");
    const outcomeMs = Date.parse(outcome.outcomeObservedAt || outcome.observedAt || "");
    if (!Number.isFinite(featureMs) || !Number.isFinite(outcomeMs) || outcomeMs <= featureMs) continue;
    examples.push({
      snapshotId: outcome.snapshotId,
      feature: featureRow.feature,
      destinationProjectKey: outcome.destinationProjectKey,
      outcomeObservedAt: outcome.outcomeObservedAt,
      labelSource: outcome.labelSource,
      labelConfidencePct: outcome.labelConfidencePct,
      episodeKey: `${featureRow.feature.chain}|${featureRow.feature.walletAddress}|${outcome.destinationProjectKey}|${outcome.outcomeObservedAt.slice(0, 10)}`,
    });
  }
  return examples.sort((a, b) => Date.parse(a.outcomeObservedAt) - Date.parse(b.outcomeObservedAt));
}

export function summarizeCapitalPathLearningStore() {
  const rows = readRows({ limit: 50_000 });
  const examples = loadCapitalPathTrainingExamples({ limit: 50_000 });
  return {
    file: FILE,
    featureSnapshots: rows.filter((row) => row.recordType === "PATH_FEATURE").length,
    resolvedOutcomes: rows.filter((row) => row.recordType === "PATH_OUTCOME").length,
    trainingExamples: examples.length,
    uniqueWallets: new Set(examples.map((row) => row.feature.walletAddress)).size,
    uniqueDestinations: new Set(examples.map((row) => row.destinationProjectKey)).size,
    latestOutcomeObservedAt: examples.at(-1)?.outcomeObservedAt || null,
  };
}

export const __capitalPathLearningStoreTestHooks = { appendRows, readRows };
export { FILE as CAPITAL_PATH_LEARNING_FILE };

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizeCapitalPathLearningStore(), null, 2));
}
