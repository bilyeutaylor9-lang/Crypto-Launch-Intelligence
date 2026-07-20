import { labelEarlyOpportunityOutcome } from "./earlyOpportunityOutcomeLab.js";

function timeKey(value = "") {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function snapshotAtOrBefore(observations = [], timestamp = "") {
  const target = timeKey(timestamp);
  return [...observations]
    .filter((observation) => timeKey(observation.observedAt || observation.timestamp) <= target)
    .sort((a, b) => timeKey(b.observedAt || b.timestamp) - timeKey(a.observedAt || a.timestamp))[0] || null;
}

function classifyFailure(snapshot = null, project = {}) {
  if (!snapshot) return "DISCOVERY_MISS";
  if (snapshot.identityState === "UNKNOWN" || snapshot.identityStatus === "MISSING_ADDRESS") return "IDENTITY_MISS";
  if ((snapshot.missingEvidence || []).some((field) => /alias|market cap|liquidity/i.test(String(field)))) return "NORMALIZATION_MISS";
  if (snapshot.dataStarvationStatus?.includes("BLOCKED")) return "ENRICHMENT_MISS";
  if (snapshot.funnelStage === "DEFERRED") return "FUNNEL_MISS";
  if (snapshot.researchPriority < 35) return "SCORING_MISS";
  if (snapshot.timingState === "LATE_CHASE") return "TIMING_MISS";
  if (project.honeypotDetected || project.sellRestricted) return "CORRECT_REJECTION";
  return "UNAVOIDABLE_MISSING_DATA";
}

export function replayMissedWinner(project = {}, options = {}) {
  const observations = project.observations || options.observations || [];
  const breakoutStart = project.breakoutStartAt || options.breakoutStartAt || observations.at(-1)?.observedAt || null;
  const breakoutTime = timeKey(breakoutStart);
  const checkpoints = [
    { label: "first discovery", at: project.firstSeenAt || observations[0]?.observedAt },
    { label: "24 hours before breakout", at: breakoutTime ? new Date(breakoutTime - 24 * 60 * 60 * 1000).toISOString() : null },
    { label: "12 hours before breakout", at: breakoutTime ? new Date(breakoutTime - 12 * 60 * 60 * 1000).toISOString() : null },
    { label: "6 hours before breakout", at: breakoutTime ? new Date(breakoutTime - 6 * 60 * 60 * 1000).toISOString() : null },
    { label: "breakout start", at: breakoutStart },
    { label: "after breakout", at: observations.at(-1)?.observedAt },
  ].filter((checkpoint) => checkpoint.at);

  const replay = checkpoints.map((checkpoint) => {
    const snapshot = snapshotAtOrBefore(observations, checkpoint.at);
    return {
      ...checkpoint,
      snapshotAvailable: Boolean(snapshot),
      failureClass: classifyFailure(snapshot, project),
      snapshot: snapshot || null,
    };
  });

  return {
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || null,
    breakoutStartAt: breakoutStart,
    discovered: replay.some((item) => item.snapshotAvailable),
    earlyRecallSuccess: replay.some((item) =>
      item.snapshotAvailable &&
      ["PRE_BREAKOUT", "EARLY_TRACTION", "QUIET_ACCUMULATION"].includes(item.snapshot.timingState) &&
      Number(item.snapshot.researchPriority || 0) >= 35
    ),
    replay,
    outcome: labelEarlyOpportunityOutcome(
      {
        predictionTimestamp: project.firstSeenAt || observations[0]?.observedAt,
        priceUsd: project.firstSeenPrice || observations[0]?.priceUsd,
      },
      observations
    ),
    leakagePolicy: "Replay uses only observations at or before each checkpoint. Future observations are used only for outcome labels.",
  };
}

export function runMissedWinnerReplayLab(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => replayMissedWinner(project, options));
}
