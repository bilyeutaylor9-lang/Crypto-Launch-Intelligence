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

function agentVote(score = 0, riskAware = false) {
  if (riskAware) {
    if (score >= 75) return "Block";
    if (score >= 50) return "Challenge";
    return "Clear";
  }

  if (score >= 72) return "Approve";
  if (score >= 48) return "Watch";
  return "Reject";
}

function evidenceLine(label = "", value = "", threshold = 0, positive = true) {
  return {
    label,
    value,
    interpretation: positive
      ? num(value) >= threshold
        ? "supportive"
        : "needs work"
      : num(value) >= threshold
      ? "risk"
      : "acceptable",
  };
}

function buildAgent(name = "", score = 0, vote = "", thesis = "", evidence = [], objections = []) {
  return {
    name,
    score: Math.round(clamp(score)),
    vote,
    thesis,
    evidence,
    objections,
  };
}

function tokenomicsAgent(project = {}) {
  const score = weightedAverage([
    { score: project.tokenomicsScore, weight: 1.1 },
    { score: project.fundingBackerScore, weight: 0.8 },
    { score: project.stakingMomentumScore, weight: 0.5 },
    { score: 100 - num(project.vestingPressureScore), weight: 0.8 },
    { score: 100 - num(project.tokenUnlockRiskScore), weight: 0.8 },
  ]);
  const objections = [];

  if (num(project.vestingPressureScore) >= 65) objections.push("vesting pressure is elevated");
  if (num(project.tokenUnlockRiskScore) >= 65) objections.push("unlock pressure needs manual review");
  if (num(project.tokenomicsScore) > 0 && num(project.tokenomicsScore) < 45) {
    objections.push("tokenomics score is weak");
  }

  return buildAgent(
    "Tokenomics Agent",
    score,
    agentVote(score),
    score >= 65
      ? "Token structure looks acceptable for deeper research."
      : "Token structure needs more proof before promotion.",
    [
      evidenceLine("tokenomicsScore", project.tokenomicsScore || 0, 60),
      evidenceLine("vestingPressureScore", project.vestingPressureScore || 0, 65, false),
      evidenceLine("tokenUnlockRiskScore", project.tokenUnlockRiskScore || 0, 65, false),
    ],
    objections
  );
}

function liquidityAgent(project = {}) {
  const score = weightedAverage([
    { score: project.liquidityScore, weight: 1.0 },
    { score: project.liquidityExpansionScore, weight: 1.0 },
    { score: project.capitalFlowScore, weight: 0.9 },
    { score: project.buyPressureScore, weight: 0.8 },
    { score: 100 - num(project.sellPressureScore), weight: 0.6 },
  ]);
  const objections = [];

  if (num(project.liquidityScore) > 0 && num(project.liquidityScore) < 40) {
    objections.push("liquidity support is still thin");
  }
  if (num(project.sellPressureScore) >= 70) objections.push("sell pressure is elevated");

  return buildAgent(
    "Liquidity Agent",
    score,
    agentVote(score),
    score >= 65
      ? "Liquidity and flow are supportive enough for watchlist work."
      : "Flow confirmation is not strong enough yet.",
    [
      evidenceLine("liquidityScore", project.liquidityScore || 0, 60),
      evidenceLine("liquidityExpansionScore", project.liquidityExpansionScore || 0, 60),
      evidenceLine("sellPressureScore", project.sellPressureScore || 0, 70, false),
    ],
    objections
  );
}

function narrativeAgent(project = {}) {
  const score = weightedAverage([
    { score: project.narrativeHeatScore, weight: 1.0 },
    { score: project.narrativeForecastScore, weight: 0.9 },
    { score: project.infrastructureNarrativeScore, weight: 0.7 },
    { score: project.xSocialScore, weight: 0.7 },
    { score: project.externalSignalScore, weight: 0.6 },
  ]);
  const objections = [];

  if (num(project.xBotRiskScore) >= 50) objections.push("social signal may be low quality");
  if (num(project.externalRiskScore) >= 45) objections.push("external sources include risk language");

  return buildAgent(
    "Narrative Agent",
    score,
    agentVote(score),
    score >= 70
      ? "Narrative momentum is strong enough to deserve attention."
      : "Narrative needs more confirmation or cleaner attention.",
    [
      evidenceLine("narrativeHeatScore", project.narrativeHeatScore || 0, 65),
      evidenceLine("narrativeForecastScore", project.narrativeForecastScore || 0, 60),
      evidenceLine("xSocialScore", project.xSocialScore || 0, 60),
    ],
    objections
  );
}

function developerAgent(project = {}) {
  const score = weightedAverage([
    { score: project.developerActivityScore ?? project.developerScore, weight: 1.0 },
    { score: project.githubScore ?? project.githubQualityScore, weight: 0.8 },
    { score: project.communityGrowthScore ?? project.communityScore, weight: 0.6 },
    { score: project.worldModelScore, weight: 0.5 },
    { score: project.ecosystemIntegrationScore, weight: 0.5 },
  ]);
  const objections = [];

  if (score < 45) objections.push("developer/community proof is thin");
  if (num(project.sourceReliabilityScore) > 0 && num(project.sourceReliabilityScore) < 40) {
    objections.push("source reliability is weak");
  }

  return buildAgent(
    "Developer Agent",
    score,
    agentVote(score),
    score >= 60
      ? "Builder and ecosystem evidence supports continued research."
      : "Builder evidence needs manual verification.",
    [
      evidenceLine("developerActivityScore", project.developerActivityScore ?? project.developerScore ?? 0, 55),
      evidenceLine("githubScore", project.githubScore ?? project.githubQualityScore ?? 0, 50),
      evidenceLine("worldModelScore", project.worldModelScore || 0, 55),
    ],
    objections
  );
}

function walletAgent(project = {}) {
  const score = weightedAverage([
    { score: project.smartMoneyAccumulationScore, weight: 1.0 },
    { score: project.smartWalletPerformanceScore, weight: 0.9 },
    { score: project.smartWalletScore, weight: 0.7 },
    { score: project.whaleScore ?? project.whaleActivityScore, weight: 0.6 },
    { score: project.holderGrowthScore, weight: 0.6 },
  ]);
  const objections = [];

  if (score < 45) objections.push("wallet confirmation is weak");
  if (num(project.whaleConcentrationRiskScore) >= 60) objections.push("whale concentration risk needs review");

  return buildAgent(
    "Wallet Agent",
    score,
    agentVote(score),
    score >= 65
      ? "Wallet and holder behavior are supportive."
      : "Smart-money evidence is not decisive yet.",
    [
      evidenceLine("smartMoneyAccumulationScore", project.smartMoneyAccumulationScore || 0, 60),
      evidenceLine("smartWalletPerformanceScore", project.smartWalletPerformanceScore || 0, 60),
      evidenceLine("holderGrowthScore", project.holderGrowthScore || 0, 55),
    ],
    objections
  );
}

function riskAgent(project = {}) {
  const score = weightedAverage([
    { score: project.trapRiskScore, weight: 1.1 },
    { score: project.riskScore, weight: 0.9 },
    { score: project.sellPressureScore, weight: 0.7 },
    { score: project.externalRiskScore, weight: 0.7 },
    { score: project.falsePositiveSimilarity, weight: 0.6 },
    { score: project.outcomeJudgement?.grade?.label === "False Positive" ? 85 : 0, weight: 0.7 },
  ]);
  const objections = [];

  if (num(project.trapRiskScore) >= 55) objections.push("trap risk is elevated");
  if (num(project.falsePositiveSimilarity) >= 65) objections.push("resembles prior false-positive/trap setups");
  if (project.adversarialSimulationReview?.status === "Block") {
    objections.push("simulation adversary blocked the thesis");
  }
  if (project.redTeamReview?.status === "Block") objections.push("Research OS red team blocked the thesis");

  return buildAgent(
    "Risk Agent",
    score,
    agentVote(score, true),
    score >= 60
      ? "Risk conditions require defensive handling."
      : "No dominant risk cluster blocks research yet.",
    [
      evidenceLine("trapRiskScore", project.trapRiskScore || 0, 55, false),
      evidenceLine("falsePositiveSimilarity", project.falsePositiveSimilarity || 0, 65, false),
      evidenceLine("riskScore", project.riskScore || 0, 60, false),
    ],
    objections
  );
}

function outcomeAgent(project = {}) {
  const score = weightedAverage([
    { score: project.outcomeJudgeScore, weight: 1.0 },
    { score: project.outcomeLearningScore, weight: 0.8 },
    { score: project.prePumpPatternScore, weight: 0.7 },
    { score: project.signalCombinationScore, weight: 0.7 },
    { score: project.calibrationScore, weight: 0.6 },
  ]);
  const objections = [];

  if (project.outcomeJudgeVerdict === "Downgrade Thesis") {
    objections.push("outcome judge recommends downgrade");
  }
  if (project.outcomeJudgeStatus === "Cold Start") {
    objections.push("no direct outcome history yet");
  }

  return buildAgent(
    "Outcome Agent",
    score,
    agentVote(score),
    score >= 60
      ? "Outcome memory supports continued research."
      : "Outcome memory is thin or inconclusive.",
    [
      evidenceLine("outcomeJudgeScore", project.outcomeJudgeScore || 0, 55),
      evidenceLine("outcomeLearningScore", project.outcomeLearningScore || 0, 55),
      evidenceLine("prePumpPatternScore", project.prePumpPatternScore || 0, 55),
    ],
    objections
  );
}

function finalPmAgent(project = {}, agents = []) {
  const approve = agents.filter((agent) => agent.vote === "Approve").length;
  const watch = agents.filter((agent) => agent.vote === "Watch").length;
  const reject = agents.filter((agent) => agent.vote === "Reject").length;
  const riskBlock = agents.some((agent) => agent.name === "Risk Agent" && agent.vote === "Block");
  const riskChallenge = agents.some((agent) => agent.name === "Risk Agent" && agent.vote === "Challenge");
  const averageAgentScore = weightedAverage(agents.map((agent) => ({ score: agent.score, weight: 1 })));
  const score = Math.round(
    clamp(
      averageAgentScore * 0.45 +
        num(project.simulationBrainScore) * 0.18 +
        num(project.aiEcosystemScore) * 0.14 +
        num(project.outcomeJudgeScore) * 0.12 +
        num(project.proofScore) * 0.11 -
        (riskBlock ? 18 : riskChallenge ? 7 : 0) -
        reject * 3
    )
  );
  const vote =
    riskBlock || score < 42
      ? "Reject"
      : score >= 72 && approve >= 4
      ? "Approve"
      : "Watch";

  return buildAgent(
    "Final PM Agent",
    score,
    vote,
    vote === "Approve"
      ? "Promote into priority research with clear triggers."
      : vote === "Watch"
      ? "Keep in research queue until verification improves."
      : "Do not promote until blockers clear.",
    [
      evidenceLine("agentAverage", averageAgentScore, 60),
      evidenceLine("simulationBrainScore", project.simulationBrainScore || 0, 55),
      evidenceLine("proofScore", project.proofScore || 0, 55),
    ],
    riskBlock ? ["risk agent blocked the thesis"] : []
  );
}

function promotionTriggers(project = {}) {
  const triggers = [];

  if (num(project.liquidityScore) < 65) triggers.push("liquidity score rises above 65");
  if (num(project.proofScore) < 60) triggers.push("proof score rises above 60");
  if (num(project.smartMoneyAccumulationScore) < 60) triggers.push("smart-money accumulation confirms above 60");
  if (num(project.trapRiskScore) >= 30) triggers.push("trap risk falls below 30");
  if (project.outcomeJudgeStatus === "Cold Start") triggers.push("outcome judge gets a tracked follow-up scan");

  return triggers.length ? triggers : ["maintain current signal stack without risk deterioration"];
}

function mustVerify(project = {}, agents = []) {
  const checks = [
    "verify current liquidity depth and source quality",
    "review unlocks, vesting, emissions, and FDV pressure",
    "inspect top wallet concentration and smart-wallet persistence",
  ];
  const objections = agents.flatMap((agent) => agent.objections || []);

  if (objections.some((item) => item.includes("developer"))) checks.push("verify GitHub/docs/roadmap activity manually");
  if (objections.some((item) => item.includes("social"))) checks.push("separate organic social attention from low-quality attention");
  if (num(project.catalystCalendarScore || project.catalystScore) >= 55) {
    checks.push("confirm upcoming catalyst date and whether it is already priced in");
  }

  return [...new Set(checks)].slice(0, 7);
}

function invalidations(project = {}) {
  return [
    "liquidity falls while price or social attention rises",
    "sell pressure expands above 70",
    "trap risk rises above 60",
    "Outcome Judge downgrades the thesis after a follow-up scan",
    ...(project.invalidationSignals || []).slice(0, 3),
  ].filter(Boolean);
}

function swarmDecision(score = 0, agents = []) {
  const finalPm = agents.find((agent) => agent.name === "Final PM Agent");
  const risk = agents.find((agent) => agent.name === "Risk Agent");

  if (risk?.vote === "Block" || finalPm?.vote === "Reject") return "Do Not Promote";
  if (score >= 78 && finalPm?.vote === "Approve") return "Dossier Priority";
  if (score >= 62) return "Research Priority";
  if (score >= 45) return "Watchlist Dossier";
  return "Reject For Now";
}

function shouldBuildDossier(project = {}, index = 0, limit = 25) {
  if (index < limit) return true;
  if (num(project.simulationBrainScore) >= 55) return true;
  if (num(project.aiEcosystemScore) >= 60) return true;
  if (num(project.outcomeJudgeScore) >= 60) return true;
  return ["AI Strong Buy", "Pre-Strong Buy", "Priority Watch"].includes(project.strongBuyLifecycleStage);
}

export function analyzeProjectDossierSwarm(project = {}) {
  const baseAgents = [
    tokenomicsAgent(project),
    liquidityAgent(project),
    narrativeAgent(project),
    developerAgent(project),
    walletAgent(project),
    riskAgent(project),
    outcomeAgent(project),
  ];
  const pm = finalPmAgent(project, baseAgents);
  const agents = [...baseAgents, pm];
  const approve = agents.filter((agent) => agent.vote === "Approve").length;
  const watch = agents.filter((agent) => agent.vote === "Watch").length;
  const reject = agents.filter((agent) => agent.vote === "Reject").length;
  const blocks = agents.filter((agent) => agent.vote === "Block").length;
  const challenges = agents.filter((agent) => agent.vote === "Challenge").length;
  const clear = agents.filter((agent) => agent.vote === "Clear").length;
  const swarmScore = Math.round(
    clamp(
      weightedAverage(agents.map((agent) => ({ score: agent.score, weight: agent.name === "Final PM Agent" ? 1.4 : 1 }))) +
        approve * 2 +
        watch -
        reject * 3 -
        blocks * 10 -
        challenges * 4
    )
  );
  const decision = swarmDecision(swarmScore, agents);
  const strongestAgent = agents
    .filter((agent) => !["Risk Agent", "Final PM Agent"].includes(agent.name))
    .sort((a, b) => b.score - a.score)[0];
  const weakestAgent = agents
    .filter((agent) => agent.name !== "Final PM Agent")
    .sort((a, b) => a.score - b.score)[0];
  const objections = [...new Set(agents.flatMap((agent) => agent.objections || []))];
  const dossier = {
    decision,
    score: swarmScore,
    consensus: {
      approve,
      watch,
      reject,
      challenge: challenges,
      block: blocks,
      clear,
      summary: `${approve} approve / ${watch} watch / ${reject} reject / ${clear} clear / ${challenges} challenge / ${blocks} block`,
    },
    agents,
    strongestAgent: strongestAgent?.name || "Unknown",
    weakestAgent: weakestAgent?.name || "Unknown",
    keyBullCase:
      strongestAgent?.thesis ||
      project.opportunityThesis ||
      "No single bull case dominates yet.",
    keyBearCase: objections[0] || "No single bear case dominates yet.",
    mustVerify: mustVerify(project, agents),
    promotionTriggers: promotionTriggers(project),
    invalidationSignals: invalidations(project),
    finalMemo: `${project.name || project.symbol || "Project"} is a ${decision}. ${pm.thesis}`,
  };

  return {
    ...project,
    dossierSwarmScore: swarmScore,
    dossierSwarmDecision: decision,
    dossierSwarmConsensus: dossier.consensus.summary,
    projectDossierSwarm: dossier,
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Project Dossier Swarm",
        signal: "specialist agent dossier review",
        score: swarmScore,
        confidence: decision === "Dossier Priority" ? 0.72 : decision === "Research Priority" ? 0.62 : 0.48,
        impact: ["Dossier Priority", "Research Priority"].includes(decision) ? "Positive" : "Neutral",
        reasons: [
          `Consensus: ${dossier.consensus.summary}.`,
          `Bull case: ${dossier.keyBullCase}`,
          `Bear case: ${dossier.keyBearCase}`,
        ],
      },
    ],
  };
}

export function analyzeProjectDossierSwarmBatch(projects = [], options = {}) {
  const limit = Number(options.limit ?? process.env.DOSSIER_SWARM_LIMIT ?? 25);
  const sorted = (Array.isArray(projects) ? projects : [])
    .map((project) => ({ project }))
    .sort(
      (a, b) =>
        num(b.project.simulationBrainScore) +
          num(b.project.aiEcosystemScore) +
          num(b.project.outcomeJudgeScore) -
        (num(a.project.simulationBrainScore) +
          num(a.project.aiEcosystemScore) +
          num(a.project.outcomeJudgeScore))
    );
  const selected = new Set(
    sorted
      .filter(({ project }, index) => shouldBuildDossier(project, index, limit))
      .map(({ project }) => project)
  );

  return (Array.isArray(projects) ? projects : []).map((project) =>
    selected.has(project)
      ? analyzeProjectDossierSwarm(project)
      : {
          ...project,
          dossierSwarmScore: 0,
          dossierSwarmDecision: "Not Dossiered",
          dossierSwarmConsensus: "not selected for deep swarm review",
          projectDossierSwarm: null,
        }
  );
}
