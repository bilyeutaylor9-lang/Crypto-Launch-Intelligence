import fs from "node:fs";
import path from "node:path";

import {
  getPairByAddress,
  getTokenPairs,
} from "../data/dexScreenerConnector.js";
import { loadEdgeProductionEpisodes } from "./edgeProductionEpisodeStore.js";
import {
  FAST_OUTCOME_CLOCK_MINUTES,
  fastOutcomeTargetAt,
} from "./fastOutcomeClockPolicy.js";
import {
  appendFastEdgeOutcomes,
  loadFastEdgeOutcomes,
} from "./fastEdgeEvidenceStore.js";
import { __edgeEvidenceProbeHooks } from "./edgeEvidenceProbe.js";

const REPORT_FILE = path.resolve("reports", "edge-fast-evidence-probe.json");

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

export function fastToleranceMinutes(horizonMinutes) {
  const minutes = Number(horizonMinutes);
  if (minutes <= 30) return 4;
  if (minutes <= 60) return 7;
  if (minutes <= 180) return 12;
  return 20;
}

function fastObservationId(episodeId, horizonMinutes) {
  return `fast:${episodeId}:${Number(horizonMinutes)}m`;
}

export function selectDueFastEdgeEvidence(episodes = [], outcomes = [], options = {}) {
  const now = new Date(options.now || Date.now()).toISOString();
  const nowMs = timestamp(now);
  const resolved = new Set(
    (Array.isArray(outcomes) ? outcomes : [])
      .map((row) => row.observationId)
      .filter(Boolean)
  );
  const groups = new Map();

  for (const episode of Array.isArray(episodes) ? episodes : []) {
    if (!episode?.episodeId || finite(episode.signalPriceUsd) <= 0) continue;
    if (episode.chain !== "base" || !episode.tokenAddress) continue;

    const signalAt = episode.signalObservedAt || episode.frozenAt;
    const signalMs = timestamp(signalAt);
    if (signalMs === null || nowMs === null) continue;

    for (const horizonMinutes of FAST_OUTCOME_CLOCK_MINUTES) {
      const observationId = fastObservationId(episode.episodeId, horizonMinutes);
      if (resolved.has(observationId)) continue;

      const targetAt = fastOutcomeTargetAt(signalAt, horizonMinutes);
      const targetMs = timestamp(targetAt);
      const toleranceMinutes = fastToleranceMinutes(horizonMinutes);
      const maximumMs = targetMs + toleranceMinutes * 60_000;

      if (nowMs < targetMs || nowMs > maximumMs) continue;

      const routeKey =
        episode.routeKey ||
        `${episode.chain}:${episode.tokenAddress}:${episode.poolAddress || "TOKEN_SCOPED"}`;
      const group = groups.get(routeKey) || {
        chain: episode.chain,
        tokenAddress: episode.tokenAddress,
        poolAddress: episode.poolAddress || null,
        routeKey,
        dueEpisodes: [],
      };

      group.dueEpisodes.push({
        observationId,
        episodeId: episode.episodeId,
        role: episode.role,
        parentTreatmentEpisodeId: episode.parentTreatmentEpisodeId || null,
        signalObservedAt: signalAt,
        signalPriceUsd: finite(episode.signalPriceUsd),
        horizonMinutes,
        targetAt,
        toleranceMinutes,
      });
      groups.set(routeKey, group);
    }
  }

  return [...groups.values()].sort(
    (a, b) =>
      b.dueEpisodes.length - a.dueEpisodes.length ||
      a.routeKey.localeCompare(b.routeKey)
  );
}

async function observeCandidate(candidate, providers, options = {}) {
  try {
    const payload = candidate.poolAddress
      ? await providers.getPairByAddress(candidate.chain, candidate.poolAddress)
      : await providers.getTokenPairs(candidate.chain, candidate.tokenAddress);

    const pairs = Array.isArray(payload) ? payload : payload?.pairs || [];
    const pair = __edgeEvidenceProbeHooks.exactPair(candidate, pairs);
    if (!pair) {
      return { candidate, status: "NO_EXACT_PROVIDER_MATCH", outcomes: [] };
    }

    const observedAt = new Date(options.now || Date.now()).toISOString();
    const observedMs = timestamp(observedAt);
    const outcomes = candidate.dueEpisodes.flatMap((due) => {
      const targetMs = timestamp(due.targetAt);
      const latenessMinutes = (observedMs - targetMs) / 60_000;
      if (
        !Number.isFinite(latenessMinutes) ||
        latenessMinutes < 0 ||
        latenessMinutes > due.toleranceMinutes
      ) {
        return [];
      }

      return [{
        schemaVersion: 1,
        observationId: due.observationId,
        episodeId: due.episodeId,
        role: due.role,
        parentTreatmentEpisodeId: due.parentTreatmentEpisodeId,
        chain: candidate.chain,
        tokenAddress: candidate.tokenAddress,
        poolAddress: candidate.poolAddress || pair.poolAddress || pair.pairAddress || null,
        routeKey: candidate.routeKey,
        signalObservedAt: due.signalObservedAt,
        signalPriceUsd: due.signalPriceUsd,
        horizonMinutes: due.horizonMinutes,
        targetAt: due.targetAt,
        observedAt,
        latenessMinutes: Number(latenessMinutes.toFixed(4)),
        priceUsd: finite(pair.priceUsd),
        liquidityUsd: finite(pair.liquidityUsd),
        volume24hUsd: finite(pair.volume24hUsd ?? pair.volume24h),
        provenance: {
          source: "dexscreener",
          verificationStatus: candidate.poolAddress
            ? "EXACT_BASE_TOKEN_POOL_MATCH"
            : "EXACT_BASE_TOKEN_MATCH_POOL_CAPTURED",
          confidence: 1,
        },
        fastResearchOnly: true,
        scoringOrSelectionAllowed: false,
        automaticTrading: false,
      }];
    });

    return {
      candidate,
      status: outcomes.length ? "OBSERVED" : "MISSED_TIGHT_TIME_WINDOW",
      outcomes,
    };
  } catch (error) {
    return {
      candidate,
      status: "PROVIDER_FAILURE",
      error: error?.message || "Unknown provider failure",
      outcomes: [],
    };
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, Number(concurrency) || 1), items.length) },
      run
    )
  );
  return results;
}

export async function runFastEdgeEvidenceProbe(options = {}) {
  const now = new Date(options.now || Date.now()).toISOString();
  const episodes =
    options.episodes || loadEdgeProductionEpisodes(options.episodeStore || {});
  const existing =
    options.outcomes || loadFastEdgeOutcomes(options.fastOutcomeStore || {});
  const due = selectDueFastEdgeEvidence(episodes, existing, { now });

  const maxRequests = Math.max(
    1,
    Number(options.maxRequests || process.env.EDGE_FAST_EVIDENCE_MAX_REQUESTS || 30)
  );
  const selected = due.slice(0, maxRequests);
  const providers = {
    getPairByAddress: options.providers?.getPairByAddress || getPairByAddress,
    getTokenPairs: options.providers?.getTokenPairs || getTokenPairs,
  };
  const results = await mapWithConcurrency(
    selected,
    options.concurrency || process.env.EDGE_FAST_EVIDENCE_CONCURRENCY || 4,
    (candidate) => observeCandidate(candidate, providers, { now })
  );
  const observed = results.flatMap((row) => row.outcomes || []);
  const saved = observed.length
    ? (options.saveOutcomes || appendFastEdgeOutcomes)(
        observed,
        options.fastOutcomeStore || {}
      )
    : { saved: 0 };

  const report = {
    schemaVersion: 1,
    generatedAt: now,
    state: !due.length
      ? "NO_FAST_EDGE_OUTCOMES_DUE"
      : observed.length
        ? "FAST_EDGE_EVIDENCE_OBSERVED"
        : "FAST_EDGE_EVIDENCE_UNRESOLVED",
    dueRoutes: due.length,
    selectedRoutes: selected.length,
    observationsSaved: Number(saved.saved || 0),
    horizonsMinutes: [...FAST_OUTCOME_CLOCK_MINUTES],
    outcomesByHorizon: Object.fromEntries(
      FAST_OUTCOME_CLOCK_MINUTES.map((minutes) => [
        `${minutes}m`,
        observed.filter((row) => row.horizonMinutes === minutes).length,
      ])
    ),
    results: results.map((row) => ({
      routeKey: row.candidate.routeKey,
      status: row.status,
      dueEpisodes: row.candidate.dueEpisodes.length,
      error: row.error || null,
    })),
    policy: {
      tightTimeWindowRequired: true,
      lateCurrentQuoteBackfillAllowed: false,
      exactIdentityRequired: true,
      fastResearchOnly: true,
      scoringOrSelectionAllowed: false,
      automaticTrading: false,
    },
  };

  if (options.writeReport !== false) {
    const file = path.resolve(options.reportFile || REPORT_FILE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFastEdgeEvidenceProbe()
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

export const __fastEdgeEvidenceProbeHooks = {
  finite,
  timestamp,
  fastObservationId,
  observeCandidate,
  mapWithConcurrency,
};
