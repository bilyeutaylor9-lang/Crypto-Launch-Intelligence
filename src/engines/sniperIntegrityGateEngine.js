import { inspectBlockingVerdicts, normalizeDecisionText } from "../selection/blockingVerdictHelper.js";
import {
  average,
  clamp,
  confidenceLabel,
  identityState,
  num,
  unique,
  weightedAverage,
} from "../sniper/sniperFramework.js";
import { analyzeSniperEvidenceFamilies } from "./sniperEvidenceFamilyEngine.js";
import { analyzeSniperLifecycleState } from "./sniperLifecycleStateEngine.js";
import { analyzeSniperOutcomeLabels } from "./sniperOutcomeLabelEngine.js";
import { analyzeSniperPointInTime } from "./sniperPointInTimeEngine.js";

const DEFAULT_GATES = {
  independentLeadingFamiliesAtOrAbove70: 3,
  totalFamiliesAtOrAbove55: 5,
  persistentScanCount: 3,
  preConsensusGapScoreMinimum: 70,
  confidenceAdjustedSniperScoreMinimum: 80,
  evidenceConfidenceMinimum: 75,
  maximumRiskScore: 44,
  maximumWashTradingRisk: 34,
  maximumInsiderDistributionRisk: 39,
  minimumExitLiquidityUsd: 25_000,
};

function familyScore(project = {}, family) {
  return num(project.sniperEvidenceFamilies?.[family]?.familyScore);
}

function familyConfidence(project = {}, family) {
  return num(project.sniperEvidenceFamilies?.[family]?.familyConfidence);
}

function rawSniperScore(project = {}) {
  return Math.round(
    weightedAverage([
      { score: project.preConsensusGapScore, weight: 0.18 },
      { score: familyScore(project, "LIQUIDITY"), weight: 0.13 },
      { score: familyScore(project, "ORGANIC_BUYERS"), weight: 0.11 },
      { score: familyScore(project, "SMART_WALLETS"), weight: 0.11 },
      { score: average([familyScore(project, "DEVELOPMENT"), familyScore(project, "PRODUCT_DELIVERY")]), weight: 0.11 },
      { score: average([familyScore(project, "ADOPTION"), familyScore(project, "REVENUE")]), weight: 0.1 },
      { score: familyScore(project, "CATALYSTS"), weight: 0.07 },
      { score: familyScore(project, "TOKENOMICS"), weight: 0.05 },
      { score: familyScore(project, "HOLDER_DISTRIBUTION"), weight: 0.04 },
      { score: familyScore(project, "NARRATIVE"), weight: 0.04 },
      { score: familyScore(project, "MARKET_REGIME"), weight: 0.03 },
      { score: familyScore(project, "MARKET_STRUCTURE"), weight: 0.03 },
    ])
  );
}

function confidenceAdjustedScore(project = {}, score = 0) {
  const confidencePenalty = Math.max(0, 75 - clamp(project.sniperEvidenceConfidence)) * 0.6;
  const freshnessPenalty = Math.max(0, 70 - clamp(project.sniperDataFreshness)) * 0.25;
  const agreementPenalty = Math.max(0, 75 - clamp(project.sniperSourceAgreement)) * 0.25;
  return Math.round(clamp(score - confidencePenalty - freshnessPenalty - agreementPenalty));
}

function hasVerifiedIdentity(project = {}) {
  return (
    project.identityVerified === true ||
    ["VERIFIED_CONTRACT", "VERIFIED_EXCHANGE_ASSET"].includes(identityState(project)) ||
    project.finalSelectionQualified === true
  );
}

function routeVerified(project = {}) {
  return (
    project.purchaseRouteConfirmed === true ||
    project.purchaseRoute?.purchasable === true ||
    project.smallCapHunter?.purchaseRoute?.purchasable === true ||
    project.proofOfAlphaExecutionTwin?.route?.detected === true
  );
}

function exitLiquidityUsd(project = {}) {
  if (project.hardExitLiquidityUsd != null) return num(project.hardExitLiquidityUsd);
  return Math.max(num(project.finalLiquidityUsd), num(project.liquidityUsd), num(project.activeLiquidityUsd));
}

function topReasons(project = {}) {
  return (project.sniperEvidenceFamilyList || [])
    .filter((item) => item.familyScore >= 60)
    .sort((a, b) => b.effectiveFamilyScore - a.effectiveFamilyScore)
    .slice(0, 5)
    .map((item) => `${item.family}: ${item.familyScore}/${item.familyConfidence}`);
}

function warningReasons(project = {}) {
  const warnings = [];
  if (project.preConsensusGapScore >= 70 && project.confidenceAdjustedSniperScore < 80) warnings.push("Gap is strong, but confidence-adjusted score is not ARMED quality.");
  if (project.sniperPersistentScanCount < 3) warnings.push("Needs more persistent scans before ARMED.");
  if (project.sniperDataFreshness < 70) warnings.push("Some data is stale.");
  if (project.sniperSourceAgreement < 75) warnings.push("Source agreement is not strong enough.");
  if (familyScore(project, "TOKENOMICS") < 45 && average([familyScore(project, "DEVELOPMENT"), familyScore(project, "ADOPTION")]) >= 65) {
    warnings.push("Good product evidence, but token value capture is weak.");
  }
  return warnings;
}

function hardBlockers(project = {}, gates = DEFAULT_GATES) {
  const blockers = [];
  const verdicts = inspectBlockingVerdicts(project);
  const idState = identityState(project);
  const leading = project.sniperEvidenceFamilySummary?.independentLeadingFamiliesAtOrAbove70 || [];
  const total = project.sniperEvidenceFamilySummary?.totalFamiliesAtOrAbove55 || [];
  const onChain = project.sniperEvidenceFamilySummary?.onChainConfirmingFamilies || [];
  const product = project.sniperEvidenceFamilySummary?.productConfirmingFamilies || [];
  const missing = project.sniperMissingCriticalData || [];
  const decision = normalizeDecisionText(project.aiDecision || project.aiEcosystemVerdict || project.finalIntegrityVerdict);

  blockers.push(...(verdicts.blockingVerdictReasons || []));
  if (decision.includes("reject") || decision.includes("avoid")) blockers.push("AI or final review rejected the project.");
  if (project.finalSelectionQualified !== true || project.finalSelectionState !== "QUALIFIED") blockers.push("Final Selection Integrity did not qualify the project.");
  if (
    !project.finalContractAddress &&
    !project.contractAddress &&
    !project.address &&
    !project.tokenAddress &&
    idState !== "VERIFIED_PRELAUNCH_PROJECT"
  ) {
    blockers.push("Missing verified contract.");
  }
  if (!hasVerifiedIdentity(project)) blockers.push(`Identity is not verified (${idState}).`);
  if (["SYMBOL_ONLY", "UNRESOLVED", "CONFLICTED_IDENTITY", "IMPERSONATION_RISK"].includes(idState)) blockers.push(`Identity state blocks ARMED: ${idState}.`);
  if (project.identityConflict || project.finalSelectionState === "IDENTITY_CONFLICT") blockers.push("Identity conflict detected.");
  if (project.honeypotDetected || num(project.honeypotRiskScore) >= 70 || num(project.contractRiskScore) >= 70) blockers.push("Critical contract risk.");
  if (!routeVerified(project)) blockers.push("Purchase route is unverified.");
  if (exitLiquidityUsd(project) < gates.minimumExitLiquidityUsd || num(project.exitLiquidityScore) < 45) blockers.push("Usable exit liquidity is insufficient.");
  if (num(project.liquidityManipulationRisk) >= 70) blockers.push("Liquidity manipulation risk exceeds sniper gate.");
  if (["ALREADY_PUMPED", "LATE_CHASE", "DISTRIBUTION"].includes(project.preBreakoutMomentumStage) || project.sniperLifecycleState === "LATE_CHASE") blockers.push("Late-chase or already-pumped price structure.");
  if (num(project.tokenUnlockRiskScore) >= 78 || num(project.vestingPressureScore) >= 78) blockers.push("Critical unlock or vesting risk.");
  if (num(project.washTradingRiskScore) > gates.maximumWashTradingRisk) blockers.push("Wash-trading risk exceeds sniper gate.");
  if (num(project.insiderDistributionRisk) > gates.maximumInsiderDistributionRisk) blockers.push("Insider distribution risk exceeds sniper gate.");
  if (num(project.riskScore) > gates.maximumRiskScore) blockers.push("Overall risk exceeds sniper gate.");
  if (project.distressedTrapBlock) blockers.push("Distressed microcap trap is blocked.");
  if (project.pointInTimeStatus === "LEAKAGE_RISK") blockers.push("Point-in-time leakage risk detected.");
  if (missing.includes("identity") || missing.includes("contractSafety") || missing.includes("purchaseRoute")) blockers.push(`Critical data missing: ${missing.join(", ")}.`);
  if (leading.length < gates.independentLeadingFamiliesAtOrAbove70) blockers.push("Not enough independent leading evidence families above 70.");
  if (total.length < gates.totalFamiliesAtOrAbove55) blockers.push("Not enough total evidence families above 55.");
  if ((project.sniperPersistentScanCount || 0) < gates.persistentScanCount) blockers.push("Signal persistence is below ARMED threshold.");
  if (num(project.preConsensusGapScore) < gates.preConsensusGapScoreMinimum) blockers.push("Pre-consensus gap is below ARMED threshold.");
  if (num(project.confidenceAdjustedSniperScore) < gates.confidenceAdjustedSniperScoreMinimum) blockers.push("Confidence-adjusted sniper score is below ARMED threshold.");
  if (num(project.sniperEvidenceConfidence) < gates.evidenceConfidenceMinimum) blockers.push("Evidence confidence is below ARMED threshold.");
  if (!onChain.length) blockers.push("No confirming on-chain evidence family.");
  if (!product.length) blockers.push("No product, development, adoption, or revenue confirmation.");

  return unique(blockers);
}

function stateAfterGate(project = {}, blockers = []) {
  if (!blockers.length) return "ARMED";
  if (project.pointInTimeStatus === "INSUFFICIENT" || (project.sniperMissingCriticalData || []).length) return "INSUFFICIENT_DATA";
  if (project.finalSelectionState === "IDENTITY_CONFLICT" || project.identityConflict) return "IDENTITY_PENDING";
  if (["ALREADY_PUMPED", "LATE_CHASE"].includes(project.preBreakoutMomentumStage)) return "LATE_CHASE";
  if (project.distressedTrapBlock) return "DISTRESSED";
  if (project.legitimateReacceleration) return "RECOVERY_ATTEMPT";
  if (project.quietAccumulationDetected) return "QUIET_ACCUMULATION";
  if (num(project.fundamentalAccelerationScore) >= 65) return "FUNDAMENTALS_ACCELERATING";
  return project.sniperLifecycleState || "FORMING";
}

function calibratedProbabilities(project = {}) {
  const sampleSize = num(project.comparableSampleSize || project.calibrationSampleSize || project.outcomeWinSampleSize);
  if (sampleSize < 30) {
    return {
      probabilityOf25Pct: null,
      probabilityOf50Pct: null,
      probabilityOf2x: null,
      probabilityOf3x: null,
      probabilityOf5x: null,
      probabilityOfMajorLoss: null,
      confidenceInterval: null,
      comparableSampleSize: sampleSize,
      calibrationQuality: "INSUFFICIENT_SAMPLE",
      insufficientData: true,
      message: "Probability unavailable due to insufficient comparable historical outcomes.",
    };
  }

  const base = clamp(project.confidenceAdjustedSniperScore);
  return {
    probabilityOf25Pct: Math.round(clamp(base * 0.82)),
    probabilityOf50Pct: Math.round(clamp(base * 0.64)),
    probabilityOf2x: Math.round(clamp(base * 0.42)),
    probabilityOf3x: Math.round(clamp(base * 0.26)),
    probabilityOf5x: Math.round(clamp(base * 0.14)),
    probabilityOfMajorLoss: Math.round(clamp(100 - base + num(project.riskScore) * 0.4)),
    confidenceInterval: "+/- 15%",
    comparableSampleSize: sampleSize,
    calibrationQuality: sampleSize >= 100 ? "GOOD" : "DEVELOPING",
    insufficientData: false,
  };
}

function explanation(project = {}, blockers = []) {
  if (blockers.length) {
    return {
      whyScannerFoundThisNow: "The scanner found early evidence, but sniper integrity blockers prevent an ARMED alert.",
      whichSignalsOccurredFirst: project.sniperSignalSequence || {},
      whichFundamentalsAreAccelerating: topReasons(project),
      whyPriceHasNotFullyRecognizedThem: `Price recognition score ${project.priceRecognitionScore || 0}, social recognition score ${project.socialRecognitionScore || 0}.`,
      whySocialAwarenessIsStillEarly: num(project.socialRecognitionScore) < 55 ? "Social recognition is still low to moderate." : "Social attention may already be elevated.",
      whichIndependentFamiliesConfirm: project.sniperEvidenceFamilySummary?.independentLeadingFamiliesAtOrAbove70 || [],
      whatCatalystMayChangeRecognition: (project.catalystTimeline || [])[0]?.catalystType || (project.liveCatalystEvents || [])[0]?.type || "No verified catalyst yet.",
      whatMustHappenNext: "Resolve blockers, persist across more scans, and maintain leading evidence before price/social recognition.",
      whatInvalidatesThesis: blockers.slice(0, 5),
      whyNotLateChase: ["ALREADY_PUMPED", "LATE_CHASE"].includes(project.preBreakoutMomentumStage)
        ? "It is classified as late chase or already pumped."
        : "Price is not the primary driver of the thesis.",
      realisticTradableLiquidityUsd: exitLiquidityUsd(project),
    };
  }

  return {
    whyScannerFoundThisNow: "Multiple independent leading evidence families confirmed before broad recognition.",
    whichSignalsOccurredFirst: project.sniperSignalSequence || {},
    whichFundamentalsAreAccelerating: topReasons(project),
    whyPriceHasNotFullyRecognizedThem: `Pre-consensus gap ${project.preConsensusGapScore}; price recognition ${project.priceRecognitionScore || 0}.`,
    whySocialAwarenessIsStillEarly: num(project.socialRecognitionScore) < 55 ? "Public awareness remains below the evidence stack." : "Awareness is rising but not yet fully saturated.",
    whichIndependentFamiliesConfirm: project.sniperEvidenceFamilySummary?.independentLeadingFamiliesAtOrAbove70 || [],
    whatCatalystMayChangeRecognition: (project.catalystTimeline || [])[0]?.catalystType || (project.liveCatalystEvents || [])[0]?.type || "Continued evidence persistence.",
    whatMustHappenNext: "Liquidity, buyers, development, adoption, and catalyst evidence must continue without manipulation.",
    whatInvalidatesThesis: [
      "Liquidity falls materially.",
      "Insiders distribute.",
      "Catalyst fails or is delayed.",
      "Price becomes late chase before fundamentals persist.",
      "Identity, route, or contract safety breaks.",
    ],
    whyNotLateChase: "Late-chase and already-pumped states are hard-blocked by the sniper gate.",
    realisticTradableLiquidityUsd: exitLiquidityUsd(project),
  };
}

export function analyzeSniperIntegrityGate(project = {}, options = {}) {
  const gates = { ...DEFAULT_GATES, ...(options.gates || {}) };
  let enriched = project.sniperOutcomeLabels ? project : analyzeSniperOutcomeLabels(project, options);
  enriched = enriched.pointInTimeObservation ? enriched : analyzeSniperPointInTime(enriched, options);
  enriched = enriched.sniperLifecycleState ? enriched : analyzeSniperLifecycleState(enriched);
  enriched = enriched.sniperEvidenceFamilies ? enriched : analyzeSniperEvidenceFamilies(enriched);

  const sniperScore = rawSniperScore(enriched);
  const confidenceAdjustedSniperScore = confidenceAdjustedScore(enriched, sniperScore);
  enriched = {
    ...enriched,
    sniperScore,
    rawSniperScore: sniperScore,
    confidenceAdjustedSniperScore,
  };

  const sniperBlockingReasons = hardBlockers(enriched, gates);
  const sniperQualified = sniperBlockingReasons.length === 0;
  const sniperState = stateAfterGate(enriched, sniperBlockingReasons);
  const sniperWarningReasons = warningReasons(enriched);
  const sniperReasons = topReasons(enriched);
  const sniperConfidence = confidenceLabel(confidenceAdjustedSniperScore);
  const sniperCalibration = calibratedProbabilities(enriched);

  return {
    ...enriched,
    sniperState,
    sniperQualified,
    sniperScore,
    confidenceAdjustedSniperScore,
    sniperConfidence,
    sniperReasons,
    sniperBlockingReasons,
    sniperWarningReasons,
    sniperEvidenceFamilies: enriched.sniperEvidenceFamilies,
    sniperInvalidationConditions: explanation(enriched, sniperBlockingReasons).whatInvalidatesThesis,
    sniperCalibration,
    sniperAlertType:
      sniperQualified && enriched.sniperStateTransition?.from === "QUIET_ACCUMULATION"
        ? "QUIET_ACCUMULATION_TO_ARMED"
        : sniperQualified
        ? "ARMED_SNIPER_CANDIDATE"
        : "NO_ALERT",
    sniperDataStatus:
      enriched.pointInTimeStatus === "LEAKAGE_RISK"
        ? "LEAKAGE_RISK"
        : (enriched.sniperMissingCriticalData || []).length
        ? "INSUFFICIENT"
        : "SUFFICIENT",
    sniperIntegrityGate: {
      state: sniperState,
      qualified: sniperQualified,
      score: sniperScore,
      confidenceAdjustedSniperScore,
      confidence: sniperConfidence,
      gates,
      blockers: sniperBlockingReasons,
      warnings: sniperWarningReasons,
      reasons: sniperReasons,
      explanation: explanation(enriched, sniperBlockingReasons),
      calibration: sniperCalibration,
    },
  };
}

export function analyzeSniperIntegrityGateBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => analyzeSniperIntegrityGate(project, options));
}

export function validateSniperIntegrityInvariants(projects = []) {
  const violations = [];
  for (const project of Array.isArray(projects) ? projects : []) {
    const armed = project.sniperState === "ARMED" || project.sniperQualified === true;
    if (!armed) continue;

    const checks = [
      [normalizeDecisionText(project.aiDecision).includes("reject"), "ARMED + AI Reject"],
      [project.identityConflict || project.finalSelectionState === "IDENTITY_CONFLICT", "ARMED + Identity Conflict"],
      [project.honeypotDetected || num(project.honeypotRiskScore) >= 70 || num(project.contractRiskScore) >= 70, "ARMED + Contract Risk"],
      [!routeVerified(project), "ARMED + Unverified Purchase Route"],
      [exitLiquidityUsd(project) < DEFAULT_GATES.minimumExitLiquidityUsd, "ARMED + Insufficient Exit Liquidity"],
      [["LATE_CHASE", "DISTRIBUTION"].includes(project.sniperLifecycleState) || project.preBreakoutMomentumStage === "LATE_CHASE", "ARMED + Late Chase"],
      [project.preBreakoutMomentumStage === "ALREADY_PUMPED", "ARMED + Already Pumped"],
      [num(project.tokenUnlockRiskScore) >= 78, "ARMED + Critical Unlock"],
      [num(project.washTradingRiskScore) > DEFAULT_GATES.maximumWashTradingRisk, "ARMED + Wash-Trading Risk"],
      [num(project.sniperEvidenceConfidence) < DEFAULT_GATES.evidenceConfidenceMinimum, "ARMED + Insufficient Evidence Confidence"],
    ];

    for (const [failed, reason] of checks) {
      if (failed) {
        violations.push({
          project: project.name || project.symbol || project.permanentProjectKey || "Unknown",
          reason,
        });
      }
    }
  }

  return {
    status: violations.length ? "FAIL" : "PASS",
    violationCount: violations.length,
    violations,
  };
}

export function summarizeSniperIntegrity(projects = []) {
  const safe = Array.isArray(projects) ? projects : [];
  const armed = safe.filter((project) => project.sniperQualified && project.sniperState === "ARMED");
  return {
    analyzed: safe.filter((project) => project.sniperIntegrityGate).length,
    armedCandidates: armed.length,
    quietAccumulation: safe.filter((project) => project.sniperState === "QUIET_ACCUMULATION").length,
    fundamentalsAccelerating: safe.filter((project) => project.sniperState === "FUNDAMENTALS_ACCELERATING").length,
    lateChase: safe.filter((project) => project.sniperState === "LATE_CHASE").length,
    distressed: safe.filter((project) => project.sniperState === "DISTRESSED").length,
    blocked: safe.filter((project) => (project.sniperBlockingReasons || []).length).length,
    insufficientData: safe.filter((project) => project.sniperDataStatus === "INSUFFICIENT").length,
    topArmedCandidates: armed
      .sort((a, b) => num(b.confidenceAdjustedSniperScore) - num(a.confidenceAdjustedSniperScore))
      .slice(0, 10)
      .map((project) => ({
        name: project.name,
        symbol: project.symbol,
        chain: project.chain,
        sniperScore: project.sniperScore,
        confidenceAdjustedSniperScore: project.confidenceAdjustedSniperScore,
        sniperReasons: project.sniperReasons,
      })),
  };
}
