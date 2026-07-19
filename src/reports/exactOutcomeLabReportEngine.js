import fs from "fs";
import path from "path";

import { loadCapitalFlowObservations } from "../data/capitalFlowObservationStore.js";
import { summarizeExactOutcomeLab } from "../learning/exactOutcomeHorizonLab.js";

export function writeExactOutcomeLabReport(projects = [], options = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const predictions = (Array.isArray(projects) ? projects : [])
    .filter((project) => project.capitalFlowObservation?.canonicalProjectId)
    .slice(0, options.limit || 250)
    .map((project) => ({
      predictionId: `${project.capitalFlowObservation.canonicalProjectId}:${project.capitalFlowObservation.observedAt}`,
      canonicalProjectId: project.capitalFlowObservation.canonicalProjectId,
      predictedAt: project.capitalFlowObservation.observedAt,
      entryPriceUsd: project.capitalFlowObservation.priceUsd,
      routeStatus: project.executionStatus || project.canonicalExecutionRouteStatus || "UNKNOWN",
      scoreBreakdown: {
        capitalMigrationScore: project.capitalMigrationScore || 0,
        capitalMigrationLane: project.capitalMigrationLane || "NOT_RUN",
      },
    }));
  const observations = options.observations || loadCapitalFlowObservations({ limit: options.observationLimit || 10000 });
  const report = summarizeExactOutcomeLab(predictions, observations, options);
  const filePath = path.join(reportsDir, "exact-outcome-horizon-lab.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return { filePath, report };
}
