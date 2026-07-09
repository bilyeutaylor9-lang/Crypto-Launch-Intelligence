import fs from "fs";
import path from "path";
import { summarizeAgentPerformanceMemory } from "../learning/agentPerformanceMemoryStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function compactCouncil(project = {}) {
  return {
    rank: project.pipelineRank || 0,
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    score: project.aiEcosystemScore || 0,
    verdict: project.aiEcosystemVerdict || "Unknown",
    confidence: project.aiEcosystemConfidence || "Unknown",
    caveat: project.aiEcosystemCaveat || "",
    pipelineScore: project.pipelineScore || 0,
    confidenceAdjustedScore: project.confidenceAdjustedScore || 0,
    strongBuyEvidenceGate: project.strongBuyEvidenceGate || {},
    whyNow: project.whyNow || {},
    debate: project.aiDebate || {},
    agents: project.aiEcosystemCouncil?.agents || [],
    conversation: project.aiEcosystemCouncil?.conversation || [],
  };
}

export function writeAICouncilReports(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const councilProjects = [...projects]
    .filter((project) => project.aiEcosystemCouncil)
    .sort((a, b) => num(b.aiEcosystemScore) - num(a.aiEcosystemScore))
    .map(compactCouncil);
  const agentPerformance = summarizeAgentPerformanceMemory();
  const strongBuyCandidates = councilProjects.filter((project) =>
    ["AI Strong Buy", "Best Available Strong Buy Candidate"].includes(project.verdict)
  );
  const report = {
    generatedAt: new Date().toISOString(),
    totalProjects: projects.length,
    strongBuyCandidateCount: strongBuyCandidates.length,
    strongBuyCandidates,
    topCouncilSetups: councilProjects.slice(0, 25),
    agentPerformance,
  };

  const councilPath = path.join(reportsDir, "ai-council.json");
  const performancePath = path.join(reportsDir, "agent-performance.json");

  fs.writeFileSync(councilPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(performancePath, JSON.stringify(agentPerformance, null, 2));

  return {
    councilPath,
    performancePath,
    report,
    agentPerformance,
  };
}
