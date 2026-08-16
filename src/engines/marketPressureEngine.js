import { clamp, median, num, pctChange } from "../edge/edgeMath.js";
import { normalizeIgnitionSignals } from "../ignition/ignitionSignalNormalizer.js";

function ratioPct(numerator, denominator) {
  const n = num(numerator);
  const d = num(denominator);
  if (n === null || d === null || d <= 0) return null;
  return (n / d) * 100;
}

function sellerExhaustion(signals = {}, history = []) {
  const currentSellers = num(signals.supply?.currentUniqueSellers);
  const previousSellers = num(signals.supply?.previousUniqueSellers);
  const currentInventory = num(signals.supply?.currentSellInventoryUsd);
  const previousInventory = num(signals.supply?.previousSellInventoryUsd);

  const sellerDeclinePct = previousSellers && currentSellers !== null
    ? ((previousSellers - currentSellers) / previousSellers) * 100
    : null;
  const inventoryBurnPct = previousInventory && currentInventory !== null
    ? ((previousInventory - currentInventory) / previousInventory) * 100
    : null;

  let historicalSellerDeclinePct = null;
  if (sellerDeclinePct === null && currentSellers !== null) {
    const prior = history
      .map((row) => num(row.uniqueSellers ?? row.currentUniqueSellers ?? row.marketPressure?.currentUniqueSellers))
      .filter((value) => value !== null && value > 0);
    const baseline = median(prior.slice(-12));
    if (baseline && baseline > 0) historicalSellerDeclinePct = ((baseline - currentSellers) / baseline) * 100;
  }

  const evidence = [sellerDeclinePct, inventoryBurnPct, historicalSellerDeclinePct].filter((value) => value !== null);
  if (!evidence.length) {
    return {
      state: "UNOBSERVED",
      score: null,
      sellerDeclinePct: null,
      inventoryBurnPct: null,
      currentSellInventoryUsd: currentInventory,
      currentUniqueSellers: currentSellers,
    };
  }

  const score = clamp(
    (sellerDeclinePct ?? historicalSellerDeclinePct ?? 0) * 0.9 +
    (inventoryBurnPct ?? 0) * 0.9 +
    20,
    0,
    100
  );
  return {
    state: score >= 75 ? "SELLERS_EXHAUSTING" : score >= 55 ? "SELLER_BASE_THINNING" : score <= 30 ? "SELL_SUPPLY_REPLENISHING" : "SELLER_STATE_MIXED",
    score: Math.round(score),
    sellerDeclinePct: sellerDeclinePct ?? historicalSellerDeclinePct,
    inventoryBurnPct,
    currentSellInventoryUsd: currentInventory,
    currentUniqueSellers: currentSellers,
  };
}

function buyerReplacement(signals = {}) {
  const newBuyers = num(signals.holders?.newBuyers);
  const repeatBuyers = num(signals.holders?.repeatBuyers);
  const total = newBuyers !== null || repeatBuyers !== null ? (newBuyers ?? 0) + (repeatBuyers ?? 0) : null;
  const newBuyerSharePct = total && total > 0 && newBuyers !== null ? (newBuyers / total) * 100 : null;
  const freshRetention = num(signals.holders?.freshHolderRetention6hPct ?? signals.holders?.freshHolderRetention24hPct ?? signals.holders?.freshHolderRetention1hPct);
  const recentRetention = num(signals.holders?.recentAcquisitionRetention6hPct ?? signals.holders?.recentAcquisitionRetention1hPct);
  const retention = freshRetention ?? recentRetention;
  const retentionMode = freshRetention !== null ? "FIRST_BUYER_OR_EXISTING_FRESH_COHORT" : recentRetention !== null ? "RECENT_ACQUISITION_COHORT" : "UNOBSERVED";
  const retentionConfidence = freshRetention !== null
    ? 1
    : recentRetention !== null
      ? clamp((num(signals.holders?.retentionConfidencePct) ?? 55) / 100, 0.25, 0.75)
      : 0;
  const adjustedRetention = retention === null ? null : 50 + (retention - 50) * retentionConfidence;
  const score = newBuyerSharePct === null && adjustedRetention === null
    ? null
    : clamp((newBuyerSharePct ?? 50) * 0.55 + (adjustedRetention ?? 50) * 0.45);
  const buyerIdentityMode = signals.holders?.buyerIdentityMode || null;
  const observedHistoryMode = buyerIdentityMode === "EVM_TRANSACTION_INITIATOR_NOT_BENEFICIAL_OWNER";
  const state = score === null
    ? "UNOBSERVED"
    : observedHistoryMode
      ? score >= 72
        ? "NEW_TO_OBSERVED_HISTORY_BUYERS_EXPANDING"
        : score >= 55
          ? "OBSERVED_BUYER_REPLACEMENT_HEALTHY"
          : score <= 35
            ? "OBSERVED_BUYER_BASE_RECYCLING"
            : "OBSERVED_BUYER_REPLACEMENT_MIXED"
      : score >= 72
        ? "FRESH_BUYERS_REPLACING"
        : score >= 55
          ? "HEALTHY_BUYER_REPLACEMENT"
          : score <= 35
            ? "BUYER_COHORT_DECAY"
            : "MIXED_BUYER_REPLACEMENT";
  return {
    score: score === null ? null : Math.round(score),
    newBuyerSharePct,
    retentionPct: retention,
    adjustedRetentionPct: adjustedRetention,
    retentionMode,
    retentionConfidencePct: Math.round(retentionConfidence * 100),
    buyerIdentityMode,
    buyerResolutionCoveragePct: num(signals.holders?.buyerResolutionCoveragePct),
    state,
  };
}

function supplyPressure(signals = {}, freeFloatUsd = null) {
  const exchangeInflowUsd = num(signals.supply?.exchangeInflowUsd);
  const dormantMovedUsd = num(signals.supply?.dormantSupplyMovedUsd);
  const unlockUsd = num(signals.supply?.scheduledUnlockUsd);
  const lineageRiskUsd = num(signals.supply?.supplyLineageContextualRiskUsd);
  const lineageRiskScore = num(signals.supply?.supplyLineageRiskScore);
  const totalObservedSupplyUsd = [exchangeInflowUsd, dormantMovedUsd, unlockUsd, lineageRiskUsd]
    .filter((value) => value !== null && value > 0)
    .reduce((sum, value) => sum + value, 0);
  const hasEvidence = [exchangeInflowUsd, dormantMovedUsd, unlockUsd, lineageRiskUsd, lineageRiskScore].some((value) => value !== null);
  const freeFloatRatioPct = ratioPct(totalObservedSupplyUsd, freeFloatUsd);
  const score = !hasEvidence
    ? null
    : clamp(
        (freeFloatRatioPct ?? 0) * 2.5 +
        (exchangeInflowUsd && totalObservedSupplyUsd ? (exchangeInflowUsd / totalObservedSupplyUsd) * 20 : 0) +
        (lineageRiskScore ?? 0) * 0.35,
        0,
        100
      );
  return {
    observedSupplyUsd: hasEvidence ? totalObservedSupplyUsd : null,
    exchangeInflowUsd,
    dormantSupplyMovedUsd: dormantMovedUsd,
    scheduledUnlockUsd: unlockUsd,
    supplyLineageContextualRiskUsd: lineageRiskUsd,
    supplyLineageRiskScore: lineageRiskScore,
    supplyLineageState: signals.supply?.supplyLineageState || null,
    supplyVacuumIntegrityState: signals.supply?.supplyVacuumIntegrityState || null,
    supplyToFreeFloatPct: freeFloatRatioPct,
    score: score === null ? null : Math.round(score),
    state: score === null ? "UNOBSERVED" : score >= 70 ? "HEAVY_SUPPLY_PRESSURE" : score >= 45 ? "MEANINGFUL_SUPPLY_PRESSURE" : "LOW_OBSERVED_SUPPLY_PRESSURE",
  };
}

export function analyzeMarketPressure(project = {}, options = {}) {
  const signals = options.signals || normalizeIgnitionSignals(project);
  const history = Array.isArray(options.history) ? options.history : [];
  const trade = signals.market?.tradeWindow;
  const netFlowUsd = num(trade?.netFlowUsd);
  const buyVolumeUsd = num(trade?.buyVolumeUsd);
  const sellVolumeUsd = num(trade?.sellVolumeUsd);
  const liquidityUsd = num(signals.market?.liquidityUsd);
  const freeFloatUsd = num(project.effectiveFreeFloatUsd ?? project.effectiveFloat?.effectiveFreeFloatUsd);

  const demandPressurePct = netFlowUsd !== null && netFlowUsd > 0 ? ratioPct(netFlowUsd, liquidityUsd) : netFlowUsd !== null ? 0 : null;
  const demandToFloatPct = netFlowUsd !== null && netFlowUsd > 0 ? ratioPct(netFlowUsd, freeFloatUsd) : netFlowUsd !== null ? 0 : null;
  const imbalance = buyVolumeUsd !== null && sellVolumeUsd !== null && buyVolumeUsd + sellVolumeUsd > 0
    ? (buyVolumeUsd - sellVolumeUsd) / (buyVolumeUsd + sellVolumeUsd)
    : null;
  const demandScore = demandPressurePct === null && imbalance === null
    ? null
    : clamp((demandPressurePct ?? 0) * 4 + ((imbalance ?? 0) + 1) * 25, 0, 100);

  const sellers = sellerExhaustion(signals, history);
  const buyers = buyerReplacement(signals);
  const supply = supplyPressure(signals, freeFloatUsd);

  const priceMovePct = num(trade?.priceDeltaPct ?? signals.market?.priceChange1hPct ?? signals.market?.priceChange6hPct ?? signals.market?.priceChange24hPct);
  const priceQuiet = priceMovePct !== null ? Math.abs(priceMovePct) <= 7 : null;
  const positiveFlow = netFlowUsd !== null ? netFlowUsd > 0 : null;
  const sellerThinning = sellers.score !== null ? sellers.score >= 55 : null;
  const fakeRisk = num(signals.project?.fakeMomentumRiskScore);
  const pressureWithoutMovement = positiveFlow === true && priceQuiet === true && (sellerThinning === true || demandPressurePct !== null && demandPressurePct >= 5);

  let absorptionState = "UNKNOWN";
  if (fakeRisk !== null && fakeRisk >= 70) absorptionState = "MANIPULATION_RISK";
  else if (pressureWithoutMovement && sellers.score !== null && sellers.score >= 55) absorptionState = "POTENTIAL_ACCUMULATION_ABSORPTION";
  else if (netFlowUsd !== null && netFlowUsd < 0 && priceQuiet === true) absorptionState = "POTENTIAL_DISTRIBUTION_ABSORPTION";
  else if (positiveFlow === true && priceMovePct !== null && priceMovePct > 7) absorptionState = "DEMAND_REPRICING";

  const previousPressure = history
    .map((row) => num(row.demandPressurePct ?? row.marketPressure?.demandPressurePct))
    .filter((value) => value !== null);
  const pressureBaseline = median(previousPressure.slice(-20));
  const demandPressureAccelerationPct = pressureBaseline !== null && demandPressurePct !== null && pressureBaseline > 0
    ? pctChange(pressureBaseline, demandPressurePct)
    : null;

  const result = {
    evidenceMode: trade?.evidenceMode || "UNOBSERVED",
    flowWindow: trade?.key || null,
    flowWindowHours: num(trade?.hours),
    netFlowUsd,
    buyVolumeUsd,
    sellVolumeUsd,
    orderFlowImbalance: imbalance,
    demandPressurePct,
    demandToFloatPct,
    demandScore: demandScore === null ? null : Math.round(demandScore),
    demandPressureAccelerationPct,
    buyerReplacement: buyers,
    sellerExhaustion: sellers,
    supplyPressure: supply,
    priceMovePct,
    pressureWithoutMovement,
    absorptionState,
    shadowOnly: true,
    rankingInfluence: false,
  };

  return {
    ...project,
    marketPressure: result,
    demandPressurePct,
    demandPressureScore: result.demandScore,
    sellerExhaustionScore: sellers.score,
    sellerExhaustionState: sellers.state,
    buyerReplacementScore: buyers.score,
    supplyPressureState: supply.state,
    absorptionState,
  };
}

export function analyzeMarketPressureBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => analyzeMarketPressure(project, options));
}

export default analyzeMarketPressure;
