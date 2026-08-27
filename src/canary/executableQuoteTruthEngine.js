
import { jsonPost } from "../sensors/rpcJsonClient.js";
import { createLiFiExecutableQuoteProvider } from "../execution/lifiExecutableQuoteProvider.js";

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function lower(value) { return String(value || "").toLowerCase(); }
function round(value, digits = 6) {
  const n = finite(value);
  return n === null ? null : Number(n.toFixed(digits));
}
function iso(value, fallback = null) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? new Date(ms).toISOString() : fallback;
}

export function normalizeExecutableQuote(raw = {}, context = {}) {
  const requestedNotionalUsd = finite(raw.requestedNotionalUsd ?? context.requestedNotionalUsd);
  const inputUsd = finite(raw.inputUsd ?? raw.sellAmountUsd ?? requestedNotionalUsd);
  const outputUsd = finite(raw.outputUsd ?? raw.buyValueUsd ?? raw.executableOutputValueUsd);
  const gasUsd = finite(raw.gasUsd ?? raw.estimatedGasUsd);
  const priceImpactBps = finite(raw.priceImpactBps ?? raw.estimatedPriceImpactBps);
  const protocolFeeBps = finite(raw.protocolFeeBps ?? raw.feeBps);
  const capturedAt = iso(raw.capturedAt ?? raw.observedAt, context.capturedAt || new Date().toISOString());
  const signalAtMs = Date.parse(context.signalObservedAt || "");
  const capturedMs = Date.parse(capturedAt || "");
  const quoteLatencyMs = Number.isFinite(signalAtMs) && Number.isFinite(capturedMs) ? Math.max(0, capturedMs - signalAtMs) : null;
  const allInShortfallBps = inputUsd !== null && inputUsd > 0 && outputUsd !== null
    ? ((inputUsd - (outputUsd - (gasUsd || 0))) / inputUsd) * 10000
    : null;
  const explicitAllIn = finite(raw.allInCostBps ?? raw.allInEntryCostBps);
  const allInCostBps = explicitAllIn ?? allInShortfallBps;
  const outputTokenAmount = finite(raw.outputTokenAmount ?? raw.buyAmountToken);
  const inputTokenAmount = finite(raw.inputTokenAmount ?? raw.sellAmountToken);
  const executablePriceUsd = finite(raw.executablePriceUsd)
    ?? (outputTokenAmount !== null && outputTokenAmount > 0 && inputUsd !== null ? inputUsd / outputTokenAmount : null);

  const complete = Boolean(
    requestedNotionalUsd !== null &&
    requestedNotionalUsd > 0 &&
    capturedAt &&
    (context.side === "SELL" ? outputUsd !== null : outputTokenAmount !== null || outputUsd !== null) &&
    allInCostBps !== null &&
    priceImpactBps !== null &&
    raw.routeIdentityVerified !== false
  );
  return {
    status: complete ? "EXECUTABLE_QUOTE_OBSERVED" : "EXECUTABLE_QUOTE_INCOMPLETE",
    side: context.side || raw.side || "BUY",
    chain: lower(context.chain || raw.chain),
    candidateKey: context.candidateKey || raw.candidateKey || null,
    tokenAddress: lower(context.tokenAddress || raw.tokenAddress),
    requestedNotionalUsd,
    inputUsd,
    inputTokenAmount,
    outputUsd,
    outputTokenAmount,
    executablePriceUsd: round(executablePriceUsd, 12),
    referencePriceUsd: finite(raw.referencePriceUsd ?? context.referencePriceUsd),
    priceImpactBps: round(priceImpactBps, 3),
    protocolFeeBps: round(protocolFeeBps, 3),
    gasUsd: round(gasUsd, 6),
    allInCostBps: round(allInCostBps, 3),
    route: raw.route || raw.routeSummary || null,
    poolAddress: lower(raw.poolAddress || raw.route?.poolAddress),
    routeIdentityVerified: raw.routeIdentityVerified ?? null,
    sourceUrl: raw.sourceUrl || raw.route?.sourceUrl || null,
    rawEvidenceHash: raw.rawEvidenceHash || raw.route?.rawEvidenceHash || null,
    provider: raw.provider || context.provider || "UNKNOWN_PROVIDER",
    blockNumber: raw.blockNumber || null,
    capturedAt,
    signalToQuoteLatencyMs: quoteLatencyMs,
    quoteId: raw.quoteId || raw.id || null,
    executable: raw.executable === false ? false : complete,
    shadowOnly: true,
    rankingInfluence: false,
  };
}

export function preloadedQuoteProvider(project = {}) {
  const evidence = project.executableQuoteEvidence || project.canaryExecutableQuoteEvidence || null;
  if (!evidence) return null;
  const rows = Array.isArray(evidence) ? evidence : Array.isArray(evidence.quotes) ? evidence.quotes : [evidence];
  return async ({ side, requestedNotionalUsd }) => {
    const exact = rows.find((row) =>
      String(row.side || "BUY").toUpperCase() === String(side || "BUY").toUpperCase() &&
      Number(row.requestedNotionalUsd ?? row.inputUsd) === Number(requestedNotionalUsd)
    );
    if (!exact) throw new Error("PRELOADED_QUOTE_NOT_FOUND");
    return exact;
  };
}

export function httpExecutableQuoteProvider(endpoint, options = {}) {
  if (!endpoint) return null;
  const provider = async (request) => {
    const payload = await jsonPost(endpoint, request, {
      timeoutMs: options.timeoutMs || 6000,
      retries: options.retries ?? 0,
      headers: options.headers || {},
    });
    if (payload?.error) throw new Error(payload.error.message || String(payload.error));
    return payload?.quote || payload;
  };
  provider.providerName = options.providerName || "CONFIGURED_EXECUTABLE_QUOTE_ENDPOINT";
  provider.transport = "CONFIGURED_EXECUTABLE_QUOTE_ENDPOINT";
  provider.endpoint = endpoint;
  provider.quoteOnly = true;
  return provider;
}

export function quoteProviderFromEnvironment(options = {}) {
  const endpoint = options.endpoint || process.env.IGNITION_EXECUTABLE_QUOTE_ENDPOINT;
  if (endpoint) {
    const headers = {};
    if (process.env.IGNITION_EXECUTABLE_QUOTE_BEARER) {
      headers.authorization = `Bearer ${process.env.IGNITION_EXECUTABLE_QUOTE_BEARER}`;
    }
    return httpExecutableQuoteProvider(endpoint, {
      ...options,
      providerName: options.providerName || process.env.IGNITION_EXECUTABLE_QUOTE_PROVIDER,
      headers: { ...headers, ...(options.headers || {}) },
    });
  }
  const freeProviderQuotesEnabled = options.freeProviderQuotesEnabled ??
    process.env.FREE_PROVIDER_QUOTES_ENABLED !== "false";
  if (!freeProviderQuotesEnabled) return null;
  return createLiFiExecutableQuoteProvider(options.lifi || options);
}

async function requestOne(project, sizeUsd, policy, provider, options = {}) {
  const chain = lower(project.chain || project.network || project.canonicalChain);
  const tokenAddress = lower(project.tokenAddress || project.contractAddress || project.address);
  const candidateKey = project.identityKey || project.candidateKey || `${chain}:${tokenAddress || String(project.symbol || "unknown").toLowerCase()}`;
  const signalObservedAt = options.signalObservedAt || project.observedAt || project.scannedAt || new Date().toISOString();
  const source = provider || preloadedQuoteProvider(project);
  if (!source) {
    return {
      status: "EXECUTABLE_QUOTE_UNAVAILABLE",
      side: "BUY",
      chain,
      candidateKey,
      tokenAddress,
      requestedNotionalUsd: sizeUsd,
      capturedAt: null,
      reason: "NO_EXECUTABLE_QUOTE_PROVIDER_CONFIGURED",
      executable: false,
      shadowOnly: true,
      rankingInfluence: false,
    };
  }
  try {
    const raw = await source({
      side: "BUY",
      chain,
      tokenAddress,
      candidateKey,
      requestedNotionalUsd: sizeUsd,
      referencePriceUsd: finite(project.priceUsd ?? project.price ?? project.marketData?.priceUsd),
      poolAddress: lower(project.poolAddress || project.pairAddress || project.primaryTradablePool),
      signalObservedAt,
    });
    return normalizeExecutableQuote(raw, {
      side: "BUY", chain, tokenAddress, candidateKey, requestedNotionalUsd: sizeUsd,
      signalObservedAt,
      referencePriceUsd: finite(project.priceUsd ?? project.price ?? project.marketData?.priceUsd),
      provider: options.providerName,
    });
  } catch (error) {
    return {
      status: "EXECUTABLE_QUOTE_FAILED",
      side: "BUY",
      chain,
      candidateKey,
      tokenAddress,
      requestedNotionalUsd: sizeUsd,
      capturedAt: null,
      error: error.message,
      executable: false,
      shadowOnly: true,
      rankingInfluence: false,
    };
  }
}

export function buildCapacityFrontier(quotes = [], policy = {}) {
  const eligible = quotes.filter((quote) =>
    quote?.status === "EXECUTABLE_QUOTE_OBSERVED" &&
    quote.executable !== false &&
    finite(quote.priceImpactBps) !== null &&
    Math.abs(quote.priceImpactBps) <= Number(policy.maxEntryImpactBps || Infinity) &&
    finite(quote.allInCostBps) !== null &&
    quote.allInCostBps <= Number(policy.maxAllInEntryCostBps || Infinity)
  );
  const maximumExecutableNotionalUsd = eligible.length
    ? Math.max(...eligible.map((quote) => finite(quote.requestedNotionalUsd) || 0))
    : null;
  const maxTested = (policy.quoteNotionalsUsd || []).length ? Math.max(...policy.quoteNotionalsUsd) : maximumExecutableNotionalUsd;
  return {
    maximumExecutableNotionalUsd,
    eligibleQuoteCount: eligible.length,
    testedQuoteCount: quotes.length,
    capacityLimited: maximumExecutableNotionalUsd !== null && maxTested !== null && maximumExecutableNotionalUsd < maxTested,
    evidenceMode: "REAL_EXECUTABLE_QUOTE_CURVE",
  };
}

export async function collectExecutableQuoteCurve(project = {}, policy = {}, options = {}) {
  const provider = options.quoteProvider || quoteProviderFromEnvironment(options);
  const notionals = policy.quoteNotionalsUsd || [policy.primaryNotionalUsd || 1000];
  const quotes = [];
  for (const size of notionals) {
    quotes.push(await requestOne(project, Number(size), policy, provider, options));
  }
  return {
    state: quotes.some((quote) => quote.status === "EXECUTABLE_QUOTE_OBSERVED")
      ? "EXECUTABLE_QUOTE_CURVE_OBSERVED"
      : "EXECUTABLE_QUOTE_CURVE_UNAVAILABLE",
    candidateKey: quotes[0]?.candidateKey || null,
    signalObservedAt: options.signalObservedAt || project.observedAt || project.scannedAt || null,
    quotes,
    capacity: buildCapacityFrontier(quotes, policy),
    shadowOnly: true,
    rankingInfluence: false,
  };
}

export async function collectReplayQuote(ticket = {}, kind = "EXIT_MARK", delaySeconds = 0, options = {}) {
  const provider = options.quoteProvider || quoteProviderFromEnvironment(options);
  if (!provider) return {
    status: "EXECUTABLE_QUOTE_UNAVAILABLE", kind, ticketId: ticket.ticketId, delaySeconds,
    reason: "NO_EXECUTABLE_QUOTE_PROVIDER_CONFIGURED", shadowOnly: true,
  };
  const entry = ticket?.primaryEntryQuote || {};
  const side = kind === "ENTRY_DELAY_BUY" ? "BUY" : "SELL";
  const request = {
    side,
    chain: ticket.chain,
    tokenAddress: ticket.tokenAddress,
    candidateKey: ticket.identityKey,
    requestedNotionalUsd: entry.requestedNotionalUsd,
    inputTokenAmount: side === "SELL" ? entry.outputTokenAmount : null,
    outputTokenAmount: null,
    referencePriceUsd: ticket.signalPriceUsd,
    poolAddress: ticket.poolAddress || null,
    signalObservedAt: ticket.signalObservedAt,
    canaryTicketId: ticket.ticketId,
    delaySeconds,
  };
  try {
    const raw = await provider(request);
    const normalized = normalizeExecutableQuote(raw, {
      side,
      chain: ticket.chain,
      tokenAddress: ticket.tokenAddress,
      candidateKey: ticket.identityKey,
      requestedNotionalUsd: entry.requestedNotionalUsd,
      signalObservedAt: ticket.signalObservedAt,
      referencePriceUsd: ticket.signalPriceUsd,
      provider: options.providerName,
    });
    return { ...normalized, kind, ticketId: ticket.ticketId, delaySeconds };
  } catch (error) {
    return {
      status: "EXECUTABLE_QUOTE_FAILED", kind, ticketId: ticket.ticketId, delaySeconds,
      error: error.message, shadowOnly: true, rankingInfluence: false,
    };
  }
}

export const __executableQuoteHooks = { finite, lower, round };
