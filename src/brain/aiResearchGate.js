import { planCoverageSelection } from "../discovery/coverageSelectionPlanner.js";

const DEFAULTS = {
  totalLimit: 100,
  lightLimit: 25,
  deepLimit: 5,
  minimumLiquidityUsd: 5_000,
  lightMinimumScore: 65,
  lightMinimumCoverage: 55,
  deepMinimumScore: 78,
  deepMinimumCoverage: 70,
  minimumSources: 2,
  criticalRiskScore: 70,
};

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function text(value = "") {
  return String(value || "").trim().toLowerCase();
}

function values(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function sourceCount(project = {}) {
  return new Set(
    [
      ...values(project.sourcesWithUsableEvidence),
      ...values(project.discoverySources),
      ...values(project.sourceTruth?.usableSources),
    ]
      .filter(Boolean)
      .map((value) => text(value))
  ).size;
}

export function localAIProjectKey(project = {}) {
  return String(
    project.permanentProjectKey ||
      project.contractAddress ||
      project.tokenAddress ||
      project.address ||
      project.pairAddress ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  ).toLowerCase();
}

function baselineScore(project = {}) {
  return Math.max(
    num(project.confidenceAdjustedScore),
    num(project.pipelineScore),
    num(project.opportunityScore),
    num(project.score),
    preliminaryDeterministicScore(project)
  );
}

function preliminaryDeterministicScore(project = {}) {
  return Math.max(
    num(project.institutionalVNextScore),
    num(project.sourceTruthScore),
    num(project.sourceReliabilityScore),
    num(project.nativeDiscoveryScore),
    num(project.activeLiquidityTruthScore),
    num(project.organicBuyerScore),
    num(project.organicDemandFirewallScore),
    num(project.instantSafetyScore),
    num(project.candidateLifecycleReadinessScore),
    num(project.discoveryDecisionScore),
    highSignalScore(project)
  );
}

function coverageScore(project = {}) {
  return Math.max(
    num(project.dataConfidenceScore),
    num(project.evidenceQualityScore),
    num(project.evidenceCoverage?.score),
    num(project.sourceTruthScore)
  );
}

function blockingReasons(project = {}, config = DEFAULTS) {
  const blockers = [];
  const identityState = text(project.finalIdentityState || project.identityState);
  const finalState = text(project.finalSelectionState);
  const integrityVerdict = text(project.finalIntegrityVerdict);
  const contract = project.contractAddress || project.tokenAddress || project.address;
  const liquidity = num(project.liquidityUsd);
  const safetyStatus = text(project.instantSafetyStatus || project.safetyStatus);

  if (project.identityVerified === false || identityState.includes("conflict") || identityState.includes("invalid")) {
    blockers.push("identity is unresolved or conflicted");
  }
  if (!contract) blockers.push("contract identity is unavailable");
  if (["blocked", "rejected", "invalid"].some((state) => finalState.includes(state))) {
    blockers.push("final deterministic selection is blocked");
  }
  if (["blocked", "fail", "rejected"].some((state) => integrityVerdict.includes(state))) {
    blockers.push("final integrity verdict is blocked");
  }
  if (safetyStatus.includes("honeypot") || safetyStatus.includes("block") || safetyStatus.includes("fail")) {
    blockers.push("safety gate is blocked");
  }
  if (num(project.riskScore) >= config.criticalRiskScore || num(project.instantSafetyRiskScore) >= config.criticalRiskScore) {
    blockers.push("critical deterministic risk score");
  }
  if (liquidity < config.minimumLiquidityUsd) blockers.push("usable liquidity is below the AI research floor");
  if (values(project.finalBlockingReasons).length) blockers.push("final blocking reasons are present");

  return blockers;
}

function highSignalScore(project = {}) {
  return Math.max(
    num(project.smartMoneyAccumulationScore),
    num(project.smartWalletPerformanceScore),
    num(project.catalystScore),
    num(project.catalystCalendarScore),
    num(project.narrativeHeatScore),
    num(project.accelerationScore),
    num(project.preBreakoutMomentumScore),
    num(project.informationAdvantageScore)
  );
}

export function decideAIResearch(project = {}, options = {}) {
  const config = { ...DEFAULTS, ...options };
  const score = baselineScore(project);
  const coverage = coverageScore(project);
  const sources = sourceCount(project);
  const liquidityUsd = num(project.liquidityUsd);
  const signal = highSignalScore(project);
  const blockers = blockingReasons(project, config);
  const reasons = [];

  if (blockers.length) {
    return {
      projectKey: localAIProjectKey(project),
      eligible: false,
      depth: "NONE",
      priority: 0,
      blockers,
      reasons,
      metrics: { score, coverage, sources, liquidityUsd, highSignalScore: signal },
    };
  }

  if (sources < config.minimumSources) reasons.push("fewer than two independent usable sources");
  if (coverage < config.lightMinimumCoverage) reasons.push("baseline evidence coverage is below the light-research floor");
  if (score < config.lightMinimumScore) reasons.push("baseline score is below the light-research floor");

  if (reasons.length) {
    return {
      projectKey: localAIProjectKey(project),
      eligible: false,
      depth: "NONE",
      priority: 0,
      blockers: [],
      reasons,
      metrics: { score, coverage, sources, liquidityUsd, highSignalScore: signal },
    };
  }

  const deep =
    score >= config.deepMinimumScore &&
    coverage >= config.deepMinimumCoverage &&
    sources >= config.minimumSources &&
    signal >= 65;
  const priority = Math.round(
    Math.min(100, score * 0.45 + coverage * 0.25 + Math.min(sources, 5) * 4 + signal * 0.2)
  );

  return {
    projectKey: localAIProjectKey(project),
    eligible: true,
    depth: deep ? "DEEP" : "LIGHT",
    priority,
    blockers: [],
    reasons: deep
      ? ["strong deterministic score, evidence coverage, and at least one corroborating signal"]
      : ["meets deterministic light-research thresholds"],
    metrics: { score, coverage, sources, liquidityUsd, highSignalScore: signal },
  };
}

export function selectAIResearchCandidates(projects = [], options = {}) {
  const config = { ...DEFAULTS, ...options };
  const decisions = (Array.isArray(projects) ? projects : []).map((project) => ({
    project,
    decision: decideAIResearch(project, config),
  }));
  const sortByPriority = (left, right) => right.decision.priority - left.decision.priority;
  const eligible = decisions
    .filter((item) => item.decision.eligible)
    .sort(sortByPriority);
  const eligibleByProjectKey = new Map(
    eligible.map((item) => [item.decision.projectKey, item])
  );
  const coveragePlan = planCoverageSelection(
    eligible.map((item) => ({
      ...item.project,
      localAIQueuePriority: item.decision.priority,
    })),
    {
      limit: config.totalLimit,
      prefix: "localAI",
      scoreFor: (project) => project.localAIQueuePriority,
    }
  );
  const rankedEligible = coveragePlan.selected
    .map((project) => {
      const item = eligibleByProjectKey.get(localAIProjectKey(project));
      if (!item) return null;
      return {
        ...item,
        project,
        decision: {
          ...item.decision,
          selectionReason: project.localAISelectionReason || "MERIT",
          coverageBucket: project.localAICoverageBucket || null,
        },
      };
    })
    .filter(Boolean)
    .sort(sortByPriority);
  const deep = rankedEligible.filter((item) => item.decision.depth === "DEEP").slice(0, config.deepLimit);
  const selectedDeepKeys = new Set(deep.map((item) => item.decision.projectKey));
  const light = rankedEligible
    .filter((item) => !selectedDeepKeys.has(item.decision.projectKey))
    .slice(0, config.lightLimit)
    .map((item) => ({ ...item, decision: { ...item.decision, depth: "LIGHT" } }));
  const selectedLightKeys = new Set(light.map((item) => item.decision.projectKey));
  const triage = rankedEligible
    .filter((item) => !selectedDeepKeys.has(item.decision.projectKey) && !selectedLightKeys.has(item.decision.projectKey))
    .map((item) => ({ ...item, decision: { ...item.decision, depth: "TRIAGE" } }));

  return {
    candidates: [...deep, ...light, ...triage],
    decisions,
    summary: {
      totalProjects: decisions.length,
      blockedCount: decisions.filter((item) => item.decision.blockers.length).length,
      insufficientEvidenceCount: decisions.filter(
        (item) => !item.decision.eligible && !item.decision.blockers.length
      ).length,
      lightCount: light.length,
      deepCount: deep.length,
      triageCount: triage.length,
      queuedCount: deep.length + light.length + triage.length,
      limits: { total: config.totalLimit, light: config.lightLimit, deep: config.deepLimit },
      coverageSelection: coveragePlan.report,
    },
  };
}
