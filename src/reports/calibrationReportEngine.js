import fs from "fs";
import path from "path";
import { buildOutcomeCalibrationReport } from "../learning/outcomeCalibrationEngine.js";
import { runAvoidanceEdgeVerification } from "../learning/avoidanceEdgeVerificationLab.js";
import { runProspectiveEntryEdgeLab } from "../learning/prospectiveEntryEdgeLab.js";

export function writeCalibrationReport() {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = buildOutcomeCalibrationReport();
  const filePath = path.join(reportsDir, "outcome-calibration.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  runAvoidanceEdgeVerification();
  runProspectiveEntryEdgeLab();

  return filePath;
}
