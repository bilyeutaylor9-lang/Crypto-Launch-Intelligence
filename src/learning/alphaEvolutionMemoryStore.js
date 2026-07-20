import fs from "fs";
import path from "path";
import { appendMemorySidecar, shouldUseAppendOnlyMemory } from "./boundedMemoryStore.js";

const DATA_DIR = path.resolve("data");
const MEMORY_FILE = path.join(DATA_DIR, "alpha-evolution-governor-memory.json");
const MAX_RUNS = Number(process.env.MAX_ALPHA_EVOLUTION_RUNS || 250);

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readMemory() {
  ensureDataDir();

  if (!fs.existsSync(MEMORY_FILE)) {
    return { runs: [], projects: {} };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
    return {
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      projects: parsed.projects && typeof parsed.projects === "object" ? parsed.projects : {},
    };
  } catch {
    return { runs: [], projects: {} };
  }
}

function writeMemory(memory = { runs: [], projects: {} }) {
  ensureDataDir();
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

function projectKey(project = {}) {
  return String(
    project.address ||
      project.tokenAddress ||
      project.pairAddress ||
      project.proofCarryingAlphaContract?.projectKey ||
      project.selfEvolvingAlphaOS?.identityGraph?.id ||
      project.githubIntelligencePro?.repository ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  ).toLowerCase();
}

export function loadAlphaEvolutionMemory() {
  return readMemory();
}

export function saveAlphaEvolutionMemory(projects = []) {
  const generatedAt = new Date().toISOString();
  const safeProjects = Array.isArray(projects) ? projects : [];
  const governed = safeProjects.filter((project) => project.alphaEvolutionGovernor);
  const topProjects = [...governed]
    .sort((a, b) => Number(b.alphaEvolutionGovernorScore || 0) - Number(a.alphaEvolutionGovernorScore || 0))
    .slice(0, 25);

  const run = {
    generatedAt,
    totalProjects: safeProjects.length,
    governedProjects: governed.length,
    promote: governed.filter((project) => project.alphaEvolutionGovernorVerdict === "Governor Promote").length,
    priorityResearch: governed.filter((project) => project.alphaEvolutionGovernorVerdict === "Governor Priority Research").length,
    recheckSoon: governed.filter((project) => project.alphaEvolutionGovernorVerdict === "Governor Recheck Soon").length,
    evidenceGaps: governed.filter((project) => project.alphaEvolutionGovernorVerdict === "Governor Evidence Gap").length,
    riskBlocks: governed.filter((project) => project.alphaEvolutionGovernorVerdict === "Governor Risk Block").length,
    topProjects: topProjects.map((project, index) => ({
      rank: index + 1,
      symbol: project.symbol || "UNKNOWN",
      name: project.name || "Unknown",
      score: project.alphaEvolutionGovernorScore || 0,
      verdict: project.alphaEvolutionGovernorVerdict || "Unknown",
    })),
  };

  if (shouldUseAppendOnlyMemory(MEMORY_FILE)) {
    const projectSnapshots = governed.map((project) => ({
      generatedAt,
      key: projectKey(project),
      name: project.name || "Unknown",
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || "unknown",
      score: project.alphaEvolutionGovernorScore || 0,
      verdict: project.alphaEvolutionGovernorVerdict || "Unknown",
      action: project.alphaEvolutionGovernor?.actionPlan?.primaryAction || "Review",
      contractVerdict: project.proofCarryingAlphaContractVerdict || "Unknown",
      outcomeVerdict: project.outcomeJudgeVerdict || "Unknown",
      riskScore: project.alphaEvolutionGovernor?.moduleScores?.riskFirewall || 0,
    }));
    const sidecar = appendMemorySidecar(MEMORY_FILE, [{ run }, ...projectSnapshots], {
      recordType: "alpha-evolution",
    });
    return {
      file: sidecar.file,
      savedProjects: governed.length,
      runs: null,
      persistenceMode: sidecar.mode,
      legacyFilePreserved: sidecar.legacyFilePreserved,
      legacyFileBytes: sidecar.legacyFileBytes,
    };
  }

  const memory = readMemory();

  for (const project of governed) {
    const key = projectKey(project);
    const previous = memory.projects[key] || { scans: 0, history: [] };
    const snapshot = {
      at: generatedAt,
      name: project.name || "Unknown",
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || "unknown",
      score: project.alphaEvolutionGovernorScore || 0,
      verdict: project.alphaEvolutionGovernorVerdict || "Unknown",
      action: project.alphaEvolutionGovernor?.actionPlan?.primaryAction || "Review",
      contractVerdict: project.proofCarryingAlphaContractVerdict || "Unknown",
      outcomeVerdict: project.outcomeJudgeVerdict || "Unknown",
      riskScore: project.alphaEvolutionGovernor?.moduleScores?.riskFirewall || 0,
    };

    memory.projects[key] = {
      ...previous,
      key,
      scans: Number(previous.scans || 0) + 1,
      latest: snapshot,
      history: [...(previous.history || []), snapshot].slice(-25),
    };
  }

  memory.runs = [...(memory.runs || []), run].slice(-MAX_RUNS);
  writeMemory(memory);

  return {
    file: MEMORY_FILE,
    savedProjects: governed.length,
    runs: memory.runs.length,
  };
}

export function summarizeAlphaEvolutionMemory(memory = readMemory()) {
  const runs = Array.isArray(memory.runs) ? memory.runs : [];
  const projects = memory.projects && typeof memory.projects === "object" ? memory.projects : {};
  const latestRun = runs.at(-1) || null;
  const trackedProjects = Object.values(projects);
  const repeatPriority = trackedProjects
    .filter((project) => Number(project.scans || 0) >= 2)
    .sort((a, b) => Number(b.latest?.score || 0) - Number(a.latest?.score || 0))
    .slice(0, 20)
    .map((project) => ({
      key: project.key,
      symbol: project.latest?.symbol || "UNKNOWN",
      name: project.latest?.name || "Unknown",
      scans: project.scans || 0,
      latestScore: project.latest?.score || 0,
      latestVerdict: project.latest?.verdict || "Unknown",
      action: project.latest?.action || "Review",
    }));

  return {
    file: MEMORY_FILE,
    runs: runs.length,
    trackedProjects: trackedProjects.length,
    latestRun,
    repeatPriority,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizeAlphaEvolutionMemory(), null, 2));
}
