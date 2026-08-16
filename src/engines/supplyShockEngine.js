import { clamp, num } from "../edge/edgeMath.js";

export function analyzeSupplyShock(project = {}) {
  const observedMintPct = num(project.totalSupplyDelta1dPct ?? project.supplyShock?.totalSupplyDelta1dPct);
  const circulatingDeltaPct = num(project.circulatingSupplyDeltaPct ?? project.supplyShock?.circulatingSupplyDeltaPct);
  const treasuryOutflowUsd = num(project.treasuryOutflowUsd ?? project.supplyShock?.treasuryOutflowUsd);
  const teamOutflowUsd = num(project.teamWalletOutflowUsd ?? project.supplyShock?.teamWalletOutflowUsd);
  const vestingOutflowUsd = num(project.vestingWalletOutflowUsd ?? project.supplyShock?.vestingWalletOutflowUsd);
  const lpRemovedPct = num(project.lpLiquidityRemovedPct ?? project.supplyShock?.lpLiquidityRemovedPct);
  const dormantActivationUsd = num(project.dormantWalletActivationUsd ?? project.supplyShock?.dormantWalletActivationUsd);
  const scheduledUnlockPct = num(project.scheduledUnlockPct ?? project.supplyShock?.scheduledUnlockPct);
  const scheduledUnlockDate = project.scheduledUnlockDate ?? project.supplyShock?.scheduledUnlockDate ?? null;
  const tokenUnlockRisk = num(project.tokenUnlockRiskScore);
  const vestingPressure = num(project.vestingPressureScore);

  const direct = [observedMintPct, circulatingDeltaPct, treasuryOutflowUsd, teamOutflowUsd, vestingOutflowUsd, lpRemovedPct, dormantActivationUsd, scheduledUnlockPct]
    .filter((value) => value !== null).length;
  if (!direct && tokenUnlockRisk === null && vestingPressure === null) {
    return {
      ...project,
      supplyShock: {
        state: "UNKNOWN",
        riskScore: null,
        evidenceMode: "NO_SUPPLY_SHOCK_EVIDENCE",
        shadowOnly: true,
      },
      supplyShockRiskScore: 0,
      supplyShockState: "UNKNOWN",
    };
  }

  const marketCap = num(project.circulatingMarketCapUsd ?? project.marketCap ?? project.marketCapUsd);
  let risk = 0;
  const reasons = [];
  if (observedMintPct !== null && observedMintPct >= 2) { risk += Math.min(30, observedMintPct * 4); reasons.push("OBSERVED_SUPPLY_EXPANSION"); }
  if (circulatingDeltaPct !== null && circulatingDeltaPct >= 2) { risk += Math.min(25, circulatingDeltaPct * 3); reasons.push("CIRCULATING_FLOAT_EXPANSION"); }
  if (scheduledUnlockPct !== null && scheduledUnlockPct >= 3) { risk += Math.min(40, scheduledUnlockPct * 3); reasons.push("SCHEDULED_UNLOCK"); }
  if (lpRemovedPct !== null && lpRemovedPct >= 5) { risk += Math.min(35, lpRemovedPct * 2); reasons.push("LP_LIQUIDITY_REMOVAL"); }
  const insiderOutflow = (treasuryOutflowUsd || 0) + (teamOutflowUsd || 0) + (vestingOutflowUsd || 0);
  if (insiderOutflow > 0 && marketCap && insiderOutflow / marketCap >= 0.005) { risk += Math.min(30, insiderOutflow / marketCap * 1000); reasons.push("INSIDER_OR_TREASURY_OUTFLOW"); }
  if (dormantActivationUsd !== null && marketCap && dormantActivationUsd / marketCap >= 0.005) { risk += 15; reasons.push("DORMANT_SUPPLY_ACTIVATION"); }
  if (tokenUnlockRisk !== null) risk += tokenUnlockRisk * 0.2;
  if (vestingPressure !== null) risk += vestingPressure * 0.15;

  risk = Math.round(clamp(risk));
  const state = risk >= 75 ? "CRITICAL_SUPPLY_PRESSURE" : risk >= 55 ? "ELEVATED_SUPPLY_PRESSURE" : risk >= 30 ? "SUPPLY_PRESSURE_WATCH" : "LOW_OBSERVED_SUPPLY_PRESSURE";

  return {
    ...project,
    supplyShock: {
      state,
      riskScore: risk,
      evidenceMode: direct ? "DIRECT_PLUS_EXISTING" : "EXISTING_DERIVED_ONLY",
      directEvidenceCount: direct,
      scheduledUnlockPct,
      scheduledUnlockDate,
      reasons,
      shadowOnly: true,
      rankingInfluence: false,
    },
    supplyShockRiskScore: risk,
    supplyShockState: state,
  };
}

export function analyzeSupplyShockBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeSupplyShock);
}
