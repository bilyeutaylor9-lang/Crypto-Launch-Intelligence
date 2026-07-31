import {
  attachCandidateTruthState,
  attachCandidateTruthStateBatch,
} from "../kernel/candidateTruthState.js";

export function analyzeCandidateTruthReconciliation(project = {}) {
  return attachCandidateTruthState(project);
}

export function analyzeCandidateTruthReconciliationBatch(projects = []) {
  return attachCandidateTruthStateBatch(projects);
}
