import { num } from "../edge/edgeMath.js";

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function number(...values) {
  return num(first(...values));
}

function bool(...values) {
  const value = first(...values);
  return typeof value === "boolean" ? value : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTradeWindow(project = {}) {
  const windows = project.realTimeTradeFlow?.windows || project.marketMicrostructure?.windows || project.tradeFlowWindows || {};
  for (const [key, hours] of [["1m", 1 / 60], ["5m", 5 / 60], ["15m", 0.25], ["1h", 1], ["6h", 6], ["24h", 24]]) {
    const raw = windows[key];
    if (!raw || typeof raw !== "object") continue;
    const buy = number(raw.buyVolumeUsd, raw.buyVolume, raw.volumeBuyUsd);
    const sell = number(raw.sellVolumeUsd, raw.sellVolume, raw.volumeSellUsd);
    const net = number(raw.netAggressiveVolumeUsd, raw.netFlowUsd, buy !== null && sell !== null ? buy - sell : null);
    if (net === null && buy === null && sell === null) continue;
    return {
      key,
      hours,
      buyVolumeUsd: buy,
      sellVolumeUsd: sell,
      netFlowUsd: net,
      uniqueBuyers: number(raw.uniqueBuyers, raw.buyers),
      uniqueSellers: number(raw.uniqueSellers, raw.sellers),
      priceDeltaPct: number(raw.priceDeltaPct),
      liquidityDeltaPct: number(raw.liquidityDeltaPct),
      evidenceMode: "OBSERVED_TRADE_WINDOW",
    };
  }

  const buy = number(project.buyVolumeUsd, project.buyVolume24h, project.capitalFlowObservation?.buyVolumeUsd);
  const sell = number(project.sellVolumeUsd, project.sellVolume24h, project.capitalFlowObservation?.sellVolumeUsd);
  const net = number(
    project.netFlowUsd,
    project.capitalFlowObservation?.netFlowUsd,
    project.capitalFlow?.totalNetFlow,
    buy !== null && sell !== null ? buy - sell : null
  );
  if (net === null && buy === null && sell === null) return null;

  return {
    key: first(project.netFlowWindowLabel, project.capitalFlowObservation?.windowLabel) || null,
    hours: number(project.netFlowWindowHours, project.capitalFlowObservation?.windowHours),
    buyVolumeUsd: buy,
    sellVolumeUsd: sell,
    netFlowUsd: net,
    uniqueBuyers: number(project.uniqueBuyers, project.uniqueBuyers24h, project.buyers24h),
    uniqueSellers: number(project.uniqueSellers, project.uniqueSellers24h, project.sellers24h),
    priceDeltaPct: number(project.priceChange24h),
    liquidityDeltaPct: number(project.liquidityGrowthPct, project.liquidityFormationPct),
    evidenceMode: "OBSERVED_WINDOW_UNKNOWN",
  };
}

function normalizeDepthCurve(project = {}) {
  const source = first(
    project.depthByMovePct,
    project.liquiditySurface?.depthByMovePct,
    project.liquidityTopography?.depthByMovePct,
    project.marketDepth?.depthByMovePct
  );
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    const move = Number(String(key).replace(/[^0-9.\-]/g, ""));
    const usd = num(value);
    if (!Number.isFinite(move) || usd === null || move <= 0 || usd < 0) continue;
    out[String(move)] = usd;
  }
  return out;
}

function normalizeImpactCurve(project = {}) {
  const source = first(
    project.impactByNotionalUsd,
    project.liquiditySurface?.impactByNotionalUsd,
    project.marketDepth?.impactByNotionalUsd
  );
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    const notional = Number(String(key).replace(/[^0-9.\-]/g, ""));
    const impact = num(value);
    if (!Number.isFinite(notional) || impact === null || notional <= 0 || impact < 0) continue;
    out[String(notional)] = impact;
  }
  return out;
}

function normalizeSupplyBands(project = {}) {
  const raw = asArray(first(
    project.holderSellSupplyBands,
    project.marginalSellerBands,
    project.predictedSellSupplyBands,
    project.holderSupplyCurve?.bands
  ));
  const currentPrice = number(project.priceUsd, project.price, project.marketData?.priceUsd);
  return raw.flatMap((band) => {
    if (!band || typeof band !== "object") return [];
    let movePct = number(band.movePct, band.priceMovePct, band.upsidePct);
    const triggerPrice = number(band.triggerPriceUsd, band.priceUsd, band.price);
    if (movePct === null && currentPrice && triggerPrice) movePct = ((triggerPrice - currentPrice) / currentPrice) * 100;
    const supplyUsd = number(band.supplyUsd, band.expectedSellUsd, band.sellInventoryUsd, band.notionalUsd);
    if (movePct === null || supplyUsd === null || movePct < 0 || supplyUsd < 0) return [];
    return [{
      movePct,
      supplyUsd,
      lowerSupplyUsd: number(band.lowerSupplyUsd),
      upperSupplyUsd: number(band.upperSupplyUsd),
      confidence: number(band.confidence, band.confidencePct),
      contributingActors: number(band.contributingActors),
      source: band.source || null,
      mode: band.mode || "OBSERVED_OR_MODELED_HOLDER_SUPPLY",
    }];
  }).sort((a, b) => a.movePct - b.movePct);
}

function normalizeLiquidationBands(project = {}) {
  const raw = asArray(first(
    project.liquidationBands,
    project.derivatives?.liquidationBands,
    project.leverage?.liquidationBands,
    project.perpMarket?.liquidationBands
  ));
  const currentPrice = number(project.priceUsd, project.price, project.marketData?.priceUsd);
  return raw.flatMap((band) => {
    if (!band || typeof band !== "object") return [];
    const sideText = String(first(band.side, band.positionSide, band.type) || "").toUpperCase();
    const side = sideText.includes("SHORT") ? "SHORT" : sideText.includes("LONG") ? "LONG" : null;
    let movePct = number(band.movePct, band.priceMovePct, band.triggerMovePct);
    const triggerPrice = number(band.triggerPriceUsd, band.priceUsd, band.price);
    if (movePct === null && currentPrice && triggerPrice) movePct = ((triggerPrice - currentPrice) / currentPrice) * 100;
    const forcedFlowUsd = number(band.forcedFlowUsd, band.liquidationUsd, band.notionalUsd, band.exposureUsd);
    if (!side || movePct === null || forcedFlowUsd === null || forcedFlowUsd <= 0) return [];
    return [{
      side,
      movePct,
      forcedFlowUsd,
      confidence: number(band.confidence, band.confidencePct),
      source: band.source || null,
    }];
  }).sort((a, b) => a.movePct - b.movePct);
}

function timestampsFrom(project = {}) {
  const source = asArray(first(project.meaningfulEventTimestamps, project.ignitionEventTimestamps, project.eventTimestamps));
  return source
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
}

export function normalizeIgnitionSignals(project = {}) {
  const tradeWindow = normalizeTradeWindow(project);
  const liquidityUsd = number(
    project.stableExitLiquidityUsd,
    project.activeLiquidityUsd,
    project.dexLiquidityUsd,
    project.liquidityUsd,
    project.liquidity,
    project.capitalFlowObservation?.stableExitLiquidityUsd,
    project.capitalFlowObservation?.dexLiquidityUsd
  );
  const marketCapUsd = number(
    project.circulatingMarketCapUsd,
    project.marketCapUsd,
    project.marketCap,
    project.capitalFlowObservation?.circulatingMarketCapUsd
  );

  return {
    observedAt: first(project.observedAt, project.observationTimestamp, project.scanTimestamp) || new Date().toISOString(),
    identity: {
      chain: first(project.chain, project.canonicalChain, project.network),
      tokenAddress: first(project.tokenAddress, project.contractAddress, project.address),
      poolAddress: first(project.poolAddress, project.pairAddress, project.primaryTradablePool),
      resolved: bool(project.identityResolved, project.strictIdentityVerified, project.tokenIdentityVerified),
    },
    market: {
      priceUsd: number(project.priceUsd, project.price, project.marketData?.priceUsd, project.capitalFlowObservation?.priceUsd),
      marketCapUsd,
      fdvUsd: number(project.fdv, project.fullyDilutedValueUsd, project.capitalFlowObservation?.fullyDilutedValueUsd),
      liquidityUsd,
      priceChange1hPct: number(project.priceChange1h, project.priceChange1hPct),
      priceChange6hPct: number(project.priceChange6h, project.priceChange6hPct),
      priceChange24hPct: number(project.priceChange24h, project.priceChange24hPct),
      volume24hUsd: number(project.volume24hUsd, project.volume24h, project.volume, project.capitalFlowObservation?.dexVolumeUsd),
      tradeWindow,
    },
    supply: {
      explicitEffectiveFreeFloatUsd: number(project.effectiveFreeFloatUsd, project.freeFloatUsd, project.supplyState?.effectiveFreeFloatUsd),
      circulatingSupply: number(project.circulatingSupply, project.tokenomics?.circulatingSupply),
      totalSupply: number(project.totalSupply, project.tokenomics?.totalSupply),
      stakedPct: number(project.stakedSupplyPct, project.stakingRatioPct, project.tokenomics?.stakedPct),
      lockedPct: number(project.lockedSupplyPct, project.vestingLockedPct, project.tokenomics?.lockedPct),
      treasuryNonTradingPct: number(project.treasuryNonTradingPct, project.treasuryLockedPct),
      bridgeLockedPct: number(project.bridgeLockedSupplyPct, project.bridgeLockedPct),
      scheduledUnlockUsd: number(project.scheduledUnlockUsd, project.nextUnlockUsd, project.tokenUnlockUsd),
      scheduledUnlockPct: number(project.scheduledUnlockPct, project.nextUnlockPct, project.tokenUnlockPct),
      exchangeInflowUsd: number(project.exchangeInflowUsd, project.exchangeDepositFlowUsd, project.exchangeNetInflowUsd),
      dormantSupplyMovedUsd: number(project.dormantSupplyMovedUsd, project.reactivatedSupplyUsd),
      supplyLineageRiskScore: number(project.supplyLineageRiskScore, project.supplyLineageIntelligence?.riskScore),
      supplyLineageContextualRiskUsd: number(project.supplyLineageContextualRiskUsd, project.supplyLineageIntelligence?.contextualSupplyRiskUsd),
      supplyLineageState: first(project.supplyLineageState, project.supplyLineageIntelligence?.state),
      supplyVacuumIntegrityState: first(project.supplyVacuumIntegrityState, project.supplyLineageIntelligence?.vacuumIntegrityState),
      marketFacingSupplyUsd: number(project.marketFacingSupplyUsd, project.supplyLineage?.marketFacingPotentialSupplyUsd),
      confirmedSellSupplyUsd: number(project.confirmedSellSupplyUsd, project.supplyLineage?.confirmedSellSupplyUsd),
      cexDirectedSupplyUsd: number(project.cexDirectedSupplyUsd, project.supplyLineage?.cexDirectedSupplyUsd),
      stagedOneHopSupplyUsd: number(project.stagedOneHopSupplyUsd, project.supplyLineage?.stagedOneHopSupplyUsd),
      unresolvedStagedSupplyUsd: number(project.unresolvedStagedSupplyUsd, project.supplyLineage?.unresolvedStagedUsd),
      bridgeMobilityUsd: number(project.bridgeMobilityUsd, project.supplyLineage?.bridgeMobilityUsd),
      sampledHolderInventoryUsd: number(project.sampledHolderInventoryUsd, project.holderInventoryReconstruction?.sampledInventoryUsd),
      holderKnownCostBasisCoveragePct: number(project.holderKnownCostBasisCoveragePct, project.holderInventoryReconstruction?.knownCostBasisCoveragePct),
      holderActorBalanceCoveragePct: number(project.holderActorBalanceCoveragePct, project.holderInventoryReconstruction?.actorBalanceCoveragePct),
      marginalSellerCurveConfidencePct: number(project.marginalSellerCurveConfidencePct, project.marginalSellerCurve?.confidencePct),
      marginalSellerInventoryBurnPct: number(project.marginalSellerInventoryBurnPct, project.marginalSellerCurve?.nearPriceInventoryBurnPct),
      marginalSellerInventoryState: first(project.marginalSellerInventoryState, project.marginalSellerCurve?.inventoryState),
      previousSellInventoryUsd: number(project.previousSellInventoryUsd, project.marginalSellerCurve?.previousNearPriceSellInventoryUsd, project.sellerInventory?.previousUsd),
      currentSellInventoryUsd: number(project.currentSellInventoryUsd, project.marginalSellerCurve?.nearPriceSellInventoryUsd, project.sellerInventory?.currentUsd),
      previousUniqueSellers: number(
        project.priorResolvedUniqueSellers1h,
        project.economicParticipantFlow?.windows?.["1h"]?.priorUniqueEconomicSellers,
        project.previousUniqueSellers,
        project.sellerInventory?.previousUniqueSellers
      ),
      currentUniqueSellers: number(
        project.resolvedUniqueSellers1h,
        project.economicParticipantFlow?.windows?.["1h"]?.uniqueEconomicSellers,
        project.currentUniqueSellers,
        tradeWindow?.uniqueSellers,
        project.uniqueSellers24h
      ),
      holderSellSupplyBands: normalizeSupplyBands(project),
    },
    liquidity: {
      depthByMovePct: normalizeDepthCurve(project),
      impactByNotionalUsd: normalizeImpactCurve(project),
      activeLiquidityUsd: number(project.activeLiquidityUsd, project.liquiditySurface?.activeLiquidityUsd, liquidityUsd),
      liquidityAddedUsd: number(project.liquidityAddedUsd, project.capitalFlowObservation?.liquidityAddedUsd),
      liquidityRemovedUsd: number(project.liquidityRemovedUsd, project.capitalFlowObservation?.liquidityRemovedUsd),
      refillHalfLifeMinutes: number(project.liquidityRefillHalfLifeMinutes, project.liquidityRefill?.halfLifeMinutes),
      initialImpactPct: number(project.initialPriceImpactPct, project.priceImpactStudy?.initialImpactPct),
      residualImpactPct: number(project.residualPriceImpactPct, project.priceImpactStudy?.residualImpactPct),
      lpInventoryStressScore: number(project.lpInventoryStressScore, project.liquiditySurface?.lpInventoryStressScore),
    },
    leverage: {
      openInterestUsd: number(project.openInterestUsd, project.derivatives?.openInterestUsd, project.perpMarket?.openInterestUsd),
      shortOpenInterestUsd: number(project.shortOpenInterestUsd, project.derivatives?.shortOpenInterestUsd),
      longOpenInterestUsd: number(project.longOpenInterestUsd, project.derivatives?.longOpenInterestUsd),
      fundingRate: number(project.fundingRate, project.derivatives?.fundingRate, project.perpMarket?.fundingRate),
      liquidationBands: normalizeLiquidationBands(project),
    },
    protocol: {
      buybackUsd24h: number(project.protocolBuybackUsd24h, project.buybackUsd24h, project.valueCapture?.buybackUsd24h),
      burnUsd24h: number(project.protocolBurnUsd24h, project.burnUsd24h, project.valueCapture?.burnUsd24h),
      stakingDemandUsd24h: number(project.stakingDemandUsd24h, project.validatorStakingDemandUsd24h),
      revenueUsd24h: number(project.protocolRevenueUsd24h, project.revenue24hUsd),
      revenueGrowthPct: number(project.protocolRevenueGrowthPct, project.revenueGrowthPct),
      feesGrowthPct: number(project.protocolFeeGrowthPct, project.feeGrowthPct),
      forcedDemandVerified: bool(project.forcedDemandVerified, project.valueCapture?.verified),
    },
    capitalPreparation: {
      state: first(project.prePositioningState, project.prePositioningIntelligence?.state, project.prePositioningCapital?.state),
      confidencePct: number(project.prePositioningIntelligence?.confidencePct, project.prePositioningCapital?.confidencePct),
      score: number(project.prePositioningScore, project.prePositioningIntelligence?.score),
      observedFreshCapitalUsd: number(project.observedFreshCapitalUsd, project.prePositioningCapital?.observedFreshCapitalUsd),
      executionReadyCapitalUsd: number(project.executionReadyCapitalUsd, project.prePositioningCapital?.executionReadyCapitalUsd, project.prePositioningIntelligence?.stagedCapitalUsd),
      targetProximityCapitalUsd: number(project.targetProximityCapitalUsd, project.prePositioningCapital?.targetProximityCapitalUsd, project.prePositioningIntelligence?.targetProximityCapitalUsd),
      candidateAdjustedStagedCapitalUsd: number(project.candidateAdjustedStagedCapitalUsd, project.prePositioningIntelligence?.candidateAdjustedStagedCapitalUsd),
      visibleDeployedToTargetUsd: number(project.visiblePrePositioningDeployedUsd, project.prePositioningCapital?.visibleDeployedToTargetUsd, project.prePositioningIntelligence?.visibleDeployedToTargetUsd),
      targetingConfidencePct: number(project.prePositioningTargetingConfidencePct, project.prePositioningIntelligence?.targetingConfidencePct),
      preparedWalletCount: number(project.prePositioningIntelligence?.preparedWalletCount, project.prePositioningCapital?.capitalConvergence?.preparedWalletCount),
      distinctFundingSourceCount: number(project.prePositioningIntelligence?.distinctFundingSourceCount, project.prePositioningCapital?.capitalConvergence?.distinctFundingSourceCount),
      largestFundingSourceSharePct: number(project.prePositioningIntelligence?.largestFundingSourceSharePct, project.prePositioningCapital?.capitalConvergence?.largestFundingSourceSharePct),
      convergenceState: first(project.prePositioningIntelligence?.capitalConvergenceState, project.prePositioningCapital?.capitalConvergence?.state),
      targetingEvidenceMode: first(project.prePositioningIntelligence?.targetingEvidenceMode, project.prePositioningCapital?.targetingEvidenceMode),
    },
    accessibility: {
      routeCount: number(project.accessibleRouteCount, project.routeCount, project.accessibility?.routeCount),
      previousRouteCount: number(project.previousAccessibleRouteCount, project.previousRouteCount, project.accessibility?.previousRouteCount),
      venueCount: number(project.venueCount, project.accessibility?.venueCount),
      previousVenueCount: number(project.previousVenueCount, project.accessibility?.previousVenueCount),
      newRouteVerified: bool(project.newRouteVerified, project.accessibility?.newRouteVerified),
    },
    chain: {
      stablecoinNetInflowUsd24h: number(project.chainStablecoinNetInflowUsd24h, project.chainCapital?.stablecoinNetInflowUsd24h),
      bridgeNetInflowUsd24h: number(project.chainBridgeNetInflowUsd24h, project.chainCapital?.bridgeNetInflowUsd24h),
      purchasingPowerGrowthPct: number(project.chainPurchasingPowerGrowthPct, project.chainCapital?.purchasingPowerGrowthPct),
    },
    holders: {
      freshHolderRetention1hPct: number(project.freshHolderRetention1hPct, project.holderCohorts?.retention1hPct),
      freshHolderRetention6hPct: number(project.freshHolderRetention6hPct, project.holderCohorts?.retention6hPct),
      freshHolderRetention24hPct: number(project.freshHolderRetention24hPct, project.holderCohorts?.retention24hPct),
      recentAcquisitionRetention1hPct: number(project.recentAcquisitionRetention1hPct, project.holderCohorts?.recentAcquisitionRetention1hPct),
      recentAcquisitionRetention6hPct: number(project.recentAcquisitionRetention6hPct, project.holderCohorts?.recentAcquisitionRetention6hPct),
      retentionEvidenceMode: first(project.holderRetentionEvidenceMode, project.holderCohorts?.mode),
      retentionConfidencePct: number(project.holderRetentionConfidencePct, project.holderCohorts?.confidencePct),
      newBuyers: number(
        project.observedNewBuyerInitiators1h,
        project.economicParticipantFlow?.windows?.["1h"]?.newToObservedHistoryBuyers,
        project.newBuyers,
        project.newBuyers24h,
        project.capitalFlowObservation?.newBuyers
      ),
      repeatBuyers: number(
        project.observedRepeatBuyerInitiators1h,
        project.economicParticipantFlow?.windows?.["1h"]?.repeatObservedBuyers,
        project.repeatBuyers,
        project.repeatBuyers24h,
        project.capitalFlowObservation?.repeatBuyers
      ),
      buyerIdentityMode: first(
        project.economicParticipantFlow?.windows?.["1h"]?.identityMode,
        project.economicParticipantFlow?.policy ? "EVM_TRANSACTION_INITIATOR_NOT_BENEFICIAL_OWNER" : null
      ),
      buyerResolutionCoveragePct: number(project.economicParticipantFlow?.windows?.["1h"]?.participantResolutionCoveragePct),
      holderCount: number(project.holderCount, project.holders, project.capitalFlowObservation?.holderCount),
    },
    project: {
      projectClockScore: number(project.projectClockScore, project.threeClockEdge?.projectClock?.score),
      capitalClockScore: number(project.capitalClockScore, project.threeClockEdge?.capitalClock?.score),
      attentionClockScore: number(project.attentionClockScore, project.threeClockEdge?.attentionClock?.score),
      threeClockState: first(project.threeClockDivergenceState, project.threeClockEdge?.divergence?.state),
      downstreamAdoptionScore: number(project.downstreamAdoptionScore, project.downstreamAdoptionGraph?.score),
      projectChangeScore: number(project.projectChangeScore),
      developerAccelerationScore: number(project.developerAccelerationScore, project.developerAccelerationV2Score),
      informationAdvantageScore: number(project.informationAdvantageScore),
      fakeMomentumRiskScore: number(project.fakeMomentumRiskScore, project.fakeMomentumFirewall?.riskScore, project.washTradingRiskScore),
      supplyShockRiskScore: number(project.supplyShockRiskScore, project.supplyShock?.riskScore, project.tokenUnlockRiskScore),
      safetyBlocked: Boolean(
        project.honeypotDetected ||
        project.sellRestricted ||
        project.threeClockEdge?.safetyState === "BLOCKED" ||
        String(project.finalSelectionState || "").toUpperCase() === "BLOCKED"
      ),
      lateChase: ["ALREADY_PUMPED", "LATE_CHASE"].includes(String(project.preBreakoutMomentumStage || project.prePump?.status || "").toUpperCase()),
    },
    eventTimestamps: timestampsFrom(project),
  };
}

export default normalizeIgnitionSignals;
