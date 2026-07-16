import { identityKeyForProject } from "./projectIdentityGraph.js";
import {
  discoveryLaneForProject,
  evidenceFamiliesForProject,
  independentEvidenceScore,
} from "./discoveryCoverageEngine.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function normalized(value = "", fallback = "unknown") {
  const clean = String(value || "").trim().toLowerCase();
  return clean || fallback;
}

function stableHash(value = "") {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function identityForCandidate(project = {}, index = 0) {
  const identity = identityKeyForProject(project);

  // An entirely unidentified record must not collapse every other unknown
  // candidate into one slot. Real identities continue to be deduplicated.
  if (identity.endsWith(":alias:unknown")) {
    return `${identity}:${normalized(project.source)}:${index}`;
  }

  return identity;
}

function historyFor(history = {}, identityKey = "") {
  return history?.projects?.[identityKey] || history?.[identityKey] || {};
}

function primaryFamily(project = {}) {
  const families = evidenceFamiliesForProject(project);
  return families.find((family) => family !== "unknown") || families[0] || "unknown";
}

function countBy(items = [], getter) {
  return items.reduce((counts, item) => {
    const key = getter(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function compareMerit(left, right) {
  return (
    right.priority - left.priority ||
    right.evidence - left.evidence ||
    left.identityKey.localeCompare(right.identityKey)
  );
}

function compareRotation(left, right, runSequence) {
  const leftWasDeferred = num(left.history.deferredCount) > 0;
  const rightWasDeferred = num(right.history.deferredCount) > 0;

  if (leftWasDeferred !== rightWasDeferred) return leftWasDeferred ? -1 : 1;

  const leftQueuedAt = Date.parse(left.history.lastQueuedAt || 0) || 0;
  const rightQueuedAt = Date.parse(right.history.lastQueuedAt || 0) || 0;
  if (leftQueuedAt !== rightQueuedAt) return leftQueuedAt - rightQueuedAt;

  const deferredDifference = num(right.history.deferredCount) - num(left.history.deferredCount);
  if (deferredDifference) return deferredDifference;

  const cycleDifference =
    stableHash(`${left.identityKey}:${runSequence}`) -
    stableHash(`${right.identityKey}:${runSequence}`);
  if (cycleDifference) return cycleDifference;

  return compareMerit(left, right);
}

function annotate(item, prefix, state, reason, rank = null) {
  const selectionState = `${prefix}SelectionState`;
  const selectionReason = `${prefix}SelectionReason`;
  const coverageBucket = `${prefix}CoverageBucket`;
  const coverageRank = `${prefix}CoverageRank`;

  return {
    ...item.project,
    [selectionState]: state,
    [selectionReason]: reason,
    [coverageBucket]: item.coverageBucket,
    [coverageRank]: rank,
  };
}

function selectionBudgets(limit) {
  if (limit <= 1) return { merit: limit, coverage: 0, rotation: 0 };
  if (limit === 2) return { merit: 1, coverage: 1, rotation: 0 };

  const merit = Math.max(1, Math.floor(limit * 0.6));
  const coverage = Math.max(1, Math.floor(limit * 0.2));
  return { merit, coverage, rotation: Math.max(0, limit - merit - coverage) };
}

/**
 * Builds a deterministic, bounded research queue. The queue spends most of
 * its capacity on preliminary merit while reserving capacity for undercovered
 * chain/lane/evidence buckets and identities deferred by previous scans.
 */
export function planCoverageSelection(projects = [], options = {}) {
  const candidates = Array.isArray(projects) ? projects : [];
  const prefix = options.prefix || "research";
  const configuredLimit = num(options.limit);
  const history = options.history || {};
  const runSequence = Math.max(1, Math.floor(num(options.runSequence) || 1));
  const scoreFor = typeof options.scoreFor === "function"
    ? options.scoreFor
    : (project) => project.discoveryPriorityScore;

  const ranked = candidates
    .map((project, index) => {
      const identityKey = identityForCandidate(project, index);
      const chain = normalized(project.chain || project.chainId);
      const lane = normalized(project.discoveryLane || discoveryLaneForProject(project));
      const family = primaryFamily(project);

      return {
        project,
        index,
        identityKey,
        chain,
        lane,
        family,
        coverageBucket: `${chain}|${lane}|${family}`,
        priority: num(scoreFor(project)),
        evidence: num(project.independentEvidenceScore || independentEvidenceScore(project)),
        history: historyFor(history, identityKey),
      };
    })
    .sort(compareMerit);

  const unique = [];
  const duplicates = [];
  const seenIdentities = new Set();

  for (const candidate of ranked) {
    if (seenIdentities.has(candidate.identityKey)) duplicates.push(candidate);
    else {
      seenIdentities.add(candidate.identityKey);
      unique.push(candidate);
    }
  }

  const limit = configuredLimit > 0 ? Math.min(Math.floor(configuredLimit), unique.length) : unique.length;
  const selected = [];
  const selectedIdentities = new Set();
  const selectedReasonByIdentity = new Map();

  const select = (candidate, reason) => {
    if (!candidate || selectedIdentities.has(candidate.identityKey) || selected.length >= limit) return false;
    selectedIdentities.add(candidate.identityKey);
    selectedReasonByIdentity.set(candidate.identityKey, reason);
    selected.push(candidate);
    return true;
  };

  if (limit === unique.length) {
    unique.forEach((candidate) => select(candidate, "FULL_COVERAGE"));
  } else {
    const budgets = selectionBudgets(limit);
    unique.slice(0, budgets.merit).forEach((candidate) => select(candidate, "MERIT"));

    const selectedByBucket = countBy(selected, (candidate) => candidate.coverageBucket);
    const buckets = new Map();
    for (const candidate of unique) {
      if (!buckets.has(candidate.coverageBucket)) buckets.set(candidate.coverageBucket, []);
      buckets.get(candidate.coverageBucket).push(candidate);
    }
    for (const bucket of buckets.values()) bucket.sort(compareMerit);

    for (let index = 0; index < budgets.coverage; index += 1) {
      const availableBuckets = [...buckets.entries()]
        .map(([bucket, queue]) => ({
          bucket,
          candidate: queue.find((candidate) => !selectedIdentities.has(candidate.identityKey)),
        }))
        .filter((entry) => entry.candidate);
      if (!availableBuckets.length) break;

      availableBuckets.sort((left, right) =>
        (selectedByBucket[left.bucket] || 0) - (selectedByBucket[right.bucket] || 0) ||
        compareMerit(left.candidate, right.candidate) ||
        left.bucket.localeCompare(right.bucket)
      );

      const next = availableBuckets[0].candidate;
      if (select(next, "COVERAGE_RESERVE")) {
        selectedByBucket[next.coverageBucket] = (selectedByBucket[next.coverageBucket] || 0) + 1;
      }
    }

    unique
      .filter((candidate) => !selectedIdentities.has(candidate.identityKey))
      .sort((left, right) => compareRotation(left, right, runSequence))
      .slice(0, budgets.rotation)
      .forEach((candidate) => select(candidate, "DEFERRED_ROTATION"));

    unique
      .filter((candidate) => !selectedIdentities.has(candidate.identityKey))
      .sort(compareMerit)
      .forEach((candidate) => select(candidate, "MERIT_FILL"));
  }

  const selectedProjects = selected.map((candidate, index) =>
    annotate(candidate, prefix, "SELECTED", selectedReasonByIdentity.get(candidate.identityKey), index + 1)
  );
  const selectedSet = new Set(selected.map((candidate) => candidate.identityKey));
  const deferred = unique
    .filter((candidate) => !selectedSet.has(candidate.identityKey))
    .map((candidate) => annotate(candidate, prefix, "DEFERRED", "CAPACITY_DEFERRED"));
  const duplicateProjects = duplicates.map((candidate) =>
    annotate(candidate, prefix, "MERGED", "DUPLICATE_IDENTITY")
  );
  const allDeferred = [...deferred, ...duplicateProjects];

  const selectedByReason = countBy(selected, (candidate) => selectedReasonByIdentity.get(candidate.identityKey));
  const report = {
    policy: "60% preliminary merit, 20% chain-lane-source coverage, 20% deferred rotation",
    prefix,
    runSequence,
    configuredLimit: configuredLimit || null,
    candidateCount: candidates.length,
    uniqueCandidateCount: unique.length,
    duplicateIdentityCount: duplicates.length,
    selectedCount: selectedProjects.length,
    deferredCount: allDeferred.length,
    selectedByReason,
    deferredByReason: {
      CAPACITY_DEFERRED: deferred.length,
      DUPLICATE_IDENTITY: duplicateProjects.length,
    },
    selectedByChain: countBy(selected, (candidate) => candidate.chain),
    selectedByLane: countBy(selected, (candidate) => candidate.lane),
    selectedByEvidenceFamily: countBy(selected, (candidate) => candidate.family),
    unreviewedSelectedCount: selected.filter((candidate) => num(candidate.history.queuedCount) === 0).length,
    previouslyDeferredSelectedCount: selected.filter((candidate) => num(candidate.history.deferredCount) > 0).length,
  };

  return {
    selected: selectedProjects,
    deferred: allDeferred,
    selectedIdentityKeys: selected.map((candidate) => candidate.identityKey),
    selectionReasons: Object.fromEntries(selectedReasonByIdentity),
    report,
  };
}
