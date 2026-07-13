/**
 * Self-Evolving Alpha OS Engine
 *
 * Purpose:
 * Fuses the existing intelligence stack into a higher-order research system:
 * identity graph, world model, hypothesis lab, experiment lab, agent society,
 * alpha autopsy, market-regime adaptation, thesis generation, and operator plan.
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

function confidenceLabel(score = 0) {
  if (score >= 82) return "High";
  if (score >= 68) return "Medium-High";
  if (score >= 52) return "Medium";
  if (score >= 36) return "Developing";
  return "Low";
}

function projectName(project = {}) {
  return project.name || project.symbol || "Unknown";
}

function compactUrl(value = "") {
  return String(value || "").trim();
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function maxRisk(project = {}) {
  return Math.max(
    num(project.trapRiskScore),
    num(project.sellPressureScore),
    num(project.externalRiskScore),
    num(project.tokenUnlockRiskScore),
    num(project.vestingPressureScore),
    num(project.falsePositiveSimilarity),
    num(project.xBotRiskScore)
  );
}

function projectKey(project = {}) {
  return String(
    project.address ||
      project.tokenAddress ||
      project.pairAddress ||
      project.githubIntelligencePro?.repository ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  ).toLowerCase();
}

function identityGraph(project = {}) {
  const identities = [
    { type: "symbol", value: project.symbol },
    { type: "name", value: project.name },
    { type: "chain", value: project.chain },
    { type: "contract", value: project.address || project.tokenAddress },
    { type: "pair", value: project.pairAddress },
    { type: "website", value: compactUrl(project.website || project.homepage || project.url) },
    { type: "github", value: compactUrl(project.githubIntelligencePro?.repository || project.github || project.githubUrl || project.repository) },
    { type: "source", value: project.source },
    ...(project.discoverySources || []).map((source) => ({ type: "discovery_source", value: source })),
  ].filter((item) => item.value);
  const sourceCount = unique(identities.map((item) => `${item.type}:${item.value}`)).length;
  const confidence = clamp(
    18 +
      (project.symbol ? 8 : 0) +
      (project.name ? 8 : 0) +
      (project.chain ? 8 : 0) +
      ((project.address || project.tokenAddress || project.pairAddress) ? 18 : 0) +
      ((project.website || project.homepage || project.url) ? 12 : 0) +
      ((project.githubIntelligencePro?.repository || project.github || project.githubUrl || project.repository) ? 14 : 0) +
      Math.min(20, sourceCount * 3)
  );

  return {
    id: projectKey(project),
    confidence: Math.round(confidence),
    identityCount: identities.length,
    identities,
    duplicateRisk:
      !project.address && !project.tokenAddress && !project.pairAddress && project.symbol
        ? "Symbol-only identity; may duplicate across providers."
        : "Identity has enough anchors for downstream merging.",
    mergeKeys: unique([
      project.symbol ? `symbol:${String(project.symbol).toUpperCase()}` : "",
      project.chain ? `chain:${String(project.chain).toLowerCase()}` : "",
      project.address ? `address:${String(project.address).toLowerCase()}` : "",
      project.tokenAddress ? `address:${String(project.tokenAddress).toLowerCase()}` : "",
      project.pairAddress ? `pair:${String(project.pairAddress).toLowerCase()}` : "",
      project.githubIntelligencePro?.repository ? `github:${project.githubIntelligencePro.repository}` : "",
    ]),
  };
}

function primaryNarrative(project = {}) {
  return (
    project.primaryNarrative ||
    project.narrative ||
    project.narrativeForecast?.narrative ||
    project.matchedNarratives?.[0]?.group ||
    project.alphaTags?.find((tag) => /narrative|ai|depin|rwa|base|solana|restaking/i.test(tag)) ||
    "unknown"
  );
}

function worldModel(project = {}) {
  const narrative = primaryNarrative(project);
  const nodes = unique([
    `project:${projectName(project)}`,
    project.chain ? `chain:${project.chain}` : "",
    narrative ? `narrative:${narrative}` : "",
    project.source ? `source:${project.source}` : "",
    project.githubIntelligencePro?.repository ? "builder:github" : "",
    num(project.liveCatalystRadarScore) > 0 ? "catalyst:roadmap" : "",
    num(project.smartMoneyAccumulationScore) > 0 ? "wallet:smart-money" : "",
    maxRisk(project) >= 55 ? "risk:high" : "risk:controlled",
  ]);
  const relationships = [
    { from: `project:${projectName(project)}`, to: `narrative:${narrative}`, relation: "exposed_to", strength: num(project.narrativeHeatScore || project.narrativeScore) },
    { from: `project:${projectName(project)}`, to: `chain:${project.chain || "unknown"}`, relation: "runs_on", strength: 55 },
    { from: `project:${projectName(project)}`, to: "catalyst:roadmap", relation: "may_be_moved_by", strength: num(project.liveCatalystRadarScore || project.catalystCalendarScore) },
    { from: `project:${projectName(project)}`, to: "wallet:smart-money", relation: "watched_by", strength: num(project.smartMoneyAccumulationScore) },
    { from: `project:${projectName(project)}`, to: "risk:profile", relation: "challenged_by", strength: maxRisk(project) },
  ].filter((edge) => edge.strength > 0);
  const score = weightedAverage([
    { score: project.worldModelScore, weight: 1.0 },
    { score: project.narrativeHeatScore, weight: 0.8 },
    { score: project.sourceTruthScore, weight: 0.9 },
    { score: project.githubProScore, weight: 0.6 },
    { score: project.ecosystemIntegrationScore, weight: 0.5 },
    { score: project.liveCatalystRadarScore, weight: 0.8 },
    { score: 100 - maxRisk(project), weight: 0.7 },
  ]);

  return {
    score,
    primaryNarrative: narrative,
    nodes,
    relationships,
    summary:
      score >= 70
        ? "World model has multiple reinforcing relationships."
        : score >= 50
        ? "World model is usable but still needs stronger proof."
        : "World model is sparse; treat this as early research only.",
  };
}

function hypothesisLab(project = {}) {
  const hypotheses = [
    {
      id: "catalyst_liquidity_breakout",
      thesis: "Catalyst plus liquidity expansion can create a near-term breakout window.",
      score: weightedAverage([
        { score: project.liveCatalystRadarScore || project.catalystCalendarScore, weight: 1.0 },
        { score: project.liquidityExpansionScore || project.liquidityScore, weight: 0.8 },
        { score: project.breakoutBrainScore, weight: 0.8 },
      ]),
    },
    {
      id: "builder_narrative_compounding",
      thesis: "Builder activity plus narrative heat can compound attention over a longer window.",
      score: weightedAverage([
        { score: project.githubProScore || project.developerActivityScore, weight: 0.9 },
        { score: project.narrativeHeatScore || project.narrativeForecastScore, weight: 1.0 },
        { score: project.worldModelScore, weight: 0.7 },
      ]),
    },
    {
      id: "smart_money_flow_confirmation",
      thesis: "Smart-money and capital-flow agreement can confirm early demand.",
      score: weightedAverage([
        { score: project.smartMoneyAccumulationScore, weight: 1.0 },
        { score: project.capitalFlowScore, weight: 0.8 },
        { score: project.buyPressureScore, weight: 0.7 },
      ]),
    },
    {
      id: "evidence_first_promotion",
      thesis: "Source truth and proof quality are high enough for promotion.",
      score: weightedAverage([
        { score: project.sourceTruthScore, weight: 1.0 },
        { score: project.proofScore, weight: 1.0 },
        { score: project.autonomousResearchConfidence, weight: 0.6 },
      ]),
    },
    {
      id: "trap_rejection",
      thesis: "Risk cluster may invalidate the opportunity despite upside signals.",
      bearish: true,
      score: maxRisk(project),
    },
  ].map((item) => ({
    ...item,
    score: Math.round(clamp(item.score)),
    status: item.bearish
      ? item.score >= 65
        ? "Active Risk"
        : "Controlled"
      : item.score >= 68
      ? "Supported"
      : item.score >= 48
      ? "Needs Evidence"
      : "Weak",
  }));
  const strongest = [...hypotheses].filter((item) => !item.bearish).sort((a, b) => b.score - a.score)[0] || null;
  const risk = hypotheses.find((item) => item.id === "trap_rejection");

  return {
    hypotheses,
    strongest,
    risk,
    netScore: Math.round(clamp(num(strongest?.score) - Math.max(0, num(risk?.score) - 50) * 0.45)),
  };
}

function experimentLab(project = {}) {
  const experiments = [
    {
      id: "raise_evidence_gate",
      name: "Raise evidence gate before promotion",
      expectedImpact: project.sourceTruthScore >= 65 || project.proofScore >= 65 ? "Improves precision" : "Blocks weak thesis",
      score: weightedAverage([
        { score: project.sourceTruthScore, weight: 1.0 },
        { score: project.proofScore, weight: 1.0 },
        { score: 100 - maxRisk(project), weight: 0.6 },
      ]),
    },
    {
      id: "increase_catalyst_weight",
      name: "Increase catalyst weight for the next 30 days",
      expectedImpact: num(project.liveCatalystRadarScore || project.catalystCalendarScore) >= 60 ? "Improves timing" : "No timing edge yet",
      score: weightedAverage([
        { score: project.liveCatalystRadarScore, weight: 1.0 },
        { score: project.catalystCalendarScore, weight: 0.8 },
        { score: project.roadmapProfitabilityScore, weight: 0.8 },
      ]),
    },
    {
      id: "prioritize_breakout_brain",
      name: "Prioritize Breakout Brain and simulation agreement",
      expectedImpact: project.breakoutBrainSelected ? "Promotes top-three scenario pick" : "Keeps scenario edge in watch mode",
      score: weightedAverage([
        { score: project.breakoutBrainScore, weight: 1.0 },
        { score: project.simulationBrainScore, weight: 0.8 },
        { score: project.quantumBrainScore, weight: 0.6 },
      ]),
    },
    {
      id: "penalize_false_positive_similarity",
      name: "Increase trap/autopsy penalty",
      expectedImpact: num(project.falsePositiveSimilarity || project.trapRiskScore) >= 55 ? "Reduces bad candidates" : "Risk already controlled",
      score: maxRisk(project),
      defensive: true,
    },
  ].map((experiment) => ({
    ...experiment,
    score: Math.round(clamp(experiment.score)),
    recommendation:
      experiment.defensive && experiment.score >= 55
        ? "Activate"
        : !experiment.defensive && experiment.score >= 62
        ? "Activate"
        : "Observe",
  }));

  return {
    experiments,
    activeExperiments: experiments.filter((experiment) => experiment.recommendation === "Activate"),
    summary:
      experiments.some((experiment) => experiment.recommendation === "Activate")
        ? "Experiment lab found scoring changes worth testing."
        : "Experiment lab recommends collecting more outcome evidence before changing weights.",
  };
}

function agent(name = "", score = 0, vote = "", reason = "") {
  return {
    name,
    score: Math.round(clamp(score)),
    vote,
    reason,
  };
}

function voteFromScore(score = 0, riskAgent = false) {
  if (riskAgent) {
    if (score >= 70) return "Block";
    if (score >= 50) return "Challenge";
    return "Clear";
  }
  if (score >= 72) return "Promote";
  if (score >= 52) return "Watch";
  return "Reject";
}

function agentSociety(project = {}) {
  const agents = [
    agent(
      "Discovery Agent",
      weightedAverage([
        { score: project.discoveryPriorityScore, weight: 1.0 },
        { score: project.marketRankScore, weight: 0.7 },
        { score: project.sourceReliabilityScore, weight: 0.7 },
      ]),
      "",
      "Judges whether the project deserves scan attention."
    ),
    agent(
      "Research Agent",
      weightedAverage([
        { score: project.autonomousResearchScore, weight: 1.0 },
        { score: project.sourceTruthScore, weight: 0.8 },
        { score: project.proofScore, weight: 0.8 },
      ]),
      "",
      "Judges source-backed evidence and unanswered questions."
    ),
    agent(
      "Catalyst Agent",
      weightedAverage([
        { score: project.liveCatalystRadarScore, weight: 1.0 },
        { score: project.catalystCalendarScore, weight: 0.8 },
        { score: project.roadmapProfitabilityScore, weight: 0.8 },
      ]),
      "",
      "Judges whether timing matters soon."
    ),
    agent(
      "Liquidity Agent",
      weightedAverage([
        { score: project.liquidityScore, weight: 0.8 },
        { score: project.liquidityExpansionScore, weight: 1.0 },
        { score: project.capitalFlowScore, weight: 0.8 },
        { score: project.buyPressureScore, weight: 0.7 },
      ]),
      "",
      "Judges flow, liquidity, and execution quality."
    ),
    agent(
      "Builder Agent",
      weightedAverage([
        { score: project.githubProScore, weight: 1.0 },
        { score: project.developerActivityScore, weight: 0.8 },
        { score: project.githubQualityScore, weight: 0.6 },
      ]),
      "",
      "Judges public builder activity."
    ),
    agent(
      "Simulation Agent",
      weightedAverage([
        { score: project.breakoutBrainScore, weight: 1.0 },
        { score: project.simulationBrainScore, weight: 0.8 },
        { score: project.highTechAlphaScore, weight: 0.8 },
      ]),
      "",
      "Judges scenario and high-tech stack agreement."
    ),
    agent("Risk Agent", maxRisk(project), "", "Challenges traps, bot risk, unlocks, and false positives."),
  ].map((item) => ({
    ...item,
    vote: voteFromScore(item.score, item.name === "Risk Agent"),
  }));
  const promoteVotes = agents.filter((item) => item.vote === "Promote").length;
  const watchVotes = agents.filter((item) => item.vote === "Watch").length;
  const blocks = agents.filter((item) => item.vote === "Block").length;
  const challenges = agents.filter((item) => item.vote === "Challenge").length;
  const consensusScore = Math.round(
    clamp(
      agents.reduce((sum, item) => sum + (item.name === "Risk Agent" ? 100 - item.score : item.score), 0) /
        Math.max(1, agents.length)
    )
  );

  return {
    agents,
    promoteVotes,
    watchVotes,
    challenges,
    blocks,
    consensusScore,
    committeeDecision:
      blocks > 0
        ? "Committee Block"
        : promoteVotes >= 4 && consensusScore >= 68
        ? "Committee Promote"
        : promoteVotes + watchVotes >= 4
        ? "Committee Watch"
        : "Committee Reject",
  };
}

function alphaAutopsy(project = {}) {
  const failureModes = [];

  if (num(project.falsePositiveSimilarity) >= 55) failureModes.push("resembles prior false positives");
  if (num(project.trapRiskScore) >= 55) failureModes.push("trap-risk cluster is elevated");
  if (num(project.sourceTruthScore) < 45) failureModes.push("source truth is weak");
  if (num(project.proofScore) < 45) failureModes.push("proof stack is thin");
  if (num(project.sellPressureScore) >= 60) failureModes.push("sell pressure can invalidate setup");
  if (num(project.tokenUnlockRiskScore || project.vestingPressureScore) >= 60) failureModes.push("unlock or vesting pressure needs review");
  if (project.outcomeJudgeVerdict === "Downgrade Thesis") failureModes.push("outcome judge recommends downgrade");

  const riskScore = Math.round(
    clamp(
      maxRisk(project) * 0.42 +
        (100 - num(project.sourceTruthScore || project.proofScore)) * 0.22 +
        num(project.falsePositiveSimilarity) * 0.22 +
        (project.outcomeJudgeVerdict === "Downgrade Thesis" ? 18 : 0)
    )
  );

  return {
    riskScore,
    failureModes,
    learningUpdate:
      failureModes.length > 0
        ? `Autopsy recommends stronger penalties for ${failureModes.slice(0, 2).join(" and ")}.`
        : "No major autopsy failure mode detected.",
    action:
      riskScore >= 70
        ? "Block promotion until disproven."
        : riskScore >= 50
        ? "Require extra evidence before promotion."
        : "Autopsy risk is controlled.",
  };
}

function regimeAdaptation(project = {}) {
  const context = project.marketContext || {};
  const regime = context.regime || project.marketRegime || "unknown";
  const riskOn = /bull|risk-on|expansion|alt/i.test(regime);
  const riskOff = /bear|risk-off|contraction|defensive/i.test(regime);
  const narrativeRotation = num(project.narrativeHeatScore) >= 65 || /rotation|narrative/i.test(regime);
  const weights = {
    narrative: riskOn || narrativeRotation ? 1.25 : riskOff ? 0.82 : 1,
    liquidity: riskOff ? 1.3 : 1,
    catalyst: narrativeRotation ? 1.18 : 1,
    github: riskOff ? 1.15 : 1,
    risk: riskOff ? 1.35 : 1,
  };
  const score = Math.round(
    clamp(
      num(project.narrativeHeatScore) * 0.16 * weights.narrative +
        num(project.liquidityScore || project.liquidityExpansionScore) * 0.14 * weights.liquidity +
        num(project.liveCatalystRadarScore || project.catalystCalendarScore) * 0.16 * weights.catalyst +
        num(project.githubProScore || project.developerActivityScore) * 0.1 * weights.github +
        num(project.confidenceAdjustedScore || project.pipelineScore) * 0.22 +
        num(project.breakoutBrainScore || project.highTechAlphaScore) * 0.14 -
        maxRisk(project) * 0.16 * weights.risk +
        12
    )
  );

  return {
    regime,
    weights,
    score,
    summary:
      riskOff
        ? "Regime is defensive; liquidity, proof, and risk controls matter more."
        : riskOn
        ? "Regime is constructive; narrative, momentum, and catalyst timing get more weight."
        : "Regime is neutral or unknown; use balanced weighting.",
  };
}

function thesis(project = {}, context = {}) {
  const whyNow = unique([
    num(project.liveCatalystRadarScore || project.catalystCalendarScore) >= 60 ? "Catalyst window is active." : "",
    num(project.liquidityExpansionScore || project.capitalFlowScore) >= 60 ? "Liquidity or capital flow is expanding." : "",
    num(project.narrativeHeatScore || project.narrativeForecastScore) >= 65 ? "Narrative heat is entering rotation." : "",
    num(project.githubProScore || project.developerActivityScore) >= 60 ? "Builder activity supports the thesis." : "",
    project.breakoutBrainSelected ? "Breakout Brain selected it as a top-three scenario candidate." : "",
    num(project.sourceTruthScore || project.proofScore) >= 65 ? "Evidence quality is strong enough for deeper research." : "",
  ]);
  const risks = unique([
    maxRisk(project) >= 55 ? "Risk cluster is elevated." : "",
    num(project.sourceTruthScore) < 45 ? "Source truth is incomplete." : "",
    num(project.proofScore) < 45 ? "Proof stack is thin." : "",
    num(project.githubProScore) < 35 ? "Builder evidence is weak or missing." : "",
    num(project.tokenUnlockRiskScore || project.vestingPressureScore) >= 55 ? "Unlock or vesting pressure needs review." : "",
    context.committee?.blocks ? "Agent committee has a block vote." : "",
  ]);
  const confirms = unique([
    "Official roadmap or catalyst source is verified.",
    "Liquidity and volume remain stable after the scan.",
    "Source truth and proof scores improve together.",
    "Risk agent clears trap, unlock, and bot concerns.",
    "Outcome memory shows similar setups performing well.",
  ]);
  const invalidates = unique([
    "Liquidity drops or sell pressure spikes.",
    "Catalyst cannot be verified by official or independent sources.",
    "Source truth weakens or contradiction count rises.",
    "Trap risk, bot risk, or false-positive similarity increases.",
  ]);

  return {
    project: projectName(project),
    symbol: project.symbol || "UNKNOWN",
    decision: context.decision,
    confidence: context.confidence,
    primaryDriver: context.driver,
    whyNow: whyNow.length ? whyNow : ["No immediate why-now signal; keep in research queue."],
    risks: risks.length ? risks : ["No dominant blocker, but still research-only."],
    confirms,
    invalidates,
    summary: `${projectName(project)} is ${context.decision} with ${context.confidence} confidence. Primary driver: ${context.driver}.`,
  };
}

function decide(project = {}, parts = {}) {
  const risk = maxRisk(project);
  const score = Math.round(
    clamp(
      num(parts.committee?.consensusScore) * 0.18 +
        num(parts.worldModel?.score) * 0.14 +
        num(parts.hypothesisLab?.netScore) * 0.14 +
        num(parts.experimentLab?.activeExperiments?.length) * 4 +
        num(parts.regime?.score) * 0.14 +
        num(project.highTechAlphaScore) * 0.12 +
        num(project.breakoutBrainScore) * 0.1 +
        num(project.autonomousAlphaOSScore) * 0.1 +
        num(project.sourceTruthScore || project.proofScore) * 0.08 -
        risk * 0.16
    )
  );
  const blocked = parts.committee?.blocks > 0 || parts.autopsy?.riskScore >= 78;
  const decision = blocked
    ? "Research Block"
    : score >= 76 && parts.committee?.committeeDecision === "Committee Promote"
    ? "Self-Evolving Alpha Candidate"
    : score >= 62
    ? "Priority Research"
    : score >= 45
    ? "Watch and Learn"
    : "Reject For Now";

  return {
    score,
    decision,
    confidence: confidenceLabel(
      weightedAverage([
        { score: parts.worldModel?.score, weight: 0.8 },
        { score: project.sourceTruthScore, weight: 0.9 },
        { score: project.proofScore, weight: 0.8 },
        { score: 100 - risk, weight: 0.7 },
      ])
    ),
  };
}

export function analyzeSelfEvolvingAlphaOS(project = {}) {
  const identity = identityGraph(project);
  const model = worldModel(project);
  const hypotheses = hypothesisLab(project);
  const experiments = experimentLab(project);
  const committee = agentSociety(project);
  const autopsy = alphaAutopsy(project);
  const regime = regimeAdaptation(project);
  const decision = decide(project, {
    worldModel: model,
    hypothesisLab: hypotheses,
    experimentLab: experiments,
    committee,
    autopsy,
    regime,
  });
  const strongestDriver =
    hypotheses.strongest?.thesis ||
    committee.agents.sort((a, b) => b.score - a.score)[0]?.name ||
    "No dominant driver yet";
  const researchThesis = thesis(project, {
    decision: decision.decision,
    confidence: decision.confidence,
    driver: strongestDriver,
    committee,
  });

  return {
    ...project,
    selfEvolvingAlphaOSScore: decision.score,
    selfEvolvingAlphaOSDecision: decision.decision,
    selfEvolvingAlphaOSConfidence: decision.confidence,
    selfEvolvingAlphaOS: {
      identityGraph: identity,
      worldModel: model,
      hypothesisLab: hypotheses,
      experimentLab: experiments,
      agentSociety: committee,
      alphaAutopsy: autopsy,
      regimeAdaptation: regime,
      thesis: researchThesis,
      operatorPlan: {
        nextAction:
          decision.decision === "Self-Evolving Alpha Candidate"
            ? "Promote to highest-priority research and paper tracking."
            : decision.decision === "Priority Research"
            ? "Deep research official sources and monitor catalyst/flow confirmation."
            : decision.decision === "Research Block"
            ? "Do not promote until block reason is disproven."
            : "Keep in watch memory and re-score after new evidence.",
        recheckWindow:
          decision.decision === "Self-Evolving Alpha Candidate"
            ? "6-24h"
            : decision.decision === "Priority Research"
            ? "24h"
            : "48-72h",
      },
    },
    alphaThesis: researchThesis,
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Self-Evolving Alpha OS",
        signal: "identity graph, world model, hypotheses, experiments, agent society, autopsy, regime adaptation, and thesis",
        score: decision.score,
        confidence: decision.confidence === "High" ? 0.84 : decision.confidence === "Medium-High" ? 0.72 : 0.54,
        impact:
          decision.decision === "Research Block"
            ? "Negative"
            : decision.score >= 65
            ? "Positive"
            : "Neutral",
        reasons: [
          decision.decision,
          `Committee: ${committee.committeeDecision}; consensus ${committee.consensusScore}.`,
          `World model ${model.score}; autopsy risk ${autopsy.riskScore}.`,
        ],
      },
    ],
  };
}

export function analyzeSelfEvolvingAlphaOSBatch(projects = []) {
  const scored = (Array.isArray(projects) ? projects : []).map(analyzeSelfEvolvingAlphaOS);
  const ranked = [...scored].sort((a, b) => num(b.selfEvolvingAlphaOSScore) - num(a.selfEvolvingAlphaOSScore));
  const rankByKey = new Map(ranked.map((project, index) => [projectKey(project), index + 1]));

  return scored.map((project) => ({
    ...project,
    selfEvolvingAlphaOSRank: rankByKey.get(projectKey(project)) || 0,
  }));
}

export function summarizeSelfEvolvingAlphaOS(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const ranked = [...safeProjects]
    .filter((project) => project.selfEvolvingAlphaOS)
    .sort((a, b) => num(b.selfEvolvingAlphaOSScore) - num(a.selfEvolvingAlphaOSScore));

  return {
    generatedAt: new Date().toISOString(),
    totalProjects: safeProjects.length,
    scoredProjects: ranked.length,
    alphaCandidates: ranked.filter((project) => project.selfEvolvingAlphaOSDecision === "Self-Evolving Alpha Candidate").length,
    priorityResearch: ranked.filter((project) => project.selfEvolvingAlphaOSDecision === "Priority Research").length,
    researchBlocks: ranked.filter((project) => project.selfEvolvingAlphaOSDecision === "Research Block").length,
    topProjects: ranked.slice(0, 25).map((project, index) => ({
      rank: index + 1,
      name: project.name || "Unknown",
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || "unknown",
      score: project.selfEvolvingAlphaOSScore || 0,
      decision: project.selfEvolvingAlphaOSDecision || "Unknown",
      confidence: project.selfEvolvingAlphaOSConfidence || "Unknown",
      thesis: project.alphaThesis || null,
      committeeDecision: project.selfEvolvingAlphaOS?.agentSociety?.committeeDecision || "Unknown",
      worldModelScore: project.selfEvolvingAlphaOS?.worldModel?.score || 0,
      autopsyRisk: project.selfEvolvingAlphaOS?.alphaAutopsy?.riskScore || 0,
      activeExperiments: project.selfEvolvingAlphaOS?.experimentLab?.activeExperiments || [],
      recheckWindow: project.selfEvolvingAlphaOS?.operatorPlan?.recheckWindow || "unknown",
    })),
  };
}
