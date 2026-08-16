import { loadCommittedLoadedVacuumObservations } from "../learning/committedLoadedVacuumObservationStore.js";
import { loadCommittedLoadedVacuumReplicationPlan } from "../learning/committedLoadedVacuumReplicationPlanStore.js";
import { runCommittedLoadedVacuumReplication } from "../learning/committedLoadedVacuumReplicationLab.js";

async function loadSnapshots() {
  try {
    const module = await import("../learning/outcomeSnapshotStore.js");
    return module.loadOutcomeSnapshots?.() || [];
  } catch { return []; }
}

const plan = loadCommittedLoadedVacuumReplicationPlan();
const observations = loadCommittedLoadedVacuumObservations({ limit: Number(process.env.IGNITION_REPLICATION_OBSERVATION_LIMIT || 100000) });
const snapshots = await loadSnapshots();
const report = runCommittedLoadedVacuumReplication(plan, observations, snapshots, {
  timeBlockDays: Number(process.env.IGNITION_REPLICATION_BLOCK_DAYS || 7),
  minQualifyingTimeBlocks: Number(process.env.IGNITION_REPLICATION_MIN_BLOCKS || 3),
});
console.log(JSON.stringify({ outcomeSnapshots: snapshots.length, report }, null, 2));
