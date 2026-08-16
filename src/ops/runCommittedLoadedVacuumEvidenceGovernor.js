import fs from "node:fs";
import path from "node:path";

import { runCommittedLoadedVacuumEvidenceGovernor } from "../learning/committedLoadedVacuumEvidenceGovernor.js";

function readJson(rel) {
  const file = path.resolve(rel);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

const inputs = {
  validation: readJson("reports/committed-loaded-vacuum-validation.json"),
  attribution: readJson("reports/committed-loaded-vacuum-attribution.json"),
  replication: readJson("reports/committed-loaded-vacuum-replication.json"),
  regimeRobustness: readJson("reports/committed-loaded-vacuum-regime-robustness.json"),
  executionReality: readJson("reports/committed-loaded-vacuum-execution-reality.json"),
};
const report = runCommittedLoadedVacuumEvidenceGovernor(inputs);
console.log(JSON.stringify({ report }, null, 2));
