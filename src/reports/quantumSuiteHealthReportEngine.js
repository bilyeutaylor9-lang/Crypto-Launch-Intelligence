import fs from "fs";
import path from "path";
import { summarizeQuantumSuiteHealth } from "../engines/quantumSuiteHealthEngine.js";

function ensureReportsDir() {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  return reportsDir;
}

function reasoningRow(project = {}, index = 0) {
  return {
    rank: index + 1,
    symbol: project.symbol || "UNKNOWN",
    name: project.name || "Unknown",
    chain: project.chain || "unknown",
    score: project.quantumBrainScore || 0,
    decisionState: project.quantumReasoningBrain?.decisionState || "Unknown",
    probabilities: project.quantumReasoningBrain?.probabilities || {
      bull: 0,
      base: 0,
      bear: 0,
      blackSwan: 0,
    },
    entropyScore: project.quantumReasoningBrain?.entropyScore || 0,
    entropy: project.quantumReasoningBrain?.entropy || "Unknown",
    entangledSignals: project.entangledSignals || [],
    collapseTriggers: project.collapseTriggers || [],
  };
}

export function writeQuantumSuiteHealthReport(projects = []) {
  const reportsDir = ensureReportsDir();
  const health = summarizeQuantumSuiteHealth(projects);
  const healthPath = path.join(reportsDir, "quantum-suite-health.json");
  const reasoningPath = path.join(reportsDir, "quantum-reasoning-brain.json");
  const reasoningProjects = [...(Array.isArray(projects) ? projects : [])]
    .filter((project) => project.quantumReasoningBrain)
    .sort((a, b) => (b.quantumBrainScore || 0) - (a.quantumBrainScore || 0));
  const reasoningReport = {
    generatedAt: new Date().toISOString(),
    name: "Quantum Reasoning Brain",
    disclaimer: "Research scenario reasoning only. Not financial advice, not a prediction, and not a buy recommendation.",
    totalProjects: Array.isArray(projects) ? projects.length : 0,
    reasoningBrainsCompleted: reasoningProjects.length,
    healthStatus: health.status,
    topQuantumReasoningStates: reasoningProjects.slice(0, 100).map(reasoningRow),
  };

  fs.writeFileSync(healthPath, JSON.stringify(health, null, 2));
  fs.writeFileSync(reasoningPath, JSON.stringify(reasoningReport, null, 2));

  return {
    filePath: healthPath,
    healthPath,
    reasoningPath,
    report: health,
    reasoningReport,
  };
}
