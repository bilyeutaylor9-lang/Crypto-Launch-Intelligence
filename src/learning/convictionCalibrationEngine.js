/**
 * Crypto Launch Intelligence
 * Conviction Calibration Engine
 *
 * Purpose:
 * Adjusts conviction using risk gates, historical similarity,
 * signal performance, and data quality.
 */

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function getBaseScore(project = {}) {
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
      project.contractRiskScore ??
      project.securityRiskScore
  );
}

function getHistoricalEdge(project = {}) {
  return clamp(project.historicalSimilarity?.historicalEdgeScore ?? 50);
}

function getSignalPerformanceBoost(project = {}) {
  const signals =
    project.signalPerformanceContext?.strongestHistoricalSignals || [];

  if (!Array.isArray(signals) || signals.length === 0) return 0;

  const strongMatches = signals.filter((signal) => {
    const key = signal.signalKey;
    const projectValue = clamp(project[key]);
    const winRate = num(signal.winRate);

    return projectValue >= 70 && winRate >= 55;
  });

  return clamp(strongMatches.length * 2.5, 0, 15);
}

function getRiskPenalty(project = {}) {
  let penalty = 0;

  const risk = getRiskScore(project);

  if (risk >= 85) penalty += 30;
  else if (risk >= 70) penalty += 20;
  else if (risk >= 55) penalty += 10;

  if (project.riskGate?.passed === false) penalty += 15;
  if (project.alreadyPumped || project.pumpExhaustion) penalty += 12;
  if (project.lowDataQuality || project.missingData) penalty += 10;

  return clamp(penalty, 0, 50);
}

function getHistoricalBoost(project = {}) {
  const edge = getHistoricalEdge(project);

  if (edge >= 85) return 15;
  if (edge >= 75) return 10;
  if (edge >= 65) return 6;
  if (edge <= 35) return -12;
  if (edge <= 45) return -6;

  return 0;
}

function labelConviction(score = 0) {
  if (score >= 90) return "Elite Conviction";
  if (score >= 82) return "High Conviction";
  if (score >= 72) return "Moderate Conviction";
  if (score >= 62) return "Speculative Conviction";
  if (score >= 50) return "Low Conviction";
  return "Avoid / Not Enough Evidence";
}

function actionFromConviction(score = 0, project = {}) {
  if (project.riskGate?.passed === false && score < 75) return "Risk-Capped Watch Only";
  if (score >= 85) return "Deep Research Priority";
  if (score >= 72) return "Watchlist Priority";
  if (score >= 62) return "Monitor";
  return "Skip";
}

function buildCalibration(project = {}) {
  const baseScore = getBaseScore(project);
  const historicalBoost = getHistoricalBoost(project);
  const signalPerformanceBoost = getSignalPerformanceBoost(project);
  const riskPenalty = getRiskPenalty(project);

  const calibratedScore = clamp(
    baseScore + historicalBoost + signalPerformanceBoost - riskPenalty
  );

  return {
    baseScore,
    calibratedScore,
    historicalBoost,
    signalPerformanceBoost,
    riskPenalty,
    historicalEdgeScore: getHistoricalEdge(project),
    riskScore: getRiskScore(project),
    convictionLabel: labelConviction(calibratedScore),
    suggestedAction: actionFromConviction(calibratedScore, project),
    summary: buildSummary(calibratedScore, historicalBoost, signalPerformanceBoost, riskPenalty)
  };
}

function buildSummary(score, historicalBoost, signalBoost, riskPenalty) {
  if (score >= 82 && riskPenalty <= 10) {
    return "Strong conviction profile supported by opportunity score and limited risk penalties.";
  }

  if (historicalBoost > 0 && signalBoost > 0) {
    return "Conviction improved because this setup matches historically stronger signals.";
  }

  if (riskPenalty >= 20) {
    return "Conviction reduced because risk conditions meaningfully weaken the opportunity profile.";
  }

  if (score < 60) {
    return "Conviction remains low due to weak evidence, weak historical support, or elevated risk.";
  }

  return "Conviction is mixed and should be treated as watchlist-level only.";
}

export function calibrateConviction(project = {}) {
  const calibration = buildCalibration(project);

  return {
    ...project,
    conviction: calibration,
    finalScore: calibration.calibratedScore,
    opportunityScore: calibration.calibratedScore,
    convictionScore: calibration.calibratedScore
  };
}

export function calibrateConvictionBatch(projects = []) {
  if (!Array.isArray(projects)) return [];
  return projects.map((project) => calibrateConviction(project));
}

export default {
  calibrateConviction,
  calibrateConvictionBatch
};
