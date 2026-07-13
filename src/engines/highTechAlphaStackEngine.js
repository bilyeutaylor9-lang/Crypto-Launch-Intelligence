/**
 * High-Tech Alpha Stack Engine
 *
 * Adds ten advanced decision modules above the existing intelligence stack.
 * This engine turns raw scores into a unified institutional-style command view:
 * consensus, contradictions, decay, stress, manipulation risk, catalyst chains,
 * narrative rotation, portfolio fit, evidence gaps, and execution readiness.
 */

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function weightedAverage(items = []) {
  const active = items.filter((item) => num(item.score) > 0);

  if (!active.length) return 0;

  const total = active.reduce((sum, item) => sum + num(item.score) * item.weight, 0);
  const weight = active.reduce((sum, item) => sum + item.weight, 0);

  return Math.round(clamp(total / weight));
}

function scoreLabel(score = 0) {
  if (score >= 82) return "Elite";
  if (score >= 68) return "Strong";
  if (score >= 52) return "Developing";
  if (score >= 35) return "Weak";
  return "Poor";
}

function module(id, name, score, summary, signals = [], risks = []) {
  return {
    id,
    name,
    score: Math.round(clamp(score)),
    grade: scoreLabel(score),
    summary,
    signals: signals.filter(Boolean).slice(0, 6),
    risks: risks.filter(Boolean).slice(0, 6),
  };
}

function metaConsensus(project = {}) {
  const agents = [
    ["Pipeline", project.pipelineScore, 1.0],
    ["AI Council", project.aiEcosystemScore, 0.9],
    ["Alpha OS", project.autonomousAlphaOSScore, 1.1],
    ["Breakout Brain", project.breakoutBrainScore, 1.0],
    ["Simulation", project.simulationBrainScore, 0.9],
    ["Causal Alpha", project.causalAlphaScore, 0.9],
    ["Proof", project.proofScore, 0.8],
    ["Source Truth", project.sourceTruthScore, 0.7],
    ["Auto Weights", project.autoLearningWeightScore, 0.8],
    ["Research", project.autonomousResearchScore, 0.8],
  ];
  const active = agents
    .map(([name, score, weight]) => ({ name, score: num(score), weight }))
    .filter((agent) => agent.score > 0);
  const score = weightedAverage(active);
  const approve = active.filter((agent) => agent.score >= 65).length;
  const reject = active.filter((agent) => agent.score > 0 && agent.score < 40).length;

  return module(
    "meta_consensus_lattice",
    "Meta-Consensus Lattice",
    score + approve * 1.5 - reject * 2,
    `${approve}/${active.length || 1} active agents support the thesis.`,
    active
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((agent) => `${agent.name}: ${agent.score}`),
    reject ? [`${reject} active agents are below 40.`] : []
  );
}

function contradictionResolver(project = {}) {
  const contradictions = [];

  if (num(project.narrativeHeatScore) >= 70 && num(project.proofScore) < 45) {
    contradictions.push("hot narrative but weak proof");
  }
  if (num(project.breakoutProbabilitySoon) >= 35 && num(project.breakoutMonteCarlo?.collapseProbability) >= 30) {
    contradictions.push("breakout odds compete with elevated collapse risk");
  }
  if (num(project.smartMoneyAccumulationScore) >= 70 && num(project.sellPressureScore) >= 55) {
    contradictions.push("smart-money accumulation conflicts with sell pressure");
  }
  if (num(project.xSocialScore) >= 70 && num(project.xBotRiskScore) >= 45) {
    contradictions.push("social acceleration may be low quality");
  }
  if (num(project.pipelineScore) >= 70 && ["Low", "Developing"].includes(project.dataConfidence)) {
    contradictions.push("high score with incomplete data confidence");
  }

  const score = 100 - contradictions.length * 16 - num(project.aiDisagreement?.score) * 0.18;

  return module(
    "contradiction_resolver",
    "Contradiction Resolver",
    score,
    contradictions.length
      ? `${contradictions.length} material contradiction(s) need review.`
      : "No major contradictions detected across high-level signals.",
    contradictions.length ? [] : ["Signal stack is internally consistent."],
    contradictions
  );
}

function alphaHalfLife(project = {}) {
  const momentum = weightedAverage([
    { score: project.momentumShiftScore, weight: 1.0 },
    { score: project.earlyBreakoutScore, weight: 1.0 },
    { score: project.projectChangeScore, weight: 0.8 },
    { score: project.breakoutBrainScore, weight: 0.9 },
    { score: project.narrativeHeatScore, weight: 0.7 },
  ]);
  const decay = weightedAverage([
    { score: project.alphaDecayScore, weight: 1.0 },
    { score: project.sellPressureScore, weight: 0.9 },
    { score: project.trapRiskScore, weight: 0.8 },
    { score: project.riskScore, weight: 0.7 },
  ]);
  const score = clamp(momentum * 0.78 + (100 - decay) * 0.22);
  const halfLifeDays =
    score >= 80 ? 21 : score >= 65 ? 14 : score >= 50 ? 7 : score >= 35 ? 3 : 1;

  return module(
    "alpha_half_life",
    "Alpha Half-Life Model",
    score,
    `Estimated signal half-life: ${halfLifeDays} day(s).`,
    [`Momentum durability ${momentum}.`, `Estimated half-life ${halfLifeDays} day(s).`],
    decay >= 55 ? [`Decay pressure ${decay}.`] : []
  );
}

function liquidityStress(project = {}) {
  const liquidity = weightedAverage([
    { score: project.liquidityScore, weight: 1.0 },
    { score: project.liquidityExpansionScore, weight: 1.0 },
    { score: project.capitalFlowScore, weight: 0.9 },
    { score: project.buyPressureScore, weight: 0.8 },
  ]);
  const thinPenalty = num(project.liquidityUsd) > 0 && num(project.liquidityUsd) < 100000 ? 18 : 0;
  const score = clamp(liquidity - thinPenalty - num(project.sellPressureScore) * 0.18);
  const stressLossPct = Math.round(clamp(55 - score * 0.45 + thinPenalty, 5, 80));

  return module(
    "liquidity_stress_test",
    "Liquidity Stress Test",
    score,
    `Modeled stressed-exit drag: ${stressLossPct}%.`,
    [`Liquidity stack ${liquidity}.`, `Stressed-exit drag ${stressLossPct}%.`],
    thinPenalty ? ["Thin liquidity penalty active."] : []
  );
}

function manipulationFirewall(project = {}) {
  const bot = num(project.xBotRiskScore);
  const trap = num(project.trapRiskScore);
  const social = num(project.xSocialScore || project.socialAccelerationScore);
  const proof = num(project.proofScore);
  const score = clamp(100 - bot * 0.35 - trap * 0.35 - Math.max(0, social - proof) * 0.18 - num(project.falsePositiveSimilarity) * 0.15);

  return module(
    "manipulation_firewall",
    "Manipulation Firewall",
    score,
    score >= 70 ? "Manipulation profile is acceptable." : "Manipulation profile needs review before promotion.",
    score >= 70 ? ["Trap/bot profile is controlled."] : [],
    [
      bot >= 45 ? `Bot risk ${bot}.` : "",
      trap >= 45 ? `Trap risk ${trap}.` : "",
      social > proof + 20 ? "Social attention is ahead of proof." : "",
    ]
  );
}

function catalystChain(project = {}) {
  const catalyst = weightedAverage([
    { score: project.catalystCalendarScore, weight: 1.0 },
    { score: project.liveCatalystRadarScore, weight: 1.2 },
    { score: project.roadmapProfitabilityScore, weight: 1.0 },
    { score: project.exchangeProbabilityScore, weight: 0.8 },
    { score: project.launchReadinessScore, weight: 0.8 },
  ]);
  const chainReaction = clamp(catalyst * 0.62 + num(project.narrativeHeatScore) * 0.18 + num(project.breakoutProbabilitySoon) * 0.2);

  return module(
    "catalyst_chain_reaction",
    "Catalyst Chain Reaction Map",
    chainReaction,
    chainReaction >= 65 ? "Catalysts can plausibly trigger follow-on attention." : "Catalyst stack is not strong enough yet.",
    [
      catalyst >= 55 ? `Catalyst stack ${catalyst}.` : "",
      project.liveCatalystEvents?.[0]?.type ? `Top event: ${project.liveCatalystEvents[0].type}.` : "",
    ],
    catalyst < 45 ? ["No strong near-term catalyst cluster."] : []
  );
}

function narrativeRotation(project = {}) {
  const narrative = weightedAverage([
    { score: project.narrativeHeatScore, weight: 1.1 },
    { score: project.narrativeForecastScore, weight: 1.0 },
    { score: project.worldModelScore, weight: 0.8 },
    { score: project.infrastructureNarrativeScore, weight: 0.7 },
  ]);
  const market = num(project.marketContext?.healthyBreadth);
  const score = clamp(narrative * 0.78 + market * 0.22);

  return module(
    "narrative_rotation_radar",
    "Narrative Rotation Radar",
    score,
    score >= 65 ? "Narrative is positioned for rotation attention." : "Narrative rotation is early or unconfirmed.",
    [`Narrative stack ${narrative}.`, market ? `Market healthy breadth ${market}%.` : ""],
    score < 45 ? ["Narrative breadth is weak."] : []
  );
}

function portfolioFit(project = {}) {
  const score = weightedAverage([
    { score: project.aiPortfolioWarRoomScore, weight: 1.0 },
    { score: project.autonomousAlphaOSScore, weight: 1.0 },
    { score: project.sourceTruthScore, weight: 0.8 },
    { score: 100 - num(project.trapRiskScore), weight: 0.8 },
    { score: project.breakoutBrainConfidenceScore, weight: 0.8 },
  ]);

  return module(
    "portfolio_fit_optimizer",
    "Portfolio Fit Optimizer",
    score,
    score >= 70 ? "Fits a priority research basket." : "Needs stronger proof or lower risk for portfolio fit.",
    [
      project.allocationBucket ? `Allocation bucket: ${project.allocationBucket}.` : "",
      project.bestAutonomousStrategy?.name ? `Strategy: ${project.bestAutonomousStrategy.name}.` : "",
    ],
    score < 50 ? ["Portfolio fit is below promotion threshold."] : []
  );
}

function evidenceGapRadar(project = {}) {
  const gaps = [];

  if (num(project.proofScore) < 60) gaps.push("proof");
  if (num(project.sourceTruthScore) < 55) gaps.push("source truth");
  if (num(project.githubProScore) < 45 && num(project.developerActivityScore) < 45) gaps.push("developer evidence");
  if (num(project.liquidityScore) < 50) gaps.push("liquidity");
  if (num(project.roadmapProfitabilityScore) < 50) gaps.push("roadmap");
  if (num(project.breakoutBrainConfidenceScore) < 55) gaps.push("breakout confidence");

  const score = clamp(100 - gaps.length * 11);

  return module(
    "evidence_gap_radar",
    "Evidence Gap Radar",
    score,
    gaps.length ? `Missing evidence: ${gaps.join(", ")}.` : "No major evidence gaps detected.",
    gaps.length ? [] : ["Evidence stack is broad enough for deeper review."],
    gaps
  );
}

function executionReadiness(project = {}, modules = []) {
  const moduleAverage = weightedAverage(modules.map((item) => ({ score: item.score, weight: 1 })));
  const score = clamp(
    moduleAverage * 0.46 +
      num(project.breakoutBrainScore) * 0.18 +
      num(project.proofScore) * 0.14 +
      (100 - num(project.trapRiskScore)) * 0.12 +
      num(project.sourceTruthScore) * 0.1
  );
  const action =
    score >= 78
      ? "Priority Research"
      : score >= 64
      ? "Research Queue"
      : score >= 48
      ? "Watch Only"
      : "Do Not Promote";

  return module(
    "execution_readiness_planner",
    "Execution Readiness Planner",
    score,
    `Recommended operating mode: ${action}.`,
    [`Action: ${action}.`],
    score < 64 ? ["Needs stronger evidence before escalation."] : []
  );
}

function verdict(score = 0, modules = []) {
  const blockers = modules.filter((item) => item.score < 40).length;

  if (blockers >= 3) return "High-Tech Blocked";
  if (score >= 82) return "High-Tech Alpha Candidate";
  if (score >= 68) return "High-Tech Priority Research";
  if (score >= 52) return "High-Tech Watch";
  return "High-Tech Reject";
}

export function analyzeHighTechAlphaStack(project = {}) {
  const firstNine = [
    metaConsensus(project),
    contradictionResolver(project),
    alphaHalfLife(project),
    liquidityStress(project),
    manipulationFirewall(project),
    catalystChain(project),
    narrativeRotation(project),
    portfolioFit(project),
    evidenceGapRadar(project),
  ];
  const modules = [...firstNine, executionReadiness(project, firstNine)];
  const score = weightedAverage(
    modules.map((item) => ({
      score: item.score,
      weight:
        item.id === "meta_consensus_lattice" || item.id === "execution_readiness_planner"
          ? 1.2
          : 1,
    }))
  );
  const blockers = modules.filter((item) => item.score < 40);
  const strongest = [...modules].sort((a, b) => b.score - a.score).slice(0, 3);
  const weakest = [...modules].sort((a, b) => a.score - b.score).slice(0, 3);
  const finalVerdict = verdict(score, modules);

  return {
    ...project,
    highTechAlphaScore: score,
    highTechAlphaVerdict: finalVerdict,
    highTechAlphaConfidence:
      score >= 78 ? "High" : score >= 58 ? "Medium" : score >= 38 ? "Developing" : "Low",
    highTechModuleScores: Object.fromEntries(modules.map((item) => [item.id, item.score])),
    highTechAlphaStack: {
      score,
      verdict: finalVerdict,
      moduleCount: modules.length,
      modules,
      strongestModules: strongest,
      weakestModules: weakest,
      blockers,
      commandDecision:
        finalVerdict === "High-Tech Alpha Candidate"
          ? "Escalate for full research review"
          : finalVerdict === "High-Tech Priority Research"
          ? "Add to priority research queue"
          : finalVerdict === "High-Tech Watch"
          ? "Watch until proof and source gaps close"
          : "Do not promote until blockers clear",
      promotionTriggers: weakest.map((item) => `Improve ${item.name} above 60.`),
      killSwitches: blockers.length
        ? blockers.map((item) => `${item.name} remains below 40.`)
        : ["Trap risk spikes, liquidity contracts, or proof quality weakens."],
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "High-Tech Alpha Stack Engine",
        signal: "ten-module institutional command stack",
        score,
        confidence: score >= 78 ? 0.82 : score >= 58 ? 0.64 : 0.42,
        impact: score >= 68 ? "Positive" : blockers.length ? "Negative" : "Neutral",
        reasons: [
          `Verdict: ${finalVerdict}.`,
          `Strongest modules: ${strongest.map((item) => item.name).join(", ")}.`,
          `Weakest modules: ${weakest.map((item) => item.name).join(", ")}.`,
        ],
      },
    ],
  };
}

export function analyzeHighTechAlphaStackBatch(projects = []) {
  const analyzed = (Array.isArray(projects) ? projects : []).map(analyzeHighTechAlphaStack);
  const ranked = [...analyzed].sort((a, b) => num(b.highTechAlphaScore) - num(a.highTechAlphaScore));
  const rankByProject = new Map(ranked.map((project, index) => [project, index + 1]));

  return analyzed.map((project) => ({
    ...project,
    highTechAlphaRank: rankByProject.get(project) || 0,
  }));
}
