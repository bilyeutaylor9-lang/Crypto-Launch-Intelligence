import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const MEMORY_FILE = path.join(DATA_DIR, "agent-performance-memory.json");
const MAX_RECORDS = Number(process.env.MAX_AGENT_PERFORMANCE_RECORDS || 25000);

const DEFAULT_AGENTS = [
  "Narrative Scout",
  "Quant Forecaster",
  "Flow Analyst",
  "Research Analyst",
  "Learning Engine",
  "Risk Officer",
  "Roadmap Profit Agent",
  "Roadmap Agent",
  "GitHub Agent",
  "Tokenomics Agent",
  "Catalyst Agent",
  "Liquidity Agent",
  "Narrative Agent",
  "Profitability Agent",
  "Research Agent",
  "Commander",
];

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readMemory() {
  ensureDataDir();

  if (!fs.existsSync(MEMORY_FILE)) {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      records: [],
      outcomes: [],
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
    return {
      version: parsed.version || 1,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      records: Array.isArray(parsed.records) ? parsed.records : [],
      outcomes: Array.isArray(parsed.outcomes) ? parsed.outcomes : [],
    };
  } catch {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      records: [],
      outcomes: [],
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
        outcomes: (memory.outcomes || []).slice(-MAX_RECORDS),
      },
      null,
      2
    )
  );
}

function projectId(project = {}) {
  return String(
    project.address ||
      project.pairAddress ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  ).toLowerCase();
}

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function emptyAgentStats() {
  return Object.fromEntries(
    DEFAULT_AGENTS.map((name) => [
      name,
      {
        name,
        observations: 0,
        bullish: 0,
        cautious: 0,
        averageScore: 50,
        reliability: 50,
        weight: 1,
      },
    ])
  );
}

export function loadAgentPerformanceMemory() {
  return readMemory();
}

export function summarizeAgentPerformanceMemory() {
  const memory = readMemory();
  const stats = emptyAgentStats();

  for (const record of memory.records) {
    for (const agent of record.agents || []) {
      const current = stats[agent.name] || {
        name: agent.name,
        observations: 0,
        bullish: 0,
        cautious: 0,
        averageScore: 50,
        reliability: 50,
        weight: 1,
      };

      const observations = current.observations + 1;
      const averageScore =
        (current.averageScore * current.observations + num(agent.score)) / observations;
      const bullish = current.bullish + (["bullish", "cleared"].includes(agent.stance) ? 1 : 0);
      const cautious = current.cautious + (["cautious", "blocked"].includes(agent.stance) ? 1 : 0);

      stats[agent.name] = {
        ...current,
        observations,
        bullish,
        cautious,
        averageScore: Math.round(averageScore),
      };
    }
  }

  for (const outcome of memory.outcomes) {
    for (const vote of outcome.agentVotes || []) {
      const current = stats[vote.name] || {
        name: vote.name,
        observations: 0,
        bullish: 0,
        cautious: 0,
        averageScore: 50,
        reliability: 50,
        weight: 1,
      };
      const correct =
        (outcome.result === "winner" && ["bullish", "cleared"].includes(vote.stance)) ||
        (outcome.result === "trap" && ["cautious", "blocked"].includes(vote.stance));
      const priorTotal = current.outcomeSamples || 0;
      const priorCorrect = current.correctOutcomes || 0;
      const outcomeSamples = priorTotal + 1;
      const correctOutcomes = priorCorrect + (correct ? 1 : 0);

      stats[vote.name] = {
        ...current,
        outcomeSamples,
        correctOutcomes,
      };
    }
  }

  const agents = Object.values(stats).map((agent) => {
    const reliability = agent.outcomeSamples
      ? Math.round((agent.correctOutcomes / agent.outcomeSamples) * 100)
      : Math.round(45 + Math.min(20, agent.observations / 25) + Math.max(0, agent.averageScore - 50) * 0.15);
    const weight = Number((0.75 + Math.max(0, Math.min(100, reliability)) / 100 * 0.7).toFixed(2));

    return {
      ...agent,
      reliability,
      weight,
    };
  });

  return {
    file: MEMORY_FILE,
    records: memory.records.length,
    outcomes: memory.outcomes.length,
    agents,
    weights: Object.fromEntries(agents.map((agent) => [agent.name, agent.weight])),
  };
}

export function saveAgentCouncilMemory(projects = []) {
  const memory = readMemory();
  const records = (Array.isArray(projects) ? projects : [])
    .filter((project) => project.aiEcosystemCouncil)
    .map((project) => {
      const commanderAgents = (project.researchAssignments || []).map((assignment) => ({
        name: assignment.agent || "Commander",
        score:
          assignment.priority === "Critical"
            ? 25
            : assignment.priority === "High"
            ? 55
            : assignment.priority === "Medium"
            ? 65
            : 75,
        stance: ["Critical", "High"].includes(assignment.priority) ? "cautious" : "watching",
      }));

      return {
        id: projectId(project),
        name: project.name || "Unknown",
        symbol: project.symbol || "UNKNOWN",
        chain: project.chain || "unknown",
        scannedAt: new Date().toISOString(),
        verdict: project.aiEcosystemVerdict || "Unknown",
        alphaInvestigatorVerdict: project.alphaInvestigatorVerdict || "Unknown",
        researchCommanderVerdict: project.researchCommanderVerdict || "Unknown",
        score: project.aiEcosystemScore || 0,
        alphaInvestigatorScore: project.alphaInvestigatorScore || 0,
        researchCommanderScore: project.researchCommanderScore || 0,
        confidenceAdjustedScore: project.confidenceAdjustedScore || 0,
        pipelineScore: project.pipelineScore || 0,
        trapRiskScore: project.trapRiskScore || 0,
        agents: [
          ...(project.aiEcosystemCouncil?.agents || []),
          ...(project.alphaInvestigatorAgents || []),
          ...commanderAgents,
        ],
        evidenceGate: project.strongBuyEvidenceGate || {},
      };
    });

  const updated = {
    ...memory,
    records: [...memory.records, ...records].slice(-MAX_RECORDS),
  };

  writeMemory(updated);

  return {
    saved: records.length,
    totalRecords: updated.records.length,
    file: MEMORY_FILE,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizeAgentPerformanceMemory(), null, 2));
}
