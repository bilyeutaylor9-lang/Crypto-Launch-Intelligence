import { hoursBetween, median, num, quantile } from "../edge/edgeMath.js";

function matchingSuccessfulAnalogs(project = {}, lab = {}, options = {}) {
  const stage = num(project.threeClockLeadStage ?? project.threeClockEdge?.leadSequence?.stage);
  const divergenceState = project.threeClockDivergenceState ?? project.threeClockEdge?.divergence?.state ?? null;
  const horizon = String(Number(options.horizonHours || 168));
  return (lab.records || []).flatMap((row) => {
    const outcome = row.outcomes?.[horizon];
    if (!outcome?.observations || outcome.firstThreshold !== "UPSIDE" || outcome.firstUpsideHours === null) return [];
    if (stage !== null && num(row.leadStage) !== null && Math.abs(stage - num(row.leadStage)) > 1) return [];
    if (divergenceState === "PRE_CONSENSUS_DIVERGENCE" && row.divergenceState === "ATTENTION_CROWDED") return [];
    return [{ ...row, firstUpsideHours: outcome.firstUpsideHours }];
  });
}

function stageTriggeredAt(history = [], stage = null) {
  if (stage === null) return null;
  return history.find((row) => num(row.leadStage) !== null && num(row.leadStage) >= stage)?.observedAt || null;
}

export function analyzeEdgeHalfLife(project = {}, lab = {}, options = {}) {
  const history = Array.isArray(options.history) ? options.history : [];
  const stage = num(project.threeClockLeadStage ?? project.threeClockEdge?.leadSequence?.stage);
  const analogs = matchingSuccessfulAnalogs(project, lab, options);
  if (analogs.length < 8) {
    return {
      ...project,
      edgeHalfLife: {
        state: "INSUFFICIENT_SAMPLE",
        successfulAnalogCount: analogs.length,
        halfLifeHours: null,
        remainingInformationFraction: null,
        shadowOnly: true,
      },
      edgeHalfLifeHours: null,
    };
  }

  const times = analogs.map((row) => row.firstUpsideHours);
  const halfLifeHours = median(times);
  const q25 = quantile(times, 0.25);
  const q75 = quantile(times, 0.75);
  const triggerAt = stageTriggeredAt(history, stage);
  const elapsed = triggerAt ? Math.max(0, hoursBetween(triggerAt, new Date().toISOString()) || 0) : null;
  const remaining = halfLifeHours && elapsed !== null
    ? Math.pow(0.5, elapsed / Math.max(halfLifeHours, 0.01))
    : null;
  const state = remaining === null
    ? "EMPIRICAL_HALF_LIFE_READY"
    : remaining <= 0.25
      ? "EDGE_MOSTLY_DECAYED"
      : remaining <= 0.5
        ? "EDGE_DECAYING"
        : "EDGE_FRESH";

  return {
    ...project,
    edgeHalfLife: {
      state,
      successfulAnalogCount: analogs.length,
      halfLifeHours: Number(halfLifeHours.toFixed(2)),
      q25Hours: q25 === null ? null : Number(q25.toFixed(2)),
      q75Hours: q75 === null ? null : Number(q75.toFixed(2)),
      stageTriggeredAt: triggerAt,
      elapsedHours: elapsed === null ? null : Number(elapsed.toFixed(2)),
      remainingInformationFraction: remaining === null ? null : Number(remaining.toFixed(3)),
      definition: "Empirical half-life proxy: the median observed time for successful historical analogs to reach the +25% threshold. Decay fraction is a heuristic built from that empirical median.",
      shadowOnly: true,
    },
    edgeHalfLifeHours: Number(halfLifeHours.toFixed(2)),
  };
}
