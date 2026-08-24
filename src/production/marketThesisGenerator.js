import { clamp, finite, strictIdentityKey } from "./productionMath.js";

export function generateMarketThesis(context = {}, candidates = [], options = {}) {
  const liquidity = context.liquidityWeather || {};
  const destinations = context.capitalDestination || {};
  const shock = context.marketShock || {};
  const crossMarket = context.crossMarket || {};

  const candidateRows = Array.isArray(candidates) ? candidates : [];
  const exactCandidates = candidateRows.filter((row) => strictIdentityKey(row));
  const ranked = exactCandidates
    .map((row) => {
      const utility = finite(row.utilityScore ?? row.decisionUtilityScore) ?? 50;
      const destination = finite(row.capitalDestinationScore ?? row.destinationScore) ?? 50;
      const transition = finite(row.ignitionProbabilityPct ?? row.transitionIgnitionPct) ?? 35;
      const uncertainty = finite(row.totalUncertaintyPct) ?? 50;
      const score = clamp(
        utility * 0.35 + destination * 0.30 + transition * 0.25 + (100 - uncertainty) * 0.10,
        0, 100
      );
      return { ...row, thesisFitScore: score };
    })
    .sort((a, b) => b.thesisFitScore - a.thesisFitScore);

  const topRoute = destinations.routes?.[0] || null;
  const topFactors = (crossMarket.factors || []).slice(0, 3);
  const liquidityState = liquidity.state || "UNKNOWN";
  const shockState = shock.state || shock.transitionState || "NONE";

  const evidenceCount =
    (topRoute ? 1 : 0) +
    topFactors.filter((factor) => Number(factor.samples || 0) >= 8 && Number(factor.relevanceScore || 0) > 0).length +
    (exactCandidates.length ? 1 : 0);
  const confidence = clamp(
    15 +
    (liquidity.expansionProbability ?? 0.5) * 15 +
    (topRoute?.confidencePct ?? 0) * 0.35 +
    Math.min(15, evidenceCount * 5) -
    (shockState === "HIGH_RISK" || shockState === "REGIME_TRANSITION_WARNING" ? 20 : 0),
    0, 100
  );
  const evidenceState = evidenceCount >= 3
    ? "THESIS_EVIDENCE_AVAILABLE"
    : evidenceCount >= 1
      ? "THESIS_EVIDENCE_DEVELOPING"
      : "INSUFFICIENT_THESIS_EVIDENCE";

  return {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    state: evidenceState,
    thesis: {
      headline: topRoute
        ? `Capital is most likely rotating toward ${topRoute.chain || "the leading chain"}${topRoute.narrative ? ` / ${topRoute.narrative}` : ""} while liquidity is ${liquidityState}.`
        : `Liquidity is ${liquidityState}; no high-confidence capital destination is verified yet.`,
      confidencePct: confidence,
      opportunityWindowHours: confidence >= 70 ? [2, 12] : confidence >= 55 ? [4, 24] : [6, 48],
      supportingEvidence: [
        `Liquidity weather: ${liquidityState}`,
        ...(topRoute ? [`Top capital route confidence: ${topRoute.confidencePct}%`] : []),
        ...topFactors.map((f) => `${f.field}: relevance ${Math.round(f.relevanceScore)} (${f.direction})`),
      ],
      primaryInvalidation: context.primaryInvalidation || "Capital route reverses or liquidity regime deteriorates materially.",
    },
    bestFittingCandidates: ranked.slice(0, Number(options.topN || 10)),
    rejectedCandidates: candidateRows.length - exactCandidates.length,
    policy: {
      marketLevelThesisFirst: true,
      evidenceLinked: true,
      exactIdentityRequired: true,
      automaticTrading: false,
      unverifiedClaimsProhibited: true,
    },
  };
}
