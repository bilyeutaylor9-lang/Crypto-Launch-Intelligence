import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";
import { selectMatchedControls } from "./matchedControlSelector.js";

const FILE = path.resolve("data", "edge-production-episodes.jsonl");
const MAX_BYTES = 96 * 1024 * 1024;
const DEFAULT_LIMIT = 100_000;
export const EDGE_PRODUCTION_HORIZONS = Object.freeze([6, 24, 72, 168]);

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function exactBaseIdentity(row = {}) {
  const chain = normalizeChainId(row.chain || row.network || row.canonicalChain);
  const tokenAddress = normalizeTokenAddress(
    row.tokenAddress || row.contractAddress || row.canonicalAddress,
    chain
  );
  const rawPool = row.poolAddress || row.pairAddress || row.primaryTradablePool || null;
  const poolAddress = rawPool ? normalizePoolAddress(rawPool, chain) : null;
  if (chain !== "base" || !tokenAddress || (rawPool && !poolAddress)) return null;
  return {
    chain,
    tokenAddress,
    poolAddress,
    identityKey: `${chain}:${tokenAddress}`,
    routeKey: `${chain}:${tokenAddress}:${poolAddress || "TOKEN_SCOPED"}`,
  };
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
  const identity = exactBaseIdentity(row);
  const signalObservedAt = row.observedAt || row.scannedAt || null;
  const signalPriceUsd = finite(row.priceUsd);
  const role = options.role || (row.treatment === true ? "TREATMENT" : "CONTROL_MATCHED");
  const parentTreatmentEpisodeId = options.parentTreatmentEpisodeId || null;
  if (!identity || !timestamp(signalObservedAt) || signalPriceUsd === null || signalPriceUsd <= 0) return null;
  if (role !== "TREATMENT" && !role.startsWith("CONTROL_")) return null;
  if (role.startsWith("CONTROL_") && !parentTreatmentEpisodeId) return null;

  return {
    schemaVersion: 1,
    experimentVersion: "EDGE_PRODUCTION_V1",
    episodeId: episodeId(identity, { ...row, observedAt: signalObservedAt }, role, parentTreatmentEpisodeId),
    role,
    parentTreatmentEpisodeId,
    frozenAt: signalObservedAt,
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
  return lines.filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

export function loadEdgeProductionEpisodes(options = {}) {
  return readTail(options.file || FILE, options.maxBytes)
    .slice(-Math.max(1, Number(options.limit || DEFAULT_LIMIT)));
}

export function freezeEdgeProductionEpisodes(observations = [], options = {}) {
  const rows = (Array.isArray(observations) ? observations : [])
    .filter((row) => exactBaseIdentity(row) && timestamp(row.observedAt) && finite(row.priceUsd) > 0)
    .sort((left, right) => timestamp(left.observedAt) - timestamp(right.observedAt));
  const existingEpisodes = Array.isArray(options.existingEpisodes)
    ? options.existingEpisodes
    : loadEdgeProductionEpisodes(options);
  const cooldownMs = Math.max(1, Number(options.treatmentCooldownHours || 72)) * 3_600_000;
  const latestTreatmentByIdentity = new Map();
  for (const episode of existingEpisodes.filter((row) => row.role === "TREATMENT")) {
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
    const treatmentEpisode = buildFrozenEdgeProductionEpisode(treatment, { role: "TREATMENT" });
    if (!treatmentEpisode) continue;
    episodes.push(treatmentEpisode);
    latestTreatmentByIdentity.set(identity.identityKey, treatmentEpisode);

    const controls = selectMatchedControls(treatment, rows, {
      ...options,
      maxControls: Math.max(1, Number(options.maxControls || 3)),
    });
    for (const control of controls) {
      const controlEpisode = buildFrozenEdgeProductionEpisode(control, {
        role: "CONTROL_MATCHED",
        parentTreatmentEpisodeId: treatmentEpisode.episodeId,
      });
      if (controlEpisode) episodes.push(controlEpisode);
    }
  }
  return episodes;
}

export function appendEdgeProductionEpisodes(episodes = [], options = {}) {
  const file = options.file || FILE;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = readTail(file, options.maxBytes);
  const ids = new Set(existing.map((row) => row.episodeId).filter(Boolean));
  const fresh = (Array.isArray(episodes) ? episodes : [])
    .filter((row) => row?.episodeId && !ids.has(row.episodeId));
  if (fresh.length) {
    fs.appendFileSync(file, `${fresh.map((row) => JSON.stringify(row)).join("\n")}\n`);
  }
  if (fs.existsSync(file) && fs.statSync(file).size > Number(options.maxBytes || MAX_BYTES)) {
    const retained = readTail(file, Math.floor(Number(options.maxBytes || MAX_BYTES) * 0.75));
    fs.writeFileSync(file, retained.map((row) => JSON.stringify(row)).join("\n") + (retained.length ? "\n" : ""));
  }
  return {
    file,
    attempted: Array.isArray(episodes) ? episodes.length : 0,
    saved: fresh.length,
    duplicates: (Array.isArray(episodes) ? episodes.length : 0) - fresh.length,
    episodes: fresh,
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
