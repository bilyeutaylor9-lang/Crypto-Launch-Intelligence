// src/learning/scanMemoryStore.js

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const MEMORY_FILE = path.join(DATA_DIR, "scan-history.json");
const MAX_RECORDS = Number(process.env.MAX_SCAN_MEMORY_RECORDS || 25000);

let memoryCache = null;
let memoryCacheMtimeMs = 0;

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getMemoryMtimeMs() {
  try {
    return fs.statSync(MEMORY_FILE).mtimeMs;
  } catch {
    return 0;
  }
}

function readMemory() {
  ensureDataDir();

  const mtimeMs = getMemoryMtimeMs();
  if (memoryCache && memoryCacheMtimeMs === mtimeMs) return memoryCache;

  if (!mtimeMs) {
    memoryCache = [];
    memoryCacheMtimeMs = 0;
    return memoryCache;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
    memoryCache = Array.isArray(parsed) ? parsed : [];
    memoryCacheMtimeMs = mtimeMs;
    return memoryCache;
  } catch {
    memoryCache = [];
    memoryCacheMtimeMs = mtimeMs;
    return memoryCache;
  }
}

function writeMemory(records = []) {
  ensureDataDir();
  const trimmed = records.slice(-MAX_RECORDS);
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(trimmed, null, 2));
  memoryCache = trimmed;
  memoryCacheMtimeMs = getMemoryMtimeMs();
}

function tokenId(project = {}) {
  return String(
    project.address ||
      project.tokenAddress ||
      project.pairAddress ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  ).toLowerCase();
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

export function createScanRecord(project = {}) {
  return {
    id: tokenId(project),
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    source: project.source || "unknown",
    discoverySources: project.discoverySources || [],
    scannedAt: new Date().toISOString(),

    market: {
      priceUsd: num(project.priceUsd ?? project.price),
      liquidityUsd: num(project.liquidityUsd ?? project.liquidity),
      volume24h: num(project.volume24h ?? project.volume),
      marketCap: num(project.marketCap ?? project.fdv),
      fdv: num(project.fdv ?? project.marketCap),
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
  const existing = readMemory();
  const safeProjects = Array.isArray(projects) ? projects : [];

  const newRecords = safeProjects.map(createScanRecord);
  const updated = [...existing, ...newRecords].slice(-MAX_RECORDS);

  writeMemory(updated);

  return {
    saved: newRecords.length,
    totalRecords: updated.length,
    maxRecords: MAX_RECORDS,
    file: MEMORY_FILE,
  };
}

export function loadScanMemory() {
  return readMemory();
}

export function clearScanMemory() {
  writeMemory([]);

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
