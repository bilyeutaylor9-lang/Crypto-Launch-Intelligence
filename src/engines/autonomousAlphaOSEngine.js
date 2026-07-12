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

function risk(project = {}) {
  return Math.max(
    num(project.trapRiskScore),
    num(project.sellPressureScore),
    num(project.externalRiskScore),
    num(project.tokenUnlockRiskScore),
    num(project.vestingPressureScore),
    num(project.falsePositiveSimilarity)
  );
}

function alphaOSScore(project = {}) {
  const base = weightedAverage([
    { score: project.causalAlphaScore, weight: 1.25 },
    { score: project.strategyLabScore, weight: 1.1 },
    { score: project.paperTradeScore, weight: 0.85 },
    { score: project.simulationBrainScore, weight: 1.0 },
    { score: project.aiPortfolioWarRoomScore, weight: 0.9 },
    { score: project.alphaInvestigatorScore, weight: 0.85 },
    { score: project.liveCatalystRadarScore, weight: 0.75 },
    { score: project.proofScore, weight: 0.65 },
    { score: project.sourceReliabilityScore, weight: 0.55 },
  ]);
  const penalty = risk(project) * 0.14 + (project.redTeamReview?.status === "Block" ? 10 : 0);
  const bonus =
    project.causalAlphaVerdict === "Causal Strong Buy Candidate" ? 5 :
    project.strategyLabVerdict === "Paper Strong Buy Candidate" ? 4 :
    project.autonomousAlphaOSVerdict === "OS Best Available Candidate" ? 2 :
    0;

  return Math.round(clamp(base - penalty + bonus));
}

function agentVotes(project = {}, score = 0) {
  const agents = [
    {
      name: "Causal Brain",
      score: project.causalAlphaScore || 0,
      stance: num(project.causalAlphaScore) >= 65 ? "bullish" : num(project.causalAlphaScore) >= 45 ? "watching" : "cautious",
      note: project.causalAlphaBrain?.hypothesis || "No causal hypothesis.",
    },
    {
      name: "Strategy Lab",
      score: project.strategyLabScore || 0,
      stance: /Strong|Priority/.test(project.strategyLabVerdict || "") ? "bullish" : "watching",
      note: project.autonomousStrategyLab?.summary || "No strategy summary.",
    },
    {
      name: "Simulation Desk",
      score: project.simulationBrainScore || 0,
      stance: num(project.breakoutProbability30d) >= 58 ? "bullish" : "watching",
      note: `${project.breakoutProbability30d || 0}% breakout probability, ${project.expectedReturn30dPct || 0}% expected 30d return.`,
    },
    {
      name: "Proof Officer",
      score: weightedAverage([
        { score: project.proofScore, weight: 1 },
        { score: project.dataConfidenceScore, weight: 0.8 },
        { score: project.sourceReliabilityScore, weight: 0.8 },
      ]),
      stance: num(project.proofScore) >= 65 ? "cleared" : "cautious",
      note: `Proof ${project.proofScore || 0}, data ${project.dataConfidenceScore || 0}, source ${project.sourceReliabilityScore || 0}.`,
    },
    {
      name: "Risk Governor",
      score: Math.round(clamp(100 - risk(project))),
      stance: risk(project) >= 76 ? "blocked" : risk(project) >= 48 ? "cautious" : "cleared",
      note: `Max risk drag ${risk(project)}.`,
    },
    {
      name: "Commander",
      score,
      stance: score >= 70 ? "bullish" : score >= 50 ? "watching" : "cautious",
      note: project.aiResearchCommander?.nextAction || project.aiPortfolioWarRoom?.commanderBrief || "Await next scan.",
    },
  ];

  return {
    agents,
    approve: agents.filter((agent) => ["bullish", "cleared"].includes(agent.stance)).length,
    caution: agents.filter((agent) => agent.stance === "cautious").length,
    block: agents.filter((agent) => agent.stance === "blocked").length,
    consensus:
      agents.filter((agent) => ["bullish", "cleared"].includes(agent.stance)).length >= 4 &&
      agents.filter((agent) => agent.stance === "blocked").length === 0
        ? "Aligned"
        : agents.filter((agent) => agent.stance === "blocked").length > 0
        ? "Blocked"
        : "Mixed",
  };
}

function verdict(project = {}, score = 0, council = {}) {
  const maxRisk = risk(project);

  if (maxRisk >= 76 || council.block > 0) return "OS Risk Block";
  if (
    score >= 78 &&
    council.consensus === "Aligned" &&
    num(project.causalAlphaConfidenceScore) >= 58
  ) {
    return "OS Strong Buy Research Candidate";
  }
  if (score >= 66) return "OS Priority Research";
  if (score >= 54) return "OS Paper Trade";
  if (score >= 40) return "OS Watch";
  return "OS Reject";
}

function nextActions(project = {}, osVerdict = "") {
  const actions = [];

  if (["OS Strong Buy Research Candidate", "OS Best Available Candidate"].includes(osVerdict)) {
    actions.push("Verify the primary causal driver against raw evidence before any live decision.");
    actions.push("Run paper-trade tracking through the expected holding window.");
  }
  if ((project.paperTradingPlan?.entryTriggers || []).length) {
    actions.push(`Watch trigger: ${project.paperTradingPlan.entryTriggers[0]}`);
  }
  if ((project.causalAlphaBlockers || []).length) {
    actions.push(`Resolve blocker: ${project.causalAlphaBlockers[0].label}.`);
  }
  if (num(project.proofScore) < 60) actions.push("Upgrade proof with roadmap, GitHub, tokenomics, and source verification.");
  if (risk(project) >= 45) actions.push("Wait for risk compression before promotion.");

  return actions.length ? actions : ["Keep monitoring for fresh catalysts, liquidity, and source confirmation."];
}

function operatingMode(osVerdict = "") {
  if (osVerdict === "OS Strong Buy Research Candidate") return "Paper Priority";
  if (osVerdict === "OS Best Available Candidate") return "Best Available Paper Candidate";
  if (osVerdict === "OS Priority Research") return "Research Priority";
  if (osVerdict === "OS Paper Trade") return "Paper Watch";
  if (osVerdict === "OS Risk Block") return "Blocked";
  return "Monitor";
}

function enrichProject(project = {}) {
  const score = alphaOSScore(project);
  const council = agentVotes(project, score);
  const osVerdict = verdict(project, score, council);

  return {
    ...project,
    autonomousAlphaOSScore: score,
    autonomousAlphaOSVerdict: osVerdict,
    autonomousAlphaOSMode: operatingMode(osVerdict),
    autonomousAlphaOSCouncil: council,
    autonomousAlphaOSNextActions: nextActions(project, osVerdict),
    autonomousAlphaOS: {
      score,
      verdict: osVerdict,
      mode: operatingMode(osVerdict),
      consensus: council.consensus,
      primaryDriver: project.causalSignalGraph?.primaryDriver || null,
      bestStrategy: project.bestAutonomousStrategy || null,
      paperTradingPlan: project.paperTradingPlan || {},
      summary: `${osVerdict}: score ${score}, consensus ${council.consensus}, risk ${risk(project)}.`,
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Autonomous Alpha OS",
        signal: "final AI operating decision across causal, strategy, simulation, proof, and risk agents",
        score,
        confidence: Math.round(clamp(project.causalAlphaConfidenceScore || project.dataConfidenceScore || 50)) / 100,
        impact: score >= 66 ? "Positive" : score <= 38 ? "Negative" : "Neutral",
        reasons: [
          `Consensus: ${council.consensus}.`,
          project.causalSignalGraph?.primaryDriver
            ? `Primary driver: ${project.causalSignalGraph.primaryDriver.label}.`
            : "No primary causal driver.",
        ],
      },
    ],
  };
}

export function analyzeAutonomousAlphaOS(project = {}) {
  return enrichProject(project);
}

export function analyzeAutonomousAlphaOSBatch(projects = []) {
  const enriched = (Array.isArray(projects) ? projects : []).map(enrichProject);
  const ranked = [...enriched].sort((a, b) => num(b.autonomousAlphaOSScore) - num(a.autonomousAlphaOSScore));
  const hasStrong = enriched.some((project) => project.autonomousAlphaOSVerdict === "OS Strong Buy Research Candidate");

  if (!hasStrong && ranked[0] && num(ranked[0].autonomousAlphaOSScore) >= 34 && risk(ranked[0]) < 76) {
    const best = ranked[0];
    const bestIndex = enriched.indexOf(best);
    enriched[bestIndex] = {
      ...best,
      autonomousAlphaOSVerdict: "OS Best Available Candidate",
      autonomousAlphaOSMode: operatingMode("OS Best Available Candidate"),
      autonomousAlphaOSNextActions: nextActions(best, "OS Best Available Candidate"),
      autonomousAlphaOS: {
        ...best.autonomousAlphaOS,
        verdict: "OS Best Available Candidate",
        mode: operatingMode("OS Best Available Candidate"),
        summary: `OS Best Available Candidate: no true strong-buy setup cleared the gate, but ${best.name || best.symbol || "this project"} is the strongest risk-adjusted candidate.`,
      },
    };
  }

  const finalRanked = [...enriched].sort((a, b) => num(b.autonomousAlphaOSScore) - num(a.autonomousAlphaOSScore));
  const rankByProject = new Map(finalRanked.map((project, index) => [project, index + 1]));

  return enriched.map((project, index) => ({
    ...project,
    autonomousAlphaOSRank: rankByProject.get(project) || index + 1,
    autonomousAlphaOSPercentile:
      enriched.length <= 1
        ? 100
        : Math.round(((enriched.length - (rankByProject.get(project) || index + 1) + 1) / enriched.length) * 100),
  }));
}

export function summarizeAutonomousAlphaOS(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const rankedProjects = [...safeProjects].sort(
    (a, b) => num(b.autonomousAlphaOSScore) - num(a.autonomousAlphaOSScore)
  );

  return {
    generatedAt: new Date().toISOString(),
    totalProjects: safeProjects.length,
    counts: {
      strongBuyResearch: safeProjects.filter((project) => project.autonomousAlphaOSVerdict === "OS Strong Buy Research Candidate").length,
      bestAvailable: safeProjects.filter((project) => project.autonomousAlphaOSVerdict === "OS Best Available Candidate").length,
      priorityResearch: safeProjects.filter((project) => project.autonomousAlphaOSVerdict === "OS Priority Research").length,
      paperTrade: safeProjects.filter((project) => project.autonomousAlphaOSVerdict === "OS Paper Trade").length,
      blocked: safeProjects.filter((project) => project.autonomousAlphaOSVerdict === "OS Risk Block").length,
    },
    commanderBrief:
      rankedProjects.length > 0
        ? `Top OS candidate: ${rankedProjects[0].name || rankedProjects[0].symbol || "Unknown"} (${rankedProjects[0].autonomousAlphaOSVerdict || "Unknown"}).`
        : "No Alpha OS candidates available.",
    topCandidates: rankedProjects
      .slice(0, 50)
      .map((project) => ({
        rank: project.autonomousAlphaOSRank || 0,
        name: project.name || "Unknown",
        symbol: project.symbol || "UNKNOWN",
        chain: project.chain || "unknown",
        score: project.autonomousAlphaOSScore || 0,
        verdict: project.autonomousAlphaOSVerdict || "Unknown",
        mode: project.autonomousAlphaOSMode || "Unknown",
        consensus: project.autonomousAlphaOSCouncil?.consensus || "Unknown",
        causalScore: project.causalAlphaScore || 0,
        strategyScore: project.strategyLabScore || 0,
        simulationScore: project.simulationBrainScore || 0,
        risk: risk(project),
        primaryDriver: project.causalSignalGraph?.primaryDriver?.label || "Unknown",
        bestStrategy: project.bestAutonomousStrategy?.name || "No Strategy",
        nextActions: project.autonomousAlphaOSNextActions || [],
      })),
  };
}
