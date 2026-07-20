import { sourceFamiliesForProject } from "../data/metricTruthNormalizer.js";
import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";
import { inspectBlockingVerdicts, normalizeDecisionText } from "../selection/blockingVerdictHelper.js";

const DEFAULT_TARGET_COUNT = Number(process.env.PRE_BREAKOUT_RADAR_TARGET_COUNT || 5);
const DEFAULT_MIN_LIQUIDITY = Number(process.env.PRE_BREAKOUT_RADAR_MIN_LIQUIDITY || 10_000);
const DEFAULT_MAX_MARKET_CAP = Number(process.env.PRE_BREAKOUT_RADAR_MAX_MARKET_CAP || 125_000_000);

const COMPONENT_WEIGHTS = {
  sizeAsymmetry: 8,
  attentionGap: 14,
  pressureFormation: 17,
  organicDemand: 14,
  smartMoneyArrival: 13,
  catalystCompression: 12,
  executionProof: 12,
  evidenceTrust: 6,
  safetyIntegrity: 4,
};

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function hasNumber(value) {
  return value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function weighted(items = []) {
  const active = items.filter((item) => hasNumber(item.score) && num(item.weight) > 0);
  const totalWeight = active.reduce((sum, item) => sum + num(item.weight), 0);
  if (!totalWeight) return 0;
  return Math.round(
    clamp(active.reduce((sum, item) => sum + clamp(item.score) * num(item.weight), 0) / totalWeight)
  );
}

function maxScore(project = {}, keys = []) {
  return Math.max(...keys.map((key) => (hasNumber(project[key]) ? clamp(project[key]) : 0)));
}

function marketCap(project = {}) {
  return num(first([
    project.circulatingMarketCapUsd,
    project.circulatingMarketCap,
    project.marketCap,
    project.estimatedMarketCapUsd,
    project.fdv,
  ]));
}

function liquidity(project = {}) {
  return num(first([
    project.dexLiquidityUsd,
    project.stableExitLiquidityUsd,
    project.hardExitLiquidityUsd,
    project.finalLiquidityUsd,
    project.activeLiquidityUsd,
    project.liquidityUsd,
    project.liquidity,
    project.marketData?.liquidityUsd,
    project.rawCandidate?.liquidityUsd,
  ]));
}

function volume24h(project = {}) {
  return num(first([
    project.dexVolume24hUsd,
    project.volume24h,
    project.volume,
    project.marketData?.volume24h,
    project.rawCandidate?.volume24h,
  ]));
}

function canonicalChain(project = {}) {
  return normalizeChainId(first([project.canonicalChain, project.finalChain, project.chain, project.network, project.chainId]));
}

function tokenAddress(project = {}) {
  const chain = canonicalChain(project);
  return normalizeTokenAddress(
    first([
      project.finalContractAddress,
      project.canonicalAddress,
      project.contractAddress,
      project.tokenAddress,
      project.address,
      project.baseToken?.address,
    ]),
    chain
  );
}

function poolAddress(project = {}) {
  const chain = canonicalChain(project);
  return normalizePoolAddress(
    first([
      project.primaryTradablePool,
      project.poolAddress,
      project.pairAddress,
      project.finalPairAddress,
      project.pair?.address,
    ]),
    chain
  );
}

function hasVerifiedIdentity(project = {}) {
  return Boolean(
    project.identityVerified === true ||
      project.contractVerified === true ||
      project.projectIdentityVerdict === "Identity Resolved" ||
      ["VERIFIED_CONTRACT", "VERIFIED_LISTING", "VERIFIED"].includes(project.finalIdentityState || project.identityState)
  );
}

function routeEvidence(project = {}) {
  const executionStatus = normalizeDecisionText(project.executionProof?.executionStatus || project.executionStatus);
  const routeStatus = normalizeDecisionText(project.proofOfAlphaExecutionTwin?.route?.status || project.purchaseRoute?.status);
  const quoteLiquidity = num(project.proofOfAlphaExecutionTwin?.quote?.liquidityUsd);
  const routeDetected =
    project.purchaseRouteConfirmed === true ||
    project.executionRouteAvailable === true ||
    project.purchaseRoute?.purchasable === true ||
    project.smallCapHunter?.purchaseRoute?.purchasable === true ||
    project.proofOfAlphaExecutionTwinSelected === true ||
    project.proofOfAlphaExecutionTwin?.route?.detected === true;
  const verified =
    executionStatus === "verified" ||
    project.purchaseRouteConfirmed === true ||
    (project.executionRouteAvailable === true && quoteLiquidity > 0) ||
    (project.proofOfAlphaExecutionTwin?.route?.detected === true &&
      quoteLiquidity > 0 &&
      !array(project.proofOfAlphaExecutionTwin?.safety?.blockers).length);
  const partial =
    verified ||
    executionStatus === "partially verified" ||
    routeStatus.includes("detected") ||
    routeDetected;

  return {
    verified,
    partial,
    score: verified ? 92 : partial ? 62 : 0,
    status: verified ? "VERIFIED" : partial ? "PARTIAL" : "MISSING",
    preferredRoute:
      project.proofOfAlphaExecutionTwin?.route?.preferredRoute ||
      project.smallCapHunter?.purchaseRoute?.preferredRoute ||
      project.purchaseRoute?.preferredRoute ||
      "unknown",
  };
}

function sizeAsymmetry(project = {}, maxMarketCap = DEFAULT_MAX_MARKET_CAP) {
  const cap = marketCap(project);
  if (!cap) return 42;
  if (cap < 100_000) return 30;
  if (cap <= 1_000_000) return 92;
  if (cap <= 5_000_000) return 98;
  if (cap <= 25_000_000) return 92;
  if (cap <= 75_000_000) return 76;
  if (cap <= maxMarketCap) return 58;
  return 20;
}

function liquidityScore(project = {}, minLiquidity = DEFAULT_MIN_LIQUIDITY) {
  const liq = liquidity(project);
  const vol = volume24h(project);
  const liqScore =
    liq >= 1_000_000 ? 94 :
    liq >= 250_000 ? 88 :
    liq >= 75_000 ? 76 :
    liq >= 25_000 ? 62 :
    liq >= minLiquidity ? 46 :
    liq > 0 ? 18 :
    0;
  const volScore =
    vol >= 2_000_000 ? 90 :
    vol >= 500_000 ? 82 :
    vol >= 100_000 ? 68 :
    vol >= 25_000 ? 48 :
    vol > 0 ? 24 :
    0;

  return weighted([
    { score: liqScore, weight: 0.65 },
    { score: volScore, weight: 0.35 },
  ]);
}

function attentionGap(project = {}) {
  return weighted([
    { score: project.attentionGapScore, weight: 1.15 },
    { score: project.informationAdvantageScore, weight: 1.0 },
    { score: project.quietAccumulationScore, weight: 0.85 },
    { score: project.preConsensusOpportunityScore, weight: 0.75 },
    { score: maxScore(project, ["developerActivityScore", "githubProScore", "projectChangeScore"]), weight: 0.7 },
  ]);
}

function pressureFormation(project = {}) {
  const maxMove = Math.max(
    Math.abs(num(project.priceChange1h)),
    Math.abs(num(project.priceChange24h)),
    Math.abs(num(project.priceChange7d)),
    Math.abs(num(project.recentPriceMovePct))
  );
  const pricePosition =
    maxMove <= 15 ? 78 :
    maxMove <= 35 ? 68 :
    maxMove <= 55 ? 46 :
    maxMove <= 90 ? 22 :
    6;

  return weighted([
    { score: project.preBreakoutMomentumScore, weight: 1.2 },
    { score: project.quietAccumulationScore, weight: 1.05 },
    { score: project.momentumCompressionScore, weight: 0.9 },
    { score: project.momentumShiftScore, weight: 0.85 },
    { score: project.earlyBreakoutScore, weight: 0.85 },
    { score: project.volatilityExpansionScore, weight: 0.65 },
    { score: project.liquidityExpansionScore, weight: 0.8 },
    { score: project.prePump?.score, weight: 0.7 },
    { score: project.prePumpPatternScore, weight: 0.7 },
    { score: pricePosition, weight: 0.8 },
  ]);
}

function organicDemand(project = {}) {
  return weighted([
    { score: project.organicBuyerScore, weight: 1.1 },
    { score: project.organicBuyerClassifierScore, weight: 0.95 },
    { score: project.buyerRetentionScore, weight: 1.0 },
    { score: project.organicDemandIntegrityScore, weight: 1.05 },
    { score: project.organicEconomicIntegrityScore, weight: 0.95 },
    { score: project.buyPressureScore, weight: 0.85 },
    { score: project.holderGrowthScore, weight: 0.75 },
    { score: project.activeLiquidityTruthScore, weight: 0.85 },
  ]);
}

function smartMoneyArrival(project = {}) {
  return weighted([
    { score: project.smartWalletArrivalScore, weight: 1.2 },
    { score: project.smartMoneyAccumulationScore, weight: 1.1 },
    { score: project.smartWalletPerformanceScore, weight: 0.9 },
    { score: project.smartWalletScore, weight: 0.85 },
    { score: project.smartMoneyRotationScore, weight: 0.75 },
    { score: project.whaleActivityScore ?? project.whaleScore, weight: 0.65 },
    { score: project.capitalFlowScore, weight: 0.8 },
  ]);
}

function catalystCompression(project = {}) {
  return weighted([
    { score: project.liveCatalystRadarScore, weight: 1.15 },
    { score: project.catalystCalendarScore, weight: 1.05 },
    { score: project.roadmapProfitabilityScore, weight: 0.95 },
    { score: project.exchangeProbabilityScore, weight: 0.65 },
    { score: project.catalystScore, weight: 0.85 },
    { score: project.narrativeForecastScore, weight: 0.75 },
    { score: project.narrativeHeatScore, weight: 0.65 },
  ]);
}

function executionProof(project = {}, minLiquidity = DEFAULT_MIN_LIQUIDITY) {
  const route = routeEvidence(project);
  const chain = canonicalChain(project);
  const token = tokenAddress(project);
  const pool = poolAddress(project);
  const identityScore = hasVerifiedIdentity(project) ? 88 : chain && token ? 52 : 0;

  return weighted([
    { score: identityScore, weight: 0.95 },
    { score: route.score, weight: 1.2 },
    { score: liquidityScore(project, minLiquidity), weight: 1.0 },
    { score: project.activeLiquidityTruthScore, weight: 0.85 },
    { score: project.liquidityControlSafetyScore, weight: 0.65 },
    { score: project.executionProofScore, weight: 0.85 },
    { score: project.proofOfAlphaExecutionTwinScore, weight: 0.85 },
    { score: chain && token && pool ? 88 : chain && token ? 55 : 0, weight: 0.7 },
  ]);
}

function evidenceTrust(project = {}) {
  const familyCount = sourceFamiliesForProject(project).length;
  const evidenceCount = array(project.evidence).length;
  const sourceScore = weighted([
    { score: project.sourceTruthScore, weight: 1.1 },
    { score: project.sourceReliabilityScore, weight: 1.0 },
    { score: project.dataConfidenceScore, weight: 0.9 },
    { score: project.evidenceQualityScore, weight: 0.9 },
    { score: project.opportunityEvidenceCoverage, weight: 0.85 },
    { score: project.sniperEvidenceConfidence, weight: 0.75 },
  ]);
  const provenanceScore = weighted([
    { score: Math.min(92, familyCount * 18), weight: 1.0 },
    { score: Math.min(88, evidenceCount * 4), weight: 0.7 },
  ]);

  if (!sourceScore && !provenanceScore) return 25;
  return weighted([
    { score: sourceScore || 25, weight: 0.65 },
    { score: provenanceScore || 25, weight: 0.35 },
  ]);
}

function maxRisk(project = {}) {
  return Math.max(
    num(project.riskScore),
    num(project.trapRiskScore),
    num(project.sellPressureScore),
    num(project.honeypotRiskScore),
    num(project.contractAuthorityRiskScore),
    num(project.liquidityControlRiskScore ?? project.liquidityControlRisk),
    num(project.washTradingRiskScore ?? project.washTradingScore),
    num(project.activityAuthenticityRiskScore),
    num(project.walletClusterRiskScore),
    num(project.bundledLaunchRiskScore ?? project.bundledLaunchScore),
    num(project.deployerRiskScore),
    num(project.tokenUnlockRiskScore),
    num(project.vestingPressureScore),
    num(project.falsePositiveSimilarity),
    num(project.xBotRiskScore),
    project.verifiedScam ? 100 : 0,
    project.honeypotDetected ? 100 : 0
  );
}

function safetyIntegrity(project = {}) {
  const safetyScores = [
    project.instantSafetyScore,
    project.contractAuthoritySafetyScore,
    project.liquidityControlSafetyScore,
    project.organicEconomicIntegrityScore,
    project.organicDemandFirewallScore,
    project.sniperIntegrityScore,
    project.finalIntegrityScore,
  ];
  const hasSafety = safetyScores.some(hasNumber);
  const risk = maxRisk(project);
  const hasRisk = risk > 0;

  if (!hasSafety && !hasRisk) return 34;

  return weighted([
    ...safetyScores.map((score) => ({ score, weight: 1.0 })),
    { score: 100 - risk, weight: hasRisk || hasSafety ? 1.2 : 0 },
  ]);
}

function weightedComponentScore(components = {}) {
  const totalWeight = Object.values(COMPONENT_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  const score = Object.entries(COMPONENT_WEIGHTS).reduce(
    (sum, [key, weight]) => sum + clamp(components[key]) * weight,
    0
  );
  return Math.round(clamp(score / totalWeight));
}

function criticalVerdictReasons(project = {}) {
  const severeTerms = ["honeypot", "scam", "rug", "unsafe", "identity risk", "conflict", "defensive avoid", "rejected"];
  return inspectBlockingVerdicts(project)
    .blockingVerdictReasons.filter((reason) => {
      const text = normalizeDecisionText(reason);
      if (text.includes("route") || text.includes("unavailable") || text.includes("unverified")) return false;
      return severeTerms.some((term) => text.includes(term));
    });
}

function hardBlockers(project = {}, components = {}) {
  const blockers = [...criticalVerdictReasons(project)];
  const finalState = project.finalSelectionState || project.finalState;
  const preStatus = project.prePump?.status || project.preBreakoutMomentumStage || project.preBreakoutStatus;

  if (["BLOCKED", "IDENTITY_CONFLICT"].includes(finalState)) blockers.push(`Final selection state is ${finalState}.`);
  if (project.identityConflict || project.finalIdentityState === "CONFLICTED_IDENTITY") blockers.push("Identity conflict detected.");
  if (project.verifiedScam || project.honeypotDetected) blockers.push("Verified scam or honeypot evidence detected.");
  if (project.distressedTrapBlock) blockers.push("Distressed microcap trap block is active.");
  if (["ALREADY_PUMPED", "LATE_CHASE"].includes(preStatus)) blockers.push(`Timing state is ${preStatus}.`);
  if (["CRITICAL", "RESTRICTED"].includes(project.instantSafetyStatus)) blockers.push(`Instant safety gate is ${project.instantSafetyStatus}.`);
  if (["CRITICAL", "RESTRICTED"].includes(project.organicDemandFirewallStatus)) {
    blockers.push(`Organic demand firewall is ${project.organicDemandFirewallStatus}.`);
  }
  if (num(project.contractAuthorityRiskScore) >= 70 || num(project.honeypotRiskScore) >= 70) {
    blockers.push("Contract authority or honeypot risk is too high.");
  }
  if (num(project.liquidityControlRiskScore ?? project.liquidityControlRisk) >= 80) blockers.push("Liquidity control risk is too high.");
  if (num(project.washTradingRiskScore ?? project.washTradingScore) >= 78 || num(project.activityAuthenticityRiskScore) >= 80) {
    blockers.push("Wash trading or fake activity risk is too high.");
  }
  if (Math.max(num(project.walletClusterRiskScore), num(project.bundledLaunchRiskScore ?? project.bundledLaunchScore), num(project.deployerRiskScore)) >= 82) {
    blockers.push("Wallet cluster, bundled launch, or deployer risk is too high.");
  }
  if (Math.max(num(project.tokenUnlockRiskScore), num(project.vestingPressureScore)) >= 85) {
    blockers.push("Near-term unlock or vesting risk is too high.");
  }
  if (num(project.trapRiskScore) >= 78) blockers.push("Trap risk is too high.");
  if (num(project.sellPressureScore) >= 88) blockers.push("Sell pressure is too high.");
  if (components.safetyIntegrity < 30) blockers.push("Safety integrity is critically weak.");

  return [...new Set(blockers.filter(Boolean))];
}

function missingEvidence(project = {}, components = {}, minLiquidity = DEFAULT_MIN_LIQUIDITY) {
  const route = routeEvidence(project);
  const missing = [];

  if (!canonicalChain(project)) missing.push("supported chain");
  if (!tokenAddress(project)) missing.push("valid token contract");
  if (!poolAddress(project)) missing.push("tradable pool/pair");
  if (!hasVerifiedIdentity(project)) missing.push("verified identity");
  if (!route.verified) missing.push("verified fresh buy/sell execution route");
  if (liquidity(project) < minLiquidity) missing.push("minimum executable DEX liquidity");
  if (components.evidenceTrust < 58) missing.push("independent evidence quorum");
  if (components.safetyIntegrity < 62) missing.push("safety integrity confirmation");
  if (components.organicDemand < 52) missing.push("organic buyer/demand proof");
  if (components.catalystCompression < 48) missing.push("near-term catalyst compression");

  return [...new Set(missing)];
}

function componentDrivers(components = {}) {
  return Object.entries(components)
    .map(([name, score]) => ({ name, score: Math.round(clamp(score)) }))
    .filter((item) => item.score >= 55)
    .sort((a, b) => b.score - a.score)
    .slice(0, 7);
}

function confidence(score = 0, components = {}, blockers = [], missing = []) {
  if (blockers.length) return "Blocked";
  if (score >= 82 && components.evidenceTrust >= 70 && components.safetyIntegrity >= 70 && missing.length <= 1) return "Medium-High";
  if (score >= 72 && components.evidenceTrust >= 58 && components.safetyIntegrity >= 60 && missing.length <= 3) return "Medium";
  if (score >= 58) return "Developing";
  return "Low";
}

function laneFor(score = 0, project = {}, components = {}, blockers = [], missing = []) {
  const route = routeEvidence(project);
  const readyForArmed =
    !blockers.length &&
    score >= 78 &&
    canonicalChain(project) &&
    tokenAddress(project) &&
    poolAddress(project) &&
    hasVerifiedIdentity(project) &&
    route.verified &&
    liquidity(project) >= DEFAULT_MIN_LIQUIDITY &&
    components.evidenceTrust >= 58 &&
    components.safetyIntegrity >= 62 &&
    !missing.includes("organic buyer/demand proof");

  if (blockers.length) return "BLOCKED";
  if (readyForArmed) return "ARMED";
  if (score >= 62 && missing.length <= 5) return "WATCH";
  if (score >= 42) return "RESEARCH";
  return "LOW_PRIORITY";
}

function scenarioProbability(score = 0, components = {}, project = {}) {
  return Math.round(
    clamp(
      score * 0.44 +
        num(project.breakoutProbabilitySoon) * 0.18 +
        num(project.sevenDayTenXModeledScenarioPct) * 0.25 +
        components.pressureFormation * 0.08 +
        components.attentionGap * 0.05 -
        maxRisk(project) * 0.16,
      0,
      96
    )
  );
}

function verdictFor(lane = "LOW_PRIORITY", score = 0) {
  if (lane === "BLOCKED") return "Blocked Pre-Breakout Setup";
  if (lane === "ARMED") return "Proof-Gated Pre-Breakout Radar Candidate";
  if (lane === "WATCH") return "Pre-Breakout Watch Candidate";
  if (lane === "RESEARCH") return "Early Research Lead";
  return score > 0 ? "Low Priority Radar Lead" : "No Radar Signal";
}

export function analyzePreBreakoutRadar(project = {}, options = {}) {
  const minLiquidity = num(options.minLiquidity || DEFAULT_MIN_LIQUIDITY);
  const maxMarketCap = num(options.maxMarketCap || DEFAULT_MAX_MARKET_CAP);
  const route = routeEvidence(project);
  const components = {
    sizeAsymmetry: sizeAsymmetry(project, maxMarketCap),
    attentionGap: attentionGap(project),
    pressureFormation: pressureFormation(project),
    organicDemand: organicDemand(project),
    smartMoneyArrival: smartMoneyArrival(project),
    catalystCompression: catalystCompression(project),
    executionProof: executionProof(project, minLiquidity),
    evidenceTrust: evidenceTrust(project),
    safetyIntegrity: safetyIntegrity(project),
  };
  const rawScore = weightedComponentScore(components);
  const riskPenalty = Math.round(Math.max(0, maxRisk(project) - 45) * 0.28);
  const evidencePenalty = Math.round(Math.max(0, 52 - components.evidenceTrust) * 0.18);
  const score = Math.round(clamp(rawScore - riskPenalty - evidencePenalty));
  const blockers = hardBlockers(project, components);
  const missing = missingEvidence(project, components, minLiquidity);
  const lane = laneFor(score, project, components, blockers, missing);
  const probability = lane === "BLOCKED" ? 0 : scenarioProbability(score, components, project);
  const radarConfidence = confidence(score, components, blockers, missing);
  const drivers = componentDrivers(components);
  const verdict = verdictFor(lane, score);

  return {
    ...project,
    preBreakoutRadarScore: lane === "BLOCKED" ? Math.min(score, 25) : score,
    preBreakoutRadarRawScore: rawScore,
    preBreakoutRadarProbability: probability,
    preBreakoutRadarLane: lane,
    preBreakoutRadarVerdict: verdict,
    preBreakoutRadarConfidence: radarConfidence,
    preBreakoutRadarSelectedEligible: lane === "ARMED",
    preBreakoutRadarBlockers: blockers,
    preBreakoutRadarMissingEvidence: missing,
    preBreakoutRadarDrivers: drivers,
    preBreakoutRadar: {
      name: "Pre-Breakout Radar",
      objective: "Surface underrecognized early setups before wider attention while refusing proof-gated armed status without identity, route, liquidity, safety, catalyst, and independent evidence.",
      score: lane === "BLOCKED" ? Math.min(score, 25) : score,
      rawScore,
      lane,
      verdict,
      confidence: radarConfidence,
      scenarioProbabilityPct: probability,
      probabilityNote: "Heuristic scenario probability for research prioritization, not a calibrated profit probability.",
      componentWeights: COMPONENT_WEIGHTS,
      components,
      route,
      canonical: {
        chain: canonicalChain(project),
        tokenAddress: tokenAddress(project),
        poolAddress: poolAddress(project),
        liquidityUsd: liquidity(project),
        marketCapUsd: marketCap(project),
      },
      drivers,
      blockers,
      missingEvidence: missing,
      disclaimer: "Research output only. Not financial advice, not a buy recommendation, and not a guarantee of future performance.",
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Pre-Breakout Radar",
        signal: verdict,
        score: lane === "BLOCKED" ? Math.min(score, 25) : score,
        confidence: radarConfidence,
        impact: lane === "ARMED" ? "Positive" : lane === "BLOCKED" ? "Negative" : "Neutral",
        reasons: drivers.map((driver) => `${driver.name}: ${driver.score}`).slice(0, 6),
      },
    ],
  };
}

export function analyzePreBreakoutRadarBatch(projects = [], options = {}) {
  const targetCount = Math.max(1, Math.round(num(options.targetCount || DEFAULT_TARGET_COUNT)));
  const analyzed = (Array.isArray(projects) ? projects : []).map((project) =>
    analyzePreBreakoutRadar(project, options)
  );
  const armed = analyzed
    .map((project, index) => ({ project, index }))
    .filter(({ project }) => project.preBreakoutRadarSelectedEligible)
    .sort((a, b) => num(b.project.preBreakoutRadarScore) - num(a.project.preBreakoutRadarScore))
    .slice(0, targetCount);
  const watch = analyzed
    .map((project, index) => ({ project, index }))
    .filter(({ project }) => !project.preBreakoutRadarSelectedEligible && ["WATCH", "RESEARCH"].includes(project.preBreakoutRadarLane))
    .sort((a, b) => num(b.project.preBreakoutRadarScore) - num(a.project.preBreakoutRadarScore))
    .slice(0, Math.max(targetCount * 3, 15));
  const selectedRanks = new Map(armed.map(({ index }, rank) => [index, rank + 1]));
  const watchRanks = new Map(watch.map(({ index }, rank) => [index, rank + 1]));

  return analyzed.map((project, index) => {
    const selectionRank = selectedRanks.get(index) || null;
    const watchRank = watchRanks.get(index) || null;
    const selected = Boolean(selectionRank);

    return {
      ...project,
      preBreakoutRadarSelected: selected,
      preBreakoutRadarSelectionRank: selectionRank,
      preBreakoutRadarWatchRank: watchRank,
      alphaTags: selected
        ? [...new Set([...(project.alphaTags || []), "Pre-Breakout Radar Armed"])]
        : project.alphaTags,
      preBreakoutRadar: {
        ...(project.preBreakoutRadar || {}),
        selected,
        selectionRank,
        watchRank,
      },
    };
  });
}

function compact(project = {}) {
  return {
    selectionRank: project.preBreakoutRadarSelectionRank || null,
    watchRank: project.preBreakoutRadarWatchRank || null,
    selected: Boolean(project.preBreakoutRadarSelected),
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: canonicalChain(project) || "unknown",
    contractAddress: tokenAddress(project),
    poolAddress: poolAddress(project),
    lane: project.preBreakoutRadarLane || "UNKNOWN",
    verdict: project.preBreakoutRadarVerdict || "Unknown",
    score: project.preBreakoutRadarScore || 0,
    probability: project.preBreakoutRadarProbability || 0,
    confidence: project.preBreakoutRadarConfidence || "Unknown",
    marketCapUsd: marketCap(project),
    liquidityUsd: liquidity(project),
    finalSelectionState: project.finalSelectionState || "UNKNOWN",
    route: project.preBreakoutRadar?.route || routeEvidence(project),
    components: project.preBreakoutRadar?.components || {},
    drivers: project.preBreakoutRadarDrivers || [],
    blockers: project.preBreakoutRadarBlockers || [],
    missingEvidence: project.preBreakoutRadarMissingEvidence || [],
    disclaimer: project.preBreakoutRadar?.disclaimer,
  };
}

export function summarizePreBreakoutRadar(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const analyzed = safeProjects.filter((project) => project.preBreakoutRadar);
  const armed = analyzed
    .filter((project) => project.preBreakoutRadarSelected)
    .sort((a, b) => num(a.preBreakoutRadarSelectionRank) - num(b.preBreakoutRadarSelectionRank));
  const watch = analyzed
    .filter((project) => project.preBreakoutRadarWatchRank)
    .sort((a, b) => num(a.preBreakoutRadarWatchRank) - num(b.preBreakoutRadarWatchRank));

  return {
    generatedAt: new Date().toISOString(),
    name: "Pre-Breakout Radar",
    disclaimer: "Research output only. Not financial advice, not a buy recommendation, and not a guarantee of future performance.",
    totalProjects: safeProjects.length,
    analyzedProjects: analyzed.length,
    targetCount: DEFAULT_TARGET_COUNT,
    armedCount: armed.length,
    watchCount: analyzed.filter((project) => project.preBreakoutRadarLane === "WATCH").length,
    researchCount: analyzed.filter((project) => project.preBreakoutRadarLane === "RESEARCH").length,
    blockedCount: analyzed.filter((project) => project.preBreakoutRadarLane === "BLOCKED").length,
    armedCandidates: armed.map(compact),
    bestAvailableWatchlist: watch.map(compact),
    topProjects: [...analyzed]
      .sort((a, b) => num(b.preBreakoutRadarScore) - num(a.preBreakoutRadarScore))
      .slice(0, 50)
      .map(compact),
    operatingRules: [
      "Never mark ARMED without verified identity, chain, token contract, pool, execution route, liquidity, safety, and independent evidence.",
      "Keep WATCH and RESEARCH candidates visible when evidence is incomplete instead of forcing a pick.",
      "Block late-chase, honeypot, scam, unsafe-contract, wash-trading, severe unlock, and identity-conflict setups.",
      "Treat scenario probability as a research heuristic, not a profit probability or financial advice.",
    ],
  };
}
