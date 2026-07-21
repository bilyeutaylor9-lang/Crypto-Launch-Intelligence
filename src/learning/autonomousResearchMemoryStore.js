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

const DATA_DIR = path.resolve("data");
const MEMORY_FILE = path.join(DATA_DIR, "autonomous-research-memory.json");
const MAX_RECORDS = Number(process.env.MAX_AUTONOMOUS_RESEARCH_RECORDS || 25000);
const DEFAULT_MAX_LOAD_RECORDS = 5000;
let cachedMemory = null;
let cachedMemoryKey = "";
let cachedHistoryIndex = null;

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(true|1|yes|on)$/i.test(String(value).trim());
}

function maxLoadRecords(options = {}) {
  const configured = Math.floor(num(options.limit || process.env.MAX_AUTONOMOUS_RESEARCH_LOAD_RECORDS));
  return configured > 0 ? configured : DEFAULT_MAX_LOAD_RECORDS;
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function memoryMtimeMs(filePath = MEMORY_FILE) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function emptyMemory() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    records: [],
  };
}

function projectId(project = {}) {
  return String(
    project.address ||
      project.tokenAddress ||
      project.pairAddress ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  ).toLowerCase();
}

function memoryFromRecords(records = []) {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    records: Array.isArray(records) ? records : [],
  };
}

function readMemory(options = {}) {
  ensureDataDir();
  const sidecarPath = memorySidecarPath(MEMORY_FILE);
  const mtimeMs = memoryMtimeMs(MEMORY_FILE);
  const sidecarMtimeMs = memoryMtimeMs(sidecarPath);
  const limit = maxLoadRecords(options);
  const cacheKey = `${mtimeMs}:${sidecarMtimeMs}:${limit}`;
  if (cachedMemory && cachedMemoryKey === cacheKey) return cachedMemory;

  if (!mtimeMs && !sidecarMtimeMs) {
    cachedMemory = emptyMemory();
    cachedMemoryKey = cacheKey;
    cachedHistoryIndex = null;
    return cachedMemory;
  }

  const sidecarRecords = sidecarMtimeMs
    ? readMemorySidecarTail(MEMORY_FILE, {
        limit,
        maxBytes: Number(process.env.AUTONOMOUS_RESEARCH_SIDECAR_READ_BYTES || 16 * 1024 * 1024),
      })
    : [];
  const largeLegacyJson = memoryFileSizeBytes(MEMORY_FILE) > memoryRewriteLimitBytes(process.env);
  const preferSidecar = sidecarRecords.length && boolEnv(process.env.AUTONOMOUS_RESEARCH_PREFER_SIDECAR, true);
  const allowLargeLegacyRead = boolEnv(process.env.AUTONOMOUS_RESEARCH_ALLOW_LARGE_JSON_READ, false);

  if (preferSidecar || (largeLegacyJson && !allowLargeLegacyRead)) {
    cachedMemory = memoryFromRecords(sidecarRecords);
    cachedMemoryKey = cacheKey;
    cachedHistoryIndex = null;
    return cachedMemory;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
    const legacyRecords = Array.isArray(parsed.records) ? parsed.records.slice(-limit) : [];
    cachedMemory = {
      version: parsed.version || 1,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      records: sidecarRecords.length
        ? [...legacyRecords, ...sidecarRecords].slice(-limit)
        : legacyRecords,
    };
    cachedMemoryKey = cacheKey;
    cachedHistoryIndex = null;
    return cachedMemory;
  } catch {
    cachedMemory = memoryFromRecords(sidecarRecords);
    cachedMemoryKey = cacheKey;
    cachedHistoryIndex = null;
    return cachedMemory;
  }
}

function writeMemory(memory = {}) {
  ensureDataDir();
  const normalized = {
    version: 1,
    updatedAt: new Date().toISOString(),
    records: (memory.records || []).slice(-MAX_RECORDS),
  };
  fs.writeFileSync(
    MEMORY_FILE,
    JSON.stringify(normalized, null, 2)
  );
  cachedMemory = normalized;
  cachedMemoryKey = "";
  cachedHistoryIndex = null;
}

function historyIndex() {
  const memory = readMemory();
  if (cachedHistoryIndex) return cachedHistoryIndex;

  cachedHistoryIndex = new Map();
  for (const record of memory.records) {
    const id = String(record.id || "").toLowerCase();
    if (!id) continue;
    const history = cachedHistoryIndex.get(id) || [];
    history.push(record);
    cachedHistoryIndex.set(id, history);
  }

  return cachedHistoryIndex;
}

function compactRun(project = {}) {
  const research = project.autonomousResearchOrchestrator || {};
  const graph = project.evidenceGraph || research.evidenceGraph || {};

  return {
    id: projectId(project),
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    researchedAt: new Date().toISOString(),
    score: num(project.autonomousResearchScore),
    verdict: project.autonomousResearchVerdict || "Unknown",
    confidence: num(project.autonomousResearchConfidence),
    confidenceLevel: project.autonomousResearchConfidenceLevel || "Unknown",
    roundsCompleted: num(research.roundsCompleted),
    searchesPerformed: research.searchesPerformed || [],
    stoppingReasons: research.stoppingReasons || [],
    unansweredQuestions: research.unansweredQuestions || [],
    contradictions: research.contradictions || [],
    risks: research.risks || [],
    scores: project.autonomousResearchScores || {},
    evidenceGraph: {
      nodeCount: (graph.nodes || []).length,
      edgeCount: (graph.edges || []).length,
      claimCount: (graph.claims || []).length,
      sourceCount: (graph.sources || []).length,
    },
    topClaims: (graph.claims || []).slice(0, 10),
    topEvidence: (research.evidence || []).slice(0, 12),
  };
}

export function loadAutonomousResearchMemory() {
  return readMemory();
}

export function saveAutonomousResearchMemory(projects = []) {
  const records = (Array.isArray(projects) ? projects : [])
    .filter((project) => project.autonomousResearchOrchestrator)
    .map(compactRun);

  if (shouldUseAppendOnlyMemory(MEMORY_FILE)) {
    const sidecar = appendMemorySidecar(MEMORY_FILE, records, { recordType: "autonomous-research" });
    return {
      file: sidecar.file,
      saved: records.length,
      totalRecords: null,
      persistenceMode: sidecar.mode,
      legacyFilePreserved: sidecar.legacyFilePreserved,
      legacyFileBytes: sidecar.legacyFileBytes,
    };
  }

  const memory = readMemory();
  const updated = {
    ...memory,
    records: [...memory.records, ...records].slice(-MAX_RECORDS),
  };

  writeMemory(updated);

  return {
    file: MEMORY_FILE,
    saved: records.length,
    totalRecords: updated.records.length,
  };
}

export function getProjectAutonomousResearchHistory(project = {}, limit = 25) {
  const id = typeof project === "string" ? String(project).toLowerCase() : projectId(project);

  return (historyIndex().get(id) || []).slice(-Number(limit || 25));
}

export function summarizeAutonomousResearchMemory() {
  const records = readMemory().records;
  const verified = records.filter((record) => record.verdict === "Research-Verified Priority");
  const blocked = records.filter((record) => record.verdict === "Blocked By Research Risk");
  const averageConfidence = records.length
    ? Math.round(records.reduce((sum, record) => sum + num(record.confidence), 0) / records.length)
    : 0;

  return {
    file: MEMORY_FILE,
    records: records.length,
    verifiedPriority: verified.length,
    blockedByRisk: blocked.length,
    averageConfidence,
    latest: records.at(-1) || null,
    latestProjects: records.slice(-10).map((record) => ({
      name: record.name,
      symbol: record.symbol,
      verdict: record.verdict,
      score: record.score,
      confidence: record.confidence,
    })),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizeAutonomousResearchMemory(), null, 2));
}
