// src/engines/opportunityProofEngine.js

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function scoreOf(project = {}) {
  return num(project.opportunityScore ?? project.pipelineScore ?? project.score);
}

function labelForScore(score = 0) {
  if (score >= 85) return "Strong";
  if (score >= 65) return "Useful";
  if (score >= 40) return "Developing";
  return "Thin";
}

function compactText(value = "") {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function addReason(reasons, reason) {
  if (!reason?.text) return;

  const key = compactText(reason.text).toLowerCase();
  if (!key || reasons.some((item) => item.key === key)) return;

  reasons.push({
    key,
    text: compactText(reason.text),
    category: reason.category || "General",
    weight: num(reason.weight),
    polarity: reason.polarity || "positive",
  });
}

function scoreBandReason(name, score, threshold, category, weight) {
  if (num(score) < threshold) return null;
  return {
    text: `${name}: ${Math.round(num(score))}`,
    category,
    weight,
  };
}

function buildPositiveReasons(project = {}) {
  const reasons = [];
  const profile = project.signalProfile || {};

  [
    scoreBandReason("Pipeline score", scoreOf(project), 70, "Score", 10),
    scoreBandReason("Narrative strength", profile.narrative, 65, "Narrative", 9),
    scoreBandReason("Launch readiness", project.launchReadinessScore, 60, "Launch", 8),
    scoreBandReason("Staking momentum", project.stakingMomentumScore, 60, "Staking", 7),
    scoreBandReason("Momentum cluster", profile.momentum, 65, "Momentum", 8),
    scoreBandReason("Capital flow cluster", profile.flows, 65, "Flow", 8),
    scoreBandReason("Smart money cluster", profile.smartMoney, 65, "Smart Money", 9),
    scoreBandReason("X/social intelligence", profile.socialIntelligence, 65, "Social", 7),
    scoreBandReason("Pre-pump score", project.prePump?.score, 65, "Pre-Pump", 9),
    scoreBandReason("Pre-breakout pattern", project.prePumpPatternMatchPct, 60, "Pattern", 8),
    scoreBandReason("Signal combination score", project.signalCombinationScore, 65, "Learning", 8),
    scoreBandReason("Outcome learning score", project.outcomeLearningScore, 65, "Learning", 8),
    scoreBandReason("Institutional vNext score", project.institutionalVNextScore, 65, "Institutional", 9),
    scoreBandReason("Evidence quality", project.evidenceQualityScore, 55, "Evidence", 7),
    scoreBandReason("Quantum opportunity field", project.quantumOpportunityScore, 65, "Forecast", 6),
  ].forEach((reason) => addReason(reasons, reason));

  for (const tag of project.alphaTags || []) {
    addReason(reasons, {
      text: `Alpha tag: ${tag}`,
      category: "Alpha Tag",
      weight: 6,
    });
  }

  for (const evidence of project.evidence || []) {
    const confidence = num(evidence.confidence ?? evidence.score ?? 0);
    addReason(reasons, {
      text: typeof evidence === "string" ? evidence : evidence.label || evidence.text || evidence.summary,
      category: evidence.category || evidence.type || "Evidence",
      weight: confidence ? 5 + confidence * 5 : 5,
    });
  }

  return reasons
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 12)
    .map(({ key, ...reason }) => reason);
}

function buildRiskReasons(project = {}) {
  const reasons = [];
  const profile = project.signalProfile || {};

  [
    scoreBandReason("Aggregate risk", project.riskScore, 65, "Risk", 9),
    scoreBandReason("Risk cluster", profile.risk, 60, "Risk", 9),
    scoreBandReason("Staking risk", project.stakingRiskScore, 60, "Staking", 8),
    scoreBandReason("Sell pressure", project.sellPressureScore, 65, "Market", 8),
    scoreBandReason("External risk language", project.externalRiskScore, 45, "External", 7),
    scoreBandReason("Vesting pressure", project.vestingPressureScore, 60, "Tokenomics", 8),
    scoreBandReason("Token unlock risk", project.tokenUnlockRiskScore, 60, "Tokenomics", 8),
    scoreBandReason("Trap pattern match", project.trapPatternMatchPct, 60, "Pattern", 8),
    scoreBandReason("Outcome trap risk", project.outcomeTrapRisk, 55, "Learning", 7),
    scoreBandReason("Bot/social risk", project.xBotRiskScore, 50, "Social", 6),
  ].forEach((reason) => {
    if (reason) addReason(reasons, { ...reason, polarity: "risk" });
  });

  for (const flag of project.riskFlags || []) {
    addReason(reasons, {
      text: `Risk flag: ${flag}`,
      category: "Risk Flag",
      weight: 7,
      polarity: "risk",
    });
  }

  return reasons
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10)
    .map(({ key, ...reason }) => reason);
}

function buildScoreBreakdown(project = {}) {
  const profile = project.signalProfile || {};

  return [
    ["narrative", profile.narrative],
    ["launch", profile.launch],
    ["market", profile.market],
    ["momentum", profile.momentum],
    ["flows", profile.flows],
    ["smartMoney", profile.smartMoney],
    ["fundamentals", profile.fundamentals],
    ["devCommunity", profile.devCommunity],
    ["socialIntelligence", profile.socialIntelligence],
    ["learning", profile.learning],
    ["prePumpPattern", profile.prePumpPattern],
    ["signalCombos", profile.signalCombos],
    ["institutionalVNext", profile.institutionalVNext],
    ["quantumField", profile.quantumField],
    ["risk", profile.risk],
  ].reduce((breakdown, [key, value]) => {
    breakdown[key] = Math.round(num(value));
    return breakdown;
  }, {});
}

function buildWhyThisMatters(project = {}, positives = [], risks = []) {
  const name = project.name || project.symbol || "This project";
  const score = scoreOf(project);
  const topReasons = positives.slice(0, 3).map((reason) => reason.text);
  const topRisk = risks[0]?.text;

  if (!topReasons.length) {
    return `${name} does not have enough confirmed signal support yet. Keep it in low-priority monitoring until stronger evidence appears.`;
  }

  const setup = score >= 80 ? "high-priority setup" : score >= 65 ? "watchlist setup" : "early research setup";
  const riskText = topRisk ? ` Main risk to verify: ${topRisk}.` : " No single dominant risk was detected by the proof layer.";

  return `${name} is a ${setup} because ${topReasons.join("; ")}.${riskText}`;
}

function proofVerdict(score = 0, riskCount = 0, evidenceCount = 0) {
  if (score >= 80 && riskCount <= 2 && evidenceCount >= 6) return "Proof-backed opportunity";
  if (score >= 65 && evidenceCount >= 4) return "Needs manual confirmation";
  if (riskCount >= 4) return "Risk-heavy setup";
  return "Insufficient proof";
}

export function analyzeOpportunityProof(project = {}) {
  const positives = buildPositiveReasons(project);
  const risks = buildRiskReasons(project);
  const evidenceCount = positives.length;
  const riskCount = risks.length;
  const score = Math.round(
    clamp(
      scoreOf(project) * 0.42 +
        num(project.signalDensityScore) * 0.22 +
        Math.min(100, evidenceCount * 9) * 0.2 +
        num(project.dataConfidenceScore) * 0.16 -
        Math.min(28, riskCount * 5)
    )
  );

  return {
    ...project,
    proofScore: score,
    proofStrength: labelForScore(score),
    proofVerdict: proofVerdict(score, riskCount, evidenceCount),
    scoreBreakdown: buildScoreBreakdown(project),
    topEvidence: positives.slice(0, 6),
    topRisks: risks.slice(0, 5),
    whyThisMatters: buildWhyThisMatters(project, positives, risks),
    opportunityProof: {
      score,
      strength: labelForScore(score),
      verdict: proofVerdict(score, riskCount, evidenceCount),
      evidenceCount,
      riskCount,
      topEvidence: positives.slice(0, 6),
      topRisks: risks.slice(0, 5),
      scoreBreakdown: buildScoreBreakdown(project),
      summary: buildWhyThisMatters(project, positives, risks),
    },
  };
}

export function analyzeOpportunityProofBatch(projects = []) {
  return projects.map(analyzeOpportunityProof);
}
