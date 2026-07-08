import cron from "node-cron";
import { runWatchtowerOnce } from "./watchtower.js";

const schedule = process.env.WATCHTOWER_CRON || "*/30 * * * *";

let running = false;

async function runCycle() {
  if (running) {
    console.log("Watchtower cycle skipped: previous cycle still running.");
    return;
  }

  running = true;
  const startedAt = new Date().toISOString();
  console.log(`Watchtower cycle started: ${startedAt}`);

  try {
    const result = await runWatchtowerOnce();
    console.log(
      JSON.stringify(
        {
          completedAt: new Date().toISOString(),
          scannedProjects: result.scannedProjects,
          alerts: result.reports.alertCount,
          highAlerts: result.reports.highAlertCount,
          criticalAlerts: result.reports.criticalAlertCount,
          brief: result.reports.dailyBrief,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error("Watchtower cycle failed");
    console.error(error);
  } finally {
    running = false;
  }
}

console.log(`Watchtower daemon scheduled: ${schedule}`);
cron.schedule(schedule, runCycle);

if (process.env.WATCHTOWER_RUN_IMMEDIATELY !== "false") {
  runCycle();
}
