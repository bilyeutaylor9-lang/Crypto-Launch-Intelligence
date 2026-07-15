export const BLOCKING_TERMS = [
  "defensive avoid",
  "identity risk",
  "risk-heavy",
  "negative skew",
  "block",
  "blocked",
  "reject",
  "rejected",
  "avoid",
  "unavailable",
  "unverified",
  "conflicted",
  "conflict",
  "failed",
  "unsafe",
  "honeypot",
  "scam",
  "rug",
];

export const VERDICT_FIELDS = [
  "aiDecision",
  "allocationBucket",
  "smallCapHunterVerdict",
  "proofVerdict",
  "contractVerdict",
  "executionVerdict",
  "proofOfAlphaExecutionTwinVerdict",
  "organicDemandVerdict",
  "identityVerdict",
  "projectIdentityVerdict",
  "routeVerdict",
  "riskVerdict",
  "redTeamVerdict",
  "trapVerdict",
  "sourceTruthVerdict",
  "discoveryDecisionVerdict",
  "instantSafetyVerdict",
  "alphaEvolutionGovernorVerdict",
  "causalMarketTwinVerdict",
  "autonomousResearchVerdict",
  "selfEvolvingAlphaOSDecision",
  "dossierSwarmDecision",
  "simulationDecision",
  "adversarialSimulationStatus",
];

const NESTED_VERDICT_PATHS = [
  ["redTeamReview", "status"],
  ["adversarialSimulationReview", "status"],
  ["smallCapHunter", "purchaseRoute", "status"],
  ["proofOfAlphaExecutionTwin", "route", "status"],
  ["proofOfAlphaExecutionTwin", "quote", "blocker"],
  ["proofOfAlphaExecutionTwin", "safety", "blockers"],
  ["strongBuyEvidenceGate", "blockers"],
  ["alphaEvolutionGovernor", "blockers"],
  ["economicIntegrityBlockers"],
];

export function normalizeDecisionText(value = "") {
  return String(value ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function valueAtPath(source = {}, path = []) {
  return path.reduce((value, key) => (value == null ? undefined : value[key]), source);
}

function flattenValues(value) {
  if (Array.isArray(value)) return value.flatMap(flattenValues);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(flattenValues);
  }
  if (value == null || value === "") return [];
  return [value];
}

function blockingTermsFor(value = "") {
  const text = normalizeDecisionText(value);
  if (!text) return [];

  return BLOCKING_TERMS.filter((term) => text.includes(normalizeDecisionText(term)));
}

export function inspectBlockingVerdicts(project = {}, options = {}) {
  const verdictFields = options.verdictFields || VERDICT_FIELDS;
  const nestedPaths = options.nestedPaths || NESTED_VERDICT_PATHS;
  const matches = [];

  for (const field of verdictFields) {
    for (const value of flattenValues(project[field])) {
      const terms = blockingTermsFor(value);
      if (terms.length) {
        matches.push({
          field,
          value: String(value),
          terms,
          reason: `${field}: ${String(value)}`,
        });
      }
    }
  }

  for (const path of nestedPaths) {
    const field = path.join(".");
    for (const value of flattenValues(valueAtPath(project, path))) {
      const terms = blockingTermsFor(value);
      if (terms.length) {
        matches.push({
          field,
          value: String(value),
          terms,
          reason: `${field}: ${String(value)}`,
        });
      }
    }
  }

  const seen = new Set();
  const uniqueMatches = matches.filter((match) => {
    const key = `${match.field}:${normalizeDecisionText(match.value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    hasBlockingVerdict: uniqueMatches.length > 0,
    blockingVerdictMatches: uniqueMatches,
    blockingVerdictReasons: uniqueMatches.map((match) => match.reason),
  };
}

export function hasBlockingVerdict(project = {}, options = {}) {
  return inspectBlockingVerdicts(project, options).hasBlockingVerdict;
}
