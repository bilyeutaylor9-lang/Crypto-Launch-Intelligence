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
import {
  appendExactMarketObservations,
  loadExactMarketObservations,
} from "../production/exactMarketObservationLedger.js";
import {
  appendMarketContextObservations,
  buildMarketContextObservation,
  loadMarketContextObservations,
} from "../production/marketContextObservationLedger.js";
import {
  attachMarketContext,
  collectMarketContextSnapshot,
} from "../production/marketContextSnapshotProvider.js";
import { loadProspectiveEdgeCohorts } from "../production/prospectiveEdgeCohortLedger.js";
import { loadProspectiveEntryEdgeEpisodes } from "./prospectiveEntryEdgeEpisodeStore.js";
import { PROSPECTIVE_ENTRY_EDGE_TRIALS } from "./prospectiveEntryEdgeTrialRegistry.js";
import { acquireOutcomeProbeRunLock } from "./outcomeProbeRunLock.js";

const DEFAULT_HORIZONS = [1, 24, 168, 720];
const DEFAULT_MAX_REQUESTS = 60;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 8_000;
const REPORT_FILE = path.resolve("reports/outcome-probe.json");
const PROSPECTIVE_ENTRY_ROLES = new Set(["TREATMENT", "CONTROL_MATCHED"]);
const PROSPECTIVE_ENTRY_TREATMENT_PRIORITY = 140;
const PROSPECTIVE_ENTRY_CONTROL_PRIORITY = 130;

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function timestampOf(item = {}) {
  return new Date(item.observedAt || item.timestamp || item.scannedAt || item.decisionAt || 0).getTime();
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

function alreadyResolved(snapshots = [], targetMs = 0, toleranceMs = 0, expectedIdentity = null) {
  return snapshots.some((snapshot) => {
    const observedAt = timestampOf(snapshot);
    const verificationStatus = snapshot.provenance?.verificationStatus;
    const actualIdentity = identityFrom(snapshot);
    const poolCompatible = !expectedIdentity?.poolAddress ||
      !actualIdentity?.poolAddress ||
      expectedIdentity.poolAddress === actualIdentity.poolAddress;
    return observedAt >= targetMs &&
      observedAt <= targetMs + toleranceMs &&
      poolCompatible &&
      (snapshot.exactIdentityVerified === true || [
        "EXACT_CHAIN_TOKEN_MATCH",
        "EXACT_CHAIN_TOKEN_POOL_MATCH",
      ].includes(verificationStatus));
  });
}

export function prospectiveCohortsToProbeMemory(episodes = []) {
  return (Array.isArray(episodes) ? episodes : []).flatMap((episode) => {
    const key = getOutcomeIdentityKey(episode);
    const scannedAt = episode.decisionAt || episode.frozenAt || null;
    if (!key || !scannedAt || !["TREATMENT", "CONTROL_MATCHED"].includes(episode.role)) return [];
    return [{
      identityKey: key,
      chain: episode.chain,
      tokenAddress: episode.tokenAddress,
      poolAddress: episode.poolAddress || null,
      symbol: episode.symbol || null,
      name: episode.name || null,
      scannedAt,
      outcomeHorizonsHours: Array.isArray(episode.outcomeHorizonsHours)
        ? episode.outcomeHorizonsHours.map(Number).filter((value) => value > 0)
        : [24, 168],
      forwardEvidencePriority: episode.role === "TREATMENT" ? 100 : 90,
      prospectiveEdgeCohortId: episode.cohortId || null,
      prospectiveEdgeEpisodeId: episode.episodeId || null,
      prospectiveEdgeRole: episode.role,
      scores: { opportunity: episode.role === "TREATMENT" ? 100 : 90 },
    }];
  });
}

/**
 * Convert only immutable, post-declaration entry-trial episodes into outcome
 * probe work. These rows are evidence-collection instructions, not inputs to
 * ranking, scoring, promotion, or order creation.
 */
export function prospectiveEntryEpisodesToProbeMemory(episodes = [], options = {}) {
  const trials = Array.isArray(options.trials)
    ? options.trials
    : PROSPECTIVE_ENTRY_EDGE_TRIALS;
  const trialsById = new Map(trials.map((trial) => [trial?.trialId, trial]));

  return (Array.isArray(episodes) ? episodes : []).flatMap((episode) => {
    const trial = trialsById.get(episode?.trialId);
    const chain = normalizeChainId(episode?.chain);
    const tokenAddress = normalizeTokenAddress(episode?.tokenAddress, chain);
    const poolAddress = normalizePoolAddress(episode?.poolAddress, chain);
    const canonicalIdentityKey = chain && tokenAddress ? `${chain}:${tokenAddress}` : null;
    const declaredAtMs = Date.parse(trial?.declaredAt || "");
    const signalObservedAtMs = Date.parse(episode?.signalObservedAt || "");
    const declaredHorizonHours = Number(trial?.horizonHours);
    const frozenHorizonHours = Number(episode?.outcomeHorizonHours);

    if (
      !trial ||
      !PROSPECTIVE_ENTRY_ROLES.has(episode?.role) ||
      episode?.exactIdentityFrozen !== true ||
      episode?.postDeclaration !== true ||
      !episode?.episodeId ||
      !chain ||
      !tokenAddress ||
      !poolAddress ||
      !canonicalIdentityKey ||
      getOutcomeIdentityKey({ identityKey: episode.identityKey }) !== canonicalIdentityKey ||
      Number(episode?.trialSchemaVersion) !== Number(trial.schemaVersion) ||
      episode?.declaredAt !== trial.declaredAt ||
      !Number.isFinite(declaredAtMs) ||
      !Number.isFinite(signalObservedAtMs) ||
      signalObservedAtMs < declaredAtMs ||
      !(declaredHorizonHours > 0) ||
      frozenHorizonHours !== declaredHorizonHours
    ) return [];

    const treatment = episode.role === "TREATMENT";
    return [{
      identityKey: canonicalIdentityKey,
      chain,
      tokenAddress,
      poolAddress,
      symbol: episode.symbol || null,
      name: episode.name || null,
      scannedAt: new Date(signalObservedAtMs).toISOString(),
      outcomeHorizonsHours: [declaredHorizonHours],
      forwardEvidencePriority: treatment
        ? PROSPECTIVE_ENTRY_TREATMENT_PRIORITY
        : PROSPECTIVE_ENTRY_CONTROL_PRIORITY,
      prospectiveEntryEdgeTrialId: trial.trialId,
      prospectiveEntryEdgeEpisodeId: episode.episodeId,
      prospectiveEntryEdgeRole: episode.role,
      prospectiveEntryEdgeDeclaredAt: trial.declaredAt,
      prospectiveEntryEdgeOutcomeHorizonHours: declaredHorizonHours,
      exactIdentityFrozen: true,
      outcomeProbeOnly: true,
      rankingInfluence: false,
      scoringInfluence: false,
      automaticTrading: false,
      automaticPromotion: false,
      realMoneyOrderCreated: false,
      scores: { opportunity: 0 },
    }];
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

    const allowedHorizons = Array.isArray(record.outcomeHorizonsHours) && record.outcomeHorizonsHours.length
      ? new Set(record.outcomeHorizonsHours.map(Number))
      : null;
    for (const horizonHours of horizons.filter((value) => !allowedHorizons || allowedHorizons.has(value))) {
      const targetMs = scannedAtMs + horizonHours * 60 * 60 * 1000;
      const toleranceHours = outcomeHorizonToleranceHours(horizonHours, options);
      const toleranceMs = toleranceHours * 60 * 60 * 1000;
      if (nowMs < targetMs || nowMs > targetMs + toleranceMs) continue;
      if (alreadyResolved(snapshotsByKey.get(key) || [], targetMs, toleranceMs, identity)) continue;

      const dueKey = `${record.scannedAt || scannedAtMs}:${horizonHours}`;
      const routeKey = `${identity.key}:${identity.poolAddress || "TOKEN_SCOPED"}`;
      const current = dueByKey.get(routeKey) || {
        ...identity,
        routeKey,
        name: record.name || latestSnapshotByKey.get(key)?.name || "Unknown",
        symbol: record.symbol || latestSnapshotByKey.get(key)?.symbol || "Unknown",
        opportunityScore: num(record.scores?.opportunity || record.scores?.pipeline),
        forwardEvidencePriority: num(record.forwardEvidencePriority),
        prospectiveEntryEdgeEpisodeIds: [],
        prospectiveEntryEdgeRoles: [],
        duePredictions: [],
      };

      if (!current.duePredictions.some((prediction) => prediction.dueKey === dueKey)) {
        current.duePredictions.push({
          dueKey,
          horizonHours,
          predictionAt: record.scannedAt || new Date(scannedAtMs).toISOString(),
          targetAt: new Date(targetMs).toISOString(),
          maximumLatenessHours: toleranceHours,
          prospectiveEntryEdgeEpisodeId: record.prospectiveEntryEdgeEpisodeId || null,
          prospectiveEntryEdgeRole: record.prospectiveEntryEdgeRole || null,
        });
      }
      if (
        record.prospectiveEntryEdgeEpisodeId &&
        !current.prospectiveEntryEdgeEpisodeIds.includes(record.prospectiveEntryEdgeEpisodeId)
      ) {
        current.prospectiveEntryEdgeEpisodeIds.push(record.prospectiveEntryEdgeEpisodeId);
      }
      if (
        record.prospectiveEntryEdgeRole &&
        !current.prospectiveEntryEdgeRoles.includes(record.prospectiveEntryEdgeRole)
      ) {
        current.prospectiveEntryEdgeRoles.push(record.prospectiveEntryEdgeRole);
      }
      current.opportunityScore = Math.max(current.opportunityScore, num(record.scores?.opportunity));
      current.forwardEvidencePriority = Math.max(
        current.forwardEvidencePriority,
        num(record.forwardEvidencePriority),
      );
      dueByKey.set(routeKey, current);
    }
  }

  return [...dueByKey.values()]
    .sort(
      (a, b) =>
        b.forwardEvidencePriority - a.forwardEvidencePriority ||
        b.duePredictions.length - a.duePredictions.length ||
        b.opportunityScore - a.opportunityScore ||
        a.routeKey.localeCompare(b.routeKey)
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
        observedAt,
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

async function runOutcomeProbeUnlocked(options = {}) {
  const runId = options.runId || `outcome-probe-${Date.now()}`;
  const now = new Date(options.now || Date.now()).toISOString();
  const usingDefaultMemory = options.memory === undefined;
  const scanMemory = usingDefaultMemory
    ? (options.loadScanMemory || loadScanMemory)()
    : (Array.isArray(options.memory) ? options.memory : []);
  const prospectiveEpisodes = options.prospectiveEpisodes !== undefined
    ? options.prospectiveEpisodes
    : usingDefaultMemory
      ? (options.loadProspectiveEdgeCohorts || loadProspectiveEdgeCohorts)()
      : [];
  const prospectiveEntryEpisodes = options.prospectiveEntryEpisodes !== undefined
    ? options.prospectiveEntryEpisodes
    : usingDefaultMemory
      ? (options.loadProspectiveEntryEdgeEpisodes || loadProspectiveEntryEdgeEpisodes)(
          options.prospectiveEntryEpisodeStore || {}
        )
      : [];
  const prospectiveMemory = prospectiveCohortsToProbeMemory(prospectiveEpisodes);
  const prospectiveEntryMemory = prospectiveEntryEpisodesToProbeMemory(
    prospectiveEntryEpisodes,
    { trials: options.prospectiveEntryTrials }
  );
  const memory = [...scanMemory, ...prospectiveMemory, ...prospectiveEntryMemory];
  const existingExactObservations = options.exactObservations || loadExactMarketObservations();
  const snapshots = options.snapshots || [
    ...loadOutcomeSnapshots(),
    ...existingExactObservations,
  ];
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
  let observations = results.map((result) => result.observation).filter(Boolean);
  let marketContext = null;
  let marketContextSaveResult = { saved: 0, rejected: 0 };
  const shouldCollectMarketContext =
    observations.length > 0 &&
    options.collectMarketContext !== false &&
    (typeof options.marketContextProvider === "function" || options.providers === undefined);
  if (shouldCollectMarketContext) {
    try {
      const rawContext = await (options.marketContextProvider || collectMarketContextSnapshot)({
        now,
        providers: options.marketContextProviders,
        previousContext: options.marketContextObservations || loadMarketContextObservations(),
        previousExactObservations: existingExactObservations,
        currentExactObservations: observations,
        timeoutMs: options.marketContextTimeoutMs,
      });
      marketContext = buildMarketContextObservation(rawContext, { now, asOf: now });
      if (marketContext) {
        marketContextSaveResult = (options.saveMarketContextObservations || appendMarketContextObservations)(
          [marketContext],
          { ...(options.marketContextStore || {}), now, asOf: now }
        );
        observations = attachMarketContext(observations, marketContext);
      }
    } catch (error) {
      marketContext = {
        observedAt: now,
        state: "CONTEXT_CAPTURE_FAILED",
        error: error?.message || "Unknown market-context provider failure",
        pointInTimeVerified: false,
        scoringOrSelectionAllowed: false,
        automaticTrading: false,
      };
    }
  }
  const saveResult = observations.length && options.saveLegacySnapshots !== false
    ? (options.saveSnapshots || saveOutcomeSnapshots)(observations)
    : { saved: 0 };
  const exactSaveResult = observations.length
    ? (options.saveExactObservations || appendExactMarketObservations)(observations, {
        ...(options.exactObservationStore || {}),
        observedAt: now,
        asOf: now,
        source: "outcome-probe",
      })
    : { saved: 0, rejected: 0 };
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
    rankingInfluence: false,
    automaticTrading: false,
    automaticPromotion: false,
    identityPolicy: "EXACT_CHAIN_TOKEN_WITH_OPTIONAL_EXACT_POOL",
    dueCandidates: candidates.length,
    duePredictions: candidates.reduce(
      (sum, candidate) => sum + candidate.duePredictions.length,
      0
    ),
    providerRequestsUsed,
    providerRequestBudget: maxRequests,
    observationsSaved: num(saveResult.saved),
    exactLedgerObservationsSaved: num(exactSaveResult.saved),
    exactLedgerObservationsRejected: num(exactSaveResult.rejected),
    marketContextCapture: marketContext
      ? {
          state: marketContext.state,
          observationKey: marketContext.observationKey || null,
          pointInTimeVerified: marketContext.pointInTimeVerified === true,
          unavailableFields: marketContext.unavailableFields || [],
          error: marketContext.error || null,
        }
      : {
          state: observations.length
            ? options.providers !== undefined && !options.marketContextProvider
              ? "NOT_REQUESTED_WITH_INJECTED_TEST_PROVIDERS"
              : "NOT_REQUESTED"
            : "NO_EXACT_OBSERVATIONS",
          observationKey: null,
          pointInTimeVerified: false,
          unavailableFields: [],
          error: null,
        },
    marketContextObservationsSaved: num(marketContextSaveResult.saved),
    marketContextObservationsRejected: num(marketContextSaveResult.rejected),
    prospectiveEdgeEpisodesTracked: prospectiveMemory.length,
    prospectiveEdgeDueCandidates: candidates.filter(
      (candidate) => candidate.forwardEvidencePriority > 0
    ).length,
    prospectiveEntryEdgeEpisodesTracked: prospectiveEntryMemory.length,
    prospectiveEntryEdgeDueCandidates: candidates.filter(
      (candidate) => candidate.prospectiveEntryEdgeEpisodeIds.length > 0
    ).length,
    prospectiveEntryEdgeDuePredictions: candidates.reduce(
      (sum, candidate) => sum + candidate.duePredictions.filter(
        (prediction) => prediction.prospectiveEntryEdgeEpisodeId
      ).length,
      0
    ),
    prospectiveEntryEdgePolicy: "Only immutable, post-declaration, exact chain-token-pool treatment/control episodes at their registry-declared horizon are probed; the probe cannot influence ranking, promotion, or trading.",
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

/**
 * Collect due exact market outcomes without allowing two scanner/scheduler
 * processes to race the same durable evidence files. A healthy active run is
 * skipped rather than waited on: an hourly scheduler can retry on its next
 * tick while the original point-in-time collection remains authoritative.
 */
export async function runOutcomeProbe(options = {}) {
  if (options.acquireOutcomeProbeLock === false) {
    return runOutcomeProbeUnlocked(options);
  }

  const lock = acquireOutcomeProbeRunLock(options);
  if (!lock.acquired) {
    return {
      generatedAt: new Date(options.now || Date.now()).toISOString(),
      runId: options.runId || `outcome-probe-${Date.now()}`,
      status: "SKIPPED_ALREADY_RUNNING",
      skipped: true,
      skipReason: "OUTCOME_PROBE_ALREADY_RUNNING",
      activeRun: lock.activeRun || null,
      activeRunAgeMs: lock.ageMs ?? null,
      activeRunOwnerAlive: lock.ownerAlive ?? null,
      lockFile: lock.lockFile,
      scoringOrSelectionAllowed: false,
      rankingInfluence: false,
      automaticTrading: false,
      automaticPromotion: false,
      dueCandidates: 0,
      duePredictions: 0,
      observationsSaved: 0,
      exactLedgerObservationsSaved: 0,
      exactLedgerObservationsRejected: 0,
      prospectiveEdgeEpisodesTracked: 0,
      prospectiveEdgeDueCandidates: 0,
      prospectiveEntryEdgeEpisodesTracked: 0,
      prospectiveEntryEdgeDueCandidates: 0,
      prospectiveEntryEdgeDuePredictions: 0,
      unresolvedCandidates: 0,
      outcomesByHorizon: {},
      results: [],
    };
  }

  try {
    return await runOutcomeProbeUnlocked(options);
  } finally {
    lock.release();
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const report = await runOutcomeProbe();
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "PROVIDER_DEGRADED") process.exitCode = 1;
}
