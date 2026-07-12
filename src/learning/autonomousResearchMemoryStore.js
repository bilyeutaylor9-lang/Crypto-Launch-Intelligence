import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const MEMORY_FILE = path.join(DATA_DIR, "autonomous-research-memory.json");
const MAX_RECORDS = Number(process.env.MAX_AUTONOMOUS_RESEARCH_RECORDS || 25000);

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function projectId(project = {}) {
  return String(
    project.address ||
      project.tokenAddress ||
      project.pairAddress ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  ).toLowerCase();
}

function readMemory() {
  ensureDataDir();

  if (!fs.existsSync(MEMORY_FILE)) {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      records: [],
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
    return {
      version: parsed.version || 1,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      records: Array.isArray(parsed.records) ? parsed.records : [],
    };
  } catch {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      records: [],
    };
  }
}

function writeMemory(memory = {}) {
  ensureDataDir();
  fs.writeFileSync(
    MEMORY_FILE,
    JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        records: (memory.records || []).slice(-MAX_RECORDS),
      },
      null,
      2
    )
  );
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
  const memory = readMemory();
  const records = (Array.isArray(projects) ? projects : [])
    .filter((project) => project.autonomousResearchOrchestrator)
    .map(compactRun);
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

  return readMemory()
    .records.filter((record) => record.id === id)
    .slice(-Number(limit || 25));
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
