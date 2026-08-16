import { loadCommittedLoadedVacuumObservations, summarizeCommittedLoadedVacuumObservations } from "../learning/committedLoadedVacuumObservationStore.js";
import { runCommittedLoadedVacuumValidation } from "../learning/committedLoadedVacuumValidationLab.js";

async function loadSnapshots() {
  try {
    const module = await import("../learning/outcomeSnapshotStore.js");
    return module.loadOutcomeSnapshots?.() || [];
  } catch {
    return [];
  }
}

const observations = loadCommittedLoadedVacuumObservations({ limit: Number(process.env.IGNITION_VALIDATION_OBSERVATION_LIMIT || 100000) });
const snapshots = await loadSnapshots();
const report = runCommittedLoadedVacuumValidation(observations, snapshots, {
  minResolvedTreatments: Number(process.env.IGNITION_VALIDATION_MIN_TREATMENTS || 100),
  minUniqueProjects: Number(process.env.IGNITION_VALIDATION_MIN_PROJECTS || 50),
  minSpanDays: Number(process.env.IGNITION_VALIDATION_MIN_SPAN_DAYS || 56),
  treatmentCooldownHours: Number(process.env.IGNITION_VALIDATION_COOLDOWN_HOURS || 72),
  maxControls: Number(process.env.IGNITION_VALIDATION_MATCHED_CONTROLS || 3),
});
console.log(JSON.stringify({ store: summarizeCommittedLoadedVacuumObservations(), outcomeSnapshots: snapshots.length, report }, null, 2));
