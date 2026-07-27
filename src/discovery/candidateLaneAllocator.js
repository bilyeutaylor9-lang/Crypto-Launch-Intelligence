import { identityKeyForProject } from "./projectIdentityGraph.js";

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

function rotationScore(identityKey = "", runSequence = 1, salt = "rotation") {
  return (stableHash(`${salt}:${runSequence}:${identityKey}`) ^
    stableHash(`${identityKey}:${Math.imul(runSequence, 7919)}:${salt}`)) >>> 0;
}

function identityForCandidate(project = {}, index = 0) {
  const identity = identityKeyForProject(project);
  if (identity.endsWith(":alias:unknown")) {
    return `${identity}:${normalized(project.source)}:${index}`;
  }
  return identity;
}

function compareBy(getter) {
  return (left, right) =>
    num(getter(right.project)) - num(getter(left.project)) ||
    num(right.project.preIntelligenceOpportunityScore) - num(left.project.preIntelligenceOpportunityScore) ||
    left.identityKey.localeCompare(right.identityKey);
}

function coverageKey(candidate = {}) {
  const project = candidate.project || {};
  return [
    normalized(project.chain || project.network),
    normalized(project.preIntelligenceLane || project.discoveryLane),
    normalized(project.narrative || project.primaryNarrative || project.category),
    normalized(project.preIntelligenceMarketCapGroup),
    normalized(project.source),
  ].join("|");
}

function countBy(items = [], getter) {
  return items.reduce((counts, item) => {
    const key = getter(item) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function topPercentThreshold(items = [], getter = () => 0, percent = 0.01) {
  const values = items.map((item) => num(getter(item.project))).sort((a, b) => b - a);
  if (!values.length) return Infinity;
  return values[Math.max(0, Math.min(values.length - 1, Math.floor(values.length * percent)))];
}

function selectionReasonLabel(reason = "") {
  return {
    COMPOSITE_MERIT: "Composite Merit",
    ACCELERATION_RESERVE: "Acceleration Reserve",
    ATTENTION_GAP_RESERVE: "Attention Gap Reserve",
    CATALYST_DEVELOPER_RESERVE: "Catalyst/Developer Reserve",
    COVERAGE_RESERVE: "Coverage Reserve",
    STARVATION_RESCUE_RESERVE: "Data Starvation Rescue",
    FRESH_DISCOVERY_RESERVE: "Fresh Discovery Reserve",
    DEFERRED_ROTATION: "Deferred Rotation",
    MERIT_FILL: "Merit Fill",
  }[reason] || reason;
}

function historyFor(history = {}, identityKey = "") {
  return history?.projects?.[identityKey] || history?.[identityKey] || {};
}

function annotate(candidate = {}, state = "SELECTED", reason = "", rank = null, extra = {}) {
  const project = candidate.project || {};
  return {
    ...project,
    standardSelectionState: state,
    standardSelectionReason: reason,
    standardSelectionLane: selectionReasonLabel(reason),
    standardSelectionRank: rank,
    standardSelectionIdentityKey: candidate.identityKey,
    standardSelectionCompositeRank: candidate.compositeRank,
    standardSelectionNearMissLane: extra.nearMissLane || null,
    standardSelectionRescueReason: extra.rescueReason || null,
    standardSelectionMissingEvidence: project.preIntelligenceMissingEvidence || [],
    standardSelectionScore: project.preIntelligenceOpportunityScore || 0,
  };
}

function concentration(items = [], getter = () => "unknown") {
  const counts = countBy(items, getter);
  const total = Math.max(1, items.length);
  return Object.entries(counts)
    .map(([key, count]) => ({
      key,
      count,
      sharePct: Math.round((count / total) * 100),
      status: count / total > 0.35 ? "CONCENTRATED" : "OK",
    }))
    .sort((a, b) => b.count - a.count);
}

function isStarvationRescueCandidate(project = {}) {
  const missing = project.dataStarvationMissingEvidence || project.preIntelligenceMissingEvidence || [];
  const recoverable = Array.isArray(missing)
    ? missing.some((item) => (typeof item === "string" ? true : item.recoverable !== false && item.rootCause !== "NOT_APPLICABLE"))
    : false;
  return Boolean(
    project.starvationRescueEligible === true ||
      (recoverable &&
        num(project.earlyAsymmetryResearchPriorityScore || project.preIntelligenceOpportunityScore) >= 35 &&
        !(project.preIntelligenceHardBlockers || []).length)
  );
}

export function allocateCandidateLanes(projects = [], config = {}, options = {}) {
  const limit = Math.max(0, Math.floor(num(options.limit || config.standardIntelligenceLimit || projects.length)));
  const history = options.history || {};
  const runSequence = Math.max(1, Math.floor(num(options.runSequence) || 1));
  const candidates = (Array.isArray(projects) ? projects : []).map((project, index) => ({
    project,
    index,
    identityKey: identityForCandidate(project, index),
    coverageKey: "",
    history: null,
    compositeRank: 0,
  }));
  for (const candidate of candidates) {
    candidate.coverageKey = coverageKey(candidate);
    candidate.history = historyFor(history, candidate.identityKey);
  }

  const hardBlocked = candidates.filter((candidate) => (candidate.project.preIntelligenceHardBlockers || []).length);
  const eligible = candidates.filter((candidate) => !(candidate.project.preIntelligenceHardBlockers || []).length);
  const unique = [];
  const duplicates = [];
  const seen = new Set();
  const sortedComposite = [...eligible].sort(compareBy((project) => project.preIntelligenceOpportunityScore));

  for (const candidate of sortedComposite) {
    if (seen.has(candidate.identityKey)) duplicates.push(candidate);
    else {
      seen.add(candidate.identityKey);
      candidate.compositeRank = unique.length + 1;
      unique.push(candidate);
    }
  }

  const target = limit > 0 ? Math.min(limit, unique.length) : unique.length;
  const selected = [];
  const selectedIdentityKeys = new Set();
  const selectedReasonByIdentity = new Map();
  const rescueReasons = new Map();

  const select = (candidate, reason, rescueReason = null) => {
    if (!candidate || selected.length >= target || selectedIdentityKeys.has(candidate.identityKey)) return false;
    selected.push(candidate);
    selectedIdentityKeys.add(candidate.identityKey);
    selectedReasonByIdentity.set(candidate.identityKey, reason);
    if (rescueReason) rescueReasons.set(candidate.identityKey, rescueReason);
    return true;
  };

  const budgets = {
    COMPOSITE_MERIT: Math.min(target, Math.max(0, Math.floor(num(config.laneBudgets?.compositeMerit) || Math.round(target * 0.6)))),
    ACCELERATION_RESERVE: Math.max(0, Math.floor(num(config.laneBudgets?.accelerationReserve) || Math.round(target * 0.15))),
    ATTENTION_GAP_RESERVE: Math.max(0, Math.floor(num(config.laneBudgets?.attentionGapReserve) || Math.round(target * 0.1))),
    CATALYST_DEVELOPER_RESERVE: Math.max(0, Math.floor(num(config.laneBudgets?.catalystDeveloperReserve) || Math.round(target * 0.075))),
    COVERAGE_RESERVE: Math.max(0, Math.floor(num(config.laneBudgets?.coverageReserve) || Math.round(target * 0.05))),
    STARVATION_RESCUE_RESERVE: Math.max(0, Math.floor(num(config.laneBudgets?.starvationRescueReserve) || Math.round(target * 0.075))),
    FRESH_DISCOVERY_RESERVE: Math.max(0, Math.floor(num(config.laneBudgets?.freshDiscoveryReserve) || Math.round(target * 0.05))),
    DEFERRED_ROTATION: Math.max(0, Math.floor(num(config.laneBudgets?.deferredRotation) || Math.round(target * 0.025))),
  };

  unique.slice(0, budgets.COMPOSITE_MERIT).forEach((candidate) => select(candidate, "COMPOSITE_MERIT"));

  const accelThreshold = topPercentThreshold(unique, (project) => project.preIntelligenceComponents?.acceleration, 0.01);
  const attentionThreshold = topPercentThreshold(unique, (project) => project.preIntelligenceComponents?.attentionGap, 0.01);
  const developerThreshold = topPercentThreshold(unique, (project) => project.preIntelligenceSignals?.developerAcceleration, 0.01);

  const laneSelect = (items, budget, reason, getter, rescueLabel, minScore = 0) => {
    [...items]
      .filter((candidate) => num(getter(candidate.project)) >= minScore)
      .sort(compareBy(getter))
      .forEach((candidate) => {
        const alreadySelected = selected.filter((item) => selectedReasonByIdentity.get(item.identityKey) === reason).length;
        if (alreadySelected >= budget) return;
        const rescueReason = candidate.compositeRank > target ? rescueLabel : null;
        select(candidate, reason, rescueReason);
      });
  };

  laneSelect(
    unique,
    budgets.ACCELERATION_RESERVE,
    "ACCELERATION_RESERVE",
    (project) => project.preIntelligenceComponents?.acceleration,
    "top acceleration outside composite cut",
    35
  );
  laneSelect(
    unique,
    budgets.ATTENTION_GAP_RESERVE,
    "ATTENTION_GAP_RESERVE",
    (project) => project.preIntelligenceComponents?.attentionGap,
    "top attention gap outside composite cut",
    65
  );
  laneSelect(
    unique,
    budgets.CATALYST_DEVELOPER_RESERVE,
    "CATALYST_DEVELOPER_RESERVE",
    (project) => project.preIntelligenceComponents?.catalystDeveloperChange,
    "catalyst or developer change outside composite cut",
    55
  );
  laneSelect(
    unique.filter((candidate) => isStarvationRescueCandidate(candidate.project)),
    budgets.STARVATION_RESCUE_RESERVE,
    "STARVATION_RESCUE_RESERVE",
    (project) => project.starvationRescueScore || project.earlyAsymmetryResearchPriorityScore || project.preIntelligenceOpportunityScore,
    "recoverable data-starved early opportunity outside composite cut",
    35
  );

  const buckets = new Map();
  for (const candidate of unique) {
    if (!buckets.has(candidate.coverageKey)) buckets.set(candidate.coverageKey, []);
    buckets.get(candidate.coverageKey).push(candidate);
  }
  for (const bucket of buckets.values()) bucket.sort(compareBy((project) => project.preIntelligenceOpportunityScore));
  const selectedByBucket = countBy(selected, (candidate) => candidate.coverageKey);

  for (let index = 0; index < budgets.COVERAGE_RESERVE; index += 1) {
    const available = [...buckets.entries()]
      .map(([bucket, queue]) => ({
        bucket,
        candidate: queue.find((candidate) => !selectedIdentityKeys.has(candidate.identityKey)),
      }))
      .filter((entry) => entry.candidate);
    if (!available.length) break;
    available.sort((left, right) =>
      (selectedByBucket[left.bucket] || 0) - (selectedByBucket[right.bucket] || 0) ||
      compareBy((project) => project.preIntelligenceOpportunityScore)(left.candidate, right.candidate) ||
      left.bucket.localeCompare(right.bucket)
    );
    const next = available[0].candidate;
    if (select(next, "COVERAGE_RESERVE", next.compositeRank > target ? "underrepresented valid opportunity lane" : null)) {
      selectedByBucket[next.coverageKey] = (selectedByBucket[next.coverageKey] || 0) + 1;
    }
  }

  unique
    .filter((candidate) => !selectedIdentityKeys.has(candidate.identityKey))
    .sort((left, right) => {
      const leftNeverQueued = num(left.history.queuedCount) === 0 ? 1 : 0;
      const rightNeverQueued = num(right.history.queuedCount) === 0 ? 1 : 0;
      if (leftNeverQueued !== rightNeverQueued) return rightNeverQueued - leftNeverQueued;
      const leftDeferred = num(left.history.deferredCount);
      const rightDeferred = num(right.history.deferredCount);
      if (leftDeferred !== rightDeferred) return rightDeferred - leftDeferred;
      return rotationScore(left.identityKey, runSequence, "fresh-discovery") -
        rotationScore(right.identityKey, runSequence, "fresh-discovery");
    })
    .slice(0, budgets.FRESH_DISCOVERY_RESERVE)
    .forEach((candidate) =>
      select(
        candidate,
        "FRESH_DISCOVERY_RESERVE",
        num(candidate.history.queuedCount) === 0
          ? "never queued by prior standard scans"
          : "long-deferred candidate rotated into standard scan"
      )
    );

  unique
    .filter((candidate) => !selectedIdentityKeys.has(candidate.identityKey))
    .sort((left, right) => {
      const leftDeferred = num(left.history.deferredCount);
      const rightDeferred = num(right.history.deferredCount);
      if (leftDeferred !== rightDeferred) return rightDeferred - leftDeferred;
      return rotationScore(left.identityKey, runSequence, "deferred") -
        rotationScore(right.identityKey, runSequence, "deferred");
    })
    .slice(0, budgets.DEFERRED_ROTATION)
    .forEach((candidate) => select(candidate, "DEFERRED_ROTATION"));

  unique
    .filter((candidate) => !selectedIdentityKeys.has(candidate.identityKey))
    .sort(compareBy((project) => project.preIntelligenceOpportunityScore))
    .forEach((candidate) => select(candidate, "MERIT_FILL"));

  const selectedProjects = selected.map((candidate, index) =>
    annotate(candidate, "SELECTED", selectedReasonByIdentity.get(candidate.identityKey), index + 1, {
      rescueReason: rescueReasons.get(candidate.identityKey),
    })
  );
  const selectedSet = new Set(selected.map((candidate) => candidate.identityKey));
  const deferred = unique
    .filter((candidate) => !selectedSet.has(candidate.identityKey))
    .map((candidate) => {
      const nearMissLane =
        num(candidate.project.preIntelligenceComponents?.acceleration) >= accelThreshold
          ? "ACCELERATION_RESERVE"
          : num(candidate.project.preIntelligenceComponents?.attentionGap) >= attentionThreshold
            ? "ATTENTION_GAP_RESERVE"
            : num(candidate.project.preIntelligenceSignals?.developerAcceleration) >= developerThreshold
              ? "CATALYST_DEVELOPER_RESERVE"
              : "COMPOSITE_MERIT";
      return annotate(candidate, "DEFERRED", "CAPACITY_DEFERRED", null, { nearMissLane });
    });
  const duplicateProjects = duplicates.map((candidate) => annotate(candidate, "MERGED", "DUPLICATE_IDENTITY"));
  const blockedProjects = hardBlocked.map((candidate) => annotate(candidate, "BLOCKED", "CONFIRMED_PRE_INTELLIGENCE_DANGER"));
  const allExcluded = [...deferred, ...duplicateProjects, ...blockedProjects];
  const selectedByReason = countBy(selected, (candidate) => selectedReasonByIdentity.get(candidate.identityKey));
  const rescued = selectedProjects.filter((project) => project.standardSelectionRescueReason);

  return {
    selected: selectedProjects,
    deferred: allExcluded,
    rescued,
    selectedIdentityKeys: selected.map((candidate) => candidate.identityKey),
    selectionReasons: Object.fromEntries(selectedReasonByIdentity),
    budgets,
    report: {
      policy: "Institutional multi-lane 4,000 selector: composite, acceleration, attention gap, catalyst/developer, data-starvation rescue, coverage, fresh discovery, rotation, then merit fill. Missing data is not treated as zero; recoverable hidden candidates and never-queued projects receive reserved capacity.",
      runSequence,
      configuredLimit: limit,
      candidateCount: candidates.length,
      eligibleCandidateCount: eligible.length,
      uniqueCandidateCount: unique.length,
      duplicateIdentityCount: duplicates.length,
      selectedCount: selectedProjects.length,
      deferredCount: allExcluded.length,
      selectedByReason,
      selectedByChain: countBy(selected, (candidate) => normalized(candidate.project.chain || candidate.project.network)),
      selectedBySource: countBy(selected, (candidate) => normalized(candidate.project.source)),
      selectedByNarrative: countBy(selected, (candidate) => normalized(candidate.project.narrative || candidate.project.primaryNarrative || candidate.project.category)),
      selectedByLifecycle: countBy(selected, (candidate) => normalized(candidate.project.preIntelligenceLane || candidate.project.discoveryLane)),
      selectedByMarketCapGroup: countBy(selected, (candidate) => normalized(candidate.project.preIntelligenceMarketCapGroup)),
      selectedByEvidenceFamily: countBy(selected, (candidate) => normalized(candidate.project.preIntelligenceEvidenceFamilies?.[0])),
      concentration: {
        chain: concentration(selected, (candidate) => normalized(candidate.project.chain || candidate.project.network)),
        source: concentration(selected, (candidate) => normalized(candidate.project.source)),
        narrative: concentration(selected, (candidate) => normalized(candidate.project.narrative || candidate.project.primaryNarrative || candidate.project.category)),
        lifecycle: concentration(selected, (candidate) => normalized(candidate.project.preIntelligenceLane || candidate.project.discoveryLane)),
      },
      rescuedCount: rescued.length,
      hardBlockedCount: blockedProjects.length,
      allocation: {
        compositeMerit: selectedByReason.COMPOSITE_MERIT || 0,
        accelerationReserve: selectedByReason.ACCELERATION_RESERVE || 0,
        attentionGapReserve: selectedByReason.ATTENTION_GAP_RESERVE || 0,
        catalystDeveloperReserve: selectedByReason.CATALYST_DEVELOPER_RESERVE || 0,
        starvationRescueReserve: selectedByReason.STARVATION_RESCUE_RESERVE || 0,
        coverageReserve: selectedByReason.COVERAGE_RESERVE || 0,
        deferredRotation: selectedByReason.DEFERRED_ROTATION || 0,
        freshDiscoveryReserve: selectedByReason.FRESH_DISCOVERY_RESERVE || 0,
        meritFill: selectedByReason.MERIT_FILL || 0,
        rescuedCandidates: rescued.length,
      },
    },
  };
}
