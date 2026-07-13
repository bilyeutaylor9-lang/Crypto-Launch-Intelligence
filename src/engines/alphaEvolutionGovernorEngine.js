import { loadAlphaEvolutionMemory } from "../learning/alphaEvolutionMemoryStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function average(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (!active.length) return 0;
  return Math.round(active.reduce((sum, value) => sum + value, 0) / active.length);
}

function projectName(project = {}) {
  return project.name || project.symbol || "Unknown";
}

function maxRisk(project = {}) {
  return Math.max(
    num(project.trapRiskScore),
    num(project.riskScore),
    num(project.sellPressureScore),
    num(project.externalRiskScore),
    num(project.tokenUnlockRiskScore),
    num(project.vestingPressureScore),
    num(project.falsePositiveSimilarity),
    num(project.xBotRiskScore),
    num(project.proofCarryingAlphaContract?.latestGrade?.grade === "invalidated" ? 90 : 0)
  );
}

function sourceList(project = {}) {
  return [
    project.source,
    ...(project.discoverySources || []),
    ...(project.proofCarryingAlphaContract?.sources || []),
    ...(project.sourceTruth?.sources || []).map((source) => source.source),
    project.internetResearch?.status?.googleNews === "SUCCESS" ? "google-news" : "",
    project.githubIntelligencePro?.repository ? "github" : "",
    project.externalIntelligence?.status?.news === "SUCCESS" ? "news" : "",
    project.externalIntelligence?.status?.x === "SUCCESS" ? "x" : "",
  ].filter(Boolean);
}

function moduleScores(project = {}, history = null) {
  const contract = project.proofCarryingAlphaContract || {};
  const contractRules = (contract.mustHappen || []).length + (contract.invalidatesIf || []).length;
  const contractScore = clamp(
    num(project.proofCarryingAlphaContractScore) * 0.58 +
      Math.min(100, contractRules * 8) * 0.18 +
      (contract.latestGrade?.confirmationRate || 50) * 0.14 +
      (contract.historySummary?.winRate || history?.latest?.score || 50) * 0.1
  );
  const outcomeScore = clamp(
    average([
      project.outcomeJudgeScore,
      project.paperOutcomeLabScore,
      project.outcomeLearningScore,
      project.calibrationScore,
      50 + num(project.calibrationAdjustment) * 4,
    ])
  );
  const evidenceScore = clamp(
    average([
      project.sourceTruthScore,
      project.proofScore,
      project.evidenceQualityScore,
      project.dataConfidenceScore,
      Math.min(100, (project.evidence || []).length * 4),
    ])
  );
  const agentVoteScore = average((contract.agentVotes || []).map((agent) => agent.score));
  const agentAlignment = clamp(
    average([
      project.aiEcosystemScore,
      project.selfEvolvingAlphaOSScore,
      project.autonomousAlphaOSScore,
      agentVoteScore,
      project.redTeamReview?.status === "Block" ? 10 : 65,
    ])
  );
  const discoveryBreadth = clamp(
    Math.min(100, new Set(sourceList(project)).size * 12) +
      (project.githubIntelligencePro?.repository ? 8 : 0) +
      (project.roadmapProfitabilityScore ? 6 : 0)
  );
  const researchCompleteness = clamp(
    average([
      project.autonomousResearchConfidence,
      project.dossierSwarmScore,
      project.liveCatalystRadarScore,
      project.roadmapProfitabilityScore,
      project.githubProScore,
    ])
  );
  const riskFirewall = clamp(100 - maxRisk(project));
  const learningLoop = clamp(
    average([
      project.learningEdgeScore,
      project.prePumpPatternScore,
      project.signalCombinationScore,
      project.autoLearningWeightScore,
      history ? Math.min(100, num(history.scans) * 10 + num(history.latest?.score) * 0.4) : 0,
    ])
  );

  return {
    contractAccountability: Math.round(contractScore),
    outcomeAccountability: Math.round(outcomeScore),
    evidenceStack: Math.round(evidenceScore),
    agentAlignment: Math.round(agentAlignment),
    discoveryBreadth: Math.round(discoveryBreadth),
    researchCompleteness: Math.round(researchCompleteness),
    riskFirewall: Math.round(riskFirewall),
    learningLoop: Math.round(learningLoop),
  };
}

function weightedGovernorScore(scores = {}) {
  return Math.round(
    clamp(
      scores.contractAccountability * 0.18 +
        scores.outcomeAccountability * 0.12 +
        scores.evidenceStack * 0.16 +
        scores.agentAlignment * 0.13 +
        scores.discoveryBreadth * 0.1 +
        scores.researchCompleteness * 0.12 +
        scores.riskFirewall * 0.13 +
        scores.learningLoop * 0.06
    )
  );
}

function blockers(project = {}, scores = {}) {
  const issues = [];

  if (scores.riskFirewall < 35) issues.push("Risk firewall is too weak.");
  if (scores.evidenceStack < 35) issues.push("Evidence stack is thin.");
  if (scores.contractAccountability < 35) issues.push("Alpha contract is not strong enough.");
  if (project.redTeamReview?.status === "Block") issues.push("Red-team review is blocking the setup.");
  if (project.proofCarryingAlphaContract?.latestGrade?.grade === "invalidated") {
    issues.push("Prior contract hit an invalidation rule.");
  }
  if (num(project.trapRiskScore) >= 75) issues.push("Trap risk is elevated.");
  if (num(project.falsePositiveSimilarity) >= 70) issues.push("Project resembles prior false positives.");

  return issues;
}

function severeRiskBlock(project = {}, scores = {}, issueList = []) {
  return (
    scores.riskFirewall < 20 ||
    num(project.trapRiskScore) >= 82 ||
    project.proofCarryingAlphaContract?.latestGrade?.grade === "invalidated" ||
    (project.redTeamReview?.status === "Block" && scores.riskFirewall < 35) ||
    issueList.length >= 3
  );
}

function missingProof(project = {}, scores = {}) {
  const gaps = [];

  if (scores.discoveryBreadth < 50) gaps.push("Add more independent discovery sources.");
  if (scores.researchCompleteness < 50) gaps.push("Run deeper roadmap, catalyst, website, GitHub, and social research.");
  if (scores.outcomeAccountability < 45) gaps.push("Collect more outcome or paper-trade evidence.");
  if (!project.githubIntelligencePro?.repository && num(project.githubProScore) < 45) {
    gaps.push("Find and verify the official GitHub repository.");
  }
  if (!project.alphaContractReceipt) gaps.push("Create a public alpha receipt.");
  if (num(project.sourceTruthScore) < 55) gaps.push("Confirm the project across more trusted sources.");
  if (num(project.liquidityScore || project.liquidityExpansionScore) < 45) {
    gaps.push("Verify liquidity quality, depth, and concentration.");
  }

  return gaps;
}

function actionPlan(project = {}, score = 0, scores = {}, issueList = [], gaps = []) {
  if (severeRiskBlock(project, scores, issueList)) {
    return {
      primaryAction: "Block",
      reviewCadence: "Wait for risk compression",
      nextSteps: issueList.slice(0, 5),
    };
  }

  if (score >= 78 && issueList.length === 0 && gaps.length <= 1) {
    return {
      primaryAction: "Promote To Operator Review",
      reviewCadence: "1h + 24h + 7d",
      nextSteps: [
        "Manually verify raw sources before any real-world decision.",
        "Track the alpha contract receipt at every review window.",
        "Paper-trade the thesis through the expected catalyst window.",
      ],
    };
  }

  if (score >= 62) {
    return {
      primaryAction: issueList.length ? "Risk-Contained Priority Research" : "Priority Research",
      reviewCadence: "24h + 7d",
      nextSteps: [
        ...issueList.map((issue) => `Resolve blocker: ${issue}`),
        ...(gaps.length ? gaps : ["Collect fresh source proof and rerun the governor."]),
      ].slice(0, 6),
    };
  }

  if (scores.contractAccountability >= 45 || scores.researchCompleteness >= 45 || scores.evidenceStack >= 55) {
    return {
      primaryAction: issueList.length ? "Risk-Contained Recheck" : "Recheck Soon",
      reviewCadence: "24h",
      nextSteps: [
        ...issueList.map((issue) => `Resolve blocker: ${issue}`),
        ...gaps,
      ].slice(0, 6),
    };
  }

  return {
    primaryAction: "Evidence Gap",
    reviewCadence: "After new data",
    nextSteps: gaps.slice(0, 5),
  };
}

function verdictFor(project = {}, score = 0, scores = {}, issueList = [], gaps = []) {
  if (severeRiskBlock(project, scores, issueList)) return "Governor Risk Block";
  if (score >= 78 && issueList.length === 0 && gaps.length <= 1) return "Governor Promote";
  if (score >= 62) return "Governor Priority Research";
  if (scores.contractAccountability >= 45 || scores.researchCompleteness >= 45 || scores.evidenceStack >= 55) return "Governor Recheck Soon";
  return "Governor Evidence Gap";
}

function upgradeDirectives(project = {}, scores = {}, gaps = []) {
  const directives = [
    {
      system: "Outcome Brain",
      priority: scores.outcomeAccountability < 55 ? "High" : "Medium",
      task: "Grade this setup against 1h, 24h, 7d, 30d, and 90d outcomes.",
    },
    {
      system: "Source Mesh",
      priority: scores.discoveryBreadth < 55 ? "High" : "Medium",
      task: "Expand source coverage with official site, docs, GitHub, news, DEX, and ecosystem references.",
    },
    {
      system: "Agent Council",
      priority: scores.agentAlignment < 55 ? "High" : "Medium",
      task: "Run bull, bear, fraud, catalyst, liquidity, GitHub, and tokenomics agents against the thesis.",
    },
    {
      system: "Risk Firewall",
      priority: scores.riskFirewall < 50 ? "Critical" : "Medium",
      task: "Recheck trap, unlock, sell pressure, liquidity concentration, bot, and false-positive risks.",
    },
    {
      system: "Contract Accountability",
      priority: scores.contractAccountability < 55 ? "High" : "Medium",
      task: "Strengthen public receipt rules and define the next invalidation review.",
    },
  ];

  return directives.concat(
    gaps.slice(0, 5).map((gap) => ({
      system: "Missing Proof",
      priority: "High",
      task: gap,
    }))
  );
}

export function analyzeAlphaEvolutionGovernor(project = {}, options = {}) {
  const key =
    project.address ||
    project.tokenAddress ||
    project.pairAddress ||
    project.proofCarryingAlphaContract?.projectKey ||
    `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`;
  const history = options.memory?.projects?.[String(key).toLowerCase()] || null;
  const scores = moduleScores(project, history);
  const score = weightedGovernorScore(scores);
  const issueList = blockers(project, scores);
  const gaps = missingProof(project, scores);
  const verdict = verdictFor(project, score, scores, issueList, gaps);
  const plan = actionPlan(project, score, scores, issueList, gaps);
  const directives = upgradeDirectives(project, scores, gaps);

  return {
    ...project,
    alphaEvolutionGovernorScore: score,
    alphaEvolutionGovernorVerdict: verdict,
    alphaEvolutionGovernor: {
      name: "Alpha Evolution Governor",
      score,
      verdict,
      project: projectName(project),
      moduleScores: scores,
      blockers: issueList,
      missingProof: gaps,
      actionPlan: plan,
      upgradeDirectives: directives,
      memory: history
        ? {
            scans: history.scans || 0,
            latestScore: history.latest?.score || 0,
            latestVerdict: history.latest?.verdict || "Unknown",
          }
        : { scans: 0, latestScore: 0, latestVerdict: "New" },
      explanation:
        `${projectName(project)} is ${verdict} because contract accountability ${scores.contractAccountability}, evidence ${scores.evidenceStack}, agent alignment ${scores.agentAlignment}, risk firewall ${scores.riskFirewall}, and outcome accountability ${scores.outcomeAccountability}.`,
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Alpha Evolution Governor",
        signal: verdict,
        score,
        confidence: score >= 75 ? 0.82 : score >= 60 ? 0.66 : 0.48,
        impact: verdict === "Governor Risk Block" ? "Negative" : score >= 62 ? "Positive" : "Neutral",
        reasons: [
          `Action: ${plan.primaryAction}.`,
          `Risk firewall ${scores.riskFirewall}, evidence stack ${scores.evidenceStack}.`,
          gaps[0] || "No major missing-proof gap detected.",
        ],
      },
    ],
  };
}

export function analyzeAlphaEvolutionGovernorBatch(projects = []) {
  const memory = loadAlphaEvolutionMemory();
  const analyzed = (Array.isArray(projects) ? projects : []).map((project) =>
    analyzeAlphaEvolutionGovernor(project, { memory })
  );
  const minimumPriority = Math.max(0, Number(process.env.ALPHA_EVOLUTION_MIN_PRIORITY || 3));
  const alreadyPriority = analyzed.filter((project) =>
    ["Governor Promote", "Governor Priority Research"].includes(project.alphaEvolutionGovernorVerdict)
  ).length;
  const fallbackIds = new Set(
    [...analyzed]
      .filter(
        (project) =>
          project.alphaEvolutionGovernor &&
          !["Governor Promote", "Governor Priority Research", "Governor Risk Block"].includes(project.alphaEvolutionGovernorVerdict) &&
          num(project.alphaEvolutionGovernorScore) >= 42
      )
      .sort((a, b) => num(b.alphaEvolutionGovernorScore) - num(a.alphaEvolutionGovernorScore))
      .slice(0, Math.max(0, minimumPriority - alreadyPriority))
      .map((project) => project.alphaEvolutionGovernor.project)
  );
  const ranked = [...analyzed]
    .sort((a, b) => num(b.alphaEvolutionGovernorScore) - num(a.alphaEvolutionGovernorScore))
    .map((project, index) => [project, index + 1]);
  const rankByProject = new Map(
    ranked.map(([project, rank]) => [project.alphaEvolutionGovernor?.project || projectName(project), rank])
  );

  return analyzed.map((project) => {
    const projectLabel = project.alphaEvolutionGovernor?.project || projectName(project);
    const fallback = fallbackIds.has(projectLabel);
    const verdict = fallback ? "Governor Priority Research" : project.alphaEvolutionGovernorVerdict;
    const fallbackCaveat = "Best-available governor fallback: research only until proof and outcome evidence improve.";

    return {
      ...project,
      alphaEvolutionGovernorRank: rankByProject.get(projectLabel) || 0,
      alphaEvolutionGovernorVerdict: verdict,
      alphaEvolutionGovernor: {
        ...(project.alphaEvolutionGovernor || {}),
        rank: rankByProject.get(projectLabel) || 0,
        verdict,
        fallback,
        fallbackCaveat: fallback ? fallbackCaveat : undefined,
        actionPlan: fallback
          ? {
              ...(project.alphaEvolutionGovernor?.actionPlan || {}),
              primaryAction: "Priority Research",
              nextSteps: [
                fallbackCaveat,
                ...(project.alphaEvolutionGovernor?.actionPlan?.nextSteps || []),
              ].slice(0, 6),
            }
          : project.alphaEvolutionGovernor?.actionPlan,
      },
    };
  });
}

export function summarizeAlphaEvolutionGovernor(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const governed = safeProjects.filter((project) => project.alphaEvolutionGovernor);
  const sorted = [...governed].sort(
    (a, b) => num(b.alphaEvolutionGovernorScore) - num(a.alphaEvolutionGovernorScore)
  );

  return {
    generatedAt: new Date().toISOString(),
    totalProjects: safeProjects.length,
    governedProjects: governed.length,
    promote: governed.filter((project) => project.alphaEvolutionGovernorVerdict === "Governor Promote").length,
    priorityResearch: governed.filter((project) => project.alphaEvolutionGovernorVerdict === "Governor Priority Research").length,
    recheckSoon: governed.filter((project) => project.alphaEvolutionGovernorVerdict === "Governor Recheck Soon").length,
    evidenceGaps: governed.filter((project) => project.alphaEvolutionGovernorVerdict === "Governor Evidence Gap").length,
    riskBlocks: governed.filter((project) => project.alphaEvolutionGovernorVerdict === "Governor Risk Block").length,
    topProjects: sorted.slice(0, 25).map((project, index) => ({
      rank: index + 1,
      name: project.name || "Unknown",
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || "unknown",
      score: project.alphaEvolutionGovernorScore || 0,
      verdict: project.alphaEvolutionGovernorVerdict || "Unknown",
      action: project.alphaEvolutionGovernor?.actionPlan?.primaryAction || "Review",
      moduleScores: project.alphaEvolutionGovernor?.moduleScores || {},
      blockers: project.alphaEvolutionGovernor?.blockers || [],
      missingProof: project.alphaEvolutionGovernor?.missingProof || [],
      upgradeDirectives: project.alphaEvolutionGovernor?.upgradeDirectives || [],
    })),
  };
}
