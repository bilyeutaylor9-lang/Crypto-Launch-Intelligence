function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function weightedAverage(items = []) {
  const active = items.filter((item) => num(item.score) > 0);

  if (!active.length) return 0;

  const weightedTotal = active.reduce(
    (sum, item) => sum + num(item.score) * item.weight,
    0
  );
  const weightTotal = active.reduce((sum, item) => sum + item.weight, 0);

  return Math.round(clamp(weightedTotal / weightTotal));
}

const MARKET_ARCHETYPES = [
  {
    name: "AI infrastructure breakout",
    examples: ["RNDR 2023", "TAO 2024", "FET 2023"],
    profile: {
      narrative: 86,
      developer: 72,
      liquidity: 68,
      smartMoney: 66,
      social: 74,
      risk: 28,
    },
  },
  {
    name: "DePIN liquidity rotation",
    examples: ["AKT 2023", "HNT 2023", "IO-style launch basket"],
    profile: {
      narrative: 80,
      developer: 68,
      liquidity: 62,
      smartMoney: 58,
      social: 60,
      risk: 34,
    },
  },
  {
    name: "L2 ecosystem expansion",
    examples: ["ARB ecosystem 2023", "OP ecosystem 2023", "Base ecosystem 2024"],
    profile: {
      narrative: 72,
      developer: 78,
      liquidity: 74,
      smartMoney: 62,
      social: 56,
      risk: 32,
    },
  },
  {
    name: "pre-listing catalyst squeeze",
    examples: ["TIA 2023", "JUP 2024", "PYTH 2023"],
    profile: {
      narrative: 76,
      developer: 58,
      liquidity: 60,
      smartMoney: 70,
      social: 68,
      risk: 42,
    },
  },
  {
    name: "social hype liquidity trap",
    examples: ["thin-liquidity meme rotations", "bot-amplified microcaps"],
    profile: {
      narrative: 70,
      developer: 22,
      liquidity: 28,
      smartMoney: 24,
      social: 86,
      risk: 78,
    },
  },
  {
    name: "late chase exhaustion",
    examples: ["post-pump listing chases", "overheated unlock cycles"],
    profile: {
      narrative: 66,
      developer: 42,
      liquidity: 48,
      smartMoney: 32,
      social: 78,
      risk: 70,
    },
  },
];

function profileForProject(project = {}) {
  const signalProfile = project.signalProfile || {};

  return {
    narrative: weightedAverage([
      { score: signalProfile.narrative, weight: 1.1 },
      { score: project.narrativeHeatScore, weight: 1.0 },
      { score: project.narrativeForecastScore, weight: 0.8 },
      { score: project.infrastructureNarrativeScore, weight: 0.6 },
    ]),
    developer: weightedAverage([
      { score: signalProfile.devCommunity, weight: 1.0 },
      { score: project.developerActivityScore ?? project.developerScore, weight: 0.9 },
      { score: project.githubScore ?? project.githubQualityScore, weight: 0.7 },
      { score: project.worldModelScore, weight: 0.4 },
    ]),
    liquidity: weightedAverage([
      { score: signalProfile.flows, weight: 1.0 },
      { score: project.liquidityScore, weight: 0.9 },
      { score: project.liquidityExpansionScore, weight: 0.9 },
      { score: project.capitalFlowScore, weight: 0.9 },
      { score: project.buyPressureScore, weight: 0.7 },
    ]),
    smartMoney: weightedAverage([
      { score: signalProfile.smartMoney, weight: 1.0 },
      { score: project.smartMoneyAccumulationScore, weight: 1.0 },
      { score: project.smartWalletPerformanceScore, weight: 0.8 },
      { score: project.whaleScore ?? project.whaleActivityScore, weight: 0.6 },
    ]),
    social: weightedAverage([
      { score: signalProfile.socialIntelligence, weight: 1.0 },
      { score: project.xSocialScore, weight: 0.9 },
      { score: project.socialAccelerationScore, weight: 0.8 },
      { score: project.externalSignalScore, weight: 0.7 },
    ]),
    proof: weightedAverage([
      { score: project.proofScore, weight: 1.0 },
      { score: project.evidenceQualityScore, weight: 0.8 },
      { score: project.sourceReliabilityScore, weight: 0.8 },
      { score: project.dataConfidenceScore, weight: 0.8 },
    ]),
    learning: weightedAverage([
      { score: project.outcomeLearningScore, weight: 1.0 },
      { score: project.prePumpPatternScore, weight: 1.0 },
      { score: project.signalCombinationScore, weight: 0.9 },
      { score: project.calibrationScore, weight: 0.7 },
      { score: project.alphaLabScore, weight: 0.8 },
    ]),
    risk: weightedAverage([
      { score: project.trapRiskScore, weight: 1.0 },
      { score: project.riskScore, weight: 0.9 },
      { score: project.sellPressureScore, weight: 0.8 },
      { score: project.externalRiskScore, weight: 0.7 },
      { score: project.falsePositiveAutopsy?.falsePositiveRisk, weight: 0.8 },
      { score: project.tokenUnlockRiskScore, weight: 0.6 },
      { score: project.vestingPressureScore, weight: 0.6 },
    ]),
  };
}

function similarity(profile = {}, archetype = {}) {
  const keys = ["narrative", "developer", "liquidity", "smartMoney", "social", "risk"];
  const totalDistance = keys.reduce(
    (sum, key) => sum + Math.abs(num(profile[key]) - num(archetype.profile?.[key])),
    0
  );
  const maxDistance = keys.length * 100;

  return Math.round(clamp(100 - (totalDistance / maxDistance) * 100));
}

function closestAnalogs(profile = {}) {
  return MARKET_ARCHETYPES.map((archetype) => ({
    name: archetype.name,
    similarity: similarity(profile, archetype),
    examples: archetype.examples,
    riskType: archetype.profile.risk >= 65 ? "Trap/Exhaustion" : "Breakout/Rotation",
  }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);
}

function scenarioPaths(project = {}, profile = {}, analogs = []) {
  const baseStrength = weightedAverage([
    { score: project.marketScientistScore, weight: 1.0 },
    { score: project.quantumBrainScore, weight: 0.9 },
    { score: project.aiEcosystemScore, weight: 0.9 },
    { score: project.confidenceAdjustedScore || project.pipelineScore, weight: 0.9 },
    { score: profile.learning, weight: 0.8 },
    { score: profile.proof, weight: 0.7 },
  ]);
  const risk = profile.risk;
  const breakoutAnalog = analogs.find((analog) => analog.riskType === "Breakout/Rotation")?.similarity || 0;
  const trapAnalog = analogs.find((analog) => analog.riskType === "Trap/Exhaustion")?.similarity || 0;
  const bull = clamp(baseStrength * 0.52 + breakoutAnalog * 0.26 + profile.liquidity * 0.12 - risk * 0.18 + 16);
  const bear = clamp(risk * 0.48 + trapAnalog * 0.24 + (100 - profile.proof) * 0.12 - baseStrength * 0.16 + 10);
  const base = clamp(100 - Math.abs(bull - bear) * 0.55 - Math.max(0, 52 - profile.proof) * 0.25);
  const total = Math.max(1, bull + bear + base);
  const probabilities = {
    bull: Math.round((bull / total) * 100),
    base: Math.round((base / total) * 100),
    bear: Math.round((bear / total) * 100),
  };
  const expectedReturn30dPct = Math.round(
    probabilities.bull * 0.78 + probabilities.base * 0.08 - probabilities.bear * 0.46
  );
  const expectedReturn90dPct = Math.round(
    probabilities.bull * 1.45 + probabilities.base * 0.18 - probabilities.bear * 0.72
  );
  const bearCaseDrawdownPct = -Math.round(clamp(12 + risk * 0.42 + trapAnalog * 0.14, 8, 72));

  return {
    probabilities,
    expectedReturn7dPct: Math.round(expectedReturn30dPct * 0.35),
    expectedReturn30dPct,
    expectedReturn90dPct,
    bearCaseDrawdownPct,
    breakoutProbability: Math.round(clamp(probabilities.bull + breakoutAnalog * 0.12 - trapAnalog * 0.08)),
    falsePositiveSimilarity: Math.round(clamp(trapAnalog)),
    paths: [
      {
        horizon: "7d",
        expectedReturnPct: Math.round(expectedReturn30dPct * 0.35),
        dominantDriver: profile.social >= profile.liquidity ? "attention acceleration" : "liquidity confirmation",
      },
      {
        horizon: "30d",
        expectedReturnPct: expectedReturn30dPct,
        dominantDriver: probabilities.bull >= probabilities.bear ? "breakout continuation" : "risk compression needed",
      },
      {
        horizon: "90d",
        expectedReturnPct: expectedReturn90dPct,
        dominantDriver: profile.developer >= 60 ? "fundamental persistence" : "narrative durability test",
      },
    ],
  };
}

function mutateSignals(project = {}, profile = {}) {
  const base = num(project.confidenceAdjustedScore || project.pipelineScore);
  const tests = [
    {
      mutation: "X/social momentum fades 30%",
      scoreAfterMutation: Math.round(clamp(base - profile.social * 0.09)),
      interpretation: profile.liquidity >= 55 ? "survivable if liquidity remains healthy" : "fragile without flow confirmation",
    },
    {
      mutation: "liquidity expands 50%",
      scoreAfterMutation: Math.round(clamp(base + (100 - profile.liquidity) * 0.08)),
      interpretation: "best upside lever if new volume is organic",
    },
    {
      mutation: "smart money exits",
      scoreAfterMutation: Math.round(clamp(base - profile.smartMoney * 0.13)),
      interpretation: profile.smartMoney >= 60 ? "major invalidation risk" : "limited impact because smart-money evidence is not dominant",
    },
    {
      mutation: "trap risk rises 20 points",
      scoreAfterMutation: Math.round(clamp(base - 20 * 0.55 - profile.risk * 0.06)),
      interpretation: "forces downgrade unless proof and liquidity rise together",
    },
  ];

  return tests.sort((a, b) => a.scoreAfterMutation - b.scoreAfterMutation);
}

function engineTournament(project = {}, profile = {}) {
  const agents = [
    {
      name: "Memory Agent",
      score: weightedAverage([
        { score: project.outcomeLearningScore, weight: 1.0 },
        { score: project.prePumpPatternScore, weight: 1.0 },
        { score: project.signalCombinationScore, weight: 0.8 },
      ]),
    },
    {
      name: "Scenario Agent",
      score: weightedAverage([
        { score: project.quantumBrainScore, weight: 1.0 },
        { score: project.marketScientistScore, weight: 1.0 },
        { score: project.alphaLabScore, weight: 0.8 },
      ]),
    },
    {
      name: "Flow Agent",
      score: weightedAverage([
        { score: profile.liquidity, weight: 1.0 },
        { score: profile.smartMoney, weight: 1.0 },
        { score: project.buyPressureScore, weight: 0.7 },
      ]),
    },
    {
      name: "Narrative Agent",
      score: weightedAverage([
        { score: profile.narrative, weight: 1.0 },
        { score: profile.social, weight: 0.8 },
        { score: project.catalystCalendarScore || project.catalystScore, weight: 0.7 },
      ]),
    },
    {
      name: "Risk Agent",
      score: Math.round(clamp(100 - profile.risk)),
    },
    {
      name: "Proof Agent",
      score: profile.proof,
    },
  ].map((agent) => ({
    ...agent,
    vote: agent.score >= 62 ? "Approve" : agent.score >= 38 ? "Watch" : "Reject",
  }));
  const approve = agents.filter((agent) => agent.vote === "Approve").length;
  const watch = agents.filter((agent) => agent.vote === "Watch").length;
  const reject = agents.filter((agent) => agent.vote === "Reject").length;

  return {
    agents,
    approve,
    watch,
    reject,
    consensus:
      approve >= 4 && reject <= 1
        ? "Strong Approval"
        : approve >= 3
        ? "Constructive"
        : reject >= 3
        ? "Rejected"
        : "Mixed",
  };
}

function adversarialReview(project = {}, profile = {}, scenarios = {}) {
  const objections = [];

  if (profile.proof < 55) objections.push("proof quality is not strong enough yet");
  if (profile.liquidity < 50) objections.push("liquidity is still thin");
  if (profile.risk >= 55) objections.push("trap or false-positive risk is elevated");
  if (num(project.redTeamReview?.score) >= 55) objections.push("red-team review already raised concerns");
  if (scenarios.probabilities?.bear >= scenarios.probabilities?.bull) {
    objections.push("bear path is too close to the bull path");
  }

  return {
    status: objections.length >= 3 ? "Block" : objections.length >= 1 ? "Challenge" : "Clear",
    objection:
      objections.length > 0
        ? `Main objection: ${objections[0]}.`
        : "No major adversarial objection after the current evidence stack.",
    objections,
  };
}

function confidenceLabel(score = 0) {
  if (score >= 78) return "High";
  if (score >= 58) return "Medium";
  if (score >= 38) return "Developing";
  return "Low";
}

function decision(score = 0, tournament = {}, adversary = {}) {
  if (adversary.status === "Block") return "Do Not Promote";
  if (score >= 78 && tournament.consensus === "Strong Approval") return "Simulation Strong Buy Candidate";
  if (score >= 68 && ["Strong Approval", "Constructive"].includes(tournament.consensus)) {
    return "Simulation Priority Watch";
  }
  if (score >= 38) return "Simulation Watch";
  return "Reject For Now";
}

function applyPortfolioBrain(projects = []) {
  const ranked = [...projects].sort((a, b) => num(b.simulationBrainScore) - num(a.simulationBrainScore));
  const total = Math.max(1, ranked.length);
  const rankByKey = new Map();

  ranked.forEach((project, index) => {
    const key = `${project.symbol || ""}:${project.name || ""}:${index}`;
    rankByKey.set(project, {
      rank: index + 1,
      percentile: Math.round(((total - index) / total) * 100),
    });
  });

  return projects.map((project) => {
    const rank = rankByKey.get(project) || { rank: 0, percentile: 0 };
    const relativeEdge = Math.round(num(project.simulationBrainScore) - num(ranked[Math.min(9, total - 1)]?.simulationBrainScore));

    return {
      ...project,
      simulationPortfolioRank: rank.rank,
      simulationPortfolioPercentile: rank.percentile,
      portfolioBrain: {
        rank: rank.rank,
        percentile: rank.percentile,
        relativeEdgeVsTop10Cutoff: relativeEdge,
        allocationView:
          rank.rank <= 3 && num(project.simulationBrainScore) >= 72
            ? "Top portfolio candidate"
            : rank.percentile >= 80
            ? "Research basket candidate"
            : "Below current opportunity cut",
      },
    };
  });
}

export function analyzeSelfTrainingMarketSimulationBrain(project = {}) {
  const profile = profileForProject(project);
  const analogs = closestAnalogs(profile);
  const scenarios = scenarioPaths(project, profile, analogs);
  const mutations = mutateSignals(project, profile);
  const tournament = engineTournament(project, profile);
  const adversary = adversarialReview(project, profile, scenarios);
  const marketTwinScore = Math.round(
    clamp(
      analogs[0].similarity * 0.24 +
        profile.learning * 0.2 +
        profile.proof * 0.16 +
        (100 - profile.risk) * 0.16 +
        num(project.marketScientistScore) * 0.14 +
        num(project.worldModelScore) * 0.1
    )
  );
  const tournamentAverage = weightedAverage(
    tournament.agents.map((agent) => ({ score: agent.score, weight: 1 }))
  );
  const simulationBrainScore = Math.round(
    clamp(
      marketTwinScore * 0.24 +
        scenarios.breakoutProbability * 0.18 +
        Math.max(0, scenarios.expectedReturn30dPct) * 0.12 +
        (100 - scenarios.falsePositiveSimilarity) * 0.12 +
        tournamentAverage * 0.18 +
        profile.proof * 0.08 +
        (100 - profile.risk) * 0.08 +
        (tournament.approve * 4 + tournament.watch * 2 - tournament.reject * 3) +
        (adversary.status === "Clear" ? 7 : adversary.status === "Block" ? -10 : -3)
    )
  );
  const confidenceScore = Math.round(
    clamp(profile.proof * 0.34 + num(project.dataConfidenceScore) * 0.24 + num(project.sourceReliabilityScore) * 0.2 + (100 - profile.risk) * 0.22)
  );
  const simulationDecision = decision(simulationBrainScore, tournament, adversary);

  return {
    ...project,
    marketMemoryTwinScore: marketTwinScore,
    simulationBrainScore,
    simulationDecision,
    simulationConfidenceScore: confidenceScore,
    simulationConfidence: confidenceLabel(confidenceScore),
    breakoutProbability30d: scenarios.breakoutProbability,
    expectedReturn7dPct: scenarios.expectedReturn7dPct,
    expectedReturn30dPct: scenarios.expectedReturn30dPct,
    expectedReturn90dPct: scenarios.expectedReturn90dPct,
    bearCaseDrawdownPct: scenarios.bearCaseDrawdownPct,
    falsePositiveSimilarity: scenarios.falsePositiveSimilarity,
    closestMarketAnalogs: analogs,
    simulatedScenarios: scenarios,
    signalMutationTests: mutations,
    engineTournament: tournament,
    adversarialSimulationReview: adversary,
    selfTrainingMarketSimulationBrain: {
      score: simulationBrainScore,
      marketTwinScore,
      decision: simulationDecision,
      confidence: confidenceLabel(confidenceScore),
      profile,
      summary: `${simulationDecision}: ${scenarios.breakoutProbability}% breakout probability, ${scenarios.expectedReturn30dPct}% simulated 30d expected return, ${scenarios.bearCaseDrawdownPct}% bear-case drawdown.`,
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Self-Training Market Simulation Brain",
        signal: "market-memory analogs, scenario simulation, mutation tests, and engine tournament",
        score: simulationBrainScore,
        confidence: confidenceScore / 100,
        impact: simulationBrainScore >= 68 ? "Positive" : simulationBrainScore <= 42 ? "Negative" : "Neutral",
        reasons: [
          `Closest analog: ${analogs[0]?.name || "unknown"} (${analogs[0]?.similarity || 0}% similarity).`,
          `Tournament consensus: ${tournament.consensus}; adversary: ${adversary.status}.`,
        ],
      },
    ],
  };
}

export function analyzeSelfTrainingMarketSimulationBrainBatch(projects = []) {
  const enriched = (Array.isArray(projects) ? projects : []).map(analyzeSelfTrainingMarketSimulationBrain);

  return applyPortfolioBrain(enriched);
}
