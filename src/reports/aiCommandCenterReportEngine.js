import fs from "fs";
import path from "path";
import { buildAIPortfolioWarRoom } from "../engines/aiPortfolioWarRoomEngine.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function compact(project = {}) {
  return {
    rank: project.pipelineRank || 0,
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || "unknown",
    pipelineScore: project.pipelineScore || 0,
    confidenceAdjustedScore: project.confidenceAdjustedScore || 0,
    aiVerdict: project.aiEcosystemVerdict || "Unknown",
    commanderScore: project.researchCommanderScore || 0,
    commanderVerdict: project.researchCommanderVerdict || "Unknown",
    missingEvidence: project.missingEvidence || [],
    assignments: project.researchAssignments || [],
    alphaInvestigatorScore: project.alphaInvestigatorScore || 0,
    alphaInvestigatorVerdict: project.alphaInvestigatorVerdict || "Unknown",
    alphaCaseFile: project.alphaCaseFile || {},
    warRoomScore: project.aiPortfolioWarRoomScore || 0,
    warRoomAllocation: project.aiWarRoomAllocation || "Unknown",
    warRoomRole: project.aiWarRoomRole || "Unknown",
    narratives: project.aiWarRoomNarratives || [],
  };
}

export function writeAICommandCenterReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const safeProjects = Array.isArray(projects) ? projects : [];
  const { battlePlan } = buildAIPortfolioWarRoom(safeProjects);
  const commander = safeProjects
    .filter((project) => project.aiResearchCommander)
    .sort((a, b) => num(b.researchCommanderScore) - num(a.researchCommanderScore))
    .slice(0, 75)
    .map(compact);
  const alpha = safeProjects
    .filter((project) => project.autonomousAlphaInvestigator)
    .sort((a, b) => num(b.alphaInvestigatorScore) - num(a.alphaInvestigatorScore))
    .slice(0, 75)
    .map(compact);
  const report = {
    generatedAt: new Date().toISOString(),
    totalProjects: safeProjects.length,
    counts: {
      promoteToAlpha: safeProjects.filter((project) => project.researchCommanderVerdict === "Promote To Alpha Investigation").length,
      investigateNow: safeProjects.filter((project) => project.researchCommanderVerdict === "Investigate Now").length,
      alphaCases: safeProjects.filter((project) => project.alphaInvestigatorVerdict === "Alpha Case").length,
      priorityInvestigations: safeProjects.filter((project) => project.alphaInvestigatorVerdict === "Priority Investigation").length,
      coreWatch: safeProjects.filter((project) => project.aiWarRoomAllocation === "Core Watch").length,
      priorityResearch: safeProjects.filter((project) => project.aiWarRoomAllocation === "Priority Research").length,
      avoid: safeProjects.filter((project) => project.aiWarRoomAllocation === "Avoid").length,
    },
    commanderBrief: battlePlan.commanderBrief,
    researchCommander: commander,
    alphaInvestigator: alpha,
    portfolioWarRoom: battlePlan,
  };

  const commandCenterPath = path.join(reportsDir, "ai-command-center.json");
  const commanderPath = path.join(reportsDir, "ai-research-commander.json");
  const alphaPath = path.join(reportsDir, "alpha-investigator.json");
  const warRoomPath = path.join(reportsDir, "portfolio-war-room.json");

  fs.writeFileSync(commandCenterPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(
    commanderPath,
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        totalProjects: report.totalProjects,
        counts: {
          promoteToAlpha: report.counts.promoteToAlpha,
          investigateNow: report.counts.investigateNow,
        },
        projects: commander,
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    alphaPath,
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        totalProjects: report.totalProjects,
        counts: {
          alphaCases: report.counts.alphaCases,
          priorityInvestigations: report.counts.priorityInvestigations,
        },
        projects: alpha,
      },
      null,
      2
    )
  );
  fs.writeFileSync(warRoomPath, JSON.stringify(battlePlan, null, 2));

  return {
    commandCenterPath,
    commanderPath,
    alphaPath,
    warRoomPath,
    report,
  };
}
