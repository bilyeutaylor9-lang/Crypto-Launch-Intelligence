// src/learning/scanMemoryStore.js

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const MEMORY_FILE = path.join(DATA_DIR, "scan-history.json");
const MAX_RECORDS = Number(process.env.MAX_SCAN_MEMORY_RECORDS || 25000);

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readMemory() {
  ensureDataDir();

  if (!fs.existsSync(MEMORY_FILE)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMemory(records = []) {
  ensureDataDir();
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(records.slice(-MAX_RECORDS), null, 2));
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
    ? evidence.slice(-20).map((item) => ({
        engine: item.engine,
        signal: item.signal,
        score: item.score,
        confidence: item.confidence,
        impact: item.impact,
        reasons: item.reasons || item.details?.reasons || [],
      }))
    : [];
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
      infrastructureNarrative: num(project.infrastructureNarrativeScore),
      developer: num(project.developerActivityScore ?? project.developerScore),
      github: num(project.githubScore ?? project.githubQualityScore),
      community: num(project.communityGrowthScore ?? project.communityScore),
      socialAcceleration: num(project.socialAccelerationScore),
      xSocial: num(project.xSocialScore),
      xSocialVelocity: num(project.xSocialVelocityScore),
      xInstitutionalAttention: num(project.xInstitutionalAttentionScore),
      institutionalWatch: num(project.institutionalWatchScore),
      learningEdge: num(project.learningEdgeScore),
      holderGrowth: num(project.holderGrowthScore),
      whale: num(project.whaleScore ?? project.whaleActivityScore),
      smartWallet: num(project.smartWalletScore),
      smartWalletPerformance: num(project.smartWalletPerformanceScore),
      smartMoneyAccumulation: num(project.smartMoneyAccumulationScore),
      smartMoneyRotation: num(project.smartMoneyRotationScore),
      catalyst: num(project.catalystScore),
      catalystCalendar: num(project.catalystCalendarScore),
      exchangeProbability: num(project.exchangeProbabilityScore),
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
      intelligenceSignals: project.intelligenceSignals || {},
      strongestCatalyst: project.strongestCatalyst || project.nextCatalyst || null,
      prePumpReasons: project.prePump?.reasons || [],
      alerts: project.alerts || [],
      alphaTags: project.alphaTags || [],
      riskFlags: project.riskFlags || [],
      opportunityThesis: project.opportunityThesis || null,
      researchChecklist: project.researchChecklist || [],
      invalidationSignals: project.invalidationSignals || [],
      xSocialSignals: project.xSocialSignals || {},
      institutionalLearning: project.institutionalLearning || {},
      evidence: compactEvidence(project.evidence),
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
