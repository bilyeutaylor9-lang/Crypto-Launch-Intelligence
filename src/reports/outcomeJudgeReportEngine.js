import fs from "fs";
import path from "path";
import { summarizeOutcomeJudge } from "../engines/autonomousOutcomeJudgeEngine.js";

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
    aiEcosystemScore: project.aiEcosystemScore || 0,
    outcomeJudgeScore: project.outcomeJudgeScore || 0,
    outcomeJudgeStatus: project.outcomeJudgeStatus || "Unknown",
    outcomeJudgeVerdict: project.outcomeJudgeVerdict || "Unknown",
    outcomeRealityAdjustment: project.outcomeRealityAdjustment || 0,
    outcomeAdjustedConfidenceScore: project.outcomeAdjustedConfidenceScore || 0,
    outcomeAdjustedConfidence: project.outcomeAdjustedConfidence || "Unknown",
    outcomeHistoryAgeHours: project.outcomeHistoryAgeHours || 0,
    outcomeGrade: project.outcomeJudgement?.grade || null,
    outcome: project.outcomeJudgement?.outcome || null,
    signalTrust: project.outcomeJudgement?.signalTrust || {},
    summary: project.outcomeJudgement?.summary || "",
  };
}

export function writeOutcomeJudgeReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const summary = summarizeOutcomeJudge(projects);
  const tracked = projects.filter((project) => project.outcomeJudgeStatus === "Tracked");
  const report = {
    ...summary,
    topRealityAdjusted: [...projects]
      .sort((a, b) => num(b.outcomeJudgeScore) - num(a.outcomeJudgeScore))
      .slice(0, 50)
      .map(compact),
    upgrades: tracked
      .filter((project) => num(project.outcomeRealityAdjustment) > 0)
      .sort((a, b) => num(b.outcomeRealityAdjustment) - num(a.outcomeRealityAdjustment))
      .slice(0, 25)
      .map(compact),
    downgrades: tracked
      .filter((project) => num(project.outcomeRealityAdjustment) < 0)
      .sort((a, b) => num(a.outcomeRealityAdjustment) - num(b.outcomeRealityAdjustment))
      .slice(0, 25)
      .map(compact),
    falsePositives: tracked
      .filter((project) => project.outcomeJudgement?.grade?.label === "False Positive")
      .slice(0, 25)
      .map(compact),
    missedWinners: tracked
      .filter((project) => project.outcomeJudgement?.grade?.label === "Missed Winner")
      .slice(0, 25)
      .map(compact),
    coldStartQueue: projects
      .filter((project) => project.outcomeJudgeStatus === "Cold Start")
      .sort((a, b) => num(b.simulationBrainScore) - num(a.simulationBrainScore))
      .slice(0, 50)
      .map(compact),
  };
  const filePath = path.join(reportsDir, "outcome-judge.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}
