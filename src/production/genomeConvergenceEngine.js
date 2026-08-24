import { clamp, identityKey, mean, timestamp } from "./productionMath.js";

function linearSlope(points = []) {
  if (points.length < 2) return null;
  const x0 = points[0].at;
  const xs = points.map((p) => (p.at - x0) / 3_600_000);
  const ys = points.map((p) => p.score);
  const mx = mean(xs);
  const my = mean(ys);
  if (mx === null || my === null) return null;
  const numerator = xs.reduce((sum, x, i) => sum + (x - mx) * (ys[i] - my), 0);
  const denominator = xs.reduce((sum, x) => sum + (x - mx) ** 2, 0);
  return denominator ? numerator / denominator : null;
}

export function buildGenomeConvergence(current = {}, history = [], options = {}) {
  const key = identityKey(current);
  const lookbackHours = Math.max(1, Number(options.lookbackHours || 12));
  const now = timestamp(options.now || current.generatedAt || new Date().toISOString());
  const earliest = now === null ? null : now - lookbackHours * 3_600_000;

  const points = (Array.isArray(history) ? history : [])
    .filter((row) => identityKey(row) === key)
    .map((row) => ({
      at: timestamp(row.observedAt || row.generatedAt),
      score: Number(row.multiscaleGenomeScore ?? row.genomeResearchScore ?? 0),
      failure: Number(row.failureProbabilityPct ?? 0),
    }))
    .filter((row) => row.at !== null && (earliest === null || row.at >= earliest) && row.at <= now)
    .sort((a, b) => a.at - b.at);

  const currentScore = Number(current.multiscaleGenomeScore ?? current.genomeResearchScore ?? 0);
  if (!points.length || points.at(-1).at < now) {
    points.push({ at: now, score: currentScore, failure: Number(current.failureProbabilityPct || 0) });
  }

  const scoreSlope = linearSlope(points);
  const recent = points.slice(-3);
  const older = points.slice(0, Math.max(2, points.length - 2));
  const recentSlope = linearSlope(recent);
  const baselineSlope = linearSlope(older);
  const acceleration =
    recentSlope !== null && baselineSlope !== null ? recentSlope - baselineSlope : null;

  const failureSlope = linearSlope(points.map((p) => ({ at: p.at, score: p.failure })));
  const convergenceStrength = clamp(
    (Math.max(0, scoreSlope || 0) / 15) * 0.55 +
    (Math.max(0, acceleration || 0) / 20) * 0.25 +
    (Math.max(0, -(failureSlope || 0)) / 10) * 0.20
  );

  let state = "STABLE";
  if (points.length < 3) state = "INSUFFICIENT_HISTORY";
  else if ((scoreSlope || 0) >= 10 && (acceleration || 0) >= 2) state = "RAPID_GENOME_CONVERGENCE";
  else if ((scoreSlope || 0) >= 4) state = "GENOME_CONVERGING";
  else if ((scoreSlope || 0) <= -5) state = "GENOME_DIVERGING";

  return {
    identityKey: key,
    state,
    observations: points.length,
    currentScore,
    scoreVelocityPerHour: scoreSlope === null ? null : Number(scoreSlope.toFixed(3)),
    scoreAccelerationPerHour2: acceleration === null ? null : Number(acceleration.toFixed(3)),
    failureProbabilityVelocityPerHour:
      failureSlope === null ? null : Number(failureSlope.toFixed(3)),
    convergenceStrength: Number(convergenceStrength.toFixed(4)),
    convergenceStrengthPct: Number((convergenceStrength * 100).toFixed(2)),
    points,
  };
}

export function rankGenomeConvergence(currentRows = [], historicalSnapshots = [], options = {}) {
  return (Array.isArray(currentRows) ? currentRows : [])
    .map((row) => ({
      ...row,
      convergence: buildGenomeConvergence(row, historicalSnapshots, options),
    }))
    .sort((a, b) =>
      b.convergence.convergenceStrength - a.convergence.convergenceStrength ||
      Number(b.multiscaleGenomeScore || 0) - Number(a.multiscaleGenomeScore || 0)
    );
}
