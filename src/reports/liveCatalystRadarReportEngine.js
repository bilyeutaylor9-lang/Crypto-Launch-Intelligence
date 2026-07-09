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
    liveCatalystRadarScore: project.liveCatalystRadarScore || 0,
    liveCatalystUrgency: project.liveCatalystUrgency || "Low",
    liveCatalystAction: project.liveCatalystAction || "No immediate action",
    topEvent: project.liveCatalystEvents?.[0] || null,
    events: project.liveCatalystEvents || [],
    dossierSwarmDecision: project.dossierSwarmDecision || "Unknown",
    simulationDecision: project.simulationDecision || "Unknown",
    outcomeJudgeVerdict: project.outcomeJudgeVerdict || "Unknown",
  };
}

export function writeLiveCatalystRadarReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const active = projects.filter((project) => num(project.liveCatalystRadarScore) > 0);
  const sorted = [...active].sort((a, b) => num(b.liveCatalystRadarScore) - num(a.liveCatalystRadarScore));
  const report = {
    generatedAt: new Date().toISOString(),
    totalProjects: projects.length,
    activeCatalystProjects: active.length,
    counts: {
      critical: active.filter((project) => project.liveCatalystUrgency === "Critical").length,
      high: active.filter((project) => project.liveCatalystUrgency === "High").length,
      riskCritical: active.filter((project) => project.liveCatalystUrgency === "Risk-Critical").length,
      medium: active.filter((project) => project.liveCatalystUrgency === "Medium").length,
    },
    urgentFeed: sorted
      .filter((project) => ["Critical", "High", "Risk-Critical"].includes(project.liveCatalystUrgency))
      .slice(0, 50)
      .map(compact),
    allCatalysts: sorted.slice(0, 100).map(compact),
    eventTypeCounts: buildEventTypeCounts(active),
  };
  const filePath = path.join(reportsDir, "catalyst-radar.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}

function buildEventTypeCounts(projects = []) {
  const counts = new Map();

  for (const project of projects) {
    for (const item of project.liveCatalystEvents || []) {
      counts.set(item.type, (counts.get(item.type) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}
