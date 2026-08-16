import { clamp, num, wilsonInterval } from "../edge/edgeMath.js";

const HORIZONS = [6, 24, 72, 168];

function analogRecords(project = {}, lab = {}, options = {}) {
  const stage = num(project.threeClockLeadStage ?? project.threeClockEdge?.leadSequence?.stage);
  const divergence = num(project.threeClockDivergenceScore ?? project.threeClockEdge?.divergence?.score);
  const state = project.threeClockDivergenceState ?? project.threeClockEdge?.divergence?.state ?? null;
  const maxScoreDistance = Number(options.maxScoreDistance ?? 18);
  return (lab.records || []).filter((row) => {
    const rowStage = num(row.leadStage);
    const rowDivergence = num(row.divergenceScore);
    if (stage !== null && rowStage !== null && Math.abs(stage - rowStage) > 1) return false;
    if (divergence !== null && rowDivergence !== null && Math.abs(divergence - rowDivergence) > maxScoreDistance) return false;
    if (state && row.divergenceState && state === "PRE_CONSENSUS_DIVERGENCE" && row.divergenceState === "ATTENTION_CROWDED") return false;
    if (num(row.fakeMomentumRiskScore) !== null && num(row.fakeMomentumRiskScore) >= 70) return false;
    return true;
  });
}

function horizonStats(analogs = [], horizonHours = 24) {
  const resolved = analogs.flatMap((row) => {
    const outcome = row.outcomes?.[String(horizonHours)];
    return outcome?.observations ? [outcome] : [];
  });
  const upsideFirst = resolved.filter((outcome) => outcome.firstThreshold === "UPSIDE").length;
  const downsideFirst = resolved.filter((outcome) => outcome.firstThreshold === "DOWNSIDE").length;
  const probability = resolved.length ? upsideFirst / resolved.length : null;
  const interval = wilsonInterval(upsideFirst, resolved.length);
  return {
    horizonHours,
    sampleSize: resolved.length,
    upsideFirst,
    downsideFirst,
    probability: probability === null ? null : Number(probability.toFixed(4)),
    probabilityPct: probability === null ? null : Math.round(probability * 100),
    intervalLowPct: interval.low === null ? null : Math.round(interval.low * 100),
    intervalHighPct: interval.high === null ? null : Math.round(interval.high * 100),
  };
}

export function analyzeBreakoutHazard(project = {}, lab = {}, options = {}) {
  const analogs = analogRecords(project, lab, options);
  const horizons = Object.fromEntries(HORIZONS.map((hours) => [`${hours}h`, horizonStats(analogs, hours)]));
  const anchor = horizons["24h"];
  const minSample = Number(options.minimumSample ?? 12);
  const state = anchor.sampleSize < minSample
    ? "INSUFFICIENT_SAMPLE"
    : anchor.probabilityPct >= 60
      ? "ELEVATED_24H_UPSIDE_HAZARD"
      : anchor.probabilityPct >= 40
        ? "DEVELOPING_24H_UPSIDE_HAZARD"
        : "LOW_24H_UPSIDE_HAZARD";

  return {
    ...project,
    breakoutHazard: {
      state,
      analogCount: analogs.length,
      horizons,
      definition: "Empirical probability that the +25% observed threshold is reached before the -15% observed threshold within each horizon among historical analogs.",
      continuousCoverageAssumed: false,
      shadowOnly: true,
      rankingInfluence: false,
    },
    breakoutHazardState: state,
    breakoutHazard24hPct: anchor.probabilityPct ?? 0,
    breakoutHazard72hPct: horizons["72h"].probabilityPct ?? 0,
  };
}

export function analyzeBreakoutHazardBatch(projects = [], lab = {}, options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => analyzeBreakoutHazard(project, lab, options));
}
