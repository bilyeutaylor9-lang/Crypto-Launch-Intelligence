import fs from "fs";
import path from "path";
import { runMissedWinnerReplayLab } from "../learning/missedWinnerReplayLab.js";

export function writeMissedWinnerReplayReport(projects = [], extra = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const replay = runMissedWinnerReplayLab(projects.filter((project) => project.observations?.length || project.firstSeenAt).slice(0, 250), extra);
  const counts = replay.reduce((acc, item) => {
    for (const point of item.replay || []) {
      acc[point.failureClass] = (acc[point.failureClass] || 0) + 1;
    }
    return acc;
  }, {});
  const report = {
    generatedAt: new Date().toISOString(),
    scanRunId: extra.scanRunId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: extra.codeCommitSha || process.env.GITHUB_SHA || null,
    dataCutoffTimestamp: extra.dataCutoffTimestamp || new Date().toISOString(),
    projectsAnalyzed: projects.length,
    status: replay.length ? "PASS" : "NO_REPLAY_SAMPLE",
    warnings: [],
    limitations: ["Replay does not use future data for historical features; future data is used only for outcome labels."],
    sampleSize: replay.length,
    failureClassCounts: counts,
    earlyRecallSuccesses: replay.filter((item) => item.earlyRecallSuccess).length,
    replay,
  };
  const filePath = path.join(reportsDir, "missed-winner-replay.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return { filePath, report };
}
