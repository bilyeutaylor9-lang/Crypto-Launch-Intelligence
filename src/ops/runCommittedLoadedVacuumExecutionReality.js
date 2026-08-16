import { loadCommittedLoadedVacuumObservations } from "../learning/committedLoadedVacuumObservationStore.js";
import { runCommittedLoadedVacuumExecutionReality } from "../learning/committedLoadedVacuumExecutionRealityLab.js";

async function loadSnapshots() {
  try {
    const module = await import("../learning/outcomeSnapshotStore.js");
    return module.loadOutcomeSnapshots?.() || [];
  } catch { return []; }
}

const observations = loadCommittedLoadedVacuumObservations({ limit: Number(process.env.IGNITION_EXECUTION_REALITY_OBSERVATION_LIMIT || 100000) });
const snapshots = await loadSnapshots();
const report = runCommittedLoadedVacuumExecutionReality(observations, snapshots, {
  minCostCoveredTreatments: Number(process.env.IGNITION_EXECUTION_MIN_COST_COVERED || 50),
  minNetMatchedPairs: Number(process.env.IGNITION_EXECUTION_MIN_MATCHED_PAIRS || 30),
  minExecutionCostCoveragePct: Number(process.env.IGNITION_EXECUTION_MIN_COST_COVERAGE_PCT || 60),
});
console.log(JSON.stringify({ outcomeSnapshots: snapshots.length, report }, null, 2));
