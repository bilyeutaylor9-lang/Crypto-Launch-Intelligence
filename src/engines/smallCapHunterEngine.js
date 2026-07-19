const DEFAULT_TARGET_COUNT = Number(process.env.SMALL_CAP_TARGET_COUNT || 2);
const DEFAULT_BUDGET_USD = Number(process.env.SMALL_CAP_PAPER_BUDGET_USD || 100);
const DEFAULT_MAX_CAP = Number(process.env.SMALL_CAP_MAX_MARKET_CAP || 300_000_000);
const DEFAULT_MIN_LIQUIDITY = Number(process.env.SMALL_CAP_MIN_LIQUIDITY || 5_000);
const DEFAULT_REQUIRE_PURCHASE_ROUTE = process.env.SMALL_CAP_REQUIRE_PURCHASE_ROUTE !== "false";

const METAMASK_COMPATIBLE_CHAINS = new Set([
  "ethereum",
  "eth",
  "base",
  "arbitrum",
  "arbitrum-one",
  "optimism",
  "op",
  "polygon",
  "matic",
  "bsc",
  "bnb",
  "binance-smart-chain",
  "avalanche",
  "avax",
  "fantom",
  "ftm",
  "celo",
  "linea",
  "zksync",
  "zk-sync",
  "scroll",
  "blast",
  "mantle",
  "mode",
]);

const DEX_ROUTE_SOURCES = new Set([
  "dexscreener",
  "dexscreener-search",
  "dexscreener-profiles",
  "dexscreener-boosts",
  "geckoterminal",
  "birdeye",
]);

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function average(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (!active.length) return 0;
  return Math.round(active.reduce((sum, value) => sum + value, 0) / active.length);
}

function marketCap(project = {}) {
  return num(project.marketCap || project.circulatingMarketCap || project.circulatingMarketCapUsd || project.marketData?.marketCap || project.rawCandidate?.marketCap);
}

function liquidity(project = {}) {
  return num(project.canonicalExecutionRoute?.liquidityUsd || project.executionProof?.liquidityUsd || project.liquidityUsd || project.liquidity || project.marketData?.liquidityUsd || project.rawCandidate?.liquidityUsd);
}

function volume24h(project = {}) {
  return num(project.canonicalExecutionRoute?.volume24hUsd || project.executionProof?.volume24hUsd || project.volume24h || project.volume || project.marketData?.volume24h || project.rawCandidate?.volume24h);
}

function norm(value = "") {
  return String(value || "").trim().toLowerCase();
}

function textBlob(project = {}) {
  return [
    project.source,
    project.exchange,
    project.listingExchange,
    project.cex,
    project.dex,
    project.url,
    project.description,
    project.category,
    ...(project.discoverySources || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isCoinbaseRoute(project = {}) {
  const text = textBlob(project);
  const listingText = [
    project.exchange,
    project.listingExchange,
    project.cex,
    project.source,
    project.url,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    norm(project.source) === "coinbase" ||
    norm(project.exchange).includes("coinbase") ||
    norm(project.chain) === "coinbase" ||
    text.includes("coinbase listed") ||
    listingText.includes("coinbase.com") ||
    listingText.includes("coinbase exchange") ||
    listingText.includes("coinbase listing")
  );
}

function isMetaMaskCompatibleChain(chain = "") {
  return METAMASK_COMPATIBLE_CHAINS.has(norm(chain));
}

function isDexRoute(project = {}) {
  const sources = new Set(
    [project.source, project.dex, ...(project.discoverySources || [])]
      .map(norm)
      .filter(Boolean)
  );

  return (
    [...sources].some((source) => DEX_ROUTE_SOURCES.has(source)) ||
    norm(project.dex).includes("swap") ||
    norm(project.url).includes("dexscreener.com") ||
    norm(project.url).includes("geckoterminal.com")
  );
}

function purchaseRoute(project = {}) {
  const canonical = project.canonicalExecutionRoute;
  if (canonical) {
    const verified = canonical.status === "VERIFIED";
    const partial = canonical.status === "PARTIALLY_VERIFIED";
    const detected = ["VERIFIED", "PARTIALLY_VERIFIED", "DETECTED"].includes(canonical.status);
    return {
      status: canonical.status,
      purchasable: verified || partial,
      preferredRoute: canonical.venue || "Unknown",
      score: canonical.confidence || (verified ? 88 : partial ? 64 : detected ? 40 : 0),
      buyRouteAvailable: Boolean(canonical.buyRouteAvailable),
      sellRouteAvailable: Boolean(canonical.sellRouteAvailable),
      routeType: canonical.routeType,
      chain: canonical.chain,
      contract: canonical.contractAddress,
      pairAddress: canonical.pairAddress,
      liquidityUsd: canonical.liquidityUsd,
      volume24hUsd: canonical.volume24hUsd,
      routes: [
        {
          type: canonical.venue || "Unknown",
          status: canonical.status,
          confidence: canonical.confidence,
          routeType: canonical.routeType,
          chain: canonical.chain,
          contract: canonical.contractAddress,
          pairAddress: canonical.pairAddress,
          url: canonical.routeUrl,
        },
      ],
      mustVerify: canonical.missingEvidence?.length
        ? canonical.missingEvidence.map((item) => `Verify ${item}.`)
        : [
            "Confirm the route, contract, pair, slippage, liquidity, fees, taxes, and sell path before any real trade.",
          ],
    };
  }

  const coinbase = isCoinbaseRoute(project);
  const chainSupported = isMetaMaskCompatibleChain(project.chain);
  const hasContract = Boolean(project.address || project.tokenAddress || project.contractAddress);
  const hasPair = Boolean(project.pairAddress);
  const dexRoute = isDexRoute(project);
  const metamask = chainSupported && (hasContract || (dexRoute && hasPair));
  const routes = [];

  if (coinbase) {
    routes.push({
      type: "Coinbase",
      status: "Detected",
      confidence: 72,
      reason: "Coinbase listing or Coinbase market source detected.",
      url: project.url || "",
    });
  }

  if (metamask) {
    routes.push({
      type: "MetaMask",
      status: hasContract ? "Detected" : "Needs Pair Verification",
      confidence: hasContract ? 70 : 54,
      reason: hasContract
        ? "Wallet-compatible chain and token contract detected."
        : "Wallet-compatible chain and DEX pair detected, but token contract still needs manual verification.",
      chain: project.chain || "unknown",
      contract: project.address || project.tokenAddress || project.contractAddress || "",
      pairAddress: project.pairAddress || "",
      url: project.url || "",
    });
  }

  const best = routes.sort((a, b) => num(b.confidence) - num(a.confidence))[0] || null;

  return {
    status: routes.length ? "Available Route Detected" : "No Coinbase/MetaMask Route Detected",
    purchasable: routes.length > 0,
    preferredRoute: best?.type || "Unavailable",
    score: routes.length ? Math.max(...routes.map((route) => num(route.confidence))) : 0,
    routes,
    mustVerify: routes.length
      ? [
          "Confirm the asset is available in your Coinbase region or inside MetaMask before any real trade.",
          "Verify exact token contract, network, pair, slippage, fees, taxes, and wallet support.",
        ]
      : [
          "No Coinbase listing or MetaMask-compatible route was detected from current free-source data.",
          "Do not promote without a verified Coinbase market or wallet-compatible contract/pair route.",
        ],
  };
}

function maxRisk(project = {}) {
  return Math.max(
    num(project.trapRiskScore),
    num(project.riskScore),
    num(project.sellPressureScore),
    num(project.externalRiskScore),
    num(project.tokenUnlockRiskScore),
    num(project.vestingPressureScore),
    num(project.falsePositiveSimilarity),
    num(project.xBotRiskScore)
  );
}

function capBand(cap = 0, maxCap = DEFAULT_MAX_CAP) {
  if (!cap) return { label: "Unknown Cap", score: 46, eligible: true };
  if (cap < 100_000) return { label: "Ultra Micro / Fragile", score: 42, eligible: true };
  if (cap <= 25_000_000) return { label: "Micro Cap", score: 96, eligible: true };
  if (cap <= 100_000_000) return { label: "Small Cap", score: 88, eligible: true };
  if (cap <= maxCap) return { label: "Upper Small Cap", score: 70, eligible: true };
  return { label: "Too Large For Small-Cap Hunt", score: 15, eligible: false };
}

function liquidityImpactPct(liquidityUsd = 0, budgetUsd = DEFAULT_BUDGET_USD) {
  if (!liquidityUsd) return null;
  return Number(((budgetUsd / liquidityUsd) * 100).toFixed(3));
}

function executionScore(project = {}, budgetUsd = DEFAULT_BUDGET_USD, minLiquidity = DEFAULT_MIN_LIQUIDITY) {
  const liq = liquidity(project);
  const volume = volume24h(project);
  const impact = liquidityImpactPct(liq, budgetUsd);
  const liquidityScore =
    liq >= 500_000 ? 95 :
    liq >= 100_000 ? 84 :
    liq >= 50_000 ? 74 :
    liq >= 20_000 ? 62 :
    liq >= minLiquidity ? 42 :
    liq > 0 ? 18 :
    36;
  const volumeScore =
    volume >= 1_000_000 ? 90 :
    volume >= 250_000 ? 78 :
    volume >= 50_000 ? 64 :
    volume >= 10_000 ? 46 :
    volume > 0 ? 24 :
    35;
  const impactScore =
    impact === null ? 42 :
    impact <= 0.03 ? 95 :
    impact <= 0.1 ? 84 :
    impact <= 0.25 ? 68 :
    impact <= 0.75 ? 46 :
    impact <= 2 ? 28 :
    12;

  return {
    score: average([liquidityScore, volumeScore, impactScore]),
    liquidityUsd: liq,
    volume24h: volume,
    estimatedLiquidityImpactPct: impact,
    warning:
      impact === null
        ? "Liquidity unknown; verify tradability before any real order."
        : impact > 0.75
        ? "$100 would be large relative to visible liquidity; slippage risk is high."
        : "Visible liquidity can likely absorb a small paper-sized order, subject to manual verification.",
  };
}

function routeStatus(project = {}, metrics = {}) {
  const status = project.canonicalExecutionRoute?.status || metrics.purchaseRoute?.status || "NO_ROUTE";
  if (/no .*route/i.test(status)) return "NO_ROUTE";
  if (/available|detected/i.test(status)) return "DETECTED";
  return status;
}

function executionReady(project = {}, metrics = {}, minLiquidity = DEFAULT_MIN_LIQUIDITY) {
  const route = project.canonicalExecutionRoute;
  const proof = project.executionProof || {};
  return Boolean(
    route?.status === "VERIFIED" &&
      route.buyRouteAvailable === true &&
      route.sellRouteAvailable === true &&
      route.contractAddress &&
      (route.pairAddress || route.routeType === "CEX") &&
      num(route.liquidityUsd || proof.liquidityUsd) >= minLiquidity &&
      ["VERIFIED", "PARTIALLY_VERIFIED"].includes(project.executionStatus || proof.executionStatus || "UNKNOWN") &&
      metrics.risk < 78 &&
      project.honeypotDetected !== true &&
      project.verifiedScam !== true
  );
}

function hardBlocked(project = {}, metrics = {}) {
  return Boolean(
    metrics.risk >= 78 ||
      !metrics.band?.eligible ||
      project.redTeamReview?.status === "Block" ||
      project.verifiedScam === true ||
      project.honeypotDetected === true ||
      ["CRITICAL", "RESTRICTED"].includes(project.instantSafetyStatus)
  );
}

function missingEvidence(project = {}, metrics = {}) {
  const route = project.canonicalExecutionRoute || {};
  return [
    ...(metrics.cap ? [] : ["market cap/FDV proof"]),
    ...(route.status === "VERIFIED" ? [] : ["verified buy and sell route"]),
    ...(route.contractAddress || project.contractAddress || project.tokenAddress || project.address ? [] : ["verified token contract"]),
    ...(route.pairAddress || route.routeType === "CEX" || project.pairAddress || project.poolAddress ? [] : ["verified pool/pair"]),
    ...(metrics.execution?.liquidityUsd >= DEFAULT_MIN_LIQUIDITY ? [] : ["minimum DEX liquidity"]),
    ...(metrics.structure >= 45 ? [] : ["source/GitHub/roadmap proof"]),
  ];
}

function blockers(project = {}, metrics = {}) {
  const output = [];
  if (metrics.risk >= 78) output.push("Risk stack is too high.");
  if (!metrics.band?.eligible) output.push("Market cap is outside the configured small-cap range.");
  if (project.redTeamReview?.status === "Block") output.push("Red-team block is active.");
  if (project.verifiedScam || project.honeypotDetected) output.push("Scam or honeypot evidence is active.");
  if (["CRITICAL", "RESTRICTED"].includes(project.instantSafetyStatus)) output.push(`Instant safety gate is ${project.instantSafetyStatus}.`);
  return output;
}

function structureScore(project = {}) {
  return average([
    project.sourceTruthScore,
    project.proofScore,
    project.evidenceQualityScore,
    project.dataConfidenceScore,
    project.githubProScore || project.githubScore,
    project.roadmapProfitabilityScore,
    project.alphaKnowledgeGraphScore,
    project.alphaKnowledgeGraph?.moduleScores?.sourceCoverage,
    project.alphaKnowledgeGraph?.moduleScores?.relationStrength,
  ]);
}

function upsideScore(project = {}) {
  return average([
    project.prePump?.score,
    project.prePumpPatternScore,
    project.narrativeHeatScore,
    project.narrativeForecastScore,
    project.liveCatalystRadarScore,
    project.catalystCalendarScore,
    project.breakoutBrainScore,
    project.breakoutProbabilitySoon,
    project.earlyBreakoutScore,
    project.momentumShiftScore,
    project.causalMarketTwinUpsideProbability,
    project.exchangeProbabilityScore,
  ]);
}

function consensusScore(project = {}) {
  return average([
    project.aiEcosystemScore,
    project.autonomousAlphaOSScore,
    project.selfEvolvingAlphaOSScore,
    project.highTechAlphaScore,
    project.alphaEvolutionGovernorScore,
    project.causalMarketTwinScore,
    project.confidenceAdjustedScore,
  ]);
}

function preHitPressureScore(project = {}) {
  const smartMoney = average([
    project.smartWalletArrivalScore,
    project.smartWalletScore,
    project.smartWalletPerformanceScore,
    project.smartMoneyAccumulationScore,
    project.smartMoneyRotationScore,
    project.whaleActivityScore,
    project.buyPressureScore,
    project.capitalFlowScore,
  ]);
  const earlyTiming = average([
    project.prePump?.score,
    project.prePumpPatternScore,
    project.earlyBreakoutScore,
    project.breakoutBrainScore,
    project.breakoutProbabilitySoon,
    project.momentumCompressionScore,
    project.momentumShiftScore,
    project.volatilityExpansionScore,
    project.liquidityExpansionScore,
    project.opportunityTimingScore,
  ]);
  const catalystPressure = average([
    project.liveCatalystRadarScore,
    project.catalystCalendarScore,
    project.catalystScore,
    project.roadmapProfitabilityScore,
    project.exchangeProbabilityScore,
    project.narrativeForecastScore,
    project.narrativeHeatScore,
    project.socialAccelerationScore,
    project.communityGrowthScore,
  ]);
  const demandQuality = average([
    project.organicBuyerScore,
    project.organicBuyerClassifierScore,
    project.organicDemandIntegrityScore,
    project.buyerRetentionScore,
    project.activeLiquidityTruthScore,
    project.sourceTruthScore,
    project.sourceReliabilityScore,
  ]);
  const identityConfidence = average([
    project.projectIdentityScore,
    project.identityConfidence,
    project.finalIdentityScore,
    project.evidenceQualityScore,
    project.dataConfidenceScore,
  ]);
  const trapPenalty = Math.max(
    num(project.trapRiskScore),
    num(project.washTradingScore),
    num(project.bundledLaunchScore),
    num(project.sellPressureScore),
    num(project.distressedMicrocapTrapScore),
    project.distressedTrapBlock ? 90 : 0
  );
  const score = Math.round(
    clamp(
      smartMoney * 0.24 +
        earlyTiming * 0.24 +
        catalystPressure * 0.2 +
        demandQuality * 0.18 +
        identityConfidence * 0.14 -
        trapPenalty * 0.18
    )
  );

  return {
    score,
    smartMoney,
    earlyTiming,
    catalystPressure,
    demandQuality,
    identityConfidence,
    trapPenalty,
    verdict:
      score >= 72 && trapPenalty < 45
        ? "Pre-Hit Pressure"
        : score >= 58 && trapPenalty < 60
        ? "Building Pressure"
        : trapPenalty >= 70
        ? "Trap Pressure"
        : "Weak Pressure",
  };
}

function smallCapScore(project = {}, options = {}) {
  const budgetUsd = num(options.budgetUsd || DEFAULT_BUDGET_USD);
  const minLiquidity = num(options.minLiquidity || DEFAULT_MIN_LIQUIDITY);
  const cap = marketCap(project);
  const band = capBand(cap, num(options.maxMarketCap || DEFAULT_MAX_CAP));
  const execution = executionScore(project, budgetUsd, minLiquidity);
  const route = purchaseRoute(project);
  const structure = structureScore(project);
  const upside = upsideScore(project);
  const consensus = consensusScore(project);
  const preHit = preHitPressureScore(project);
  const risk = maxRisk(project);
  const riskIntegrity = clamp(100 - risk);
  const score = Math.round(
    clamp(
      band.score * 0.1 +
        execution.score * 0.12 +
        route.score * 0.1 +
        structure * 0.16 +
        upside * 0.17 +
        consensus * 0.1 +
        preHit.score * 0.18 +
        riskIntegrity * 0.07
    )
  );

  return {
    score,
    cap,
    band,
    execution,
    purchaseRoute: route,
    structure,
    upside,
    consensus,
    preHit,
    risk,
    riskIntegrity,
    routeStatus: routeStatus(project, { purchaseRoute: route }),
    missingEvidence: missingEvidence(project, { cap, band, execution, purchaseRoute: route, structure, risk }),
    blockers: blockers(project, { cap, band, execution, purchaseRoute: route, structure, risk }),
    hardBlocked: hardBlocked(project, { cap, band, execution, purchaseRoute: route, structure, risk }),
    executionReady: executionReady(project, { cap, band, execution, purchaseRoute: route, structure, risk }, minLiquidity),
  };
}

function verdictFor(metrics = {}, options = {}) {
  const minLiquidity = num(options.minLiquidity || DEFAULT_MIN_LIQUIDITY);
  const requirePurchaseRoute = options.requirePurchaseRoute ?? DEFAULT_REQUIRE_PURCHASE_ROUTE;

  if (metrics.risk >= 78) return "Small-Cap Risk Block";
  if (!metrics.band.eligible) return "Too Large For Small-Cap Hunt";
  if (requirePurchaseRoute && !metrics.purchaseRoute.purchasable) return "Small-Cap Research Candidate - Route Unverified";
  if (metrics.execution.liquidityUsd > 0 && metrics.execution.liquidityUsd < minLiquidity) {
    return "Small-Cap Liquidity Block";
  }
  if (metrics.score >= 68 && metrics.structure >= 45 && metrics.execution.score >= 40) {
    return "Small-Cap Research Candidate";
  }
  if (metrics.score >= 52) return "Small-Cap Watch";
  return "Small-Cap Thin Data";
}

function reasons(project = {}, metrics = {}) {
  const output = [];

  output.push(
    metrics.cap
      ? `${metrics.band.label} at about $${Math.round(metrics.cap).toLocaleString()} market cap/FDV.`
      : "Market cap/FDV is unknown, so this needs cap proof before real-world action."
  );
  if (metrics.upside >= 55) output.push("Upside stack has narrative, catalyst, pre-pump, or breakout support.");
  if (metrics.structure >= 55) output.push("Structure stack has usable source, proof, GitHub, graph, or roadmap confirmation.");
  if (metrics.consensus >= 55) output.push("AI/OS/governor consensus is stronger than the scan baseline.");
  if (metrics.preHit?.score >= 58) output.push(`${metrics.preHit.verdict}: smart money, catalyst, timing, and organic-demand pressure are lining up.`);
  if (metrics.execution.score >= 55) output.push("$100 paper-size execution looks structurally reasonable from visible liquidity/volume.");
  if (metrics.purchaseRoute.purchasable) output.push(`${metrics.purchaseRoute.preferredRoute} purchase route detected; verify availability before acting.`);
  if (project.alphaEvolutionGovernorVerdict === "Governor Priority Research") output.push("Alpha Governor marked it as priority research.");
  if (project.breakoutBrainSelected) output.push("Breakout Brain selected it as a best-available breakout setup.");

  return output.slice(0, 7);
}

function warnings(project = {}, metrics = {}) {
  const output = [
    "Research only; not financial advice or a buy recommendation.",
    metrics.execution.warning,
  ];

  if (!metrics.cap) output.push("Market cap/FDV is unknown; verify cap before treating it as a true small cap.");
  if (!metrics.purchaseRoute.purchasable) output.push("No Coinbase or MetaMask route was detected; do not select without route proof.");
  if (metrics.risk >= 55) output.push("Risk stack is elevated; review trap, unlock, sell pressure, and false-positive signals.");
  if (metrics.preHit?.trapPenalty >= 60) output.push("Pre-hit pressure is contaminated by trap, wash, bundled-launch, or sell-pressure signals.");
  if (metrics.preHit?.identityConfidence < 35) output.push("Identity confidence is weak; symbol/name collision checks need manual verification.");
  if (metrics.structure < 45) output.push("Structure is not strong enough without more source/GitHub/roadmap proof.");
  if (project.aiDisagreement?.level === "High") output.push("AI council disagreement is high; require manual confirmation.");
  if (project.redTeamReview?.status === "Block") output.push("Red-team block is active; do not promote without resolving it.");

  return [...new Set(output)].slice(0, 8);
}

function paperPlan(project = {}, metrics = {}, options = {}) {
  const budgetUsd = num(options.budgetUsd || DEFAULT_BUDGET_USD);
  const perCandidateUsd = Number((budgetUsd / Math.max(1, num(options.targetCount || DEFAULT_TARGET_COUNT))).toFixed(2));

  return {
    label: "$100 Paper Plan",
    mode: "Paper research plan only",
    totalPaperBudgetUsd: budgetUsd,
    maxPaperBudgetForThisCandidateUsd: perCandidateUsd,
    starterTrancheUsd: Number((perCandidateUsd * 0.4).toFixed(2)),
    confirmationTrancheUsd: Number((perCandidateUsd * 0.35).toFixed(2)),
    finalValidationTrancheUsd: Number((perCandidateUsd * 0.25).toFixed(2)),
    estimatedLiquidityImpactPct: metrics.execution.estimatedLiquidityImpactPct,
    confirmationTriggers: [
      "Verify official contract/pair and source identity.",
      "Confirm visible liquidity and expected slippage manually.",
      "Confirm roadmap/catalyst and GitHub/source proof are real.",
      "Reject if trap risk, sell pressure, unlock risk, or red-team block rises.",
    ],
    note: "This is a research simulation for a small account size, not a recommendation to buy.",
  };
}

export function analyzeSmallCapHunter(project = {}, options = {}) {
  const metrics = smallCapScore(project, options);
  const verdict = verdictFor(metrics, options);

  return {
    ...project,
    smallCapHunterScore: metrics.score,
    smallCapHunterVerdict: verdict,
    smallCapMarketCap: metrics.cap,
    smallCapBand: metrics.band.label,
    smallCapStructureScore: metrics.structure,
    smallCapUpsideScore: metrics.upside,
    smallCapPreHitPressureScore: metrics.preHit.score,
    smallCapExecutionScore: metrics.execution.score,
    smallCapRiskScore: metrics.risk,
    smallCapHunter: {
      name: "Small-Cap Hunter",
      score: metrics.score,
      verdict,
      marketCap: metrics.cap,
      capBand: metrics.band,
      moduleScores: {
        capFit: metrics.band.score,
        execution: metrics.execution.score,
        purchaseRoute: metrics.purchaseRoute.score,
        structure: metrics.structure,
        upside: metrics.upside,
        consensus: metrics.consensus,
        preHitPressure: metrics.preHit.score,
        riskIntegrity: metrics.riskIntegrity,
      },
      preHitPressure: metrics.preHit,
      execution: metrics.execution,
      purchaseRoute: metrics.purchaseRoute,
      routeStatus: metrics.routeStatus,
      missingEvidence: metrics.missingEvidence,
      blockers: metrics.blockers,
      hardBlocked: metrics.hardBlocked,
      researchOnly: !metrics.executionReady,
      executionReady: metrics.executionReady,
      reasons: reasons(project, metrics),
      warnings: warnings(project, metrics),
      paperPlan: paperPlan(project, metrics, options),
      mustVerify: [
        "Official token contract, pair, chain, and website.",
        "Coinbase availability or MetaMask token contract/pair route.",
        "Actual liquidity depth, slippage, taxes, honeypot status, and lock status.",
        "Recent roadmap/catalyst evidence from official or trusted sources.",
        "Token unlocks, emissions, team allocation, and insider sell pressure.",
        "Whether the token is available in your jurisdiction and exchange/wallet setup.",
      ],
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Small-Cap Hunter",
        signal: verdict,
        score: metrics.score,
        confidence: metrics.structure >= 60 ? 0.7 : metrics.structure >= 45 ? 0.55 : 0.36,
        impact: verdict === "Small-Cap Research Candidate" ? "Positive" : verdict.includes("Block") ? "Negative" : "Neutral",
        reasons: [
          `Cap band: ${metrics.band.label}.`,
          `Structure ${metrics.structure}, upside ${metrics.upside}, pre-hit pressure ${metrics.preHit.score}, execution ${metrics.execution.score}, risk ${metrics.risk}.`,
          metrics.execution.warning,
        ],
      },
    ],
  };
}

function eligibleForSelection(project = {}) {
  return (
    project.smallCapHunter &&
    !["Small-Cap Risk Block", "Too Large For Small-Cap Hunt"].includes(project.smallCapHunterVerdict) &&
    !project.smallCapHunter.hardBlocked &&
    !project.smallCapHunter.blockers?.length &&
    num(project.smallCapHunterScore) > 0 &&
    project.redTeamReview?.status !== "Block"
  );
}

export function analyzeSmallCapHunterBatch(projects = [], options = {}) {
  const targetCount = Math.max(1, Math.round(num(options.targetCount || DEFAULT_TARGET_COUNT)));
  const analyzed = (Array.isArray(projects) ? projects : []).map((project) =>
    analyzeSmallCapHunter(project, {
      ...options,
      targetCount,
    })
  );
  const selectedKeys = new Map(
    analyzed
      .map((project, index) => ({
        project,
        key: `${index}:${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`,
      }))
      .filter(({ project }) => eligibleForSelection(project))
      .sort((a, b) => num(b.project.smallCapHunterScore) - num(a.project.smallCapHunterScore))
      .slice(0, targetCount)
      .map(({ key }, index) => [key, index + 1])
  );

  return analyzed.map((project, index) => {
    const key = `${index}:${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`;
    const selectionRank = selectedKeys.get(key) || null;
    const selected = Boolean(selectionRank);

    return {
      ...project,
      smallCapHunterSelected: selected,
      smallCapHunterSelectionRank: selectionRank,
      smallCapHunterVerdict: selected
        ? "Top-2 Small-Cap Research Candidate"
        : project.smallCapHunterVerdict,
      alphaTags: selected
        ? [...new Set([...(project.alphaTags || []), "Top-2 Small-Cap Research Candidate"])]
        : project.alphaTags,
      smallCapHunter: {
        ...(project.smallCapHunter || {}),
        selected,
        selectionRank,
        caveat: selected
          ? "Top-2 best-available small-cap research candidate. This is not a buy recommendation; verify manually before any real trade."
          : project.smallCapHunter?.caveat,
      },
    };
  });
}

export function summarizeSmallCapHunter(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const hunted = safeProjects.filter((project) => project.smallCapHunter);
  const selected = hunted
    .filter((project) => project.smallCapHunterSelected)
    .sort((a, b) => num(a.smallCapHunterSelectionRank) - num(b.smallCapHunterSelectionRank));
  const research = hunted
    .filter((project) => !project.smallCapHunter?.blockers?.length && !project.smallCapHunter?.hardBlocked)
    .sort((a, b) => num(b.smallCapHunterScore) - num(a.smallCapHunterScore))
    .slice(0, DEFAULT_TARGET_COUNT);
  const executionReadyProjects = hunted
    .filter((project) => project.smallCapHunter?.executionReady)
    .sort((a, b) => num(b.smallCapHunterScore) - num(a.smallCapHunterScore))
    .slice(0, DEFAULT_TARGET_COUNT);
  const topTwoResearch = research.length ? research.map((project, index) => compact(project, index + 1)) : selected.map((project, index) => compact(project, index + 1));
  const topTwoExecutionReady = executionReadyProjects.map((project, index) => compact(project, index + 1));

  return {
    generatedAt: new Date().toISOString(),
    name: "Small-Cap Hunter",
    disclaimer: "Research output only. Not financial advice, not a buy recommendation, and not a guarantee of future performance.",
    totalProjects: safeProjects.length,
    huntedProjects: hunted.length,
    targetCount: DEFAULT_TARGET_COUNT,
    selectedCount: topTwoResearch.length,
    executionReadyCount: topTwoExecutionReady.length,
    topTwoResearch,
    topTwoExecutionReady,
    topTwo: topTwoResearch,
    researchCandidates: hunted.filter((project) => project.smallCapHunterVerdict === "Top-2 Small-Cap Research Candidate").length,
    watchCount: hunted.filter((project) => project.smallCapHunterVerdict === "Small-Cap Watch").length,
    riskBlocks: hunted.filter((project) => project.smallCapHunterVerdict === "Small-Cap Risk Block").length,
    purchaseRouteBlocks: hunted.filter((project) => project.smallCapHunterVerdict === "Small-Cap Research Candidate - Route Unverified").length,
    topProjects: [...hunted]
      .sort((a, b) => num(b.smallCapHunterScore) - num(a.smallCapHunterScore))
      .slice(0, 50)
      .map((project) => compact(project)),
  };
}

function compact(project = {}, fallbackRank = null) {
  return {
    rank: project.smallCapHunterSelectionRank || fallbackRank || null,
    selectionRank: project.smallCapHunterSelectionRank || fallbackRank || null,
    selected: Boolean(project.smallCapHunterSelected),
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    score: project.smallCapHunterScore || 0,
    verdict: project.smallCapHunterVerdict || "Unknown",
    routeStatus: project.smallCapHunter?.routeStatus || project.canonicalExecutionRoute?.status || "NO_ROUTE",
    missingEvidence: project.smallCapHunter?.missingEvidence || [],
    blockers: project.smallCapHunter?.blockers || [],
    researchOnly: project.smallCapHunter?.researchOnly !== false,
    executionReady: Boolean(project.smallCapHunter?.executionReady),
    hardBlocked: Boolean(project.smallCapHunter?.hardBlocked),
    finalSelectionState: project.finalSelectionState || "UNKNOWN",
    finalSelectionQualified: Boolean(project.finalSelectionQualified),
    finalIntegrityVerdict: project.finalIntegrityVerdict || "Unknown",
    finalBlockingReasons: project.finalBlockingReasons || [],
    finalWarningReasons: project.finalWarningReasons || [],
    marketCap: project.smallCapMarketCap || 0,
    capBand: project.smallCapBand || "Unknown",
    structureScore: project.smallCapStructureScore || 0,
    upsideScore: project.smallCapUpsideScore || 0,
    executionScore: project.smallCapExecutionScore || 0,
    preHitPressureScore: project.smallCapPreHitPressureScore || 0,
    preHitPressure: project.smallCapHunter?.preHitPressure || {},
    riskScore: project.smallCapRiskScore || 0,
    purchaseRoute: project.smallCapHunter?.purchaseRoute || {},
    liquidityUsd: project.smallCapHunter?.execution?.liquidityUsd || 0,
    volume24h: project.smallCapHunter?.execution?.volume24h || 0,
    estimatedLiquidityImpactPct: project.smallCapHunter?.execution?.estimatedLiquidityImpactPct ?? null,
    paperPlan: project.smallCapHunter?.paperPlan || {},
    reasons: project.smallCapHunter?.reasons || [],
    warnings: project.smallCapHunter?.warnings || [],
    mustVerify: project.smallCapHunter?.mustVerify || [],
  };
}
