/**
 * Crypto Launch Intelligence
 * Risk Gate Engine
 *
 * Purpose:
 * Applies hard safety caps to opportunity scores when a project has
 * major red flags such as high rug risk, weak liquidity, extreme sell
 * pressure, holder concentration, or pump exhaustion.
 */

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
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

function setScore(project = {}, score = 0) {
  return {
    ...project,
    finalScore: clamp(score),
    opportunityScore: clamp(score)
  };
}

function getSignal(project = {}, keys = []) {
  for (const key of keys) {
    if (project[key] !== undefined && project[key] !== null) {
      return clamp(project[key]);
    }
  }
  return 0;
}

function buildRiskGates(project = {}) {
  const gates = [];

  const liquidity = getSignal(project, [
    "liquidityScore",
    "liquidityQualityScore",
    "liquidityIntelligenceScore"
  ]);

  const rugRisk = getSignal(project, [
    "rugRiskScore",
    "contractRiskScore",
    "securityRiskScore"
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

  const pumpRisk = getSignal(project, [
    "pumpExhaustionScore",
    "alreadyPumpedScore",
    "overextensionScore"
  ]);

  if (rugRisk >= 85 || project.highRugRisk || project.rugRisk) {
    gates.push({
      type: "CRITICAL_RUG_OR_CONTRACT_RISK",
      severity: "critical",
      scoreCap: 49,
      reason: "Critical contract or rug-risk signal detected."
    });
  }

  if (liquidity > 0 && liquidity < 35) {
    gates.push({
      type: "THIN_LIQUIDITY",
      severity: "high",
      scoreCap: 59,
      reason: "Liquidity appears too thin for reliable entry or exit."
    });
  }

  if (holderRisk >= 80) {
    gates.push({
      type: "HIGH_HOLDER_CONCENTRATION",
      severity: "high",
      scoreCap: 64,
      reason: "Holder or wallet concentration risk is too elevated."
    });
  }

  if (sellPressure >= 80) {
    gates.push({
      type: "EXTREME_SELL_PRESSURE",
      severity: "high",
      scoreCap: 64,
      reason: "Sell pressure is extreme relative to opportunity signals."
    });
  }

  if (pumpRisk >= 80 || project.alreadyPumped || project.pumpExhaustion) {
    gates.push({
      type: "PUMP_EXHAUSTION",
      severity: "medium",
      scoreCap: 69,
      reason: "Token appears extended after a major move; avoid chasing."
    });
  }

  if (project.lowDataQuality || project.missingData) {
    gates.push({
      type: "LOW_DATA_QUALITY",
      severity: "medium",
      scoreCap: 74,
      reason: "Data quality is limited, reducing confidence."
    });
  }

  return gates;
}

function applyRiskGate(project = {}) {
  const originalScore = getScore(project);
  const gates = buildRiskGates(project);

  if (gates.length === 0) {
    return {
      ...project,
      riskGate: {
        passed: true,
        originalScore,
        adjustedScore: originalScore,
        gates: [],
        summary: "No hard risk gate triggered."
      }
    };
  }

  const strictestCap = Math.min(...gates.map((gate) => gate.scoreCap));
  const adjustedScore = Math.min(originalScore, strictestCap);

  return {
    ...setScore(project, adjustedScore),
    riskGate: {
      passed: false,
      originalScore,
      adjustedScore,
      strictestCap,
      gates,
      summary: `Risk gate applied. Score capped from ${originalScore} to ${adjustedScore}.`
    }
  };
}

export function analyzeRiskGate(project = {}) {
  return applyRiskGate(project);
}

export function analyzeRiskGateBatch(projects = []) {
  if (!Array.isArray(projects)) return [];
  return projects.map((project) => analyzeRiskGate(project));
}

export default {
  analyzeRiskGate,
  analyzeRiskGateBatch
};
