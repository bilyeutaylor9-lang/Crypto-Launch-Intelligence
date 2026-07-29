const LIVE_READY_STATUS = "LIVE_EXECUTION_READY";
const STALE_STATUSES = new Set(["STALE", "STALE_QUOTE"]);
const HARD_BLOCK_STATUSES = new Set(["HONEYPOT_RISK", "CONTRACT_MISMATCH", "CHAIN_MISMATCH", "REJECTED"]);

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clean(value = "") {
  return String(value ?? "").trim();
}

function upper(value = "") {
  return clean(value).toUpperCase();
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function verifiedStatus(value = "") {
  const status = upper(value);
  if (!status || status.includes("PARTIAL") || status.includes("DETECTED") || status.includes("OBSERVED")) return false;
  return ["VERIFIED", "CONFIRMED", "PASSED", "SUCCESS", "SUCCESSFUL", "LIVE", "READY", LIVE_READY_STATUS].some((term) =>
    status.includes(term)
  );
}

function quoteObjectVerified(object = {}) {
  if (!object || typeof object !== "object") return false;
  return Boolean(
    object.verified === true ||
      object.quoteVerified === true ||
      object.liveQuoteVerified === true ||
      verifiedStatus(object.status) ||
      verifiedStatus(object.verificationStatus) ||
      verifiedStatus(object.routeTruthStatus)
  );
}

export function routeQuoteAgeSeconds(subject = {}) {
  const explicit = first([
    subject.quoteAgeSeconds,
    subject.quoteFreshnessSeconds,
    subject.executionQuoteAgeSeconds,
    subject.buyQuote?.ageSeconds,
    subject.sellQuote?.ageSeconds,
    subject.quote?.ageSeconds,
    subject.executionProof?.quoteFreshnessSeconds,
    subject.executionProof?.quoteAgeSeconds,
    subject.canonicalExecutionRoute?.quoteAgeSeconds,
  ]);
  if (explicit !== null && Number.isFinite(Number(explicit))) return Math.max(0, Number(explicit));

  const timestamp = first([
    subject.quoteTimestamp,
    subject.executionQuoteTimestamp,
    subject.buyQuote?.timestamp,
    subject.sellQuote?.timestamp,
    subject.quote?.timestamp,
    subject.executionProof?.quoteTimestamp,
    subject.canonicalExecutionRoute?.quoteTimestamp,
    subject.updatedAt,
    subject.marketData?.updatedAt,
  ]);
  const parsed = timestamp ? Date.parse(timestamp) : NaN;
  return Number.isFinite(parsed) ? Math.max(0, Math.round((Date.now() - parsed) / 1000)) : null;
}

export function routeQuoteFresh(subject = {}, maxAgeSeconds = 3600) {
  const age = routeQuoteAgeSeconds(subject);
  return age !== null && age <= maxAgeSeconds && !STALE_STATUSES.has(upper(subject.status || subject.executionStatus));
}

export function hasVerifiedBuyQuote(subject = {}) {
  return Boolean(
    subject.buyQuoteVerified === true ||
      subject.liveBuyQuoteVerified === true ||
      quoteObjectVerified(subject.buyQuote) ||
      quoteObjectVerified(subject.quotes?.buy) ||
      quoteObjectVerified(subject.quote?.buy) ||
      subject.executionProof?.buyQuoteVerified === true ||
      subject.executionProof?.liveBuyQuoteVerified === true ||
      subject.canonicalExecutionRoute?.buyQuoteVerified === true
  );
}

export function hasVerifiedSellQuote(subject = {}) {
  return Boolean(
    subject.sellQuoteVerified === true ||
      subject.liveSellQuoteVerified === true ||
      quoteObjectVerified(subject.sellQuote) ||
      quoteObjectVerified(subject.quotes?.sell) ||
      quoteObjectVerified(subject.quote?.sell) ||
      subject.executionProof?.sellQuoteVerified === true ||
      subject.executionProof?.liveSellQuoteVerified === true ||
      subject.canonicalExecutionRoute?.sellQuoteVerified === true
  );
}

export function hasVerifiedRouteDepth(subject = {}) {
  return Boolean(
    subject.orderBookDepthVerified === true ||
      subject.executionProof?.orderBookDepthVerified === true ||
      Math.max(
        num(subject.orderBookDepthUsd),
        num(subject.bidDepthUsd),
        num(subject.askDepthUsd),
        num(subject.liquidityUsd),
        num(subject.dexLiquidityUsd),
        num(subject.stableExitLiquidityUsd),
        num(subject.executionProof?.orderBookDepthUsd),
        num(subject.executionProof?.liquidityUsd),
        num(subject.canonicalExecutionRoute?.liquidityUsd)
      ) > 0
  );
}

export function hasVerifiedRouteSlippage(subject = {}) {
  const value = first([
    subject.estimatedRoundTripSlippagePct,
    subject.estimatedSlippagePct,
    subject.slippagePct,
    subject.executionSlippagePct,
    subject.executionProof?.estimatedRoundTripSlippagePct,
    subject.executionProof?.estimatedSlippagePct,
    subject.executionProof?.observedSlippagePct,
    subject.canonicalExecutionRoute?.estimatedRoundTripSlippagePct,
    subject.canonicalExecutionRoute?.estimatedSlippagePct,
    subject.canonicalExecutionRoute?.observedSlippagePct,
  ]);
  if (value === null || !Number.isFinite(Number(value))) return false;
  if (
    subject.slippageIsHeuristic === true ||
    subject.executionProof?.slippageIsHeuristic === true ||
    subject.canonicalExecutionRoute?.slippageIsHeuristic === true
  ) {
    return false;
  }
  return true;
}

export function hasExactRouteIdentity(subject = {}) {
  const routeType = upper(subject.routeType || subject.canonicalExecutionRoute?.routeType);
  if (subject.exactIdentityVerified === true || subject.executionProof?.exactIdentityVerified === true) return true;
  if (routeType === "CEX") {
    return Boolean(
      (subject.venue || subject.exchange || subject.canonicalExecutionRoute?.venue) &&
        (subject.marketPair || subject.exchangeAssetId || subject.canonicalExecutionRoute?.marketPair)
    );
  }
  return Boolean(
    (subject.chain || subject.chainId || subject.canonicalExecutionRoute?.chain) &&
      (subject.contractAddress || subject.tokenAddress || subject.canonicalExecutionRoute?.contractAddress) &&
      (subject.poolAddress || subject.pairAddress || subject.canonicalExecutionRoute?.pairAddress || routeType === "AGGREGATOR")
  );
}

export function isLiveExecutionReady(subject = {}, options = {}) {
  const maxAgeSeconds = options.maxAgeSeconds ?? 3600;
  const status = upper(subject.routeTruthStatus || subject.executionProofState || subject.executionStatus || subject.status);
  const proofStatus = upper(subject.executionProof?.routeTruthStatus || subject.executionProof?.executionProofState || subject.executionProof?.executionStatus);
  const routeStatus = upper(subject.canonicalExecutionRoute?.routeTruthStatus || subject.canonicalExecutionRoute?.status);
  if (HARD_BLOCK_STATUSES.has(status) || HARD_BLOCK_STATUSES.has(proofStatus) || HARD_BLOCK_STATUSES.has(routeStatus)) return false;
  if (![status, proofStatus, routeStatus].includes(LIVE_READY_STATUS)) return false;

  return Boolean(
    hasExactRouteIdentity(subject) &&
      hasVerifiedBuyQuote(subject) &&
      hasVerifiedSellQuote(subject) &&
      routeQuoteFresh(subject, maxAgeSeconds) &&
      hasVerifiedRouteDepth(subject) &&
      hasVerifiedRouteSlippage(subject) &&
      (subject.regionStatus ? upper(subject.regionStatus) === "CONFIRMED_AVAILABLE" : true)
  );
}

export function executionTruthState(subject = {}, options = {}) {
  if (isLiveExecutionReady(subject, options)) return LIVE_READY_STATUS;
  if (!hasExactRouteIdentity(subject)) return "MARKET_OBSERVED";
  if (hasVerifiedBuyQuote(subject) && hasVerifiedSellQuote(subject)) return "SELL_QUOTE_VERIFIED";
  if (hasVerifiedBuyQuote(subject)) return "BUY_QUOTE_VERIFIED";
  return "PAIR_IDENTITY_VERIFIED";
}
