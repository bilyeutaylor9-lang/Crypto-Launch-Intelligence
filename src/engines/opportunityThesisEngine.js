/**
 * Crypto Launch Intelligence
 * Opportunity Thesis Engine
 *
 * Purpose:
 * Turns raw engine scores into a readable investment/research thesis.
 * This does NOT make financial promises.
 * It explains evidence, risks, and project quality.
 */

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function getProjectName(project = {}) {
  return (
    project.name ||
    project.projectName ||
    project.symbol ||
    project.tokenSymbol ||
    "Unknown Project"
  );
}

function getScore(project = {}) {
  return clamp(
    project.finalScore ??
      project.opportunityScore ??
      project.totalScore ??
      project.score ??
      project.intelligenceScore
  );
}

function getRiskScore(project = {}) {
  return clamp(
    project.riskScore ??
      project.totalRiskScore ??
      project.securityRiskScore ??
      project.contractRiskScore
  );
}

function getSignal(project = {}, keys = []) {
  for (const key of keys) {
    if (project[key] !== undefined && project[key] !== null) {
      return clamp(project[key]);
    }
  }
  return 0;
}

function labelFromScore(score = 0) {
  if (score >= 90) return "Institutional-Grade Candidate";
  if (score >= 82) return "A-Grade Research Candidate";
  if (score >= 74) return "Strong Watchlist Candidate";
  if (score >= 64) return "Speculative Watchlist";
  if (score >= 50) return "Low-Conviction Candidate";
  return "Avoid / Insufficient Evidence";
}

function actionFromScores(score = 0, risk = 0, project = {}) {
  const alreadyPumped = Boolean(project.alreadyPumped || project.pumpExhaustion);
  const rugRisk = Boolean(project.rugRisk || project.highRugRisk);

  if (rugRisk || risk >= 85) return "Avoid";
  if (alreadyPumped) return "Avoid Chase";
  if (score >= 82 && risk < 55) return "Deep Research";
  if (score >= 70 && risk < 70) return "Watchlist";
  if (score >= 60) return "Speculative Monitor";
  return "Skip";
}

function buildStrengths(project = {}) {
  const strengths = [];

  const narrative = getSignal(project, [
    "narrativeScore",
    "narrativeStrengthScore",
    "infrastructureNarrativeScore"
  ]);

  const liquidity = getSignal(project, [
    "liquidityScore",
    "liquidityQualityScore",
    "liquidityIntelligenceScore"
  ]);

  const smartMoney = getSignal(project, [
    "smartMoneyScore",
    "smartWalletScore",
    "smartWalletAccumulationScore"
  ]);

  const momentum = getSignal(project, [
    "momentumScore",
    "marketMomentumScore",
    "prePumpScore"
  ]);

  const github = getSignal(project, [
    "githubScore",
    "developerActivityScore",
    "githubQualityScore"
  ]);

  const community = getSignal(project, [
    "communityScore",
    "communityGrowthScore",
    "socialAccelerationScore"
  ]);

  const catalysts = getSignal(project, [
    "catalystScore",
    "nearTermCatalystScore",
    "partnershipScore"
  ]);

  if (narrative >= 70) strengths.push("Strong narrative alignment with current market themes.");
  if (liquidity >= 70) strengths.push("Liquidity profile appears stronger than typical early-stage candidates.");
  if (smartMoney >= 70) strengths.push("Smart wallet or higher-quality accumulation signals are present.");
  if (momentum >= 70) strengths.push("Momentum is building before full market recognition.");
  if (github >= 70) strengths.push("Developer/GitHub activity supports project legitimacy.");
  if (community >= 70) strengths.push("Community and social acceleration are improving.");
  if (catalysts >= 70) strengths.push("Catalyst or partnership signals may support near-term attention.");

  if (strengths.length === 0) {
    strengths.push("No dominant high-confidence strength was detected yet.");
  }

  return strengths;
}

function buildRisks(project = {}) {
  const risks = [];

  const riskScore = getRiskScore(project);

  const liquidity = getSignal(project, [
    "liquidityScore",
    "liquidityQualityScore",
    "liquidityIntelligenceScore"
  ]);

  const holderRisk = getSignal(project, [
    "holderConcentrationRisk",
    "walletConcentrationRisk",
    "whaleConcentrationRisk"
  ]);

  const sellPressure = getSignal(project, [
    "sellPressureScore",
    "exitPressureScore"
  ]);

  const contractRisk = getSignal(project, [
    "contractRiskScore",
    "securityRiskScore",
    "rugRiskScore"
  ]);

  if (riskScore >= 70) risks.push("Overall risk score is elevated.");
  if (liquidity > 0 && liquidity < 45) risks.push("Liquidity may be too thin for reliable entry or exit.");
  if (holderRisk >= 65) risks.push("Holder or wallet concentration risk appears elevated.");
  if (sellPressure >= 65) risks.push("Sell pressure is elevated relative to accumulation signals.");
  if (contractRisk >= 65) risks.push("Contract/security risk needs deeper review.");
  if (project.alreadyPumped || project.pumpExhaustion) risks.push("Token may already be extended after a major move.");
  if (project.lowDataQuality || project.missingData) risks.push("Data quality is limited, so conviction should be reduced.");

  if (risks.length === 0) {
    risks.push("No major red-flag risk was detected, but manual verification is still required.");
  }

  return risks;
}

function buildThesis(project = {}) {
  const name = getProjectName(project);
  const score = getScore(project);
  const risk = getRiskScore(project);
  const label = labelFromScore(score);
  const action = actionFromScores(score, risk, project);
  const strengths = buildStrengths(project);
  const risks = buildRisks(project);

  let summary;

  if (score >= 82 && risk < 55) {
    summary = `${name} stands out as a high-quality research candidate based on multiple positive intelligence signals. The current profile suggests the project may deserve deeper investigation before broader market attention develops.`;
  } else if (score >= 70) {
    summary = `${name} shows enough positive evidence to justify watchlist placement, but the signal mix is not yet strong enough for high conviction.`;
  } else if (score >= 60) {
    summary = `${name} has some speculative signals, but the current evidence is incomplete or mixed. It should be monitored rather than prioritized.`;
  } else {
    summary = `${name} does not currently show enough confirmed evidence to rank as a strong opportunity.`;
  }

  return {
    name,
    symbol: project.symbol || project.tokenSymbol || null,
    chain: project.chain || project.network || null,
    score,
    riskScore: risk,
    label,
    suggestedAction: action,
    summary,
    strengths,
    risks,
    researchChecklist: [
      "Verify official website and socials.",
      "Check contract address against trusted sources.",
      "Review liquidity depth and lock status.",
      "Check holder concentration.",
      "Confirm GitHub/developer activity is real.",
      "Compare market cap to similar projects.",
      "Avoid chasing after extreme short-term pumps."
    ],
    disclaimer:
      "This thesis is research support only and is not financial advice."
  };
}

export function analyzeOpportunityThesis(project = {}) {
  return {
    ...project,
    opportunityThesis: buildThesis(project)
  };
}

export function analyzeOpportunityThesisBatch(projects = []) {
  if (!Array.isArray(projects)) return [];

  return projects.map((project) => analyzeOpportunityThesis(project));
}

export default {
  analyzeOpportunityThesis,
  analyzeOpportunityThesisBatch
};
