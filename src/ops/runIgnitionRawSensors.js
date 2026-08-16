import fs from "fs";
import path from "path";

import { analyzeIgnitionRawSensorsBatch } from "../sensors/ignitionRawSensorOrchestrator.js";

function extractProjects(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["projects", "opportunities", "candidates", "results", "tokens", "data"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

const input = process.argv[2] || process.env.IGNITION_SENSOR_INPUT || path.resolve("reports", "report.json");
if (!fs.existsSync(input)) {
  console.error(`Ignition raw sensors: input file not found: ${input}`);
  process.exitCode = 1;
} else {
  const payload = JSON.parse(fs.readFileSync(input, "utf8"));
  const projects = extractProjects(payload);
  if (!projects.length) {
    console.error(`Ignition raw sensors: no candidate array found in ${input}.`);
    process.exitCode = 1;
  } else {
    const enriched = await analyzeIgnitionRawSensorsBatch(projects, {
      enabled: true,
      maxProjects: Number(process.env.IGNITION_RAW_SENSOR_MAX_PROJECTS || 8),
      concurrency: Number(process.env.IGNITION_RAW_SENSOR_CONCURRENCY || 2),
      persist: true,
      writeReport: true,
    });
    const observed = enriched.filter((project) => !["BUDGET_DEFERRED", "DISABLED"].includes(project.ignitionRawSensorStatus));
    console.log(JSON.stringify({
      input,
      candidates: projects.length,
      observed: observed.length,
      fullCoverage: observed.filter((project) => project.ignitionRawSensorCoveragePct === 100).length,
      partialCoverage: observed.filter((project) => project.ignitionRawSensorCoveragePct > 0 && project.ignitionRawSensorCoveragePct < 100).length,
      report: path.resolve("reports", "ignition-raw-sensors.json"),
    }, null, 2));
  }
}

export { extractProjects };
