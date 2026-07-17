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
  return first([project.canonicalChain, project.finalChainId, project.chainId, project.finalChain, project.chain, project.network]) || null;
}

function pairOf(project = {}) {
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
    sources.push({
      source,
      venue: clean(venue || route.preferredRoute || route.venue || route.type || route.name || source),
      status: route.status || route.verdict || "",
      buy: route.purchasable === true || route.buyRouteAvailable === true || route.detected === true,
      sell: route.sellable === true || route.sellRouteAvailable === true || route.sellDetected === true,
      pairAddress: route.pairAddress,
      contract: route.contract || route.tokenAddress || route.address,
      quoteAsset: route.quoteAsset || route.quoteToken,
      verified: route.verified === true || route.detected === true || route.purchasable === true,
    });
  };

  add("purchase-route", project.purchaseRoute, project.purchaseRoute?.preferredRoute);
  add("small-cap-hunter", project.smallCapHunter?.purchaseRoute, project.smallCapHunter?.purchaseRoute?.preferredRoute);
  add("execution-twin", project.proofOfAlphaExecutionTwin?.route, project.proofOfAlphaExecutionTwin?.route?.preferredRoute);
  for (const route of project.purchaseRoute?.routes || []) add("purchase-route-detail", route);
  for (const route of project.smallCapHunter?.purchaseRoute?.routes || []) add("small-cap-route-detail", route);
  for (const route of project.proofOfAlphaExecutionTwin?.route?.routes || []) add("execution-twin-route-detail", route);

  const source = lower(project.source || project.dex || project.exchange);
  if (["dexscreener", "geckoterminal", "birdeye", "uniswap", "pancakeswap", "raydium", "orca"].some((name) => source.includes(name))) {
    sources.push({
      source: project.source || project.dex || "dex-market-data",
      venue: project.dex || project.source || "DEX",
      status: "Market pair observed",
      buy: Boolean(addressOf(project) && liquidityUsd(project) > 0),
      sell: Boolean(addressOf(project) && liquidityUsd(project) > 0 && project.honeypotDetected !== true),
      pairAddress: pairOf(project),
      contract: addressOf(project),
      quoteAsset: project.quoteToken || project.quoteAsset || "unknown",
      verified: Boolean(pairOf(project) || project.liquidityVerified),
    });
  }

  if (["coinbase", "binance", "kraken", "gemini", "kucoin", "okx"].some((name) => source.includes(name))) {
    sources.push({
      source: project.source || project.exchange || "cex-market-data",
      venue: project.exchange || project.source || "CEX",
      status: "Exchange market observed",
      buy: Boolean(project.symbol && priceUsd(project) > 0),
      sell: Boolean(project.symbol && priceUsd(project) > 0),
      quoteAsset: project.quoteToken || "USD",
      verified: true,
    });
  }

  return sources;
}

function providerUnavailable(project = {}, routes = []) {
  const text = lower([
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

function statusFor({ project, routes, buyRouteAvailable, sellRouteAvailable, liquidity, quoteAge, outage }) {
  if (project.honeypotDetected === true || num(project.honeypotRiskScore) >= 85 || sellRouteConfirmedUnavailable(project, routes)) return "HONEYPOT_RISK";
  if (project.chainMismatch === true || project.contractChainMismatch === true) return "CHAIN_MISMATCH";
  if (project.canonicalIdentityHardBlock === true || project.identityStatus === "CONTRACT_CONFLICT") return "CONTRACT_MISMATCH";
  if (buyRouteAvailable && sellRouteAvailable && liquidity >= 5_000 && quoteAge !== null && quoteAge > 21_600) return "STALE_QUOTE";
  if (buyRouteAvailable && sellRouteAvailable && liquidity >= 5_000) return "VERIFIED";
  if ((buyRouteAvailable || sellRouteAvailable || routes.some((route) => route.verified)) && liquidity > 0) return "PARTIALLY_VERIFIED";
  if (liquidity > 0 && liquidity < 1_000) return "INSUFFICIENT_LIQUIDITY";
  if (outage) return "PROVIDER_UNAVAILABLE";
  if (routes.length && !buyRouteAvailable && !sellRouteAvailable) return "NO_ROUTE";
  return "UNKNOWN";
}

function moneyStatusFor(status = "") {
  if (["VERIFIED", "PARTIALLY_VERIFIED"].includes(status)) return status;
  if (["PROVIDER_UNAVAILABLE", "UNKNOWN", "STALE_QUOTE", "NO_ROUTE"].includes(status)) return "UNKNOWN";
  return "VERIFIED_NEGATIVE";
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
    project.executionSlippagePct,
    project.proofOfAlphaExecutionTwinSlippagePct,
    project.proofOfAlphaExecutionTwin?.quote?.estimatedSlippagePct,
    project.smallCapHunter?.execution?.slippagePct,
  ]);
  const executionStatus = statusFor({
    project,
    routes,
    buyRouteAvailable,
    sellRouteAvailable,
    liquidity,
    quoteAge,
    outage,
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
    estimatedSlippage100: slippageFor(liquidity, 100, observedSlippage),
    estimatedSlippage500: slippageFor(liquidity, 500, null),
    estimatedSlippage1000: slippageFor(liquidity, 1000, null),
    buyRouteAvailable,
    sellRouteAvailable,
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
  if (executionProof.estimatedSlippage100 === null) moneyMissingEvidence.push("slippage estimate");

  const moneyEvidence = {
    buyRoute: buyRouteAvailable ? { value: true, status: "VERIFIED" } : { value: null, status: executionStatus === "PROVIDER_UNAVAILABLE" ? "UNKNOWN" : "UNKNOWN", reason: failureReasons[0] || "Buy route not verified" },
    sellRoute: sellRouteAvailable ? { value: true, status: "VERIFIED" } : { value: null, status: executionStatus === "PROVIDER_UNAVAILABLE" ? "UNKNOWN" : "UNKNOWN", reason: failureReasons[0] || "Sell route not verified" },
    quoteFreshness: quoteAge === null ? { value: null, status: "UNKNOWN", reason: "Quote timestamp unavailable" } : { value: quoteAge, status: quoteAge <= 3600 ? "VERIFIED" : "STALE" },
    liquidity: liquidity ? { value: liquidity, status: liquidity >= 5_000 ? "VERIFIED" : "LOW" } : { value: null, status: "UNKNOWN", reason: "Liquidity provider unavailable or missing" },
    slippage100: executionProof.estimatedSlippage100 === null ? { value: null, status: "UNKNOWN", reason: "Slippage quote unavailable" } : { value: executionProof.estimatedSlippage100, status: executionProof.estimatedSlippage100 <= 5 ? "VERIFIED" : "HIGH" },
  };

  const moneyConfidence = Math.round(
    clamp(
      (buyRouteAvailable ? 20 : 0) +
        (sellRouteAvailable ? 20 : 0) +
        (liquidity >= 5_000 ? 20 : liquidity > 0 ? 8 : 0) +
        (quoteAge !== null ? 15 : 0) +
        (executionProof.estimatedSlippage100 !== null ? 15 : 0) +
        Math.min(10, executionProof.supportingSources.length * 5)
    )
  );
  const moneyScore = ["HONEYPOT_RISK", "CONTRACT_MISMATCH", "CHAIN_MISMATCH"].includes(executionStatus)
    ? 0
    : Math.round(
        clamp(
          (buyRouteAvailable ? 20 : 8) +
            (sellRouteAvailable ? 20 : 6) +
            (liquidity >= 250_000 ? 25 : liquidity >= 100_000 ? 20 : liquidity >= 25_000 ? 15 : liquidity >= 5_000 ? 10 : liquidity > 0 ? 4 : 6) +
            (executionProof.estimatedSlippage100 === null ? 6 : executionProof.estimatedSlippage100 <= 1 ? 18 : executionProof.estimatedSlippage100 <= 3 ? 14 : executionProof.estimatedSlippage100 <= 5 ? 9 : 2) +
            (quoteAge === null ? 5 : quoteAge <= 3600 ? 12 : 4)
        )
      );

  return {
    ...project,
    executionProof,
    executionStatus,
    executionProofVerified: executionStatus === "VERIFIED",
    executionProofPartiallyVerified: executionStatus === "PARTIALLY_VERIFIED",
    executionProviderUnavailable: executionStatus === "PROVIDER_UNAVAILABLE",
    executionRouteAvailable: executionStatus === "VERIFIED" || executionStatus === "PARTIALLY_VERIFIED" ? true : project.executionRouteAvailable,
    purchaseRouteConfirmed: buyRouteAvailable || project.purchaseRouteConfirmed === true,
    moneyScore,
    moneyConfidence,
    moneyStatus: moneyStatusFor(executionStatus),
    moneyEvidence,
    moneyMissingEvidence,
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
