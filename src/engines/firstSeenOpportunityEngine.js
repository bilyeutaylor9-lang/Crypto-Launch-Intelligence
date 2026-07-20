import { buildFirstSeenSnapshot, recordPointInTimeObservation } from "../data/pointInTimeObservationStore.js";

export function analyzeFirstSeenOpportunity(project = {}, options = {}) {
  const snapshot = buildFirstSeenSnapshot(project, options.meta || options);
  let stored = null;
  if (options.persist !== false) {
    stored = recordPointInTimeObservation(project, options.meta || options, options.store || {});
  }
  const firstSeen = stored?.firstSeen || snapshot;

  return {
    ...project,
    firstSeenOpportunity: firstSeen,
    firstSeenAt: firstSeen.firstSeenAt,
    firstSeenResearchPriority: firstSeen.firstSeenResearchPriority,
    firstSeenMissingEvidence: firstSeen.firstSeenMissingEvidence,
    firstSeenSnapshotImmutable: true,
  };
}

export function analyzeFirstSeenOpportunityBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => analyzeFirstSeenOpportunity(project, options));
}
