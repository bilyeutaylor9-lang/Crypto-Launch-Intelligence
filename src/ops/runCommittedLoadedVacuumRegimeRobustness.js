import { loadCommittedLoadedVacuumObservations } from "../learning/committedLoadedVacuumObservationStore.js";
import { runCommittedLoadedVacuumRegimeRobustness } from "../learning/committedLoadedVacuumRegimeRobustnessLab.js";

async function loadSnapshots() {
  try {
    const module = await import("../learning/outcomeSnapshotStore.js");
    return module.loadOutcomeSnapshots?.() || [];
  } catch { return []; }
}

const observations = loadCommittedLoadedVacuumObservations({ limit: Number(process.env.IGNITION_ROBUSTNESS_OBSERVATION_LIMIT || 100000) });
const snapshots = await loadSnapshots();
const report = runCommittedLoadedVacuumRegimeRobustness(observations, snapshots, {
  minPairsPerStratum: Number(process.env.IGNITION_ROBUSTNESS_MIN_PAIRS_PER_STRATUM || 10),
  minQualifiedRegimes: Number(process.env.IGNITION_ROBUSTNESS_MIN_REGIMES || 3),
  minPositiveRegimePct: Number(process.env.IGNITION_ROBUSTNESS_MIN_POSITIVE_REGIME_PCT || 67),
});
console.log(JSON.stringify({ outcomeSnapshots: snapshots.length, report }, null, 2));
