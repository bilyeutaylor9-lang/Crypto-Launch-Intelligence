import { buildFirstSeenSnapshot, recordPointInTimeObservation, recordPointInTimeObservations } from "../data/pointInTimeObservationStore.js";

function attachFirstSeen(project, firstSeen) {
  return {
    ...project,
    firstSeenOpportunity: firstSeen,
    firstSeenAt: firstSeen.firstSeenAt,
    firstSeenResearchPriority: firstSeen.firstSeenResearchPriority,
    firstSeenMissingEvidence: firstSeen.firstSeenMissingEvidence,
    firstSeenSnapshotImmutable: true,
  };
}

export function analyzeFirstSeenOpportunity(project = {}, options = {}) {
  const meta = options.meta || options;
  const firstSeen = options.persist === false
    ? buildFirstSeenSnapshot(project, meta)
    : recordPointInTimeObservation(project, meta, options.store || {}).firstSeen;
  return attachFirstSeen(project, firstSeen);
}

export function analyzeFirstSeenOpportunityBatch(projects = [], options = {}) {
  const rows = Array.isArray(projects) ? projects : [];
  if (options.persist === false) return rows.map((project) => analyzeFirstSeenOpportunity(project, options));
  const records = recordPointInTimeObservations(rows, options.meta || options, options.store || {});
  return rows.map((project, index) => attachFirstSeen(project, records[index].firstSeen));
}
