import { clamp, num } from "../edge/edgeMath.js";

function ratioPct(value, denominator) {
  const n = num(value);
  const d = num(denominator);
  if (n === null || d === null || d <= 0) return null;
  return (n / d) * 100;
}

function observed(observation = {}) {
  return observation && ![
    "SENSOR_FAILED",
    "UNSUPPORTED_CHAIN",
    "MISSING_TOKEN_ADDRESS",
    "NO_TRANSFER_ACTIVITY",
  ].includes(observation.status);
}

export function analyzeSupplyLineageIntelligence(project = {}, options = {}) {
  const lineage = options.observation || project.supplyLineage || project.ignitionRawSensors?.supplyLineage || null;
  if (!lineage || !observed(lineage)) {
    const intelligence = {
      status: "UNOBSERVED",
      state: "UNOBSERVED",
      riskScore: null,
      contextualSupplyRiskUsd: null,
      vacuumIntegrityState: "UNOBSERVED",
      shadowOnly: true,
      rankingInfluence: false,
    };
    return { ...project, supplyLineageIntelligence: intelligence, supplyLineageRiskScore: null };
  }

  const referenceLiquidityUsd = num(
    project.stableExitLiquidityUsd ??
    project.activeLiquidityUsd ??
    project.dexLiquidityUsd ??
    project.liquidityUsd ??
    project.liquidityGeometry?.referenceLiquidityUsd
  );
  const sampledInventoryUsd = num(project.holderInventoryReconstruction?.sampledInventoryUsd ?? project.sampledHolderInventoryUsd);
  const nearPriceSellInventoryUsd = num(project.marginalSellerCurve?.nearPriceSellInventoryUsd ?? project.currentSellInventoryUsd);

  const confirmedSellUsd = num(lineage.confirmedSellSupplyUsd) ?? 0;
  const marketFacingUsd = num(lineage.marketFacingPotentialSupplyUsd) ?? 0;
  const stagedOneHopUsd = num(lineage.stagedOneHopSupplyUsd) ?? 0;
  const pendingStagedUsd = num(lineage.unresolvedStagedUsd) ?? 0;
  const cexUsd = num(lineage.cexDirectedSupplyUsd) ?? 0;
  const dormantWakeUsd = num(lineage.dormantWakeupUsd) ?? 0;
  const dormantMarketUsd = num(lineage.dormantMarketFacingUsd) ?? 0;
  const strategicMarketUsd = num(lineage.strategicMarketFacingUsd) ?? 0;
  const bridgeMobilityUsd = num(lineage.bridgeMobilityUsd) ?? 0;

  // Avoid double counting confirmed sells inside market-facing transfer totals.
  const unconfirmedMarketUsd = Math.max(0, marketFacingUsd - confirmedSellUsd);
  const immediateRiskUsd = confirmedSellUsd + unconfirmedMarketUsd * 0.55;
  const latentRiskUsd = stagedOneHopUsd * 0.65 + pendingStagedUsd * 0.25 + cexUsd * 0.45;
  const contextualSupplyRiskUsd = immediateRiskUsd + latentRiskUsd;
  const supplyToLiquidityPct = ratioPct(contextualSupplyRiskUsd, referenceLiquidityUsd);
  const latentToLiquidityPct = ratioPct(stagedOneHopUsd + pendingStagedUsd + cexUsd, referenceLiquidityUsd);
  const dormantToSampledInventoryPct = ratioPct(dormantWakeUsd, sampledInventoryUsd);
  const strategicToLiquidityPct = ratioPct(strategicMarketUsd, referenceLiquidityUsd);
  const confidence = clamp(num(lineage.confidencePct) ?? 35, 15, 95);

  const rawRisk = clamp(
    (supplyToLiquidityPct ?? 0) * 2.4 +
    (latentToLiquidityPct ?? 0) * 1.2 +
    (dormantToSampledInventoryPct ?? 0) * 0.45 +
    (strategicToLiquidityPct ?? 0) * 1.1 +
    (confirmedSellUsd > 0 ? 12 : 0),
    0,
    100
  );
  const riskScore = Math.round(50 + (rawRisk - 50) * (confidence / 100));

  let state = "LOW_OBSERVED_LINEAGE_RISK";
  if (confirmedSellUsd > 0 && (supplyToLiquidityPct ?? 0) >= 12) state = "ACTIVE_CONFIRMED_SUPPLY";
  else if (strategicMarketUsd > 0 && (strategicToLiquidityPct ?? 0) >= 8) state = "STRATEGIC_SUPPLY_APPROACHING_MARKET";
  else if (stagedOneHopUsd > 0 && (latentToLiquidityPct ?? 0) >= 10) state = "ONE_HOP_SUPPLY_STAGING";
  else if (dormantMarketUsd > 0 || (dormantToSampledInventoryPct ?? 0) >= 12) state = "DORMANT_SUPPLY_WAKEUP";
  else if (cexUsd > 0 && (latentToLiquidityPct ?? 0) >= 8) state = "CEX_SUPPLY_STAGING";
  else if (bridgeMobilityUsd > 0 && contextualSupplyRiskUsd === 0) state = "CROSS_CHAIN_MOBILITY_ONLY";

  const inventoryState = String(project.marginalSellerCurve?.inventoryState || project.marginalSellerInventoryState || "");
  const inventoryBurnPct = num(project.marginalSellerCurve?.nearPriceInventoryBurnPct ?? project.marginalSellerInventoryBurnPct);
  const vacuumCandidate = ["MARGINAL_SELL_INVENTORY_THINNING", "MARGINAL_SELL_INVENTORY_COLLAPSING"].includes(inventoryState) || (inventoryBurnPct !== null && inventoryBurnPct >= 25);
  const latentMaterial = (latentToLiquidityPct ?? 0) >= 10 || stagedOneHopUsd >= (nearPriceSellInventoryUsd ?? Number.POSITIVE_INFINITY) * 0.5;

  let vacuumIntegrityState = "NO_VACUUM_CLAIM";
  if (vacuumCandidate && latentMaterial) vacuumIntegrityState = "VACUUM_THREATENED_BY_ONE_HOP_SUPPLY";
  else if (vacuumCandidate && strategicMarketUsd > 0) vacuumIntegrityState = "VACUUM_THREATENED_BY_STRATEGIC_SUPPLY";
  else if (vacuumCandidate && dormantMarketUsd > 0) vacuumIntegrityState = "VACUUM_THREATENED_BY_DORMANT_WAKEUP";
  else if (vacuumCandidate && riskScore >= 70) vacuumIntegrityState = "FALSE_VACUUM_LINEAGE_RISK";
  else if (vacuumCandidate && riskScore <= 45) vacuumIntegrityState = "VACUUM_INTEGRITY_SUPPORTED";

  const intelligence = {
    status: "OBSERVED_SUPPLY_LINEAGE_INTELLIGENCE",
    state,
    riskScore,
    confidencePct: Math.round(confidence),
    contextualSupplyRiskUsd,
    immediateRiskUsd,
    latentRiskUsd,
    confirmedSellSupplyUsd: confirmedSellUsd || null,
    marketFacingPotentialSupplyUsd: marketFacingUsd || null,
    stagedOneHopSupplyUsd: stagedOneHopUsd || null,
    unresolvedStagedSupplyUsd: pendingStagedUsd || null,
    cexDirectedSupplyUsd: cexUsd || null,
    bridgeMobilityUsd: bridgeMobilityUsd || null,
    dormantWakeupUsd: dormantWakeUsd || null,
    dormantMarketFacingUsd: dormantMarketUsd || null,
    strategicMarketFacingUsd: strategicMarketUsd || null,
    supplyToLiquidityPct,
    latentToLiquidityPct,
    dormantToSampledInventoryPct,
    strategicToLiquidityPct,
    vacuumIntegrityState,
    evidence: {
      referenceLiquidityUsd,
      sampledInventoryUsd,
      nearPriceSellInventoryUsd,
      labelCoveragePct: num(lineage.labelCoveragePct),
      transferLogCount: lineage.transferLogCount ?? null,
      relevantEventCount: lineage.relevantEvents?.length ?? null,
      oneHopPathCount: lineage.oneHopPaths?.length ?? null,
    },
    policy: "Supply lineage measures observed token movement toward market-facing or staging destinations. It does not infer human intent, ownership, or guaranteed future selling. CEX deposits are potential supply staging; bridge deposits are mobility and are not treated as immediate sell pressure.",
    shadowOnly: true,
    rankingInfluence: false,
  };

  return {
    ...project,
    supplyLineageIntelligence: intelligence,
    supplyLineageRiskScore: riskScore,
    supplyLineageState: state,
    supplyLineageContextualRiskUsd: contextualSupplyRiskUsd,
    supplyVacuumIntegrityState: vacuumIntegrityState,
    oneHopSupplyRiskUsd: stagedOneHopUsd + pendingStagedUsd,
    dormantSupplyWakeupUsd: dormantWakeUsd,
  };
}

export function analyzeSupplyLineageIntelligenceBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => analyzeSupplyLineageIntelligence(project, options));
}

export default analyzeSupplyLineageIntelligence;
