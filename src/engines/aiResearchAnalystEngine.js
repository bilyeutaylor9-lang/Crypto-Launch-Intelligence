function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function uniq(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function top(items = [], limit = 4) {
  return items.filter(Boolean).slice(0, limit);
}

function signalReasons(project = {}) {
  const profile = project.signalProfile || {};
  const reasons = [];

  if (num(project.marketRankScore) >= 70) reasons.push("high market-rank score");
  if (num(project.narrativeForecastScore) >= 65) reasons.push("strong narrative forecast");
  if (num(project.narrativeLaunchStakingScore) >= 65) reasons.push("launch/staking alignment");
  if (num(project.liquidityExpansionScore) >= 65) reasons.push("liquidity expansion");
  if (num(project.smartMoneyAccumulationScore) >= 65) reasons.push("smart-money accumulation");
  if (num(project.smartWalletPerformanceScore) >= 65) reasons.push("smart-wallet confirmation");
  if (num(project.catalystCalendarScore) >= 65) reasons.push("near-term catalyst cluster");
  if (num(project.xSocialScore) >= 65) reasons.push("X/social acceleration");
  if (num(project.externalSignalScore) >= 60) reasons.push("external source confirmation");
  if (num(project.outcomeLearningScore) >= 65) reasons.push("resembles prior winners");
  if (num(project.prePumpPatternEdge) >= 12) {
    reasons.push(`${project.prePumpPatternMatchPct || 0}% pre-breakout pattern match`);
  }
  if (num(project.signalCombinationScore) >= 65) reasons.push("positive signal recipe");
  if (num(project.calibrationAdjustment) >= 5) reasons.push("historically calibrated edge");
  if (num(project.quantumOpportunityScore) >= 65) reasons.push("positive outcome field");
  if (num(profile.flows) >= 65) reasons.push("capital-flow support");
  if (num(profile.smartMoney) >= 65) reasons.push("smart-money cluster support");

  return uniq(reasons);
}

function riskReasons(project = {}) {
  const risks = [];

  risks.push(...(project.riskFlags || []));
  if (num(project.externalRiskScore) >= 45) risks.push("external risk language detected");
  if (num(project.sellPressureScore) >= 65) risks.push("sell pressure may overpower demand");
  if (num(project.stakingRiskScore) >= 60) risks.push("staking/yield risk needs review");
  if (num(project.xBotRiskScore) >= 45) risks.push("social quality or bot risk");
  if (num(project.outcomeTrapRisk) >= 55) risks.push("resembles prior trap outcomes");
  if (num(project.trapPatternMatchPct) >= 65 && num(project.prePumpPatternEdge) <= -8) {
    risks.push(`${project.trapPatternMatchPct}% trap-pattern match`);
  }
  if ((project.trapSignalCombinations || []).length) risks.push("active trap signal recipe");
  if (num(project.calibrationAdjustment) <= -5) risks.push("negative historical calibration");
  if (num(project.quantumOutcomeField?.collapseProbability) >= 30) risks.push("downside field is elevated");
  if (num(project.liquidityScore) > 0 && num(project.liquidityScore) < 45) risks.push("liquidity support is weak");
  if (num(project.developerActivityScore ?? project.developerScore) < 20) risks.push("developer activity is not yet visible");

  return uniq(risks);
}

function decisionFor(project = {}, bull = [], bear = []) {
  const score = num(project.pipelineScore ?? project.opportunityScore ?? project.score);
  const calibration = num(project.calibrationAdjustment);
  const trapRisk = num(project.outcomeTrapRisk);

  if (bear.length >= 4 || trapRisk >= 70 || calibration <= -8) return "Reject";
  if (score >= 85 && bull.length >= 5 && bear.length <= 2) return "Priority Watch";
  if (score >= 72 && bull.length >= 4 && bear.length <= 3) return "Watchlist";
  if (score >= 58 && bull.length >= 3) return "Monitor";
  return "Pass For Now";
}

function confidenceFor(project = {}, bull = [], bear = []) {
  const score = num(project.pipelineScore ?? project.opportunityScore ?? project.score);
  const evidenceCount = Array.isArray(project.evidence) ? project.evidence.length : 0;
  const dataBoost =
    (project.externalIntelligence?.status?.x === "SUCCESS" ? 1 : 0) +
    (project.externalIntelligence?.status?.news === "SUCCESS" ? 1 : 0);

  if (score >= 85 && bull.length >= 5 && bear.length <= 2 && evidenceCount >= 10) return "High";
  if (score >= 70 && bull.length >= 4 && evidenceCount >= 7) return "Medium";
  if (score >= 55 || dataBoost > 0 || bull.length >= 3) return "Developing";
  return "Low";
}

function buildMemo(project = {}, bull = [], bear = []) {
  const name = project.name || project.symbol || "This project";
  const bullText = bull.length ? bull.slice(0, 3).join(", ") : "limited confirmed upside signals";
  const bearText = bear.length ? bear.slice(0, 2).join(", ") : "no major thesis-breaking risk flagged";

  return `${name} is supported by ${bullText}. Main concern: ${bearText}.`;
}

function researchSteps(project = {}, bull = [], bear = []) {
  const steps = [
    "Verify official contract, token unlocks, ownership permissions, and liquidity lock status.",
    "Check whether catalyst timing is confirmed by official project channels.",
    "Compare social attention against real liquidity, holder, and wallet-flow growth.",
  ];

  if (bull.includes("smart-money accumulation") || bull.includes("smart-wallet confirmation")) {
    steps.push("Inspect top wallet entries, holding time, and prior wallet hit rate.");
  }
  if (bear.some((risk) => /staking|yield/i.test(risk))) {
    steps.push("Review staking lockups, withdrawal terms, slashing exposure, and APY sustainability.");
  }
  if (bear.some((risk) => /developer/i.test(risk))) {
    steps.push("Review GitHub, docs, audits, founder background, and public roadmap depth.");
  }
  if (project.externalIntelligence?.status?.x !== "SUCCESS") {
    steps.push("Connect X bearer token for live post-level validation.");
  }
  if (project.externalIntelligence?.status?.news !== "SUCCESS") {
    steps.push("Connect news API key for live catalyst and risk monitoring.");
  }

  return uniq(steps).slice(0, 7);
}

function analystScore(project = {}, bull = [], bear = []) {
  return Math.round(
    clamp(
      num(project.pipelineScore ?? project.opportunityScore ?? project.score) * 0.55 +
        bull.length * 5 +
        num(project.externalSignalScore) * 0.12 +
        num(project.calibrationAdjustment) * 1.4 -
        bear.length * 5 -
        num(project.externalRiskScore) * 0.12
    )
  );
}

export function analyzeAIResearchAnalyst(project = {}) {
  const bull = signalReasons(project);
  const bear = riskReasons(project);
  const decision = decisionFor(project, bull, bear);
  const confidence = confidenceFor(project, bull, bear);
  const score = analystScore(project, bull, bear);
  const thesis = {
    decision,
    confidence,
    analystScore: score,
    bullCase: top(bull, 6),
    bearCase: top(bear, 6),
    trapRisks: top(bear.filter((risk) => /trap|risk|social|liquidity|sell|staking|calibration/i.test(risk)), 5),
    keyCatalysts: top([
      ...(project.externalIntelligence?.catalystHits || []),
      ...(project.catalysts || []).map((catalyst) => catalyst.keyword || catalyst.group),
      project.strongestCatalyst?.keyword,
      project.nextCatalyst?.name,
    ], 6),
    nextResearchSteps: researchSteps(project, bull, bear),
    memo: buildMemo(project, bull, bear),
  };

  return {
    ...project,
    aiAnalystScore: score,
    aiDecision: decision,
    aiConfidence: confidence,
    aiThesis: thesis,
    evidence: [
      ...(project.evidence || []),
      {
        engine: "AI Research Analyst Engine",
        signal: "Analyst thesis synthesis",
        score,
        confidence: confidence === "High" ? 0.9 : confidence === "Medium" ? 0.72 : 0.48,
        impact:
          decision === "Priority Watch" || decision === "Watchlist"
            ? "Positive"
            : decision === "Reject"
            ? "Negative"
            : "Neutral",
        reasons: [
          thesis.memo,
          `Decision: ${decision}. Confidence: ${confidence}.`,
        ],
      },
    ],
  };
}

export function analyzeAIResearchAnalystBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeAIResearchAnalyst);
}
