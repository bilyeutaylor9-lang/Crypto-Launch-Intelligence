import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { canonicalEdgeIdentity, deduplicateEdgeRecords, edgeAsOfMs, selectMatchedControls } from "./matchedControlSelector.js";

const FILE = path.resolve("data", "edge-production-episodes.jsonl");
const MAX_BYTES = 96 * 1024 * 1024;
const DEFAULT_LIMIT = 100_000;
const MAX_ENTRY_CAPTURE_AGE_MS = 30_000;
export const EDGE_PRODUCTION_HORIZONS = Object.freeze([6, 24, 72, 168]);

function finite(value) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function exactBaseIdentity(row = {}) {
  const identity = canonicalEdgeIdentity(row);
  return identity?.chain === "base" ? identity : null;
}

export function edgeTimestampsValid(row = {}, nowMs) {
  return [row.observedAt, row.scannedAt, row.signalObservedAt, row.frozenAt, row.capturedAt, row.targetAt,
    row.provenance?.sourceTimestamp, row.freezeProvenance?.capturedAt]
    .filter((value) => value !== undefined && value !== null)
    .every((value) => timestamp(value) !== null && timestamp(value) <= nowMs);
}

export function normalizeEdgeEpisode(episode = {}, options = {}) {
  const nowMs = edgeAsOfMs(options);
  const identity = episode && exactBaseIdentity(episode);
  const signal = timestamp(episode?.signalObservedAt || episode?.frozenAt);
  const frozen = timestamp(episode?.frozenAt);
  if (!identity || typeof episode.episodeId !== "string" || !episode.episodeId || signal === null ||
      !edgeTimestampsValid(episode, nowMs) || (frozen !== null && frozen < signal) || finite(episode.signalPriceUsd) <= 0 ||
      finite(episode.signalPriceUsd) === null ||
      (episode.role !== "TREATMENT" && !(typeof episode.role === "string" && episode.role.startsWith("CONTROL_") && episode.parentTreatmentEpisodeId))) return null;
  return { ...episode, ...identity };
}

export function actualEdgeFreezeCaptured(episode = {}) {
  const frozen = timestamp(episode.frozenAt), signal = timestamp(episode.signalObservedAt);
  return Number(episode.schemaVersion) >= 2 && episode.freezeProvenance?.kind === "CAPTURED_AT_FREEZE_V1" &&
    frozen !== null && signal !== null && frozen >= signal && timestamp(episode.freezeProvenance.capturedAt) === frozen;
}

export function prepareEdgeEpisodes(episodes = [], options = {}) {
  const unique = deduplicateEdgeRecords(episodes);
  const valid = unique.rows.filter((episode) => normalizeEdgeEpisode(episode, options));
  const sampleKey = (episode) => `${exactBaseIdentity(episode).identityKey}:${timestamp(episode.signalObservedAt || episode.frozenAt)}:${episode.role}:${episode.parentTreatmentEpisodeId || "ROOT"}`;
  const samples = deduplicateEdgeRecords(valid, sampleKey);
  const conflictedSamples = new Set(samples.conflicts);
  const conflictingIds = [...new Set([...unique.conflicts, ...valid.filter((episode) => conflictedSamples.has(sampleKey(episode))).map((episode) => episode.episodeId)])];
  const normalized = samples.rows.map((episode) => normalizeEdgeEpisode(episode, options));
  return { episodes: normalized, integrity: {
    duplicateEpisodes: unique.duplicates + samples.duplicates, conflictingEpisodeIds: conflictingIds,
    invalidEpisodes: unique.invalid + unique.rows.length - valid.length,
    legacyFreezeTimeUnproven: normalized.filter((episode) => !actualEdgeFreezeCaptured(episode)).length,
  } };
}

export function frozenEdgeCostEvidence(episode = {}, options = {}) {
  const nowMs = edgeAsOfMs(options), identity = exactBaseIdentity(episode);
  const bps = finite(episode.frozenRoundTripExecutionCostBps), proof = episode.executionCostProvenance;
  const unknown = (reason) => ({ costBps: null, reason });
  if (bps === null) return unknown("EXECUTION_COST_UNKNOWN");
  if (bps < 0) return unknown("NEGATIVE_EXECUTION_COST_REJECTED");
  if (!actualEdgeFreezeCaptured(episode)) return unknown("LEGACY_OR_UNPROVEN_ACTUAL_FREEZE_TIME");
  if (!identity?.poolAddress || !proof || proof.kind !== "PAIRED_EXECUTABLE_QUOTES_V1" || proof.schemaVersion !== 1 ||
      proof.identityKey !== identity.identityKey || proof.routeKey !== identity.routeKey ||
      typeof proof.provider !== "string" || !proof.provider.trim() || proof.provider === "UNKNOWN_PROVIDER") return unknown("PAIRED_QUOTE_PROVENANCE_UNPROVEN");
  const quotes = [proof.entryQuote, proof.exitQuote];
  const signal = timestamp(episode.signalObservedAt), frozen = timestamp(episode.frozenAt), observed = timestamp(proof.observedAt);
  if (signal === null || frozen === null || observed === null || observed > signal || observed > frozen || observed > nowMs ||
      !edgeTimestampsValid(episode, nowMs)) return unknown("EXECUTION_COST_NOT_FROZEN_PRE_SIGNAL");
  if (frozen - signal > MAX_ENTRY_CAPTURE_AGE_MS) return unknown("ACTUAL_FREEZE_AFTER_ENTRY_CAPTURE_WINDOW");
  if (quotes.some((quote) => !quote || quote.provider !== proof.provider || quote.routeIdentityVerified !== true ||
      timestamp(quote.capturedAt) === null || timestamp(quote.capturedAt) > observed ||
      signal - timestamp(quote.capturedAt) > MAX_ENTRY_CAPTURE_AGE_MS ||
      finite(quote.requestedNotionalUsd) === null || finite(quote.requestedNotionalUsd) <= 0 ||
      finite(quote.allInCostBps) === null || finite(quote.allInCostBps) < 0 ||
      finite(quote.priceImpactBps) === null ||
      (quote.poolAddress && exactBaseIdentity({ chain: identity.chain, tokenAddress: identity.tokenAddress, poolAddress: quote.poolAddress })?.poolAddress !== identity.poolAddress))) {
    return unknown("INCOMPLETE_PAIRED_QUOTE_PROVENANCE");
  }
  const [entry, exit] = quotes;
  const entryMs = timestamp(entry.capturedAt), exitMs = timestamp(exit.capturedAt);
  const notional = finite(entry.requestedNotionalUsd), exitNotional = finite(exit.requestedNotionalUsd);
  const reference = finite(episode.frozenExecutionReferenceSizeUsd);
  if (observed !== Math.max(entryMs, exitMs) || finite(proof.quoteSkewMs) !== Math.abs(entryMs - exitMs) ||
      Math.abs(notional - exitNotional) > Math.max(0.01, notional * 0.0001) ||
      (reference !== null && Math.abs(reference - notional) > Math.max(0.01, notional * 0.0001)) ||
      finite(entry.outputTokenAmount) === null || finite(entry.outputTokenAmount) <= 0 ||
      Math.abs(bps - finite(entry.allInCostBps) - finite(exit.allInCostBps)) > 0.0011) return unknown("PAIRED_QUOTE_COST_OR_NOTIONAL_MISMATCH");
  return { costBps: bps, referenceSizeUsd: notional, reason: null,
    limitation: "Frozen paired quote costs are entry-time estimates, not realized exit fills, transfer-tax proof, or future liquidity guarantees." };
}

function episodeId(identity = {}, row = {}, role = "TREATMENT", parentTreatmentEpisodeId = null) {
  return crypto
    .createHash("sha256")
    .update([
      "EDGE_PRODUCTION_V1",
      identity.routeKey,
      row.observedAt,
      role,
      parentTreatmentEpisodeId || "ROOT",
      row.signalDefinitionVersion || "UNKNOWN_SIGNAL_VERSION",
    ].join("|"))
    .digest("hex")
    .slice(0, 32);
}

function frozenFeatures(row = {}) {
  return {
    productionScore: finite(row.productionScore),
    riskScore: finite(row.riskScore),
    marketCapUsd: finite(row.marketCapUsd),
    liquidityUsd: finite(row.liquidityUsd),
    volume24hUsd: finite(row.volume24hUsd),
    priceChange24hPct: finite(row.priceChange24hPct),
    ignitionState: row.ignitionState || null,
    capitalArrivalState: row.capitalArrivalState || null,
    oneHourExpectedArrivalToIgnitionRatio: finite(row.oneHourExpectedArrivalToIgnitionRatio),
    sixHourExpectedArrivalToIgnitionRatio: finite(row.sixHourExpectedArrivalToIgnitionRatio),
    twentyFourHourExpectedArrivalToIgnitionRatio: finite(row.twentyFourHourExpectedArrivalToIgnitionRatio),
    supplyVacuumSupported: typeof row.supplyVacuumSupported === "boolean" ? row.supplyVacuumSupported : null,
    vacuumIntegrityState: row.vacuumIntegrityState || null,
    sellerExhaustionScore: finite(row.sellerExhaustionScore),
    buyerReplacementScore: finite(row.buyerReplacementScore),
    marginalSellerInventoryBurnPct: finite(row.marginalSellerInventoryBurnPct),
    liquidityConvexityIndex: finite(row.liquidityConvexityIndex),
    reflexivityMechanismStrengthScore: finite(row.reflexivityMechanismStrengthScore),
    pressureWithoutMovement: typeof row.pressureWithoutMovement === "boolean" ? row.pressureWithoutMovement : null,
    globalMarketRegimeState: row.globalMarketRegimeState || null,
    evidenceCoveragePct: finite(row.evidenceCoveragePct),
  };
}

export function buildFrozenEdgeProductionEpisode(row = {}, options = {}) {
  const nowMs = edgeAsOfMs(options);
  const identity = exactBaseIdentity(row);
  const signalObservedAt = row.observedAt || row.scannedAt || null;
  const signalPriceUsd = finite(row.priceUsd);
  const role = options.role || (row.treatment === true ? "TREATMENT" : "CONTROL_MATCHED");
  const parentTreatmentEpisodeId = options.parentTreatmentEpisodeId || null;
  if (!identity || timestamp(signalObservedAt) === null || !edgeTimestampsValid(row, nowMs) || signalPriceUsd === null || signalPriceUsd <= 0) return null;
  if (typeof role !== "string" || (role !== "TREATMENT" && !role.startsWith("CONTROL_"))) return null;
  if (role.startsWith("CONTROL_") && !parentTreatmentEpisodeId) return null;

  return {
    schemaVersion: 2,
    experimentVersion: "EDGE_PRODUCTION_V1",
    episodeId: episodeId(identity, { ...row, observedAt: signalObservedAt }, role, parentTreatmentEpisodeId),
    role,
    parentTreatmentEpisodeId,
    frozenAt: new Date(nowMs).toISOString(),
    freezeProvenance: { kind: "CAPTURED_AT_FREEZE_V1", capturedAt: new Date(nowMs).toISOString() },
    signalObservedAt,
    signalDefinitionVersion: row.signalDefinitionVersion || null,
    codeCommitSha: row.codeCommitSha || process.env.GITHUB_SHA || null,
    scanRunId: row.scanRunId || null,
    chain: identity.chain,
    tokenAddress: identity.tokenAddress,
    poolAddress: identity.poolAddress,
    identityKey: identity.identityKey,
    routeKey: identity.routeKey,
    identityVerificationStatus: identity.poolAddress
      ? "EXACT_BASE_TOKEN_POOL_FROZEN"
      : "EXACT_BASE_TOKEN_FROZEN_NO_POOL_AVAILABLE",
    symbol: row.symbol || null,
    name: row.name || null,
    signalPriceUsd,
    frozenRoundTripExecutionCostBps: finite(row.roundTripExecutionCostBps),
    executionCostProvenance: row.executionCostProvenance || null,
    frozenExecutionReferenceSizeUsd: finite(row.executionReferenceSizeUsd ?? row.executionCostProvenance?.entryQuote?.requestedNotionalUsd),
    matchDistance: finite(row.matchDistance),
    frozenFeatures: frozenFeatures(row),
    outcomeHorizonsHours: [...EDGE_PRODUCTION_HORIZONS],
    hypothesisChanged: false,
    shadowOnly: true,
    rankingInfluence: false,
    scoringInfluence: false,
    realMoneyOrderCreated: false,
  };
}

function readTail(file = FILE, maxBytes = MAX_BYTES) {
  if (!fs.existsSync(file)) return [];
  const stat = fs.statSync(file);
  const bytes = Math.min(stat.size, Math.max(1024, Number(maxBytes) || MAX_BYTES));
  const start = Math.max(0, stat.size - bytes);
  const buffer = Buffer.alloc(bytes);
  const descriptor = fs.openSync(file, "r");
  try {
    fs.readSync(descriptor, buffer, 0, bytes, start);
  } finally {
    fs.closeSync(descriptor);
  }
  const lines = buffer.toString("utf8").split("\n");
  if (start > 0) lines.shift();
  return lines.filter(Boolean).map((line, index) => {
    let row;
    try { row = JSON.parse(line); } catch { throw new Error(`Malformed edge episode JSONL in bounded read at line ${index + 1}; original bytes preserved.`); }
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`Non-object edge episode JSONL in bounded read at line ${index + 1}; original bytes preserved.`);
    }
    return row;
  });
}

export function loadEdgeProductionEpisodes(options = {}) {
  return readTail(options.file || FILE, options.maxBytes)
    .slice(-Math.max(1, Number(options.limit || DEFAULT_LIMIT)));
}

export function freezeEdgeProductionEpisodes(observations = [], options = {}) {
  const now = edgeAsOfMs(options);
  const rows = deduplicateEdgeRecords(observations, (row) => {
    const identity = row && exactBaseIdentity(row);
    return identity && timestamp(row.observedAt) !== null ? `${identity.identityKey}:${timestamp(row.observedAt)}` : null;
  }).rows
    .filter((row) => exactBaseIdentity(row) && edgeTimestampsValid(row, now) && timestamp(row.observedAt) !== null && finite(row.priceUsd) > 0)
    .sort((left, right) => timestamp(left.observedAt) - timestamp(right.observedAt));
  const existingEpisodes = Array.isArray(options.existingEpisodes)
    ? options.existingEpisodes
    : loadEdgeProductionEpisodes(options);
  const cooldownMs = Math.max(1, Number(options.treatmentCooldownHours || 72)) * 3_600_000;
  const latestTreatmentByIdentity = new Map();
  for (const episode of prepareEdgeEpisodes(existingEpisodes, { now }).episodes.filter((row) => row.role === "TREATMENT")) {
    const prior = latestTreatmentByIdentity.get(episode.identityKey);
    if (!prior || timestamp(episode.signalObservedAt) > timestamp(prior.signalObservedAt)) {
      latestTreatmentByIdentity.set(episode.identityKey, episode);
    }
  }

  const episodes = [];
  for (const treatment of rows.filter((row) => row.treatment === true)) {
    const identity = exactBaseIdentity(treatment);
    const prior = latestTreatmentByIdentity.get(identity.identityKey);
    if (prior && timestamp(treatment.observedAt) - timestamp(prior.signalObservedAt) < cooldownMs) continue;
    const treatmentEpisode = buildFrozenEdgeProductionEpisode(treatment, { role: "TREATMENT", now });
    if (!treatmentEpisode) continue;
    episodes.push(treatmentEpisode);
    latestTreatmentByIdentity.set(identity.identityKey, treatmentEpisode);

    const controls = selectMatchedControls(treatment, rows, {
      ...options,
      now,
      maxControls: Math.max(1, Number(options.maxControls || 3)),
    });
    for (const control of controls) {
      const controlEpisode = buildFrozenEdgeProductionEpisode(control, {
        role: "CONTROL_MATCHED",
        parentTreatmentEpisodeId: treatmentEpisode.episodeId,
        now,
      });
      if (controlEpisode) episodes.push(controlEpisode);
    }
  }
  return episodes;
}

export function appendEdgeProductionEpisodes(episodes = [], options = {}) {
  const file = options.file || FILE;
  if (!Array.isArray(episodes)) throw new Error("New edge episode batch must be an array of valid episode objects.");
  const now = edgeAsOfMs(options);
  if (episodes.some((row) => !normalizeEdgeEpisode(row, { now }))) throw new Error("Invalid identity or future timestamp in new edge episode batch.");
  const maximumBytes = Math.max(1024, Number(options.maxBytes) || MAX_BYTES);
  const existingBytes = fs.existsSync(file) ? fs.statSync(file).size : 0;
  if (existingBytes > maximumBytes) throw new Error("Edge episode store exceeds bounded append verification; original bytes preserved, explicit archival required.");
  const existing = readTail(file, options.maxBytes);
  const incoming = episodes;
  const combined = deduplicateEdgeRecords([...existing, ...incoming]);
  if (combined.conflicts.length) throw new Error(`Conflicting immutable edge episode content: ${combined.conflicts.join(", ")}`);
  const ids = new Set(existing.map((row) => row?.episodeId).filter(Boolean));
  const fresh = combined.rows.filter((row) => !ids.has(row.episodeId));
  // A complete legacy last record may not have a terminating newline.
  const appended = fresh.length ? `${existingBytes ? "\n" : ""}${fresh.map((row) => JSON.stringify(row)).join("\n")}\n` : "";
  if (existingBytes + Buffer.byteLength(appended) > maximumBytes) {
    throw new Error("Edge episode append exceeds store byte budget; original bytes preserved, explicit archival required.");
  }
  if (fresh.length) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, appended);
  }
  return {
    file,
    attempted: Array.isArray(episodes) ? episodes.length : 0,
    saved: fresh.length,
    duplicates: (Array.isArray(episodes) ? episodes.length : 0) - fresh.length,
    episodes: fresh,
    invalid: combined.invalid,
  };
}

export function captureEdgeProductionEpisodes(observations = [], options = {}) {
  const existingEpisodes = Array.isArray(options.existingEpisodes)
    ? options.existingEpisodes
    : loadEdgeProductionEpisodes(options);
  const episodes = freezeEdgeProductionEpisodes(observations, { ...options, existingEpisodes });
  const persisted = options.persist === false
    ? { file: options.file || FILE, attempted: episodes.length, saved: 0, duplicates: 0, episodes: [] }
    : appendEdgeProductionEpisodes(episodes, options);
  return {
    state: episodes.length ? "EDGE_PRODUCTION_EPISODES_FROZEN" : "NO_EXACT_BASE_TREATMENT_EPISODES",
    treatments: episodes.filter((row) => row.role === "TREATMENT").length,
    controls: episodes.filter((row) => row.role.startsWith("CONTROL_")).length,
    ...persisted,
    frozenEpisodes: episodes,
    hypothesisChanged: false,
    rankingInfluence: false,
  };
}

export const EDGE_PRODUCTION_EPISODE_FILE = FILE;
export const __edgeProductionEpisodeHooks = {
  finite,
  timestamp,
  exactBaseIdentity,
  episodeId,
  frozenFeatures,
  readTail,
};
