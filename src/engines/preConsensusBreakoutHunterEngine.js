import { inspectBlockingVerdicts, normalizeDecisionText } from "../selection/blockingVerdictHelper.js";
import { analyzeQuietAccumulation } from "./quietAccumulationEngine.js";
import { analyzePreBreakoutMomentum } from "./preBreakoutMomentumEngine.js";
import { analyzeInformationAdvantage } from "./informationAdvantageEngine.js";
import { analyzeDistressedMicrocapTrap } from "./distressedMicrocapTrapEngine.js";

const TOP_TIER_GATES = new Set([
  "Exceptional Pre-Consensus Candidate",
  "High-Conviction Research Candidate",
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

function weightedAverage(items = []) {
  const active = items.filter((item) => num(item.score) > 0);
  if (!active.length) return 0;
  const total = active.reduce((sum, item) => sum + num(item.score) * item.weight, 0);
  const weight = active.reduce((sum, item) => sum + item.weight, 0);
  return clamp(total / weight);
}

function lower(value = "") {
  return String(value || "").trim().toLowerCase();
}

function textFor(project = {}) {
  return [
    project.name,
    project.symbol,
    project.description,
    project.category,
    project.narrative,
    project.opportunityThesis,
    project.whyThisMatters,
    project.aiThesis?.memo,
    ...(project.roadmapMilestones || []).map((item) => item.title || item.summary || item.type),
    ...(project.liveCatalystEvents || []).map((item) => item.type || item.summary),
    ...(project.catalysts || []).map((item) => item.label || item.type || item.summary),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function includesAny(text = "", words = []) {
  return words.some((word) => text.includes(word));
}

function projectAgeDays(project = {}) {
  const raw = project.pairCreatedAt || project.createdAt || project.launchDate || project.firstSeenAt || project.nativeLifecycle?.firstSeenAt;
  if (!raw) return null;
  const parsed = new Date(raw).getTime();
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, (Date.now() - parsed) / 86400000);
}

function candidateTypeFor(project = {}) {
  const text = textFor(project);
  const age = projectAgeDays(project);
  const prelaunch =
    project.discoveryLane === "prelaunch" ||
    project.stage === "prelaunch" ||
    includesAny(text, [
      "pre launch",
      "prelaunch",
      "tge",
      "token generation",
      "mainnet",
      "testnet",
      "validator",
      "incentive",
      "points program",
      "airdrop",
    ]);
  const early =
    project.discoveryLane === "new-pool" ||
    project.nativeLifecycle ||
    (age !== null && age <= 90) ||
    project.nativeLifecycleStage ||
    num(project.nativeDiscoveryScore) > 0;
  const reaccelerating =
    project.legitimateReacceleration ||
    (num(project.priceDrawdownPct || project.drawdownFromAthPct) >= 60 &&
      average([
        project.developerActivityScore ?? project.developerScore,
        project.adoptionAccelerationScore,
        project.liquidityFormationScore,
        project.liveCatalystRadarScore,
        project.protocolRevenueGrowthPct,
      ]) >= 55);

  if (reaccelerating) return "NEGLECTED_REACCELERATION";
  if (prelaunch && !early) return "PRE_LAUNCH";
  if (early) return "EARLY_LAUNCH";
  return prelaunch ? "PRE_LAUNCH" : "EARLY_LAUNCH";
}

function leadingIndicatorCategories(project = {}) {
  const categories = [];

  if (num(project.developerActivityScore ?? project.developerScore) >= 60 || num(project.githubProScore) >= 60) categories.push("developerAcceleration");
  if (num(project.adoptionAccelerationScore) >= 60 || num(project.organicBuyerScore) >= 60 || num(project.buyerRetentionScore) >= 60) categories.push("adoption");
  if (num(project.liquidityFormationScore) >= 60 || num(project.liquidityExpansionScore) >= 60) categories.push("liquidityFormation");
  if (num(project.smartWalletAccumulationScore) >= 60 || num(project.smartMoneyAccumulationScore) >= 60) categories.push("smartWalletAccumulation");
  if (num(project.liveCatalystRadarScore) >= 60 || num(project.catalystCalendarScore) >= 60) categories.push("verifiedCatalyst");
  if (num(project.informationAdvantageScore) >= 60) categories.push("informationAdvantage");
  if (project.quietAccumulationDetected) categories.push("quietAccumulation");

  return categories;
}

function signalCategoryScores(project = {}) {
  return {
    identityAndData: average([
      project.finalIntegrityScore,
      project.dataConfidenceScore,
      project.identityResolutionScore,
      project.sourceTruthScore,
      project.sourceReliabilityScore,
    ]),
    developerAcceleration: average([
      project.developerActivityScore ?? project.developerScore,
      project.githubProScore,
      project.githubScore ?? project.githubQualityScore,
      project.githubVelocityScore,
    ]),
    realAdoptionAcceleration: average([
      project.adoptionAccelerationScore,
      project.organicBuyerScore,
      project.buyerRetentionScore,
      project.holderGrowthScore,
      project.uniqueBuyerGrowth,
      project.protocolRevenueGrowthPct,
      project.protocolFeeGrowthScore,
    ]),
    liquidityFormation: average([
      project.liquidityFormationScore,
      project.liquidityExpansionScore,
      project.activeLiquidityTruthScore,
      project.nativeDiscoveryScore,
    ]),
    smartWalletAccumulation: average([
      project.smartWalletAccumulationScore,
      project.smartMoneyAccumulationScore,
      project.smartWalletPerformanceScore,
      project.whaleActivityScore ?? project.whaleScore,
    ]),
    narrativeEmergence: average([
      project.narrativeHeatScore,
      project.narrativeForecastScore,
      project.infrastructureNarrativeScore,
      project.xSocialScore < 60 ? project.narrativeScore : 0,
    ]),
    catalystQuality: average([
      project.liveCatalystRadarScore,
      project.catalystCalendarScore,
      project.catalystScore,
      project.roadmapProfitabilityScore,
      project.exchangeProbabilityScore,
    ]),
    quietAccumulation: num(project.quietAccumulationScore),
    preBreakoutMomentum: num(project.preBreakoutMomentumScore),
    informationAdvantage: num(project.informationAdvantageScore),
    tokenValueCapture: average([
      project.tokenValueCaptureScore,
      project.tokenomicsScore,
      project.protocolRevenueGrowthPct,
      project.feeSwitchScore,
      project.buybackScore,
      project.stakingMomentumScore,
    ]),
  };
}

function hardBlockers(project = {}) {
  const blockers = [];
  const verdicts = inspectBlockingVerdicts(project);

  blockers.push(...verdicts.blockingVerdictReasons);
  if (project.finalSelectionState && project.finalSelectionState !== "QUALIFIED") {
    blockers.push(`Final selection state is ${project.finalSelectionState}.`);
  }
  if (project.finalIdentityState === "CONFLICTED_IDENTITY" || project.identityConflict) blockers.push("Identity conflict detected.");
  if (!project.contractVerified && !project.contractAddress && !project.address && !project.tokenAddress) blockers.push("Missing verified contract.");
  if (!project.chainVerified && !project.chain) blockers.push("Missing verified chain.");
  if (!project.liquidityVerified && num(project.liquidityUsd || project.liquidity) <= 0) blockers.push("Liquidity is missing or unverified.");
  if (project.purchaseRouteConfirmed === false || project.smallCapHunter?.purchaseRoute?.purchasable === false) blockers.push("Purchase route unavailable.");
  if (project.executionRouteAvailable === false || normalizeDecisionText(project.proofOfAlphaExecutionTwinVerdict).includes("block")) blockers.push("Execution route blocked.");
  if (project.preBreakoutMomentumStage === "ALREADY_PUMPED") blockers.push("Already-pumped price action.");
  if (project.preBreakoutMomentumStage === "LATE_CHASE") blockers.push("Late-chase price action.");
  if (project.distressedTrapBlock) blockers.push("Distressed microcap trap risk.");
  if (num(project.washTradingRiskScore) >= 70) blockers.push("Wash trading risk.");
  if (num(project.botClusterRiskScore) >= 70 || num(project.sybilRiskScore) >= 70) blockers.push("Bot or sybil risk.");
  if (num(project.honeypotRiskScore) >= 70 || project.honeypotDetected) blockers.push("Honeypot or contract safety risk.");
  if (num(project.tokenUnlockRiskScore) >= 78 || num(project.vestingPressureScore) >= 78) blockers.push("Large imminent unlock or vesting pressure.");

  return [...new Set(blockers)];
}

function topTierSafetyGates(project = {}) {
  const identityOk =
    project.identityVerified === true ||
    ["VERIFIED_CONTRACT", "VERIFIED_LISTING"].includes(project.finalIdentityState || project.identityState) ||
    project.projectIdentityVerdict === "Identity Resolved";
  const contractOk =
    project.contractVerified === true ||
    project.finalIdentityState === "VERIFIED_CONTRACT" ||
    (project.finalIdentityState === "VERIFIED_LISTING" && project.listingVerified === true);
  const chainOk =
    project.chainVerified === true ||
    project.finalIdentityState === "VERIFIED_LISTING" ||
    Boolean(project.chain && !["unknown", "research"].includes(lower(project.chain)));
  const liquidityOk =
    project.liquidityVerified === true ||
    num(project.liquidityUsd || project.finalLiquidityUsd || project.activeLiquidityUsd) > 0;
  const routeOk =
    project.purchaseRouteConfirmed === true ||
    project.purchaseRoute?.purchasable === true ||
    project.smallCapHunter?.purchaseRoute?.purchasable === true;

  return {
    identityOk,
    contractOk,
    chainOk,
    liquidityOk,
    routeOk,
    passed: identityOk && contractOk && chainOk && liquidityOk && routeOk,
  };
}

function antiManipulationConfidence(project = {}) {
  const manipulationRisk = Math.max(
    num(project.washTradingRiskScore),
    num(project.walletClusterRiskScore),
    num(project.botClusterRiskScore),
    num(project.sybilRiskScore),
    num(project.fakeVolumeRiskScore),
    num(project.insiderWalletSharePct) >= 45 ? 70 : 0,
    num(project.bundledLaunchRiskScore),
    num(project.deployerRiskScore),
    num(project.trapRiskScore)
  );

  return Math.round(clamp(100 - manipulationRisk));
}

function regimeFor(project = {}) {
  const raw = lower(project.marketRegime || project.marketContext?.regime || process.env.MARKET_REGIME || "");
  if (raw.includes("risk-on") || raw.includes("risk on")) return "RISK_ON";
  if (raw.includes("risk-off") || raw.includes("risk off")) return "RISK_OFF";
  if (raw.includes("btc")) return "BTC_DOMINANCE_EXPANSION";
  if (raw.includes("alt")) return "ALTCOIN_EXPANSION";
  if (raw.includes("meme")) return "MEME_SPECULATION";
  if (raw.includes("contraction")) return "LIQUIDITY_CONTRACTION";
  if (raw.includes("expansion")) return "LIQUIDITY_EXPANSION";
  if (raw.includes("shock")) return "VOLATILITY_SHOCK";
  if (raw.includes("rotation")) return "SECTOR_ROTATION";
  return "UNKNOWN";
}

function regimeCompatibility(project = {}, regime = "UNKNOWN") {
  const risk = Math.max(num(project.riskScore), num(project.trapRiskScore), num(project.distributionRisk));
  const liquidity = num(project.liquidityFormationScore || project.liquidityExpansionScore);
  const narrative = num(project.narrativeHeatScore || project.narrativeForecastScore);
  const fundamentals = average([
    project.developerActivityScore ?? project.developerScore,
    project.adoptionAccelerationScore,
    project.quietAccumulationScore,
    project.informationAdvantageScore,
  ]);

  if (regime === "RISK_ON" || regime === "ALTCOIN_EXPANSION") return Math.round(clamp(fundamentals * 0.55 + narrative * 0.3 + liquidity * 0.15 - risk * 0.08));
  if (regime === "RISK_OFF" || regime === "LIQUIDITY_CONTRACTION") return Math.round(clamp(fundamentals * 0.55 + liquidity * 0.35 - risk * 0.38));
  if (regime === "BTC_DOMINANCE_EXPANSION") return Math.round(clamp(fundamentals * 0.55 + liquidity * 0.25 - risk * 0.25));
  if (regime === "MEME_SPECULATION") return Math.round(clamp(fundamentals * 0.45 + narrative * 0.22 + liquidity * 0.18 - risk * 0.18));
  if (regime === "VOLATILITY_SHOCK") return Math.round(clamp(liquidity * 0.45 + fundamentals * 0.4 - risk * 0.45));
  if (regime === "SECTOR_ROTATION") return Math.round(clamp(fundamentals * 0.5 + narrative * 0.35 + project.informationAdvantageScore * 0.15 - risk * 0.18));
  return Math.round(clamp(fundamentals * 0.48 + liquidity * 0.25 + narrative * 0.2 - risk * 0.16 + 8));
}

function tierFor(score = 0) {
  if (score >= 90) return "Exceptional Pre-Consensus Candidate";
  if (score >= 80) return "High-Conviction Research Candidate";
  if (score >= 70) return "Strong Early Watchlist";
  if (score >= 60) return "Developing Signal";
  if (score >= 45) return "Speculative Research Only";
  return "Reject";
}

function signalPersistence(project = {}) {
  const history = Array.isArray(project.signalHistory) ? project.signalHistory : [];
  const scores = history.map((item) => num(item.score ?? item.pipelineScore ?? item.preConsensusOpportunityScore)).filter((value) => value > 0);
  const liquidity = history.map((item) => num(item.liquidityUsd)).filter((value) => value > 0);
  const signalPersistenceScore = scores.length >= 4 ? 82 : scores.length >= 2 ? 62 : project.projectWatchChange?.scoreTrend === "accelerating" ? 58 : 32;
  const signalAccelerationScore =
    scores.length >= 2
      ? clamp(scores.at(-1) - scores[0] + 50)
      : num(project.projectChangeScore || project.institutionalLearning?.scoreDelta) > 0
      ? clamp(50 + num(project.projectChangeScore || project.institutionalLearning?.scoreDelta))
      : 35;
  const signalConsistencyScore =
    scores.length >= 3
      ? clamp(100 - Math.max(...scores.map((score) => Math.abs(score - scores.reduce((sum, value) => sum + value, 0) / scores.length))))
      : signalPersistenceScore;
  const signalDecayScore =
    scores.length >= 2 && scores.at(-1) < scores[0]
      ? clamp(scores[0] - scores.at(-1) + (liquidity.length >= 2 && liquidity.at(-1) < liquidity[0] ? 20 : 0))
      : 0;

  return {
    signalPersistenceScore: Math.round(signalPersistenceScore),
    signalAccelerationScore: Math.round(signalAccelerationScore),
    signalConsistencyScore: Math.round(signalConsistencyScore),
    signalDecayScore: Math.round(signalDecayScore),
  };
}

function catalystTimeline(project = {}) {
  const officialish = ["official", "docs", "github", "onchain", "exchange", "governance", "project"];
  const events = [
    ...(project.liveCatalystEvents || []),
    ...(project.roadmapMilestones || []),
    ...(project.catalysts || []),
  ];

  return events.slice(0, 8).map((event) => {
    const sourceText = [
      event.source,
      event.sourceType,
      ...(event.verificationSources || []),
      ...(event.sources || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const rumor = lower(event.type || event.label || event.title).includes("rumor") || sourceText.includes("rumor");
    const sourceConfidence = rumor
      ? "Low"
      : officialish.some((word) => sourceText.includes(word))
      ? "High"
      : event.score >= 70
      ? "Medium"
      : "Developing";

    return {
      catalystType: event.catalystType || event.type || event.label || event.title || "Unknown Catalyst",
      expectedDate: event.expectedDate || event.date || event.window || "Unknown",
      dateConfidence: event.dateConfidence || (event.expectedDate || event.date ? "Medium" : "Low"),
      sourceConfidence,
      likelyImpact: event.likelyImpact || event.urgency || "Unknown",
      alreadyPricedIn: Boolean(event.alreadyPricedIn || project.preBreakoutMomentumStage === "ALREADY_PUMPED"),
      dependencyRisks: event.dependencyRisks || event.risks || [],
      verificationSources: event.verificationSources || event.sources || [],
    };
  });
}

function upsideScenarios(project = {}, score = 0, hardBlockersList = []) {
  const marketCap = Math.max(num(project.marketCap), num(project.verifiedMarketCap), num(project.circulatingMarketCap), num(project.smallCapMarketCap));
  const fdv = Math.max(num(project.fdv), num(project.fullyDilutedValue));
  const liquidity = Math.max(num(project.liquidityUsd), num(project.finalLiquidityUsd), num(project.activeLiquidityUsd));
  const dataReady = marketCap > 0 && liquidity > 0 && hardBlockersList.length === 0;

  if (!dataReady) {
    return {
      confidence: "Insufficient",
      reason: "Market cap, liquidity, or blocker data is insufficient for probability estimates.",
      probabilityOf2x: null,
      probabilityOf3x: null,
      probabilityOf5x: null,
      probabilityOfMajorLoss: null,
    };
  }

  const risk = Math.max(num(project.riskScore), num(project.trapRiskScore), num(project.distributionRisk), 10);
  const liquidityQuality = clamp(Math.log10(Math.max(10, liquidity)) * 12);
  const fdvPressure = fdv > marketCap && fdv / marketCap >= 5 ? 14 : fdv > marketCap && fdv / marketCap >= 2.5 ? 7 : 0;
  const probabilityOf2x = Math.round(clamp(score * 0.58 + liquidityQuality * 0.16 - risk * 0.24 - fdvPressure, 2, 72));
  const probabilityOf3x = Math.round(clamp(probabilityOf2x * 0.58 - risk * 0.08 - fdvPressure * 0.4, 1, 48));
  const probabilityOf5x = Math.round(clamp(probabilityOf2x * 0.28 - risk * 0.06 - fdvPressure * 0.45, 0, 24));
  const probabilityOfMajorLoss = Math.round(clamp(risk * 0.5 + fdvPressure + (liquidity < 50_000 ? 18 : 0), 4, 78));

  return {
    bearScenario: "Catalyst slips, liquidity weakens, or risk flags rise before consensus forms.",
    baseScenario: "Fundamentals continue improving and market recognition gradually catches up.",
    bullScenario: "Verified catalyst plus liquidity and adoption expansion trigger broader crypto-native discovery.",
    extremeScenario: "Category-level narrative expansion and exchange access arrive while float/liquidity remain favorable.",
    probabilityOf2x,
    probabilityOf3x,
    probabilityOf5x,
    probabilityOfMajorLoss,
    expectedValueRange: `${Math.max(-65, probabilityOfMajorLoss * -1)}% to +${Math.round(probabilityOf2x * 1.4)}%`,
    timeHorizon: "30d-180d",
    majorAssumptions: [
      "Current liquidity remains sellable.",
      "Catalysts are not already priced in.",
      "No hidden contract, insider, or route risk appears.",
      "Market regime remains compatible with the project category.",
    ],
    invalidationConditions: [
      "Final selection integrity blocks the project.",
      "Liquidity or buyer growth reverses.",
      "Developer/adoption acceleration fades.",
      "Price moves vertically without matching fundamentals.",
      "Catalyst evidence is disproven or delayed.",
    ],
  };
}

function topSignals(scores = {}, project = {}) {
  return Object.entries(scores)
    .map(([name, score]) => ({ name, score: Math.round(score) }))
    .filter((item) => item.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((item) => `${item.name}: ${item.score}`);
}

function summaries(project = {}) {
  return {
    smartWalletSummary:
      num(project.smartWalletAccumulationScore) >= 60
        ? "Quality-wallet accumulation is supportive."
        : "Smart-wallet evidence is developing or unconfirmed.",
    liquiditySummary:
      num(project.liquidityFormationScore) >= 60
        ? "Liquidity formation is improving ahead of broad recognition."
        : "Liquidity formation needs more confirmation.",
    developerSummary:
      num(project.developerActivityScore ?? project.developerScore) >= 60 || num(project.githubProScore) >= 60
        ? "Developer activity is accelerating."
        : "Developer acceleration is not yet strong.",
    adoptionSummary:
      num(project.adoptionAccelerationScore) >= 60 || num(project.organicBuyerScore) >= 60
        ? "Adoption or organic buyer evidence is improving."
        : "Real adoption evidence remains thin.",
    narrativeSummary:
      num(project.narrativeHeatScore) >= 60 && num(project.marketAwarenessScore) < 70
        ? "Narrative is forming without full market saturation."
        : "Narrative signal is weak, saturated, or still unverified.",
    tokenUtilitySummary:
      num(project.tokenValueCaptureScore || project.tokenomicsScore) >= 55
        ? "Token value-capture evidence exists but still needs continued verification."
        : "Token utility/value capture is not yet proven.",
  };
}

function explanation(project = {}, scores = {}, candidateType = "", blockers = []) {
  if (blockers.length) {
    return {
      whyScannerFoundItEarly: "The scanner found early evidence, but final blockers prevent promotion.",
      whatIsImprovingBeforePrice: topSignals(scores, project).join(", ") || "No durable leading indicator stack.",
      whatMarketHasNotRecognized: project.informationAdvantage?.explanation || "No reliable recognition gap.",
      whatMustHappenNext: "Resolve blockers and verify identity, route, liquidity, execution, and risk.",
      whatInvalidatesThesis: blockers.slice(0, 4).join("; "),
      whyNotLateChase: project.preBreakoutMomentumStage === "LATE_CHASE" || project.preBreakoutMomentumStage === "ALREADY_PUMPED"
        ? "It is currently classified as late or already pumped."
        : "Price action is not the sole driver of the score.",
    };
  }

  return {
    whyScannerFoundItEarly: `${candidateType} setup with fundamentals improving before broad consensus.`,
    whatIsImprovingBeforePrice: topSignals(scores, project).join(", "),
    whatMarketHasNotRecognized: project.informationAdvantage?.explanation || "Fundamentals may be ahead of awareness.",
    whatMustHappenNext: "Maintain liquidity, adoption, developer, catalyst, and route confirmation.",
    whatInvalidatesThesis: "Late-chase price action, liquidity reversal, catalyst failure, or new contract/risk block.",
    whyNotLateChase:
      project.preBreakoutMomentumStage === "EARLY_FORMATION" ||
      project.preBreakoutMomentumStage === "CONFIRMED_EARLY" ||
      project.preBreakoutMomentumStage === "BREAKOUT_STARTING"
        ? `Momentum stage is ${project.preBreakoutMomentumStage}, not late chase.`
        : "Needs continued anti-chase verification.",
  };
}

export function analyzePreConsensusBreakoutHunter(project = {}, options = {}) {
  let enriched = project.quietAccumulationScore != null ? project : analyzeQuietAccumulation(project);
  enriched = enriched.preBreakoutMomentumScore != null ? enriched : analyzePreBreakoutMomentum(enriched);
  enriched = enriched.informationAdvantageScore != null ? enriched : analyzeInformationAdvantage(enriched);
  enriched = enriched.distressedTrapScore != null ? enriched : analyzeDistressedMicrocapTrap(enriched);

  const categoryScores = signalCategoryScores(enriched);
  const leadingCategories = leadingIndicatorCategories(enriched);
  const blockers = hardBlockers(enriched);
  const regime = regimeFor(enriched);
  const regimeCompatibilityScore = regimeCompatibility(enriched, regime);
  const persistence = signalPersistence(enriched);
  const antiManipulationScore = antiManipulationConfidence(enriched);
  const candidateType = candidateTypeFor(enriched);
  const topTierSafety = topTierSafetyGates(enriched);
  const baseScore = Math.round(
    weightedAverage([
      { score: categoryScores.identityAndData, weight: 0.1 },
      { score: categoryScores.developerAcceleration, weight: 0.12 },
      { score: categoryScores.realAdoptionAcceleration, weight: 0.12 },
      { score: categoryScores.liquidityFormation, weight: 0.12 },
      { score: categoryScores.smartWalletAccumulation, weight: 0.12 },
      { score: categoryScores.narrativeEmergence, weight: 0.1 },
      { score: categoryScores.catalystQuality, weight: 0.08 },
      { score: categoryScores.quietAccumulation, weight: 0.08 },
      { score: categoryScores.preBreakoutMomentum, weight: 0.06 },
      { score: categoryScores.informationAdvantage, weight: 0.06 },
      { score: categoryScores.tokenValueCapture, weight: 0.04 },
    ])
  );
  const hardPenalty = blockers.length * 12;
  const manipulationPenalty = Math.max(0, 65 - antiManipulationScore) * 0.35;
  const persistenceAdjustment =
    persistence.signalPersistenceScore >= 70
      ? 4
      : persistence.signalPersistenceScore < 40
      ? -4
      : 0;
  const rawOpportunityScore = Math.round(
    clamp(
      baseScore +
        regimeCompatibilityScore * 0.12 +
        persistence.signalAccelerationScore * 0.05 +
        persistenceAdjustment -
        hardPenalty -
        manipulationPenalty -
        num(enriched.distressedTrapScore) * 0.12 -
        num(enriched.preBreakoutChasePenalty) * 0.32
    )
  );
  const regimeAdjustedOpportunityScore = Math.round(
    clamp(rawOpportunityScore + (regimeCompatibilityScore - 55) * 0.18)
  );
  let tier = tierFor(regimeAdjustedOpportunityScore);
  const topTierEligible =
    blockers.length === 0 &&
    topTierSafety.passed &&
    antiManipulationScore >= 62 &&
    !["ALREADY_PUMPED", "LATE_CHASE"].includes(enriched.preBreakoutMomentumStage) &&
    leadingCategories.length >= 3 &&
    leadingCategories.filter((category) => category !== "preBreakoutMomentum").length >= 2;

  if (TOP_TIER_GATES.has(tier) && !topTierEligible) {
    tier = regimeAdjustedOpportunityScore >= 70 ? "Strong Early Watchlist" : tierFor(Math.min(regimeAdjustedOpportunityScore, 69));
  }

  const selected = ["Exceptional Pre-Consensus Candidate", "High-Conviction Research Candidate"].includes(tier);
  const timeline = catalystTimeline(enriched);
  const scenarios = upsideScenarios(enriched, regimeAdjustedOpportunityScore, blockers);
  const topBullishSignals = topSignals(categoryScores, enriched);
  const uniqueHardBlockers = [...new Set(blockers)];
  const output = {
    ...enriched,
    candidateType,
    preConsensusCandidateType: candidateType,
    preConsensusOpportunityScore: regimeAdjustedOpportunityScore,
    rawPreConsensusOpportunityScore: rawOpportunityScore,
    preConsensusTier: tier,
    preConsensusCandidateSelected: selected,
    preConsensusRank: null,
    preConsensusHardBlockers: uniqueHardBlockers,
    preConsensusTopTierSafety: topTierSafety,
    antiManipulationConfidenceScore: antiManipulationScore,
    marketRegime: enriched.marketRegime || regime,
    sectorRegime: enriched.sectorRegime || enriched.narrative || "UNKNOWN",
    regimeCompatibilityScore,
    regimeAdjustedOpportunityScore,
    leadingIndicatorCategories: leadingCategories,
    bullishSignalCategoryCount: topBullishSignals.length,
    topBullishSignals,
    topLeadingIndicators: leadingCategories,
    preConsensusTopRisks: uniqueHardBlockers.length ? uniqueHardBlockers : enriched.quietAccumulation?.warnings || enriched.riskFlags || [],
    catalystTimeline: timeline,
    upsideScenarios: scenarios,
    invalidationConditions: scenarios.invalidationConditions || [
      "Final selection integrity blocks the project.",
      "Leading indicators decay before price recognition.",
      "Manipulation, identity, route, or liquidity risk rises.",
    ],
    ...persistence,
    preConsensusBreakoutHunter: {
      rank: null,
      name: enriched.name || "Unknown",
      symbol: enriched.symbol || "UNKNOWN",
      chain: enriched.chain || "unknown",
      contractAddress: enriched.finalContractAddress || enriched.contractAddress || enriched.address || enriched.tokenAddress || "",
      identityStatus: enriched.finalIdentityState || enriched.projectIdentityVerdict || "UNKNOWN",
      candidateType,
      consensusStage: enriched.estimatedConsensusStage || "UNKNOWN",
      preConsensusOpportunityScore: regimeAdjustedOpportunityScore,
      regimeAdjustedOpportunityScore,
      informationAdvantageScore: enriched.informationAdvantageScore || 0,
      breakoutReadinessScore: enriched.breakoutReadinessScore || 0,
      confidence:
        uniqueHardBlockers.length > 0
          ? "Blocked"
          : regimeAdjustedOpportunityScore >= 80 && antiManipulationScore >= 70
          ? "High"
          : regimeAdjustedOpportunityScore >= 65
          ? "Medium"
          : "Developing",
      topBullishSignals,
      topLeadingIndicators: leadingCategories,
      topRisks: uniqueHardBlockers.length ? uniqueHardBlockers : enriched.riskFlags || [],
      hardBlockers: uniqueHardBlockers,
      catalystTimeline: timeline,
      smartWalletSummary: summaries(enriched).smartWalletSummary,
      liquiditySummary: summaries(enriched).liquiditySummary,
      developerSummary: summaries(enriched).developerSummary,
      adoptionSummary: summaries(enriched).adoptionSummary,
      narrativeSummary: summaries(enriched).narrativeSummary,
      tokenUtilitySummary: summaries(enriched).tokenUtilitySummary,
      upsideScenarios: scenarios,
      invalidationConditions: scenarios.invalidationConditions || [],
      purchaseRoute: enriched.smallCapHunter?.purchaseRoute || enriched.purchaseRoute || {},
      finalSelectionState: enriched.finalSelectionState || "PENDING_FINAL_INTEGRITY",
      explanation: explanation(enriched, categoryScores, candidateType, uniqueHardBlockers),
    },
  };

  return output;
}

export function analyzePreConsensusBreakoutHunterBatch(projects = [], options = {}) {
  const analyzed = (Array.isArray(projects) ? projects : []).map((project) =>
    analyzePreConsensusBreakoutHunter(project, options)
  );
  const ranked = [...analyzed]
    .sort(
      (a, b) =>
        num(b.regimeAdjustedOpportunityScore) - num(a.regimeAdjustedOpportunityScore) ||
        num(b.informationAdvantageScore) - num(a.informationAdvantageScore)
    )
    .map((project, index) => ({
      ...project,
      preConsensusRank: index + 1,
      preConsensusBreakoutHunter: {
        ...(project.preConsensusBreakoutHunter || {}),
        rank: index + 1,
      },
    }));

  return ranked;
}

export function summarizePreConsensusBreakoutHunter(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const ranked = [...safeProjects]
    .filter((project) => project.preConsensusBreakoutHunter)
    .sort((a, b) => num(b.regimeAdjustedOpportunityScore) - num(a.regimeAdjustedOpportunityScore));
  const count = (predicate) => ranked.filter(predicate).length;

  return {
    generatedAt: new Date().toISOString(),
    name: "Pre-Consensus Breakout Hunter",
    totalProjects: safeProjects.length,
    analyzedProjects: ranked.length,
    exceptionalCandidates: count((project) => project.preConsensusTier === "Exceptional Pre-Consensus Candidate"),
    highConvictionCandidates: count((project) => project.preConsensusTier === "High-Conviction Research Candidate"),
    quietAccumulation: count((project) => project.quietAccumulationDetected),
    alreadyPumped: count((project) => project.preBreakoutMomentumStage === "ALREADY_PUMPED"),
    lateChase: count((project) => project.preBreakoutMomentumStage === "LATE_CHASE"),
    blocked: count((project) => (project.preConsensusHardBlockers || []).length > 0),
    topCandidates: ranked.slice(0, 25).map((project) => project.preConsensusBreakoutHunter),
  };
}
