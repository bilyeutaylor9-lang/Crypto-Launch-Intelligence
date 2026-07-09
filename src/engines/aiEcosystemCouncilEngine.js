import { summarizeAgentPerformanceMemory } from "../learning/agentPerformanceMemoryStore.js";

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

function label(score = 0) {
  if (score >= 85) return "High";
  if (score >= 70) return "Medium-High";
  if (score >= 55) return "Medium";
  if (score >= 40) return "Developing";
  return "Low";
}

function agent(name, score, stance, message) {
  return {
    name,
    score: Math.round(clamp(score)),
    stance,
    message,
  };
}

function evidenceGate(project = {}, agents = [], councilScore = 0) {
  const bullishAgents = agents.filter((item) => item.score >= 70).length;
  const riskOfficer = agents.find((item) => item.name === "Risk Officer");
  const checks = [
    {
      name: "Council score",
      passed: councilScore >= 78,
      value: councilScore,
      required: ">= 78",
    },
    {
      name: "Agent agreement",
      passed: bullishAgents >= 4,
      value: bullishAgents,
      required: ">= 4 bullish agents",
    },
    {
      name: "Data confidence",
      passed: num(project.dataConfidenceScore) >= 58,
      value: num(project.dataConfidenceScore),
      required: ">= 58",
    },
    {
      name: "Proof score",
      passed: num(project.proofScore) >= 55,
      value: num(project.proofScore),
      required: ">= 55",
    },
    {
      name: "Confidence-adjusted score",
      passed: num(project.confidenceAdjustedScore) >= 65,
      value: num(project.confidenceAdjustedScore),
      required: ">= 65",
    },
    {
      name: "Trap risk",
      passed: num(project.trapRiskScore) < 55,
      value: num(project.trapRiskScore),
      required: "< 55",
    },
    {
      name: "Risk officer",
      passed: num(riskOfficer?.score) >= 60,
      value: num(riskOfficer?.score),
      required: ">= 60",
    },
  ];
  const passed = checks.filter((check) => check.passed).length;

  return {
    passed,
    total: checks.length,
    readyForTrueStrongBuy: passed === checks.length,
    checks,
    blockers: checks.filter((check) => !check.passed).map((check) => check.name),
  };
}

function debateFor(project = {}, agents = [], gate = {}) {
  const bull = agents
    .filter((item) => ["bullish", "cleared"].includes(item.stance))
    .sort((a, b) => b.score - a.score);
  const bear = agents
    .filter((item) => ["cautious", "blocked"].includes(item.stance))
    .sort((a, b) => a.score - b.score);
  const name = project.name || project.symbol || "This project";

  return {
    bullCase: bull.slice(0, 4).map((item) => `${item.name}: ${item.message}`),
    bearCase: bear.slice(0, 4).map((item) => `${item.name}: ${item.message}`),
    moderator:
      gate.readyForTrueStrongBuy
        ? `${name} clears the evidence gate for a true AI Strong Buy research designation.`
        : `${name} does not clear every strong-buy gate yet. Blockers: ${gate.blockers.join(", ") || "none"}.`,
  };
}

function whyNow(project = {}, agents = [], gate = {}) {
  const reasons = [];
  const changes = [];
  const catalysts = [];
  const invalidations = [];

  if (num(project.narrativeHeatScore) >= 70) reasons.push("Narrative heat is elevated.");
  if (["accelerating", "improving"].includes(project.projectChangeState)) changes.push("Project trend is improving since prior scans.");
  if (num(project.externalSignalScore) >= 60) reasons.push("External research/news confirmation is present.");
  if (num(project.webResearchPriority) >= 60) reasons.push("The web research agent ranked it as a high-priority target.");
  if (num(project.catalystScore) >= 60 || num(project.catalystCalendarScore) >= 60) {
    catalysts.push("Catalyst engine sees a launch/listing/news timing cluster.");
  }
  if (num(project.prePumpPatternEdge) >= 8) reasons.push("Pattern memory resembles previous pre-breakout setups.");
  if (num(project.trapRiskScore) >= 55) invalidations.push("Trap risk must fall below the strong-buy threshold.");
  if (num(project.proofScore) < 55) invalidations.push("Proof score must improve.");
  if (num(project.confidenceAdjustedScore) < 65) invalidations.push("Confidence-adjusted score must improve.");
  if (gate.blockers?.length) invalidations.push(`Evidence gate blockers: ${gate.blockers.join(", ")}.`);

  return {
    whyThisProject: reasons.length ? reasons : ["It is the strongest relative candidate in the current scan."],
    whatChanged: changes.length ? changes : ["No major positive change detected yet."],
    catalysts: catalysts.length ? catalysts : ["No confirmed catalyst cluster yet."],
    invalidation: invalidations.length ? invalidations : ["A material rise in trap risk or fall in proof/confidence would invalidate the thesis."],
    agentAgreement: `${agents.filter((item) => item.score >= 70).length}/${agents.length}`,
  };
}

function buildAgents(project = {}) {
  const narrativeScore = avg([
    project.narrativeScore,
    project.narrativeForecastScore,
    project.narrativeHeatScore,
    project.infrastructureNarrativeScore,
    project.externalSignalScore,
  ]);
  const quantScore = avg([
    project.pipelineScore,
    project.confidenceAdjustedScore,
    project.quantumOpportunityScore,
    project.signalCombinationScore,
    project.calibrationScore,
  ]);
  const flowScore = avg([
    project.liquidityScore,
    project.liquidityExpansionScore,
    project.capitalFlowScore,
    project.buyPressureScore,
    project.smartMoneyAccumulationScore,
    project.smartWalletPerformanceScore,
  ]);
  const researchScore = avg([
    project.proofScore,
    project.dataConfidenceScore,
    project.sourceReliabilityScore,
    project.internetResearchScore,
    project.evidenceQualityScore,
  ]);
  const learningScore = avg([
    project.learningEdgeScore,
    project.outcomeLearningScore,
    project.prePumpPatternScore,
    project.projectChangeScore,
  ]);
  const riskScore = avg([
    project.trapRiskScore,
    project.riskScore,
    project.externalRiskScore,
    project.sellPressureScore,
    project.stakingRiskScore,
    project.vestingPressureScore,
    project.tokenUnlockRiskScore,
  ]);
  const riskDefense = clamp(100 - riskScore);

  return [
    agent(
      "Narrative Scout",
      narrativeScore,
      narrativeScore >= 70 ? "bullish" : narrativeScore >= 50 ? "watching" : "cautious",
      narrativeScore >= 70
        ? "Narrative heat and external attention support deeper research."
        : "Narrative evidence is not strong enough by itself."
    ),
    agent(
      "Quant Forecaster",
      quantScore,
      quantScore >= 70 ? "bullish" : quantScore >= 50 ? "watching" : "cautious",
      quantScore >= 70
        ? "Composite score stack supports an above-average setup."
        : "Composite scores need more confirmation."
    ),
    agent(
      "Flow Analyst",
      flowScore,
      flowScore >= 70 ? "bullish" : flowScore >= 50 ? "watching" : "cautious",
      flowScore >= 70
        ? "Liquidity, capital flow, or smart-money signals are constructive."
        : "Flow and smart-money support are not yet decisive."
    ),
    agent(
      "Research Analyst",
      researchScore,
      researchScore >= 70 ? "bullish" : researchScore >= 50 ? "watching" : "cautious",
      researchScore >= 70
        ? "Proof, source quality, and research confidence are strong enough to trust the setup more."
        : "Research evidence is still developing."
    ),
    agent(
      "Learning Engine",
      learningScore,
      learningScore >= 70 ? "bullish" : learningScore >= 50 ? "watching" : "cautious",
      learningScore >= 70
        ? "Historical pattern memory is supportive."
        : "Historical memory does not yet show a strong winner fit."
    ),
    agent(
      "Risk Officer",
      riskDefense,
      riskDefense >= 70 ? "cleared" : riskDefense >= 50 ? "watching" : "blocked",
      riskDefense >= 70
        ? "No dominant trap or risk cluster blocks the thesis."
        : "Risk controls require caution before calling this a strong buy."
    ),
  ];
}

function verdictFor(project = {}, councilScore = 0, agents = [], gate = {}) {
  const blocked = agents.some((item) => item.name === "Risk Officer" && item.score < 45);
  const trapRisk = num(project.trapRiskScore);

  if (blocked || trapRisk >= 70) return "Rejected By AI Council";
  if (gate.readyForTrueStrongBuy) return "AI Strong Buy";
  if (councilScore >= 65 && gate.passed >= 5 && trapRisk < 55) return "AI Priority Watch";
  if (councilScore >= 52 && trapRisk < 65) return "AI Watchlist";
  return "AI Pass For Now";
}

function applyBestCandidateFallback(projects = []) {
  if (projects.some((project) => project.aiEcosystemVerdict === "AI Strong Buy")) return projects;

  const candidates = [...projects]
    .filter((project) => num(project.trapRiskScore) < 60)
    .sort((a, b) => num(b.aiEcosystemScore) - num(a.aiEcosystemScore));
  const top = candidates[0];

  if (!top) return projects;

  return projects.map((project) => {
    if (project !== top) return project;

    return {
      ...project,
      aiEcosystemVerdict: "Best Available Strong Buy Candidate",
      aiEcosystemCaveat:
        "This is the strongest candidate in the current scan, but it still needs manual confirmation before treating it as a true strong buy.",
      alphaTags: [...new Set([...(project.alphaTags || []), "Best Available AI Candidate"])],
    };
  });
}

export function analyzeAIEcosystemCouncil(project = {}) {
  const performance = summarizeAgentPerformanceMemory();
  const weights = project.agentPerformanceWeights || performance.weights || {};
  const agents = buildAgents(project);
  const riskOfficer = agents.find((item) => item.name === "Risk Officer");
  const nonRiskAgents = agents.filter((item) => item.name !== "Risk Officer");
  const weightedNonRiskTotal = nonRiskAgents.reduce(
    (sum, item) => sum + item.score * num(weights[item.name] || 1),
    0
  );
  const nonRiskWeightTotal = nonRiskAgents.reduce(
    (sum, item) => sum + num(weights[item.name] || 1),
    0
  );
  const councilScore = Math.round(
    clamp(
      (weightedNonRiskTotal / Math.max(1, nonRiskWeightTotal)) * 0.78 +
        num(riskOfficer?.score) * num(weights["Risk Officer"] || 1) * 0.22
    )
  );
  const gate = evidenceGate(project, agents, councilScore);
  const verdict = verdictFor(project, councilScore, agents, gate);
  const debate = debateFor(project, agents, gate);
  const whyNowOutput = whyNow(project, agents, gate);
  const bullishAgents = agents.filter((item) => ["bullish", "cleared"].includes(item.stance));
  const cautiousAgents = agents.filter((item) => ["cautious", "blocked"].includes(item.stance));

  return {
    ...project,
    aiEcosystemScore: councilScore,
    aiEcosystemConfidence: label(councilScore),
    aiEcosystemVerdict: verdict,
    strongBuyEvidenceGate: gate,
    aiDebate: debate,
    whyNow: whyNowOutput,
    aiEcosystemCouncil: {
      score: councilScore,
      confidence: label(councilScore),
      verdict,
      performanceWeights: weights,
      agents,
      evidenceGate: gate,
      debate,
      whyNow: whyNowOutput,
      conversation: [
        ...bullishAgents.slice(0, 3).map((item) => `${item.name}: ${item.message}`),
        ...cautiousAgents.slice(0, 2).map((item) => `${item.name}: ${item.message}`),
        `Moderator: ${debate.moderator}`,
      ],
      summary:
        verdict === "AI Strong Buy"
          ? "Council consensus supports a strong-buy research designation."
          : verdict === "Best Available Strong Buy Candidate"
          ? "Council selected this as the best available candidate in a weak scan."
          : "Council requires more confirmation before a strong-buy designation.",
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "AI Ecosystem Council",
        signal: "multi-agent research consensus",
        score: councilScore,
        confidence: councilScore >= 75 ? 0.82 : councilScore >= 55 ? 0.62 : 0.38,
        impact:
          verdict === "AI Strong Buy" || verdict === "AI Priority Watch"
            ? "Positive"
            : verdict === "Rejected By AI Council"
            ? "Negative"
            : "Neutral",
        reasons: agents.slice(0, 4).map((item) => `${item.name} ${item.score}: ${item.stance}`),
      },
    ],
  };
}

export function analyzeAIEcosystemCouncilBatch(projects = []) {
  const analyzed = (Array.isArray(projects) ? projects : []).map(analyzeAIEcosystemCouncil);
  return applyBestCandidateFallback(analyzed);
}
