import { clamp, num } from "../edge/edgeMath.js";
import { normalizeIgnitionSignals } from "../ignition/ignitionSignalNormalizer.js";

function positive(value) {
  const parsed = num(value);
  return parsed !== null && parsed > 0 ? parsed : 0;
}

function leverageMechanism(signals = {}) {
  const bands = Array.isArray(signals.leverage?.liquidationBands) ? signals.leverage.liquidationBands : [];
  const shortBands = bands.filter((band) => band.side === "SHORT" && num(band.movePct) !== null && num(band.movePct) > 0);
  const forcedBuyUsd = shortBands.reduce((sum, band) => sum + positive(band.forcedFlowUsd), 0);
  const openInterestUsd = num(signals.leverage?.openInterestUsd);
  return {
    state: shortBands.length ? "SHORT_LIQUIDATION_LADDER_OBSERVED" : openInterestUsd !== null ? "LEVERAGE_PRESENT_NO_LADDER" : "UNOBSERVED",
    openInterestUsd,
    fundingRate: num(signals.leverage?.fundingRate),
    shortLiquidationBands: shortBands,
    totalPotentialForcedBuyUsd: shortBands.length ? forcedBuyUsd : null,
    observedMechanism: shortBands.length > 0,
  };
}

function protocolMechanism(signals = {}) {
  const verified = signals.protocol?.forcedDemandVerified === true;
  const buyback = num(signals.protocol?.buybackUsd24h);
  const staking = num(signals.protocol?.stakingDemandUsd24h);
  const burn = num(signals.protocol?.burnUsd24h);
  const forcedDemandUsd24h = [buyback, staking].filter((value) => value !== null && value > 0).reduce((sum, value) => sum + value, 0);
  const hasEvidence = [buyback, staking, burn].some((value) => value !== null);
  return {
    state: !hasEvidence ? "UNOBSERVED" : verified ? "VERIFIED_VALUE_CAPTURE_DEMAND" : "OBSERVED_OR_ESTIMATED_VALUE_CAPTURE",
    buybackUsd24h: buyback,
    stakingDemandUsd24h: staking,
    burnUsd24h: burn,
    forcedDemandUsd24h: hasEvidence ? forcedDemandUsd24h : null,
    verified,
    observedMechanism: hasEvidence && (verified || forcedDemandUsd24h > 0),
  };
}

function accessibilityMechanism(signals = {}) {
  const routeCount = num(signals.accessibility?.routeCount);
  const previousRouteCount = num(signals.accessibility?.previousRouteCount);
  const venueCount = num(signals.accessibility?.venueCount);
  const previousVenueCount = num(signals.accessibility?.previousVenueCount);
  const routeDelta = routeCount !== null && previousRouteCount !== null ? routeCount - previousRouteCount : null;
  const venueDelta = venueCount !== null && previousVenueCount !== null ? venueCount - previousVenueCount : null;
  const verified = signals.accessibility?.newRouteVerified === true;
  const shock = verified || (routeDelta !== null && routeDelta > 0) || (venueDelta !== null && venueDelta > 0);
  return {
    state: shock ? "ACCESSIBILITY_EXPANDING" : routeCount !== null || venueCount !== null ? "ACCESS_STABLE" : "UNOBSERVED",
    routeCount,
    previousRouteCount,
    routeDelta,
    venueCount,
    previousVenueCount,
    venueDelta,
    newRouteVerified: verified,
    observedMechanism: shock,
  };
}

function chainPurchasingPower(signals = {}, liquidityUsd = null) {
  const stablecoin = num(signals.chain?.stablecoinNetInflowUsd24h);
  const bridge = num(signals.chain?.bridgeNetInflowUsd24h);
  const growth = num(signals.chain?.purchasingPowerGrowthPct);
  const net = [stablecoin, bridge].filter((value) => value !== null).reduce((sum, value) => sum + value, 0);
  const hasEvidence = stablecoin !== null || bridge !== null || growth !== null;
  const relativeToLiquidityPct = hasEvidence && liquidityUsd && liquidityUsd > 0 ? (Math.max(0, net) / liquidityUsd) * 100 : null;
  return {
    state: !hasEvidence ? "UNOBSERVED" : net > 0 || (growth !== null && growth > 0) ? "CHAIN_PURCHASING_POWER_EXPANDING" : "CHAIN_PURCHASING_POWER_NEUTRAL_OR_NEGATIVE",
    stablecoinNetInflowUsd24h: stablecoin,
    bridgeNetInflowUsd24h: bridge,
    purchasingPowerGrowthPct: growth,
    observedNetInflowUsd24h: hasEvidence ? net : null,
    relativeToTokenLiquidityPct: relativeToLiquidityPct,
    observedMechanism: hasEvidence && (net > 0 || (growth !== null && growth > 0)),
  };
}

export function forcedBuyFlowAtMove(reflexivity = {}, movePct = 0, alreadyTriggered = new Set()) {
  const move = num(movePct) ?? 0;
  let total = 0;
  const triggered = [];
  for (const band of reflexivity.leverage?.shortLiquidationBands || []) {
    const trigger = num(band.movePct);
    const key = `short:${trigger}:${band.forcedFlowUsd}`;
    if (trigger === null || trigger <= 0 || move < trigger || alreadyTriggered.has(key)) continue;
    const flow = positive(band.forcedFlowUsd);
    if (!flow) continue;
    total += flow;
    triggered.push({ ...band, key });
  }
  return { forcedBuyUsd: total, triggered };
}

export function analyzeReflexivityMechanisms(project = {}, options = {}) {
  const signals = options.signals || normalizeIgnitionSignals(project);
  const liquidityUsd = num(signals.market?.liquidityUsd);
  const leverage = leverageMechanism(signals);
  const protocol = protocolMechanism(signals);
  const accessibility = accessibilityMechanism(signals);
  const chain = chainPurchasingPower(signals, liquidityUsd);
  const positiveMechanisms = [leverage, protocol, accessibility, chain].filter((item) => item.observedMechanism).length;
  const leverageRatioPct = leverage.totalPotentialForcedBuyUsd !== null && liquidityUsd && liquidityUsd > 0
    ? (leverage.totalPotentialForcedBuyUsd / liquidityUsd) * 100
    : null;
  const mechanismStrength = clamp(
    positiveMechanisms * 18 +
    Math.min(35, leverageRatioPct ?? 0) +
    (protocol.verified ? 12 : 0) +
    (accessibility.newRouteVerified ? 8 : 0),
    0,
    100
  );

  const result = {
    leverage,
    protocol,
    accessibility,
    chainPurchasingPower: chain,
    positiveMechanismCount: positiveMechanisms,
    leverageForcedFlowToLiquidityPct: leverageRatioPct,
    mechanismStrengthScore: positiveMechanisms ? Math.round(mechanismStrength) : null,
    state: leverage.observedMechanism
      ? "LEVERAGE_REFLEXIVITY_AVAILABLE"
      : protocol.observedMechanism
        ? "PROTOCOL_DEMAND_REFLEXIVITY_AVAILABLE"
        : accessibility.observedMechanism
          ? "ACCESSIBILITY_EXPANSION_OBSERVED"
          : chain.observedMechanism
            ? "CHAIN_CAPITAL_TAILWIND_OBSERVED"
            : "NO_OBSERVED_REFLEXIVE_MECHANISM",
    shadowOnly: true,
    rankingInfluence: false,
  };

  return {
    ...project,
    reflexivityMechanisms: result,
    reflexivityMechanismState: result.state,
    reflexivityMechanismStrengthScore: result.mechanismStrengthScore,
  };
}

export function analyzeReflexivityMechanismsBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => analyzeReflexivityMechanisms(project, options));
}

export default analyzeReflexivityMechanisms;
