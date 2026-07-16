import fs from "fs";
import path from "path";

const DEFAULT_MEMORY_FILE = path.resolve("data/local-ai-research-memory.json");
const MAX_RECORDS = 25_000;

function now() {
  return new Date().toISOString();
}

function memoryFile(options = {}) {
  return path.resolve(options.filePath || DEFAULT_MEMORY_FILE);
}

function emptyMemory() {
  return { version: 1, updatedAt: now(), runs: [], outcomes: [] };
}

function readMemory(filePath) {
  if (!fs.existsSync(filePath)) return emptyMemory();
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      version: parsed.version || 1,
      updatedAt: parsed.updatedAt || now(),
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      outcomes: Array.isArray(parsed.outcomes) ? parsed.outcomes : [],
    };
  } catch {
    return emptyMemory();
  }
}

function writeMemory(memory, filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const normalized = {
    version: 1,
    updatedAt: now(),
    runs: (memory.runs || []).slice(-MAX_RECORDS),
    outcomes: (memory.outcomes || []).slice(-MAX_RECORDS),
  };
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2));
  fs.renameSync(tempPath, filePath);
  return normalized;
}

function compactList(value, limit = 8) {
  return (Array.isArray(value) ? value : []).slice(0, limit).map((item) => String(item).slice(0, 240));
}

function compactRun(task = {}, report = {}, model = null) {
  return {
    id: task.id,
    projectKey: task.projectKey,
    scannedAt: task.queuedAt,
    researchedAt: new Date().toISOString(),
    depth: task.depth,
    model,
    status: report.status || "UNAVAILABLE",
    project: report.project || task.project || {},
    evidenceCoverage: report.evidence?.evidenceCoverage?.score ?? null,
    judge: {
      verdict: report.judge?.verdict || "EVIDENCE_INCOMPLETE",
      confidence: report.judge?.confidence ?? 0,
      keyRisks: compactList(report.judge?.keyRisks),
      missingEvidence: compactList(report.judge?.missingEvidence),
      nextChecks: compactList(report.judge?.nextChecks),
    },
    agents: (report.agents?.findings || []).map((finding) => ({
      id: finding.agentId,
      name: finding.agent,
      confidence: finding.confidence ?? 0,
      assessment: String(finding.assessment || "").slice(0, 500),
      risks: compactList(finding.risks),
      missingEvidence: compactList(finding.missingEvidence),
    })),
    failedAgents: (report.agents?.failures || []).map((failure) => ({
      id: failure.agentId,
      name: failure.agent,
      error: String(failure.error || "").slice(0, 300),
    })),
    outcomeStatus: "PENDING",
  };
}

export function loadLocalAIResearchMemory(options = {}) {
  const file = memoryFile(options);
  return { ...readMemory(file), file };
}

export function saveLocalAIResearchRun(task = {}, report = {}, options = {}) {
  const file = memoryFile(options);
  const memory = readMemory(file);
  const record = compactRun(task, report, options.model || null);
  const index = memory.runs.findIndex((run) => run.id === record.id);
  if (index >= 0) memory.runs[index] = record;
  else memory.runs.push(record);
  const saved = writeMemory(memory, file);
  return { record, file, totalRuns: saved.runs.length };
}

export function recordLocalAIOutcome(outcome = {}, options = {}) {
  const file = memoryFile(options);
  const memory = readMemory(file);
  const runId = String(outcome.runId || "");
  if (!runId) throw new Error("A local AI outcome requires a runId.");

  const record = {
    runId,
    recordedAt: now(),
    result: String(outcome.result || "unknown"),
    agentVotes: Array.isArray(outcome.agentVotes) ? outcome.agentVotes : [],
    metrics: outcome.metrics || {},
  };
  memory.outcomes = [...memory.outcomes.filter((item) => item.runId !== runId), record];
  const run = memory.runs.find((item) => item.id === runId);
  if (run) run.outcomeStatus = "RECORDED";
  const saved = writeMemory(memory, file);
  return { record, file, totalOutcomes: saved.outcomes.length };
}

function adjustmentCap(samples) {
  if (samples < 20) return 0;
  if (samples < 50) return 0.05;
  if (samples < 200) return 0.15;
  return 0.25;
}

export function summarizeLocalAIPerformance(options = {}) {
  const memory = loadLocalAIResearchMemory(options);
  const agents = new Map();

  for (const run of memory.runs) {
    for (const agent of run.agents || []) {
      const current = agents.get(agent.id) || {
        id: agent.id,
        name: agent.name,
        observations: 0,
        outcomes: 0,
        correctOutcomes: 0,
      };
      current.observations += 1;
      agents.set(agent.id, current);
    }
  }

  for (const outcome of memory.outcomes) {
    for (const vote of outcome.agentVotes || []) {
      const current = agents.get(vote.agentId) || {
        id: vote.agentId,
        name: vote.name || vote.agentId,
        observations: 0,
        outcomes: 0,
        correctOutcomes: 0,
      };
      current.outcomes += 1;
      if (vote.correct === true) current.correctOutcomes += 1;
      agents.set(current.id, current);
    }
  }

  return {
    file: memory.file,
    runs: memory.runs.length,
    outcomes: memory.outcomes.length,
    agents: [...agents.values()].map((agent) => {
      const reliability = agent.outcomes ? Math.round((agent.correctOutcomes / agent.outcomes) * 100) : null;
      const cap = adjustmentCap(agent.outcomes);
      const adjustment = reliability === null ? 0 : Math.max(-cap, Math.min(cap, ((reliability - 50) / 50) * cap));
      return {
        ...agent,
        reliability,
        influenceWeight: Number((1 + adjustment).toFixed(2)),
        influencePolicy: agent.outcomes < 20 ? "DEFAULT_WEIGHT_UNTIL_20_OUTCOMES" : `CAPPED_AT_${Math.round(cap * 100)}_PCT`,
      };
    }),
  };
}
