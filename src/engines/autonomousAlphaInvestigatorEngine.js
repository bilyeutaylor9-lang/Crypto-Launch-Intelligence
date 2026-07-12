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

function stance(score = 0, riskMode = false) {
  if (riskMode) {
    if (score >= 70) return "cleared";
    if (score >= 45) return "watching";
    return "blocked";
  }
  if (score >= 70) return "bullish";
  if (score >= 45) return "watching";
  return "cautious";
}

function agent(name = "", score = 0, message = "", riskMode = false) {
  return {
    name,
    score: Math.round(clamp(score)),
    stance: stance(score, riskMode),
    message,
  };
}

function buildAgents(project = {}, weights = {}) {
  const roadmap = avg([project.roadmapProfitabilityScore, project.catalystCalendarScore, project.liveCatalystRadarScore]);
  const github = avg([project.developerActivityScore, project.githubQualityScore, project.githubActivityScore]);
  const tokenomics = avg([project.tokenomicsScore, 100 - num(project.tokenUnlockRiskScore), 100 - num(project.vestingPressureScore)]);
  const catalyst = avg([project.catalystScore, project.catalystCalendarScore, project.liveCatalystRadarScore, project.exchangeProbabilityScore]);
  const liquidity = avg([project.liquidityScore, project.liquidityExpansionScore, project.capitalFlowScore, project.buyPressureScore]);
  const narrative = avg([project.narrativeScore, project.narrativeForecastScore, project.narrativeHeatScore, project.externalSignalScore]);
  const profitability = avg([
    project.simulationBrainScore,
    project.expectedReturn30dPct,
    project.breakoutProbability30d,
    project.confidenceAdjustedScore,
    project.roadmapProfitabilityScore,
  ]);
  const riskDefense = clamp(
    100 -
      Math.max(
        num(project.trapRiskScore),
        num(project.riskScore),
        num(project.externalRiskScore),
        num(project.sellPressureScore),
        num(project.falsePositiveSimilarity)
      )
  );

  return [
    agent("Roadmap Agent", roadmap, roadmap >= 60 ? "Roadmap milestones support a catalyst path." : "Roadmap does not prove enough yet."),
    agent("GitHub Agent", github, github >= 55 ? "Builder activity is visible enough to keep investigating." : "Developer proof is weak or missing."),
    agent("Tokenomics Agent", tokenomics, tokenomics >= 60 ? "Tokenomics risk does not dominate the thesis." : "Tokenomics or unlock proof needs work."),
    agent("Catalyst Agent", catalyst, catalyst >= 60 ? "Catalyst timing may create a tradable window." : "Catalyst timing is not decisive."),
    agent("Liquidity Agent", liquidity, liquidity >= 60 ? "Liquidity/flow support is constructive." : "Liquidity depth or flow confirmation is thin."),
    agent("Narrative Agent", narrative, narrative >= 60 ? "Narrative and external attention support the case." : "Narrative support is not strong enough alone."),
    agent("Profitability Agent", profitability, profitability >= 60 ? "Simulation and upside signals justify a case file." : "Profitability needs confirmation."),
    agent("Risk Agent", riskDefense, riskDefense >= 65 ? "No major risk block dominates." : "Risk remains the main gating factor.", true),
  ].map((item) => ({
    ...item,
    memoryWeight: num(weights[item.name] || weights[item.name.replace(" Agent", "")] || 1),
  }));
}

function proofGaps(project = {}) {
  return [
    ...(project.missingEvidence || []).map((item) => item.label || item.id),
    ...(num(project.proofScore) < 55 ? ["Proof score below alpha threshold"] : []),
    ...(num(project.dataConfidenceScore) < 55 ? ["Data confidence below alpha threshold"] : []),
    ...(num(project.sourceReliabilityScore) < 45 ? ["Source reliability needs confirmation"] : []),
  ].filter(Boolean).slice(0, 10);
}

function buildCaseFile(project = {}, agents = [], score = 0) {
  const bullAgents = agents.filter((item) => ["bullish", "cleared"].includes(item.stance));
  const bearAgents = agents.filter((item) => ["cautious", "blocked"].includes(item.stance));
  const gaps = proofGaps(project);
  const topCatalyst =
    project.fullRoadmap?.bestMilestone ||
    project.strongestCatalyst ||
    project.liveCatalystEvents?.[0] ||
    project.roadmapMilestones?.[0] ||
    null;

  return {
    project: project.name || project.symbol || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    score: Math.round(clamp(score)),
    profitPotential:
      score >= 78
        ? "High"
        : score >= 62
        ? "Medium-High"
        : score >= 45
        ? "Speculative"
        : "Low",
    confidence:
      gaps.length <= 2 && score >= 70
        ? "High"
        : gaps.length <= 4 && score >= 55
        ? "Medium"
        : "Low",
    bestCatalyst: topCatalyst,
    bullCase: bullAgents.slice(0, 5).map((item) => `${item.name}: ${item.message}`),
    bearCase: bearAgents.slice(0, 5).map((item) => `${item.name}: ${item.message}`),
    missingProof: gaps,
    invalidation: [
      ...(project.whyNow?.invalidation || []),
      ...(num(project.trapRiskScore) >= 55 ? ["Trap risk stays above 55."] : []),
      ...(num(project.sellPressureScore) >= 60 ? ["Sell pressure overwhelms demand."] : []),
      ...(num(project.roadmapProfitabilityScore) > 0 && num(project.roadmapProfitabilityScore) < 45
        ? ["Roadmap catalyst path fails confirmation."]
        : []),
    ].slice(0, 8),
    whatWouldPromote: [
      ...(gaps.length ? [`Resolve proof gaps: ${gaps.slice(0, 3).join(", ")}.`] : []),
      ...(num(project.liquidityExpansionScore) < 60 ? ["Liquidity expansion rises above 60."] : []),
      ...(num(project.liveCatalystRadarScore) < 60 ? ["Catalyst radar confirms a why-now event."] : []),
      ...(num(project.dataConfidenceScore) < 60 ? ["Data confidence improves above 60."] : []),
    ].slice(0, 6),
  };
}

function verdict(score = 0, project = {}, agents = []) {
  const riskAgent = agents.find((item) => item.name === "Risk Agent");
  const bullish = agents.filter((item) => ["bullish", "cleared"].includes(item.stance)).length;

  if (num(riskAgent?.score) < 40 || num(project.trapRiskScore) >= 75) return "Avoid";
  if (score >= 78 && bullish >= 6) return "Alpha Case";
  if (score >= 62 && bullish >= 4) return "Priority Investigation";
  if (score >= 45) return "Watch For Proof";
  return "Reject For Now";
}

export function analyzeAutonomousAlphaInvestigator(project = {}) {
  const memory = summarizeAgentPerformanceMemory();
  const agents = buildAgents(project, memory.weights || {});
  const weighted = agents.reduce((sum, item) => sum + item.score * Math.max(0.5, num(item.memoryWeight || 1)), 0);
  const weightTotal = agents.reduce((sum, item) => sum + Math.max(0.5, num(item.memoryWeight || 1)), 0);
  const riskPenalty = Math.max(0, num(project.trapRiskScore) - 40) * 0.22 + proofGaps(project).length * 1.7;
  const alphaScore = Math.round(clamp(weighted / Math.max(1, weightTotal) - riskPenalty));
  const caseFile = buildCaseFile(project, agents, alphaScore);
  const alphaVerdict = verdict(alphaScore, project, agents);

  return {
    ...project,
    alphaInvestigatorScore: alphaScore,
    alphaInvestigatorVerdict: alphaVerdict,
    alphaInvestigatorAgents: agents,
    alphaCaseFile: caseFile,
    autonomousAlphaInvestigator: {
      score: alphaScore,
      verdict: alphaVerdict,
      agents,
      caseFile,
      selfCorrection: {
        source: memory.file,
        agentWeights: memory.weights || {},
        note: "Agent scores are weighted by prior agent memory when available.",
      },
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Autonomous Alpha Investigator",
        signal: "multi-agent alpha case file",
        score: alphaScore,
        confidence: caseFile.confidence === "High" ? 0.82 : caseFile.confidence === "Medium" ? 0.62 : 0.38,
        impact: ["Alpha Case", "Priority Investigation"].includes(alphaVerdict) ? "Positive" : alphaVerdict === "Avoid" ? "Negative" : "Neutral",
        reasons: [alphaVerdict, caseFile.missingProof.length ? `${caseFile.missingProof.length} proof gaps remain.` : "Case file has no major proof gaps."],
      },
    ],
  };
}

export function analyzeAutonomousAlphaInvestigatorBatch(projects = []) {
  return (Array.isArray(projects) ? projects : [])
    .map(analyzeAutonomousAlphaInvestigator)
    .sort((a, b) => num(b.alphaInvestigatorScore) - num(a.alphaInvestigatorScore));
}
