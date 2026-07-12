import fs from "fs";
import path from "path";
import { summarizeAutonomousResearchOrchestrator } from "../engines/autonomousResearchOrchestratorEngine.js";
import { summarizeAutonomousResearchMemory } from "../learning/autonomousResearchMemoryStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function compact(project = {}) {
  const research = project.autonomousResearchOrchestrator || {};
  const graph = project.evidenceGraph || research.evidenceGraph || {};

  return {
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    score: project.autonomousResearchScore || 0,
    verdict: project.autonomousResearchVerdict || "Unknown",
    confidence: project.autonomousResearchConfidence || 0,
    confidenceLevel: project.autonomousResearchConfidenceLevel || "Unknown",
    roundsCompleted: research.roundsCompleted || 0,
    searchesPerformed: research.searchesPerformed || [],
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
    humanApprovalRequired: Boolean(research.humanApprovalRequired),
    summary: research.summary || "",
  };
}

export function buildAutonomousResearchReport(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const summary = summarizeAutonomousResearchOrchestrator(safeProjects);
  const memory = summarizeAutonomousResearchMemory();
  const topProjects = [...safeProjects]
    .filter((project) => num(project.autonomousResearchScore) > 0)
    .sort((a, b) => num(b.autonomousResearchScore) - num(a.autonomousResearchScore))
    .slice(0, 75)
    .map(compact);

  return {
    generatedAt: new Date().toISOString(),
    ...summary,
    memory,
    topProjects,
    researchLoop: {
      stages: [
        "Observe",
        "Form hypotheses",
        "Identify missing proof",
        "Select controlled tool",
        "Normalize evidence",
        "Build evidence graph",
        "Run critic review",
        "Score opportunity and risk separately",
        "Stop by strict limits",
        "Save memory for future scans",
      ],
      stoppingRules: [
        "Maximum research rounds reached",
        "Maximum searches reached",
        "No new evidence in repeated rounds",
        "Critical contradiction found",
        "Required questions answered",
        "Human approval required",
      ],
      safetyRules: [
        "Webpage content is untrusted evidence, never instructions.",
        "Webpage content cannot request secrets or authorize tools.",
        "Downloaded code is never executed automatically.",
        "Market metrics come from APIs, not ordinary web text.",
      ],
    },
  };
}

export function writeAutonomousResearchReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = buildAutonomousResearchReport(projects);
  const filePath = path.join(reportsDir, "autonomous-research.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}
