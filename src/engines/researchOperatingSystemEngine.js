function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function avg(values = []) {
  const active = values.map(num).filter((value) => value > 0);
  if (!active.length) return 0;
  return Math.round(active.reduce((sum, value) => sum + value, 0) / active.length);
}

function lifecycleStage(project = {}) {
  if (num(project.trapRiskScore) >= 70 || project.aiEcosystemVerdict === "Rejected By AI Council") {
    return "Invalidated";
  }
  if (project.aiEcosystemVerdict === "AI Strong Buy" && project.strongBuyEvidenceGate?.readyForTrueStrongBuy) {
    return "AI Strong Buy";
  }
  if (project.aiEcosystemVerdict === "Best Available Strong Buy Candidate") return "Pre-Strong Buy";
  if (project.aiEcosystemVerdict === "AI Priority Watch") return "Priority Watch";
  if (project.aiEcosystemVerdict === "AI Watchlist" || num(project.confidenceAdjustedScore) >= 50) {
    return "Watch";
  }
  return "Candidate";
}

function multiTimeframe(project = {}) {
  const oneHour = clamp(
    avg([project.velocityScore, project.accelerationScore, project.xSocialVelocityScore]) * 0.55 +
      num(project.volumeSpikeScore) * 0.2 +
      num(project.trapRiskScore) * -0.2
  );
  const twentyFourHour = clamp(
    avg([
      project.momentumShiftScore,
      project.relativeStrengthScore,
      project.buyPressureScore,
      project.capitalFlowScore,
      project.externalSignalScore,
    ]) - num(project.sellPressureScore) * 0.16
  );
  const sevenDay = clamp(
    avg([
      project.catalystCalendarScore,
      project.narrativeHeatScore,
      project.prePumpPatternScore,
      project.confidenceAdjustedScore,
      project.projectChangeScore,
    ]) - num(project.trapRiskScore) * 0.12
  );
  const thirtyDay = clamp(
    avg([
      project.narrativeForecastScore,
      project.institutionalVNextScore,
      project.ecosystemAdoptionScore,
      project.tvlGrowthScore,
      project.learningEdgeScore,
      project.sourceReliabilityScore,
    ]) - num(project.tokenUnlockRiskScore) * 0.14
  );
  const ninetyDay = clamp(
    avg([
      project.developerActivityScore ?? project.developerScore,
      project.githubScore ?? project.githubQualityScore,
      project.fundingBackerScore,
      project.partnershipScore,
      project.ecosystemIntegrationScore,
      project.dataConfidenceScore,
    ]) - num(project.vestingPressureScore) * 0.12
  );

  return {
    "1h": Math.round(oneHour),
    "24h": Math.round(twentyFourHour),
    "7d": Math.round(sevenDay),
    "30d": Math.round(thirtyDay),
    "90d": Math.round(ninetyDay),
    bestHorizon: Object.entries({
      "1h": oneHour,
      "24h": twentyFourHour,
      "7d": sevenDay,
      "30d": thirtyDay,
      "90d": ninetyDay,
    }).sort(([, a], [, b]) => b - a)[0][0],
  };
}

function scenarioPlan(project = {}, timeframes = {}) {
  const base = num(project.confidenceAdjustedScore || project.pipelineScore);
  const trap = num(project.trapRiskScore);
  const liquidity = num(project.liquidityScore || project.liquidityExpansionScore);
  const catalyst = avg([project.catalystScore, project.catalystCalendarScore]);
  const narrative = num(project.narrativeHeatScore);

  return {
    bullCase: {
      score: Math.round(clamp(base + narrative * 0.16 + catalyst * 0.14 + liquidity * 0.12 - trap * 0.1)),
      thesis: "Upside scenario requires catalyst confirmation, liquidity expansion, and low trap risk.",
    },
    baseCase: {
      score: Math.round(clamp(base + avg(Object.values(timeframes).filter((value) => typeof value === "number")) * 0.12 - trap * 0.08)),
      thesis: "Base scenario assumes current evidence persists without a major new catalyst.",
    },
    bearCase: {
      score: Math.round(clamp(base - trap * 0.35 - num(project.sellPressureScore) * 0.18 - num(project.tokenUnlockRiskScore) * 0.16)),
      thesis: "Bear scenario is driven by trap risk, sell pressure, unlocks, or weak proof.",
    },
    invalidation:
      project.whyNow?.invalidation ||
      project.invalidationSignals ||
      ["Trap risk rises above 60 or confidence-adjusted score falls below 45."],
  };
}

function researchTasks(project = {}) {
  const tasks = [
    {
      task: "Verify official contract, token ownership, liquidity lock, and deployer permissions.",
      priority: num(project.trapRiskScore) >= 45 ? "High" : "Medium",
      status: "open",
    },
    {
      task: "Confirm catalyst dates from official docs, blog, X account, or exchange announcement.",
      priority: num(project.catalystCalendarScore) >= 55 ? "High" : "Medium",
      status: "open",
    },
    {
      task: "Compare liquidity depth across DEXs/CEXs and watch for sell-pressure expansion.",
      priority: num(project.liquidityScore) < 50 || num(project.sellPressureScore) >= 55 ? "High" : "Medium",
      status: "open",
    },
    {
      task: "Review audits, docs, GitHub velocity, tokenomics, and vesting/unlock schedule.",
      priority: num(project.proofScore) < 55 ? "High" : "Medium",
      status: "open",
    },
  ];

  if (num(project.webResearchPriority) >= 60) {
    tasks.push({
      task: "Run deeper web research on official pages, recent articles, and negative-risk searches.",
      priority: "High",
      status: project.webResearchStatus === "SEARCHED" ? "in_progress" : "open",
    });
  }

  return tasks;
}

function disagreement(project = {}) {
  const agents = project.aiEcosystemCouncil?.agents || [];
  if (!agents.length) {
    return {
      score: 0,
      level: "Unknown",
      verdict: "No council data",
    };
  }

  const scores = agents.map((agent) => num(agent.score));
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const bullish = agents.filter((agent) => ["bullish", "cleared"].includes(agent.stance)).length;
  const blocked = agents.filter((agent) => ["blocked", "cautious"].includes(agent.stance)).length;
  const score = Math.round(clamp(max - min + Math.abs(bullish - blocked) * 4));
  const level = score >= 65 ? "High" : score >= 40 ? "Medium" : "Low";

  return {
    score,
    level,
    bullishAgents: bullish,
    cautiousAgents: blocked,
    verdict:
      level === "High"
        ? "High-disagreement setup: require confirmation before promotion."
        : level === "Medium"
        ? "Mixed-agent setup: watch for confirming evidence."
        : "Council is broadly aligned.",
  };
}

function redTeam(project = {}) {
  const concerns = [];

  if (num(project.trapRiskScore) >= 45) concerns.push("Trap/rug similarity is elevated.");
  if (num(project.liquidityScore) > 0 && num(project.liquidityScore) < 45) concerns.push("Liquidity quality is weak.");
  if (num(project.proofScore) < 45) concerns.push("Proof score is thin.");
  if (num(project.sourceReliabilityScore) > 0 && num(project.sourceReliabilityScore) < 45) {
    concerns.push("Discovery/source reliability is low.");
  }
  if (num(project.sellPressureScore) >= 60) concerns.push("Sell pressure could overpower demand.");
  if (num(project.tokenUnlockRiskScore) >= 60 || num(project.vestingPressureScore) >= 60) {
    concerns.push("Unlock or vesting pressure could invalidate the setup.");
  }
  if (project.aiEcosystemVerdict === "Best Available Strong Buy Candidate") {
    concerns.push("Best-available candidate is not the same as true strong-buy confirmation.");
  }

  return {
    score: Math.round(clamp(concerns.length * 16 + num(project.trapRiskScore) * 0.35)),
    status: concerns.length >= 4 ? "Block" : concerns.length >= 2 ? "Challenge" : "Clear",
    concerns,
  };
}

export function analyzeResearchOperatingSystem(project = {}) {
  const timeframes = multiTimeframe(project);
  const scenarios = scenarioPlan(project, timeframes);
  const tasks = researchTasks(project);
  const disagreementOutput = disagreement(project);
  const redTeamOutput = redTeam(project);
  const stage = lifecycleStage(project);

  return {
    ...project,
    strongBuyLifecycleStage: stage,
    multiTimeframeIntelligence: timeframes,
    scenarioPlan: scenarios,
    autonomousResearchTasks: tasks,
    aiDisagreement: disagreementOutput,
    redTeamReview: redTeamOutput,
    aiResearchOS: {
      lifecycleStage: stage,
      timeframes,
      scenarios,
      tasks,
      disagreement: disagreementOutput,
      redTeam: redTeamOutput,
      summary: `${stage}: best horizon ${timeframes.bestHorizon}, disagreement ${disagreementOutput.level}, red-team ${redTeamOutput.status}.`,
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Research Operating System",
        signal: "multi-timeframe scenario and lifecycle analysis",
        score: scenarios.baseCase.score,
        confidence: 0.62,
        impact: stage === "AI Strong Buy" || stage === "Pre-Strong Buy" ? "Positive" : "Neutral",
        reasons: [
          `Lifecycle stage: ${stage}.`,
          `Best horizon: ${timeframes.bestHorizon}. Red-team status: ${redTeamOutput.status}.`,
        ],
      },
    ],
  };
}

export function analyzeResearchOperatingSystemBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeResearchOperatingSystem);
}
