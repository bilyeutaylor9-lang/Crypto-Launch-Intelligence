import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { extractCapitalCommitmentFeatures } from "../learning/capitalCommitmentFeatureExtractor.js";
import { observedTargetBuyEvents } from "./capitalPathLearningStore.js";

const DATA_DIR = path.resolve("data");
const FILE = path.join(DATA_DIR, "capital-commitment-episodes.jsonl");
const DEPLOYMENT_TYPES = new Set(["TARGET_BUY", "OUT_OF_UNIVERSE_BUY"]);
const TERMINAL_TYPES = new Set([
  "TARGET_BUY", "OUT_OF_UNIVERSE_BUY", "BRIDGE_OUT", "CEX_DEPOSIT", "LP_ADD",
  "STABLECOIN_TRANSFER_OUT", "NO_DEPLOYMENT_EXPIRED",
]);

function ensureDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }
function hash(parts = []) { return crypto.createHash("sha256").update(parts.map((p) => String(p ?? "")).join("|")).digest("hex").slice(0, 32); }
function lower(value = "") { return String(value || "").trim().toLowerCase(); }
function toIso(value) { const ms = Date.parse(value || ""); return Number.isFinite(ms) ? new Date(ms).toISOString() : null; }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }

function readRows(options = {}) {
  ensureDir();
  if (!fs.existsSync(FILE)) return [];
  const limit = Math.max(1, Number(options.limit || process.env.IGNITION_COMMITMENT_HISTORY_LIMIT || 50_000));
  return fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean).slice(-limit).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function appendRows(rows = []) {
  ensureDir();
  const existing = new Set(readRows({ limit: 100_000 }).map((row) => row.recordId).filter(Boolean));
  const saved = [];
  for (const row of rows) {
    if (!row?.recordId || existing.has(row.recordId)) continue;
    existing.add(row.recordId);
    saved.push(row);
  }
  if (saved.length) fs.appendFileSync(FILE, saved.map((row) => JSON.stringify(row)).join("\n") + "\n");
  return { file: FILE, attempted: rows.length, saved: saved.length, records: saved };
}

export function appendCapitalCommitmentFeatures(radar = {}, options = {}) {
  const features = extractCapitalCommitmentFeatures(radar, options);
  return appendRows(features.map((feature) => ({
    recordType: "COMMITMENT_FEATURE",
    recordId: `feature:${feature.snapshotId}`,
    snapshotId: feature.snapshotId,
    observedAt: feature.featureObservedAt,
    chain: feature.chain,
    walletAddress: feature.walletAddress,
    feature,
    shadowOnly: true,
  })));
}

function targetBuyOutcomeEvents(projects = []) {
  return observedTargetBuyEvents(projects).map((event) => ({
    chain: event.chain,
    walletAddress: event.walletAddress,
    outcomeType: "TARGET_BUY",
    destinationProjectKey: event.destinationProjectKey,
    outcomeObservedAt: event.outcomeObservedAt,
    deployedUsd: finite(event.usdNotional ?? event.amountUsd ?? event.quoteAmountUsd),
    txHash: event.txHash || null,
    confidencePct: event.labelConfidencePct || 70,
    source: "RESOLVED_TARGET_BUY",
  }));
}

function normalizeExplicitOutcome(event = {}) {
  const outcomeType = String(event.outcomeType || event.type || "").toUpperCase();
  if (!TERMINAL_TYPES.has(outcomeType) || outcomeType === "NO_DEPLOYMENT_EXPIRED") return null;
  const walletAddress = lower(event.walletAddress || event.address || event.wallet);
  if (!/^0x[0-9a-f]{40}$/.test(walletAddress)) return null;
  const outcomeObservedAt = toIso(event.outcomeObservedAt || event.observedAt || event.eventTime);
  if (!outcomeObservedAt) return null;
  return {
    chain: lower(event.chain || "unknown"),
    walletAddress,
    outcomeType,
    destinationProjectKey: event.destinationProjectKey || null,
    outcomeObservedAt,
    deployedUsd: finite(event.deployedUsd ?? event.amountUsd ?? event.usdNotional),
    txHash: event.txHash || null,
    confidencePct: Math.max(0, Math.min(100, finite(event.confidencePct) ?? 80)),
    source: event.source || "EXPLICIT_CONFIRMED_OUTCOME",
  };
}

export function resolveCapitalCommitmentOutcomes(projects = [], options = {}) {
  const rows = readRows({ limit: options.limit || 100_000 });
  const featureRows = rows.filter((row) => row.recordType === "COMMITMENT_FEATURE" && row.feature?.walletAddress);
  const resolved = new Set(rows.filter((row) => row.recordType === "COMMITMENT_OUTCOME").map((row) => row.snapshotId));
  const maxHorizonHours = Math.max(1, Number(options.maxHorizonHours || process.env.IGNITION_COMMITMENT_MAX_HORIZON_HOURS || 72));
  const maxHorizonMs = maxHorizonHours * 3_600_000;
  const explicit = (Array.isArray(options.explicitOutcomes) ? options.explicitOutcomes : []).map(normalizeExplicitOutcome).filter(Boolean);
  const events = [...targetBuyOutcomeEvents(projects), ...explicit].sort((a, b) => Date.parse(a.outcomeObservedAt) - Date.parse(b.outcomeObservedAt));
  const outcomes = [];

  for (const event of events) {
    const outcomeMs = Date.parse(event.outcomeObservedAt);
    const eligible = featureRows.filter((row) => {
      if (resolved.has(row.snapshotId)) return false;
      if (lower(row.feature.chain) !== event.chain || lower(row.feature.walletAddress) !== event.walletAddress) return false;
      const featureMs = Date.parse(row.feature.featureObservedAt || row.observedAt || "");
      return Number.isFinite(featureMs) && featureMs < outcomeMs && outcomeMs - featureMs <= maxHorizonMs;
    }).sort((a, b) => Date.parse(b.feature.featureObservedAt) - Date.parse(a.feature.featureObservedAt));
    const featureRow = eligible[0];
    if (!featureRow) continue;
    const capital = finite(featureRow.feature.executionReadyCapitalUsd);
    const deployed = finite(event.deployedUsd);
    const deploymentFraction = DEPLOYMENT_TYPES.has(event.outcomeType) && capital > 0 && deployed !== null
      ? Math.max(0, Math.min(1, deployed / capital))
      : null;
    outcomes.push({
      recordType: "COMMITMENT_OUTCOME",
      recordId: `outcome:${hash([featureRow.snapshotId, event.outcomeType, event.outcomeObservedAt, event.txHash || ""])}`,
      snapshotId: featureRow.snapshotId,
      observedAt: event.outcomeObservedAt,
      outcomeObservedAt: event.outcomeObservedAt,
      outcomeType: event.outcomeType,
      destinationProjectKey: event.destinationProjectKey,
      chain: event.chain,
      walletAddress: event.walletAddress,
      deployedUsd: deployed,
      deploymentFraction,
      source: event.source,
      confidencePct: event.confidencePct,
      shadowOnly: true,
    });
    resolved.add(featureRow.snapshotId);
  }

  if (options.coverageComplete === true) {
    const asOfMs = Date.parse(options.asOf || new Date().toISOString());
    for (const row of featureRows) {
      if (resolved.has(row.snapshotId)) continue;
      const featureMs = Date.parse(row.feature.featureObservedAt || row.observedAt || "");
      if (!Number.isFinite(featureMs) || !Number.isFinite(asOfMs) || asOfMs - featureMs < maxHorizonMs) continue;
      outcomes.push({
        recordType: "COMMITMENT_OUTCOME",
        recordId: `outcome:${hash([row.snapshotId, "NO_DEPLOYMENT_EXPIRED", new Date(featureMs + maxHorizonMs).toISOString()])}`,
        snapshotId: row.snapshotId,
        observedAt: new Date(featureMs + maxHorizonMs).toISOString(),
        outcomeObservedAt: new Date(featureMs + maxHorizonMs).toISOString(),
        outcomeType: "NO_DEPLOYMENT_EXPIRED",
        destinationProjectKey: null,
        chain: row.feature.chain,
        walletAddress: row.feature.walletAddress,
        deployedUsd: 0,
        deploymentFraction: 0,
        source: "COMPLETE_COVERAGE_EXPIRY",
        confidencePct: 90,
        shadowOnly: true,
      });
      resolved.add(row.snapshotId);
    }
  }

  return appendRows(outcomes);
}

export function loadCapitalCommitmentExamples(options = {}) {
  const rows = readRows(options);
  const features = new Map(rows.filter((row) => row.recordType === "COMMITMENT_FEATURE").map((row) => [row.snapshotId, row]));
  return rows.filter((row) => row.recordType === "COMMITMENT_OUTCOME").flatMap((outcome) => {
    const featureRow = features.get(outcome.snapshotId);
    if (!featureRow?.feature) return [];
    const featureMs = Date.parse(featureRow.feature.featureObservedAt || "");
    const outcomeMs = Date.parse(outcome.outcomeObservedAt || "");
    if (!Number.isFinite(featureMs) || !Number.isFinite(outcomeMs) || outcomeMs <= featureMs) return [];
    return [{
      snapshotId: outcome.snapshotId,
      feature: featureRow.feature,
      outcomeType: outcome.outcomeType,
      destinationProjectKey: outcome.destinationProjectKey || null,
      outcomeObservedAt: outcome.outcomeObservedAt,
      timeToOutcomeHours: (outcomeMs - featureMs) / 3_600_000,
      deployedUsd: finite(outcome.deployedUsd),
      deploymentFraction: finite(outcome.deploymentFraction),
      confidencePct: finite(outcome.confidencePct),
      episodeKey: `${featureRow.feature.chain}|${featureRow.feature.walletAddress}|${String(featureRow.feature.featureObservedAt).slice(0, 13)}`,
    }];
  }).sort((a, b) => Date.parse(a.outcomeObservedAt) - Date.parse(b.outcomeObservedAt));
}

export function summarizeCapitalCommitmentStore() {
  const rows = readRows({ limit: 100_000 });
  const examples = loadCapitalCommitmentExamples({ limit: 100_000 });
  return {
    file: FILE,
    featureSnapshots: rows.filter((row) => row.recordType === "COMMITMENT_FEATURE").length,
    resolvedTerminalOutcomes: examples.length,
    deploymentOutcomes: examples.filter((row) => DEPLOYMENT_TYPES.has(row.outcomeType)).length,
    uniqueWallets: new Set(examples.map((row) => row.feature.walletAddress)).size,
    latestOutcomeObservedAt: examples.at(-1)?.outcomeObservedAt || null,
  };
}

export const __capitalCommitmentStoreHooks = { appendRows, readRows, normalizeExplicitOutcome, DEPLOYMENT_TYPES };
export { FILE as CAPITAL_COMMITMENT_EPISODE_FILE };
