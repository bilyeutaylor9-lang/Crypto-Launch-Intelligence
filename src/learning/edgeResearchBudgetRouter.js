function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function logScale(value, reference) {
  const numeric = Math.max(0, finite(value) ?? 0);
  return clamp(Math.log10(1 + numeric) / Math.log10(1 + reference));
}

function statMap(registry = {}) {
  return new Map(
    (Array.isArray(registry.signals) ? registry.signals : [])
      .map((row) => [row.signal, row])
  );
}

export function scoreResearchCandidate(candidate = {}, signalKeys = [], registry = {}, options = {}) {
  const stats = statMap(registry);
  const matched = signalKeys
    .map((key) => stats.get(key))
    .filter(Boolean);

  const verified = matched.filter((row) => row.rankingEligible === true);
  const evidenceEdge = verified.length
    ? verified.reduce((sum, row) => sum + Number(row.wilsonLowerBound || 0), 0) /
      verified.length
    : 0;

  const uncertaintyBonus = matched.length
    ? matched.reduce((sum, row) => {
        const samples = Math.max(0, Number(row.decided || row.samples || 0));
        const posterior = clamp(Number(row.posteriorHitRate || 0.5));
        return sum + Math.sqrt((posterior * (1 - posterior)) / (samples + 4));
      }, 0) / matched.length
    : 0.25;

  const liquidity = finite(candidate.liquidityUsd ?? candidate.activeLiquidityUsd) ?? 0;
  const volume = finite(candidate.volume24h ?? candidate.volume24hUsd) ?? 0;
  const marketCap = finite(candidate.marketCap ?? candidate.marketCapUsd) ?? 0;
  const evidenceCoverage = finite(
    candidate.ignitionTwin?.evidenceCoveragePct ?? candidate.evidenceCoveragePct
  ) ?? 0;

  const liquidityQuality = logScale(liquidity, 5_000_000);
  const volumeQuality = logScale(volume, 20_000_000);
  const turnover = liquidity > 0 ? clamp(volume / liquidity / 10) : 0;
  const smallCapOptionality =
    marketCap > 0 ? 1 - logScale(marketCap, 500_000_000) : 0.35;
  const coverage = clamp(evidenceCoverage / 100);

  const starvationPenalty =
    liquidity < Number(options.minimumLiquidityUsd || 25_000) ? 0.35 : 0;
  const unknownIdentityPenalty =
    !candidate.chain || !candidate.tokenAddress || !candidate.poolAddress ? 0.5 : 0;

  const score01 = clamp(
    0.32 * evidenceEdge +
    0.16 * uncertaintyBonus +
    0.14 * liquidityQuality +
    0.12 * volumeQuality +
    0.10 * turnover +
    0.08 * smallCapOptionality +
    0.08 * coverage -
    starvationPenalty -
    unknownIdentityPenalty
  );

  return {
    researchPriorityScore: Number((score01 * 100).toFixed(2)),
    evidenceEdge: Number(evidenceEdge.toFixed(4)),
    uncertaintyBonus: Number(uncertaintyBonus.toFixed(4)),
    verifiedSignals: verified.map((row) => row.signal),
    matchedSignals: matched.map((row) => row.signal),
    diagnostic: {
      liquidityQuality,
      volumeQuality,
      turnover,
      smallCapOptionality,
      coverage,
      starvationPenalty,
      unknownIdentityPenalty,
    },
  };
}

export function rankResearchCandidates(
  candidates = [],
  registry = {},
  extractSignals,
  options = {}
) {
  if (typeof extractSignals !== "function") {
    throw new TypeError("extractSignals must be a function");
  }

  return (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => ({
      candidate,
      signals: extractSignals(candidate),
    }))
    .map(({ candidate, signals }) => ({
      ...candidate,
      research: scoreResearchCandidate(candidate, signals, registry, options),
    }))
    .sort((a, b) =>
      b.research.researchPriorityScore - a.research.researchPriorityScore
    )
    .slice(0, Math.max(1, Number(options.limit || 100)));
}
