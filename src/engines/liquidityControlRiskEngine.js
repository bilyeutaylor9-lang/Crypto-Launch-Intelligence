function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function firstNumber(project = {}, keys = []) {
  for (const key of keys) {
    const value = key.split(".").reduce((acc, part) => acc?.[part], project);
    if (value !== undefined && value !== null && value !== "") return num(value);
  }
  return 0;
}

export function analyzeLiquidityControlRisk(project = {}) {
  const liquidityUsd = firstNumber(project, ["stableExitLiquidityUsd", "hardExitLiquidityUsd", "liquidityUsd", "liquidity"]);
  const lpLockedPct = firstNumber(project, ["lpLockedPct", "liquidityLockPct", "activeLiquidityTruth.lpLockedPct"]);
  const lpBurnedPct = firstNumber(project, ["lpBurnedPct", "activeLiquidityTruth.lpBurnedPct"]);
  const ownerLpSharePct = firstNumber(project, ["ownerLpSharePct", "deployerLpSharePct", "activeLiquidityTruth.ownerLpSharePct"]);
  const lpHolderCount = firstNumber(project, ["lpHolderCount", "securityEvidenceSummary.lpHolderCount"]);
  const lpRemovalUsd = firstNumber(project, ["lpRemovalUsd", "liquidityRemovedUsd", "recentLpRemovalUsd"]);
  const existingRisk = firstNumber(project, ["liquidityControlRisk", "activeLiquidityTruth.liquidityControlRisk"]);
  const summary = project.securityEvidenceSummary || {};

  const reasons = [];
  let risk = 0;

  if (liquidityUsd > 0 && liquidityUsd < 25_000) {
    risk += 18;
    reasons.push("Exit liquidity is very thin.");
  }
  if (lpLockedPct === 0 && lpBurnedPct === 0) {
    risk += 22;
    reasons.push("LP lock/burn evidence is missing.");
  }
  if (lpLockedPct > 0 && lpLockedPct < 45 && lpBurnedPct < 45) {
    risk += 14;
    reasons.push("LP lock/burn coverage looks partial.");
  }
  if (ownerLpSharePct >= 25) {
    risk += 26;
    reasons.push("Owner/deployer controls a large LP share.");
  }
  if (lpHolderCount > 0 && lpHolderCount <= 2) {
    risk += 12;
    reasons.push("LP holder distribution is concentrated.");
  }
  if (lpRemovalUsd > 0) {
    risk += Math.min(34, 14 + Math.log10(lpRemovalUsd + 1) * 4);
    reasons.push("Recent or reported LP removal detected.");
  }
  if (existingRisk >= 60) {
    risk += 14;
    reasons.push("Existing liquidity truth engine reports elevated control risk.");
  }
  if (summary.status === "UNKNOWN" || !project.securityEvidenceSummary) {
    risk += 8;
    reasons.push("Security evidence cannot verify LP/control claims.");
  }

  const liquidityControlRiskScore = Math.round(clamp(risk));
  const liquidityControlSafetyScore = Math.round(clamp(100 - liquidityControlRiskScore));
  const verdict =
    liquidityControlRiskScore >= 75
      ? "BLOCK_LIQUIDITY_CONTROL"
      : liquidityControlRiskScore >= 55
      ? "HIGH_LIQUIDITY_CONTROL_REVIEW"
      : liquidityControlRiskScore >= 30
      ? "LIQUIDITY_CONTROL_WATCH"
      : "LIQUIDITY_CONTROL_ACCEPTABLE";

  return {
    ...project,
    liquidityControlRiskScore,
    liquidityControlRisk: Math.max(num(project.liquidityControlRisk), liquidityControlRiskScore),
    liquidityControlSafetyScore,
    liquidityControlVerdict: verdict,
    liquidityControlEvidenceVerified: Boolean((lpLockedPct >= 45 || lpBurnedPct >= 45) && project.securityEvidenceSummary?.status !== "UNKNOWN"),
    riskFlags: [
      ...(project.riskFlags || []),
      ...(liquidityControlRiskScore >= 55 ? ["High liquidity control risk"] : []),
    ],
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Liquidity Control Risk",
        signal: "LP control and removal risk",
        score: liquidityControlSafetyScore,
        riskScore: liquidityControlRiskScore,
        confidence: project.securityEvidenceSummary?.status === "UNKNOWN" ? 0.45 : 0.68,
        impact: liquidityControlRiskScore >= 55 ? "Negative" : "Neutral",
        reasons: reasons.slice(0, 5),
      },
    ],
  };
}

export function analyzeLiquidityControlRiskBatch(projects = []) {
  return projects.map((project) => analyzeLiquidityControlRisk(project));
}
