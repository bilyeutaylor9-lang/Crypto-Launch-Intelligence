import {
  recoveryDispositionForField,
  sourcesForField,
  sourceFamilyForField,
} from "./enrichmentSourceRegistry.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

const MINIMUM_COST = 0.25;
const SAFETY_FIELDS = new Set(["honeypotDetected", "sellRestricted", "contractVerified", "mintAuthorityEnabled", "blacklistEnabled"]);
const CORE_FIELDS = new Set(["tokenAddress", "poolAddress", "chain", "liquidityUsd", "stableExitLiquidityUsd", "circulatingMarketCapUsd", "uniqueBuyers24h", "purchaseRouteConfirmed", "sellRouteAvailable"]);

export function estimateValueOfInformation(item = {}) {
  const field = item.canonicalField || item.field || "";
  const decisionImportance = SAFETY_FIELDS.has(field) ? 1 : CORE_FIELDS.has(field) ? 0.86 : 0.55;
  const currentUncertainty = item.rootCause === "CONFLICTED_DATA" ? 0.95 : item.rootCause === "STALE_DATA" ? 0.55 : 0.8;
  const recoverability = item.recoverable === false ? 0 : item.rootCause === "UNSUPPORTED_CHAIN" ? 0.1 : 0.75;
  const sourceAuthority = Math.max(0.35, num(item.sourceAuthority || 65) / 100);
  const expectedRankChange = SAFETY_FIELDS.has(field) ? 1 : CORE_FIELDS.has(field) ? 0.8 : 0.35;
  const safetyImportance = SAFETY_FIELDS.has(field) ? 1.4 : 1;
  const sourceCost = Math.max(MINIMUM_COST, num(item.estimatedRecoveryCost || 1));

  return Number(((decisionImportance * currentUncertainty * recoverability * sourceAuthority * expectedRankChange * safetyImportance) / sourceCost).toFixed(4));
}

export function routeMissingEvidence(item = {}, options = {}) {
  const field = item.canonicalField || item.field || "";
  const family = sourceFamilyForField(field);
  const recoveryDisposition = recoveryDispositionForField(field, {
    applicability: item.applicability,
  });
  const sources = sourcesForField(field)
    .filter((source) => options.freeOnly === false || source.free !== false)
    .map((source) => ({
      ...source,
      evidenceFamily: family,
      valueOfInformation: estimateValueOfInformation({
        ...item,
        sourceAuthority: source.authority,
        estimatedRecoveryCost: source.cost,
      }),
    }))
    .sort((a, b) => b.valueOfInformation - a.valueOfInformation || b.authority - a.authority);

  return {
    field,
    evidenceFamily: family,
    targetSources: sources.slice(0, options.maxSources || 4),
    estimatedRequests: Math.min(sources.length, options.maxSources || 4),
    estimatedTimeMs: sources.slice(0, options.maxSources || 4).reduce((sum, source) => sum + num(source.latencyMs), 0),
    recoveryDisposition,
    recoverable:
      recoveryDisposition === "RAW_RECOVERABLE" &&
      sources.length > 0 &&
      item.recoverable !== false,
    recomputeAfterRecovery: recoveryDisposition === "DERIVED_RECOMPUTE",
    routingStatus:
      recoveryDisposition === "DERIVED_RECOMPUTE"
        ? "RECOMPUTE_DERIVED_OUTPUT"
        : recoveryDisposition === "NOT_APPLICABLE"
          ? "NOT_APPLICABLE"
        : sources.length
          ? "PROVIDER_ROUTE_AVAILABLE"
          : "NO_CAPABLE_PROVIDER_REGISTERED",
  };
}

export function buildTargetedEnrichmentPlan(missingEvidence = [], options = {}) {
  const routed = (Array.isArray(missingEvidence) ? missingEvidence : [])
    .map((item) => ({
      ...item,
      ...routeMissingEvidence(item, options),
      valueOfInformationScore: estimateValueOfInformation(item),
    }))
    .sort((a, b) => b.valueOfInformationScore - a.valueOfInformationScore);

  return {
    status: routed.length ? "TARGETED_RECOVERY_AVAILABLE" : "NO_RECOVERABLE_GAPS",
    items: routed,
    nextSources: [...new Set(routed.flatMap((item) => item.targetSources.map((source) => source.source)))].slice(0, 12),
    estimatedRequests: routed.reduce((sum, item) => sum + num(item.estimatedRequests), 0),
    estimatedTimeMs: routed.reduce((sum, item) => sum + num(item.estimatedTimeMs), 0),
  };
}
