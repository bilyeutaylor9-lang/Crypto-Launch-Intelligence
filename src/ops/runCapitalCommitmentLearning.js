import fs from "node:fs";
import { processCapitalCommitmentLearning } from "../learning/capitalCommitmentCoordinator.js";

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}
const projects = readJson(process.argv[2] || "reports/ignition-raw-sensors.json")?.projects || [];
const radar = readJson(process.argv[3] || "reports/chain-capital-radar.json") || { chains: [] };
const result = processCapitalCommitmentLearning(projects, radar, {}, { writeReport: true, persist: true });
console.log(JSON.stringify({ status: result.status, trainingExamples: result.model.trainingExamples, lab: result.lab }, null, 2));
