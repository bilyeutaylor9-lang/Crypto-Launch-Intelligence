// src/engines/trapRiskEngine.js

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function reason(reasons, condition, points, text) {
  if (!condition) return 0;
  reasons.push({ points, text });
  return points;
}

export function analyzeTrapRisk(project = {}) {
  const reasons = [];
  const liquidity = num(project.liquidityUsd ?? project.liquidity);
  const volume = num(project.volume24h ?? project.volume);
  const marketCap = num(project.marketCap ?? project.fdv);
  const riskScore = num(project.riskScore);
  const sellPressure = num(project.sellPressureScore);
  const stakingRisk = num(project.stakingRiskScore);
  const externalRisk = num(project.externalRiskScore);
  const botRisk = num(project.xBotRiskScore);
  const proofScore = num(project.proofScore);
  const dataConfidence = num(project.dataConfidenceScore);
  const trapPattern = num(project.trapPatternMatchPct);
  const outcomeTrap = num(project.outcomeTrapRisk);
  const volumeLiquidityRatio = liquidity > 0 ? volume / liquidity : volume > 0 ? 99 : 0;

  let score = 0;
  score += reason(reasons, liquidity > 0 && liquidity < 50000, 14, "Thin liquidity.");
  score += reason(reasons, volumeLiquidityRatio >= 8, 16, "Volume is unusually high versus liquidity.");
  score += reason(reasons, sellPressure >= 70, 14, "Sell pressure is elevated.");
  score += reason(reasons, riskScore >= 70, 14, "Aggregate risk is high.");
  score += reason(reasons, stakingRisk >= 65, 12, "Staking or yield risk is elevated.");
  score += reason(reasons, externalRisk >= 45, 10, "External risk language detected.");
  score += reason(reasons, botRisk >= 50, 10, "Social/bot risk detected.");
  score += reason(reasons, trapPattern >= 60, 14, "Matches prior trap pattern.");
  score += reason(reasons, outcomeTrap >= 55, 12, "Resembles prior poor outcomes.");
  score += reason(reasons, proofScore > 0 && proofScore < 40, 8, "Proof layer is weak.");
  score += reason(reasons, dataConfidence > 0 && dataConfidence < 35, 8, "Data confidence is low.");
  score += reason(reasons, marketCap > 0 && liquidity > 0 && marketCap / liquidity >= 80, 8, "Market cap is high relative to liquidity.");

  const trapRiskScore = Math.round(clamp(score));
  const level =
    trapRiskScore >= 80
      ? "Extreme"
      : trapRiskScore >= 60
      ? "High"
      : trapRiskScore >= 40
      ? "Medium"
      : trapRiskScore >= 20
      ? "Low"
      : "Minimal";

  return {
    ...project,
    trapRiskScore,
    trapRiskLevel: level,
    trapRisk: {
      score: trapRiskScore,
      level,
      reasons,
      summary: reasons.length
        ? reasons
            .sort((a, b) => b.points - a.points)
            .slice(0, 3)
            .map((item) => item.text)
            .join(" ")
        : "No major trap pattern detected.",
    },
    riskFlags: [
      ...(project.riskFlags || []),
      ...(trapRiskScore >= 60 ? [`${level} trap risk`] : []),
    ],
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Trap Risk Engine",
        signal: "rug/trap classifier",
        score: trapRiskScore,
        confidence: 0.68,
        impact: trapRiskScore >= 60 ? "Negative" : "Neutral",
        reasons: reasons.slice(0, 5).map((item) => item.text),
      },
    ],
  };
}

export function analyzeTrapRiskBatch(projects = []) {
  return projects.map(analyzeTrapRisk);
}
