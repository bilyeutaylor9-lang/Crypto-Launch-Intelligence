import fs from "node:fs";
import path from "node:path";

import { scoreCoreBaseline } from "../backtest/coreBaselineModel.js";
import { scoreCoreInstitutionalModel } from "../backtest/coreInstitutionalModel.js";
import {
  attachCandidateTruthState,
  deterministicCandidateBlocks,
} from "../kernel/candidateTruthState.js";
import { resolveStrictCandidateGate } from "../execution/routeResolver.js";
import { isLiveExecutionReady } from "../execution/routeTruthV2.js";
import {
  hasCleanDisplayIdentity,
  isGenericMarketIdentity,
  isLikelyAggregateCandidate,
  isLikelyMemeIdentity,
} from "../identity/displayIdentityGuard.js";
import {
  isDeferredBeforeDeep,
  summarizeEvidenceFunnel,
} from "../kernel/evidenceFunnelSummary.js";

const EVM_CHAINS = new Set([
  "ethereum",
  "base",
  "bsc",
  "arbitrum",
  "optimism",
  "polygon",
  "avalanche",
  "fantom",
  "linea",
  "scroll",
  "zksync",
  "mantle",
  "blast",
  "ronin",
  "mode",
  "berachain",
  "sonic",
  "robinhood",
  "robinhood-chain",
]);

const ACTION_PRIORITY = Object.freeze({
  MICRO_TEST_ELIGIBLE: 4,
  RESEARCH_WATCHLIST: 3,
  DATA_RECOVERY_REQUIRED: 2,
  BLOCKED: 1,
  DEEP_DEFERRED: 0,
});

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value || 0)));
}

function firstNumber(...values) {
  for (const value of values) {
    const measured = numberOrNull(value);
    if (measured !== null) return measured;
  }
  return null;
}

function firstValue(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "") ?? null;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

function displayIdentityAssessment(project = {}) {
  const clean = hasCleanDisplayIdentity(project);
  const aggregate = isLikelyAggregateCandidate(project);
  const generic = isGenericMarketIdentity(project);
  return {
    eligible: clean && !aggregate && !generic,
    clean,
    aggregate,
    generic,
  };
}

function utilityAssessment(project = {}) {
  const score = firstNumber(project.utilityQualityScore, project.realUtilityScore);
  const classification = project.utilityClassification || "UNKNOWN_UTILITY";
  const families = unique(array(project.utilityEvidenceFamilies));
  const memeOnly =
    project.memeOnlySpeculative === true ||
    classification === "MEME_SPECULATION" ||
    (isLikelyMemeIdentity(project) && project.realUtilityQualified !== true);
  const eligible =
    !memeOnly &&
    (project.realUtilityQualified === true ||
      classification === "REAL_UTILITY" ||
      (score !== null && score >= 55 && families.length >= 2));
  return {
    eligible,
    score,
    classification,
    families,
    memeOnly,
  };
}

function normalizedChain(project = {}) {
  const raw = String(
    project.canonicalChain ||
      project.finalChain ||
      project.chain ||
      project.network ||
      ""
  )
    .trim()
    .toLowerCase();
  const aliases = {
    eth: "ethereum",
    sol: "solana",
    bnb: "bsc",
    "bnb-chain": "bsc",
    arb: "arbitrum",
    op: "optimism",
    matic: "polygon",
    avax: "avalanche",
  };
  return aliases[raw] || raw || null;
}

function tokenAddress(project = {}) {
  return firstValue(
    project.finalContractAddress,
    project.canonicalAddress,
    project.tokenAddress,
    project.contractAddress,
    project.baseToken?.address,
    project.marketData?.tokenAddress
  );
}

function poolAddress(project = {}) {
  return firstValue(
    project.primaryTradablePool,
    project.poolAddress,
    project.pairAddress,
    project.finalPairAddress,
    project.marketData?.poolAddress
  );
}

export function guardedIdentityKey(project = {}) {
  const chain = normalizedChain(project);
  const token = tokenAddress(project);
  if (!chain || !token || String(token) === String(poolAddress(project) || "")) return null;
  const canonical = EVM_CHAINS.has(chain) ? String(token).toLowerCase() : String(token);
  return `${chain}:${canonical}`;
}

function growthScore(value) {
  const measured = numberOrNull(value);
  if (measured === null) return null;
  return clamp(50 + Math.sign(measured) * Math.sqrt(Math.abs(measured)) * 5);
}

function growthPct(current, previous) {
  const now = numberOrNull(current);
  const before = numberOrNull(previous);
  if (now === null || before === null || before <= 0) return null;
  return ((now - before) / before) * 100;
}

function timestampOnOrBefore(value, cutoff) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  const cutoffTimestamp = Date.parse(cutoff);
  return Number.isFinite(timestamp) && Number.isFinite(cutoffTimestamp) && timestamp <= cutoffTimestamp;
}

function buildMeasuredBaselineEvidence(project = {}, truth = {}, options = {}) {
  const existing = project.rawEvidence && typeof project.rawEvidence === "object"
    ? project.rawEvidence
    : {};
  const cutoff =
    options.dataCutoffTimestamp ||
    project.scannedAt ||
    project.observedAt ||
    new Date().toISOString();
  const buyerGrowth = firstNumber(
    project.pointInTime?.buyers?.accelerationPct,
    project.buyerBreadthAccelerationPct,
    project.independentBuyerAccelerationPct,
    growthPct(
      firstNumber(
        project.clusterAdjustedUniqueBuyers24h,
        project.independentBuyers24h
      ),
      firstNumber(
        project.previousClusterAdjustedUniqueBuyers24h,
        project.priorIndependentBuyers24h
      )
    )
  );
  const qualifiedWalletCount = firstNumber(
    project.pointInTime?.smartWallets?.qualifiedWalletCount,
    project.qualifiedSmartWalletCount,
    project.smartWalletFlow?.qualifiedWalletCount
  );
  const walletQualification = firstValue(
    project.pointInTime?.smartWallets?.qualificationMethod,
    project.smartWalletQualificationMethod,
    project.walletFlow?.qualificationMethod
  );
  const qualifiedNetFlowUsd =
    qualifiedWalletCount !== null || walletQualification
      ? firstNumber(
          project.pointInTime?.smartWallets?.qualifiedNetFlowUsd,
          project.qualifiedSmartWalletNetFlowUsd,
          project.walletFlow?.qualifiedSmartWalletNetFlowUsd
        )
      : null;
  const liquidityGrowth = firstNumber(
    project.pointInTime?.liquidity?.growthPct,
    project.liquidityGrowthPct,
    project.liquidityFormationPct,
    growthPct(
      firstNumber(project.liquidityUsd, project.dexLiquidityUsd),
      firstNumber(project.previousLiquidityUsd, project.priorLiquidityUsd)
    )
  );
  const relativePerformance = firstNumber(
    project.pointInTime?.market?.relativePerformancePct,
    project.marketRelativeStrengthPct,
    project.relativePerformance24hPct
  );
  const volumeGrowth = firstNumber(
    project.pointInTime?.market?.volumeAccelerationPct,
    project.volumeAccelerationPct,
    project.volumeGrowthPct,
    growthPct(
      firstNumber(project.volume24h, project.volume24hUsd),
      firstNumber(project.previousVolume24h, project.priorVolume24h)
    )
  );
  const catalyst = project.strongestCatalyst || project.nextCatalyst || {};
  const catalystVerified = Boolean(
    project.verifiedCatalyst === true ||
      project.pointInTime?.catalyst?.verified === true ||
      catalyst.verified === true ||
      String(catalyst.verificationStatus || "").toUpperCase() === "VERIFIED"
  );
  const catalystSource = firstValue(
    project.pointInTime?.catalyst?.source,
    catalyst.source,
    project.catalystSource
  );
  const catalystAnnouncedAt = firstValue(
    project.pointInTime?.catalyst?.announcedAt,
    catalyst.announcedAt,
    catalyst.publishedAt
  );
  const pointInTimeCatalyst = Boolean(
    catalystVerified &&
      catalystSource &&
      catalystAnnouncedAt &&
      timestampOnOrBefore(catalystAnnouncedAt, cutoff)
  );
  const safety = truth.candidateProofState?.safety || {};
  const safetyMeasured =
    safety.status === "VERIFIED_SAFE" &&
    array(safety.testedChecks).length > 0 &&
    (Number(safety.sourceCount || 0) > 0 || array(safety.provenance).length > 0);

  return {
    rawEvidence: {
      ...existing,
      independentBuyerAccelerationScore: firstNumber(
        existing.independentBuyerAccelerationScore,
        growthScore(buyerGrowth)
      ),
      qualifiedSmartWalletFlowScore: firstNumber(
        existing.qualifiedSmartWalletFlowScore
      ),
      qualifiedSmartWalletNetFlowUsd: firstNumber(
        existing.qualifiedSmartWalletNetFlowUsd,
        qualifiedNetFlowUsd
      ),
      liquidityFormationScore: firstNumber(
        existing.liquidityFormationScore,
        growthScore(liquidityGrowth)
      ),
      relativeStrengthScore: firstNumber(
        existing.relativeStrengthScore,
        growthScore(relativePerformance)
      ),
      volumeAccelerationScore: firstNumber(
        existing.volumeAccelerationScore,
        growthScore(volumeGrowth)
      ),
      verifiedCatalystScore: pointInTimeCatalyst
        ? firstNumber(existing.verifiedCatalystScore, 65)
        : null,
      safetyScore:
        safety.status === "BLOCKED"
          ? 0
          : safetyMeasured
            ? firstNumber(existing.safetyScore, 100)
            : null,
    },
    verifiedCatalyst: pointInTimeCatalyst ? true : undefined,
    provenance: {
      cutoff,
      buyerGrowthPct: buyerGrowth,
      qualifiedWalletCount,
      walletQualification: walletQualification || null,
      qualifiedNetFlowUsd,
      liquidityGrowthPct: liquidityGrowth,
      relativePerformancePct: relativePerformance,
      volumeGrowthPct: volumeGrowth,
      catalystSource: pointInTimeCatalyst ? catalystSource : null,
      catalystAnnouncedAt: pointInTimeCatalyst ? catalystAnnouncedAt : null,
      safetyMeasured,
      policy:
        "Only rawEvidence or directly observed point-in-time facts are normalized into baseline components; derived advisory scores are not relabeled as raw evidence.",
    },
  };
}

function adaptForCoreModels(project = {}, options = {}) {
  const truth = attachCandidateTruthState(project);
  const baselineEvidence = buildMeasuredBaselineEvidence(project, truth, options);
  const chain = normalizedChain(truth);
  const address = tokenAddress(truth);
  const identityKey = guardedIdentityKey(truth);
  const route = truth.candidateProofState?.globalRoute || {};

  return {
    project: {
      ...truth,
      chain,
      tokenAddress: address,
      identityKey,
      buyQuoteVerified: route.buyQuoteVerified === true,
      sellQuoteVerified: route.sellQuoteVerified === true,
      sellRouteAvailable: route.sellQuoteVerified === true,
      verifiedCatalyst: baselineEvidence.verifiedCatalyst,
      rawEvidence: baselineEvidence.rawEvidence,
      scores: {
        ...(project.scores || {}),
        sourceTruth: firstNumber(
          project.scores?.sourceTruth,
          project.sourceTruthScore,
          project.sourceReliabilityScore
        ),
        activeLiquidityTruth: firstNumber(
          project.scores?.activeLiquidityTruth,
          project.activeLiquidityTruthScore,
          project.liquidityPersistenceScore
        ),
        instantSafety: firstNumber(
          project.scores?.instantSafety,
          project.contractAuthoritySafetyScore,
          project.instantSafetyScore
        ),
        deployerReputation: firstNumber(
          project.scores?.deployerReputation,
          project.deployerReputationScore
        ),
        calibration: firstNumber(
          project.scores?.calibration,
          project.outcomeCalibrationScore,
          project.outcomeJudgeScore
        ),
      },
    },
    baselineEvidenceProvenance: baselineEvidence.provenance,
  };
}

function productionScore(project = {}) {
  return firstNumber(
    project.pipelineScore,
    project.opportunityScore,
    project.score,
    project.finalDecisionScore,
    project.marketRankScore
  );
}

function researchCoverage(project = {}) {
  const coverage = project.researchOpportunityCoverage || {};
  const percentage = firstNumber(coverage.coveragePct);
  return percentage === null ? 0 : clamp(percentage) / 100;
}

function evidencePenalizedProduction(project, core, execution) {
  const base = productionScore(project);
  if (base === null) return null;
  if (execution.blocks.length) return 0;
  const coverage = Math.max(
    core.baseline.coverage || 0,
    core.institutional.coverage || 0,
    researchCoverage(project)
  );
  let multiplier = Math.sqrt(Math.max(0, Math.min(1, coverage)));
  if (!execution.exactIdentity) multiplier *= 0.3;
  if (!execution.safetyVerified) multiplier *= 0.65;
  if (!execution.buyQuoteVerified) multiplier *= 0.85;
  if (!execution.sellQuoteVerified) multiplier *= 0.7;
  if (!execution.quoteFresh) multiplier *= 0.85;
  if (project.providerFailure === true) multiplier *= 0.7;
  if (project.aliasConflict === true || array(project.aliasConflicts).length) multiplier *= 0.5;
  return clamp(base * multiplier);
}

function verifiedBacktestPolicy(report = {}, source = null) {
  const comparison = report.comparison || report.modelComparison || {};
  const declaredWinnerPublished = comparison.winnerPublished === true;
  const bestModel =
    typeof comparison.bestModel === "string"
      ? comparison.bestModel
      : comparison.bestModel?.model || null;
  const models = array(comparison.models);
  const winningModel = models.find((model) => model.model === bestModel) || null;
  const adequateModels = models
    .filter((model) => model.adequacy?.adequate === true)
    .map((model) => model.model);
  const leakageStatus =
    report.leakageAudit?.status ||
    report.pointInTimeLeakageAudit?.status ||
    null;
  const evidenceLeakageStatus =
    report.leakageAudit?.evidenceAudit?.status ||
    report.pointInTimeLeakageAudit?.evidenceAudit?.status ||
    null;
  const leakagePassed = leakageStatus === "PASS" && evidenceLeakageStatus !== "FAIL";
  const rejectionReasons = [];
  if (!declaredWinnerPublished) rejectionReasons.push("BACKTEST_DID_NOT_PUBLISH_A_WINNER");
  if (!bestModel) rejectionReasons.push("BEST_MODEL_MISSING");
  if (!winningModel?.adequacy?.adequate) rejectionReasons.push("WINNER_SAMPLE_INADEQUATE");
  if (!leakagePassed) rejectionReasons.push("FULL_LEAKAGE_AND_FOLD_AUDIT_NOT_PASSED");
  if (/INSUFFICIENT|NO_WINNER/.test(String(report.status || comparison.status || ""))) {
    rejectionReasons.push("BACKTEST_STATUS_INSUFFICIENT");
  }
  const winnerPublished = rejectionReasons.length === 0;

  return {
    source,
    reportGeneratedAt: report.generatedAt || comparison.generatedAt || null,
    reportStatus: report.status || comparison.status || null,
    declaredWinnerPublished,
    winnerPublished,
    bestModel: winnerPublished ? bestModel : null,
    declaredBestModel: bestModel,
    adequateModels,
    leakageStatus,
    evidenceLeakageStatus,
    rejectionReasons,
  };
}

export function loadGuardedBacktestPolicy(
  reportPath = path.resolve("reports/core-model-backtest.json")
) {
  if (!fs.existsSync(reportPath)) {
    return verifiedBacktestPolicy({}, "NO_BACKTEST_REPORT");
  }
  try {
    return verifiedBacktestPolicy(
      JSON.parse(fs.readFileSync(reportPath, "utf8")),
      reportPath
    );
  } catch (error) {
    return {
      ...verifiedBacktestPolicy({}, reportPath),
      error: error.message,
    };
  }
}

function strictExecution(project = {}, env = process.env) {
  const truth = attachCandidateTruthState(project);
  const proof = truth.candidateProofState || {};
  const maximumQuoteAgeSeconds = Math.max(
    30,
    Number(env.LIVE_RANKING_MAX_QUOTE_AGE_SECONDS || 900)
  );
  let gate = {};
  let gateError = null;
  try {
    gate = resolveStrictCandidateGate(truth);
  } catch (error) {
    gateError = error.message;
  }
  const routeSubject = {
    ...truth,
    ...gate,
    routeTruthStatus: gate.routeVerificationStatus || truth.routeTruthStatus,
  };
  let routeReady = false;
  try {
    routeReady = isLiveExecutionReady(routeSubject, {
      maxAgeSeconds: maximumQuoteAgeSeconds,
    });
  } catch (error) {
    gateError = gateError || error.message;
  }
  const route = proof.globalRoute || {};
  const safety = proof.safety || {};
  const quoteAgeSeconds = firstNumber(route.quoteAgeSeconds, gate.quoteAgeSeconds);
  const quoteFresh =
    route.quoteFresh === true &&
    quoteAgeSeconds !== null &&
    quoteAgeSeconds <= maximumQuoteAgeSeconds;
  const safetyVerified = Boolean(
    safety.status === "VERIFIED_SAFE" &&
      array(safety.testedChecks).length > 0 &&
      (Number(safety.sourceCount || 0) > 0 || array(safety.provenance).length > 0)
  );
  const exactIdentity = Boolean(
    guardedIdentityKey(truth) &&
      proof.identity?.status === "VERIFIED" &&
      gate.strictIdentityVerified === true
  );
  const blocks = deterministicCandidateBlocks(truth);

  return {
    ready: Boolean(
      exactIdentity &&
        safetyVerified &&
        blocks.length === 0 &&
        routeReady &&
        gate.strictRankEligible === true &&
        route.buyQuoteVerified === true &&
        route.sellQuoteVerified === true &&
        quoteFresh
    ),
    exactIdentity,
    safetyVerified,
    safetyStatus: safety.status || "UNKNOWN",
    safetyTestedChecks: array(safety.testedChecks),
    safetyProvenance: array(safety.provenance),
    buyQuoteVerified: route.buyQuoteVerified === true,
    sellQuoteVerified: route.sellQuoteVerified === true,
    depthVerified: route.depthVerified === true,
    slippageVerified: route.slippageVerified === true,
    quoteFresh,
    quoteAgeSeconds,
    maximumQuoteAgeSeconds,
    routeReady,
    strictRankEligible: gate.strictRankEligible === true,
    routeDepthUsd: firstNumber(
      gate.routeDepthUsd,
      route.verifiedTradeSizeUsd,
      project.orderBookDepthUsd,
      project.stableExitLiquidityUsd,
      project.dexLiquidityUsd,
      project.liquidityUsd
    ),
    estimatedRoundTripSlippagePct: firstNumber(
      project.estimatedRoundTripSlippagePct,
      project.executionProof?.observedSlippagePct,
      project.executionProofRecoveryRoute?.estimatedRoundTripSlippagePct,
      project.canonicalExecutionRoute?.estimatedRoundTripSlippagePct
    ),
    userAccessStatus: proof.userAccess?.status || "UNKNOWN",
    gateError,
    blocks,
    gateReasons: unique([
      ...array(gate.candidateQuarantineReasons),
      ...array(gate.strictCandidateMissingProof),
    ]),
  };
}

function weightedBlend(parts = []) {
  const active = parts.filter(
    (part) => numberOrNull(part.score) !== null && Number(part.weight) > 0
  );
  const totalWeight = active.reduce((sum, part) => sum + Number(part.weight), 0);
  if (!active.length || totalWeight <= 0) return { score: null, coverage: 0, contributors: [] };
  return {
    score:
      active.reduce(
        (sum, part) => sum + Number(part.score) * Number(part.weight),
        0
      ) / totalWeight,
    coverage:
      active.reduce(
        (sum, part) => sum + Number(part.coverage || 0) * Number(part.weight),
        0
      ) / totalWeight,
    contributors: active.map((part) => part.model),
  };
}

function selectModelScore(project, core, policy, env = process.env) {
  const requested = String(env.LIVE_RANKING_MODEL || "auto").trim().toLowerCase();
  const researchScore = firstNumber(project.researchOpportunityScore);
  const researchEvidenceCoverage = researchCoverage(project);
  const choices = {
    baseline: {
      model: "CORE_EVIDENCE_BASELINE",
      score: core.baseline.eligible
        ? core.baseline.evidenceAdjustedBaselineScore
        : null,
      coverage: core.baseline.coverage,
    },
    institutional: {
      model: "CORE_INSTITUTIONAL",
      score: core.institutional.eligible
        ? core.institutional.evidenceAdjustedScore
        : null,
      coverage: core.institutional.coverage,
    },
    penalized: {
      model: "PRODUCTION_PLUS_EVIDENCE_PENALTY",
      score: core.evidencePenalizedProductionScore,
      coverage: Math.max(
        core.baseline.coverage || 0,
        core.institutional.coverage || 0,
        researchEvidenceCoverage
      ),
    },
    research: {
      model: "CORE_RESEARCH_DECISION",
      score: researchEvidenceCoverage >= 0.3 ? researchScore : null,
      coverage: researchEvidenceCoverage,
    },
  };
  if (Object.hasOwn(choices, requested)) {
    return {
      ...choices[requested],
      model: `MANUAL_UNPROVEN_${choices[requested].model}`,
      contributors: [choices[requested].model],
    };
  }

  if (requested === "auto" && policy.winnerPublished) {
    const winnerMap = {
      CORE_EVIDENCE_BASELINE: choices.baseline,
      CORE_INSTITUTIONAL: choices.institutional,
      PRODUCTION_PLUS_EVIDENCE_PENALTY: choices.penalized,
      CURRENT_PRODUCTION: choices.penalized,
    };
    const winner = winnerMap[policy.bestModel];
    if (winner && winner.score !== null) {
      return {
        ...winner,
        model: `BACKTEST_SELECTED_${winner.model}`,
        contributors: [winner.model],
      };
    }
  }

  const blend = weightedBlend([
    { ...choices.research, weight: 0.55 },
    { ...choices.baseline, weight: 0.2 },
    { ...choices.institutional, weight: 0.15 },
    { ...choices.penalized, weight: 0.1 },
  ]);
  return {
    model: "GUARDED_CORE_BLEND_UNPROVEN_CANARY",
    ...blend,
  };
}

function tierFor(status, score) {
  if (status === "MICRO_TEST_ELIGIBLE") {
    if (score >= 88) return "Guarded A+";
    if (score >= 80) return "Guarded A";
    return "Guarded B";
  }
  if (status === "RESEARCH_WATCHLIST") return "Research Watchlist";
  if (status === "DATA_RECOVERY_REQUIRED") return "Data Recovery";
  return "Blocked";
}

export function buildMicroTestPlan(project, options = {}) {
  const env = options.env || process.env;
  const enabled = boolEnv(env.MICRO_TEST_MODE, false);
  const bankrollUsd = numberOrNull(env.MICRO_TEST_BANKROLL_USD);
  const maximumPositionPct = Math.min(
    0.02,
    Math.max(0.001, Number(env.MICRO_TEST_MAX_POSITION_PCT || 0.01))
  );
  const maximumTotalPct = Math.min(
    0.06,
    Math.max(maximumPositionPct, Number(env.MICRO_TEST_MAX_TOTAL_PCT || 0.03))
  );
  const maximumPositionUsd = Math.min(
    50,
    Math.max(1, Number(env.MICRO_TEST_MAX_PER_POSITION_USD || 25))
  );
  const maximumPositions = Math.min(
    3,
    Math.max(1, Math.floor(Number(env.MICRO_TEST_MAX_POSITIONS || 3)))
  );
  const configured = enabled && bankrollUsd !== null && bankrollUsd > 0;
  const eligible = project.liveActionStatus === "MICRO_TEST_ELIGIBLE";

  return {
    configured,
    manualOnly: true,
    automaticExecutionAllowed: false,
    leverageAllowed: false,
    averagingDownAllowed: false,
    maximumExperimentAllocationUsd:
      configured && eligible
        ? Math.max(
            1,
            Math.floor(Math.min(bankrollUsd * maximumPositionPct, maximumPositionUsd))
          )
        : null,
    maximumTotalExperimentalExposureUsd: configured
      ? Math.floor(bankrollUsd * maximumTotalPct)
      : null,
    maximumConcurrentPositions: maximumPositions,
    experimentalBankrollUsd: configured ? bankrollUsd : null,
    positionCapPct: maximumPositionPct,
    totalExposureCapPct: maximumTotalPct,
    label: eligible
      ? configured
        ? "MANUAL_MICRO_TEST_CEILING_AVAILABLE"
        : "ELIGIBLE_BUT_EXPERIMENT_BANKROLL_NOT_CONFIGURED"
      : "NOT_ELIGIBLE",
    warnings: [
      "This is a software safety ceiling, not a recommendation to buy.",
      "Manual confirmation is required for every transaction.",
      "Never use leverage, borrowed funds, or automated wallet signing.",
      "Do not average down merely because a candidate remains ranked.",
    ],
  };
}

function scoreCandidate(project, policy, options = {}) {
  const env = options.env || process.env;
  const adapted = adaptForCoreModels(project, options);
  const baseline = scoreCoreBaseline(adapted.project, {
    minimumFamilies: Number(env.LIVE_RANKING_MIN_BASELINE_FAMILIES || 4),
    minimumCoverage: Number(env.LIVE_RANKING_MIN_BASELINE_COVERAGE || 0.6),
  });
  const institutional = scoreCoreInstitutionalModel(adapted.project, {
    minimumFamilies: Number(env.LIVE_RANKING_MIN_INSTITUTIONAL_FAMILIES || 7),
    minimumCoverage: Number(env.LIVE_RANKING_MIN_INSTITUTIONAL_COVERAGE || 0.6),
  });
  const execution = strictExecution(adapted.project, env);
  const legacyProductionScore = productionScore(project);
  const core = { baseline, institutional, legacyProductionScore };
  core.evidencePenalizedProductionScore = evidencePenalizedProduction(
    adapted.project,
    core,
    execution
  );
  const selected = selectModelScore(adapted.project, core, policy, env);
  const selectedScore = numberOrNull(selected.score);
  const minimumLiveScore = Number(env.LIVE_RANKING_MIN_SCORE || 72);
  const minimumWatchScore = Number(env.LIVE_RANKING_MIN_WATCH_SCORE || 58);
  const minimumWatchCoverage = Number(env.LIVE_RANKING_MIN_WATCH_COVERAGE || 0.4);
  const minimumMicroCoverage = Number(env.LIVE_RANKING_MIN_MICRO_COVERAGE || 0.7);
  const requireUtility = boolEnv(env.LIVE_RANKING_REQUIRE_UTILITY, true);
  const evidenceCoverage = Math.max(0, Math.min(1, Number(selected.coverage || 0)));
  const lifecycle = adapted.project.projectLifecycleState;
  const displayIdentity = displayIdentityAssessment(adapted.project);
  const utility = utilityAssessment(adapted.project);
  const utilityEligible = !requireUtility || utility.eligible;
  const hasMeasuredCoreEvidence = Boolean(
    baseline.eligible ||
      institutional.eligible ||
      (firstNumber(adapted.project.researchOpportunityScore) !== null &&
        researchCoverage(adapted.project) >= minimumWatchCoverage)
  );

  let liveActionStatus;
  if (execution.blocks.length) {
    liveActionStatus = "BLOCKED";
  } else if (
    execution.ready &&
    displayIdentity.eligible &&
    utilityEligible &&
    baseline.eligible &&
    baseline.coverage >= minimumMicroCoverage &&
    selectedScore !== null &&
    selectedScore >= minimumLiveScore
  ) {
    liveActionStatus = "MICRO_TEST_ELIGIBLE";
  } else if (
    selectedScore !== null &&
    selectedScore >= minimumWatchScore &&
    evidenceCoverage >= minimumWatchCoverage &&
    hasMeasuredCoreEvidence &&
    displayIdentity.eligible &&
    utilityEligible &&
    (execution.exactIdentity || lifecycle === "PRELAUNCH")
  ) {
    liveActionStatus = "RESEARCH_WATCHLIST";
  } else {
    liveActionStatus = "DATA_RECOVERY_REQUIRED";
  }
  if (isDeferredBeforeDeep(adapted.project)) {
    liveActionStatus = "DEEP_DEFERRED";
  }

  let liveScore = selectedScore;
  if (liveScore !== null && liveActionStatus === "BLOCKED") liveScore = Math.min(20, liveScore);
  if (liveScore !== null && liveActionStatus === "DATA_RECOVERY_REQUIRED") liveScore *= 0.75;
  if (liveScore !== null && liveActionStatus === "RESEARCH_WATCHLIST" && !execution.ready) {
    liveScore *= 0.88;
  }
  liveScore = liveScore === null ? 0 : Number(clamp(liveScore).toFixed(4));

  const missingEvidence = unique([
    ...array(baseline.missingComponents),
    ...array(institutional.missingFamilies),
    ...(!execution.exactIdentity ? ["exactIdentity"] : []),
    ...(!displayIdentity.eligible ? ["cleanProjectDisplayIdentity"] : []),
    ...(!utilityEligible ? [utility.memeOnly ? "realUtilityRequiredMemeOnlyExcluded" : "verifiedUtilityEvidence"] : []),
    ...(!execution.safetyVerified ? ["authoritativeSafetyProof"] : []),
    ...(!execution.buyQuoteVerified ? ["buyQuote"] : []),
    ...(!execution.sellQuoteVerified ? ["sellQuote"] : []),
    ...(!execution.depthVerified ? ["verifiedDepth"] : []),
    ...(!execution.slippageVerified ? ["measuredSlippage"] : []),
    ...(!execution.quoteFresh ? ["freshQuote"] : []),
    ...(!execution.routeReady ? ["liveExecutionRoute"] : []),
  ]);
  const finalSelectionState = {
    MICRO_TEST_ELIGIBLE: "QUALIFIED",
    RESEARCH_WATCHLIST: "RESEARCH_ONLY",
    DATA_RECOVERY_REQUIRED: "INSUFFICIENT_DATA",
    BLOCKED: "BLOCKED",
    DEEP_DEFERRED: "DEFERRED_BEFORE_DEEP",
  }[liveActionStatus];
  const scored = {
    ...adapted.project,
    legacyProductionScore,
    legacyPipelineScore: legacyProductionScore,
    legacyFinalSelectionState: project.finalSelectionState || null,
    guardedLiveScore: liveScore,
    liveScore,
    liveRankingModel: selected.model,
    liveRankingCoverage: Number(evidenceCoverage.toFixed(4)),
    liveActionStatus,
    liveExecutionReady: execution.ready,
    liveRankingAuthoritative: true,
    liveRankingUnprovenCanary: selected.model.includes("UNPROVEN"),
    liveRankingDisplayEligible: displayIdentity.eligible,
    liveRankingUtilityEligible: utilityEligible,
    scoringPrimaryModel: "guarded-live-core-authoritative",
    liveRankingMissingEvidence: missingEvidence,
    liveRankingBlocks: execution.blocks,
    liveRankingGateReasons: execution.gateReasons,
    liveRankingTrace: {
      selectedModel: selected.model,
      selectedRawScore: selectedScore,
      adjustedLiveScore: liveScore,
      contributors: selected.contributors || [],
      legacyProductionScore,
      baseline,
      baselineEvidenceProvenance: adapted.baselineEvidenceProvenance,
      institutional,
      evidencePenalizedProductionScore: core.evidencePenalizedProductionScore,
      researchOpportunityScore: firstNumber(adapted.project.researchOpportunityScore),
      researchOpportunityCoverage: adapted.project.researchOpportunityCoverage || null,
      execution,
      displayIdentity,
      utility,
      requireUtility,
      policy,
    },
    pipelineScore: liveScore,
    opportunityScore: liveScore,
    score: liveScore,
    pipelineTier: tierFor(liveActionStatus, liveScore),
    tier: tierFor(liveActionStatus, liveScore),
    confidence:
      liveActionStatus === "MICRO_TEST_ELIGIBLE"
        ? "Measured and execution verified"
        : liveActionStatus === "RESEARCH_WATCHLIST"
          ? "Research only"
          : "Insufficient or blocked",
    finalSelectionState,
    finalSelectionQualified: liveActionStatus === "MICRO_TEST_ELIGIBLE",
  };
  scored.microTestPlan = buildMicroTestPlan(scored, options);
  return scored;
}

function sortCandidates(left, right) {
  const priority =
    Number(ACTION_PRIORITY[right.liveActionStatus] || 0) -
    Number(ACTION_PRIORITY[left.liveActionStatus] || 0);
  if (priority) return priority;
  const displayPriority =
    Number(right.liveRankingDisplayEligible === true) -
    Number(left.liveRankingDisplayEligible === true);
  if (displayPriority) return displayPriority;
  const utilityPriority =
    Number(right.liveRankingUtilityEligible === true) -
    Number(left.liveRankingUtilityEligible === true);
  if (utilityPriority) return utilityPriority;
  const score = Number(right.guardedLiveScore || 0) - Number(left.guardedLiveScore || 0);
  if (score) return score;
  const explosionReadiness =
    Number(right.explosionReadinessScore || 0) - Number(left.explosionReadinessScore || 0);
  if (explosionReadiness) return explosionReadiness;
  return String(left.identityKey || left.symbol || left.name || "").localeCompare(
    String(right.identityKey || right.symbol || right.name || "")
  );
}

function selectMonitoredResearchLead(projects = []) {
  return projects.find((project) =>
    project.liveActionStatus === "DATA_RECOVERY_REQUIRED" &&
    !isDeferredBeforeDeep(project) &&
    project.liveRankingDisplayEligible === true &&
    project.liveRankingTrace?.execution?.exactIdentity === true &&
    Boolean(guardedIdentityKey(project)) &&
    Boolean(poolAddress(project)) &&
    String(tokenAddress(project)) !== String(poolAddress(project)) &&
    project.memeOnlySpeculative !== true &&
    project.liveRankingTrace?.utility?.memeOnly !== true &&
    array(project.liveRankingBlocks).length === 0
  ) || null;
}

function primaryCandidateMetadata(project = null, monitored = false) {
  if (!project) return null;
  if (monitored) {
    return {
      lane: "BEST_AVAILABLE_MONITORED_RESEARCH",
      disposition: "NOT_ACTIONABLE",
      reason: "Best exact-identity, display-clean, non-blocked deep candidate; missing proof prevents action.",
    };
  }
  return {
    lane: project.liveActionStatus,
    disposition: project.liveActionStatus === "MICRO_TEST_ELIGIBLE"
      ? "MANUAL_MICRO_TEST_ELIGIBLE"
      : "RESEARCH_ONLY",
    reason: "Highest-ranked candidate that passed the guarded measured-evidence research threshold.",
  };
}

export function buildGuardedLiveRanking(projects = [], options = {}) {
  const policy =
    options.policy ||
    loadGuardedBacktestPolicy(
      options.backtestReportPath || path.resolve("reports/core-model-backtest.json")
    );
  const legacyOrdered = [...projects].sort(
    (left, right) => Number(productionScore(right) || 0) - Number(productionScore(left) || 0)
  );
  const legacyRanks = new Map(
    legacyOrdered.map((project, index) => [
      guardedIdentityKey(project) ||
        `${normalizedChain(project) || "unknown"}:${project.symbol || project.name || index}`,
      index + 1,
    ])
  );
  const initiallyRanked = projects
    .map((project) => {
      const scored = scoreCandidate(project, policy, options);
      const fallbackKey =
        scored.identityKey ||
        `${normalizedChain(scored) || "unknown"}:${scored.symbol || scored.name || ""}`;
      return { ...scored, legacyRank: legacyRanks.get(fallbackKey) || null };
    })
    .sort(sortCandidates)
    .map((project, index) => ({ ...project, liveRank: index + 1, rank: index + 1 }));
  const initialEvidenceBacked = initiallyRanked.filter((project) =>
    ["MICRO_TEST_ELIGIBLE", "RESEARCH_WATCHLIST"].includes(project.liveActionStatus)
  );
  const monitoredResearchLead = initialEvidenceBacked.length
    ? null
    : selectMonitoredResearchLead(initiallyRanked);
  const initialPrimaryCandidate = initialEvidenceBacked[0] || monitoredResearchLead;
  const primaryMetadata = primaryCandidateMetadata(
    initialPrimaryCandidate,
    initialPrimaryCandidate === monitoredResearchLead
  );
  const ranked = initiallyRanked.map((project) => ({
    ...project,
    primaryCandidateSelected: project === initialPrimaryCandidate,
    primaryCandidateLane: project === initialPrimaryCandidate ? primaryMetadata?.lane || null : null,
    primaryCandidateDisposition: project === initialPrimaryCandidate
      ? primaryMetadata?.disposition || null
      : null,
    primaryCandidateReason: project === initialPrimaryCandidate ? primaryMetadata?.reason || null : null,
  }));
  const byStatus = (status, limit) =>
    ranked.filter((project) => project.liveActionStatus === status).slice(0, limit);
  const evidenceBacked = ranked.filter((project) =>
    ["MICRO_TEST_ELIGIBLE", "RESEARCH_WATCHLIST"].includes(project.liveActionStatus)
  );
  const recoveryLead = byStatus("DATA_RECOVERY_REQUIRED", 1)[0] || null;
  const primaryCandidate = ranked.find((project) => project.primaryCandidateSelected) || null;
  const funnelSummary = summarizeEvidenceFunnel(ranked);

  return {
    generatedAt: new Date().toISOString(),
    scanRunId: options.scanRunId || null,
    authoritativeRanking: "GUARDED_LIVE_CORE",
    productionRankingChanged: true,
    automaticTradingEnabled: false,
    policy,
    configuration: {
      model: String((options.env || process.env).LIVE_RANKING_MODEL || "auto"),
      minimumLiveScore: Number(
        (options.env || process.env).LIVE_RANKING_MIN_SCORE || 72
      ),
      minimumWatchScore: Number(
        (options.env || process.env).LIVE_RANKING_MIN_WATCH_SCORE || 58
      ),
      minimumMicroCoverage: Number(
        (options.env || process.env).LIVE_RANKING_MIN_MICRO_COVERAGE || 0.7
      ),
      microTestMode: boolEnv((options.env || process.env).MICRO_TEST_MODE, false),
      requireUtility: boolEnv(
        (options.env || process.env).LIVE_RANKING_REQUIRE_UTILITY,
        true
      ),
    },
    summary: {
      analyzed: ranked.length,
      microTestEligible: byStatus("MICRO_TEST_ELIGIBLE", ranked.length).length,
      researchWatchlist: byStatus("RESEARCH_WATCHLIST", ranked.length).length,
      dataRecoveryRequired: byStatus("DATA_RECOVERY_REQUIRED", ranked.length).length,
      blocked: byStatus("BLOCKED", ranked.length).length,
      legacyLeader: legacyOrdered[0]?.name || legacyOrdered[0]?.symbol || null,
      liveLeader: evidenceBacked[0]?.name || evidenceBacked[0]?.symbol || null,
      liveLeaderStatus: evidenceBacked[0]?.liveActionStatus || null,
      recoveryLeader: recoveryLead?.name || recoveryLead?.symbol || null,
      primaryCandidate: primaryCandidate?.name || primaryCandidate?.symbol || null,
      primaryCandidateStatus: primaryCandidate?.liveActionStatus || null,
      primaryCandidateLane: primaryCandidate?.primaryCandidateLane || null,
      primaryCandidateDisposition: primaryCandidate?.primaryCandidateDisposition || null,
      invalidDisplayIdentity: ranked.filter(
        (project) => project.liveRankingDisplayEligible !== true
      ).length,
      utilityProofPending: ranked.filter(
        (project) => project.liveRankingUtilityEligible !== true
      ).length,
      backtestPolicySource: policy.source,
      backtestWinnerPublished: policy.winnerPublished,
      selectedBacktestModel: policy.bestModel,
      ...funnelSummary,
    },
    funnelSummary,
    ranked,
    primaryCandidate,
    top10: evidenceBacked.slice(0, 10),
    microEligible: byStatus("MICRO_TEST_ELIGIBLE", 10),
    researchWatchlist: byStatus("RESEARCH_WATCHLIST", 25),
    dataRecovery: byStatus("DATA_RECOVERY_REQUIRED", 25),
    blocked: byStatus("BLOCKED", 25),
  };
}

function compactProject(project = {}) {
  return {
    liveRank: project.liveRank ?? null,
    legacyRank: project.legacyRank ?? null,
    name: project.name || "Unknown",
    symbol: project.symbol || null,
    chain: project.chain || null,
    identityKey: project.identityKey || null,
    tokenAddress: tokenAddress(project),
    poolAddress: poolAddress(project),
    priceUsd: firstNumber(project.priceUsd, project.price),
    guardedLiveScore: project.guardedLiveScore ?? 0,
    explosionReadinessScore: project.explosionReadinessScore ?? 0,
    explosionReadinessState: project.explosionReadinessState || "INSUFFICIENT_EVIDENCE",
    explosionReadinessCoverage: project.explosionReadinessCoverage ?? 0,
    legacyProductionScore: project.legacyProductionScore ?? null,
    liveRankingModel: project.liveRankingModel || null,
    liveRankingCoverage: project.liveRankingCoverage ?? 0,
    liveActionStatus: project.liveActionStatus || "DATA_RECOVERY_REQUIRED",
    liveExecutionReady: project.liveExecutionReady === true,
    liveRankingUnprovenCanary: project.liveRankingUnprovenCanary === true,
    liveRankingDisplayEligible: project.liveRankingDisplayEligible === true,
    liveRankingUtilityEligible: project.liveRankingUtilityEligible === true,
    primaryCandidateSelected: project.primaryCandidateSelected === true,
    primaryCandidateLane: project.primaryCandidateLane || null,
    primaryCandidateDisposition: project.primaryCandidateDisposition || null,
    primaryCandidateReason: project.primaryCandidateReason || null,
    liveRankingMissingEvidence: array(project.liveRankingMissingEvidence),
    liveRankingBlocks: array(project.liveRankingBlocks),
    liveRankingGateReasons: array(project.liveRankingGateReasons),
    quoteAgeSeconds: project.liveRankingTrace?.execution?.quoteAgeSeconds ?? null,
    routeDepthUsd: project.liveRankingTrace?.execution?.routeDepthUsd ?? null,
    estimatedRoundTripSlippagePct:
      project.liveRankingTrace?.execution?.estimatedRoundTripSlippagePct ?? null,
    safetyStatus: project.liveRankingTrace?.execution?.safetyStatus || "UNKNOWN",
    safetyVerified: project.liveRankingTrace?.execution?.safetyVerified === true,
    microTestPlan: project.microTestPlan || null,
    liveRankingTrace: project.liveRankingTrace || null,
  };
}

function compactProjectIndex(project = {}) {
  return {
    liveRank: project.liveRank ?? null,
    legacyRank: project.legacyRank ?? null,
    name: project.name || "Unknown",
    symbol: project.symbol || null,
    chain: project.chain || null,
    identityKey: project.identityKey || null,
    tokenAddress: tokenAddress(project),
    poolAddress: poolAddress(project),
    guardedLiveScore: project.guardedLiveScore ?? 0,
    explosionReadinessScore: project.explosionReadinessScore ?? 0,
    explosionReadinessState: project.explosionReadinessState || "INSUFFICIENT_EVIDENCE",
    legacyProductionScore: project.legacyProductionScore ?? null,
    liveRankingCoverage: project.liveRankingCoverage ?? 0,
    liveActionStatus: project.liveActionStatus || "DATA_RECOVERY_REQUIRED",
    liveExecutionReady: project.liveExecutionReady === true,
    liveRankingDisplayEligible: project.liveRankingDisplayEligible === true,
    liveRankingUtilityEligible: project.liveRankingUtilityEligible === true,
    primaryCandidateSelected: project.primaryCandidateSelected === true,
    primaryCandidateLane: project.primaryCandidateLane || null,
    primaryCandidateDisposition: project.primaryCandidateDisposition || null,
    missingEvidenceCount: array(project.liveRankingMissingEvidence).length,
    blockerCount: array(project.liveRankingBlocks).length,
    gateReasonCount: array(project.liveRankingGateReasons).length,
  };
}

function reportStatus(summary = {}) {
  if (!summary.analyzed) return "NO_PROJECTS";
  if (summary.microTestEligible > 0) return "PASS_WITH_MICRO_TEST_ELIGIBLE";
  if (summary.researchWatchlist > 0) return "PASS_WITH_RESEARCH_WATCHLIST";
  return "PASS_DATA_RECOVERY_ONLY";
}

function markdown(payload = {}) {
  const topRows = payload.top10.length
    ? payload.top10
        .map(
          (project) =>
            `| ${project.liveRank} | ${project.name} | ${project.symbol || "-"} | ${project.chain || "-"} | ${project.guardedLiveScore} | ${project.liveActionStatus} | ${project.liveRankingCoverage} | ${project.legacyRank ?? "-"} | ${project.microTestPlan?.maximumExperimentAllocationUsd ?? "-"} |`
        )
        .join("\n")
    : "| - | No evidence-backed candidate passed the guarded research threshold. | - | - | - | NO_VALID_MOVE_TODAY | - | - | - |";
  const microRows = payload.microEligible.length
    ? payload.microEligible
        .map(
          (project) =>
            `| ${project.liveRank} | ${project.name} | ${project.symbol || "-"} | ${project.guardedLiveScore} | ${project.microTestPlan?.maximumExperimentAllocationUsd ?? "Not configured"} | ${project.liveRankingMissingEvidence.join(", ") || "None"} |`
        )
        .join("\n")
    : "| - | No candidate passed every identity, safety, measured-evidence, score, freshness, and two-way route gate. | - | - | - | - |";
  const primary = payload.primaryCandidate;
  const primaryRows = primary
    ? `| ${primary.liveRank ?? "-"} | ${primary.name} | ${primary.symbol || "-"} | ${primary.chain || "-"} | ${primary.guardedLiveScore} | ${primary.primaryCandidateLane || primary.liveActionStatus} | ${primary.primaryCandidateDisposition || "RESEARCH_ONLY"} | ${primary.liveRankingMissingEvidence.join(", ") || "None"} |`
    : "| - | No exact-identity, non-blocked deep candidate was available. | - | - | - | - | NOT_AVAILABLE | - |";

  return `# Guarded Live Core Ranking

Generated: ${payload.generatedAt}

## Status

- **Authoritative ranking:** ${payload.authoritativeRanking}
- **Production ranking changed:** Yes
- **Automatic trading enabled:** No
- **Backtest-selected model:** ${payload.policy?.winnerPublished ? payload.policy.bestModel : "No adequate winner; guarded unproven canary is active"}
- **Micro-test eligible:** ${payload.summary.microTestEligible}
- **Research watchlist:** ${payload.summary.researchWatchlist}
- **Data recovery required:** ${payload.summary.dataRecoveryRequired}
- **Blocked:** ${payload.summary.blocked}
- **Primary candidate:** ${payload.summary.primaryCandidate || "None"}
- **Primary candidate disposition:** ${payload.summary.primaryCandidateDisposition || "NOT_AVAILABLE"}

## Primary Candidate

| Rank | Project | Symbol | Chain | Live score | Lane | Disposition | Missing evidence |
|---:|---|---|---|---:|---|---|---|
${primaryRows}

## Live Top 10

| Rank | Project | Symbol | Chain | Live score | Status | Evidence coverage | Old rank | Experiment ceiling USD |
|---:|---|---|---|---:|---|---:|---:|---:|
${topRows}

## Manual Micro-Test Candidates

| Rank | Project | Symbol | Live score | Maximum experiment allocation USD | Missing evidence |
|---:|---|---|---:|---:|---|
${microRows}

## Truth Rules

A project is **MICRO_TEST_ELIGIBLE** only when exact identity, authoritative tested safety evidence, sufficient point-in-time baseline evidence, a passing guarded score, fresh verified buy and sell quotes, measured depth and slippage, and a live two-way execution route all pass.

The optional dollar value is a software safety ceiling, not a buy recommendation. This system never sends, signs, or automates transactions and never permits leverage or averaging down.
`;
}

function csvEscape(value) {
  const text =
    value === null || value === undefined
      ? ""
      : Array.isArray(value)
        ? value.join("; ")
        : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function writeGuardedLiveRankingReports(projects = [], meta = {}, options = {}) {
  const reportDir = path.resolve(options.reportDir || "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const ranked = [...projects].sort(
    (left, right) => Number(left.liveRank || 0) - Number(right.liveRank || 0)
  );
  const rows = ranked.map(compactProjectIndex);
  const projectsByStatus = (status, limit) =>
    ranked
      .filter(
        (project) =>
          (project.liveActionStatus || "DATA_RECOVERY_REQUIRED") === status
      )
      .slice(0, limit);
  const byStatus = (status, limit) =>
    projectsByStatus(status, limit).map(compactProject);
  const evidenceBackedProjects = ranked.filter((project) =>
    ["MICRO_TEST_ELIGIBLE", "RESEARCH_WATCHLIST"].includes(project.liveActionStatus)
  );
  const evidenceBacked = evidenceBackedProjects.slice(0, 10).map(compactProject);
  const recoveryLead = projectsByStatus("DATA_RECOVERY_REQUIRED", 1)[0] || null;
  const markedPrimaryCandidate = ranked.find((project) => project.primaryCandidateSelected) || null;
  const fallbackMonitoredLead = evidenceBackedProjects.length
    ? null
    : selectMonitoredResearchLead(ranked);
  const primaryCandidateProject = markedPrimaryCandidate || evidenceBackedProjects[0] || fallbackMonitoredLead;
  const inferredPrimaryMetadata = primaryCandidateMetadata(
    primaryCandidateProject,
    primaryCandidateProject === fallbackMonitoredLead
  );
  const primaryCandidate = primaryCandidateProject
    ? compactProject({
        ...primaryCandidateProject,
        primaryCandidateSelected: true,
        primaryCandidateLane:
          primaryCandidateProject.primaryCandidateLane || inferredPrimaryMetadata?.lane,
        primaryCandidateDisposition:
          primaryCandidateProject.primaryCandidateDisposition || inferredPrimaryMetadata?.disposition,
        primaryCandidateReason:
          primaryCandidateProject.primaryCandidateReason || inferredPrimaryMetadata?.reason,
      })
    : null;
  const funnelSummary = summarizeEvidenceFunnel(ranked);
  const summary = {
    analyzed: rows.length,
    microTestEligible: projectsByStatus("MICRO_TEST_ELIGIBLE", ranked.length).length,
    researchWatchlist: projectsByStatus("RESEARCH_WATCHLIST", ranked.length).length,
    dataRecoveryRequired: projectsByStatus("DATA_RECOVERY_REQUIRED", ranked.length).length,
    blocked: projectsByStatus("BLOCKED", ranked.length).length,
    legacyLeader: [...rows].sort(
      (left, right) => Number(left.legacyRank || Infinity) - Number(right.legacyRank || Infinity)
    )[0]?.name || null,
    liveLeader: evidenceBackedProjects[0]?.name || null,
    liveLeaderStatus: evidenceBackedProjects[0]?.liveActionStatus || null,
    recoveryLeader: recoveryLead?.name || null,
    primaryCandidate: primaryCandidate?.name || primaryCandidate?.symbol || null,
    primaryCandidateStatus: primaryCandidate?.liveActionStatus || null,
    primaryCandidateLane: primaryCandidate?.primaryCandidateLane || null,
    primaryCandidateDisposition: primaryCandidate?.primaryCandidateDisposition || null,
    invalidDisplayIdentity: rows.filter(
      (project) => project.liveRankingDisplayEligible !== true
    ).length,
    utilityProofPending: rows.filter(
      (project) => project.liveRankingUtilityEligible !== true
    ).length,
    backtestWinnerPublished: meta.guardedLiveRankingPolicy?.winnerPublished === true,
    selectedBacktestModel: meta.guardedLiveRankingPolicy?.bestModel || null,
    ...funnelSummary,
  };
  const payload = {
    generatedAt: new Date().toISOString(),
    scanRunId: meta.scanRunId || meta.runId || null,
    codeCommitSha: meta.codeCommitSha || null,
    dataCutoffTimestamp: meta.dataCutoffTimestamp || meta.completedAt || null,
    status: reportStatus(summary),
    authoritativeRanking: "GUARDED_LIVE_CORE",
    productionRankingChanged: true,
    automaticTradingEnabled: false,
    disclaimer:
      "Research and manual paper-execution support only. Not financial advice, not a buy/sell recommendation, and not a profit guarantee.",
    policy: meta.guardedLiveRankingPolicy || ranked[0]?.liveRankingTrace?.policy || null,
    configuration: meta.guardedLiveRankingConfiguration || null,
    projectsAnalyzed: rows.length,
    summary,
    funnelSummary,
    rankedDetailPolicy: {
      mode: "COMPLETE_LIGHTWEIGHT_INDEX_WITH_BOUNDED_LANE_DETAILS",
      rankedIndexCount: rows.length,
      fullTraceSections: ["primaryCandidate", "top10", "microEligible", "researchWatchlist", "dataRecovery", "blocked"],
      csvContainsAllProjects: true,
    },
    primaryCandidate,
    top10: evidenceBacked,
    microEligible: byStatus("MICRO_TEST_ELIGIBLE", 10),
    researchWatchlist: byStatus("RESEARCH_WATCHLIST", 25),
    dataRecovery: byStatus("DATA_RECOVERY_REQUIRED", 25),
    blocked: byStatus("BLOCKED", 25),
    ranked: rows,
  };
  const jsonPath = path.join(reportDir, "live-core-ranking.json");
  const markdownPath = path.join(reportDir, "live-core-ranking.md");
  const csvPath = path.join(reportDir, "live-core-ranking.csv");
  const microTestPath = path.join(reportDir, "micro-test-watchlist.json");
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  fs.writeFileSync(markdownPath, markdown(payload));
  const headers = [
    "liveRank",
    "legacyRank",
    "name",
    "symbol",
    "chain",
    "tokenAddress",
    "liveScore",
    "legacyScore",
    "status",
    "coverage",
    "executionReady",
    "safetyVerified",
    "quoteAgeSeconds",
    "routeDepthUsd",
    "slippagePct",
    "experimentCeilingUsd",
    "missingEvidence",
    "blocks",
  ];
  const csvRows = ranked.map((project) => [
    project.liveRank,
    project.legacyRank,
    project.name,
    project.symbol,
    project.chain,
    tokenAddress(project),
    project.guardedLiveScore,
    project.legacyProductionScore,
    project.liveActionStatus,
    project.liveRankingCoverage,
    project.liveExecutionReady,
    project.liveRankingTrace?.execution?.safetyVerified === true,
    project.liveRankingTrace?.execution?.quoteAgeSeconds ?? null,
    project.liveRankingTrace?.execution?.routeDepthUsd ?? null,
    project.liveRankingTrace?.execution?.estimatedRoundTripSlippagePct ?? null,
    project.microTestPlan?.maximumExperimentAllocationUsd,
    project.liveRankingMissingEvidence,
    project.liveRankingBlocks,
  ]);
  fs.writeFileSync(
    csvPath,
    [headers, ...csvRows].map((row) => row.map(csvEscape).join(",")).join("\n")
  );
  fs.writeFileSync(
    microTestPath,
    JSON.stringify(
      {
        generatedAt: payload.generatedAt,
        scanRunId: payload.scanRunId,
        codeCommitSha: payload.codeCommitSha,
        dataCutoffTimestamp: payload.dataCutoffTimestamp,
        status: payload.microEligible.length ? "CANDIDATES_AVAILABLE" : "NO_ELIGIBLE_CANDIDATES",
        automaticTradingEnabled: false,
        policy: payload.policy,
        configuration: payload.configuration,
        projectsAnalyzed: rows.length,
        summary,
        candidates: payload.microEligible,
        warnings: [
          "Manual research and confirmation are required.",
          "A ranking is not a guarantee of return.",
          "Never use leverage, borrowed money, or automatic wallet signing.",
        ],
      },
      null,
      2
    )
  );
  return {
    liveCoreRankingJsonPath: jsonPath,
    liveCoreRankingMarkdownPath: markdownPath,
    liveCoreRankingCsvPath: csvPath,
    microTestWatchlistPath: microTestPath,
  };
}

export { adaptForCoreModels, scoreCandidate, strictExecution };
