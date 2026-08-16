import fs from "fs";
import path from "path";

import { canonicalIdentityKey, clamp, mean, median, num } from "../edge/edgeMath.js";
import { normalizeIgnitionSignals } from "../ignition/ignitionSignalNormalizer.js";
import { analyzeEffectiveFloat } from "./effectiveFloatEngine.js";
import {
  analyzeLiquidityGeometry,
  depthForMovePct,
  impactForNotionalUsd,
} from "./liquidityGeometryEngine.js";
import { analyzeMarketPressure } from "./marketPressureEngine.js";
import {
  analyzeReflexivityMechanisms,
  forcedBuyFlowAtMove,
} from "./reflexivityMechanismEngine.js";
import {
  appendIgnitionTwinObservations,
  ignitionHistoryFor,
  loadIgnitionTwinObservations,
} from "../learning/ignitionTwinObservationStore.js";

const REPORT_FILE = path.resolve("reports", "ignition-twin.json");
const DEFAULT_SHOCKS = [5_000, 10_000, 25_000, 50_000, 100_000, 250_000];
const STAGED_CAPITAL_FRACTIONS = [0.25, 0.5, 0.75, 1];

function sortedUniqueNumbers(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(Number).filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);
}

function holderSupplyAtMove(signals = {}, movePct = 0) {
  const move = num(movePct) ?? 0;
  return (signals.supply?.holderSellSupplyBands || [])
    .filter((band) => num(band.movePct) !== null && band.movePct <= move)
    .reduce((sum, band) => sum + (num(band.supplyUsd) ?? 0), 0);
}

function eventTimeAcceleration(signals = {}) {
  const timestamps = Array.isArray(signals.eventTimestamps) ? signals.eventTimestamps : [];
  if (timestamps.length < 6) return { state: "UNOBSERVED", accelerationRatio: null, recentMedianIntervalMinutes: null, baselineMedianIntervalMinutes: null };
  const intervals = timestamps.slice(1).map((value, index) => (value - timestamps[index]) / 60000).filter((value) => value > 0);
  if (intervals.length < 5) return { state: "UNOBSERVED", accelerationRatio: null, recentMedianIntervalMinutes: null, baselineMedianIntervalMinutes: null };
  const recent = intervals.slice(-3);
  const baseline = intervals.slice(0, -3);
  const recentMedian = median(recent);
  const baselineMedian = median(baseline);
  const ratio = recentMedian && baselineMedian ? baselineMedian / recentMedian : null;
  return {
    state: ratio === null ? "UNOBSERVED" : ratio >= 2.5 ? "EVENT_TIME_COMPRESSING_FAST" : ratio >= 1.4 ? "EVENT_TIME_COMPRESSING" : ratio <= 0.7 ? "EVENT_TIME_DECELERATING" : "EVENT_TIME_STABLE",
    accelerationRatio: ratio,
    recentMedianIntervalMinutes: recentMedian,
    baselineMedianIntervalMinutes: baselineMedian,
  };
}

function sequenceCompression(history = []) {
  const rows = (Array.isArray(history) ? history : [])
    .filter((row) => row.observedAt)
    .sort((a, b) => String(a.observedAt).localeCompare(String(b.observedAt)));
  const transitions = [];
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].state && rows[index - 1].state && rows[index].state !== rows[index - 1].state) {
      const left = new Date(rows[index - 1].observedAt).getTime();
      const right = new Date(rows[index].observedAt).getTime();
      if (Number.isFinite(left) && Number.isFinite(right) && right > left) transitions.push((right - left) / 60000);
    }
  }
  if (transitions.length < 3) return { state: "UNOBSERVED", compressionRatio: null, recentTransitionMinutes: null, baselineTransitionMinutes: null };
  const recent = transitions.at(-1);
  const baseline = median(transitions.slice(0, -1));
  const ratio = recent && baseline ? baseline / recent : null;
  return {
    state: ratio === null ? "UNOBSERVED" : ratio >= 2 ? "SEQUENCE_COMPRESSING" : ratio <= 0.7 ? "SEQUENCE_DECELERATING" : "SEQUENCE_STABLE",
    compressionRatio: ratio,
    recentTransitionMinutes: recent,
    baselineTransitionMinutes: baseline,
  };
}

function repricingGap(project = {}, signals = {}) {
  const driverStrength = mean([
    signals.project?.projectClockScore,
    signals.project?.capitalClockScore,
    signals.project?.downstreamAdoptionScore,
    project.marketPressure?.demandScore,
    project.marketPressure?.buyerReplacement?.score,
    project.reflexivityMechanisms?.mechanismStrengthScore,
  ]);
  const priceMove = num(signals.market?.priceChange24hPct ?? signals.market?.priceChange6hPct ?? signals.market?.tradeWindow?.priceDeltaPct);
  if (driverStrength === null || priceMove === null) return { state: "UNOBSERVED", driverStrength: driverStrength ?? null, priceMovePct: priceMove ?? null, rawGapPoints: null, score: null };
  const priceResponseScore = clamp(Math.abs(priceMove) * 2.5, 0, 100);
  const rawGap = driverStrength - priceResponseScore;
  return {
    state: rawGap >= 35 ? "LARGE_UNPRICED_STATE_CHANGE" : rawGap >= 18 ? "MODERATE_REPRICING_GAP" : rawGap <= -20 ? "PRICE_AHEAD_OF_DRIVERS" : "ROUGHLY_PRICED",
    driverStrength,
    priceMovePct: priceMove,
    rawGapPoints: rawGap,
    score: clamp(50 + rawGap * 0.8),
  };
}

function supplyAtMove(project = {}, signals = {}, movePct = 0) {
  const holderSupply = holderSupplyAtMove(signals, movePct);
  const unlock = num(signals.supply?.scheduledUnlockUsd) ?? 0;
  const exchangeInflow = num(signals.supply?.exchangeInflowUsd) ?? 0;
  const lineageRisk = num(signals.supply?.supplyLineageContextualRiskUsd) ?? 0;
  // Unlocks and exchange inflows are not assumed to hit immediately; they are damping context.
  return {
    holderSellSupplyUsd: holderSupply,
    contextualSupplyRiskUsd: unlock + exchangeInflow + lineageRisk,
  };
}

export function simulateIgnitionShock(project = {}, externalDemandUsd = 0, options = {}) {
  const external = num(externalDemandUsd);
  const geometry = project.liquidityGeometry || {};
  const reflexivity = project.reflexivityMechanisms || {};
  const signals = options.signals || normalizeIgnitionSignals(project);
  if (external === null || external <= 0 || geometry.mode === "UNOBSERVED") {
    return {
      externalDemandUsd: external,
      status: "UNOBSERVED",
      estimatedMovePct: null,
      grossReflexivityMultiplier: null,
      netPressureMultiplier: null,
      executableQuote: false,
      shadowOnly: true,
    };
  }

  const triggered = new Set();
  let forcedBuyUsd = 0;
  let holderSellSupplyUsd = 0;
  let effectiveDemandUsd = external;
  let movePct = impactForNotionalUsd(geometry, effectiveDemandUsd);
  const trace = [];

  for (let round = 1; round <= 4; round += 1) {
    if (movePct === null) break;
    const forced = forcedBuyFlowAtMove(reflexivity, movePct, triggered);
    for (const band of forced.triggered) triggered.add(band.key);
    const cumulativeHolderSupply = holderSupplyAtMove(signals, movePct);
    const incrementalHolderSupply = Math.max(0, cumulativeHolderSupply - holderSellSupplyUsd);
    forcedBuyUsd += forced.forcedBuyUsd;
    holderSellSupplyUsd += incrementalHolderSupply;
    const nextEffective = Math.max(0, external + forcedBuyUsd - holderSellSupplyUsd);
    trace.push({
      round,
      movePct,
      forcedBuyUsdAdded: forced.forcedBuyUsd,
      holderSellSupplyUsdAdded: incrementalHolderSupply,
      cumulativeForcedBuyUsd: forcedBuyUsd,
      cumulativeHolderSellSupplyUsd: holderSellSupplyUsd,
      effectiveDemandUsd: nextEffective,
      triggeredLiquidations: forced.triggered.map((band) => ({ movePct: band.movePct, forcedFlowUsd: band.forcedFlowUsd })),
    });
    if (Math.abs(nextEffective - effectiveDemandUsd) < Math.max(1, external * 0.01)) {
      effectiveDemandUsd = nextEffective;
      break;
    }
    effectiveDemandUsd = nextEffective;
    const nextMove = impactForNotionalUsd(geometry, effectiveDemandUsd);
    if (nextMove === null || Math.abs(nextMove - movePct) < 0.05) {
      movePct = nextMove ?? movePct;
      break;
    }
    movePct = nextMove;
  }

  const protocolDemandUsd24h = num(reflexivity.protocol?.forcedDemandUsd24h);
  const grossReflexivityMultiplier = external > 0 ? (external + forcedBuyUsd) / external : null;
  const netPressureMultiplier = external > 0 ? Math.max(0, external + forcedBuyUsd - holderSellSupplyUsd) / external : null;
  const supply = supplyAtMove(project, signals, movePct ?? 0);

  return {
    externalDemandUsd: external,
    status: "SIMULATED_SHADOW",
    geometryMode: geometry.mode,
    estimatedMovePct: movePct,
    forcedBuyUsd,
    holderSellSupplyUsd,
    contextualSupplyRiskUsd: supply.contextualSupplyRiskUsd,
    protocolDemandUsd24h,
    grossReflexivityMultiplier,
    netPressureMultiplier,
    reflexiveMechanismTriggered: forcedBuyUsd > 0,
    triggeredLiquidationBandCount: triggered.size,
    trace,
    executableQuote: false,
    shadowOnly: true,
    warning: geometry.mode === "CONSTANT_PRODUCT_HEURISTIC"
      ? "This scenario uses a constant-product liquidity approximation and must not be treated as an executable quote or forecast."
      : "This is a counterfactual research scenario from observed/model-provided state, not an executable quote or expected return.",
  };
}

function buildShockGrid(project = {}, options = {}) {
  if (Array.isArray(options.shockNotionals) && options.shockNotionals.length) return sortedUniqueNumbers(options.shockNotionals);
  const liquidity = num(project.liquidityGeometry?.referenceLiquidityUsd);
  const scaled = liquidity && liquidity > 0
    ? [liquidity * 0.005, liquidity * 0.01, liquidity * 0.025, liquidity * 0.05, liquidity * 0.1]
    : [];
  return sortedUniqueNumbers([...DEFAULT_SHOCKS, ...scaled]);
}

function stagedCapitalAssessment(project = {}, signals = {}, threshold = {}) {
  const prep = signals.capitalPreparation || {};
  const executionReady = num(prep.executionReadyCapitalUsd);
  const targeted = num(prep.targetProximityCapitalUsd);
  const candidateAdjusted = num(prep.candidateAdjustedStagedCapitalUsd);
  const targetingConfidencePct = num(prep.targetingConfidencePct);
  const ignitionCapital = num(threshold.ignitionCapitalUsd);
  if (executionReady === null && targeted === null && candidateAdjusted === null) {
    return {
      state: "UNOBSERVED",
      executionReadyCapitalUsd: null,
      targetProximityCapitalUsd: null,
      candidateAdjustedStagedCapitalUsd: null,
      stagedCapitalToIgnitionRatio: null,
      targetedCapitalToIgnitionRatio: null,
      candidateAdjustedToIgnitionRatio: null,
      targetingConfidencePct: targetingConfidencePct ?? null,
      genericShockScenarios: [],
      candidateSpecificShockScenarios: [],
      loadedVacuumState: "UNOBSERVED",
    };
  }

  const ratio = (value) => ignitionCapital !== null && ignitionCapital > 0 && value !== null ? value / ignitionCapital : null;
  const genericShockScenarios = executionReady !== null && executionReady > 0
    ? STAGED_CAPITAL_FRACTIONS.map((fraction) => ({
        fraction,
        candidateSpecific: false,
        capitalUsd: executionReady * fraction,
        ...simulateIgnitionShock(project, executionReady * fraction, { signals }),
      }))
    : [];
  const candidateSpecificBase = candidateAdjusted !== null && candidateAdjusted > 0 ? candidateAdjusted : targeted;
  const candidateSpecificShockScenarios = candidateSpecificBase !== null && candidateSpecificBase > 0
    ? STAGED_CAPITAL_FRACTIONS.map((fraction) => ({
        fraction,
        candidateSpecific: true,
        capitalUsd: candidateSpecificBase * fraction,
        ...simulateIgnitionShock(project, candidateSpecificBase * fraction, { signals }),
      }))
    : [];

  const vacuumState = signals.supply?.supplyVacuumIntegrityState || null;
  const sellerScore = num(project.marketPressure?.sellerExhaustion?.score);
  const attention = num(signals.project?.attentionClockScore);
  const priceMove = num(project.marketPressure?.priceMovePct ?? signals.market?.priceChange24hPct);
  const supplySafe = [null, "NO_VACUUM_CLAIM", "VACUUM_INTEGRITY_SUPPORTED"].includes(vacuumState);
  const early = (attention === null || attention < 55) && (priceMove === null || Math.abs(priceMove) <= 12);
  const targetRatio = ratio(candidateSpecificBase);
  const genericRatio = ratio(executionReady);
  let loadedVacuumState = "NO_LOADED_VACUUM";
  if (!supplySafe) loadedVacuumState = "SUPPLY_LINEAGE_BLOCKS_LOADED_VACUUM";
  else if (targetRatio !== null && targetRatio >= 0.8 && (targetingConfidencePct ?? 0) >= 70 && (sellerScore === null || sellerScore >= 55) && early) loadedVacuumState = "LOADED_VACUUM_SHADOW";
  else if (genericRatio !== null && genericRatio >= 0.8 && (targetingConfidencePct ?? 0) < 70 && early) loadedVacuumState = "ECOSYSTEM_CAPITAL_LOADED_NOT_TARGETED";
  else if (targetRatio !== null && targetRatio >= 0.5 && early) loadedVacuumState = "TARGETED_CAPITAL_LOADING";
  else if (genericRatio !== null && genericRatio >= 0.5 && early) loadedVacuumState = "CAPITAL_LOADING_NEAR_IGNITION";

  return {
    state: prep.state || "OBSERVED_PRE_POSITIONING",
    executionReadyCapitalUsd: executionReady,
    targetProximityCapitalUsd: targeted,
    candidateAdjustedStagedCapitalUsd: candidateAdjusted,
    stagedCapitalToIgnitionRatio: ratio(executionReady),
    targetedCapitalToIgnitionRatio: ratio(targeted),
    candidateAdjustedToIgnitionRatio: ratio(candidateAdjusted),
    targetingConfidencePct: targetingConfidencePct ?? null,
    targetingEvidenceMode: prep.targetingEvidenceMode || null,
    capitalConvergenceState: prep.convergenceState || null,
    genericShockScenarios,
    candidateSpecificShockScenarios,
    loadedVacuumState,
    warning: "Generic execution-ready capital is ecosystem purchasing power, not token-specific demand. Only directly targeted/candidate-adjusted capital may support a loaded-vacuum interpretation.",
  };
}

function ignitionThreshold(project = {}, scenarios = []) {
  const geometry = project.liquidityGeometry || {};
  const marketPressure = project.marketPressure || {};
  const explicitDepth = geometry.mode === "EXPLICIT_DEPTH_CURVE" || geometry.mode === "EXPLICIT_IMPACT_CURVE";
  const sellerExhaustion = num(project.sellerExhaustionScore);
  const refillHalfLife = num(geometry.refillHalfLifeMinutes);
  const persistence = num(geometry.priceImpactPersistencePct);

  const leverageScenario = scenarios.find((scenario) =>
    scenario.reflexiveMechanismTriggered &&
    num(scenario.grossReflexivityMultiplier) !== null &&
    scenario.grossReflexivityMultiplier >= 1.2 &&
    num(scenario.estimatedMovePct) !== null &&
    scenario.estimatedMovePct >= 3
  );
  if (leverageScenario) {
    return {
      ignitionCapitalUsd: leverageScenario.externalDemandUsd,
      mode: geometry.mode === "CONSTANT_PRODUCT_HEURISTIC" ? "OBSERVED_LEVERAGE_HEURISTIC_LIQUIDITY" : "OBSERVED_LEVERAGE_AND_DEPTH",
      trigger: "SHORT_LIQUIDATION_REFLEXIVITY",
      confidencePct: geometry.mode === "CONSTANT_PRODUCT_HEURISTIC" ? 52 : 78,
    };
  }

  const depth10 = num(geometry.depthTo10PctUsd);
  const vacuumEvidence = explicitDepth && depth10 !== null && sellerExhaustion !== null && sellerExhaustion >= 70 &&
    ((refillHalfLife !== null && refillHalfLife >= 20) || (persistence !== null && persistence >= 65));
  if (vacuumEvidence) {
    return {
      ignitionCapitalUsd: depth10,
      mode: "OBSERVED_LIQUIDITY_VACUUM_THRESHOLD",
      trigger: "SUPPLY_VACUUM",
      confidencePct: 70,
    };
  }

  const pressureWithoutMovement = marketPressure.pressureWithoutMovement === true;
  if (explicitDepth && pressureWithoutMovement && depth10 !== null && sellerExhaustion !== null && sellerExhaustion >= 60) {
    return {
      ignitionCapitalUsd: depth10,
      mode: "OBSERVED_ABSORPTION_BREAK_THRESHOLD",
      trigger: "ABSORPTION_RELEASE",
      confidencePct: 62,
    };
  }

  return { ignitionCapitalUsd: null, mode: "UNOBSERVED", trigger: null, confidencePct: 0 };
}

function buildTriggerLadder(project = {}, signals = {}) {
  const geometry = project.liquidityGeometry || {};
  const items = [];
  for (const movePct of [5, 10, 25, 50, 100]) {
    const required = depthForMovePct(geometry, movePct);
    if (required !== null) items.push({ type: "LIQUIDITY_DEPTH", movePct, estimatedExternalDemandUsd: required, effect: `Estimated depth threshold to move approximately ${movePct}% under the current liquidity model.` });
  }
  for (const band of project.reflexivityMechanisms?.leverage?.shortLiquidationBands || []) {
    const required = depthForMovePct(geometry, band.movePct);
    items.push({
      type: "SHORT_LIQUIDATION",
      movePct: band.movePct,
      estimatedExternalDemandUsd: required,
      endogenousFlowUsd: num(band.forcedFlowUsd),
      effect: "Observed/model-provided short liquidation band could convert price movement into forced buy flow.",
    });
  }
  let cumulativeSupply = 0;
  for (const band of signals.supply?.holderSellSupplyBands || []) {
    cumulativeSupply += num(band.supplyUsd) ?? 0;
    const depth = depthForMovePct(geometry, band.movePct);
    items.push({
      type: "HOLDER_SUPPLY",
      movePct: band.movePct,
      estimatedExternalDemandUsd: depth === null ? null : depth + cumulativeSupply,
      holderSupplyUsd: cumulativeSupply,
      effect: "Observed/model-provided holder supply expected to become available by this price move.",
    });
  }
  return items
    .sort((a, b) => (num(a.estimatedExternalDemandUsd) ?? Number.POSITIVE_INFINITY) - (num(b.estimatedExternalDemandUsd) ?? Number.POSITIVE_INFINITY))
    .slice(0, 20);
}

function evidenceCoverage(project = {}, signals = {}) {
  const categories = [
    signals.market?.tradeWindow?.evidenceMode === "OBSERVED_TRADE_WINDOW",
    project.liquidityGeometry?.mode === "EXPLICIT_DEPTH_CURVE" || project.liquidityGeometry?.mode === "EXPLICIT_IMPACT_CURVE",
    project.effectiveFloat?.mode === "DIRECT_EFFECTIVE_FLOAT" || project.effectiveFloat?.mode === "COMPONENT_ESTIMATE",
    (signals.supply?.holderSellSupplyBands || []).length > 0,
    signals.supply?.supplyLineageRiskScore !== null && signals.supply?.supplyLineageRiskScore !== undefined,
    (signals.leverage?.liquidationBands || []).length > 0,
    project.marketPressure?.sellerExhaustion?.score !== null && project.marketPressure?.sellerExhaustion?.score !== undefined,
    project.marketPressure?.buyerReplacement?.score !== null && project.marketPressure?.buyerReplacement?.score !== undefined,
    project.reflexivityMechanisms?.protocol?.state !== "UNOBSERVED",
    project.reflexivityMechanisms?.chainPurchasingPower?.state !== "UNOBSERVED",
    num(signals.project?.projectClockScore) !== null || num(signals.project?.projectChangeScore) !== null,
    num(signals.project?.capitalClockScore) !== null || num(project.marketPressure?.demandScore) !== null,
    num(signals.project?.attentionClockScore) !== null,
    signals.capitalPreparation?.state && !["UNOBSERVED", "NO_OBSERVED_PREPOSITIONING"].includes(signals.capitalPreparation.state),
  ];
  const observed = categories.filter(Boolean).length;
  return {
    evidenceCoveragePct: Math.round((observed / categories.length) * 100),
    observedCategories: observed,
    totalCategories: categories.length,
  };
}

function phaseState(project = {}, signals = {}, threshold = {}, staged = {}) {
  const fakeRisk = num(signals.project?.fakeMomentumRiskScore) ?? 0;
  const supplyRisk = num(signals.project?.supplyShockRiskScore) ?? 0;
  const supplyPressureScore = num(project.marketPressure?.supplyPressure?.score);
  const supplyLineageRiskScore = num(signals.supply?.supplyLineageRiskScore);
  const vacuumIntegrityState = signals.supply?.supplyVacuumIntegrityState || null;
  const demandScore = num(project.marketPressure?.demandScore);
  const sellerScore = num(project.marketPressure?.sellerExhaustion?.score);
  const projectClock = num(signals.project?.projectClockScore ?? signals.project?.projectChangeScore ?? signals.project?.developerAccelerationScore);
  const capitalClock = num(signals.project?.capitalClockScore);
  const attentionClock = num(signals.project?.attentionClockScore);
  const priceMove = num(project.marketPressure?.priceMovePct ?? signals.market?.priceChange24hPct);
  const flow = num(project.marketPressure?.netFlowUsd);
  const flowHours = num(project.marketPressure?.flowWindowHours);
  const ignitionCapital = num(threshold.ignitionCapitalUsd);
  const prePositionScore = num(signals.capitalPreparation?.score);
  const candidateAdjustedStagedCapital = num(signals.capitalPreparation?.candidateAdjustedStagedCapitalUsd);
  const targetingConfidencePct = num(signals.capitalPreparation?.targetingConfidencePct);
  const targetSpecificPrePositioning = ignitionCapital !== null && ignitionCapital > 0 && candidateAdjustedStagedCapital !== null && candidateAdjustedStagedCapital >= ignitionCapital * 0.8 && (targetingConfidencePct ?? 0) >= 70;
  const projectLegitimateSignal = (projectClock !== null && projectClock >= 55) || num(signals.project?.downstreamAdoptionScore) >= 55 || num(signals.project?.projectChangeScore) >= 55;
  const quietAttention = attentionClock === null || attentionClock < 55;

  if (signals.project?.safetyBlocked || fakeRisk >= 75) return { state: "INVALIDATED", reason: signals.project?.safetyBlocked ? "Existing deterministic safety evidence blocks the thesis." : "Activity quality/manipulation risk is too high." };
  if (signals.project?.lateChase || (attentionClock !== null && attentionClock >= 78) || (priceMove !== null && priceMove >= 60)) return { state: "EXHAUSTION", reason: "The setup is no longer early enough for an ignition-state interpretation." };
  if (supplyRisk >= 80 || (supplyPressureScore !== null && supplyPressureScore >= 80) || (supplyLineageRiskScore !== null && supplyLineageRiskScore >= 85)) return { state: "INVALIDATED", reason: "Observed supply pressure or market-facing supply lineage is severe relative to available float/liquidity." };

  if (ignitionCapital !== null && flow !== null && flow > 0 && flowHours !== null && flowHours <= 6 && flow >= ignitionCapital * 0.8) {
    return { state: "IGNITING", reason: "Observed short-window net demand is already near or through a measured ignition threshold." };
  }
  if (ignitionCapital !== null && projectLegitimateSignal && quietAttention && (supplyPressureScore === null || supplyPressureScore < 65) && (supplyLineageRiskScore === null || supplyLineageRiskScore < 60) && !["FALSE_VACUUM_LINEAGE_RISK", "VACUUM_THREATENED_BY_ONE_HOP_SUPPLY", "VACUUM_THREATENED_BY_STRATEGIC_SUPPLY", "VACUUM_THREATENED_BY_DORMANT_WAKEUP"].includes(vacuumIntegrityState)) {
    if (demandScore !== null && demandScore >= 55) {
      return { state: "ARMED", reason: "A measurable trigger exists, genuine demand is present, the project has a legitimate change signal, and attention is not yet crowded." };
    }
    if (targetSpecificPrePositioning && staged.loadedVacuumState === "LOADED_VACUUM_SHADOW") {
      return { state: "ARMED", reason: "A measurable trigger exists and directly targeted, execution-ready upstream capital is large enough to approach it before visible target demand is fully established." };
    }
  }
  if (
    project.marketPressure?.pressureWithoutMovement === true ||
    (sellerScore !== null && sellerScore >= 55 && demandScore !== null && demandScore >= 50 && (priceMove === null || Math.abs(priceMove) <= 10))
  ) {
    return { state: "COMPRESSED", reason: "Demand/seller evidence is tightening while price remains relatively unextended." };
  }
  if ((projectClock !== null && projectClock >= 50) || (capitalClock !== null && capitalClock >= 50) || (demandScore !== null && demandScore >= 50) || (prePositionScore !== null && prePositionScore >= 55)) {
    return { state: "FORMING", reason: "One or more precursor state variables are strengthening but no measured ignition threshold is ready." };
  }
  const coverage = project.ignitionTwinEvidenceCoveragePct;
  if (coverage !== undefined && coverage < 15) return { state: "UNOBSERVED", reason: "Too little mechanistic evidence is available to classify this market state." };
  return { state: "DORMANT", reason: "No meaningful ignition sequence is currently observed." };
}

function priorityValue(project = {}) {
  const stateWeight = {
    IGNITING: 7,
    ARMED: 6,
    COMPRESSED: 5,
    FORMING: 4,
    DORMANT: 3,
    UNOBSERVED: 2,
    EXHAUSTION: 1,
    INVALIDATED: 0,
  }[project.ignitionState] ?? 0;
  const threshold = num(project.ignitionTwin?.ignitionCapitalUsd);
  const liquidity = num(project.liquidityGeometry?.referenceLiquidityUsd);
  const proximity = threshold !== null && liquidity && liquidity > 0 ? clamp(100 - (threshold / liquidity) * 100, 0, 100) : 0;
  return stateWeight * 10000 + proximity * 50 + (num(project.demandPressureScore) ?? 0) * 10 + (num(project.sellerExhaustionScore) ?? 0) * 5;
}

function writeReport(projects = [], meta = {}) {
  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  const ranked = [...projects].sort((a, b) => priorityValue(b) - priorityValue(a));
  const stateCounts = ranked.reduce((acc, project) => {
    acc[project.ignitionState || "UNKNOWN"] = (acc[project.ignitionState || "UNKNOWN"] || 0) + 1;
    return acc;
  }, {});
  const report = {
    version: "ignition-twin-super-upgrade-v7",
    status: "SHADOW_MODE",
    generatedAt: meta.observedAt || new Date().toISOString(),
    projectsAnalyzed: ranked.length,
    stateCounts,
    topCandidates: ranked.slice(0, 30).map((project, index) => ({
      rank: index + 1,
      symbol: project.symbol || "UNKNOWN",
      name: project.name || "Unknown",
      chain: project.chain || project.canonicalChain || "unknown",
      state: project.ignitionState,
      ignitionCapitalUsd: project.ignitionTwin?.ignitionCapitalUsd ?? null,
      ignitionCapitalMode: project.ignitionTwin?.ignitionCapitalMode || null,
      maxObservedReflexivityMultiplier: project.ignitionTwin?.maxObservedReflexivityMultiplier ?? null,
      evidenceCoveragePct: project.ignitionTwin?.evidenceCoveragePct ?? 0,
      demandPressureScore: project.demandPressureScore ?? null,
      sellerExhaustionScore: project.sellerExhaustionScore ?? null,
      buyerReplacementScore: project.buyerReplacementScore ?? null,
      nearPriceSellInventoryUsd: project.marginalSellerCurve?.nearPriceSellInventoryUsd ?? null,
      nearPriceSellInventoryLowerUsd: project.marginalSellerCurve?.nearPriceSellInventoryLowerUsd ?? null,
      nearPriceSellInventoryUpperUsd: project.marginalSellerCurve?.nearPriceSellInventoryUpperUsd ?? null,
      marginalSellerInventoryState: project.marginalSellerCurve?.inventoryState || null,
      marginalSellerInventoryBurnPct: project.marginalSellerCurve?.nearPriceInventoryBurnPct ?? null,
      supplyLineageState: project.supplyLineageIntelligence?.state || null,
      supplyLineageRiskScore: project.supplyLineageIntelligence?.riskScore ?? null,
      supplyLineageContextualRiskUsd: project.supplyLineageIntelligence?.contextualSupplyRiskUsd ?? null,
      supplyVacuumIntegrityState: project.supplyLineageIntelligence?.vacuumIntegrityState || null,
      stagedOneHopSupplyUsd: project.supplyLineageIntelligence?.stagedOneHopSupplyUsd ?? null,
      cexDirectedSupplyUsd: project.supplyLineageIntelligence?.cexDirectedSupplyUsd ?? null,
      dormantSupplyWakeupUsd: project.supplyLineageIntelligence?.dormantWakeupUsd ?? null,
      prePositioningState: project.prePositioningIntelligence?.state || null,
      prePositioningConfidencePct: project.prePositioningIntelligence?.confidencePct ?? null,
      stagedCapitalUsd: project.prePositioningIntelligence?.stagedCapitalUsd ?? null,
      targetProximityCapitalUsd: project.prePositioningIntelligence?.targetProximityCapitalUsd ?? null,
      candidateAdjustedStagedCapitalUsd: project.prePositioningIntelligence?.candidateAdjustedStagedCapitalUsd ?? null,
      stagedCapitalToIgnitionRatio: project.ignitionTwin?.stagedCapital?.stagedCapitalToIgnitionRatio ?? null,
      candidateAdjustedToIgnitionRatio: project.ignitionTwin?.stagedCapital?.candidateAdjustedToIgnitionRatio ?? null,
      loadedVacuumState: project.ignitionTwin?.stagedCapital?.loadedVacuumState || null,
      holderKnownCostBasisCoveragePct: project.holderInventoryReconstruction?.knownCostBasisCoveragePct ?? null,
      sampledHolderInventoryUsd: project.holderInventoryReconstruction?.sampledInventoryUsd ?? null,
      liquidityConvexityState: project.liquidityConvexityState || null,
      reflexivityMechanismState: project.reflexivityMechanismState || null,
      repricingGap: project.ignitionTwin?.repricingGap || null,
      nextTrigger: project.ignitionTwin?.triggerLadder?.[0] || null,
      reason: project.ignitionTwin?.reason || null,
    })),
    policy: "Ignition Twin is shadow-only. No simulated move, ignition threshold, or phase state changes production ranking until leakage-resistant walk-forward validation demonstrates independent value after costs and uncertainty controls.",
  };
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  return report;
}

export function analyzeIgnitionTwin(project = {}, options = {}) {
  const signals = options.signals || normalizeIgnitionSignals(project);
  const history = Array.isArray(options.history) ? options.history : [];

  let result = analyzeEffectiveFloat(project, { signals });
  result = analyzeLiquidityGeometry(result, { signals });
  result = analyzeMarketPressure(result, { signals, history });
  result = analyzeReflexivityMechanisms(result, { signals });

  const shocks = buildShockGrid(result, options);
  const simulations = shocks.map((notional) => simulateIgnitionShock(result, notional, { signals }));
  const threshold = ignitionThreshold(result, simulations);
  const stagedCapital = stagedCapitalAssessment(result, signals, threshold);
  const triggerLadder = buildTriggerLadder(result, signals);
  const eventAcceleration = eventTimeAcceleration(signals);
  const seqCompression = sequenceCompression(history);
  const gap = repricingGap(result, signals);
  const coverage = evidenceCoverage(result, signals);
  result.ignitionTwinEvidenceCoveragePct = coverage.evidenceCoveragePct;
  const phase = phaseState(result, signals, threshold, stagedCapital);
  const maxMultiplier = simulations
    .map((scenario) => num(scenario.grossReflexivityMultiplier))
    .filter((value) => value !== null)
    .reduce((max, value) => Math.max(max, value), 0) || null;
  const confidencePct = Math.round(clamp(
    coverage.evidenceCoveragePct * 0.68 +
    threshold.confidencePct * 0.22 +
    (result.liquidityGeometry?.mode === "EXPLICIT_DEPTH_CURVE" || result.liquidityGeometry?.mode === "EXPLICIT_IMPACT_CURVE" ? 10 : 0),
    0,
    100
  ));

  const twin = {
    version: "ignition-twin-super-upgrade-v7",
    state: phase.state,
    reason: phase.reason,
    confidencePct,
    evidenceCoveragePct: coverage.evidenceCoveragePct,
    observedEvidenceCategories: coverage.observedCategories,
    totalEvidenceCategories: coverage.totalCategories,
    ignitionCapitalUsd: threshold.ignitionCapitalUsd,
    ignitionCapitalMode: threshold.mode,
    ignitionTrigger: threshold.trigger,
    ignitionThresholdConfidencePct: threshold.confidencePct,
    maxObservedReflexivityMultiplier: maxMultiplier,
    effectiveFloat: result.effectiveFloat,
    marketPressure: result.marketPressure,
    liquidityGeometry: result.liquidityGeometry,
    reflexivityMechanisms: result.reflexivityMechanisms,
    holderInventory: result.holderInventoryReconstruction || null,
    marginalSellerCurve: result.marginalSellerCurve || null,
    supplyLineageIntelligence: result.supplyLineageIntelligence || null,
    prePositioningIntelligence: result.prePositioningIntelligence || null,
    stagedCapital,
    repricingGap: gap,
    eventTimeAcceleration: eventAcceleration,
    sequenceCompression: seqCompression,
    triggerLadder,
    shockScenarios: simulations,
    upstreamAsymmetricEdgeState: result.asymmetricEdgeSuiteState || result.asymmetricEdgeSuite?.state || null,
    shadowOnly: true,
    rankingInfluence: false,
    executableQuote: false,
    promotionRule: "No Ignition Twin output may influence production ranking until point-in-time walk-forward evaluation proves incremental lift, calibration, and acceptable failure behavior after realistic trading costs. Marginal-seller supply remains a sampled behavioral estimate; supply-lineage observations are movement/context evidence rather than asserted seller intent; and staged capital is upstream purchasing power, not guaranteed target demand.",
  };

  return {
    ...result,
    ignitionTwin: twin,
    ignitionState: phase.state,
    ignitionConfidencePct: confidencePct,
    ignitionCapitalUsd: threshold.ignitionCapitalUsd,
    ignitionCapitalMode: threshold.mode,
    ignitionTwinRankingInfluence: false,
  };
}

export function analyzeIgnitionTwinBatch(projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const observedAt = options.observedAt || new Date().toISOString();
  const observations = options.observations || loadIgnitionTwinObservations({ limit: options.historyLimit || 20000 });
  const results = safeProjects.map((project) => analyzeIgnitionTwin(project, {
    ...options,
    history: ignitionHistoryFor(project, observations, { limit: options.projectHistoryLimit || 120 }),
  }));

  if (options.persist !== false) appendIgnitionTwinObservations(results, { observedAt });
  if (options.writeReport !== false) writeReport(results, { observedAt });
  return results;
}

export const __ignitionTwinTestHooks = {
  holderSupplyAtMove,
  eventTimeAcceleration,
  sequenceCompression,
  ignitionThreshold,
  stagedCapitalAssessment,
  buildTriggerLadder,
  evidenceCoverage,
  phaseState,
};

export default analyzeIgnitionTwinBatch;
