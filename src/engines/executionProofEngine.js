import { calculateEvidenceCoverage, numericMetric } from "../kernel/evidenceCoverage.js";
import {
  hasVerifiedBuyQuote,
  hasVerifiedSellQuote,
  isLiveExecutionReady,
  routeQuoteFresh,
} from "../execution/routeTruthV2.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function clean(value = "") {
  return String(value ?? "").trim();
}

function lower(value = "") {
  return clean(value).toLowerCase();
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function addressOf(project = {}) {
  if (project.canonicalExecutionRoute?.contractAddress) return project.canonicalExecutionRoute.contractAddress;
  return first([
    project.canonicalAddress,
    project.finalContractAddress,
    project.contractAddress,
    project.tokenAddress,
    project.address,
    project.baseToken?.address,
    project.rawCandidate?.contractAddress,
    project.rawCandidate?.tokenAddress,
  ]) || null;
}

function chainOf(project = {}) {
  if (project.canonicalExecutionRoute?.chain) return project.canonicalExecutionRoute.chain;
  return first([project.canonicalChain, project.finalChainId, project.chainId, project.finalChain, project.chain, project.network]) || null;
}

function pairOf(project = {}) {
  if (project.canonicalExecutionRoute?.pairAddress) return project.canonicalExecutionRoute.pairAddress;
  return first([
    project.finalPairAddress,
    project.pairAddress,
    project.poolAddress,
    project.pair?.address,
    project.rawCandidate?.pairAddress,
    project.rawCandidate?.poolAddress,
  ]) || null;
}

function liquidityUsd(project = {}) {
  return Math.max(
    num(project.canonicalExecutionRoute?.liquidityUsd),
    num(project.liquidityUsd),
    num(project.liquidity),
    num(project.finalLiquidityUsd),
    num(project.activeLiquidityUsd),
    num(project.marketData?.liquidityUsd),
    num(project.rawCandidate?.liquidityUsd),
    num(project.smallCapHunter?.execution?.liquidityUsd),
    num(project.proofOfAlphaExecutionTwin?.quote?.liquidityUsd)
  );
}

function volume24hUsd(project = {}) {
  return Math.max(
    num(project.canonicalExecutionRoute?.volume24hUsd),
    num(project.volume24h),
    num(project.volume),
    num(project.marketData?.volume24h),
    num(project.rawCandidate?.volume24h),
    num(project.proofOfAlphaExecutionTwin?.quote?.volume24h),
    num(project.smallCapHunter?.execution?.volume24h)
  );
}

function priceUsd(project = {}) {
  return Math.max(
    num(project.canonicalExecutionRoute?.priceUsd),
    num(project.priceUsd),
    num(project.price),
    num(project.marketData?.priceUsd),
    num(project.rawCandidate?.priceUsd),
    num(project.proofOfAlphaExecutionTwin?.quote?.priceUsd)
  );
}

function quoteAgeSeconds(project = {}) {
  const explicit = first([
    project.quoteAgeSeconds,
    project.executionQuoteAgeSeconds,
    project.proofOfAlphaExecutionTwin?.quote?.ageSeconds,
    project.proofOfAlphaExecutionTwin?.quoteAgeSeconds,
  ]);
  if (explicit !== undefined && explicit !== null && explicit !== "") return num(explicit);

  const timestamp = first([
    project.quoteTimestamp,
    project.executionQuoteTimestamp,
    project.canonicalExecutionRoute?.quoteTimestamp,
    project.proofOfAlphaExecutionTwin?.quote?.timestamp,
    project.marketData?.updatedAt,
    project.updatedAt,
    project.lastUpdatedAt,
  ]);
  const parsed = timestamp ? Date.parse(timestamp) : NaN;
  return Number.isFinite(parsed) ? Math.max(0, Math.round((Date.now() - parsed) / 1000)) : null;
}

function slippageFor(liquidity = 0, orderSize = 100, observed = null) {
  if (observed !== null && observed !== undefined && Number.isFinite(Number(observed))) return Number(observed);
  if (liquidity <= 0) return null;
  return Math.round(Math.min(99, (orderSize / liquidity) * 100 * 2.5) * 100) / 100;
}

function routeSources(project = {}) {
  const sources = [];
  const add = (source, route = {}, venue = "") => {
    if (!route || typeof route !== "object") return;
    const buyQuoteVerified = hasVerifiedBuyQuote(route);
    const sellQuoteVerified = hasVerifiedSellQuote(route);
    sources.push({
      source,
      venue: clean(venue || route.preferredRoute || route.venue || route.type || route.name || source),
      status: route.status || route.verdict || "",
      buy: buyQuoteVerified,
      sell: sellQuoteVerified,
      buyQuoteVerified,
      sellQuoteVerified,
      pairAddress: route.pairAddress,
      contract: route.contract || route.tokenAddress || route.address,
      quoteAsset: route.quoteAsset || route.quoteToken,
      quoteAgeSeconds: route.quoteAgeSeconds,
      quoteTimestamp: route.quoteTimestamp || route.timestamp || route.updatedAt,
      marketPair: route.marketPair || route.market || route.symbol,
      routeType: route.routeType,
      verified: route.routeTruthStatus === "LIVE_EXECUTION_READY" || (buyQuoteVerified && sellQuoteVerified && route.verified === true),
    });
  };
  if (project.canonicalExecutionRoute) {
    const buyQuoteVerified = hasVerifiedBuyQuote(project.canonicalExecutionRoute);
    const sellQuoteVerified = hasVerifiedSellQuote(project.canonicalExecutionRoute);
    sources.push({
      source: "canonical-execution-route",
      venue: project.canonicalExecutionRoute.venue || "Canonical Route",
      status: project.canonicalExecutionRoute.status,
      buy: buyQuoteVerified,
      sell: sellQuoteVerified,
      buyQuoteVerified,
      sellQuoteVerified,
      pairAddress: project.canonicalExecutionRoute.pairAddress,
      contract: project.canonicalExecutionRoute.contractAddress,
      quoteAsset: project.canonicalExecutionRoute.quoteAsset,
      quoteAgeSeconds: project.canonicalExecutionRoute.quoteAgeSeconds,
      quoteTimestamp: project.canonicalExecutionRoute.quoteTimestamp,
      marketPair: project.canonicalExecutionRoute.marketPair,
      routeType: project.canonicalExecutionRoute.routeType,
      verified: project.canonicalExecutionRoute.routeTruthStatus === "LIVE_EXECUTION_READY" ||
        (buyQuoteVerified && sellQuoteVerified && project.canonicalExecutionRoute.status === "VERIFIED"),
    });
  }

  add("purchase-route", project.purchaseRoute, project.purchaseRoute?.preferredRoute);
  add("execution-proof-recovery", project.executionProofRecoveryRoute, project.executionProofRecoveryRoute?.venue);
  add("small-cap-hunter", project.smallCapHunter?.purchaseRoute, project.smallCapHunter?.purchaseRoute?.preferredRoute);
  add("execution-twin", project.proofOfAlphaExecutionTwin?.route, project.proofOfAlphaExecutionTwin?.route?.preferredRoute);
  for (const route of project.executionProofRecoveryRoutes || []) add("execution-proof-recovery-detail", route);
  for (const route of project.purchaseRoute?.routes || []) add("purchase-route-detail", route);
  for (const route of project.smallCapHunter?.purchaseRoute?.routes || []) add("small-cap-route-detail", route);
  for (const route of project.proofOfAlphaExecutionTwin?.route?.routes || []) add("execution-twin-route-detail", route);

  const source = lower(project.source || project.dex || project.exchange);
  if (["dexscreener", "geckoterminal", "birdeye", "uniswap", "pancakeswap", "raydium", "orca"].some((name) => source.includes(name))) {
    sources.push({
      source: project.source || project.dex || "dex-market-data",
      venue: project.dex || project.source || "DEX",
      status: "Market pair observed",
      buy: false,
      sell: false,
      buyQuoteVerified: false,
      sellQuoteVerified: false,
      pairAddress: pairOf(project),
      contract: addressOf(project),
      quoteAsset: project.quoteToken || project.quoteAsset || "unknown",
      routeType: "DEX",
      verified: false,
      marketObserved: true,
    });
  }

  if (
    [
      "coinbase",
      "kraken",
      "binance",
      "binance.us",
      "gemini",
      "okx",
      "bybit",
      "kucoin",
      "gate",
      "mexc",
      "bitget",
      "crypto.com",
      "htx",
      "upbit",
      "bithumb",
    ].some((name) => source.includes(name))
  ) {
    sources.push({
      source: project.source || project.exchange || "cex-market-data",
      venue: project.exchange || project.source || "CEX",
      status: "Exchange market observed",
      buy: false,
      sell: false,
      buyQuoteVerified: false,
      sellQuoteVerified: false,
      quoteAsset: project.quoteToken || "USD",
      marketPair: project.marketPair || project.symbol,
      routeType: "CEX",
      verified: false,
      marketObserved: true,
    });
  }

  return sources;
}

function providerUnavailable(project = {}, routes = []) {
  const text = lower([
    project.canonicalExecutionRoute?.status === "PROVIDER_UNAVAILABLE" ? "provider unavailable" : "",
    ...(project.canonicalExecutionRoute?.failureReasons || []),
    project.providerStatus,
    project.discoveryProviderStatus,
    project.executionProviderStatus,
    project.routeStatus,
    project.proofOfAlphaExecutionTwin?.route?.status,
    ...(project.providerFailures || []),
    ...(project.discoveryProviderFailures || []),
    ...routes.map((route) => route.status),
  ].join(" "));
  return ["fetch failed", "timeout", "rate limit", "429", "403", "451", "provider unavailable", "outage", "skipped", "missing api key"].some((term) =>
    text.includes(term)
  );
}

function sellRouteConfirmedUnavailable(project = {}, routes = []) {
  const text = lower([
    project.sellRouteStatus,
    project.executionSellStatus,
    project.honeypotEvidence,
    project.proofOfAlphaExecutionTwin?.safety?.blockers?.join(" "),
    ...(routes || []).map((route) => route.status).join(" "),
  ].join(" "));
  return ["cannot sell", "sell unavailable", "sell route unavailable", "honeypot", "transfer blocked"].some((term) => text.includes(term));
}

function verifiedIdentity(project = {}) {
  return Boolean(
    project.identityVerified === true ||
      project.contractVerified === true ||
      project.projectIdentityVerdict === "Identity Resolved" ||
      ["VERIFIED_CONTRACT", "VERIFIED_LISTING"].includes(project.finalIdentityState || project.identityState)
  );
}

function safetyNonBlocked(project = {}, routes = []) {
  return Boolean(
    project.honeypotDetected !== true &&
      num(project.honeypotRiskScore) < 85 &&
      !sellRouteConfirmedUnavailable(project, routes) &&
      !["CRITICAL", "RESTRICTED"].includes(project.instantSafetyStatus) &&
      project.verifiedScam !== true
  );
}

function statusFor({
  project,
  routes,
  buyRouteAvailable,
  sellRouteAvailable,
  liquidity,
  quoteAge,
  outage,
  chainVerified,
  contractVerified,
  poolVerified,
  quoteVerified,
  safetyVerified,
  liveReady,
}) {
  const canonicalStatus = project.canonicalExecutionRoute?.status;
  if (project.honeypotDetected === true || num(project.honeypotRiskScore) >= 85 || sellRouteConfirmedUnavailable(project, routes)) return "HONEYPOT_RISK";
  if (project.chainMismatch === true || project.contractChainMismatch === true) return "CHAIN_MISMATCH";
  if (project.canonicalIdentityHardBlock === true || project.identityStatus === "CONTRACT_CONFLICT") return "CONTRACT_MISMATCH";
  if (liveReady) return "VERIFIED";
  if (
    canonicalStatus === "VERIFIED" &&
    buyRouteAvailable &&
    sellRouteAvailable &&
    (project.canonicalExecutionRoute?.routeType === "CEX" || (chainVerified && contractVerified && poolVerified)) &&
    quoteVerified &&
    safetyVerified
  ) return "VERIFIED";
  if ((buyRouteAvailable || sellRouteAvailable) && safetyVerified) return "PARTIALLY_VERIFIED";
  if (!chainVerified || !contractVerified || !poolVerified || !quoteVerified || !safetyVerified) return outage ? "PROVIDER_UNAVAILABLE" : "UNKNOWN";
  if (buyRouteAvailable && sellRouteAvailable && liquidity >= 5_000 && quoteAge !== null && quoteAge > 21_600) return "STALE_QUOTE";
  if (buyRouteAvailable && sellRouteAvailable && liquidity >= 5_000) return "VERIFIED";
  if ((buyRouteAvailable || sellRouteAvailable) && liquidity > 0) return "PARTIALLY_VERIFIED";
  if (liquidity > 0 && liquidity < 1_000) return "INSUFFICIENT_LIQUIDITY";
  if (outage) return "PROVIDER_UNAVAILABLE";
  if (routes.length && !buyRouteAvailable && !sellRouteAvailable) return "NO_ROUTE";
  return "UNKNOWN";
}

function moneyStatusFor(status = "") {
  if (status === "VERIFIED") return status;
  if (status === "PARTIALLY_VERIFIED") return "UNKNOWN";
  if (["PROVIDER_UNAVAILABLE", "UNKNOWN", "STALE_QUOTE", "NO_ROUTE"].includes(status)) return "UNKNOWN";
  return "VERIFIED_NEGATIVE";
}

function verifiedTaxEvidence(project = {}) {
  return Boolean(
    project.taxesVerified === true ||
      project.transferTaxVerified === true ||
      project.transferTaxEvidence ||
      project.taxEvidence ||
      project.buyTaxPct !== undefined ||
      project.sellTaxPct !== undefined ||
      project.executionProof?.taxesVerified === true ||
      project.proofOfAlphaExecutionTwin?.taxes?.verified === true
  );
}

function sellSimulationPassed(project = {}) {
  const simulation = lower(
    [
      project.sellSimulationStatus,
      project.executionSellSimulationStatus,
      project.executionProof?.sellSimulationStatus,
      project.proofOfAlphaExecutionTwin?.simulation?.sellStatus,
      project.proofOfAlphaExecutionTwin?.sellSimulationStatus,
    ].join(" ")
  );
  return Boolean(
    project.sellSimulationPassed === true ||
      project.executionProof?.sellSimulationPassed === true ||
      project.proofOfAlphaExecutionTwin?.simulation?.sellPassed === true ||
      /passed|success|successful|verified/.test(simulation)
  );
}

function orderBookDepthVerified(project = {}) {
  return Boolean(
    project.orderBookDepthVerified === true ||
      project.executionProof?.orderBookDepthVerified === true ||
      num(project.orderBookDepthUsd) > 0 ||
      num(project.bidDepthUsd) > 0 ||
      num(project.askDepthUsd) > 0 ||
      num(project.canonicalExecutionRoute?.liquidityUsd) > 0 ||
      num(project.executionProofRecoveryRoute?.liquidityUsd) > 0
  );
}

function executionProofStateFor({
  project,
  routes,
  executionStatus,
  buyRouteAvailable,
  sellRouteAvailable,
  chainVerified,
  contractVerified,
  poolVerified,
  quoteVerified,
  quoteAge,
  liquidity,
  estimatedSlippage100,
  observedSlippageVerified,
}) {
  if (["HONEYPOT_RISK", "CONTRACT_MISMATCH", "CHAIN_MISMATCH"].includes(executionStatus)) return executionStatus;
  if (executionStatus === "PROVIDER_UNAVAILABLE") return "PROVIDER_UNAVAILABLE";

  const marketObserved = routes.length > 0 || priceUsd(project) > 0 || liquidity > 0;
  if (!marketObserved) return "NO_VERIFIED_ROUTE";
  if (!chainVerified || !contractVerified || !poolVerified) return "MARKET_OBSERVED";
  if (!buyRouteAvailable) return "PAIR_IDENTITY_VERIFIED";
  if (!sellRouteAvailable) return "BUY_QUOTE_VERIFIED";
  if (!quoteVerified) return "BUY_QUOTE_VERIFIED";

  const taxVerified = verifiedTaxEvidence(project);
  const simulationPassed = sellSimulationPassed(project);
  const depthVerified = orderBookDepthVerified(project);
  const freshEnough = quoteAge !== null && quoteAge <= 3600 && estimatedSlippage100 !== null && observedSlippageVerified;

  if (freshEnough && simulationPassed && taxVerified && depthVerified) return "LIVE_EXECUTION_READY";
  if (simulationPassed) return "SELL_SIMULATION_PASSED";
  if (taxVerified) return "TAXES_VERIFIED";
  if (depthVerified) return "ORDER_BOOK_DEPTH_VERIFIED";
  return "SELL_QUOTE_VERIFIED";
}

export function analyzeExecutionProof(project = {}, options = {}) {
  const routes = routeSources(project);
  const liquidity = liquidityUsd(project);
  const volume = volume24hUsd(project);
  const price = priceUsd(project);
  const quoteAge = quoteAgeSeconds(project);
  const outage = providerUnavailable(project, routes);
  const buyRouteAvailable = routes.some((route) => route.buy);
  const sellRouteAvailable = routes.some((route) => route.sell) && !sellRouteConfirmedUnavailable(project, routes);
  const observedSlippage = first([
    project.estimatedRoundTripSlippagePct,
    project.estimatedSlippagePct,
    project.slippagePct,
    project.executionSlippagePct,
    project.canonicalExecutionRoute?.estimatedRoundTripSlippagePct,
    project.canonicalExecutionRoute?.estimatedSlippagePct,
    project.canonicalExecutionRoute?.observedSlippagePct,
    project.executionProofRecoveryRoute?.estimatedRoundTripSlippagePct,
    project.executionProofRecoveryRoute?.estimatedSlippagePct,
    project.executionProofRecoveryRoute?.slippagePct,
    project.proofOfAlphaExecutionTwinSlippagePct,
    project.proofOfAlphaExecutionTwin?.quote?.estimatedSlippagePct,
    project.smallCapHunter?.execution?.slippagePct,
  ]);
  const estimatedSlippage100 = slippageFor(liquidity, 100, observedSlippage);
  const observedSlippageVerified = observedSlippage !== null && observedSlippage !== undefined && Number.isFinite(Number(observedSlippage));
  const chainVerified = Boolean(chainOf(project) && !project.chainMismatch && !project.contractChainMismatch);
  const contractVerified = Boolean(addressOf(project) && verifiedIdentity(project));
  const routeType = project.canonicalExecutionRoute?.routeType || routes.find((route) => route.routeType)?.routeType || "";
  const poolVerified = routeType === "CEX"
    ? Boolean(routes.some((route) => route.marketPair) || project.marketPair || project.exchangeAssetId)
    : Boolean(pairOf(project) || routes.some((route) => route.pairAddress));
  const quoteVerified = Boolean(buyRouteAvailable && sellRouteAvailable && price > 0 && liquidity > 0 && quoteAge !== null && routeQuoteFresh({ quoteAgeSeconds: quoteAge }, 21_600));
  const safetyVerified = safetyNonBlocked(project, routes);
  const liveReadySubject = {
    ...project,
    executionProofState: "LIVE_EXECUTION_READY",
    routeTruthStatus: "LIVE_EXECUTION_READY",
    buyQuoteVerified: buyRouteAvailable,
    sellQuoteVerified: sellRouteAvailable,
    quoteAgeSeconds: quoteAge,
    liquidityUsd: liquidity,
    estimatedSlippagePct: observedSlippage,
    slippageIsHeuristic: !observedSlippageVerified,
    exactIdentityVerified: chainVerified && contractVerified && poolVerified,
    routeType,
  };
  const liveReady = Boolean(
    safetyVerified &&
      sellSimulationPassed(project) &&
      verifiedTaxEvidence(project) &&
      orderBookDepthVerified(project) &&
      isLiveExecutionReady(liveReadySubject)
  );
  const executionStatus = statusFor({
    project,
    routes,
    buyRouteAvailable,
    sellRouteAvailable,
    liquidity,
    quoteAge,
    outage,
    chainVerified,
    contractVerified,
    poolVerified,
    quoteVerified,
    safetyVerified,
    liveReady,
  });
  const failureReasons = [];
  if (executionStatus === "PROVIDER_UNAVAILABLE") failureReasons.push("Execution provider unavailable; no negative route conclusion made.");
  if (executionStatus === "UNKNOWN") failureReasons.push("Execution route has not been checked with enough evidence.");
  if (executionStatus === "NO_ROUTE") failureReasons.push("Provider evidence did not return a route.");
  if (executionStatus === "INSUFFICIENT_LIQUIDITY") failureReasons.push("Observed liquidity is too low for reliable execution.");
  if (executionStatus === "STALE_QUOTE") failureReasons.push("Route exists, but quote freshness is stale.");
  if (executionStatus === "HONEYPOT_RISK") failureReasons.push("Sell-route or honeypot evidence is unsafe.");
  if (executionStatus === "CONTRACT_MISMATCH") failureReasons.push("Contract identity mismatch prevents execution proof.");
  if (executionStatus === "CHAIN_MISMATCH") failureReasons.push("Chain mismatch prevents execution proof.");
  if (!chainVerified) failureReasons.push("Correct chain is not verified.");
  if (!contractVerified) failureReasons.push("Verified token contract is missing.");
  if (!poolVerified) failureReasons.push("Verified liquidity pool is missing.");
  if (!quoteVerified) failureReasons.push("Verified quote is missing or stale/unknown.");
  if (!observedSlippageVerified) failureReasons.push("Live slippage quote is missing; heuristic slippage is research-only.");
  if (!safetyVerified) failureReasons.push("Execution safety is blocked or unresolved.");

  const executionProofState = executionProofStateFor({
    project,
    routes,
    executionStatus,
    buyRouteAvailable,
    sellRouteAvailable,
    chainVerified,
    contractVerified,
    poolVerified,
    quoteVerified,
    quoteAge,
    liquidity,
    estimatedSlippage100,
    observedSlippageVerified,
  });

  const supportingSources = routes
    .filter((route) => route.verified || route.buy || route.sell)
    .map((route) => route.source)
    .filter(Boolean);

  const executionProof = {
    executionStatus,
    verifiedAt: new Date().toISOString(),
    chainId: chainOf(project),
    contractAddress: addressOf(project),
    venue: routes.find((route) => route.buy || route.sell || route.verified)?.venue || null,
    pairAddress: pairOf(project) || routes.find((route) => route.pairAddress)?.pairAddress || null,
    quoteAsset: routes.find((route) => route.quoteAsset)?.quoteAsset || project.quoteAsset || project.quoteToken || null,
    price: price || null,
    liquidityUsd: liquidity || null,
    volume24hUsd: volume || null,
    estimatedSlippage25: slippageFor(liquidity, 25, null),
    estimatedSlippage100,
    observedSlippagePct: observedSlippageVerified ? Number(observedSlippage) : null,
    estimatedRoundTripSlippagePct: observedSlippageVerified ? Number(observedSlippage) : null,
    slippageIsHeuristic: !observedSlippageVerified,
    estimatedSlippage500: slippageFor(liquidity, 500, null),
    estimatedSlippage1000: slippageFor(liquidity, 1000, null),
    executionProofState,
    liveExecutionReady: executionProofState === "LIVE_EXECUTION_READY",
    executionProofActionability:
      executionProofState === "LIVE_EXECUTION_READY"
        ? "LIVE_EXECUTION_READY"
        : executionProofState === "SELL_SIMULATION_PASSED"
          ? "SIMULATED_SELL_READY_RESEARCH"
          : ["SELL_QUOTE_VERIFIED", "ORDER_BOOK_DEPTH_VERIFIED", "TAXES_VERIFIED"].includes(executionProofState)
            ? "QUOTE_VERIFIED_RESEARCH"
            : "MARKET_OBSERVED_RESEARCH_ONLY",
    buyRouteAvailable,
    sellRouteAvailable,
    buyQuoteVerified: buyRouteAvailable,
    sellQuoteVerified: sellRouteAvailable,
    routeTruthStatus: executionProofState,
    exactIdentityVerified: chainVerified && contractVerified && poolVerified,
    chainVerified,
    contractVerified,
    poolVerified,
    quoteVerified,
    safetyVerified,
    honeypotEvidence: project.honeypotDetected === true || num(project.honeypotRiskScore) >= 85 ? "DETECTED" : null,
    transferTaxEvidence: project.transferTaxEvidence || project.taxEvidence || null,
    quoteFreshnessSeconds: quoteAge,
    supportingSources: [...new Set(supportingSources)],
    failureReasons,
  };

  const moneyMissingEvidence = [];
  if (!buyRouteAvailable) moneyMissingEvidence.push("buy route");
  if (!sellRouteAvailable) moneyMissingEvidence.push("sell route");
  if (quoteAge === null) moneyMissingEvidence.push("fresh quote timestamp");
  if (!liquidity) moneyMissingEvidence.push("liquidity depth");
  if (!observedSlippageVerified) moneyMissingEvidence.push("live slippage quote");

  const moneyEvidence = {
    buyRoute: buyRouteAvailable ? { value: true, status: "VERIFIED" } : { value: null, status: executionStatus === "PROVIDER_UNAVAILABLE" ? "UNKNOWN" : "UNKNOWN", reason: failureReasons[0] || "Buy route not verified" },
    sellRoute: sellRouteAvailable ? { value: true, status: "VERIFIED" } : { value: null, status: executionStatus === "PROVIDER_UNAVAILABLE" ? "UNKNOWN" : "UNKNOWN", reason: failureReasons[0] || "Sell route not verified" },
    chain: chainVerified ? { value: chainOf(project), status: "VERIFIED" } : { value: chainOf(project), status: "UNKNOWN", reason: "Correct chain not verified" },
    contract: contractVerified ? { value: addressOf(project), status: "VERIFIED" } : { value: addressOf(project), status: "UNKNOWN", reason: "Verified token contract missing" },
    pool: poolVerified ? { value: pairOf(project) || routes.find((route) => route.pairAddress)?.pairAddress, status: "VERIFIED" } : { value: null, status: "UNKNOWN", reason: "Verified liquidity pool missing" },
    quoteFreshness: quoteAge === null ? { value: null, status: "UNKNOWN", reason: "Quote timestamp unavailable" } : { value: quoteAge, status: quoteAge <= 3600 ? "VERIFIED" : "STALE" },
    liquidity: liquidity ? { value: liquidity, status: liquidity >= 5_000 ? "VERIFIED" : "LOW" } : { value: null, status: "UNKNOWN", reason: "Liquidity provider unavailable or missing" },
    slippage100: !observedSlippageVerified ? { value: null, status: "UNKNOWN", reason: "Live slippage quote unavailable; heuristic estimate is not execution proof" } : { value: executionProof.estimatedSlippage100, status: executionProof.estimatedSlippage100 <= 5 ? "VERIFIED" : "HIGH" },
  };
  const executionCoverage = calculateEvidenceCoverage([
    { label: "correct chain", status: chainVerified ? "VERIFIED" : "UNKNOWN" },
    { label: "verified token contract", status: contractVerified ? "VERIFIED" : "UNKNOWN" },
    { label: "verified liquidity pool", status: poolVerified ? "VERIFIED" : "UNKNOWN" },
    { label: "verified quote", status: quoteVerified ? "VERIFIED" : "UNKNOWN" },
    { label: "tradable buy route", status: buyRouteAvailable ? "VERIFIED" : "UNKNOWN" },
    { label: "tradable sell route", status: sellRouteAvailable ? "VERIFIED" : "UNKNOWN" },
    { label: "non-blocked safety", status: safetyVerified ? "VERIFIED" : "FAILED" },
    numericMetric({
      label: "liquidity depth",
      value: liquidity,
      source: "execution-proof",
      timestamp: new Date().toISOString(),
      confidence: liquidity >= 5_000 ? 85 : liquidity > 0 ? 45 : 0,
      freshness: quoteAge === null ? "UNKNOWN" : quoteAge <= 3600 ? "FRESH" : "STALE",
      provenance: "executionProof.liquidityUsd",
      status: liquidity >= 5_000 ? "VERIFIED" : liquidity > 0 ? "PARTIAL" : "UNKNOWN",
    }),
  ]);

  const moneyConfidence = Math.round(
    clamp(
    (buyRouteAvailable ? 20 : 0) +
        (sellRouteAvailable ? 20 : 0) +
        (liquidity >= 5_000 ? 20 : liquidity > 0 ? 8 : 0) +
        (quoteAge !== null ? 15 : 0) +
        (observedSlippageVerified ? 15 : 0) +
        Math.min(10, executionProof.supportingSources.length * 5)
    )
  );
  const moneyScore = ["HONEYPOT_RISK", "CONTRACT_MISMATCH", "CHAIN_MISMATCH"].includes(executionStatus)
    ? 0
    : Math.round(
        clamp(
          (buyRouteAvailable ? 20 : 0) +
            (sellRouteAvailable ? 20 : 0) +
            (liquidity >= 250_000 ? 25 : liquidity >= 100_000 ? 20 : liquidity >= 25_000 ? 15 : liquidity >= 5_000 ? 10 : liquidity > 0 ? 4 : 6) +
            (!observedSlippageVerified ? 0 : executionProof.estimatedSlippage100 <= 1 ? 18 : executionProof.estimatedSlippage100 <= 3 ? 14 : executionProof.estimatedSlippage100 <= 5 ? 9 : 2) +
            (quoteAge === null ? 5 : quoteAge <= 3600 ? 12 : 4)
        )
      );

  return {
    ...project,
    executionProof,
    executionStatus,
    executionProofState,
    liveExecutionReady: executionProofState === "LIVE_EXECUTION_READY",
    executionProofVerified: executionStatus === "VERIFIED",
    executionProofPartiallyVerified: executionStatus === "PARTIALLY_VERIFIED",
    executionProviderUnavailable: executionStatus === "PROVIDER_UNAVAILABLE",
    executionRouteAvailable: executionProofState === "LIVE_EXECUTION_READY",
    purchaseRouteConfirmed: buyRouteAvailable,
    moneyScore,
    moneyConfidence,
    moneyStatus: moneyStatusFor(executionStatus),
    moneyEvidence,
    moneyMissingEvidence,
    executionEvidenceCoveragePercent: executionCoverage.evidenceCoveragePercent,
    executionEvidenceCoverage: executionCoverage,
  };
}

export function executionProofStageMetadata(projects = []) {
  const safe = Array.isArray(projects) ? projects : [];
  const analyzed = safe.filter((project) => project.executionProof);
  return {
    stageStatus: safe.length === 0 ? "SKIPPED" : analyzed.length === safe.length ? "COMPLETE" : analyzed.length ? "PARTIAL" : "FAILED",
    attemptedCandidates: safe.length,
    verifiedCandidates: safe.filter((project) => project.executionStatus === "VERIFIED").length,
    partiallyVerifiedCandidates: safe.filter((project) => project.executionStatus === "PARTIALLY_VERIFIED").length,
    providerUnavailableCandidates: safe.filter((project) => project.executionStatus === "PROVIDER_UNAVAILABLE").length,
    failedCandidates: safe.filter((project) => ["HONEYPOT_RISK", "CONTRACT_MISMATCH", "CHAIN_MISMATCH"].includes(project.executionStatus)).length,
    errors: safe.flatMap((project) => project.executionProof?.failureReasons || []).slice(0, 50),
  };
}

export function analyzeExecutionProofBatch(projects = [], options = {}) {
  const analyzed = (Array.isArray(projects) ? projects : []).map((project) => analyzeExecutionProof(project, options));
  const stage = executionProofStageMetadata(analyzed);
  return analyzed.map((project) => ({
    ...project,
    executionProofStage: stage,
  }));
}
