import fs from "fs";
import path from "path";
import { analyzeWatchtower } from "../engines/watchtowerEngine.js";
import {
  loadWatchtowerAlerts,
  loadWatchtowerBrief,
  watchtowerAlertPublicEligible,
} from "../learning/watchtowerStore.js";

export function writeWatchtowerReports(projects = [], options = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const analysis = analyzeWatchtower(projects, {
    persist: options.persist !== false,
  });
  const alertStore = loadWatchtowerAlerts();
  const briefStore = loadWatchtowerBrief();
  const publicAlertHistory = alertStore.alerts.filter(watchtowerAlertPublicEligible);
  const alertsPath = path.join(reportsDir, "alerts.json");
  const briefPath = path.join(reportsDir, "daily-brief.json");

  fs.writeFileSync(
    alertsPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        latestAlerts: analysis.alerts,
        alertHistory: publicAlertHistory,
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    briefPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        latestBrief: analysis.brief,
        storedBrief: briefStore.brief,
      },
      null,
      2
    )
  );

  return {
    alertsPath,
    briefPath,
    alerts: analysis.alerts,
    brief: analysis.brief,
  };
}
