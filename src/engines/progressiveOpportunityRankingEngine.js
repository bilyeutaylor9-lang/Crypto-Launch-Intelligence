import fs from "fs";
import path from "path";

const TIERS = {
  SNIPER_READY: "SNIPER_READY",
  EARLY_HIGH_CONVICTION: "EARLY_HIGH_CONVICTION",
  EMERGING_RADAR: "EMERGING_RADAR",
  SPECULATIVE_SIGNAL: "SPECULATIVE_SIGNAL",
  MONITOR_ONLY: "MONITOR_ONLY",
  BLOCKED: "BLOCKED",
};

const TIER_LIMITS = {
  SNIPER_READY: 5,
  EARLY_HIGH_CONVICTION: 10,
  EMERGING_RADAR: 20,
  SPECULATIVE_SIGNAL: 20,
};

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

function textIncludesAny(value = "", terms = []) {
  const text = lower(value);
  return terms.some((term) => text.includes(lower(term)));
}

function firstValue(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function booleanTrue(value) {
  return value === true || ["true", "verified", "confirmed", "pass", "resolved"].includes(lower(value));
}

function inverseRiskScore(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return 100 - clamp(value);
}

function hasContract(project = {}) {
  return Boolean(
    firstValue([
      project.contractAddress,
      project.tokenAddress,
      project.address,
      project.baseToken?.address,
      project.finalContractAddress,
      project.rawCandidate?.contractAddress,
      project.rawCandidate?.tokenAddress,
      project.rawCandidate?.address,
    ])
  );
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

function sourceCount(project = {}) {
  const sourceSet = new Set(
    [
      project.source,
      project.dex,
      project.exchange,
      ...(Array.isArray(project.sources) ? project.sources : []),
      ...(Array.isArray(project.discoverySources) ? project.discoverySources : []),
      ...(Array.isArray(project.evidence) ? project.evidence.map((item) => item.source) : []),
      ...(project.institutionalDataProvenance?.sourceSummary?.sources || []),
    ]
      .map(lower)
      .filter(Boolean)
  );

  return Math.max(
    sourceSet.size,
    num(project.institutionalDataSourceCount),
    num(project.institutionalDataProvenance?.sourceSummary?.sourceCount),
    num(project.sourceTruth?.sourceCount),
    num(project.dataConfidenceBreakdown?.sourceCount)
  );
}

function routeVerified(project = {}) {
  return Boolean(
    project.purchaseRouteConfirmed === true ||
      project.executionRouteAvailable === true ||
      project.purchaseRoute?.purchasable === true ||
      project.smallCapHunter?.purchaseRoute?.purchasable === true ||
      project.proofOfAlphaExecutionTwin?.route?.detected === true ||
      project.proofOfAlphaExecutionTwinSelected === true
  );
}

function routeFailureDetected(project = {}) {
  const routeText = [
    project.purchaseRoute?.status,
    project.purchaseRouteStatus,
    project.smallCapHunter?.purchaseRoute?.status,
    project.proofOfAlphaExecutionTwin?.route?.status,
    project.proofOfAlphaExecutionTwinVerdict,
    project.executionTwinVerdict,
  ]
    .map(lower)
    .join(" ");

  return textIncludesAny(routeText, [
    "unavailable",
    "failed",
    "blocked",
    "no route",
    "no-route",
    "rejected",
    "cannot execute",
  ]);
}

function identityVerified(project = {}) {
  return Boolean(
    project.identityVerified === true ||
      project.contractVerified === true ||
      ["VERIFIED_CONTRACT", "VERIFIED_LISTING", "VERIFIED_EXCHANGE_ASSET"].includes(project.finalIdentityState) ||
      ["VERIFIED_CONTRACT", "VERIFIED_LISTING", "VERIFIED_EXCHANGE_ASSET"].includes(project.identityState) ||
      project.projectIdentityVerdict === "Identity Resolved"
  );
}

function contractSafetyVerified(project = {}) {
  if (project.contractVerified === true || project.contractSafetyVerified === true) return true;
  if (project.instantSafetyStatus === "PASS") return true;
  if (project.finalSelectionQualified === true) return true;
  return false;
}

function weightedAvailable(items = [], missingDefault = null) {
  let weighted = 0;
  let weight = 0;

  for (const item of items) {
    const raw = item.score;
    const available = raw !== undefined && raw !== null && raw !== "" && Number.isFinite(Number(raw));
    if (!available && missingDefault === null) continue;
    const score = available ? clamp(raw) : clamp(missingDefault);
    weighted += score * item.weight;
    weight += item.weight;
  }

  return weight > 0 ? Math.round(clamp(weighted / weight)) : 0;
}

function quoteAgeSeconds(project = {}) {
  const explicit = firstValue([
    project.quoteAgeSeconds,
    project.executionQuoteAgeSeconds,
    project.proofOfAlphaExecutionTwin?.quote?.ageSeconds,
    project.proofOfAlphaExecutionTwin?.quoteAgeSeconds,
    project.smallCapHunter?.execution?.quoteAgeSeconds,
  ]);

  if (explicit !== undefined) return num(explicit);

  const timestamp = firstValue([
    project.quoteTimestamp,
    project.executionQuoteTimestamp,
    project.proofOfAlphaExecutionTwin?.quote?.timestamp,
    project.marketData?.updatedAt,
    project.updatedAt,
    project.lastUpdatedAt,
  ]);
  const parsed = timestamp ? Date.parse(timestamp) : NaN;
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 1000));
}

function quoteFreshnessScore(project = {}) {
  const age = quoteAgeSeconds(project);
  if (age === null) return routeVerified(project) ? 55 : 0;
  if (age <= 120) return 95;
  if (age <= 300) return 85;
  if (age <= 900) return 70;
  if (age <= 3600) return 50;
  if (age <= 21600) return 30;
  return 10;
}

function slippagePct(project = {}) {
  const value = firstValue([
    project.executionSlippagePct,
    project.proofOfAlphaExecutionTwinSlippagePct,
    project.proofOfAlphaExecutionTwin?.quote?.slippagePct,
    project.proofOfAlphaExecutionTwin?.quote?.estimatedSlippagePct,
    project.smallCapHunter?.execution?.slippagePct,
    project.purchaseRoute?.slippagePct,
  ]);
  return value === undefined ? null : num(value);
}

function priceImpactPct(project = {}) {
  const value = firstValue([
    project.priceImpactPct,
    project.executionPriceImpactPct,
    project.proofOfAlphaExecutionTwin?.quote?.priceImpactPct,
    project.proofOfAlphaExecutionTwin?.quote?.estimatedPriceImpactPct,
    project.smallCapHunter?.execution?.priceImpactPct,
  ]);
  return value === undefined ? null : num(value);
}

function liquidityDepthScore(project = {}) {
  const liquidity = liquidityUsd(project);
  if (liquidity >= 500_000) return 98;
  if (liquidity >= 250_000) return 94;
  if (liquidity >= 100_000) return 86;
  if (liquidity >= 25_000) return 72;
  if (liquidity >= 5_000) return 50;
  if (liquidity >= 1_000) return 34;
  if (liquidity > 0) return 16;
  return 0;
}

function slippageControlScore(project = {}) {
  const slippage = slippagePct(project);
  const impact = priceImpactPct(project);
  const observed = [slippage, impact].filter((value) => value !== null);
  if (!observed.length) return routeVerified(project) ? 55 : 0;
  const worst = Math.max(...observed);
  if (worst <= 0.5) return 96;
  if (worst <= 1.5) return 88;
  if (worst <= 3) return 76;
  if (worst <= 5) return 62;
  if (worst <= 8) return 45;
  if (worst <= 12) return 28;
  return 10;
}

function buildTradeSizeChecks(project = {}, hardBlockers = []) {
  const liquidity = liquidityUsd(project);
  const hasRoute = routeVerified(project) && !routeFailureDetected(project);
  const observedImpact = priceImpactPct(project);
  const observedSlippage = slippagePct(project);
  const sizes = [25, 100, 500, 1000];

  return sizes.map((sizeUsd) => {
    const liquidityImpactPct = liquidity > 0 ? (sizeUsd / liquidity) * 100 * 2.5 : 999;
    const estimatedImpactPct = Math.round(
      Math.max(
        liquidityImpactPct,
        observedImpact === null ? 0 : observedImpact,
        observedSlippage === null ? 0 : observedSlippage
      ) * 100
    ) / 100;
    const blockers = [];

    if (!hasRoute) blockers.push("No verified execution route.");
    if (hardBlockers.length) blockers.push("Hard safety blocker is active.");
    if (liquidity <= 0) blockers.push("No usable liquidity depth.");
    if (liquidity > 0 && liquidity < sizeUsd * 25) blockers.push("Liquidity is too thin for this paper size.");
    if (estimatedImpactPct > (sizeUsd <= 100 ? 8 : 12)) blockers.push("Estimated price impact/slippage is too high.");

    return {
      sizeUsd,
      liquidityUsd: liquidity,
      estimatedImpactPct,
      status: blockers.length ? "BLOCKED" : "PASS",
      blockers,
    };
  });
}

function executableTradeSizeUsd(checks = []) {
  return [...checks].reverse().find((check) => check.status === "PASS")?.sizeUsd || 0;
}

function executionComponents(project = {}, hardBlockers = [], tradeSizeChecks = []) {
  const hasRoute = routeVerified(project);
  const routeHealth = routeFailureDetected(project) ? 0 : hasRoute ? 92 : 8;
  const maxTradeSize = executableTradeSizeUsd(tradeSizeChecks);
  const safetyFriction = hardBlockers.length
    ? 0
    : weightedAvailable([
        { score: inverseRiskScore(project.contractRiskScore), weight: 1.0 },
        { score: inverseRiskScore(project.honeypotRiskScore), weight: 1.0 },
        { score: inverseRiskScore(project.instantSafetyRiskScore), weight: 1.0 },
        { score: inverseRiskScore(project.liquidityManipulationRisk), weight: 0.8 },
        { score: inverseRiskScore(project.washTradingRiskScore), weight: 0.6 },
      ], 62);

  return {
    routeAvailability: routeHealth,
    liquidityDepth: liquidityDepthScore(project),
    quoteFreshness: quoteFreshnessScore(project),
    slippageControl: slippageControlScore(project),
    tradeSizeFit: maxTradeSize >= 1000 ? 96 : maxTradeSize >= 500 ? 84 : maxTradeSize >= 100 ? 70 : maxTradeSize >= 25 ? 52 : 8,
    safetyFriction,
  };
}

function opportunityComponents(project = {}) {
  return {
    momentumAcceleration: weightedAvailable([
      { score: project.accelerationScore, weight: 1.2 },
      { score: project.velocityScore, weight: 1.0 },
      { score: project.momentumShiftScore, weight: 1.1 },
      { score: project.preBreakoutMomentumScore, weight: 1.0 },
      { score: project.projectChangeScore, weight: 0.8 },
      { score: project.trendChangeScore, weight: 0.8 },
    ]),
    liquidityExpansion: weightedAvailable([
      { score: project.liquidityExpansionScore, weight: 1.2 },
      { score: project.activeLiquidityTruthScore, weight: 1.0 },
      { score: project.liquidityScore, weight: 0.8 },
      { score: project.liquidityFormationScore, weight: 0.9 },
      { score: project.organicEconomicIntegrityScore, weight: 0.7 },
    ]),
    smartWalletArrival: weightedAvailable([
      { score: project.smartWalletArrivalScore, weight: 1.3 },
      { score: project.smartWalletScore, weight: 0.9 },
      { score: project.smartMoneyAccumulationScore, weight: 1.1 },
      { score: project.smartMoneyRotationScore, weight: 0.8 },
      { score: project.smartMoneyConvictionScore, weight: 1.0 },
    ]),
    buyPressureAcceleration: weightedAvailable([
      { score: project.buyPressureScore, weight: 1.2 },
      { score: project.capitalFlowScore, weight: 1.0 },
      { score: project.organicBuyerScore, weight: 0.9 },
      { score: project.organicDemandScore, weight: 0.8 },
    ]),
    holderBuyerGrowth: weightedAvailable([
      { score: project.holderGrowthScore, weight: 1.0 },
      { score: project.organicBuyerScore, weight: 1.0 },
      { score: project.buyerRetentionScore, weight: 0.9 },
      { score: project.communityGrowthScore ?? project.communityScore, weight: 0.7 },
    ]),
    narrativeAcceleration: weightedAvailable([
      { score: project.narrativeHeatScore, weight: 1.1 },
      { score: project.narrativeForecastScore, weight: 1.0 },
      { score: project.narrativeScore, weight: 0.8 },
      { score: project.socialAccelerationScore, weight: 0.9 },
      { score: project.xSocialScore, weight: 0.7 },
    ]),
    catalystProximity: weightedAvailable([
      { score: project.liveCatalystRadarScore, weight: 1.2 },
      { score: project.catalystCalendarScore, weight: 1.0 },
      { score: project.catalystScore, weight: 0.9 },
      { score: project.roadmapCatalystProfitScore, weight: 0.9 },
      { score: project.exchangeProbabilityScore, weight: 0.6 },
    ]),
    developerCommunityChange: weightedAvailable([
      { score: project.developerActivityScore ?? project.developerScore, weight: 1.0 },
      { score: project.githubProScore ?? project.githubQualityScore ?? project.githubScore, weight: 0.9 },
      { score: project.communityGrowthScore ?? project.communityScore, weight: 0.8 },
      { score: project.projectChangeScore, weight: 0.7 },
    ]),
    relativeMarketStrength: weightedAvailable([
      { score: project.relativeStrengthScore, weight: 1.0 },
      { score: project.marketRankScore, weight: 0.8 },
      { score: project.earlyBreakoutScore, weight: 0.9 },
      { score: project.prePumpPatternScore, weight: 0.8 },
      { score: project.preConsensusOpportunityScore, weight: 0.9 },
    ]),
  };
}

function trustComponents(project = {}) {
  const sourceAgreement = weightedAvailable([
    { score: project.sourceTruthScore, weight: 1.0 },
    { score: project.sourceReliabilityScore, weight: 0.8 },
    { score: project.institutionalDataProvenance?.components?.sourceAgreement, weight: 1.0 },
    { score: project.institutionalDataProvenanceScore, weight: 0.8 },
    { score: project.sniperSourceAgreement, weight: 0.8 },
  ], 35);

  return {
    identityConfidence: weightedAvailable([
      { score: project.identityResolutionScore, weight: 1.0 },
      { score: project.projectIdentityScore, weight: 0.8 },
      { score: project.finalIntegrityScore, weight: 0.7 },
      { score: identityVerified(project) ? 90 : 0, weight: 1.0 },
    ]),
    contractSafety: weightedAvailable([
      { score: project.instantSafetyScore, weight: 1.0 },
      { score: contractSafetyVerified(project) ? 88 : 0, weight: 1.0 },
      { score: inverseRiskScore(project.contractRiskScore), weight: 1.0 },
      { score: inverseRiskScore(project.honeypotRiskScore), weight: 1.0 },
      { score: inverseRiskScore(project.instantSafetyRiskScore), weight: 0.9 },
    ]),
    liquidityQuality: weightedAvailable([
      { score: project.activeLiquidityTruthScore, weight: 1.1 },
      { score: project.liquidityScore, weight: 0.8 },
      { score: project.exitLiquidityScore, weight: 0.8 },
      { score: liquidityUsd(project) >= 25_000 ? 85 : liquidityUsd(project) >= 5_000 ? 60 : liquidityUsd(project) >= 1_000 ? 42 : 0, weight: 1.0 },
      { score: inverseRiskScore(project.liquidityControlRisk), weight: 0.8 },
      { score: inverseRiskScore(project.liquidityManipulationRisk), weight: 0.8 },
    ]),
    sourceAgreement,
    holderDistribution: weightedAvailable([
      { score: project.holderDistributionScore, weight: 1.0 },
      { score: project.sniperEvidenceFamilies?.HOLDER_DISTRIBUTION?.familyScore, weight: 0.8 },
      { score: inverseRiskScore(project.walletClusterRiskScore), weight: 1.0 },
      { score: inverseRiskScore(project.insiderDistributionRisk), weight: 1.0 },
      { score: inverseRiskScore(project.bundledLaunchRiskScore), weight: 0.6 },
    ]),
    washTradingResistance: weightedAvailable([
      { score: inverseRiskScore(project.washTradingRiskScore), weight: 1.1 },
      { score: inverseRiskScore(project.activityAuthenticityRiskScore), weight: 1.0 },
      { score: project.organicDemandFirewallScore, weight: 0.9 },
      { score: project.organicBuyerScore, weight: 0.8 },
    ]),
    executionRoute: weightedAvailable([
      { score: routeVerified(project) ? 90 : 0, weight: 1.0 },
      { score: project.proofOfAlphaExecutionTwinScore, weight: 0.7 },
      { score: project.smallCapPurchaseRouteScore ?? project.smallCapHunter?.purchaseRoute?.score, weight: 0.6 },
    ]),
  };
}

function weightedScoreFromComponents(components = {}, weights = {}, missingDefault = null) {
  return weightedAvailable(
    Object.entries(weights).map(([key, weight]) => ({
      score: components[key],
      weight,
    })),
    missingDefault
  );
}

function scoreCoverage(components = {}) {
  const values = Object.values(components);
  if (!values.length) return 0;
  return Math.round((values.filter((value) => num(value) > 0).length / values.length) * 100);
}

function buildHardBlockers(project = {}) {
  const reasons = [];
  const finalReasons = [
    ...(project.finalBlockingReasons || []),
    ...(project.sniperBlockingReasons || []),
    ...(project.preConsensusHardBlockers || []),
    ...(project.economicIntegrityBlockers || []),
  ].map(String);

  const hardText = finalReasons.join(" ");
  if (project.identityConflict === true || project.finalSelectionState === "IDENTITY_CONFLICT") reasons.push("Identity conflict detected.");
  if (["CONFLICTED_IDENTITY", "IMPERSONATION_RISK"].includes(project.finalIdentityState || project.identityState)) reasons.push("Conflicted or impersonation-risk identity.");
  if (project.chainMismatch === true || project.contractChainMismatch === true) reasons.push("Chain or contract mismatch detected.");
  if (project.honeypotDetected === true || num(project.honeypotRiskScore) >= 70) reasons.push("Honeypot risk detected.");
  if (num(project.contractRiskScore) >= 75) reasons.push("Severe contract risk detected.");
  if (["CRITICAL", "RESTRICTED"].includes(project.instantSafetyStatus)) reasons.push(`Instant safety gate ${project.instantSafetyStatus}.`);
  if (num(project.instantSafetyRiskScore) >= 80) reasons.push("Critical instant safety risk.");
  if (num(project.washTradingRiskScore) >= 70) reasons.push("Wash-trading risk detected.");
  if (num(project.walletClusterRiskScore) >= 80 || num(project.insiderDistributionRisk) >= 80) reasons.push("Severe wallet clustering or insider distribution risk.");
  if (num(project.liquidityManipulationRisk) >= 70 || num(project.liquidityControlRisk) >= 80) reasons.push("Fake, removable, or manipulated liquidity risk.");
  if (project.organicDemandVerdict === "Institutional Integrity Block") reasons.push("Organic demand integrity block.");
  if (project.discoveryDecisionTier === "CRITICAL") reasons.push("Discovery decision critical block.");
  if (project.localAIPromotionBlocked === true) reasons.push("Completed local AI risk research blocks promotion.");
  if (project.verifiedScam === true || project.scamDetected === true || num(project.scamRiskScore) >= 70) reasons.push("Verified scam risk.");
  if (num(project.manipulationRiskScore) >= 70) reasons.push("Manipulation risk detected.");
  if (
    project.finalSelectionState === "BLOCKED" &&
    textIncludesAny(hardText, [
      "identity",
      "honeypot",
      "contract risk",
      "scam",
      "rug",
      "wash",
      "fake liquidity",
      "liquidity manipulation",
      "wallet cluster",
      "insider",
      "manipulation",
      "organic demand integrity",
      "critical",
      "unsafe",
    ])
  ) {
    reasons.push(`Final integrity hard block: ${finalReasons[0] || "blocked by final integrity"}`);
  }

  return [...new Set(reasons)];
}

function buildWhyNowSignals(project = {}, components = {}) {
  const signals = [];
  const add = (label, value, detail = "") => {
    if (num(value) >= 60) signals.push({ label, score: Math.round(clamp(value)), detail });
  };

  add("Momentum acceleration", components.momentumAcceleration, "Velocity, acceleration, trend-change, and pre-breakout pressure are improving.");
  add("Liquidity expansion", components.liquidityExpansion, "Liquidity formation or usable active liquidity is improving.");
  add("Smart-wallet arrival", components.smartWalletArrival, "Smart-wallet, smart-money, or rotation signals are appearing.");
  add("Buy pressure", components.buyPressureAcceleration, "Buy pressure, capital flow, or organic buyer signals are improving.");
  add("Holder/buyer growth", components.holderBuyerGrowth, "Holder, buyer, retention, or community growth is improving.");
  add("Narrative acceleration", components.narrativeAcceleration, "Narrative heat, social acceleration, or sector momentum is rising.");
  add("Catalyst proximity", components.catalystProximity, "A catalyst or roadmap event is close enough to monitor.");
  add("Developer/community change", components.developerCommunityChange, "Builder or community activity changed meaningfully.");
  add("Relative strength", components.relativeMarketStrength, "Relative strength or breakout pressure beats nearby alternatives.");

  if (num(project.liquidityGrowthPct24h) > 0) signals.push({ label: "Liquidity growth 24h", score: Math.round(clamp(project.liquidityGrowthPct24h)), detail: `${project.liquidityGrowthPct24h}%` });
  if (num(project.volumeChange24hPct) > 0) signals.push({ label: "Volume change 24h", score: Math.round(clamp(project.volumeChange24hPct)), detail: `${project.volumeChange24hPct}%` });
  if (num(project.buyerGrowthPct24h) > 0) signals.push({ label: "Buyer growth 24h", score: Math.round(clamp(project.buyerGrowthPct24h)), detail: `${project.buyerGrowthPct24h}%` });

  return signals.slice(0, 12);
}

function buildMissingEvidence(project = {}, trust = {}, hardBlockers = []) {
  if (hardBlockers.length) return [];
  const missing = [];

  if (!identityVerified(project)) missing.push("Verify identity with contract, chain, official links, and independent source agreement.");
  if (!hasContract(project)) missing.push("Find and verify contract address or confirmed prelaunch identity.");
  if (!contractSafetyVerified(project)) missing.push("Verify contract safety, ownership, mint controls, tax behavior, and honeypot status.");
  if (liquidityUsd(project) <= 0) missing.push("Fetch usable liquidity and exit-depth data.");
  else if (liquidityUsd(project) < 5_000) missing.push("Liquidity is under final-selection depth; monitor until exit liquidity improves.");
  if (trust.liquidityQuality < 55) missing.push("Confirm liquidity quality and whether liquidity can be removed or manipulated.");
  if (trust.sourceAgreement < 60 || sourceCount(project) < 2) missing.push("Add an independent second source and check source agreement.");
  if (trust.holderDistribution < 55) missing.push("Verify holder distribution, wallet clusters, insider concentration, and bundled launch risk.");
  if (trust.washTradingResistance < 55) missing.push("Verify organic volume and buyer quality before treating activity as real demand.");
  if (!routeVerified(project)) missing.push("Verify Coinbase, MetaMask, DEX, or execution route before any final candidate status.");
  if (!["COMPLETE", "PARTIAL"].includes(project.localAIStatus || "")) missing.push("Queue local AI research for thesis review and risk-only criticism.");
  if (num(project.comparableSampleSize || project.calibrationSampleSize || project.outcomeWinSampleSize) < 30) missing.push("Outcome calibration sample is too small for measured probabilities.");

  return [...new Set(missing)].slice(0, 10);
}

function buildExecutionMissingEvidence(project = {}, execution = {}, tradeSizeChecks = []) {
  const missing = [];
  if (!routeVerified(project)) missing.push("Verify Coinbase, MetaMask, DEX, or aggregator route with a fresh quote.");
  if (routeFailureDetected(project)) missing.push("Execution route is currently failing or unavailable.");
  if (execution.quoteFreshness < 55) missing.push("Refresh stale execution quote before ranking as execution-ready.");
  if (execution.slippageControl < 55) missing.push("Confirm slippage and price impact with a live quote.");
  if (!tradeSizeChecks.some((check) => check.status === "PASS")) {
    missing.push("No clean $25/$100/$500/$1000 paper trade size currently passes execution checks.");
  }
  return missing;
}

function buildNextActions(project = {}, tier = TIERS.MONITOR_ONLY, missing = []) {
  if (tier === TIERS.BLOCKED) return ["Do not promote. Recheck only if the hard-blocking evidence is resolved."];
  const actions = [];
  if (missing.length) actions.push(...missing.slice(0, 4));
  if (tier === TIERS.SPECULATIVE_SIGNAL || tier === TIERS.EMERGING_RADAR) actions.push("Monitor the next scan for persistence before promotion.");
  if (tier === TIERS.EARLY_HIGH_CONVICTION) actions.push("Run deep research and execution verification before final selection.");
  if (tier === TIERS.SNIPER_READY) actions.push("Keep final integrity, route, liquidity, and invalidation checks active.");
  if (!actions.length) actions.push("Maintain monitoring and compare against next scan changes.");
  return [...new Set(actions)].slice(0, 8);
}

function buildInvalidations(project = {}) {
  const invalidations = [
    "Opportunity score drops below its current tier threshold on the next scan.",
    "Liquidity falls while sell pressure, wash-trading risk, or wallet-cluster risk rises.",
    "Identity, contract, or execution route evidence becomes contradictory.",
  ];

  if (routeVerified(project)) invalidations.push("Execution route disappears or quote quality becomes unsafe.");
  if (num(project.liveCatalystRadarScore || project.catalystScore) >= 60) invalidations.push("Catalyst is delayed, cancelled, or occurs without confirming liquidity and buyer growth.");
  if (num(project.smartWalletArrivalScore || project.smartMoneyAccumulationScore) >= 60) invalidations.push("Smart-wallet net flow reverses before broader confirmation.");
  if (num(project.narrativeHeatScore || project.socialAccelerationScore) >= 60) invalidations.push("Narrative/social attention rises without matching organic liquidity, buyer, or developer evidence.");

  return invalidations.slice(0, 8);
}

function predictionPerformance(project = {}) {
  const sampleSize = num(project.comparableSampleSize || project.calibrationSampleSize || project.outcomeWinSampleSize);
  const measured = sampleSize >= 30;
  return {
    sampleSize,
    status: measured ? "MEASURED_HIT_RATE_AVAILABLE" : "MODEL_ESTIMATE_ONLY",
    probabilityLabelAllowed: measured,
    note: measured
      ? "Score range has enough comparable outcomes for measured hit-rate language."
      : "Do not treat score as a proven probability until enough outcomes are collected.",
    hitRate7d25Pct: measured ? project.hitRate7d25Pct ?? project.outcomeCalibration?.hitRate7d25Pct ?? null : null,
    hitRate30d100Pct: measured ? project.hitRate30d100Pct ?? project.outcomeCalibration?.hitRate30d100Pct ?? null : null,
    rugOrUntradeableRate: measured ? project.rugOrUntradeableRate ?? project.outcomeCalibration?.rugOrUntradeableRate ?? null : null,
  };
}

function catalystWindow(project = {}) {
  const event = project.liveCatalystEvents?.[0] || project.catalystTimeline?.[0] || project.roadmapCatalystProfit?.nearestCatalyst || null;
  if (!event) return "No verified near-term catalyst.";
  const label = event.title || event.name || event.type || event.catalystType || "Catalyst";
  const days = event.daysUntil ?? event.daysAway ?? event.windowDays;
  return days === undefined || days === null ? String(label) : `${label} in ${days} days`;
}

function calibrationSampleSize(project = {}) {
  return Math.max(
    num(project.comparableSampleSize),
    num(project.calibrationSampleSize),
    num(project.outcomeWinSampleSize),
    num(project.outcomeCalibration?.sampleSize),
    num(project.predictionPerformance?.sampleSize)
  );
}

function calibrationState(project = {}) {
  const sampleSize = calibrationSampleSize(project);
  if (sampleSize >= 100) return { sampleSize, status: "CALIBRATED", note: "Large enough sample for stronger measured outcome language." };
  if (sampleSize >= 30) return { sampleSize, status: "MEASURED", note: "Enough comparable outcomes for measured hit-rate caveats." };
  if (sampleSize >= 10) return { sampleSize, status: "EARLY_SAMPLE", note: "Useful directional sample, still not a probability claim." };
  return { sampleSize, status: "MODEL_ESTIMATE_ONLY", note: "Treat as a research ranking until more outcomes are logged." };
}

function calibratedExpectedValueScore(project = {}) {
  const explicit = firstValue([
    project.calibratedExpectedValueScore,
    project.expectedValueScore,
    project.outcomeExpectedValueScore,
    project.paperExpectedValueScore,
  ]);
  if (explicit !== undefined) return clamp(explicit);

  const upsidePct = firstValue([
    project.causalMarketTwinExpectedReturnPct,
    project.expectedReturnPct,
    project.expectedUpsidePct,
    project.monteCarloExpectedReturnPct,
  ]);
  const upsideProbability = firstValue([
    project.causalMarketTwinUpsideProbability,
    project.breakoutProbability30d,
    project.upsideProbability,
    project.quantumOutcomeField?.upsideProbability,
  ]);
  const downsideProbability = firstValue([
    project.causalMarketTwinDownsideProbability,
    project.downsideProbability,
    project.rugOrUntradeableRate,
    project.outcomeCalibration?.rugOrUntradeableRate,
  ]);

  if (upsidePct === undefined && upsideProbability === undefined) return null;
  const upsideComponent = clamp(num(upsidePct) * 1.6);
  const probabilityComponent = clamp(num(upsideProbability) <= 1 ? num(upsideProbability) * 100 : num(upsideProbability));
  const downsidePenalty = clamp(num(downsideProbability) <= 1 ? num(downsideProbability) * 100 : num(downsideProbability));
  return Math.round(clamp(upsideComponent * 0.45 + probabilityComponent * 0.55 - downsidePenalty * 0.35));
}

function evidenceFreshnessScore(project = {}) {
  return weightedAvailable([
    { score: project.sniperDataFreshness, weight: 1.0 },
    { score: project.dataFreshnessScore, weight: 1.0 },
    { score: project.institutionalDataProvenance?.components?.freshness, weight: 1.0 },
    { score: project.sourceTruth?.freshnessScore, weight: 0.8 },
    { score: sourceCount(project) >= 3 ? 82 : sourceCount(project) === 2 ? 66 : sourceCount(project) === 1 ? 45 : 0, weight: 0.7 },
  ], 35);
}

function regimeCompatibilityScore(project = {}) {
  return weightedAvailable([
    { score: project.regimeAdjustedOpportunityScore, weight: 1.0 },
    { score: project.marketRegimeFitScore, weight: 1.0 },
    { score: project.macroNarrativeScore, weight: 0.8 },
    { score: project.narrativeForecastScore, weight: 0.8 },
    { score: project.relativeStrengthScore, weight: 0.8 },
    { score: project.trendChangeScore, weight: 0.6 },
  ], 45);
}

function buildMoneyRankDrivers({
  opportunityScore,
  trustScore,
  executionScore,
  freshnessScore,
  regimeScore,
  expectedValueScore,
  hardBlockers = [],
}) {
  if (hardBlockers.length) return [`Blocked: ${hardBlockers[0]}`];
  const drivers = [
    { label: "Opportunity", score: opportunityScore },
    { label: "Trust", score: trustScore },
    { label: "Execution", score: executionScore },
    { label: "Fresh evidence", score: freshnessScore },
    { label: "Regime fit", score: regimeScore },
  ];
  if (expectedValueScore !== null) drivers.push({ label: "Calibrated EV", score: expectedValueScore });
  return drivers
    .sort((a, b) => num(b.score) - num(a.score))
    .slice(0, 5)
    .map((driver) => `${driver.label}: ${Math.round(clamp(driver.score))}`);
}

function moneyRankScoreFor({
  project,
  opportunityScore,
  trustScore,
  executionScore,
  freshnessScore,
  regimeScore,
  expectedValueScore,
  hardBlockers = [],
  localAIAdjustment = 0,
}) {
  if (hardBlockers.length) return 0;
  const calibration = calibrationState(project);
  const expectedValueUsable = expectedValueScore !== null && calibration.sampleSize >= 20;
  const score = weightedAvailable([
    { score: opportunityScore, weight: expectedValueUsable ? 30 : 35 },
    { score: trustScore, weight: expectedValueUsable ? 25 : 27 },
    { score: executionScore, weight: expectedValueUsable ? 20 : 23 },
    { score: freshnessScore, weight: 10 },
    { score: regimeScore, weight: expectedValueUsable ? 5 : 5 },
    { score: expectedValueUsable ? expectedValueScore : undefined, weight: expectedValueUsable ? 10 : 0 },
  ]);
  return Math.round(clamp(score + Math.min(0, num(localAIAdjustment))));
}

function tierFor({ opportunityScore, trustScore, executionScore, hardBlockers, routeVerified: hasRoute }) {
  if (hardBlockers.length) return TIERS.BLOCKED;
  if (opportunityScore >= 82 && trustScore >= 75 && executionScore >= 70 && hasRoute) return TIERS.SNIPER_READY;
  if (opportunityScore >= 77 && trustScore >= 60 && executionScore >= 45) return TIERS.EARLY_HIGH_CONVICTION;
  if (opportunityScore >= 70 && trustScore >= 40) return TIERS.EMERGING_RADAR;
  if (opportunityScore >= 62) return TIERS.SPECULATIVE_SIGNAL;
  return TIERS.MONITOR_ONLY;
}

function confidenceFor(opportunityScore = 0, trustScore = 0, executionScore = 0, coverage = 0, hardBlockers = []) {
  if (hardBlockers.length) return "Blocked";
  const blended = opportunityScore * 0.3 + trustScore * 0.4 + executionScore * 0.15 + coverage * 0.15;
  if (blended >= 78) return "High";
  if (blended >= 60) return "Medium";
  if (blended >= 42) return "Developing";
  return "Low";
}

export function analyzeProgressiveOpportunity(project = {}, options = {}) {
  const opp = opportunityComponents(project);
  const trust = trustComponents(project);
  const opportunityScore = weightedScoreFromComponents(
    opp,
    {
      momentumAcceleration: 20,
      liquidityExpansion: 15,
      smartWalletArrival: 15,
      buyPressureAcceleration: 10,
      holderBuyerGrowth: 10,
      narrativeAcceleration: 10,
      catalystProximity: 10,
      developerCommunityChange: 5,
      relativeMarketStrength: 5,
    },
    null
  );
  const trustScore = weightedScoreFromComponents(
    trust,
    {
      identityConfidence: 20,
      contractSafety: 20,
      liquidityQuality: 15,
      sourceAgreement: 15,
      holderDistribution: 10,
      washTradingResistance: 10,
      executionRoute: 10,
    },
    0
  );
  const hardBlockers = buildHardBlockers(project);
  const tradeSizeChecks = buildTradeSizeChecks(project, hardBlockers);
  const execution = executionComponents(project, hardBlockers, tradeSizeChecks);
  const executionScore = weightedScoreFromComponents(
    execution,
    {
      routeAvailability: 25,
      liquidityDepth: 20,
      quoteFreshness: 15,
      slippageControl: 15,
      tradeSizeFit: 15,
      safetyFriction: 10,
    },
    0
  );
  const executableSize = executableTradeSizeUsd(tradeSizeChecks);
  const hasRoute = routeVerified(project);
  const tier = tierFor({
    opportunityScore,
    trustScore,
    executionScore,
    hardBlockers,
    routeVerified: hasRoute,
  });
  const opportunityCoverage = scoreCoverage(opp);
  const trustCoverage = scoreCoverage(trust);
  const executionCoverage = scoreCoverage(execution);
  const evidenceCoverage = Math.round(clamp((opportunityCoverage + trustCoverage + executionCoverage) / 3));
  const missingEvidence = [
    ...buildMissingEvidence(project, trust, hardBlockers),
    ...buildExecutionMissingEvidence(project, execution, tradeSizeChecks),
  ]
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index)
    .slice(0, 10);
  const localAIAdjustment = tier === TIERS.BLOCKED ? 0 : Math.min(0, num(project.localAIAdjustment));
  const freshnessScore = evidenceFreshnessScore(project);
  const regimeScore = regimeCompatibilityScore(project);
  const expectedValueScore = calibratedExpectedValueScore(project);
  const moneyScore = moneyRankScoreFor({
    project,
    opportunityScore,
    trustScore,
    executionScore,
    freshnessScore,
    regimeScore,
    expectedValueScore,
    hardBlockers,
    localAIAdjustment,
  });
  const emergingDiscoveryAIEligible =
    hardBlockers.length === 0 &&
    liquidityUsd(project) >= num(options.emergingMinimumLiquidityUsd ?? 1_000) &&
    sourceCount(project) >= num(options.emergingMinimumSources ?? 1) &&
    opportunityScore >= num(options.emergingMinimumOpportunityScore ?? 55) &&
    tier !== TIERS.SNIPER_READY &&
    project.finalSelectionQualified !== true;

  return {
    ...project,
    progressiveOpportunityScore: opportunityScore,
    opportunityScoreV2: opportunityScore,
    trustScore,
    progressiveTrustScore: trustScore,
    executionScore,
    progressiveExecutionScore: executionScore,
    executionScoreComponents: execution,
    executionTradeSizeChecks: tradeSizeChecks,
    executableTradeSizeUsd: executableSize,
    moneyRankScore: moneyScore,
    moneyRankEligible: hardBlockers.length === 0,
    moneyRankDrivers: buildMoneyRankDrivers({
      opportunityScore,
      trustScore,
      executionScore,
      freshnessScore,
      regimeScore,
      expectedValueScore,
      hardBlockers,
    }),
    calibratedExpectedValueScore: expectedValueScore,
    evidenceFreshnessScore: freshnessScore,
    regimeCompatibilityScore: regimeScore,
    calibrationState: calibrationState(project),
    opportunityTrustSpread: Math.round(opportunityScore - trustScore),
    opportunityRankingTier: tier,
    opportunityTier: tier,
    opportunityConfidence: confidenceFor(opportunityScore, trustScore, executionScore, evidenceCoverage, hardBlockers),
    opportunityEvidenceCoverage: evidenceCoverage,
    opportunityScoreComponents: opp,
    trustScoreComponents: trust,
    opportunityWhyNowSignals: buildWhyNowSignals(project, opp),
    missingEvidence,
    hardBlockers,
    opportunityHardBlockers: hardBlockers,
    catalystWindow: catalystWindow(project),
    predictionHorizon: project.predictionHorizon || (tier === TIERS.SNIPER_READY ? "24h-7d verification window" : "7d-30d research watch window"),
    invalidationConditions: buildInvalidations(project),
    nextVerificationActions: buildNextActions(project, tier, missingEvidence),
    bestAvailableEligible: hardBlockers.length === 0,
    localAIVerdict: project.localAIVerdict || project.aiDecision || "Pending",
    localAITrustAdjustment: localAIAdjustment,
    emergingDiscoveryAIEligible,
    emergingDiscoveryAIInfluencePolicy: emergingDiscoveryAIEligible ? "PENALTIES_ONLY" : "STANDARD_SAFETY_POLICY",
    emergingDiscoveryAIPromotionBlocked: emergingDiscoveryAIEligible,
    predictionPerformance: predictionPerformance(project),
    financialAdviceDisclaimer: "Research signal only. Scores are not financial advice or a profit promise.",
  };
}

function rankProjects(projects = []) {
  return [...projects].sort(
    (a, b) =>
      num(b.moneyRankScore) - num(a.moneyRankScore) ||
      num(b.progressiveOpportunityScore) - num(a.progressiveOpportunityScore) ||
      num(b.executionScore) - num(a.executionScore) ||
      num(b.trustScore) - num(a.trustScore) ||
      num(b.pipelineScore) - num(a.pipelineScore)
  );
}

export function analyzeProgressiveOpportunityRankingBatch(projects = [], options = {}) {
  const enriched = (Array.isArray(projects) ? projects : []).map((project) =>
    analyzeProgressiveOpportunity(project, options)
  );
  const ranked = rankProjects(enriched);
  const bestAvailable = ranked.filter((project) => project.bestAvailableEligible);
  const emergingLane = bestAvailable
    .filter((project) => project.emergingDiscoveryAIEligible)
    .slice(0, num(options.emergingLaneLimit ?? 100));
  const tierRanks = new Map();
  const bestRanks = new Map(bestAvailable.map((project, index) => [project, index + 1]));
  const emergingRanks = new Map(emergingLane.map((project, index) => [project, index + 1]));
  const moneyRanks = new Map(
    ranked
      .filter((project) => project.moneyRankEligible)
      .map((project, index) => [project, index + 1])
  );

  for (const tier of Object.values(TIERS)) {
    tierRanks.set(
      tier,
      ranked
        .filter((project) => project.opportunityRankingTier === tier)
        .map((project, index) => [project, index + 1])
    );
  }

  const flatTierRanks = new Map([...tierRanks.values()].flat());

  return ranked.map((project, index) => ({
    ...project,
    opportunityRank: index + 1,
    bestAvailableRank: bestRanks.get(project) || null,
    moneyRank: moneyRanks.get(project) || null,
    opportunityTierRank: flatTierRanks.get(project) || null,
    emergingDiscoveryAIRank: emergingRanks.get(project) || null,
  }));
}

function compactProject(project = {}) {
  return {
    rank: project.opportunityRank || 0,
    bestAvailableRank: project.bestAvailableRank || null,
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || project.finalChain || "unknown",
    tier: project.opportunityRankingTier || "UNKNOWN",
    opportunityScore: project.progressiveOpportunityScore || 0,
    trustScore: project.trustScore || 0,
    executionScore: project.executionScore || 0,
    moneyRankScore: project.moneyRankScore || 0,
    moneyRank: project.moneyRank || null,
    moneyRankEligible: Boolean(project.moneyRankEligible),
    moneyRankDrivers: project.moneyRankDrivers || [],
    executableTradeSizeUsd: project.executableTradeSizeUsd || 0,
    executionTradeSizeChecks: (project.executionTradeSizeChecks || []).slice(0, 4),
    calibrationState: project.calibrationState || {},
    confidence: project.opportunityConfidence || "Unknown",
    finalSelectionState: project.finalSelectionState || "UNKNOWN",
    finalSelectionQualified: Boolean(project.finalSelectionQualified),
    sniperState: project.sniperState || "UNKNOWN",
    sniperQualified: Boolean(project.sniperQualified),
    routeVerified: routeVerified(project),
    liquidityUsd: liquidityUsd(project),
    sourceCount: sourceCount(project),
    localAIVerdict: project.localAIVerdict || "Pending",
    localAIAdjustment: project.localAITrustAdjustment ?? project.localAIAdjustment ?? 0,
    whyNow: (project.opportunityWhyNowSignals || []).slice(0, 6),
    evidenceCoverage: project.opportunityEvidenceCoverage || 0,
    missingEvidence: (project.missingEvidence || []).slice(0, 6),
    hardBlockers: (project.opportunityHardBlockers || []).slice(0, 6),
    catalystWindow: project.catalystWindow || "",
    predictionHorizon: project.predictionHorizon || "",
    invalidationConditions: (project.invalidationConditions || []).slice(0, 5),
    nextVerificationActions: (project.nextVerificationActions || []).slice(0, 6),
    predictionPerformance: project.predictionPerformance || {},
  };
}

export function summarizeProgressiveOpportunityRanking(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const analyzed = safeProjects.every((project) => project.opportunityRankingTier)
    ? safeProjects
    : analyzeProgressiveOpportunityRankingBatch(safeProjects);
  const ranked = rankProjects(analyzed);
  const byTier = (tier) => ranked.filter((project) => project.opportunityRankingTier === tier);
  const bestAvailable = ranked.filter((project) => project.bestAvailableEligible);
  const moneyRanked = ranked.filter((project) => project.moneyRankEligible);
  const executionReady = moneyRanked.filter(
    (project) => routeVerified(project) && num(project.executionScore) >= 70 && num(project.executableTradeSizeUsd) >= 100
  );
  const blocked = byTier(TIERS.BLOCKED);
  const emergingLane = ranked.filter((project) => project.emergingDiscoveryAIEligible);
  const missingEvidenceQueue = bestAvailable
    .filter((project) => (project.missingEvidence || []).length > 0)
    .sort(
      (a, b) =>
        num(b.progressiveOpportunityScore) - num(a.progressiveOpportunityScore) ||
        (b.missingEvidence || []).length - (a.missingEvidence || []).length
    );

  return {
    generatedAt: new Date().toISOString(),
    totalProjects: ranked.length,
    counts: {
      sniperReady: byTier(TIERS.SNIPER_READY).length,
      earlyHighConviction: byTier(TIERS.EARLY_HIGH_CONVICTION).length,
      emergingRadar: byTier(TIERS.EMERGING_RADAR).length,
      speculativeSignal: byTier(TIERS.SPECULATIVE_SIGNAL).length,
      monitorOnly: byTier(TIERS.MONITOR_ONLY).length,
      blocked: blocked.length,
      bestAvailable: bestAvailable.length,
      moneyRanked: moneyRanked.length,
      executionReady: executionReady.length,
      emergingDiscoveryAI: emergingLane.length,
      missingEvidence: missingEvidenceQueue.length,
    },
    finalQualified: byTier(TIERS.SNIPER_READY).slice(0, TIER_LIMITS.SNIPER_READY).map(compactProject),
    sniperReady: byTier(TIERS.SNIPER_READY).slice(0, TIER_LIMITS.SNIPER_READY).map(compactProject),
    earlyHighConviction: byTier(TIERS.EARLY_HIGH_CONVICTION).slice(0, TIER_LIMITS.EARLY_HIGH_CONVICTION).map(compactProject),
    emergingRadar: byTier(TIERS.EMERGING_RADAR).slice(0, TIER_LIMITS.EMERGING_RADAR).map(compactProject),
    speculativeSignals: byTier(TIERS.SPECULATIVE_SIGNAL).slice(0, TIER_LIMITS.SPECULATIVE_SIGNAL).map(compactProject),
    institutionalMoneyRank: moneyRanked.slice(0, 50).map(compactProject),
    bestAvailableOpportunities: bestAvailable.slice(0, 20).map(compactProject),
    executionReady: executionReady.slice(0, 25).map(compactProject),
    blockedProjects: blocked.slice(0, 30).map(compactProject),
    emergingDiscoveryAILane: emergingLane.slice(0, 100).map(compactProject),
    missingEvidenceQueue: missingEvidenceQueue.slice(0, 50).map(compactProject),
    localAIActivity: {
      completed: ranked.filter((project) => ["COMPLETE", "PARTIAL"].includes(project.localAIStatus || "")).length,
      queued: ranked.filter((project) => project.localAIStatus === "QUEUED").length,
      unavailable: ranked.filter((project) => project.localAIExecutionStatus === "UNAVAILABLE").length,
      promotionBlocked: ranked.filter((project) => project.localAIPromotionBlocked === true).length,
      emergingPenaltyOnlyLane: emergingLane.length,
    },
    predictionPerformance: {
      measuredCandidates: ranked.filter((project) => project.predictionPerformance?.probabilityLabelAllowed).length,
      modelEstimateOnly: ranked.filter((project) => project.predictionPerformance?.status === "MODEL_ESTIMATE_ONLY").length,
      note: "Scores are research rankings until enough outcome records exist for measured hit rates.",
    },
    operatorNotes: [
      "Best available means strongest non-hard-blocked research lead, not a buy recommendation.",
      "Money Rank blends Opportunity, Trust, Execution, freshness, regime fit, and measured EV only when enough outcomes exist.",
      "Execution-ready means a route, liquidity depth, and paper trade-size check currently pass; it is still research, not financial advice.",
      "SNIPER_READY still requires trust, no hard blockers, and a verified execution route.",
      "Missing proof lowers trust and creates verification work; verified scam/rug/manipulation evidence blocks promotion.",
      "Emerging Discovery AI is penalty-only and cannot promote a project to SNIPER_READY.",
    ],
  };
}

export function writeProgressiveOpportunityReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = summarizeProgressiveOpportunityRanking(projects);
  const filePath = path.join(reportsDir, "progressive-opportunities.json");
  const institutionalRankingPath = path.join(reportsDir, "institutional-ranking.json");
  const bestAvailablePath = path.join(reportsDir, "best-available.json");
  const emergingRadarPath = path.join(reportsDir, "emerging-radar.json");
  const executionReadyPath = path.join(reportsDir, "execution-ready.json");
  const blockedProjectsPath = path.join(reportsDir, "blocked-projects.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  fs.writeFileSync(
    institutionalRankingPath,
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        totalProjects: report.totalProjects,
        counts: report.counts,
        institutionalMoneyRank: report.institutionalMoneyRank,
        executionReady: report.executionReady,
        operatorNotes: report.operatorNotes,
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    bestAvailablePath,
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        totalProjects: report.totalProjects,
        bestAvailableOpportunities: report.bestAvailableOpportunities,
        missingEvidenceQueue: report.missingEvidenceQueue,
        operatorNotes: report.operatorNotes,
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    emergingRadarPath,
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        emergingRadar: report.emergingRadar,
        speculativeSignals: report.speculativeSignals,
        emergingDiscoveryAILane: report.emergingDiscoveryAILane,
        operatorNotes: report.operatorNotes,
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    executionReadyPath,
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        executionReady: report.executionReady,
        operatorNotes: report.operatorNotes,
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    blockedProjectsPath,
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        blockedProjects: report.blockedProjects,
        operatorNotes: report.operatorNotes,
      },
      null,
      2
    )
  );

  return {
    filePath,
    institutionalRankingPath,
    bestAvailablePath,
    emergingRadarPath,
    executionReadyPath,
    blockedProjectsPath,
    report,
  };
}

export { TIERS as PROGRESSIVE_OPPORTUNITY_TIERS };
