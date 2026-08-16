function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function actorPropensity(row = {}, targetMovePct = 0, currentPriceUsd = null) {
  const balance = num(row.currentBalanceTokens);
  if (!(balance > 0)) return { propensity: 0, confidencePct: 0, reasons: ["zero sampled balance"] };
  const move = Math.max(0, num(targetMovePct) ?? 0);
  const targetPrice = currentPriceUsd !== null ? currentPriceUsd * (1 + move / 100) : null;
  const basis = num(row.avgObservedAcquisitionPriceUsd);
  const basisCoverage = clamp((num(row.knownCostBasisCoveragePct) ?? 0) / 100, 0, 1);
  const sellToBuy = clamp((num(row.observedSellToBuyPct) ?? 0) / 100, 0, 2);
  const dormancy = num(row.dormancyHours);
  const sellEvents = num(row.sellEvents) ?? 0;
  const buyEvents = num(row.buyEvents) ?? 0;
  const historicalSellMultiple = num(row.medianObservedSellMultiple);
  const reasons = [];

  let observedBehavior = 0.07 + Math.min(0.28, sellToBuy * 0.18);
  if (sellEvents > 0) {
    observedBehavior += Math.min(0.18, sellEvents * 0.025);
    reasons.push("observed prior selling");
  }
  if (row.netObservedAccumulator === true && sellEvents === 0 && buyEvents > 0) {
    observedBehavior -= 0.035;
    reasons.push("observed accumulator with no local sells");
  }
  if (dormancy !== null && dormancy <= 1) {
    observedBehavior += 0.08;
    reasons.push("recently active inventory");
  } else if (dormancy !== null && dormancy >= 24) {
    observedBehavior -= move < 25 ? 0.035 : 0;
    reasons.push("observed dormant inventory");
  }

  let profitResponse = 0.06 + Math.min(0.20, move / 250);
  if (basis !== null && basis > 0 && targetPrice !== null) {
    const gainPct = ((targetPrice - basis) / basis) * 100;
    if (gainPct < 0) profitResponse = 0.035;
    else if (gainPct < 10) profitResponse = 0.08;
    else if (gainPct < 25) profitResponse = 0.14;
    else if (gainPct < 50) profitResponse = 0.24;
    else if (gainPct < 100) profitResponse = 0.36;
    else profitResponse = 0.50;
    if (historicalSellMultiple !== null && historicalSellMultiple > 0 && targetPrice / basis >= historicalSellMultiple) {
      profitResponse += 0.12;
      reasons.push("target crosses actor's observed sell-multiple region");
    }
  } else {
    reasons.push("cost basis partially or fully unknown");
  }

  const knownPropensity = clamp(observedBehavior * 0.48 + profitResponse * 0.52, 0.02, 0.82);
  const unknownBasisPropensity = clamp(0.055 + move / 500 + Math.min(0.16, sellToBuy * 0.12) + (sellEvents > 0 ? 0.05 : 0), 0.03, 0.45);
  const propensity = clamp(knownPropensity * basisCoverage + unknownBasisPropensity * (1 - basisCoverage), 0.02, 0.82);
  const rowConfidence = clamp((num(row.confidencePct) ?? 25) / 100, 0.1, 0.9);
  const confidencePct = Math.round(clamp(rowConfidence * (0.45 + basisCoverage * 0.55), 0.08, 0.9) * 100);
  return { propensity, confidencePct, reasons, basisCoveragePct: basisCoverage * 100 };
}

function incrementalCurve(rows = [], currentPriceUsd = null, moves = [5, 10, 25, 50, 100]) {
  let previousByActor = new Map();
  return moves.map((movePct) => {
    let expectedTokens = 0;
    let lowerTokens = 0;
    let upperTokens = 0;
    let confidenceWeighted = 0;
    let confidenceWeight = 0;
    const actorContributions = [];
    for (const row of rows) {
      const balance = num(row.currentBalanceTokens);
      if (!(balance > 0)) continue;
      const modeled = actorPropensity(row, movePct, currentPriceUsd);
      const cumulative = balance * modeled.propensity;
      const previous = previousByActor.get(row.address) || 0;
      const incremental = Math.max(0, cumulative - previous);
      previousByActor.set(row.address, Math.max(previous, cumulative));
      if (!(incremental > 0)) continue;
      const confidence = clamp(modeled.confidencePct / 100, 0.08, 0.9);
      const lower = incremental * Math.max(0.25, confidence * 0.65);
      const upper = Math.min(balance - previous + incremental, incremental * (1.25 + (1 - confidence) * 1.6));
      expectedTokens += incremental;
      lowerTokens += Math.max(0, lower);
      upperTokens += Math.max(incremental, upper);
      confidenceWeighted += modeled.confidencePct * incremental;
      confidenceWeight += incremental;
      actorContributions.push({
        address: row.address,
        incrementalSupplyTokens: incremental,
        propensityPct: modeled.propensity * 100,
        confidencePct: modeled.confidencePct,
      });
    }
    const priceAtBand = currentPriceUsd === null ? null : currentPriceUsd * (1 + movePct / 100);
    return {
      movePct,
      triggerPriceUsd: priceAtBand,
      supplyTokens: Number(expectedTokens.toFixed(6)),
      supplyUsd: priceAtBand === null ? null : Number((expectedTokens * priceAtBand).toFixed(2)),
      lowerSupplyTokens: Number(lowerTokens.toFixed(6)),
      lowerSupplyUsd: priceAtBand === null ? null : Number((lowerTokens * priceAtBand).toFixed(2)),
      upperSupplyTokens: Number(upperTokens.toFixed(6)),
      upperSupplyUsd: priceAtBand === null ? null : Number((upperTokens * priceAtBand).toFixed(2)),
      confidencePct: confidenceWeight > 0 ? Math.round(confidenceWeighted / confidenceWeight) : null,
      contributingActors: actorContributions.length,
      topContributors: actorContributions.sort((a, b) => b.incrementalSupplyTokens - a.incrementalSupplyTokens).slice(0, 8),
      source: "OBSERVED_ACTOR_INVENTORY_BEHAVIOR_MODEL",
      mode: "INCREMENTAL_MARGINAL_SELL_SUPPLY_SHADOW",
    };
  });
}

function inventoryComparison(current = null, previous = null) {
  if (current === null || previous === null || !(previous > 0)) return { changePct: null, burnPct: null, state: "UNOBSERVED" };
  const changePct = ((current - previous) / previous) * 100;
  const burnPct = ((previous - current) / previous) * 100;
  return {
    changePct,
    burnPct,
    state: burnPct >= 40 ? "MARGINAL_SELL_INVENTORY_COLLAPSING" : burnPct >= 20 ? "MARGINAL_SELL_INVENTORY_THINNING" : changePct >= 25 ? "MARGINAL_SELL_INVENTORY_REPLENISHING" : "MARGINAL_SELL_INVENTORY_STABLE",
  };
}

export function analyzeMarginalSellerCurve(project = {}, options = {}) {
  const inventory = options.inventory || project.holderInventoryReconstruction || project.ignitionRawSensors?.holderInventory || null;
  const currentPriceUsd = num(project.priceUsd ?? project.price ?? inventory?.priceUsd);
  const rows = Array.isArray(inventory?.actors) ? inventory.actors : [];
  if (!inventory || !rows.length || currentPriceUsd === null) {
    return {
      ...project,
      marginalSellerCurve: {
        status: "UNOBSERVED",
        bands: [],
        nearPriceSellInventoryUsd: null,
        shadowOnly: true,
        rankingInfluence: false,
      },
    };
  }

  const moves = Array.isArray(options.moves) && options.moves.length ? options.moves : [5, 10, 25, 50, 100];
  const bands = incrementalCurve(rows, currentPriceUsd, moves);
  const nearPriceSellInventoryUsd = bands.filter((band) => band.movePct <= 10).reduce((sum, band) => sum + (num(band.supplyUsd) ?? 0), 0);
  const nearPriceLowerUsd = bands.filter((band) => band.movePct <= 10).reduce((sum, band) => sum + (num(band.lowerSupplyUsd) ?? 0), 0);
  const nearPriceUpperUsd = bands.filter((band) => band.movePct <= 10).reduce((sum, band) => sum + (num(band.upperSupplyUsd) ?? 0), 0);
  const history = Array.isArray(options.history) ? options.history : [];
  const previous = history.at(-1);
  const previousNearPrice = num(previous?.marginalSellerCurve?.nearPriceSellInventoryUsd ?? previous?.nearPriceSellInventoryUsd);
  const comparison = inventoryComparison(nearPriceSellInventoryUsd, previousNearPrice);
  const basisCoverage = num(inventory.knownCostBasisCoveragePct);
  const actorCoverage = num(inventory.actorBalanceCoveragePct);
  const confidencePct = basisCoverage === null && actorCoverage === null
    ? null
    : Math.round(Math.max(10, Math.min(90, (basisCoverage ?? 0) * 0.55 + (actorCoverage ?? 0) * 0.35 + Math.min(10, rows.length))));

  const curve = {
    status: "OBSERVED_MODELED_MARGINAL_SELLER_CURVE",
    observedAt: inventory.observedAt || new Date().toISOString(),
    sampledActors: inventory.sampledActors ?? rows.length,
    sampledInventoryUsd: inventory.sampledInventoryUsd ?? null,
    knownCostBasisCoveragePct: basisCoverage,
    actorBalanceCoveragePct: actorCoverage,
    bands,
    nearPriceSellInventoryUsd: Number(nearPriceSellInventoryUsd.toFixed(2)),
    nearPriceSellInventoryLowerUsd: Number(nearPriceLowerUsd.toFixed(2)),
    nearPriceSellInventoryUpperUsd: Number(nearPriceUpperUsd.toFixed(2)),
    previousNearPriceSellInventoryUsd: previousNearPrice,
    nearPriceInventoryChangePct: comparison.changePct === null ? null : Number(comparison.changePct.toFixed(2)),
    nearPriceInventoryBurnPct: comparison.burnPct === null ? null : Number(comparison.burnPct.toFixed(2)),
    inventoryState: comparison.state,
    confidencePct,
    beneficialOwnerResolved: false,
    policy: "This is a shadow estimate of sampled resolved-address inventory likely to become sell supply across price bands. It is not an order book, beneficial-owner map, or prediction that any address will sell. Unknown-basis inventory is modeled with lower confidence.",
    shadowOnly: true,
    rankingInfluence: false,
  };

  return {
    ...project,
    marginalSellerCurve: curve,
    holderSellSupplyBands: bands,
    currentSellInventoryUsd: curve.nearPriceSellInventoryUsd,
    previousSellInventoryUsd: previousNearPrice,
    marginalSellerInventoryState: curve.inventoryState,
    marginalSellerInventoryBurnPct: curve.nearPriceInventoryBurnPct,
    marginalSellerCurveConfidencePct: confidencePct,
  };
}

export function analyzeMarginalSellerCurveBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => analyzeMarginalSellerCurve(project, options));
}

export const __marginalSellerCurveTestHooks = {
  actorPropensity,
  incrementalCurve,
  inventoryComparison,
};

export default analyzeMarginalSellerCurve;
