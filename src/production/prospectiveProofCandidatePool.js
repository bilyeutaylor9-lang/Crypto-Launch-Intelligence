import { finite, strictIdentity, timestamp } from "./productionMath.js";

/**
 * This pool is intentionally narrower than the discovery universe and broader
 * than the live qualification queue.  It identifies observations that are
 * admissible for prospective research before any outcome or quote is known.
 */
export const PROSPECTIVE_PROOF_CANDIDATE_STATE = Object.freeze({
  SIGNAL_ELIGIBLE: "SIGNAL_ELIGIBLE",
  SIGNAL_RESEARCH_ONLY: "SIGNAL_RESEARCH_ONLY",
  SIGNAL_HARD_REJECTED: "SIGNAL_HARD_REJECTED",
});

function firstFinite(...values) {
  for (const value of values) {
    const parsed = finite(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function values(value) {
  return Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
}

function deterministicHardBlock(row = {}) {
  const reasons = [
    ...values(row.finalBlockingReasons),
    ...values(row.deterministicCandidateBlocks),
    ...values(row.hardBlockers),
    ...values(row.opportunityHardBlockers),
  ].map(String).join(" | ");
  return Boolean(
    row.identityConflict === true ||
    row.chainMismatch === true ||
    row.contractChainMismatch === true ||
    row.canonicalIdentityHardBlock === true ||
    row.honeypotDetected === true ||
    row.verifiedScam === true ||
    row.scamDetected === true ||
    row.sellRestricted === true ||
    /identity conflict|contract mismatch|chain mismatch|honeypot|verified scam|sell restriction|cannot sell/i.test(reasons)
  );
}

/** Only scores available before the prospective decision can be considered. */
export function prospectiveResearchScore(row = {}) {
  return firstFinite(
    row.portfolioResearchScore,
    row.combinedResearchScore,
    row.researchPriorityScore,
    row.adaptiveResearchScore,
    row.informationGain?.informationGainScore,
  );
}

export function prospectiveComparableFeatureCount(row = {}, asOf = null) {
  const asOfMs = timestamp(asOf);
  const launchedMs = timestamp(row.pairCreatedAt || row.poolCreatedAt || row.launchedAt);
  const fields = [
    firstFinite(row.marketCapUsd, row.marketCap, row.circulatingMarketCapUsd),
    firstFinite(row.liquidityUsd, row.activeLiquidityUsd),
    firstFinite(row.volume24hUsd, row.volume24h, row.dexVolume24hUsd),
    firstFinite(row.evidenceCoveragePct, row.evidenceCoverageScore, row.dataConfidence),
    firstFinite(row.riskScore, row.riskScorePct, row.trapRiskScore),
    firstFinite(row.priceChange24hPct, row.priceChange?.h24),
    firstFinite(
      row.ageHours,
      row.tokenAgeHours,
      asOfMs !== null && launchedMs !== null && launchedMs <= asOfMs
        ? (asOfMs - launchedMs) / 3_600_000
        : null,
    ),
  ];
  if (row.narrative || row.primaryNarrative || row.category) fields.push(1);
  if (row.sector || row.projectSector) fields.push(1);
  return fields.filter((value) => value !== null).length;
}

export function classifyProspectiveProofCandidate(row = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const identity = strictIdentity(row);
  const sourceObservedAt = row.sourceObservedAt || row.marketObservedAt || null;
  const sourceMs = timestamp(sourceObservedAt);
  const nowMs = timestamp(now);
  const maximumSourceAgeMinutes = Math.max(1, Number(options.maximumSourceAgeMinutes || 90));
  const minimumComparableFeatures = Math.max(1, Number(options.minimumComparableFeatures || 5));
  const priceUsd = firstFinite(row.priceUsd, row.price, row.marketData?.priceUsd);
  const score = prospectiveResearchScore(row);
  const comparableFeatures = prospectiveComparableFeatureCount(row, sourceObservedAt || now);
  const base = {
    identity,
    sourceObservedAt,
    priceUsd,
    score,
    comparableFeatures,
    executionProofEligibility: row.executionProofEligibility?.state || "RESEARCH_ONLY_EXECUTION_EVIDENCE_UNAVAILABLE",
  };

  // A pool-less token is not an exact route and cannot be used as either a
  // treatment or a control, even though generic identity utilities allow it.
  if (!identity || !identity.poolAddress) {
    return { ...base, state: PROSPECTIVE_PROOF_CANDIDATE_STATE.SIGNAL_HARD_REJECTED, reason: "INEXACT_CHAIN_TOKEN_POOL_IDENTITY" };
  }
  if (deterministicHardBlock(row)) {
    return { ...base, state: PROSPECTIVE_PROOF_CANDIDATE_STATE.SIGNAL_HARD_REJECTED, reason: "DETERMINISTIC_SAFETY_OR_IDENTITY_BLOCK" };
  }
  if (!(priceUsd > 0)) {
    return { ...base, state: PROSPECTIVE_PROOF_CANDIDATE_STATE.SIGNAL_RESEARCH_ONLY, reason: "MISSING_OR_INVALID_PRICE" };
  }
  if (sourceMs === null || nowMs === null) {
    return { ...base, state: PROSPECTIVE_PROOF_CANDIDATE_STATE.SIGNAL_RESEARCH_ONLY, reason: "MISSING_POINT_IN_TIME_SOURCE" };
  }
  if (sourceMs > nowMs) {
    return { ...base, state: PROSPECTIVE_PROOF_CANDIDATE_STATE.SIGNAL_RESEARCH_ONLY, reason: "FUTURE_POINT_IN_TIME_SOURCE" };
  }
  const sourceAgeMinutes = (nowMs - sourceMs) / 60_000;
  if (sourceAgeMinutes > maximumSourceAgeMinutes) {
    return { ...base, sourceAgeMinutes, state: PROSPECTIVE_PROOF_CANDIDATE_STATE.SIGNAL_RESEARCH_ONLY, reason: "STALE_POINT_IN_TIME_SOURCE" };
  }
  if (comparableFeatures < minimumComparableFeatures) {
    return { ...base, sourceAgeMinutes, state: PROSPECTIVE_PROOF_CANDIDATE_STATE.SIGNAL_RESEARCH_ONLY, reason: "INSUFFICIENT_COMPARABLE_FEATURES" };
  }
  if (score === null) {
    return { ...base, sourceAgeMinutes, state: PROSPECTIVE_PROOF_CANDIDATE_STATE.SIGNAL_RESEARCH_ONLY, reason: "MISSING_PRE_OUTCOME_RESEARCH_SCORE" };
  }
  return { ...base, sourceAgeMinutes, state: PROSPECTIVE_PROOF_CANDIDATE_STATE.SIGNAL_ELIGIBLE, reason: null };
}

function increment(counts, key) {
  counts[key] = (counts[key] || 0) + 1;
}

export function buildProspectiveProofCandidatePool(rows = [], options = {}) {
  const classifications = (Array.isArray(rows) ? rows : []).map((row) => ({
    row,
    classification: classifyProspectiveProofCandidate(row, options),
  }));
  const countsByState = {};
  const countsByReason = {};
  for (const entry of classifications) {
    increment(countsByState, entry.classification.state);
    if (entry.classification.reason) increment(countsByReason, entry.classification.reason);
  }
  const eligible = classifications
    .filter((entry) => entry.classification.state === PROSPECTIVE_PROOF_CANDIDATE_STATE.SIGNAL_ELIGIBLE)
    .map((entry) => ({ ...entry.row, prospectiveProofCandidate: entry.classification }));
  return {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    state: eligible.length ? "PROSPECTIVE_SIGNAL_POOL_READY" : "NO_SIGNAL_ELIGIBLE_CANDIDATES",
    candidatesAttempted: classifications.length,
    eligible,
    classifications,
    audit: {
      countsByState,
      countsByReason,
      automaticTrading: false,
      automaticPromotion: false,
      quoteAvailabilityInfluencesSelection: false,
      outcomeFieldsReadDuringSelection: false,
    },
  };
}

export const __prospectiveProofCandidatePoolHooks = { deterministicHardBlock, firstFinite };
