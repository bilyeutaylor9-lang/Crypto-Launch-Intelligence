// src/learning/scanMemoryStore.js

/**
 * Crypto Launch Intelligence
 * Scan Memory Store
 *
 * Purpose:
 * Saves every scan so the platform can learn over time.
 *
 * This creates the foundation for:
 * - outcome tracking
 * - signal performance
 * - weight optimization
 * - winner/loser pattern detection
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const MEMORY_FILE = path.join(DATA_DIR, "scan-history.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readMemory() {
  ensureDataDir();

  if (!fs.existsSync(MEMORY_FILE)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(MEMORY_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeMemory(records = []) {
  ensureDataDir();
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(records, null, 2));
}

function tokenId(project = {}) {
  return (
    project.address ||
    project.pairAddress ||
    `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  );
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

    priceUsd: Number(project.priceUsd || 0),
    liquidityUsd: Number(project.liquidityUsd || 0),
    volume24h: Number(project.volume24h || 0),
    marketCap: Number(project.marketCap || 0),

    scores: {
      marketRank: Number(project.marketRankScore || 0),
      pipeline: Number(project.pipelineScore || 0),
      richToken: Number(project.richTokenScore || 0),
      momentumShift: Number(project.momentumShiftScore || 0),
      infrastructureNarrative: Number(project.infrastructureNarrativeScore || 0),
      narrative: Number(project.narrativeScore || 0),
      liquidity: Number(project.liquidityScore || 0),
      liquidityExpansion: Number(project.liquidityExpansionScore || 0),
      relativeStrength: Number(project.relativeStrengthScore || 0),
      buyPressure: Number(project.buyPressureScore || 0),
      earlyBreakout: Number(project.earlyBreakoutScore || 0),
      risk: Number(project.riskScore || 0)
    },

    labels: {
      marketRankLevel: project.marketRankLevel || null,
      richTokenLevel: project.richTokenLevel || null,
      momentumShiftLevel: project.momentumShiftLevel || null,
      infrastructureNarrativeLevel: project.infrastructureNarrativeLevel || null
    },

    evidence: project.evidence || [],
    alerts: project.alerts || [],

    futureOutcomes: {
      after1h: null,
      after24h: null,
      after7d: null,
      after30d: null
    }
  };
}

export function saveScanMemory(projects = []) {
  const existing = readMemory();

  const newRecords = projects.map(createScanRecord);

  const updated = [...existing, ...newRecords];

  writeMemory(updated);

  return {
    saved: newRecords.length,
    totalRecords: updated.length,
    file: MEMORY_FILE
  };
}

export function loadScanMemory() {
  return readMemory();
}

export function clearScanMemory() {
  writeMemory([]);

  return {
    cleared: true,
    file: MEMORY_FILE
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const memory = loadScanMemory();

  console.log(JSON.stringify({
    file: MEMORY_FILE,
    records: memory.length,
    latest: memory.slice(-5)
  }, null, 2));
}
