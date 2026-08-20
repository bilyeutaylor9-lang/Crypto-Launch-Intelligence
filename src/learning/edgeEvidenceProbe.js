import fs from "node:fs";
import path from "node:path";

import {
  getPairByAddress,
  getTokenPairs,
  normalizeDexPair,
} from "../data/dexScreenerConnector.js";
import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";
import {
  EDGE_PRODUCTION_HORIZONS,
  loadEdgeProductionEpisodes,
} from "./edgeProductionEpisodeStore.js";
import {
  appendEdgeEvidenceOutcomes,
  loadEdgeEvidenceOutcomes,
} from "./edgeEvidenceOutcomeStore.js";

const REPORT_FILE = path.resolve("reports", "edge-evidence-probe.json");
const DEFAULT_MAX_REQUESTS = 60;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 8_000;

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

export function edgeEvidenceToleranceHours(horizonHours) {
  return Math.max(1, Math.min(24, Number(horizonHours) * 0.35));
}

function exactEpisodeIdentity(episode = {}) {
  const chain = normalizeChainId(episode.chain);
  const tokenAddress = normalizeTokenAddress(episode.tokenAddress, chain);
  const rawPool = episode.poolAddress || null;
  const poolAddress = rawPool ? normalizePoolAddress(rawPool, chain) : null;
  if (chain !== "base" || !tokenAddress || (rawPool && !poolAddress)) return null;
  return {
    chain,
    tokenAddress,
    poolAddress,
    routeKey: `${chain}:${tokenAddress}:${poolAddress || "TOKEN_SCOPED"}`,
  };
}

function observationId(episodeId, horizonHours) {
  return `${episodeId}:${Number(horizonHours)}h`;
}

export function selectDueEdgeEvidence(episodes = [], outcomes = [], options = {}) {
  const nowMs = timestamp(options.now || new Date().toISOString());
  const resolved = new Set(
    (Array.isArray(outcomes) ? outcomes : []).map((row) => row.observationId).filter(Boolean)
  );
  const routeGroups = new Map();

  for (const episode of Array.isArray(episodes) ? episodes : []) {
    const identity = exactEpisodeIdentity(episode);
    const signalMs = timestamp(episode.signalObservedAt || episode.frozenAt);
    if (!episode.episodeId || !identity || !signalMs || !nowMs || finite(episode.signalPriceUsd) <= 0) continue;
    const horizons = (episode.outcomeHorizonsHours || EDGE_PRODUCTION_HORIZONS)
      .map(Number)
      .filter((hours) => EDGE_PRODUCTION_HORIZONS.includes(hours));
    for (const horizonHours of horizons) {
      const id = observationId(episode.episodeId, horizonHours);
      if (resolved.has(id)) continue;
      const targetMs = signalMs + horizonHours * 3_600_000;
      const toleranceHours = edgeEvidenceToleranceHours(horizonHours);
      const maximumMs = targetMs + toleranceHours * 3_600_000;
      if (nowMs < targetMs || nowMs > maximumMs) continue;
      const group = routeGroups.get(identity.routeKey) || {
        ...identity,
        routeKey: identity.routeKey,
        dueEpisodes: [],
      };
      group.dueEpisodes.push({
        episodeId: episode.episodeId,
        role: episode.role,
        parentTreatmentEpisodeId: episode.parentTreatmentEpisodeId || null,
        signalObservedAt: episode.signalObservedAt || episode.frozenAt,
        signalPriceUsd: finite(episode.signalPriceUsd),
        horizonHours,
        targetAt: new Date(targetMs).toISOString(),
        maximumLatenessHours: toleranceHours,
        observationId: id,
      });
      routeGroups.set(identity.routeKey, group);
    }
  }

  return [...routeGroups.values()].sort((left, right) =>
    right.dueEpisodes.length - left.dueEpisodes.length || left.routeKey.localeCompare(right.routeKey)
  );
}

function rawPairs(payload) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.pairs) ? payload.pairs : [];
}

function normalizedPair(pair = {}) {
  return pair.chain && pair.tokenAddress ? pair : normalizeDexPair(pair);
}

function exactPair(candidate = {}, pairs = []) {
  return pairs
    .map(normalizedPair)
    .filter((pair) => {
      const chain = normalizeChainId(pair.chain);
      const tokenAddress = normalizeTokenAddress(pair.tokenAddress, chain);
      const poolAddress = normalizePoolAddress(pair.poolAddress || pair.pairAddress, chain);
      return chain === candidate.chain &&
        tokenAddress === candidate.tokenAddress &&
        (!candidate.poolAddress || poolAddress === candidate.poolAddress) &&
        finite(pair.priceUsd) > 0;
    })
    .sort((left, right) => (finite(right.liquidityUsd) || 0) - (finite(left.liquidityUsd) || 0))[0] || null;
}

async function probeRoute(candidate = {}, providers = {}, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Math.max(250, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const payload = candidate.poolAddress
      ? await providers.getPairByAddress(candidate.chain, candidate.poolAddress, { signal: controller.signal })
      : await providers.getTokenPairs(candidate.chain, candidate.tokenAddress, { signal: controller.signal });
    const pair = exactPair(candidate, rawPairs(payload));
    if (!pair) return { candidate, status: "NO_EXACT_PROVIDER_MATCH", outcomes: [] };
    const observedAt = new Date(options.now || Date.now()).toISOString();
    const matchedPool = normalizePoolAddress(pair.poolAddress || pair.pairAddress, candidate.chain);
    const outcomes = candidate.dueEpisodes.map((due) => ({
      schemaVersion: 1,
      observationId: due.observationId,
      episodeId: due.episodeId,
      role: due.role,
      parentTreatmentEpisodeId: due.parentTreatmentEpisodeId,
      chain: candidate.chain,
      tokenAddress: candidate.tokenAddress,
      poolAddress: candidate.poolAddress || matchedPool,
      routeKey: candidate.routeKey,
      signalObservedAt: due.signalObservedAt,
      signalPriceUsd: due.signalPriceUsd,
      horizonHours: due.horizonHours,
      targetAt: due.targetAt,
      observedAt,
      latenessHours: Number(((timestamp(observedAt) - timestamp(due.targetAt)) / 3_600_000).toFixed(4)),
      priceUsd: finite(pair.priceUsd),
      liquidityUsd: finite(pair.liquidityUsd),
      volume24hUsd: finite(pair.volume24hUsd ?? pair.volume24h),
      provenance: {
        source: "dexscreener",
        sourceTimestamp: observedAt,
        confidence: 1,
        verificationStatus: candidate.poolAddress
          ? "EXACT_BASE_TOKEN_POOL_MATCH"
          : "EXACT_BASE_TOKEN_MATCH_POOL_CAPTURED",
        recoveryRun: options.runId,
      },
      scoringOrSelectionAllowed: false,
    }));
    return { candidate, status: "OBSERVED", outcomes };
  } catch (error) {
    return {
      candidate,
      status: error?.name === "AbortError" ? "PROVIDER_TIMEOUT" : "PROVIDER_FAILURE",
      error: error?.message || "Unknown provider failure",
      outcomes: [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency(items = [], concurrency = 1, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, runWorker));
  return results;
}

function writeReport(report, file = REPORT_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
}

export async function runEdgeEvidenceProbe(options = {}) {
  const now = new Date(options.now || Date.now()).toISOString();
  const runId = options.runId || `edge-evidence-probe-${Date.now()}`;
  const episodes = options.episodes || loadEdgeProductionEpisodes(options.episodeStore || {});
  const existingOutcomes = options.outcomes || loadEdgeEvidenceOutcomes(options.outcomeStore || {});
  const candidates = selectDueEdgeEvidence(episodes, existingOutcomes, { ...options, now });
  const maxRequests = Math.max(1, Number(options.maxRequests || process.env.EDGE_EVIDENCE_MAX_REQUESTS || DEFAULT_MAX_REQUESTS));
  const concurrency = Math.max(1, Number(options.concurrency || process.env.EDGE_EVIDENCE_CONCURRENCY || DEFAULT_CONCURRENCY));
  const selected = candidates.slice(0, maxRequests);
  const providers = {
    getPairByAddress: options.providers?.getPairByAddress || getPairByAddress,
    getTokenPairs: options.providers?.getTokenPairs || getTokenPairs,
  };
  const results = await mapWithConcurrency(selected, concurrency, (candidate) =>
    probeRoute(candidate, providers, { ...options, now, runId })
  );
  const observed = results.flatMap((result) => result.outcomes || []);
  const saved = observed.length
    ? (options.saveOutcomes || appendEdgeEvidenceOutcomes)(observed, options.outcomeStore || {})
    : { saved: 0 };
  const dueEpisodes = candidates.reduce((sum, row) => sum + row.dueEpisodes.length, 0);
  const attemptedEpisodes = selected.reduce((sum, row) => sum + row.dueEpisodes.length, 0);
  const report = {
    schemaVersion: 1,
    generatedAt: now,
    runId,
    state: !candidates.length
      ? "NO_EDGE_EPISODE_OUTCOMES_DUE"
      : observed.length === attemptedEpisodes && candidates.length <= maxRequests
        ? "EDGE_EVIDENCE_PROBE_PASS"
        : observed.length
          ? "EDGE_EVIDENCE_PROBE_PARTIAL"
          : "EDGE_EVIDENCE_PROVIDER_DEGRADED",
    identityPolicy: "EXACT_BASE_TOKEN_AND_FROZEN_POOL_WHEN_AVAILABLE",
    sourceUniverse: "FROZEN_EDGE_PRODUCTION_TREATMENT_AND_CONTROL_EPISODES_ONLY",
    scoringOrSelectionAllowed: false,
    dueRoutes: candidates.length,
    dueEpisodes,
    providerRequestsUsed: selected.length,
    providerRequestBudget: maxRequests,
    observationsAttempted: attemptedEpisodes,
    observationsSaved: Number(saved.saved || 0),
    unresolvedDueRoutes: Math.max(0, candidates.length - results.filter((row) => row.status === "OBSERVED").length),
    outcomesByHorizon: Object.fromEntries(EDGE_PRODUCTION_HORIZONS.map((hours) => [
      `${hours}h`,
      observed.filter((row) => row.horizonHours === hours).length,
    ])),
    results: results.map((row) => ({
      routeKey: row.candidate.routeKey,
      status: row.status,
      dueEpisodes: row.candidate.dueEpisodes.length,
      error: row.error || null,
    })),
  };
  if (options.writeReport !== false) writeReport(report, options.reportFile || REPORT_FILE);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runEdgeEvidenceProbe()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (report.state === "EDGE_EVIDENCE_PROVIDER_DEGRADED") process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

export const EDGE_EVIDENCE_PROBE_REPORT = REPORT_FILE;
export const __edgeEvidenceProbeHooks = {
  finite,
  timestamp,
  exactEpisodeIdentity,
  observationId,
  exactPair,
  probeRoute,
  mapWithConcurrency,
};
