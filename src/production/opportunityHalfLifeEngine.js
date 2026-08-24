import { clamp, finite, mean, median, timestamp } from "./productionMath.js";

function score(row = {}) {
  return finite(
    row.combinedResearchScore ??
    row.portfolioResearchScore ??
    row.multiscaleGenomeScore ??
    row.genomeResearchScore ??
    row.pipelineScore
  );
}

function priceMove(row = {}) {
  return finite(row.priceChange24hPct ?? row.marketData?.priceChange24hPct ?? row.frozenFeatures?.priceChange24hPct);
}

export function estimateEmpiricalHalfLife(history = [], options = {}) {
  const rows = (Array.isArray(history) ? history : [])
    .map((row) => ({ at: timestamp(row.observedAt || row.generatedAt || row.timestamp), score: score(row) }))
    .filter((row) => row.at !== null && row.score !== null)
    .sort((a, b) => a.at - b.at);
  if (rows.length < 3) return null;
  const peak = rows.reduce((best, row) => row.score > best.score ? row : best, rows[0]);
  const after = rows.filter((row) => row.at >= peak.at && row.score <= peak.score * 0.5);
  if (after.length) return (after[0].at - peak.at) / 3_600_000;

  const decays = [];
  for (let i = 1; i < rows.length; i += 1) {
    const left = rows[i - 1]; const right = rows[i];
    if (right.score >= left.score || left.score <= 0 || right.score <= 0) continue;
    const hours = (right.at - left.at) / 3_600_000;
    const ratio = right.score / left.score;
    const lambda = -Math.log(ratio) / Math.max(1e-6, hours);
    if (lambda > 0) decays.push(Math.log(2) / lambda);
  }
  return median(decays);
}

export function estimateOpportunityHalfLife(candidate = {}, history = [], options = {}) {
  const nowMs = timestamp(options.now || new Date().toISOString());
  const candidateHistory = (Array.isArray(history) ? history : []).filter((row) =>
    (row.identityKey && candidate.identityKey && row.identityKey === candidate.identityKey) ||
    (row.tokenAddress && candidate.tokenAddress && row.tokenAddress === candidate.tokenAddress)
  );
  const empirical = estimateEmpiricalHalfLife(candidateHistory, options);
  const fallback = Math.max(0.5, Number(options.defaultHalfLifeHours || 6));
  const halfLifeHours = empirical && empirical > 0 ? empirical : fallback;
  const firstSeen = candidateHistory
    .map((row) => timestamp(row.observedAt || row.generatedAt || row.timestamp))
    .filter((v) => v !== null)
    .sort((a,b)=>a-b)[0] ?? timestamp(candidate.firstSeenAt || candidate.discoveredAt || candidate.generatedAt);
  const ageHours = firstSeen !== null && nowMs !== null ? Math.max(0, (nowMs - firstSeen) / 3_600_000) : 0;
  const consumed = clamp(1 - Math.pow(0.5, ageHours / Math.max(0.01, halfLifeHours)));
  const move = Math.abs(priceMove(candidate) ?? 0);
  const lateChase = clamp(consumed * 0.60 + clamp(move / Number(options.lateMovePct || 80)) * 0.40);
  const remaining = 1 - consumed;
  const urgency = clamp(remaining * (1 - lateChase) + 0.2 * clamp((finite(candidate.convergence?.convergenceStrengthPct) ?? 0) / 100));

  return {
    halfLifeHours: Number(halfLifeHours.toFixed(2)),
    halfLifeSource: empirical ? "EMPIRICAL_SCORE_DECAY" : "DEFAULT_PRIOR",
    opportunityAgeHours: Number(ageHours.toFixed(2)),
    opportunityConsumedPct: Number((consumed * 100).toFixed(2)),
    remainingAsymmetryPct: Number((remaining * 100).toFixed(2)),
    lateChaseProbabilityPct: Number((lateChase * 100).toFixed(2)),
    researchUrgencyScore: Number((urgency * 100).toFixed(2)),
    state: lateChase >= 0.72 ? "LATE_EDGE_MOSTLY_CONSUMED" : consumed >= 0.55 ? "EDGE_DECAYING" : consumed >= 0.25 ? "EDGE_MATURING" : "EARLY_OPPORTUNITY",
    policy: { noEntryTimingGuarantee: true, automaticTrading: false },
  };
}
