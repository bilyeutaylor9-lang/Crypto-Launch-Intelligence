import { loadCommittedLoadedVacuumObservations } from "../learning/committedLoadedVacuumObservationStore.js";
import { runCommittedLoadedVacuumAttribution } from "../learning/committedLoadedVacuumAttributionLab.js";

async function loadSnapshots() {
  try {
    const module = await import("../learning/outcomeSnapshotStore.js");
    return module.loadOutcomeSnapshots?.() || [];
  } catch { return []; }
}

const observations = loadCommittedLoadedVacuumObservations({ limit: Number(process.env.IGNITION_ATTRIBUTION_OBSERVATION_LIMIT || 100000) });
const snapshots = await loadSnapshots();
const report = runCommittedLoadedVacuumAttribution(observations, snapshots, {
  minResolvedRows: Number(process.env.IGNITION_ATTRIBUTION_MIN_ROWS || 120),
  minUniqueProjects: Number(process.env.IGNITION_ATTRIBUTION_MIN_PROJECTS || 60),
  minSpanDays: Number(process.env.IGNITION_ATTRIBUTION_MIN_SPAN_DAYS || 56),
  minOutOfSampleRows: Number(process.env.IGNITION_ATTRIBUTION_MIN_OOS_ROWS || 40),
  minTrainRows: Number(process.env.IGNITION_ATTRIBUTION_MIN_TRAIN_ROWS || 80),
  foldSize: Number(process.env.IGNITION_ATTRIBUTION_FOLD_SIZE || 25),
});
console.log(JSON.stringify({ outcomeSnapshots: snapshots.length, report }, null, 2));
