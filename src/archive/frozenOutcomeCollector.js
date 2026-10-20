import crypto from "node:crypto";

import { getPairByAddress, getTokenPairs, normalizeDexPair } from "../data/dexScreenerConnector.js";
import { getGeckoPoolByAddress, normalizeGeckoPool, resolveGeckoTerminalNetworkId } from "../data/geckoTerminalConnector.js";
import { normalizeChainId, normalizePoolAddress, normalizeTokenAddress } from "../identity/strictIdentityValidators.js";
import { buildExactMarketObservation } from "../production/exactMarketObservationLedger.js";

function timestamp(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError(`${label} must be a valid timestamp.`);
  return date.toISOString();
}

function abortError(signal) {
  if (!signal?.aborted) return null;
  return signal.reason instanceof Error ? signal.reason : new Error("Outcome collection was cancelled.");
}

function fatalStorageFailure(error) {
  const failure = error instanceof Error ? error : new Error(String(error));
  failure.fatalCollectionStorageFailure = true;
  return failure;
}

function identityFor(prediction = {}) {
  const contract = prediction.immutableContract || prediction.contract || prediction;
  const chain = normalizeChainId(contract.chain);
  const tokenAddress = normalizeTokenAddress(contract.tokenAddress, chain);
  const rawPool = contract.poolAddress;
  const poolAddress = rawPool === null || rawPool === undefined || rawPool === ""
    ? null
    : normalizePoolAddress(rawPool, chain);
  if (!chain || !tokenAddress || (rawPool && !poolAddress)) {
    throw new Error("Frozen outcome contract lacks a strict chain/token/pool identity.");
  }
  return { chain, tokenAddress, poolAddress, frozenEpisode: contract.frozenEpisode ?? null };
}

function sourceTimestamp(raw = {}) {
  // These are provider-supplied observation fields only. In particular, never
  // use pair/pool creation or an HTTP Date header as a market observation time.
  const value = raw.sourceObservedAt ?? raw.sourceTimestamp ?? raw.observedAt ?? raw.updatedAt ?? raw.updated_at ?? null;
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function exactCandidate(candidate, raw, identity) {
  const chain = normalizeChainId(candidate.chain);
  const tokenAddress = normalizeTokenAddress(candidate.tokenAddress || candidate.address, chain);
  const poolAddress = normalizePoolAddress(candidate.poolAddress || candidate.pairAddress, chain);
  const priceUsd = Number(candidate.priceUsd);
  if (chain !== identity.chain || tokenAddress !== identity.tokenAddress || !Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  if (identity.poolAddress && poolAddress !== identity.poolAddress) return null;
  if (!poolAddress && identity.poolAddress) return null;
  return { ...candidate, chain, tokenAddress, poolAddress: identity.poolAddress || poolAddress || null, priceUsd, marketObservedAt: sourceTimestamp(raw) };
}

function dexCandidates(payload) {
  const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.pairs) ? payload.pairs : []);
  return rows.map((raw) => ({ raw, candidate: normalizeDexPair(raw) }));
}

function geckoCandidates(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : (payload?.data ? [payload.data] : Array.isArray(payload) ? payload : []);
  return rows.map((raw) => ({ raw, candidate: normalizeGeckoPool(raw) }));
}

function bytesHash(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function createFrozenOutcomeCollector({ archive, clock = () => new Date(), dexFetcher, geckoFetcher } = {}) {
  if (!archive || typeof archive.admitPrediction !== "function") throw new TypeError("archive.admitPrediction is required.");
  if (typeof clock !== "function") throw new TypeError("clock must be a function.");

  return {
    async collect({ task = {}, prediction = {}, request = {}, signal } = {}) {
      const cancelled = abortError(signal || request.signal);
      if (cancelled) throw cancelled;
      if (!request.requestId || typeof request.observeTransport !== "function") {
        throw new TypeError("Outcome request must provide requestId and observeTransport(receipt).");
      }
      const requestedAt = timestamp(request.requestedAt, "Outcome request timestamp");
      const identity = identityFor(prediction);
      const frozen = task.frozen || {};
      const observationClockPolicy = frozen.observationClockPolicy || "COLLECTION_RECEIPT_V1";
      const taskId = task.taskId || null;
      const receipts = new Map();

      const onResponseBytes = async (receipt) => {
        await request.observeTransport(receipt);
        receipts.set(receipt.provider, receipt);
        const diagnostic = {
          recordId: `http-provider-response:${request.requestId}:${receipt.provider}`,
          rawBytes: receipt.rawBytes,
          frozenObligations: [],
          cohortMetadata: { kind: "HTTP_PROVIDER_RESPONSE_V1_DIAGNOSTIC", taskId, requestId: request.requestId, provider: receipt.provider },
          immutableContract: {
            kind: "HTTP_PROVIDER_RESPONSE_V1_DIAGNOSTIC",
            taskId,
            requestId: request.requestId,
            provider: receipt.provider,
            url: receipt.url || null,
            status: Number.isFinite(receipt.status) ? receipt.status : null,
            requestedAt: receipt.requestedAt,
            receivedAt: receipt.receivedAt,
            headers: receipt.headers || {},
            rawBytesHash: bytesHash(receipt.rawBytes),
            scoringOrSelectionAllowed: false,
          },
        };
        try { archive.admitPrediction(diagnostic); }
        catch (error) { throw fatalStorageFailure(error); }
      };

      const options = { signal: signal || request.signal, requestedAt, now: clock, onResponseBytes };
      const tryProvider = async (provider, fetcher, normalize) => {
        const cancelledNow = abortError(signal || request.signal);
        if (cancelledNow) throw cancelledNow;
        try {
          const payload = await fetcher(options);
          const receipt = receipts.get(provider);
          if (!receipt) return null;
          for (const row of normalize(payload)) {
            const exact = exactCandidate(row.candidate, row.raw, identity);
            if (exact) return { exact, receipt };
          }
          return null;
        } catch (error) {
          if (error?.fatalCollectionStorageFailure || error?.responseReceiptCaptureFailure || abortError(signal || request.signal)) throw error;
          return null;
        }
      };

      const dex = await tryProvider("dexscreener", async (fetchOptions) => {
        if (typeof dexFetcher === "function") return dexFetcher({ ...identity, ...fetchOptions });
        return identity.poolAddress
          ? getPairByAddress(identity.chain, identity.poolAddress, fetchOptions)
          : getTokenPairs(identity.chain, identity.tokenAddress, fetchOptions);
      }, dexCandidates);
      const gecko = dex || !identity.poolAddress || !resolveGeckoTerminalNetworkId(identity.chain) ? null : await tryProvider("geckoterminal", async (fetchOptions) => {
        if (typeof geckoFetcher === "function") return geckoFetcher({ ...identity, ...fetchOptions, maxAttempts: 1 });
        return getGeckoPoolByAddress(identity.chain, identity.poolAddress, { ...fetchOptions, maxAttempts: 1 });
      }, geckoCandidates);
      const result = dex || gecko;
      if (!result) return null;

      const { exact, receipt } = result;
      const observationOf = {
        recordId: task.recordId || null,
        taskId,
        horizonHours: Number(frozen.horizonHours ?? task.horizonHours) || null,
        requestedAt,
        receivedAt: receipt.receivedAt,
        marketObservedAt: exact.marketObservedAt,
        observationClockPolicy,
      };
      const exactObservation = buildExactMarketObservation({
        ...exact,
        observedAt: exact.marketObservedAt || receipt.receivedAt,
        outcomeObservationProvenance: {
          receiptObservedAt: receipt.receivedAt,
          sourceTimestamp: exact.marketObservedAt,
          observationTimeBasis: exact.marketObservedAt ? "INDEPENDENT_PROVIDER_SOURCE_V1" : "COLLECTION_RECEIPT_V1",
        },
      }, { asOf: receipt.receivedAt, source: `frozen-outcome:${receipt.provider}` });
      if (!exactObservation) return null;
      return {
        recordId: `captured-exact-outcome:${taskId || task.recordId}:${request.requestId}:${receipt.provider}`,
        rawBytes: receipt.rawBytes,
        frozenObligations: [],
        cohortMetadata: { kind: "CAPTURED_EXACT_OUTCOME_V1", provider: receipt.provider, taskId, scoringOrSelectionAllowed: false },
        immutableContract: {
          kind: "CAPTURED_EXACT_OUTCOME_V1",
          chain: identity.chain,
          tokenAddress: identity.tokenAddress,
          poolAddress: identity.poolAddress || exact.poolAddress,
          frozenEpisode: identity.frozenEpisode,
          observationOf,
          exactObservation,
          rawBytesHash: bytesHash(receipt.rawBytes),
          scoringOrSelectionAllowed: false,
        },
      };
    },
  };
}
