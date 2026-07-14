function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function avg(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  return active.length ? active.reduce((sum, value) => sum + value, 0) / active.length : 0;
}

function tier(score = 0, project = {}) {
  if (project.instantSafetyStatus === "CRITICAL" || num(project.deployerRiskScore) >= 85) return "CRITICAL";
  if (project.instantSafetyStatus === "RESTRICTED" || project.organicDemandFirewallStatus === "CRITICAL") return "RESTRICTED";
  if (project.instantSafetyStatus === "UNVERIFIED" || project.organicDemandFirewallStatus === "UNVERIFIED") return "UNVERIFIED";
  if (score >= 75) return "PASS";
  if (score >= 58) return "WATCH";
  return "UNVERIFIED";
}

function capScore(score = 0, project = {}) {
  if (project.instantSafetyStatus === "CRITICAL") return Math.min(score, 24);
  if (project.instantSafetyStatus === "RESTRICTED") return Math.min(score, 44);
  if (project.organicDemandFirewallStatus === "CRITICAL") return Math.min(score, 38);
  if (num(project.deployerRiskScore) >= 80) return Math.min(score, 42);
  return score;
}

export function analyzeDiscoveryDecision(project = {}) {
  const sections = {
    discoveryStrength: Math.round(avg([
      project.nativeDiscoveryScore,
      project.discoveryPriorityScore,
      project.identityResolutionScore,
      project.sourceTruthScore,
    ])),
    organicDemand: Math.round(avg([
      project.organicDemandFirewallScore,
      project.organicBuyerScore,
      project.walletClusterScore,
      project.buyerRetentionScore,
    ])),
    projectQuality: Math.round(avg([
      project.githubProScore,
      project.developerActivityScore,
      project.tokenomicsScore,
      project.deployerReputationScore,
      project.identityResolutionScore,
    ])),
    liquidityExecution: Math.round(avg([
      project.activeLiquidityTruthScore,
      project.instantSafetyScore,
      project.liquidityScore,
      project.proofOfAlphaExecutionTwinScore,
    ])),
    catalystPotential: Math.round(avg([
      project.catalystScore,
      project.catalystCalendarScore,
      project.narrativeHeatScore,
      project.launchReadinessScore,
      project.exchangeProbabilityScore,
    ])),
  };
  const baseScore =
    sections.discoveryStrength * 0.2 +
    sections.organicDemand * 0.25 +
    sections.projectQuality * 0.2 +
    sections.liquidityExecution * 0.15 +
    sections.catalystPotential * 0.2;
  const penalties = {
    contractRisk: num(project.instantSafetyRiskScore),
    deployerRisk: num(project.deployerRiskScore),
    manipulationRisk: Math.max(num(project.walletClusterRiskScore), num(project.washTradingRiskScore), num(project.bundledLaunchRiskScore)),
    supplyRisk: Math.max(num(project.tokenUnlockRiskScore), num(project.vestingPressureScore), num(project.deployerTokenAllocationPct)),
    liquidityControlRisk: num(project.liquidityControlRisk),
    valuationRisk: num(project.valuationDisagreement) >= 5 ? 65 : num(project.valuationRiskScore),
    lateEntryRisk: project.prePump?.status === "ALREADY_PUMPED" ? 90 : project.prePump?.status === "LATE_CHASE" ? 70 : 0,
  };
  const penaltyScore =
    penalties.contractRisk * 0.2 +
    penalties.deployerRisk * 0.18 +
    penalties.manipulationRisk * 0.18 +
    penalties.supplyRisk * 0.12 +
    penalties.liquidityControlRisk * 0.14 +
    penalties.valuationRisk * 0.08 +
    penalties.lateEntryRisk * 0.1;
  const rawScore = clamp(baseScore - penaltyScore * 0.42 + num(project.candidateLifecycleReadinessScore) * 0.08);
  const discoveryDecisionScore = Math.round(capScore(rawScore, project));
  const discoveryDecisionTier = tier(discoveryDecisionScore, project);
  const reasons = [
    `Discovery strength ${sections.discoveryStrength}`,
    `Organic demand ${sections.organicDemand}`,
    `Project quality ${sections.projectQuality}`,
    `Liquidity/execution ${sections.liquidityExecution}`,
    `Catalyst potential ${sections.catalystPotential}`,
  ];
  const risks = Object.entries(penalties)
    .filter(([, value]) => num(value) >= 55)
    .map(([key, value]) => `${key} ${Math.round(value)}`);

  return {
    ...project,
    discoveryDecisionScore,
    discoveryDecisionTier,
    discoveryDecisionStatus: discoveryDecisionTier,
    discoveryDecision: {
      score: discoveryDecisionScore,
      tier: discoveryDecisionTier,
      sections,
      penalties,
      baseScore: Math.round(baseScore),
      penaltyScore: Math.round(penaltyScore),
      lifecycleStage: project.candidateLifecycleStage || "unknown",
      whyRanked: reasons,
      risks,
      explanation: `Ranked by ${reasons.join(", ")}.${risks.length ? ` Risks: ${risks.join(", ")}.` : ""}`,
    },
  };
}

export function analyzeDiscoveryDecisionBatch(projects = []) {
  return projects
    .map((project) => analyzeDiscoveryDecision(project))
    .sort((a, b) => num(b.discoveryDecisionScore) - num(a.discoveryDecisionScore));
}

export function summarizeDiscoveryDecision(projects = []) {
  const analyzed = projects.map((project) => project.discoveryDecision ? project : analyzeDiscoveryDecision(project));

  return {
    projectCount: analyzed.length,
    pass: analyzed.filter((project) => project.discoveryDecisionTier === "PASS").length,
    watch: analyzed.filter((project) => project.discoveryDecisionTier === "WATCH").length,
    restricted: analyzed.filter((project) => project.discoveryDecisionTier === "RESTRICTED").length,
    critical: analyzed.filter((project) => project.discoveryDecisionTier === "CRITICAL").length,
    unverified: analyzed.filter((project) => project.discoveryDecisionTier === "UNVERIFIED").length,
    topDecisions: [...analyzed]
      .sort((a, b) => num(b.discoveryDecisionScore) - num(a.discoveryDecisionScore))
      .slice(0, 10)
      .map((project, index) => ({
        rank: index + 1,
        symbol: project.symbol,
        score: project.discoveryDecisionScore,
        tier: project.discoveryDecisionTier,
        stage: project.candidateLifecycleStage,
      })),
  };
}
