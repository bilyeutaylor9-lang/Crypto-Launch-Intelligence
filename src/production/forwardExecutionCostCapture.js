import {
  normalizeExecutableQuote,
  quoteProviderFromEnvironment,
} from "../canary/executableQuoteTruthEngine.js";
import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";
import { finite, timestamp } from "./productionMath.js";

const DEFAULT_REFERENCE_NOTIONAL_USD = 100;
const DEFAULT_MAX_CANDIDATES = 25;
const HARD_MAX_CANDIDATES = 100;
const DEFAULT_MAX_QUOTE_AGE_MS = 30_000;
const DEFAULT_MAX_PAIR_SKEW_MS = 15_000;

function text(value) {
  return String(value ?? "").trim();
}

function optionOrEnvironment(options = {}, optionName, environmentName) {
  return options[optionName] === undefined
    ? process.env[environmentName]
    : options[optionName];
}

// Match the candidate-universe identity contract exactly. In particular, a
// symbol, a token without a pool, or a syntactically invalid non-EVM address
// is never sent to the quote endpoint.
function exactIdentity(project = {}) {
  const chain = normalizeChainId(
    project.chain || project.canonicalChain || project.network || project.chainId,
  );
  const tokenAddress = normalizeTokenAddress(
    project.tokenAddress || project.contractAddress || project.canonicalAddress || project.address,
    chain,
  );
  const poolAddress = normalizePoolAddress(
    project.poolAddress || project.pairAddress || project.primaryTradablePool,
    chain,
  );
  if (!chain || !tokenAddress || !poolAddress) return null;
  return {
    chain,
    tokenAddress,
    poolAddress,
    identityKey: `${chain}:${tokenAddress}`,
    routeKey: `${chain}:${tokenAddress}:${poolAddress}`,
  };
}

function positive(value, fallback) {
  const parsed = finite(value);
  return parsed !== null && parsed > 0 ? parsed : fallback;
}

function bounded(value, fallback) {
  return Math.min(
    HARD_MAX_CANDIDATES,
    Math.max(1, Math.floor(positive(value, fallback))),
  );
}

function quoteCapturedAt(raw = {}) {
  const value = raw.capturedAt ?? raw.observedAt ?? raw.timestamp ?? null;
  const parsed = timestamp(value);
  return parsed === null ? null : new Date(parsed).toISOString();
}

function quoteSummary(quote = {}) {
  return {
    quoteId: quote.quoteId || null,
    provider: quote.provider || null,
    capturedAt: quote.capturedAt || null,
    blockNumber: quote.blockNumber || null,
    requestedNotionalUsd: finite(quote.requestedNotionalUsd),
    inputUsd: finite(quote.inputUsd),
    outputUsd: finite(quote.outputUsd),
    inputTokenAmount: finite(quote.inputTokenAmount),
    outputTokenAmount: finite(quote.outputTokenAmount),
    allInCostBps: finite(quote.allInCostBps),
    priceImpactBps: finite(quote.priceImpactBps),
    protocolFeeBps: finite(quote.protocolFeeBps),
    gasUsd: finite(quote.gasUsd),
    route: quote.route || null,
    poolAddress: quote.poolAddress || null,
    routeIdentityVerified: quote.routeIdentityVerified ?? null,
    sourceUrl: quote.sourceUrl || null,
    rawEvidenceHash: quote.rawEvidenceHash || null,
  };
}

function object(value) {
  return value && typeof value === "object" ? value : {};
}

function addresses(values = []) {
  return values.flatMap((value) => {
    if (value === null || value === undefined || value === "") return [];
    if (Array.isArray(value)) return addresses(value);
    if (typeof value === "object") return [value.address, value.tokenAddress, value.contractAddress].filter(Boolean);
    return [value];
  });
}

// A quote response must attest to the exact route we asked for. Do not use the
// request context as a fallback here: a response missing identity is not
// auditable forward evidence, even if its price/cost numbers look plausible.
function rawQuoteIdentityMatches(raw = {}, expected = {}) {
  const route = object(raw.route || raw.routeSummary);
  const rawChain = normalizeChainId(raw.chain || raw.network || raw.chainId || route.chain || route.network || route.chainId);
  if (!rawChain) return { eligible: false, reason: "RAW_QUOTE_IDENTITY_MISSING" };
  if (rawChain !== expected.chain) return { eligible: false, reason: "RAW_QUOTE_IDENTITY_MISMATCH" };

  const tokenValues = addresses([
    raw.tokenAddress,
    raw.contractAddress,
    raw.baseTokenAddress,
    raw.targetTokenAddress,
    raw.toTokenAddress,
    raw.fromTokenAddress,
    raw.token,
    raw.baseToken,
    raw.targetToken,
    raw.toToken,
    raw.fromToken,
    route.tokenAddress,
    route.contractAddress,
    route.baseTokenAddress,
    route.targetTokenAddress,
    route.toTokenAddress,
    route.fromTokenAddress,
    route.token,
    route.baseToken,
    route.targetToken,
    route.toToken,
    route.fromToken,
  ]);
  const normalizedTokens = tokenValues
    .map((value) => normalizeTokenAddress(value, expected.chain))
    .filter(Boolean);
  if (!normalizedTokens.length) return { eligible: false, reason: "RAW_QUOTE_IDENTITY_MISSING" };
  if (!normalizedTokens.includes(expected.tokenAddress)) {
    return { eligible: false, reason: "RAW_QUOTE_IDENTITY_MISMATCH" };
  }

  const poolValues = addresses([
    raw.poolAddress,
    raw.pairAddress,
    raw.routePoolAddress,
    raw.pool,
    raw.pair,
    route.poolAddress,
    route.pairAddress,
    route.routePoolAddress,
    raw.routePoolAddresses,
    route.pool,
    route.pair,
    route.poolAddresses,
  ]);
  const normalizedPools = poolValues
    .map((value) => normalizePoolAddress(value, expected.chain))
    .filter(Boolean);
  if (!normalizedPools.length) return { eligible: false, reason: "RAW_QUOTE_IDENTITY_MISSING" };
  if (!normalizedPools.includes(expected.poolAddress)) {
    return { eligible: false, reason: "RAW_QUOTE_IDENTITY_MISMATCH" };
  }
  return { eligible: true };
}

function sameNotional(left, right) {
  const a = finite(left);
  const b = finite(right);
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= Math.max(0.01, a * 0.0001);
}

function observedQuote(raw = {}, quote = {}, asOfMs, maximumQuoteAgeMs) {
  const capturedAt = quoteCapturedAt(raw);
  const capturedMs = timestamp(capturedAt);
  if (!capturedAt || capturedMs === null) return { eligible: false, reason: "MISSING_QUOTE_CAPTURE_TIMESTAMP" };
  if (capturedMs > asOfMs || asOfMs - capturedMs > maximumQuoteAgeMs) {
    return { eligible: false, reason: "QUOTE_OUTSIDE_FRESHNESS_WINDOW" };
  }
  if (
    quote.status !== "EXECUTABLE_QUOTE_OBSERVED" ||
    quote.executable === false ||
    finite(quote.requestedNotionalUsd) === null ||
    finite(quote.requestedNotionalUsd) <= 0 ||
    finite(quote.allInCostBps) === null ||
    finite(quote.allInCostBps) < 0 ||
    finite(quote.priceImpactBps) === null
  ) {
    return { eligible: false, reason: "INCOMPLETE_EXECUTABLE_QUOTE" };
  }
  if (!text(quote.provider) || quote.provider === "UNKNOWN_PROVIDER") {
    return { eligible: false, reason: "MISSING_QUOTE_PROVIDER_PROVENANCE" };
  }
  return { eligible: true, capturedAt, capturedMs };
}

function buildObservedRoundTripEvidence(identity, buy, sell, options = {}) {
  const maximumPairSkewMs = positive(options.maximumPairSkewMs, DEFAULT_MAX_PAIR_SKEW_MS);
  const buyMs = timestamp(buy.capturedAt);
  const sellMs = timestamp(sell.capturedAt);
  const pairSkewMs = buyMs === null || sellMs === null ? null : Math.abs(sellMs - buyMs);
  if (pairSkewMs === null || pairSkewMs > maximumPairSkewMs) {
    return { eligible: false, reason: "BUY_SELL_QUOTE_SKEW_TOO_LARGE" };
  }
  if (!sameNotional(buy.requestedNotionalUsd, sell.requestedNotionalUsd)) {
    return { eligible: false, reason: "BUY_SELL_REFERENCE_NOTIONAL_MISMATCH" };
  }
  if (finite(buy.outputTokenAmount) === null || finite(buy.outputTokenAmount) <= 0) {
    return { eligible: false, reason: "BUY_OUTPUT_TOKEN_AMOUNT_MISSING" };
  }
  if (text(buy.provider) !== text(sell.provider)) {
    return { eligible: false, reason: "BUY_SELL_PROVIDER_MISMATCH" };
  }

  const roundTripExecutionCostBps = Number((
    finite(buy.allInCostBps) + finite(sell.allInCostBps)
  ).toFixed(3));
  const observedAt = new Date(Math.max(buyMs, sellMs)).toISOString();
  const provenance = {
    schemaVersion: 1,
    kind: "PAIRED_EXECUTABLE_QUOTES_V1",
    provider: buy.provider,
    transport: options.transport || "READ_ONLY_EXECUTABLE_QUOTE_PROVIDER",
    identityKey: identity.identityKey,
    routeKey: identity.routeKey,
    observedAt,
    quoteSkewMs: pairSkewMs,
    entryQuote: quoteSummary(buy),
    exitQuote: quoteSummary(sell),
    shadowOnly: true,
    rankingInfluence: false,
    automaticTrading: false,
  };
  return {
    eligible: true,
    evidence: {
      state: "PAIRED_EXECUTABLE_ROUND_TRIP_COST_OBSERVED",
      observedAt,
      roundTripExecutionCostBps,
      executionReferenceSizeUsd: finite(buy.requestedNotionalUsd),
      buyPriceImpactPct: Number((finite(buy.priceImpactBps) / 100).toFixed(6)),
      sellPriceImpactPct: Number((finite(sell.priceImpactBps) / 100).toFixed(6)),
      executionCostProvenance: provenance,
      executionReality: {
        state: "PAIRED_EXECUTABLE_ROUND_TRIP_COST_OBSERVED",
        observedAt,
        roundTripExecutionCostBps,
        referenceSizeUsd: finite(buy.requestedNotionalUsd),
        provenance,
        shadowOnly: true,
        rankingInfluence: false,
        automaticTrading: false,
      },
    },
  };
}

async function captureOne(project = {}, context = {}) {
  const identity = exactIdentity(project);
  const priceUsd = finite(project.priceUsd ?? project.price ?? project.marketData?.priceUsd);
  if (!identity || !identity.poolAddress || priceUsd === null || priceUsd <= 0) {
    return { eligible: false, reason: "STRICT_IDENTITY_OR_REFERENCE_PRICE_MISSING" };
  }
  const signalObservedAt = project.sourceObservedAt || project.marketObservedAt || project.observedAt || project.scannedAt || context.now;
  const request = {
    operation: "QUOTE_ONLY",
    executionIntent: "READ_ONLY_QUOTE",
    allowOrderSubmission: false,
    allowTransactionSubmission: false,
    chain: identity.chain,
    tokenAddress: identity.tokenAddress,
    candidateKey: identity.identityKey,
    poolAddress: identity.poolAddress,
    requestedNotionalUsd: context.referenceNotionalUsd,
    referencePriceUsd: priceUsd,
    signalObservedAt,
  };
  let rawBuy;
  try {
    rawBuy = await context.quoteProvider({ ...request, side: "BUY" });
  } catch (error) {
    return { eligible: false, reason: "BUY_QUOTE_REQUEST_FAILED", error: error.message };
  }
  const rawBuyIdentity = rawQuoteIdentityMatches(rawBuy || {}, identity);
  if (!rawBuyIdentity.eligible) return rawBuyIdentity;
  const buy = normalizeExecutableQuote(rawBuy || {}, {
    ...request,
    side: "BUY",
    provider: context.providerName,
  });
  const buyObservation = observedQuote(rawBuy || {}, buy, context.asOfMs, context.maximumQuoteAgeMs);
  if (!buyObservation.eligible) return buyObservation;

  let rawSell;
  try {
    rawSell = await context.quoteProvider({
      ...request,
      side: "SELL",
      inputTokenAmount: buy.outputTokenAmount,
    });
  } catch (error) {
    return { eligible: false, reason: "SELL_QUOTE_REQUEST_FAILED", error: error.message };
  }
  const rawSellIdentity = rawQuoteIdentityMatches(rawSell || {}, identity);
  if (!rawSellIdentity.eligible) return rawSellIdentity;
  const sell = normalizeExecutableQuote(rawSell || {}, {
    ...request,
    side: "SELL",
    inputTokenAmount: buy.outputTokenAmount,
    provider: context.providerName,
  });
  const sellObservation = observedQuote(rawSell || {}, sell, context.asOfMs, context.maximumQuoteAgeMs);
  if (!sellObservation.eligible) return sellObservation;
  return buildObservedRoundTripEvidence(identity, buy, sell, context);
}

function increment(map, key) {
  map[key] = (map[key] || 0) + 1;
}

/**
 * Captures read-only, paired executable BUY/SELL quotes for a bounded part of
 * the already-ranked universe. It runs after scoring and never feeds a score,
 * selection, route gate, or live order. Missing configuration and per-row
 * failures are deliberately non-fatal and leave downstream costs unknown.
 */
export async function captureForwardExecutionCosts(projects = [], options = {}) {
  const endpoint = text(optionOrEnvironment(options, "endpoint", "IGNITION_EXECUTABLE_QUOTE_ENDPOINT"));
  const source = Array.isArray(projects) ? projects : [];
  const now = options.now || new Date().toISOString();
  const asOfMs = timestamp(now);
  if (asOfMs === null) {
    return {
      state: "DISABLED_INVALID_CAPTURE_TIME",
      projects: source,
      audit: {
        attempted: 0,
        eligible: 0,
        accepted: 0,
        rejected: 0,
        rejectionReasons: { INVALID_CAPTURE_TIME: source.length },
        shadowOnly: true,
        rankingInfluence: false,
        automaticTrading: false,
      },
    };
  }
  const quoteProvider = options.quoteProvider || quoteProviderFromEnvironment({ ...options, endpoint });
  if (!quoteProvider) {
    return {
      state: "DISABLED_EXECUTABLE_QUOTE_PROVIDER_UNAVAILABLE",
      projects: source,
      audit: {
        attempted: 0,
        eligible: 0,
        accepted: 0,
        rejected: 0,
        rejectionReasons: { EXECUTABLE_QUOTE_PROVIDER_UNAVAILABLE: source.length },
        shadowOnly: true,
        rankingInfluence: false,
        automaticTrading: false,
      },
    };
  }

  const context = {
    now,
    asOfMs,
    quoteProvider,
    providerName:
      text(optionOrEnvironment(options, "providerName", "IGNITION_EXECUTABLE_QUOTE_PROVIDER")) ||
      text(quoteProvider.providerName) ||
      "READ_ONLY_EXECUTABLE_QUOTE_PROVIDER",
    transport: text(options.transport || quoteProvider.transport) || "READ_ONLY_EXECUTABLE_QUOTE_PROVIDER",
    referenceNotionalUsd: positive(
      optionOrEnvironment(options, "referenceNotionalUsd", "FORWARD_EXECUTION_COST_REFERENCE_NOTIONAL_USD"),
      DEFAULT_REFERENCE_NOTIONAL_USD,
    ),
    maximumQuoteAgeMs: positive(
      optionOrEnvironment(options, "maximumQuoteAgeMs", "FORWARD_EXECUTION_COST_MAX_QUOTE_AGE_MS"),
      DEFAULT_MAX_QUOTE_AGE_MS,
    ),
    maximumPairSkewMs: positive(
      optionOrEnvironment(options, "maximumPairSkewMs", "FORWARD_EXECUTION_COST_MAX_PAIR_SKEW_MS"),
      DEFAULT_MAX_PAIR_SKEW_MS,
    ),
  };
  const maxCandidates = bounded(
    optionOrEnvironment(options, "maxCandidates", "FORWARD_EXECUTION_COST_MAX_CANDIDATES"),
    DEFAULT_MAX_CANDIDATES,
  );
  const updates = new Map();
  const rejectionReasons = {};
  let attempted = 0;
  let eligible = 0;
  let accepted = 0;

  for (let index = 0; index < source.length && attempted < maxCandidates; index += 1) {
    const project = source[index];
    const identity = exactIdentity(project);
    const priceUsd = finite(project?.priceUsd ?? project?.price ?? project?.marketData?.priceUsd);
    if (!identity || !identity.poolAddress || priceUsd === null || priceUsd <= 0) continue;
    attempted += 1;
    eligible += 1;
    const captured = await captureOne(project, context);
    if (!captured.eligible) {
      increment(rejectionReasons, captured.reason || "UNSPECIFIED_CAPTURE_REJECTION");
      continue;
    }
    accepted += 1;
    updates.set(index, {
      ...project,
      ...captured.evidence,
      executionCostEvidence: {
        ...captured.evidence.executionReality,
        provenance: captured.evidence.executionCostProvenance,
      },
      shadowOnly: project.shadowOnly ?? true,
      executionCostCaptureShadowOnly: true,
      executionCostCaptureRankingInfluence: false,
      executionCostCaptureAutomaticTrading: false,
    });
  }

  return {
    state: accepted ? "PAIRED_EXECUTABLE_ROUND_TRIP_COSTS_CAPTURED" : "NO_PAIRED_EXECUTABLE_ROUND_TRIP_COSTS_CAPTURED",
    projects: updates.size
      ? source.map((project, index) => updates.get(index) || project)
      : source,
    audit: {
      endpointConfigured: Boolean(endpoint),
      provider: context.providerName,
      providerTransport: context.transport,
      keylessProvider: quoteProvider.keyless === true,
      quoteOnly: quoteProvider.quoteOnly !== false,
      attempted,
      eligible,
      accepted,
      rejected: attempted - accepted,
      rejectionReasons,
      referenceNotionalUsd: context.referenceNotionalUsd,
      maximumQuoteAgeMs: context.maximumQuoteAgeMs,
      maximumPairSkewMs: context.maximumPairSkewMs,
      shadowOnly: true,
      rankingInfluence: false,
      automaticTrading: false,
      automaticPromotion: false,
    },
  };
}

export const __forwardExecutionCostCaptureHooks = {
  exactIdentity,
  rawQuoteIdentityMatches,
  observedQuote,
  sameNotional,
  buildObservedRoundTripEvidence,
  quoteCapturedAt,
};
