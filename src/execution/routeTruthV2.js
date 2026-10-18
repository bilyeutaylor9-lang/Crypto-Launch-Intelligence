const LIVE_READY_STATUS = "LIVE_EXECUTION_READY";
const STALE_STATUSES = new Set(["STALE", "STALE_QUOTE"]);
const HARD_BLOCK_STATUSES = new Set(["HONEYPOT_RISK", "CONTRACT_MISMATCH", "CHAIN_MISMATCH", "REJECTED"]);
const VERIFIED_DEPTH_SOURCES = new Set(["LIVE-BUY-SELL-QUOTE", "PUBLIC-ORDER-BOOK", "LIVE-QUOTE", "ORDER-BOOK"]);
const NEGATIVE_QUOTE_STATUS = /(?:^|[^A-Z])(?:UNKNOWN|UNVERIFIED|UNCONFIRMED|UNSUCCESSFUL|FAILED|FAILURE|ERROR|MISSING|REJECTED|BLOCKED|UNAVAILABLE|INVALID|INCOMPLETE|UNPROVEN|UNSAFE|PENDING|UNCHECKED|UNTESTED|DEFERRED|STALE|NOT|NO|NEVER)(?:$|[^A-Z])/;
const SLIPPAGE_FIELDS = ["estimatedRoundTripSlippagePct", "estimatedSlippagePct", "observedSlippagePct", "slippagePct", "executionSlippagePct"];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clean(value = "") {
  return String(value ?? "").trim();
}

function upper(value = "") {
  return clean(value).toUpperCase();
}

function normalizedRouteType(subject = {}) {
  const value = upper(subject.routeType || subject.canonicalExecutionRoute?.routeType || subject.executionProofRecoveryRoute?.routeType);
  if (value === "DEX_AGGREGATOR" || value === "AGGREGATOR") return "AGGREGATOR";
  return value;
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function currentProof(subject = {}) {
  const proof = subject.executionProof;
  return proof && typeof proof === "object" && !Array.isArray(proof) && Object.keys(proof).length ? proof : null;
}

function hasVerifiedDepthSource(subject = {}) {
  const source = upper(first([
    subject.verifiedDepthSource,
    subject.depthVerificationSource,
    subject.executionProof?.verifiedDepthSource,
    subject.executionProof?.depthVerificationSource,
    subject.executionProofRecoveryRoute?.verifiedDepthSource,
    subject.executionProofRecoveryRoute?.depthVerificationSource,
    subject.canonicalExecutionRoute?.verifiedDepthSource,
    subject.canonicalExecutionRoute?.depthVerificationSource,
  ])).replace(/_/g, "-");
  return VERIFIED_DEPTH_SOURCES.has(source) || subject.executionProofRecovery?.status === "ROUTE_RECOVERED";
}

function verifiedStatus(value = "") {
  const status = upper(value);
  if (!status || NEGATIVE_QUOTE_STATUS.test(status) || status.includes("PARTIAL") || status.includes("DETECTED") || status.includes("OBSERVED")) return false;
  return /(?:^|[^A-Z])(?:VERIFIED|CONFIRMED|PASSED|SUCCESS|SUCCESSFUL|LIVE|READY)(?:$|[^A-Z])/.test(status);
}

function quoteObjectVerified(object = {}) {
  if (!object || typeof object !== "object") return false;
  if ([object.verified, object.quoteVerified, object.liveQuoteVerified].includes(false) ||
    [object.status, object.verificationStatus, object.routeTruthStatus].some((value) => NEGATIVE_QUOTE_STATUS.test(upper(value)))) return false;
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
  const proof = currentProof(subject);
  const timestamp = proof && Object.hasOwn(proof, "quoteTimestamp") ? proof.quoteTimestamp : first([
    subject.quoteTimestamp, subject.executionQuoteTimestamp, subject.buyQuote?.timestamp,
    subject.sellQuote?.timestamp, subject.quote?.timestamp, subject.executionProofRecoveryRoute?.quoteTimestamp,
    subject.canonicalExecutionRoute?.quoteTimestamp,
  ]);
  const timestampSupplied = Boolean(timestamp) || Boolean(proof && Object.hasOwn(proof, "quoteTimestamp"));
  const parsed = timestamp ? Date.parse(timestamp) : NaN;
  const timestampAge = Number.isFinite(parsed) && parsed <= Date.now()
    ? Math.round((Date.now() - parsed) / 1000) : null;
  const ageWithTimestamp = (age) => timestampSupplied && timestampAge === null ? null
    : age === null ? timestampAge : Math.max(age, timestampAge ?? 0);
  if (proof && ["quoteFreshnessSeconds", "quoteAgeSeconds"].some((field) => Object.hasOwn(proof, field))) {
    const age = Object.hasOwn(proof, "quoteFreshnessSeconds") ? proof.quoteFreshnessSeconds : proof.quoteAgeSeconds;
    if ((typeof age !== "number" && (typeof age !== "string" || age.trim() === "")) ||
      !Number.isFinite(Number(age)) || Number(age) < 0) return null;
    return ageWithTimestamp(Number(age));
  }
  if (proof && Object.hasOwn(proof, "quoteTimestamp")) {
    return timestampAge;
  }
  const explicit = first([
    subject.quoteAgeSeconds,
    subject.quoteFreshnessSeconds,
    subject.executionQuoteAgeSeconds,
    subject.buyQuote?.ageSeconds,
    subject.sellQuote?.ageSeconds,
    subject.quote?.ageSeconds,
    subject.executionProof?.quoteFreshnessSeconds,
    subject.executionProof?.quoteAgeSeconds,
    subject.executionProofRecoveryRoute?.quoteAgeSeconds,
    subject.canonicalExecutionRoute?.quoteAgeSeconds,
  ]);
  if (explicit !== null && (typeof explicit === "number" || (typeof explicit === "string" && explicit.trim() !== "")) &&
    Number.isFinite(Number(explicit)) && Number(explicit) >= 0) return ageWithTimestamp(Number(explicit));
  return timestampSupplied ? timestampAge : null;
}

export function routeQuoteFresh(subject = {}, maxAgeSeconds = 3600) {
  const age = routeQuoteAgeSeconds(subject);
  return age !== null && age <= maxAgeSeconds && !STALE_STATUSES.has(upper(subject.status || subject.executionStatus));
}

export function hasVerifiedBuyQuote(subject = {}) {
  const proof = currentProof(subject);
  if (proof && Object.hasOwn(proof, "buyQuoteVerified")) return proof.buyQuoteVerified === true;
  if (proof && Object.hasOwn(proof, "liveBuyQuoteVerified")) return proof.liveBuyQuoteVerified === true;
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
  const proof = currentProof(subject);
  if (proof && Object.hasOwn(proof, "sellQuoteVerified")) return proof.sellQuoteVerified === true;
  if (proof && Object.hasOwn(proof, "liveSellQuoteVerified")) return proof.liveSellQuoteVerified === true;
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
  const proof = currentProof(subject);
  if (proof && Object.hasOwn(proof, "depthVerified")) return proof.depthVerified === true;
  if (proof && Object.hasOwn(proof, "orderBookDepthVerified")) return proof.orderBookDepthVerified === true;
  const proofFields = ["orderBookDepthUsd", "bidDepthUsd", "askDepthUsd", "executableDepthUsd", "verifiedTradeSizeUsd", "liquidityUsd"];
  if (proof && proofFields.some((field) => Object.hasOwn(proof, field))) return Math.max(...proofFields.map((field) => num(proof[field]))) > 0;
  if (subject.liquidityVerified === false && !hasVerifiedDepthSource(subject)) return false;
  return Boolean(
    subject.orderBookDepthVerified === true ||
      subject.executionProof?.orderBookDepthVerified === true ||
      Math.max(
        num(subject.orderBookDepthUsd),
        num(subject.bidDepthUsd),
        num(subject.askDepthUsd),
        num(subject.executableDepthUsd),
        num(subject.verifiedTradeSizeUsd),
        num(subject.liquidityUsd),
        num(subject.dexLiquidityUsd),
        num(subject.stableExitLiquidityUsd),
        num(subject.executionProof?.orderBookDepthUsd),
        num(subject.executionProof?.executableDepthUsd),
        num(subject.executionProof?.verifiedTradeSizeUsd),
        num(subject.executionProof?.liquidityUsd),
        num(subject.executionProofRecoveryRoute?.orderBookDepthUsd),
        num(subject.executionProofRecoveryRoute?.executableDepthUsd),
        num(subject.executionProofRecoveryRoute?.verifiedTradeSizeUsd),
        num(subject.executionProofRecoveryRoute?.liquidityUsd),
        num(subject.canonicalExecutionRoute?.orderBookDepthUsd),
        num(subject.canonicalExecutionRoute?.executableDepthUsd),
        num(subject.canonicalExecutionRoute?.verifiedTradeSizeUsd),
        num(subject.canonicalExecutionRoute?.liquidityUsd)
      ) > 0
  );
}

function sourceSlippagePct(source = {}) {
  if (source.slippageIsHeuristic === true || source.slippageVerified === false) return null;
  const value = first(SLIPPAGE_FIELDS.map((field) => source[field]));
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return null;
  const measured = Number(value);
  if (!Number.isFinite(measured) || measured < 0) return null;
  if (typeof value === "string" && measured === 0 && /[1-9]/.test(value.split(/[eE]/)[0])) return null;
  return measured;
}

export function observedRouteSlippagePct(subject = {}) {
  const proof = currentProof(subject);
  if (proof && (proof.slippageIsHeuristic === true || proof.slippageVerified === false ||
      SLIPPAGE_FIELDS.some((field) => Object.hasOwn(proof, field)))) return sourceSlippagePct(proof);
  if (subject.slippageIsHeuristic === true || subject.slippageVerified === false) return null;
  for (const source of [subject, subject.canonicalExecutionRoute, subject.executionProofRecoveryRoute]) {
    if (source && SLIPPAGE_FIELDS.some((field) => source[field] !== undefined && source[field] !== null && source[field] !== "")) {
      return sourceSlippagePct(source);
    }
  }
  return null;
}

export function hasVerifiedRouteSlippage(subject = {}) {
  return observedRouteSlippagePct(subject) !== null;
}

export function hasFreshTokenAuthorityEvidence(subject = {}) {
  const proof = currentProof(subject) || subject;
  if (proof.authorityEvidenceRequired !== true) return true;
  if (proof.authorityEvidenceVerified !== true || typeof proof.authorityEvidenceSourceTimestamp !== "string") return false;
  const stamp = Date.parse(proof.authorityEvidenceSourceTimestamp);
  const now = Date.now();
  return Number.isFinite(stamp) && stamp > 0 && stamp <= now && now - stamp <= 300_000;
}

export function hasExactRouteIdentity(subject = {}) {
  const proof = currentProof(subject);
  if (proof && Object.hasOwn(proof, "exactIdentityVerified")) return proof.exactIdentityVerified === true;
  const routeType = normalizedRouteType(subject);
  if (subject.exactIdentityVerified === true || subject.executionProof?.exactIdentityVerified === true) return true;
  if (routeType === "CEX") {
    return Boolean(
      (subject.venue || subject.exchange || subject.canonicalExecutionRoute?.venue) &&
        (subject.marketPair || subject.exchangeAssetId || subject.canonicalExecutionRoute?.marketPair)
    );
  }
  if (subject.exactIdentityVerified === false || subject.executionProof?.exactIdentityVerified === false) return false;
  return Boolean(
    (subject.chain || subject.chainId || subject.canonicalExecutionRoute?.chain) &&
      (subject.contractAddress || subject.tokenAddress || subject.canonicalExecutionRoute?.contractAddress) &&
      (subject.poolAddress || subject.pairAddress || subject.canonicalExecutionRoute?.pairAddress)
  );
}

function routeRegionAllowsExecution(subject = {}) {
  const proof = currentProof(subject);
  if (proof?.userAccessEvidenceRequired === true && proof.userAccessVerified !== true) return false;
  const routeType = normalizedRouteType(subject);
  const status = upper(first([
    subject.regionStatus,
    subject.regionAvailability,
    subject.canonicalExecutionRoute?.regionStatus,
    subject.canonicalExecutionRoute?.regionAvailability,
    subject.executionProofRecoveryRoute?.regionStatus,
    subject.executionProofRecoveryRoute?.regionAvailability,
  ]));
  if (["CONFIRMED_RESTRICTED", "REGION_RESTRICTED", "RESTRICTED", "UNAVAILABLE"].includes(status)) return false;
  if (routeType === "CEX") return status === "CONFIRMED_AVAILABLE";
  return true;
}

export function isLiveExecutionReady(subject = {}, options = {}) {
  const maxAgeSeconds = options.maxAgeSeconds ?? 3600;
  const status = upper(subject.routeTruthStatus || subject.executionProofState || subject.executionStatus || subject.status);
  const proofStatus = upper(subject.executionProof?.routeTruthStatus || subject.executionProof?.executionProofState || subject.executionProof?.executionStatus);
  const routeStatus = upper(subject.canonicalExecutionRoute?.routeTruthStatus || subject.canonicalExecutionRoute?.status);
  const proof = currentProof(subject);
  if (proof && (proof.liveExecutionReady === false || (proofStatus && proofStatus !== LIVE_READY_STATUS))) return false;
  if (HARD_BLOCK_STATUSES.has(status) || HARD_BLOCK_STATUSES.has(proofStatus) || HARD_BLOCK_STATUSES.has(routeStatus)) return false;
  if (![status, proofStatus, routeStatus].includes(LIVE_READY_STATUS)) return false;
  if (subject.safetyVerified === false || (proof && Object.hasOwn(proof, "safetyVerified") && proof.safetyVerified !== true)) return false;
  const requirements = { ...subject, ...proof };
  if (
    requirements.transferTaxEvidenceRequired === true &&
    requirements.transferTaxEvidenceVerified !== true
  ) return false;
  if (
    requirements.authorityEvidenceRequired === true &&
    (!hasFreshTokenAuthorityEvidence(subject) || requirements.authoritySafetyClean !== true)
  ) return false;

  return Boolean(
    hasExactRouteIdentity(subject) &&
      hasVerifiedBuyQuote(subject) &&
      hasVerifiedSellQuote(subject) &&
      routeQuoteFresh(subject, maxAgeSeconds) &&
      hasVerifiedRouteDepth(subject) &&
      hasVerifiedRouteSlippage(subject) &&
      routeRegionAllowsExecution(subject)
  );
}

export function executionTruthState(subject = {}, options = {}) {
  if (isLiveExecutionReady(subject, options)) return LIVE_READY_STATUS;
  if (!hasExactRouteIdentity(subject)) return "MARKET_OBSERVED";
  if (hasVerifiedBuyQuote(subject) && hasVerifiedSellQuote(subject)) return "SELL_QUOTE_VERIFIED";
  if (hasVerifiedBuyQuote(subject)) return "BUY_QUOTE_VERIFIED";
  return "PAIR_IDENTITY_VERIFIED";
}
