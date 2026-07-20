import { sourceFamiliesForProject } from "../data/metricTruthNormalizer.js";
import { inspectBlockingVerdicts, normalizeDecisionText } from "../selection/blockingVerdictHelper.js";

const DEFAULT_TARGET_COUNT = Number(process.env.SEVEN_DAY_TENX_TARGET_COUNT || 3);
const DEFAULT_MAX_MARKET_CAP = Number(process.env.SEVEN_DAY_TENX_MAX_MARKET_CAP || 75_000_000);
const DEFAULT_MIN_LIQUIDITY = Number(process.env.SEVEN_DAY_TENX_MIN_LIQUIDITY || 10_000);

const COMPONENT_WEIGHTS = {
  lowCapLeverage: 14,
  sevenDayMomentum: 18,
  nearTermCatalyst: 16,
  organicDemand: 14,
  smartMoneyArrival: 12,
  liquidityTradability: 10,
  evidenceTrust: 10,
  safetyIntegrity: 6,
};

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function average(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (!active.length) return 0;
  return Math.round(clamp(active.reduce((sum, value) => sum + value, 0) / active.length));
}

function weightedScore(components = {}) {
  const totalWeight = Object.values(COMPONENT_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  const total = Object.entries(COMPONENT_WEIGHTS).reduce(
    (sum, [key, weight]) => sum + clamp(components[key]) * weight,
    0
  );
  return Math.round(clamp(total / totalWeight));
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function lower(value = "") {
  return String(value || "").trim().toLowerCase();
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function tokenAddress(project = {}) {
  return first([
    project.finalContractAddress,
    project.canonicalAddress,
    project.contractAddress,
    project.tokenAddress,
    project.address,
    project.baseToken?.address,
  ]);
}

function poolAddress(project = {}) {
  return first([project.primaryTradablePool, project.poolAddress, project.pairAddress, project.finalPairAddress]);
}

function chain(project = {}) {
  return first([project.canonicalChain, project.finalChain, project.chain, project.network, project.chainId]);
}

function marketCap(project = {}) {
  return num(first([project.circulatingMarketCapUsd, project.circulatingMarketCap, project.marketCap, project.estimatedMarketCapUsd]));
}

function liquidity(project = {}) {
  return num(first([
    project.dexLiquidityUsd,
    project.stableExitLiquidityUsd,
    project.hardExitLiquidityUsd,
    project.liquidityUsd,
    project.finalLiquidityUsd,
    project.activeLiquidityUsd,
    project.liquidity,
  ]));
}

function volume(project = {}) {
  return num(first([project.volume24h, project.volume, project.marketData?.volume24h, project.rawCandidate?.volume24h]));
}

function routeVerified(project = {}) {
  const status = normalizeDecisionText(project.executionProof?.executionStatus || project.executionStatus);
  return Boolean(
    ["VERIFIED", "PARTIALLY_VERIFIED"].includes(status) ||
      project.purchaseRouteConfirmed === true ||
      project.executionRouteAvailable === true ||
      project.purchaseRoute?.purchasable === true ||
      project.smallCapHunter?.purchaseRoute?.purchasable === true ||
      project.proofOfAlphaExecutionTwinSelected === true ||
      project.proofOfAlphaExecutionTwin?.route?.detected === true
  );
}

function hasVerifiedIdentity(project = {}) {
  return Boolean(
    project.identityVerified === true ||
      project.contractVerified === true ||
      project.projectIdentityVerdict === "Identity Resolved" ||
      ["VERIFIED_CONTRACT", "VERIFIED_LISTING"].includes(project.finalIdentityState || project.identityState)
  );
}

function daysUntil(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return null;
  return (parsed - Date.now()) / 86400000;
}

function textBlob(project = {}) {
  return [
    project.name,
    project.symbol,
    project.description,
    project.category,
    project.narrative,
    project.catalystWindow,
    project.opportunityThesis,
    ...(project.liveCatalystEvents || []).map((item) => `${item.type || ""} ${item.summary || ""} ${item.window || ""}`),
    ...(project.catalysts || []).map((item) => `${item.type || ""} ${item.summary || ""} ${item.window || ""}`),
    ...(project.roadmapMilestones || []).map((item) => `${item.title || ""} ${item.summary || ""}`),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function lowCapLeverage(project = {}, maxMarketCap = DEFAULT_MAX_MARKET_CAP) {
  const cap = marketCap(project);
  if (!cap) return 44;
  if (cap < 100_000) return 35;
  if (cap <= 1_000_000) return 96;
  if (cap <= 5_000_000) return 100;
  if (cap <= 15_000_000) return 92;
  if (cap <= 35_000_000) return 78;
  if (cap <= maxMarketCap) return 58;
  if (cap <= maxMarketCap * 2) return 32;
  return 10;
}

function sevenDayMomentum(project = {}) {
  const price24h = num(project.priceChange24h);
  const price7d = num(project.priceChange7d);
  const priceMomentum =
    price7d > 0 && price7d <= 90
      ? 50 + Math.min(38, price7d * 0.45)
      : price24h > 0 && price24h <= 45
      ? 50 + Math.min(32, price24h * 0.7)
      : 0;

  return average([
    project.accelerationScore,
    project.earlyBreakoutScore,
    project.preBreakoutMomentumScore,
    project.momentumShiftScore,
    project.momentumCompressionScore,
    project.volatilityExpansionScore,
    project.relativeStrengthScore,
    project.breakoutBrainScore,
    project.breakoutProbabilitySoon,
    project.prePump?.score,
    project.prePumpPatternScore,
    priceMomentum,
  ]);
}

function nearTermCatalyst(project = {}) {
  const text = textBlob(project);
  const events = [...array(project.liveCatalystEvents), ...array(project.catalysts), ...array(project.roadmapMilestones)];
  const explicitSoon = events.some((event) => {
    const delta = daysUntil(event.expectedDate || event.date || event.targetDate || event.dueDate);
    const eventText = lower(`${event.window || ""} ${event.type || ""} ${event.title || ""} ${event.summary || ""}`);
    return (delta !== null && delta >= -1 && delta <= 10) || /7d|week|this week|soon|imminent|mainnet|listing|airdrop|tge/.test(eventText);
  });
  const textSoon = /7d|this week|next week|imminent|mainnet|launch|listing|airdrop|tge|token generation|incentive|points/.test(text);

  return Math.round(
    clamp(
      average([
        project.liveCatalystRadarScore,
        project.catalystCalendarScore,
        project.catalystScore,
        project.roadmapProfitabilityScore,
        project.exchangeProbabilityScore,
        project.narrativeForecastScore,
        project.narrativeHeatScore,
      ]) + (explicitSoon ? 12 : textSoon ? 6 : 0)
    )
  );
}

function organicDemand(project = {}) {
  return average([
    project.organicBuyerScore,
    project.buyerRetentionScore,
    project.buyPressureScore,
    project.holderGrowthScore,
    project.organicEconomicIntegrityScore,
    project.activeLiquidityTruthScore,
    project.liquidityExpansionScore,
  ]);
}

function smartMoneyArrival(project = {}) {
  return average([
    project.smartWalletArrivalScore,
    project.smartWalletScore,
    project.smartWalletPerformanceScore,
    project.smartMoneyAccumulationScore,
    project.smartMoneyRotationScore,
    project.whaleActivityScore ?? project.whaleScore,
    project.capitalFlowScore,
  ]);
}

function liquidityTradability(project = {}, minLiquidity = DEFAULT_MIN_LIQUIDITY) {
  const liq = liquidity(project);
  const vol = volume(project);
  const liqScore =
    liq >= 1_000_000 ? 92 :
    liq >= 250_000 ? 88 :
    liq >= 75_000 ? 78 :
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
  const routeScore = routeVerified(project) ? 88 : 0;
  const controlScore = project.liquidityControlSafetyScore || (100 - num(project.liquidityControlRiskScore));

  return average([liqScore, volScore, routeScore, controlScore]);
}

function evidenceTrust(project = {}) {
  const familyCount = sourceFamiliesForProject(project).length;
  const evidenceCount = Array.isArray(project.evidence) ? project.evidence.length : 0;
  return Math.round(
    clamp(
      average([
        project.sourceTruthScore,
        project.sourceReliabilityScore,
        project.dataConfidenceScore,
        project.evidenceQualityScore,
        project.opportunityEvidenceCoverage,
        project.sniperEvidenceConfidence,
        Math.min(95, familyCount * 18),
        Math.min(85, evidenceCount * 4),
      ])
    )
  );
}

function safetyIntegrity(project = {}) {
  const risk = maxRisk(project);
  return average([
    project.instantSafetyScore,
    project.contractAuthoritySafetyScore,
    project.liquidityControlSafetyScore,
    project.organicEconomicIntegrityScore,
    project.sniperIntegrityScore,
    project.finalIntegrityScore,
    100 - risk,
  ]);
}

function maxRisk(project = {}) {
  return Math.max(
    num(project.riskScore),
    num(project.trapRiskScore),
    num(project.sellPressureScore),
    num(project.honeypotRiskScore),
    num(project.contractAuthorityRiskScore),
    num(project.liquidityControlRiskScore),
    num(project.washTradingRiskScore),
    num(project.walletClusterRiskScore),
    num(project.bundledLaunchRiskScore),
    num(project.deployerRiskScore),
    num(project.activityAuthenticityRiskScore),
    num(project.tokenUnlockRiskScore),
    num(project.vestingPressureScore),
    num(project.falsePositiveSimilarity),
    num(project.xBotRiskScore),
    project.verifiedScam ? 100 : 0,
    project.honeypotDetected ? 100 : 0
  );
}

function riskPenalties(project = {}) {
  const penalties = [];
  const add = (label, value, maxPenalty, reason) => {
    const score = clamp(value);
    if (score < 45) return;
    penalties.push({
      label,
      riskScore: Math.round(score),
      penalty: Number(((score / 100) * maxPenalty).toFixed(2)),
      reason,
    });
  };

  add("Contract authority risk", project.contractAuthorityRiskScore ?? project.honeypotRiskScore, 22, "Unsafe contract, honeypot, owner, mint, blacklist, or tax authority risk.");
  add("Liquidity control risk", project.liquidityControlRiskScore ?? project.liquidityControlRisk, 18, "LP/control/removal evidence is weak or unsafe.");
  add("Wash or fake-volume risk", project.washTradingRiskScore ?? project.activityAuthenticityRiskScore, 18, "Volume or activity may be inorganic.");
  add("Wallet/deployer concentration", Math.max(num(project.walletClusterRiskScore), num(project.deployerRiskScore), num(project.bundledLaunchRiskScore)), 16, "Wallet clusters, deployer behavior, or bundled launch risk is elevated.");
  add("Unlock or vesting pressure", Math.max(num(project.tokenUnlockRiskScore), num(project.vestingPressureScore)), 14, "Near-term unlock or vesting pressure can crush a 7-day setup.");
  add("Trap risk", project.trapRiskScore, 18, "Pattern resembles prior rug, trap, or false-positive setups.");
  add("Sell pressure", project.sellPressureScore, 12, "Sell pressure is too high for a clean near-term asymmetric setup.");

  const price7d = num(project.priceChange7d);
  const price24h = num(project.priceChange24h);
  const fundamentals = average([organicDemand(project), smartMoneyArrival(project), nearTermCatalyst(project), project.liquidityExpansionScore]);
  if (price7d >= 130 || price24h >= 65 || ["ALREADY_PUMPED", "LATE_CHASE"].includes(project.preBreakoutMomentumStage || project.prePump?.status)) {
    const lateRisk = fundamentals >= 70 ? 52 : price7d >= 220 || price24h >= 110 ? 92 : 72;
    add("Late-chase risk", lateRisk, 20, "Price already expanded; require fresh liquidity and buyer proof before treating it as early.");
  }

  return penalties;
}

function hardBlockers(project = {}, components = {}, minLiquidity = DEFAULT_MIN_LIQUIDITY) {
  const blockers = [...inspectBlockingVerdicts(project).blockingVerdictReasons];
  const finalState = project.finalSelectionState || project.finalState;

  if (["BLOCKED", "IDENTITY_CONFLICT"].includes(finalState)) blockers.push(`Final selection state is ${finalState}.`);
  if (project.identityConflict || project.finalIdentityState === "CONFLICTED_IDENTITY") blockers.push("Identity conflict detected.");
  if (!hasVerifiedIdentity(project)) blockers.push("Identity is not verified enough for a 7-day high-upside candidate.");
  if (!chain(project)) blockers.push("Chain is missing.");
  if (!tokenAddress(project)) blockers.push("Token contract address is missing.");
  if (!poolAddress(project)) blockers.push("Tradable pool/pair is missing.");
  if (!routeVerified(project)) blockers.push("Fresh buy/sell execution route is not verified.");
  if (liquidity(project) < minLiquidity) blockers.push("Visible tradable liquidity is below the minimum.");
  if (project.instantSafetyStatus === "CRITICAL" || project.instantSafetyStatus === "RESTRICTED") blockers.push(`Instant safety gate is ${project.instantSafetyStatus}.`);
  if (num(project.contractAuthorityRiskScore) >= 70 || project.honeypotDetected || project.verifiedScam) blockers.push("Contract authority or honeypot risk is too high.");
  if (num(project.liquidityControlRiskScore) >= 75) blockers.push("Liquidity control risk is too high.");
  if (num(project.washTradingRiskScore) >= 75 || num(project.activityAuthenticityRiskScore) >= 80) blockers.push("Wash trading or fake activity risk is too high.");
  if (num(project.tokenUnlockRiskScore) >= 82 || num(project.vestingPressureScore) >= 82) blockers.push("Near-term unlock or vesting risk is too high.");
  if (components.evidenceTrust < 45) blockers.push("Independent evidence is too thin for a 7-day asymmetric candidate.");
  if (components.safetyIntegrity < 45) blockers.push("Safety integrity is too weak.");

  return [...new Set(blockers.filter(Boolean))];
}

function missingEvidence(project = {}, components = {}) {
  return [
    ...(!tokenAddress(project) ? ["verified token contract"] : []),
    ...(!poolAddress(project) ? ["tradable pool"] : []),
    ...(!routeVerified(project) ? ["fresh buy/sell execution route"] : []),
    ...(liquidity(project) <= 0 ? ["DEX liquidity"] : []),
    ...(components.nearTermCatalyst < 55 ? ["near-term catalyst proof"] : []),
    ...(components.organicDemand < 55 ? ["organic buyer/demand proof"] : []),
    ...(components.smartMoneyArrival < 50 ? ["smart-wallet arrival proof"] : []),
    ...(components.evidenceTrust < 60 ? ["independent source evidence"] : []),
    ...(project.securityEvidenceStatus === "UNKNOWN" || !project.contractSafetyVerified ? ["free security-provider confirmation"] : []),
  ];
}

function asymmetricScenarioStrength(score = 0, components = {}, penalties = []) {
  const penaltyDrag = penalties.reduce((sum, item) => sum + num(item.penalty), 0);
  const rareEventBase = Math.max(0, (score - 52) * 0.28);
  const leverageBoost = Math.max(0, (components.lowCapLeverage - 70) * 0.035);
  const catalystBoost = Math.max(0, (components.nearTermCatalyst - 65) * 0.03);
  const safetyDrag = Math.max(0, (60 - components.safetyIntegrity) * 0.04);
  return Number(clamp(rareEventBase + leverageBoost + catalystBoost - safetyDrag - penaltyDrag * 0.08, 0, 24).toFixed(2));
}

function confidence(score = 0, components = {}, blockers = []) {
  if (blockers.length) return "Blocked";
  const evidence = components.evidenceTrust;
  const safety = components.safetyIntegrity;
  if (score >= 84 && evidence >= 70 && safety >= 70) return "Medium-High";
  if (score >= 74 && evidence >= 60 && safety >= 60) return "Medium";
  if (score >= 60) return "Developing";
  return "Low";
}

function verdict(score = 0, blockers = [], components = {}, missing = []) {
  if (blockers.length) return "Blocked 7-Day Asymmetric Setup";
  if (score >= 84 && components.lowCapLeverage >= 65 && components.nearTermCatalyst >= 62 && missing.length <= 1) {
    return "Qualified 7-Day Asymmetric Research Candidate";
  }
  if (score >= 72) return "Conditional 7-Day Watch Candidate";
  if (score >= 58) return "Developing 7-Day Watch";
  return "Low 7-Day Asymmetric Evidence";
}

function reasons(project = {}, components = {}) {
  return Object.entries(components)
    .filter(([, score]) => num(score) >= 62)
    .sort((a, b) => num(b[1]) - num(a[1]))
    .map(([component, score]) => `${component}: ${Math.round(score)}`)
    .concat(array(project.moneyRankDrivers).slice(0, 2))
    .slice(0, 8);
}

function paperPlan(project = {}, scenarioStrength = 0) {
  return {
    mode: "Research-only watch plan",
    horizon: "7 days",
    asymmetricScenarioStrength: scenarioStrength,
    modeledTenXScenarioPct: scenarioStrength,
    note: "This is a rare-event scenario-strength heuristic, not an empirically calibrated probability and not financial advice.",
    confirmBeforeAnyRealTrade: [
      "Verify official contract, chain, pool, and website.",
      "Verify exchange, wallet, DEX, aggregator, or bridge-aware route, slippage, taxes, and sell simulation.",
      "Reject if price already ran ahead of liquidity, buyers, and catalyst proof.",
      "Reject if contract authority, LP control, unlock, deployer, or wash-trading risk rises.",
    ],
    invalidationTriggers: [
      "Safety or liquidity-control risk becomes high.",
      "Near-term catalyst disappears or is proven rumor-only.",
      "Organic buyer or smart-wallet evidence weakens.",
      "Price expands sharply while liquidity or buyer quality does not improve.",
    ],
  };
}

export function analyzeSevenDayTenXResearch(project = {}, options = {}) {
  const maxMarketCap = num(options.maxMarketCap || DEFAULT_MAX_MARKET_CAP);
  const minLiquidity = num(options.minLiquidity || DEFAULT_MIN_LIQUIDITY);
  const components = {
    lowCapLeverage: lowCapLeverage(project, maxMarketCap),
    sevenDayMomentum: sevenDayMomentum(project),
    nearTermCatalyst: nearTermCatalyst(project),
    organicDemand: organicDemand(project),
    smartMoneyArrival: smartMoneyArrival(project),
    liquidityTradability: liquidityTradability(project, minLiquidity),
    evidenceTrust: evidenceTrust(project),
    safetyIntegrity: safetyIntegrity(project),
  };
  const rawScore = weightedScore(components);
  const penalties = riskPenalties(project);
  const penaltyTotal = Number(penalties.reduce((sum, item) => sum + num(item.penalty), 0).toFixed(2));
  const score = Math.round(clamp(rawScore - penaltyTotal));
  const blockers = hardBlockers(project, components, minLiquidity);
  const missing = missingEvidence(project, components);
  const scenarioStrength = asymmetricScenarioStrength(score, components, penalties);
  const tenXVerdict = verdict(score, blockers, components, missing);
  const selectedEligible =
    blockers.length === 0 &&
    score >= 74 &&
    components.lowCapLeverage >= 55 &&
    components.sevenDayMomentum >= 55 &&
    components.nearTermCatalyst >= 55 &&
    components.evidenceTrust >= 50 &&
    components.safetyIntegrity >= 58;

  return {
    ...project,
    sevenDayTenXScore: score,
    sevenDayTenXRawScore: rawScore,
    sevenDayTenXPenaltyTotal: penaltyTotal,
    sevenDayTenXVerdict: tenXVerdict,
    sevenDayTenXConfidence: confidence(score, components, blockers),
    sevenDayTenXSelectedEligible: selectedEligible,
    sevenDayAsymmetricScenarioStrength: scenarioStrength,
    sevenDayTenXModeledScenarioPct: scenarioStrength,
    sevenDayTenXMarketCap: marketCap(project),
    sevenDayTenXLiquidityUsd: liquidity(project),
    sevenDayTenXBlockers: blockers,
    sevenDayTenXMissingEvidence: missing,
    sevenDayTenX: {
      name: "7-Day Asymmetric Research Engine",
      objective: "Find small-cap candidates with unusually strong 7-day asymmetric upside evidence while blocking unsafe or thin-proof setups.",
      score,
      rawScore,
      penaltyTotal,
      verdict: tenXVerdict,
      confidence: confidence(score, components, blockers),
      asymmetricScenarioStrength: scenarioStrength,
      modeledTenXScenarioPct: scenarioStrength,
      selectedEligible,
      componentWeights: COMPONENT_WEIGHTS,
      components,
      penalties,
      blockers,
      missingEvidence: missing,
      reasons: reasons(project, components),
      paperPlan: paperPlan(project, scenarioStrength),
      disclaimer: "Research signal only. Not financial advice, not a buy recommendation, and not a profit guarantee.",
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "7-Day Asymmetric Research",
        signal: tenXVerdict,
        score,
        confidence: confidence(score, components, blockers),
        impact: selectedEligible ? "Positive" : blockers.length ? "Negative" : "Neutral",
        reasons: reasons(project, components),
      },
    ],
  };
}

export function analyzeSevenDayTenXResearchBatch(projects = [], options = {}) {
  const targetCount = Math.max(1, Math.round(num(options.targetCount || DEFAULT_TARGET_COUNT)));
  const analyzed = (Array.isArray(projects) ? projects : []).map((project) =>
    analyzeSevenDayTenXResearch(project, options)
  );
  const eligible = analyzed
    .map((project, index) => ({ project, index }))
    .filter(({ project }) => project.sevenDayTenXSelectedEligible)
    .sort((a, b) => num(b.project.sevenDayTenXScore) - num(a.project.sevenDayTenXScore))
    .slice(0, targetCount);
  const watch = analyzed
    .map((project, index) => ({ project, index }))
    .filter(({ project }) => !project.sevenDayTenXSelectedEligible && num(project.sevenDayTenXScore) >= 45)
    .sort((a, b) => num(b.project.sevenDayTenXScore) - num(a.project.sevenDayTenXScore))
    .slice(0, Math.max(targetCount, 10));
  const selectedRanks = new Map(eligible.map(({ index }, rank) => [index, rank + 1]));
  const watchRanks = new Map(watch.map(({ index }, rank) => [index, rank + 1]));

  return analyzed.map((project, index) => {
    const selectionRank = selectedRanks.get(index) || null;
    const watchRank = watchRanks.get(index) || null;
    const selected = Boolean(selectionRank);

    return {
      ...project,
      sevenDayTenXSelected: selected,
      sevenDayTenXSelectionRank: selectionRank,
      sevenDayTenXWatchRank: watchRank,
      sevenDayTenXVerdict: selected
        ? "Top 7-Day Asymmetric Research Candidate"
        : project.sevenDayTenXVerdict,
      alphaTags: selected
        ? [...new Set([...(project.alphaTags || []), "7-Day Asymmetric Research Candidate"])]
        : project.alphaTags,
      sevenDayTenX: {
        ...(project.sevenDayTenX || {}),
        selected,
        selectionRank,
        watchRank,
      },
    };
  });
}

export function summarizeSevenDayTenXResearch(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const analyzed = safeProjects.filter((project) => project.sevenDayTenX);
  const selected = analyzed
    .filter((project) => project.sevenDayTenXSelected)
    .sort((a, b) => num(a.sevenDayTenXSelectionRank) - num(b.sevenDayTenXSelectionRank));
  const watch = analyzed
    .filter((project) => project.sevenDayTenXWatchRank)
    .sort((a, b) => num(a.sevenDayTenXWatchRank) - num(b.sevenDayTenXWatchRank));

  return {
    generatedAt: new Date().toISOString(),
    name: "7-Day Asymmetric Research Engine",
    disclaimer: "Research output only. Not financial advice, not a buy recommendation, and not a guarantee of 10x returns.",
    totalProjects: safeProjects.length,
    analyzedProjects: analyzed.length,
    targetCount: DEFAULT_TARGET_COUNT,
    selectedCount: selected.length,
    watchCount: watch.length,
    selected: selected.map(compact),
    bestAvailableWatchlist: watch.map(compact),
    blockedCount: analyzed.filter((project) => array(project.sevenDayTenXBlockers).length > 0).length,
    topProjects: [...analyzed]
      .sort((a, b) => num(b.sevenDayTenXScore) - num(a.sevenDayTenXScore))
      .slice(0, 50)
      .map(compact),
  };
}

function compact(project = {}) {
  return {
    selectionRank: project.sevenDayTenXSelectionRank || null,
    watchRank: project.sevenDayTenXWatchRank || null,
    selected: Boolean(project.sevenDayTenXSelected),
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: chain(project) || "unknown",
    contractAddress: tokenAddress(project) || null,
    poolAddress: poolAddress(project) || null,
    score: project.sevenDayTenXScore || 0,
    verdict: project.sevenDayTenXVerdict || "Unknown",
    confidence: project.sevenDayTenXConfidence || "Unknown",
    modeledTenXScenarioPct: project.sevenDayTenXModeledScenarioPct || 0,
    marketCap: project.sevenDayTenXMarketCap || 0,
    liquidityUsd: project.sevenDayTenXLiquidityUsd || 0,
    finalSelectionState: project.finalSelectionState || "UNKNOWN",
    routeVerified: routeVerified(project),
    asymmetricScenarioStrength: project.sevenDayAsymmetricScenarioStrength || project.sevenDayTenXModeledScenarioPct || 0,
    componentScores: project.sevenDayTenX?.components || {},
    blockers: project.sevenDayTenXBlockers || [],
    missingEvidence: project.sevenDayTenXMissingEvidence || [],
    penalties: project.sevenDayTenX?.penalties || [],
    reasons: project.sevenDayTenX?.reasons || [],
    paperPlan: project.sevenDayTenX?.paperPlan || {},
  };
}
