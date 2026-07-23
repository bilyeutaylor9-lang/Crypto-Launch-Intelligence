import fs from "fs";
import path from "path";

import { buildPipelineStageHealth } from "../kernel/pipelineReliabilityKernel.js";

export function writePipelineStageHealthReport(projects = [], options = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = options.precomputedReport || options.pipelineStageHealth || buildPipelineStageHealth(projects, options);
  const filePath = path.join(reportsDir, "pipeline-stage-health.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return { filePath, report };
}
