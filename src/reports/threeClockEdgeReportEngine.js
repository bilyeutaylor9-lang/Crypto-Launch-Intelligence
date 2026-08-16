import fs from "fs";
import path from "path";
import { summarizeCanonicalThreeClock } from "../engines/canonicalThreeClockEdgeEngine.js";
import { summarizeCanonicalThreeClockStore } from "../data/canonicalThreeClockObservationStore.js";

export function writeThreeClockEdgeReport(projects = [], options = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = {
    ...summarizeCanonicalThreeClock(projects),
    observationStore: summarizeCanonicalThreeClockStore(options.store || {}),
    commandMap: {
      report: "npm run edge:three-clock",
      outcomes: "npm run edge:three-clock:outcomes",
      scan: "npm run scan",
    },
    disclaimer: "Three-Clock Edge is shadow-only. It does not change ranking, execution, or safety gates; its pressure diagnostic is not an executable quote.",
  };
  const filePath = path.join(reportsDir, "three-clock-edge.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return { filePath, report };
}
