import {
  attachCandidateTruthState,
  deterministicCandidateBlocks,
} from "../kernel/candidateTruthState.js";

const RESEARCH_FAMILIES = {
  asymmetry: {
    weight: 0.2,
    paths: [
      "earlyAsymmetryResearchPriorityScore",
      "highUpsideScalpScore",
      "preBreakoutRadarScore",
      "preConsensusBreakoutScore",
      "sevenDayTenXScore",
    ],
  },
  utility: {
    weight: 0.14,
    paths: ["utilityQualityScore", "realUtilityScore", "ecosystemIntegrationScore", "tokenomicsScore"],
  },
  capitalFlow: {
    weight: 0.13,
    paths: ["capitalMigrationScore", "capitalFlowScore", "relativeCapitalFlowScore"],
  },
  buyerBreadth: {
    weight: 0.11,
    paths: ["buyerBreadthAccelerationScore", "organicBuyerScore", "organicDemandIntegrityScore"],
  },
  liquidityFormation: {
    weight: 0.1,
    paths: ["liquidityFormationScore", "liquidityExpansionScore", "activeLiquidityTruthScore"],
  },
  developerAcceleration: {
    weight: 0.09,
    paths: ["developerAccelerationScore", "developerActivityScore", "githubProScore"],
  },
  catalysts: {
    weight: 0.07,
    paths: ["catalystScore", "verifiedCatalystScore", "roadmapCatalystProfitScore"],
  },
  attentionGap: {
    weight: 0.06,
    paths: ["attentionGapV2Score", "attentionGapScore", "informationAdvantageScore"],
  },
  timing: {
    weight: 0.06,
    paths: ["preBreakoutSequenceScore", "quietAccumulationScore", "opportunityTimingScore"],
  },
  sourceDiversity: {
    weight: 0.04,
    paths: ["sourceTruthScore", "sourceReliabilityScore", "institutionalDataProvenanceScore"],
  },
};

const EXECUTION_COMPONENTS = {
  identity: 0.15,
  safety: 0.2,
  buyQuote: 0.11,
  sellQuote: 0.16,
  quoteFreshness: 0.09,
  depth: 0.1,
  slippage: 0.08,
  liquidity: 0.06,
  userAccess: 0.05,
};

function getPath(object = {}, path = "") {
  return String(path)
    .split(".")
    .reduce((value, key) => (value && Object.hasOwn(value, key) ? value[key] : undefined), object);
}

function explicitNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null;
}

function average(values = []) {
  const observed = values.filter((value) => value !== null);
  if (!observed.length) return null;
  return observed.reduce((sum, value) => sum + value, 0) / observed.length;
}

function round(value, digits = 2) {
  if (value === null || value === undefined || value === "") return null;
  if (!Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function sourceFamilies(project = {}) {
  const values = [
    ...(Array.isArray(project.independentEvidenceFamilies) ? project.independentEvidenceFamilies : []),
    ...(Array.isArray(project.opportunityEvidenceFamilies) ? project.opportunityEvidenceFamilies : []),
    ...(Array.isArray(project.evidenceFamilySummary?.confirmedFamilies)
      ? project.evidenceFamilySummary.confirmedFamilies
      : []),
  ];
  return [...new Set(values.filter(Boolean).map(String))];
}

function familyCoverage(project = {}, family = "", definition = {}) {
  const observedValues = {};
  const missingValues = [];
  for (const path of definition.paths) {
    const value = explicitNumber(getPath(project, path));
    if (value === null) {
      missingValues.push(path);
    } else {
      observedValues[path] = value;
    }
  }
  const values = Object.values(observedValues);
  return {
    family,
    weight: definition.weight,
    score: round(average(values)),
    observedComponentCount: values.length,
    expectedComponentCount: definition.paths.length,
    coveragePct: round((values.length / definition.paths.length) * 100),
    observedValues,
    missingValues,
  };
}

function researchDecision(project = {}) {
  const families = Object.fromEntries(
    Object.entries(RESEARCH_FAMILIES).map(([family, definition]) => [
      family,
      familyCoverage(project, family, definition),
    ])
  );
  const observed = Object.values(families).filter((family) => family.score !== null);
  const observedWeight = observed.reduce((sum, family) => sum + family.weight, 0);
  const rawScore = observedWeight
    ? observed.reduce((sum, family) => sum + family.score * family.weight, 0) / observedWeight
    : null;
  const observedCount = observed.length;
  const expectedCount = Object.keys(families).length;
  const coveragePct = expectedCount ? (observedCount / expectedCount) * 100 : 0;
  const confidenceMultiplier = 0.7 + (Math.min(100, coveragePct) / 100) * 0.3;
  const score = rawScore === null ? null : rawScore * confidenceMultiplier;

  return {
    score: round(score),
    rawScore: round(rawScore),
    coverage: {
      observedComponentCount: observedCount,
      expectedComponentCount: expectedCount,
      coveragePct: round(coveragePct),
      observedValues: Object.fromEntries(observed.map((family) => [family.family, family.score])),
      missingValues: Object.values(families)
        .filter((family) => family.score === null)
        .map((family) => family.family),
      sourceFamilies: sourceFamilies(project),
    },
    families,
  };
}

function liquidityObserved(project = {}) {
  const values = [
    project.stableExitLiquidityUsd,
    project.executableDepthUsd,
    project.orderBookDepthUsd,
    project.verifiedTradeSizeUsd,
    project.dexLiquidityUsd,
    project.liquidityUsd,
    project.candidateProofState?.globalRoute?.verifiedTradeSizeUsd,
  ]
    .map((value) => {
      if (value === undefined || value === null || value === "") return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    })
    .filter((value) => value !== null);
  return values.length ? Math.max(...values) : null;
}

function executionDecision(project = {}) {
  const proof = project.candidateProofState || {};
  const route = proof.globalRoute || {};
  const safety = proof.safety || {};
  const userAccess = proof.userAccess || {};
  const liquidity = liquidityObserved(project);
  const values = {
    identity:
      proof.identity?.status === "VERIFIED"
        ? 100
        : proof.identity?.status === "PARTIAL"
          ? 45
          : null,
    safety:
      safety.status === "VERIFIED_SAFE"
        ? 100
        : safety.status === "BLOCKED"
          ? 0
          : safety.status === "PARTIAL"
            ? 45
            : null,
    buyQuote: route.buyQuoteVerified === true ? 100 : null,
    sellQuote: route.sellQuoteVerified === true ? 100 : null,
    quoteFreshness:
      route.quoteFresh === true
        ? 100
        : route.quoteTimestamp && route.quoteFresh === false
          ? 0
          : null,
    depth:
      route.depthVerified === true
        ? 100
        : liquidity !== null && liquidity <= 0
          ? 0
          : null,
    slippage:
      route.slippageVerified === true
        ? 100
        : project.slippageIsHeuristic === true ||
            project.executionProofRecoveryRoute?.slippageIsHeuristic === true ||
            project.canonicalExecutionRoute?.slippageIsHeuristic === true
          ? 0
          : null,
    liquidity: liquidity === null ? null : liquidity > 0 ? 100 : 0,
    userAccess:
      userAccess.status === "CONFIRMED_AVAILABLE"
        ? 100
        : userAccess.status === "CONFIRMED_RESTRICTED"
          ? 0
          : null,
  };
  const observed = Object.entries(values).filter(([, value]) => value !== null);
  const observedWeight = observed.reduce((sum, [name]) => sum + EXECUTION_COMPONENTS[name], 0);
  const rawScore = observedWeight
    ? observed.reduce((sum, [name, value]) => sum + value * EXECUTION_COMPONENTS[name], 0) /
      observedWeight
    : null;
  const coveragePct = (observed.length / Object.keys(EXECUTION_COMPONENTS).length) * 100;
  const confidenceMultiplier = 0.4 + (Math.min(100, coveragePct) / 100) * 0.6;
  const score = rawScore === null ? null : rawScore * confidenceMultiplier;

  return {
    score: round(score),
    rawScore: round(rawScore),
    coverage: {
      observedComponentCount: observed.length,
      expectedComponentCount: Object.keys(EXECUTION_COMPONENTS).length,
      coveragePct: round(coveragePct),
      observedValues: Object.fromEntries(observed),
      missingValues: Object.keys(values).filter((name) => values[name] === null),
      sourceFamilies: [
        ...new Set([
          ...(proof.identity?.provenance || []),
          ...(safety.provenance || []),
          ...(route.provenance || []),
        ].filter(Boolean)),
      ],
    },
    components: values,
  };
}

export function analyzeCandidateDecisionScoring(project = {}) {
  const reconciled = attachCandidateTruthState(project);
  const research = researchDecision(reconciled);
  const execution = executionDecision(reconciled);
  const deterministicBlocks = deterministicCandidateBlocks(reconciled);
  const executionReview = ["EXECUTION_REVIEW", "READY"].includes(
    reconciled.executionReadinessState
  );
  const finalDecisionScore =
    executionReview &&
    deterministicBlocks.length === 0 &&
    research.score !== null &&
    execution.score !== null
      ? round(research.score * 0.55 + execution.score * 0.45)
      : null;

  return {
    ...reconciled,
    researchOpportunityScore: research.score,
    rawResearchOpportunityScore: research.rawScore,
    researchOpportunityCoverage: research.coverage,
    researchOpportunityComponents: research.families,
    executionReadinessScore: execution.score,
    rawExecutionReadinessScore: execution.rawScore,
    executionReadinessCoverage: execution.coverage,
    executionReadinessComponents: execution.components,
    finalDecisionScore,
    finalDecisionScoreState:
      deterministicBlocks.length
        ? "BLOCKED"
        : finalDecisionScore !== null
          ? "CALCULATED"
          : "NOT_EXECUTION_REVIEW",
  };
}

export function analyzeCandidateDecisionScoringBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeCandidateDecisionScoring);
}
