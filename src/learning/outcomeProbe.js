import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  getPairByAddress,
  getTokenPairs,
  normalizeDexPair,
} from "../data/dexScreenerConnector.js";
import {
  getGeckoPoolByAddress,
  normalizeGeckoPool,
  resolveGeckoTerminalNetworkId,
} from "../data/geckoTerminalConnector.js";
import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";
import {
  getOutcomeIdentityKey,
  outcomeHorizonToleranceHours,
} from "./outcomeCalibrationEngine.js";
import { loadOutcomeSnapshots, saveOutcomeSnapshots } from "./outcomeSnapshotStore.js";
import { loadScanMemory } from "./scanMemoryStore.js";

const DEFAULT_HORIZONS = [1, 24, 168, 720];
const DEFAULT_MAX_REQUESTS = 60;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 8_000;
const REPORT_FILE = path.resolve("reports/outcome-probe.json");

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function timestampOf(item = {}) {
  return new Date(item.timestamp || item.scannedAt || 0).getTime();
}

function parseHorizons(value = DEFAULT_HORIZONS) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(values.map(Number).filter((horizon) => horizon > 0))];
}

function identityFrom(record = {}, fallback = {}) {
  const key = getOutcomeIdentityKey(record) || getOutcomeIdentityKey(fallback);
  const separator = key.indexOf(":");
  const chain = normalizeChainId(record.chain || fallback.chain || key.slice(0, separator));
  const keyAddress = separator > 0 ? key.slice(separator + 1) : "";
  const tokenAddress = normalizeTokenAddress(
    record.tokenAddress || record.contractAddress || fallback.tokenAddress || keyAddress,
    chain
  );
  const poolAddress = normalizePoolAddress(
    record.poolAddress || record.pairAddress || fallback.poolAddress,
    chain
  );

  if (!key || !chain || !tokenAddress) return null;
  return { key, chain, tokenAddress, poolAddress };
}

function alreadyResolved(snapshots = [], targetMs = 0, toleranceMs = 0) {
  return snapshots.some((snapshot) => {
    const observedAt = timestampOf(snapshot);
    const verificationStatus = snapshot.provenance?.verificationStatus;
    return observedAt >= targetMs &&
      observedAt <= targetMs + toleranceMs &&
      [
        "EXACT_CHAIN_TOKEN_MATCH",
        "EXACT_CHAIN_TOKEN_POOL_MATCH",
      ].includes(verificationStatus);
  });
}

export function selectOutcomeProbeCandidates(memory = [], snapshots = [], options = {}) {
  const now = new Date(options.now || Date.now());
  const nowMs = now.getTime();
  const horizons = parseHorizons(
    options.horizons || process.env.OUTCOME_PROBE_HORIZONS || DEFAULT_HORIZONS
  );
  const maxCandidates = Number(
    options.maxCandidates || process.env.OUTCOME_PROBE_MAX_CANDIDATES || DEFAULT_MAX_REQUESTS
  );
  const snapshotsByKey = new Map();
  const latestSnapshotByKey = new Map();

  for (const snapshot of snapshots) {
    const key = getOutcomeIdentityKey(snapshot);
    if (!key) continue;
    snapshotsByKey.set(key, [...(snapshotsByKey.get(key) || []), snapshot]);
    const latest = latestSnapshotByKey.get(key);
    if (!latest || timestampOf(snapshot) > timestampOf(latest)) {
      latestSnapshotByKey.set(key, snapshot);
    }
  }

  const dueByKey = new Map();

  for (const record of memory) {
    const scannedAtMs = timestampOf(record);
    const key = getOutcomeIdentityKey(record);
    if (!scannedAtMs || !key) continue;
    const identity = identityFrom(record, latestSnapshotByKey.get(key));
    if (!identity) continue;

    for (const horizonHours of horizons) {
      const targetMs = scannedAtMs + horizonHours * 60 * 60 * 1000;
      const toleranceHours = outcomeHorizonToleranceHours(horizonHours, options);
      const toleranceMs = toleranceHours * 60 * 60 * 1000;
      if (nowMs < targetMs || nowMs > targetMs + toleranceMs) continue;
      if (alreadyResolved(snapshotsByKey.get(key) || [], targetMs, toleranceMs)) continue;

      const dueKey = `${record.scannedAt || scannedAtMs}:${horizonHours}`;
      const current = dueByKey.get(key) || {
        ...identity,
        name: record.name || latestSnapshotByKey.get(key)?.name || "Unknown",
        symbol: record.symbol || latestSnapshotByKey.get(key)?.symbol || "Unknown",
        opportunityScore: num(record.scores?.opportunity || record.scores?.pipeline),
        duePredictions: [],
      };

      if (!current.duePredictions.some((prediction) => prediction.dueKey === dueKey)) {
        current.duePredictions.push({
          dueKey,
          horizonHours,
          predictionAt: record.scannedAt || new Date(scannedAtMs).toISOString(),
          targetAt: new Date(targetMs).toISOString(),
          maximumLatenessHours: toleranceHours,
        });
      }
      current.opportunityScore = Math.max(current.opportunityScore, num(record.scores?.opportunity));
      dueByKey.set(key, current);
    }
  }

  return [...dueByKey.values()]
    .sort(
      (a, b) =>
        b.duePredictions.length - a.duePredictions.length ||
        b.opportunityScore - a.opportunityScore ||
        a.key.localeCompare(b.key)
    )
    .slice(0, maxCandidates);
}

function rawPairs(payload) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.pairs) ? payload.pairs : [];
}

function geckoPairs(payload = {}) {
  return payload?.data ? [normalizeGeckoPool(payload.data)] : [];
}

function normalizedPair(pair = {}) {
  if (pair.chain && pair.tokenAddress) return pair;
  return normalizeDexPair(pair);
}

function exactPair(candidate = {}, pairs = []) {
  return pairs
    .map(normalizedPair)
    .filter((pair) => {
      const chain = normalizeChainId(pair.chain);
      const tokenAddress = normalizeTokenAddress(pair.tokenAddress, chain);
      const poolAddress = normalizePoolAddress(pair.poolAddress || pair.pairAddress, chain);
      return (
        chain === candidate.chain &&
        tokenAddress === candidate.tokenAddress &&
        (!candidate.poolAddress || poolAddress === candidate.poolAddress) &&
        num(pair.priceUsd) > 0
      );
    })
    .sort((a, b) => num(b.liquidityUsd) - num(a.liquidityUsd))[0] || null;
}

async function probeCandidate(candidate = {}, providers = {}, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (!options.consumeProviderRequest()) {
      return { candidate, status: "PROVIDER_REQUEST_BUDGET_EXHAUSTED", observation: null };
    }
    const dexPayload = candidate.poolAddress
      ? await providers.getPairByAddress(candidate.chain, candidate.poolAddress, {
          signal: controller.signal,
        })
      : await providers.getTokenPairs(candidate.chain, candidate.tokenAddress, {
          signal: controller.signal,
        });
    let pair = exactPair(candidate, rawPairs(dexPayload));
    let source = "dexscreener";

    if (
      !pair &&
      candidate.poolAddress &&
      providers.getGeckoPoolByAddress &&
      resolveGeckoTerminalNetworkId(candidate.chain) &&
      options.consumeProviderRequest()
    ) {
      const geckoPayload = await providers.getGeckoPoolByAddress(
        candidate.chain,
        candidate.poolAddress,
        { maxAttempts: 1, timeoutMs }
      );
      pair = exactPair(candidate, geckoPairs(geckoPayload));
      source = "geckoterminal";
    }

    if (!pair) {
      return { candidate, status: "NO_EXACT_PROVIDER_MATCH", observation: null };
    }

    const observedAt = new Date(options.now || Date.now()).toISOString();
    return {
      candidate,
      status: "OBSERVED",
      observation: {
        ...pair,
        name: pair.name || candidate.name,
        symbol: pair.symbol || candidate.symbol,
        chain: candidate.chain,
        tokenAddress: candidate.tokenAddress,
        poolAddress: candidate.poolAddress || pair.poolAddress || pair.pairAddress || null,
        outcomeObservationProvenance: {
          source,
          sourceTimestamp: observedAt,
          confidence: 1,
          verificationStatus: candidate.poolAddress
            ? "EXACT_CHAIN_TOKEN_POOL_MATCH"
            : "EXACT_CHAIN_TOKEN_MATCH",
          recoveryRun: options.runId,
        },
      },
    };
  } catch (error) {
    return {
      candidate,
      status: error?.name === "AbortError" ? "PROVIDER_TIMEOUT" : "PROVIDER_FAILURE",
      error: error?.message || "Unknown provider failure",
      observation: null,
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

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, runWorker)
  );
  return results;
}

function paceProvider(provider, minimumIntervalMs = 0) {
  if (!provider || minimumIntervalMs <= 0) return provider;
  let tail = Promise.resolve();
  let lastStartedAt = 0;
  return (...args) => {
    const request = tail.then(async () => {
      const waitMs = Math.max(0, lastStartedAt + minimumIntervalMs - Date.now());
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
      lastStartedAt = Date.now();
      return provider(...args);
    });
    tail = request.catch(() => {});
    return request;
  };
}

function saveReport(report = {}, file = REPORT_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
}

export async function runOutcomeProbe(options = {}) {
  const runId = options.runId || `outcome-probe-${Date.now()}`;
  const now = new Date(options.now || Date.now()).toISOString();
  const memory = options.memory || loadScanMemory();
  const snapshots = options.snapshots || loadOutcomeSnapshots();
  const maxRequests = Number(
    options.maxRequests || process.env.OUTCOME_PROBE_MAX_REQUESTS || DEFAULT_MAX_REQUESTS
  );
  const concurrency = Number(
    options.concurrency || process.env.OUTCOME_PROBE_CONCURRENCY || DEFAULT_CONCURRENCY
  );
  const candidates = selectOutcomeProbeCandidates(memory, snapshots, {
    ...options,
    now,
  });
  const selected = candidates.slice(0, maxRequests);
  const geckoProvider = options.providers
    ? options.providers.getGeckoPoolByAddress || null
    : getGeckoPoolByAddress;
  const geckoMinimumIntervalMs = Math.max(0, Number(
    options.geckoMinimumIntervalMs ??
    process.env.OUTCOME_PROBE_GECKO_MINIMUM_INTERVAL_MS ??
    6_100
  ));
  const providers = {
    getPairByAddress: options.providers?.getPairByAddress || getPairByAddress,
    getTokenPairs: options.providers?.getTokenPairs || getTokenPairs,
    getGeckoPoolByAddress: paceProvider(geckoProvider, geckoMinimumIntervalMs),
  };
  let providerRequestsUsed = 0;
  const consumeProviderRequest = () => {
    if (providerRequestsUsed >= maxRequests) return false;
    providerRequestsUsed += 1;
    return true;
  };
  const results = await mapWithConcurrency(selected, concurrency, (candidate) =>
    probeCandidate(candidate, providers, {
      ...options,
      now,
      runId,
      consumeProviderRequest,
    })
  );
  const observations = results.map((result) => result.observation).filter(Boolean);
  const saveResult = observations.length
    ? (options.saveSnapshots || saveOutcomeSnapshots)(observations)
    : { saved: 0 };
  const report = {
    generatedAt: now,
    runId,
    status: !candidates.length
      ? "NO_OUTCOMES_DUE"
      : observations.length
        ? observations.length === candidates.length
          ? "PASS"
          : "PARTIAL"
        : "PROVIDER_DEGRADED",
    scoringOrSelectionAllowed: false,
    identityPolicy: "EXACT_CHAIN_TOKEN_WITH_OPTIONAL_EXACT_POOL",
    dueCandidates: candidates.length,
    duePredictions: candidates.reduce(
      (sum, candidate) => sum + candidate.duePredictions.length,
      0
    ),
    providerRequestsUsed,
    providerRequestBudget: maxRequests,
    observationsSaved: num(saveResult.saved),
    unresolvedCandidates: Math.max(0, candidates.length - observations.length),
    outcomesByHorizon: Object.fromEntries(
      parseHorizons(options.horizons || process.env.OUTCOME_PROBE_HORIZONS || DEFAULT_HORIZONS).map(
        (horizon) => [
          `${horizon}h`,
          candidates.reduce(
            (sum, candidate) =>
              sum + candidate.duePredictions.filter((item) => item.horizonHours === horizon).length,
            0
          ),
        ]
      )
    ),
    results: results.map((result) => ({
      key: result.candidate.key,
      status: result.status,
      duePredictions: result.candidate.duePredictions.length,
      error: result.error || null,
    })),
  };

  if (options.writeReport !== false) saveReport(report, options.reportFile || REPORT_FILE);
  return report;
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const report = await runOutcomeProbe();
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "PROVIDER_DEGRADED") process.exitCode = 1;
}
