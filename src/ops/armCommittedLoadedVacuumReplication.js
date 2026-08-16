import fs from "node:fs";
import path from "node:path";

import { loadCommittedLoadedVacuumObservations } from "../learning/committedLoadedVacuumObservationStore.js";
import { armCommittedLoadedVacuumReplicationPlan } from "../learning/committedLoadedVacuumReplicationPlanStore.js";

const validationFile = path.resolve("reports", "committed-loaded-vacuum-validation.json");
let validation = {};
try { validation = JSON.parse(fs.readFileSync(validationFile, "utf8")); } catch {}
const observations = loadCommittedLoadedVacuumObservations({ limit: Number(process.env.IGNITION_VALIDATION_OBSERVATION_LIMIT || 100000) });
const result = armCommittedLoadedVacuumReplicationPlan(validation, observations, {
  forceArm: process.env.IGNITION_REPLICATION_FORCE_ARM === "1",
});
console.log(JSON.stringify(result, null, 2));
