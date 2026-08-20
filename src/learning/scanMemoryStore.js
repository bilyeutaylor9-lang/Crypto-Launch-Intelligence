// src/learning/scanMemoryStore.js

import fs from "fs";
import path from "path";
import {
  appendMemorySidecar,
  memoryFileSizeBytes,
  memoryRewriteLimitBytes,
  memorySidecarPath,
  readMemorySidecarTail,
  shouldUseAppendOnlyMemory,
} from "./boundedMemoryStore.js";
import {
  normalizeChainId,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";
import { captureProspectiveEntryEdgeCohort } from "./prospectiveEntryEdgeEpisodeStore.js";

const DATA_DIR = path.resolve("data");
const MEMORY_FILE = path.join(DATA_DIR, "scan-history.json");
const MAX_RECORDS = Number(process.env.MAX_SCAN_MEMORY_RECORDS || 25000);
const DEFAULT_MAX_LOAD_RECORDS = 5000;

let memoryCache = null;
let memoryCacheKey = "";
let runtimePrimedMemory = [];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function booleanOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

function firstValue(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== "") ?? null;
}

function isoTimestampOrNull(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(true|1|yes|on)$/i.test(String(value).trim());
}

function maxLoadRecords(options = {}) {
  const configured = Math.floor(num(options.limit || process.env.MAX_SCAN_MEMORY_LOAD_RECORDS));
  return configured > 0 ? configured : DEFAULT_MAX_LOAD_RECORDS;
}

function getMemoryMtimeMs(filePath = MEMORY_FILE) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function readLegacyJsonMemory(filePath = MEMORY_FILE, limit = DEFAULT_MAX_LOAD_RECORDS) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(parsed) ? parsed.slice(-limit) : [];
}

export function loadScanMemoryFromFile(filePath = MEMORY_FILE, options = {}) {
  ensureDataDir();

  const resolvedPath = path.resolve(filePath);
  const sidecarPath = memorySidecarPath(resolvedPath);
  const mtimeMs = getMemoryMtimeMs(resolvedPath);
  const sidecarMtimeMs = getMemoryMtimeMs(sidecarPath);
  const limit = maxLoadRecords(options);
  const cacheKey = `${resolvedPath}:${mtimeMs}:${sidecarMtimeMs}:${limit}`;
  const useCache = resolvedPath === MEMORY_FILE && options.useCache !== false;
  if (useCache && memoryCache && memoryCacheKey === cacheKey) return memoryCache;

  if (!mtimeMs && !sidecarMtimeMs) {
    if (useCache) {
      memoryCache = [];
      memoryCacheKey = cacheKey;
      return memoryCache;
    }
    return [];
  }

  const sidecarRecords = sidecarMtimeMs
    ? readMemorySidecarTail(resolvedPath, {
        limit,
        maxBytes: Number(options.sidecarMaxBytes || process.env.SCAN_MEMORY_SIDECAR_READ_BYTES || 16 * 1024 * 1024),
      })
    : [];
  const legacyBytes = memoryFileSizeBytes(resolvedPath);
  const largeLegacyJson = legacyBytes > memoryRewriteLimitBytes(process.env);
  const preferSidecar = sidecarRecords.length && boolEnv(process.env.SCAN_MEMORY_PREFER_SIDECAR, true);
  const allowLargeLegacyRead =
    options.allowLargeLegacyRead === true ||
    boolEnv(process.env.SCAN_MEMORY_ALLOW_LARGE_JSON_READ, false);

  if (preferSidecar || (largeLegacyJson && !allowLargeLegacyRead)) {
    if (useCache) {
      memoryCache = sidecarRecords;
      memoryCacheKey = cacheKey;
      return memoryCache;
    }
    return sidecarRecords;
  }

  try {
    const legacyRecords = mtimeMs ? readLegacyJsonMemory(resolvedPath, limit) : [];
    const records = sidecarRecords.length
      ? [...legacyRecords, ...sidecarRecords].slice(-limit)
      : legacyRecords;
    if (useCache) {
      memoryCache = records;
      memoryCacheKey = cacheKey;
      return memoryCache;
    }
    return records;
  } catch {
    if (useCache) {
      memoryCache = sidecarRecords;
      memoryCacheKey = cacheKey;
      return memoryCache;
    }
    return sidecarRecords;
  }
}

function readMemory() {
  return loadScanMemoryFromFile(MEMORY_FILE);
}

function writeMemory(records = []) {
  ensureDataDir();
  const trimmed = records.slice(-MAX_RECORDS);
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(trimmed, null, 2));
  memoryCache = trimmed;
  memoryCacheKey = "";
}

function tokenId(project = {}) {
  const chain = normalizeChainId(project.chain || project.network || project.chainId || "");
  const tokenAddress = normalizeTokenAddress(
    project.address || project.tokenAddress || project.contractAddress || "",
    chain
  );
  if (tokenAddress) return tokenAddress;
  return String(
    project.pairAddress ||
      project.poolAddress ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  ).toLowerCase();
}

function canonicalIdentityKey(project = {}, tokenAddress = null) {
  if (!tokenAddress) return null;
  const chain = normalizeChainId(project.chain || project.network || project.chainId || "") || String(project.chain || project.network || "unknown").toLowerCase();
  const normalizedAddress = normalizeTokenAddress(tokenAddress, chain) || String(tokenAddress);
  return chain && chain !== "unknown" ? `${chain}:${normalizedAddress}` : null;
}

function createPointInTimeEvidence(project = {}, scannedAt) {
  const sourceTimestamp = isoTimestampOrNull(
    firstValue(
      project.observedAt,
      project.sourceTimestamp,
      project.dataTimestamp,
      project.quoteTimestamp,
      project.updatedAt
    )
  );
  const tokenAddress = firstValue(
    project.tokenAddress,
    project.contractAddress,
    project.canonicalAddress,
    project.baseToken?.address,
    project.marketData?.tokenAddress
  );
  const poolAddress = firstValue(
    project.poolAddress,
    project.pairAddress,
    project.primaryTradablePool,
    project.marketData?.poolAddress
  );
  const catalyst = project.strongestCatalyst || project.nextCatalyst || null;
  const deterministicBlocks = compactTextList(
    project.safetyProofState?.deterministicBlocks ||
      project.safetyDeterministicBlocks ||
      project.deterministicSafetyBlocks,
    12
  );

  return {
    schemaVersion: 1,
    capturedAt: scannedAt,
    sourceTimestamp,
    identity: {
      chain: project.chain || project.network || null,
      tokenAddress: tokenAddress ? String(tokenAddress) : null,
      poolAddress: poolAddress ? String(poolAddress) : null,
      resolved: booleanOrNull(
        firstValue(project.identityResolved, project.strictIdentityVerified, project.tokenIdentityVerified)
      ),
      status: firstValue(project.identityStatus, project.identityResolutionStatus, project.finalIdentityState),
      confidence: numericOrNull(firstValue(project.identityConfidence, project.identityResolutionScore)),
      source: firstValue(project.identitySource, project.identityResolutionSource),
      observedAt: isoTimestampOrNull(firstValue(project.identityObservedAt, sourceTimestamp)),
    },
    buyers: {
      uniqueBuyers24h: numericOrNull(
        firstValue(project.uniqueBuyers24h, project.buyers24h, project.marketData?.buyers24h)
      ),
      clusterAdjustedUniqueBuyers24h: numericOrNull(
        firstValue(
          project.clusterAdjustedUniqueBuyers24h,
          project.clusterAdjustedBuyers24h,
          project.independentBuyers24h
        )
      ),
      previousClusterAdjustedUniqueBuyers24h: numericOrNull(
        firstValue(project.previousClusterAdjustedUniqueBuyers24h, project.priorIndependentBuyers24h)
      ),
      accelerationPct: numericOrNull(
        firstValue(project.buyerBreadthAccelerationPct, project.independentBuyerAccelerationPct)
      ),
      source: firstValue(project.buyerBreadthSource, project.buyerSource),
      observedAt: isoTimestampOrNull(firstValue(project.buyerBreadthObservedAt, sourceTimestamp)),
    },
    smartWallets: {
      qualifiedNetFlowUsd: numericOrNull(
        firstValue(
          project.qualifiedSmartWalletNetFlowUsd,
          project.walletFlow?.qualifiedSmartWalletNetFlowUsd,
          project.smartWalletNetFlowUsd
        )
      ),
      qualifiedWalletCount: numericOrNull(
        firstValue(project.qualifiedSmartWalletCount, project.smartWalletFlow?.qualifiedWalletCount)
      ),
      qualificationMethod: firstValue(
        project.smartWalletQualificationMethod,
        project.walletFlow?.qualificationMethod
      ),
      source: firstValue(project.smartWalletFlowSource, project.walletFlow?.source),
      observedAt: isoTimestampOrNull(firstValue(project.smartWalletFlowObservedAt, sourceTimestamp)),
    },
    liquidity: {
      liquidityUsd: numericOrNull(
        firstValue(project.liquidityUsd, project.dexLiquidityUsd, project.marketData?.liquidityUsd)
      ),
      previousLiquidityUsd: numericOrNull(
        firstValue(project.previousLiquidityUsd, project.priorLiquidityUsd)
      ),
      growthPct: numericOrNull(firstValue(project.liquidityGrowthPct, project.liquidityFormationPct)),
      source: firstValue(project.liquiditySource, project.marketData?.source),
      observedAt: isoTimestampOrNull(firstValue(project.liquidityObservedAt, sourceTimestamp)),
    },
    market: {
      priceUsd: numericOrNull(firstValue(project.priceUsd, project.price, project.marketData?.priceUsd)),
      priceChange24hPct: numericOrNull(firstValue(project.priceChange24h, project.marketData?.priceChange24h)),
      volume24hUsd: numericOrNull(firstValue(project.volume24h, project.volume, project.marketData?.volume24h)),
      previousVolume24hUsd: numericOrNull(firstValue(project.previousVolume24h, project.priorVolume24h)),
      volumeAccelerationPct: numericOrNull(firstValue(project.volumeAccelerationPct, project.volumeGrowthPct)),
      marketCapUsd: numericOrNull(
        firstValue(project.circulatingMarketCapUsd, project.marketCapUsd, project.marketCap)
      ),
      source: firstValue(project.marketData?.source, project.source),
      observedAt: isoTimestampOrNull(firstValue(project.marketObservedAt, sourceTimestamp)),
    },
    catalyst: {
      verified: booleanOrNull(
        firstValue(project.verifiedCatalyst, catalyst?.verified, catalyst?.verificationStatus === "VERIFIED" ? true : null)
      ),
      type: firstValue(catalyst?.type, project.catalystType),
      announcedAt: isoTimestampOrNull(firstValue(catalyst?.announcedAt, catalyst?.publishedAt)),
      eventAt: isoTimestampOrNull(firstValue(catalyst?.date, catalyst?.expectedAt)),
      source: firstValue(catalyst?.source, project.catalystSource),
    },
    safety: {
      status: firstValue(project.safetyProofStatus, project.safetyProofState?.status),
      honeypotDetected: booleanOrNull(firstValue(project.honeypotDetected, project.isHoneypot)),
      sellRestricted: booleanOrNull(firstValue(project.sellRestricted, project.sellRestrictionDetected)),
      contractVerified: booleanOrNull(firstValue(project.contractVerified, project.sourceCodeVerified)),
      testedChecks: compactTextList(project.safetyProofState?.testedChecks || project.safetyTestedChecks, 16),
      unknownChecks: compactTextList(project.safetyProofState?.unknownChecks || project.safetyUnknownChecks, 16),
      deterministicBlocks,
      source: firstValue(project.safetyProofSource, project.securitySource),
      observedAt: isoTimestampOrNull(firstValue(project.safetyProofObservedAt, sourceTimestamp)),
    },
    execution: {
      buyQuoteVerified: booleanOrNull(project.buyQuoteVerified),
      sellQuoteVerified: booleanOrNull(project.sellQuoteVerified),
      depthVerified: booleanOrNull(firstValue(project.depthVerified, project.orderBookDepthVerified)),
      slippageVerified: booleanOrNull(project.slippageVerified),
      quoteTimestamp: isoTimestampOrNull(project.quoteTimestamp),
      orderBookDepthUsd: numericOrNull(project.orderBookDepthUsd),
      estimatedRoundTripSlippagePct: numericOrNull(project.estimatedRoundTripSlippagePct),
      routeTruthStatus: firstValue(project.routeTruthStatus, project.executionProofState),
      source: firstValue(project.executionRecoverySource, project.routeSource),
    },
    provenance: {
      discoverySources: compactTextList(project.discoverySources || project.sources, 20),
      providerStatuses: Array.isArray(project.providerStatuses)
        ? project.providerStatuses.slice(0, 20).map((item) => ({
            provider: compactText(item?.provider || item?.source || "", 80),
            status: compactText(item?.status || "", 80),
            observedAt: isoTimestampOrNull(item?.observedAt || item?.timestamp),
          }))
        : [],
      aliasConflicts: compactTextList(project.aliasConflicts || project.canonicalFieldConflicts, 12),
    },
    productionDecision: {
      score: numericOrNull(firstValue(project.pipelineScore, project.opportunityScore)),
      rank: numericOrNull(firstValue(project.marketOpportunityRank, project.opportunityRank)),
      verdict: firstValue(project.finalSelectionState, project.pipelineTier, project.verdict),
      confidence: numericOrNull(firstValue(project.pipelineConfidenceScore, project.confidenceScore)),
    },
  };
}

function compactEvidence(evidence = []) {
  return Array.isArray(evidence)
    ? evidence.slice(-12).map((item) => ({
        engine: item.engine,
        signal: compactText(item.signal, 240),
        score: item.score,
        confidence: item.confidence,
        impact: item.impact,
        reasons: compactTextList(item.reasons || item.details?.reasons || [], 4, 180),
      }))
    : [];
}

function compactText(value, maxLength = 480) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 23))}[truncated for memory]` : text;
}

function compactTextList(values = [], limit = 12, maxLength = 240) {
  const items = Array.isArray(values) ? values : [values];
  return items
    .slice(0, limit)
    .map((item) => {
      if (typeof item === "string" || typeof item === "number") return compactText(item, maxLength);
      if (!item || typeof item !== "object") return "";
      return compactText(item.label || item.reason || item.signal || item.title || item.name || "", maxLength);
    })
    .filter(Boolean);
}

function compactCatalyst(value = null) {
  if (!value || typeof value !== "object") return value ? compactText(value, 240) : null;

  return {
    title: compactText(value.title || value.name || value.summary || "", 240),
    date: value.date || value.timestamp || value.expectedAt || null,
    status: value.status || null,
    source: value.source || null,
  };
}

export function createScanRecord(project = {}, options = {}) {
  const scannedAt = isoTimestampOrNull(options.scannedAt || project.scanTimestamp) || new Date().toISOString();
  const pointInTime = createPointInTimeEvidence(project, scannedAt);
  return {
    id: tokenId(project),
    identityKey: canonicalIdentityKey(project, pointInTime.identity.tokenAddress),
    pointInTimeSchemaVersion: 3,
    scanRunId: project.scanRunId || project.runId || null,
    codeCommitSha: project.codeCommitSha || process.env.GITHUB_SHA || null,
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    tokenAddress: pointInTime.identity.tokenAddress,
    poolAddress: pointInTime.identity.poolAddress,
    source: project.source || "unknown",
    discoverySources: project.discoverySources || [],
    scannedAt,
    pointInTime,

    market: {
      priceUsd: num(project.priceUsd ?? project.price),
      liquidityUsd: num(project.liquidityUsd ?? project.liquidity),
      volume24h: num(project.volume24h ?? project.volume),
      marketCap: num(project.marketCap ?? project.circulatingMarketCap ?? project.circulatingMarketCapUsd),
      fdv: num(project.fdv ?? project.fullyDilutedValue ?? project.fullyDilutedValueUsd),
      priceChange24h: num(project.priceChange24h),
    },

    scores: {
      pipeline: num(project.pipelineScore ?? project.opportunityScore),
      opportunity: num(project.opportunityScore ?? project.pipelineScore),
      marketRank: num(project.marketRankScore),
      richToken: num(project.richTokenScore),
      prePump: num(project.prePump?.score),
      baseline: num(project.baselineScore),
      velocity: num(project.velocityScore),
      acceleration: num(project.accelerationScore),
      trendChange: num(project.trendChangeScore),
      momentumCompression: num(project.momentumCompressionScore),
      momentumShift: num(project.momentumShiftScore),
      capitalFlow: num(project.capitalFlowScore),
      buyPressure: num(project.buyPressureScore),
      sellPressure: num(project.sellPressureScore),
      relativeStrength: num(project.relativeStrengthScore),
      liquidity: num(project.liquidityScore),
      liquidityExpansion: num(project.liquidityExpansionScore),
      narrative: num(project.narrativeScore),
      narrativeForecast: num(project.narrativeForecastScore),
      narrativeLaunchStaking: num(project.narrativeLaunchStakingScore),
      infrastructureNarrative: num(project.infrastructureNarrativeScore),
      developer: num(project.developerActivityScore ?? project.developerScore),
      github: num(project.githubScore ?? project.githubQualityScore),
      community: num(project.communityGrowthScore ?? project.communityScore),
      socialAcceleration: num(project.socialAccelerationScore),
      xSocial: num(project.xSocialScore),
      xSocialVelocity: num(project.xSocialVelocityScore),
      xInstitutionalAttention: num(project.xInstitutionalAttentionScore),
      externalSignal: num(project.externalSignalScore),
      externalRisk: num(project.externalRiskScore),
      institutionalWatch: num(project.institutionalWatchScore),
      learningEdge: num(project.learningEdgeScore),
      outcomeLearning: num(project.outcomeLearningScore),
      prePumpPattern: num(project.prePumpPatternScore),
      signalCombination: num(project.signalCombinationScore),
      calibration: num(project.calibrationScore),
      quantumOpportunity: num(project.quantumOpportunityScore),
      aiAnalyst: num(project.aiAnalystScore),
      institutionalVNext: num(project.institutionalVNextScore),
      institutionalConfidence: num(project.institutionalConfidenceScore),
      evidenceQuality: num(project.evidenceQualityScore),
      confidenceAdjusted: num(project.confidenceAdjustedScore),
      narrativeHeat: num(project.narrativeHeatScore),
      projectChange: num(project.projectChangeScore),
      sourceReliability: num(project.sourceReliabilityScore),
      trapRisk: num(project.trapRiskScore),
      alphaLab: num(project.alphaLabScore),
      aiEcosystem: num(project.aiEcosystemScore),
      quantumBrain: num(project.quantumBrainScore),
      worldModel: num(project.worldModelScore),
      marketScientist: num(project.marketScientistScore),
      simulationBrain: num(project.simulationBrainScore),
      outcomeJudge: num(project.outcomeJudgeScore),
      liveCatalystRadar: num(project.liveCatalystRadarScore),
      dossierSwarm: num(project.dossierSwarmScore),
      strategyLab: num(project.strategyLabScore),
      paperTrade: num(project.paperTradeScore),
      causalAlpha: num(project.causalAlphaScore),
      autonomousAlphaOS: num(project.autonomousAlphaOSScore),
      paperOutcomeLab: num(project.paperOutcomeLabScore),
      autoLearningWeight: num(project.autoLearningWeightScore),
      sourceTruth: num(project.sourceTruthScore),
      githubPro: num(project.githubProScore),
      organicEconomicIntegrity: num(project.organicEconomicIntegrityScore),
      organicDemand: num(project.organicDemandScore),
      identityResolution: num(project.identityResolutionScore),
      identityRisk: num(project.identityRiskScore),
      activeLiquidityTruth: num(project.activeLiquidityTruthScore),
      liquidityControlRisk: num(project.liquidityControlRisk),
      organicBuyer: num(project.organicBuyerScore),
      walletCluster: num(project.walletClusterScore),
      walletClusterRisk: num(project.walletClusterRiskScore),
      bundledLaunchRisk: num(project.bundledLaunchRiskScore),
      washTradingRisk: num(project.washTradingRiskScore),
      smartWalletArrival: num(project.smartWalletArrivalScore),
      buyerRetention: num(project.buyerRetentionScore),
      organicDemandFirewall: num(project.organicDemandFirewallScore),
      organicDemandFirewallRisk: num(project.organicDemandFirewallRisk),
      instantSafety: num(project.instantSafetyScore),
      instantSafetyRisk: num(project.instantSafetyRiskScore),
      candidateLifecycleReadiness: num(project.candidateLifecycleReadinessScore),
      discoveryDecision: num(project.discoveryDecisionScore),
      economicSustainability: num(project.economicSustainabilityScore),
      economicIntegrityRisk: num(project.economicIntegrityRiskScore),
      autonomousResearch: num(project.autonomousResearchScore),
      alphaKnowledgeGraph: num(project.alphaKnowledgeGraphScore),
      causalMarketTwin: num(project.causalMarketTwinScore),
      smallCapHunter: num(project.smallCapHunterScore),
      proofOfAlphaExecutionTwin: num(project.proofOfAlphaExecutionTwinScore),
      smartMoneyConviction: num(project.smartMoneyConvictionScore),
      liquidityMigration: num(project.liquidityMigrationScore),
      vestingPressure: num(project.vestingPressureScore),
      tokenUnlockRisk: num(project.tokenUnlockRiskScore),
      holderGrowth: num(project.holderGrowthScore),
      whale: num(project.whaleScore ?? project.whaleActivityScore),
      smartWallet: num(project.smartWalletScore),
      smartWalletPerformance: num(project.smartWalletPerformanceScore),
      smartMoneyAccumulation: num(project.smartMoneyAccumulationScore),
      smartMoneyRotation: num(project.smartMoneyRotationScore),
      catalyst: num(project.catalystScore),
      catalystCalendar: num(project.catalystCalendarScore),
      exchangeProbability: num(project.exchangeProbabilityScore),
      launchReadiness: num(project.launchReadinessScore),
      stakingMomentum: num(project.stakingMomentumScore),
      stakingRisk: num(project.stakingRiskScore),
      tokenomics: num(project.tokenomicsScore),
      fundingBackers: num(project.fundingBackerScore),
      partnerships: num(project.partnershipScore),
      ecosystemIntegration: num(project.ecosystemIntegrationScore),
      risk: num(project.riskScore),
      explosionReadiness: num(project.explosionReadinessScore),
    },

    labels: {
      pipelineTier: project.pipelineTier || project.tier || null,
      confidence: project.pipelineConfidence || project.confidence || null,
      conviction: project.conviction || null,
      allocationBucket: project.allocationBucket || null,
      marketRankLevel: project.marketRankLevel || null,
      richTokenLevel: project.richTokenLevel || null,
      prePumpStatus: project.prePump?.status || null,
      momentumShiftLevel: project.momentumShiftLevel || null,
      narrativeLevel: project.narrativeLevel || null,
      catalystLevel: project.catalystLevel || null,
    },

    signals: {
      snapshotVersion: 2,
      strongestCatalyst: compactCatalyst(project.strongestCatalyst || project.nextCatalyst),
      prePumpReasons: compactTextList(project.prePump?.reasons, 8),
      alerts: compactTextList(project.alerts, 12),
      alphaTags: compactTextList(project.alphaTags, 16),
      riskFlags: compactTextList(project.riskFlags, 16),
      opportunityThesis: compactText(project.opportunityThesis, 600) || null,
      researchChecklist: compactTextList(project.researchChecklist, 10),
      invalidationSignals: compactTextList(project.invalidationSignals, 10),
      externalIntelligence: {
        narrativeHits: compactTextList(project.externalIntelligence?.narrativeHits, 12),
        sourceCount: num(project.externalIntelligence?.sourceCount),
        riskSignals: compactTextList(project.externalIntelligence?.riskSignals, 8),
      },
      dataConfidence: project.dataConfidence || null,
      dataConfidenceScore: num(project.dataConfidenceScore),
      aiDecision: project.aiDecision || null,
      aiConfidence: project.aiConfidence || null,
      explainabilitySummary: compactText(project.explainabilitySummary, 600) || null,
      quantumOutcomeField: {
        collapseProbability: num(project.quantumOutcomeField?.collapseProbability),
      },
      evidence: compactEvidence(project.evidence),
      strongBuyLifecycleStage: project.strongBuyLifecycleStage || null,
      finalSelectionState: project.finalSelectionState || null,
      finalSelectionQualified: Boolean(project.finalSelectionQualified),
      finalIntegrityScore: num(project.finalIntegrityScore),
      finalIntegrityVerdict: project.finalIntegrityVerdict || null,
      finalBlockingReasons: compactTextList(project.finalBlockingReasons, 8),
      finalWarningReasons: compactTextList(project.finalWarningReasons, 8),
      finalIdentityState: project.finalIdentityState || null,
      permanentProjectKey: project.permanentProjectKey || null,
      preConsensusRank: project.preConsensusRank || null,
      preConsensusCandidateType: project.preConsensusCandidateType || null,
      preConsensusTier: project.preConsensusTier || null,
      preConsensusOpportunityScore: num(project.preConsensusOpportunityScore),
      regimeAdjustedOpportunityScore: num(project.regimeAdjustedOpportunityScore),
      informationAdvantageScore: num(project.informationAdvantageScore),
      quietAccumulationDetected: Boolean(project.quietAccumulationDetected),
      quietAccumulationScore: num(project.quietAccumulationScore),
      preBreakoutMomentumStage: project.preBreakoutMomentumStage || null,
      antiManipulationConfidenceScore: num(project.antiManipulationConfidenceScore),
      signalPersistenceScore: num(project.signalPersistenceScore),
      sniperState: project.sniperState || null,
      sniperQualified: Boolean(project.sniperQualified),
      sniperScore: num(project.sniperScore),
      confidenceAdjustedSniperScore: num(project.confidenceAdjustedSniperScore),
      sniperConfidence: project.sniperConfidence || null,
      sniperReasons: compactTextList(project.sniperReasons, 8),
      sniperBlockingReasons: compactTextList(project.sniperBlockingReasons, 8),
      primarySniperOutcomeLabel: project.primarySniperOutcomeLabel || null,
      pointInTimeStatus: project.pointInTimeStatus || null,
      explosionReadinessState: project.explosionReadinessState || null,
      explosionReadinessCoverage: numericOrNull(project.explosionReadinessCoverage),
      explosionReadinessRankEligible: Boolean(project.explosionReadinessRankEligible),
    },

    futureOutcomes: {
      after1h: null,
      after24h: null,
      after7d: null,
      after30d: null,
    },
  };
}

export function saveScanMemory(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const scannedAt = new Date().toISOString();
  const newRecords = safeProjects.map((project) => createScanRecord(project, { scannedAt }));
  let prospectiveEntryTrialCapture = null;
  try {
    prospectiveEntryTrialCapture = captureProspectiveEntryEdgeCohort(newRecords);
  } catch (error) {
    prospectiveEntryTrialCapture = { state: "CAPTURE_FAILED_SAFE", error: error.message, saved: 0 };
  }

  if (shouldUseAppendOnlyMemory(MEMORY_FILE)) {
    const sidecar = appendMemorySidecar(MEMORY_FILE, newRecords, { recordType: "scan-history" });
    return {
      saved: newRecords.length,
      totalRecords: null,
      maxRecords: MAX_RECORDS,
      file: sidecar.file,
      persistenceMode: sidecar.mode,
      legacyFilePreserved: sidecar.legacyFilePreserved,
      legacyFileBytes: sidecar.legacyFileBytes,
      prospectiveEntryTrialCapture,
    };
  }

  const existing = readMemory();
  const updated = [...existing, ...newRecords].slice(-MAX_RECORDS);

  writeMemory(updated);

  return {
    saved: newRecords.length,
    totalRecords: updated.length,
    maxRecords: MAX_RECORDS,
    file: MEMORY_FILE,
    prospectiveEntryTrialCapture,
  };
}

export function loadScanMemory() {
  const local = readMemory();
  return runtimePrimedMemory.length
    ? [...local, ...runtimePrimedMemory].slice(-maxLoadRecords())
    : local;
}

export function primeScanMemory(records = [], options = {}) {
  const limit = maxLoadRecords(options);
  runtimePrimedMemory = (Array.isArray(records) ? records : [])
    .filter((record) => record && typeof record === "object")
    .slice(-limit);
  memoryCacheKey = "";
  return {
    primed: runtimePrimedMemory.length,
    source: options.source || "runtime",
  };
}

export function clearScanMemory() {
  writeMemory([]);
  runtimePrimedMemory = [];
  try {
    const sidecarPath = memorySidecarPath(MEMORY_FILE);
    if (fs.existsSync(sidecarPath)) fs.unlinkSync(sidecarPath);
  } catch {
    // Best-effort cleanup for local maintenance.
  }

  return {
    cleared: true,
    file: MEMORY_FILE,
  };
}

export function getLatestScanRecords(limit = 25) {
  return readMemory().slice(-Number(limit || 25));
}

export function getProjectHistory(projectId, limit = 100) {
  const id = String(projectId || "").toLowerCase();

  return readMemory()
    .filter((record) => record.id === id)
    .slice(-Number(limit || 100));
}

export function getProjectHistories(projectIds = [], limit = 100) {
  const ids = new Set(
    (Array.isArray(projectIds) ? projectIds : [projectIds])
      .map((id) => String(id || "").toLowerCase())
      .filter(Boolean)
  );
  const historyLimit = Number(limit || 100);
  const histories = new Map([...ids].map((id) => [id, []]));

  if (!ids.size) return histories;

  for (const record of readMemory()) {
    const id = String(record.id || "").toLowerCase();
    if (!ids.has(id)) continue;

    const history = histories.get(id);
    history.push(record);
    if (history.length > historyLimit) history.shift();
  }

  return histories;
}

export function summarizeMemory() {
  const memory = readMemory();
  const latest = memory.at(-1);

  return {
    file: MEMORY_FILE,
    records: memory.length,
    latestScanAt: latest?.scannedAt || null,
    latestProjects: memory.slice(-10).map((record) => ({
      name: record.name,
      symbol: record.symbol,
      score: record.scores?.pipeline || 0,
      tier: record.labels?.pipelineTier || null,
    })),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizeMemory(), null, 2));
}
