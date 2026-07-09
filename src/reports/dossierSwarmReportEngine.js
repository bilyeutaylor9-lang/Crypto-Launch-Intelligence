import fs from "fs";
import path from "path";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function compact(project = {}) {
  return {
    rank: project.pipelineRank || 0,
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "Unknown",
    pipelineScore: project.pipelineScore || 0,
    simulationBrainScore: project.simulationBrainScore || 0,
    outcomeJudgeScore: project.outcomeJudgeScore || 0,
    dossierSwarmScore: project.dossierSwarmScore || 0,
    dossierSwarmDecision: project.dossierSwarmDecision || "Unknown",
    dossierSwarmConsensus: project.dossierSwarmConsensus || "",
    aiEcosystemVerdict: project.aiEcosystemVerdict || "Unknown",
    simulationDecision: project.simulationDecision || "Unknown",
    outcomeJudgeVerdict: project.outcomeJudgeVerdict || "Unknown",
    dossier: project.projectDossierSwarm || null,
  };
}

export function writeDossierSwarmReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const dossiered = projects.filter((project) => project.projectDossierSwarm);
  const sorted = [...dossiered].sort((a, b) => num(b.dossierSwarmScore) - num(a.dossierSwarmScore));
  const report = {
    generatedAt: new Date().toISOString(),
    totalProjects: projects.length,
    dossieredProjects: dossiered.length,
    counts: {
      dossierPriority: dossiered.filter((project) => project.dossierSwarmDecision === "Dossier Priority").length,
      researchPriority: dossiered.filter((project) => project.dossierSwarmDecision === "Research Priority").length,
      watchlistDossier: dossiered.filter((project) => project.dossierSwarmDecision === "Watchlist Dossier").length,
      doNotPromote: dossiered.filter((project) => project.dossierSwarmDecision === "Do Not Promote").length,
    },
    priorityDossiers: sorted
      .filter((project) => ["Dossier Priority", "Research Priority"].includes(project.dossierSwarmDecision))
      .slice(0, 25)
      .map(compact),
    allDossiers: sorted.slice(0, 75).map(compact),
    blockedDossiers: sorted
      .filter((project) => project.dossierSwarmDecision === "Do Not Promote")
      .slice(0, 25)
      .map(compact),
    agentLeaderboard: buildAgentLeaderboard(dossiered),
  };
  const filePath = path.join(reportsDir, "dossier-swarm.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}

function buildAgentLeaderboard(projects = []) {
  const byAgent = new Map();

  for (const project of projects) {
    for (const agent of project.projectDossierSwarm?.agents || []) {
      if (!byAgent.has(agent.name)) {
        byAgent.set(agent.name, {
          agent: agent.name,
          samples: 0,
          averageScore: 0,
          approve: 0,
          watch: 0,
          reject: 0,
          challenge: 0,
          block: 0,
          totalScore: 0,
        });
      }

      const record = byAgent.get(agent.name);
      record.samples += 1;
      record.totalScore += num(agent.score);
      const voteKey = String(agent.vote || "").toLowerCase();
      if (record[voteKey] !== undefined) record[voteKey] += 1;
    }
  }

  return [...byAgent.values()]
    .map((record) => ({
      ...record,
      averageScore: record.samples ? Math.round(record.totalScore / record.samples) : 0,
      totalScore: undefined,
    }))
    .sort((a, b) => b.averageScore - a.averageScore);
}
