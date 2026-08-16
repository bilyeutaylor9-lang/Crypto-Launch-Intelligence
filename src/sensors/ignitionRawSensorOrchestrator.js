import fs from "fs";
import path from "path";

import { observeUniswapV3Liquidity } from "./uniswapV3LiquiditySensor.js";
import { observeErc20HolderCohorts } from "./erc20HolderCohortSensor.js";
import { observeHyperliquidLeverage } from "./hyperliquidLeverageSensor.js";
import { observeUniswapV3EventTape } from "./uniswapV3EventTapeSensor.js";
import { resolveEvmTransactionActors } from "./evmTransactionActorResolver.js";
import { observeHolderInventoryReconstruction } from "./holderInventoryReconstructionSensor.js";
import { observeSupplyLineage } from "./supplyLineageSensor.js";
import { observePrePositioningCapital } from "./prePositioningCapitalSensor.js";
import { observeChainWideCapitalRadar, capitalRadarCandidateMatch } from "./chainWideCapitalRadarSensor.js";
import { analyzeEconomicParticipantFlow } from "../engines/economicParticipantFlowEngine.js";
import { analyzeMarginalSellerCurve } from "../engines/marginalSellerCurveEngine.js";
import { analyzeSupplyLineageIntelligence } from "../engines/supplyLineageIntelligenceEngine.js";
import { analyzePrePositioningIntelligence } from "../engines/prePositioningIntelligenceEngine.js";
import { analyzeCapitalDestinationIntelligence } from "../engines/capitalDestinationIntelligenceEngine.js";
import { appendIgnitionEventTape, ignitionEventTapeHistoryFor } from "../data/ignitionEventTapeStore.js";
import {
  appendIgnitionRawSensorObservations,
  ignitionRawSensorHistoryFor,
} from "../data/ignitionRawSensorStore.js";
import {
  appendHolderInventoryObservation,
  holderInventoryHistoryFor,
} from "../data/holderInventoryObservationStore.js";
import { appendSupplyLineageObservation } from "../data/supplyLineageObservationStore.js";
import {
  appendCapitalPreparationObservation,
  capitalPreparationHistoryFor,
} from "../data/capitalPreparationObservationStore.js";
import {
  appendChainCapitalRadarObservations,
  chainCapitalRadarHistoryFor,
} from "../data/chainCapitalRadarObservationStore.js";
import { processCapitalPathLearning } from "../learning/capitalPathLearningCoordinator.js";
import { processCapitalCommitmentLearning } from "../learning/capitalCommitmentCoordinator.js";

const REPORT_FILE = path.resolve("reports", "ignition-raw-sensors.json");
const CAPITAL_RADAR_REPORT_FILE = path.resolve("reports", "chain-capital-radar.json");

function enabled(options = {}) {
  if (typeof options.enabled === "boolean") return options.enabled;
  return String(process.env.IGNITION_RAW_SENSORS_ENABLED || "").toLowerCase() === "true";
}

function capitalRadarEnabled(options = {}) {
  if (typeof options.chainCapitalRadarEnabled === "boolean") return options.chainCapitalRadarEnabled;
  if (typeof options.capitalRadar?.enabled === "boolean") return options.capitalRadar.enabled;
  return String(process.env.IGNITION_CHAIN_CAPITAL_RADAR_ENABLED || "").toLowerCase() === "true";
}

function projectChain(project = {}) {
  return String(project.chain || project.canonicalChain || project.network || project.chainId || "").toLowerCase();
}

function mergeUniqueAddresses(...values) {
  const out = new Set();
  for (const value of values.flat(Infinity)) {
    const normalized = String(value || "").toLowerCase();
    if (/^0x[0-9a-f]{40}$/.test(normalized)) out.add(normalized);
  }
  return [...out];
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function priority(project = {}) {
  const values = [
    project.preBreakoutSequenceScore,
    project.asymmetricEdgePriority,
    project.projectChangeScore,
    project.capitalFlowScore,
    project.smartWalletNoveltyScore,
    project.informationAdvantageScore,
    project.liquidityFormationScore,
  ].map(num).filter((value) => value !== null);
  const stateBoost = {
    HIGH_PRIORITY_SHADOW: 35,
    PRE_CONSENSUS_WATCH_SHADOW: 25,
    OBSERVE_SHADOW: 10,
  }[project.asymmetricEdgeSuiteState] || 0;
  const identityBoost = project.strictIdentityVerified || project.identityVerified ? 10 : 0;
  const routeBoost = project.purchaseRouteConfirmed === true ? 8 : 0;
  const radarCapital = num(project.chainCapitalRadarCandidate?.candidateAdjustedRadarCapitalUsd) || 0;
  const radarBoost = radarCapital > 0 ? Math.min(30, Math.log10(Math.max(1, radarCapital)) * 6) : 0;
  return (values.length ? Math.max(...values) : 0) + stateBoost + identityBoost + routeBoost + radarBoost;
}

function selectedIndexes(projects = [], maxProjects = 8) {
  return projects
    .map((project, index) => ({ index, score: priority(project) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(1, maxProjects))
    .map((item) => item.index);
}

function mergeObserved(project = {}, raw = {}) {
  const liquidity = raw.liquidity || {};
  const holders = raw.holders || {};
  const leverage = raw.leverage || {};
  const eventTape = raw.eventTape || {};
  const holderInventory = raw.holderInventory || null;
  const marginalSellerCurve = raw.marginalSellerCurve || null;
  const supplyLineage = raw.supplyLineage || null;
  const supplyLineageIntelligence = raw.supplyLineageIntelligence || null;
  const prePositioningCapital = raw.prePositioningCapital || null;
  const prePositioningIntelligence = raw.prePositioningIntelligence || null;
  const chainCapitalRadarCandidate = raw.chainCapitalRadarCandidate || project.chainCapitalRadarCandidate || null;
  const capitalDestinationIntelligence = raw.capitalDestinationIntelligence || null;
  const depthByMovePct = liquidity.liquiditySurface?.depthByMovePct || {};
  const holderCohorts = holders.holderCohorts || null;
  const observedDerivatives = leverage.derivatives || null;
  const existingDerivatives = project.derivatives && typeof project.derivatives === "object" ? project.derivatives : {};
  const observedMicrostructure = eventTape.marketMicrostructure || null;
  const participantFlow = raw.economicParticipants || null;
  const participantWindows = participantFlow?.windows || {};
  const observedWindows = Object.fromEntries(Object.entries(observedMicrostructure?.windows || {}).map(([key, window]) => {
    const participant = participantWindows[key] || {};
    const coverage = num(participant.participantResolutionCoveragePct);
    return [key, {
      ...window,
      ...(participant.uniqueEconomicBuyers != null ? { uniqueBuyers: participant.uniqueEconomicBuyers } : {}),
      ...(participant.uniqueEconomicSellers != null ? { uniqueSellers: participant.uniqueEconomicSellers } : {}),
      ...(participant.newToObservedHistoryBuyers != null ? { newToObservedHistoryBuyers: participant.newToObservedHistoryBuyers } : {}),
      ...(participant.repeatObservedBuyers != null ? { repeatObservedBuyers: participant.repeatObservedBuyers } : {}),
      ...(coverage != null ? { participantResolutionCoveragePct: coverage } : {}),
      participantIdentityMode: coverage != null && coverage >= 60 ? "EVM_TRANSACTION_INITIATOR_RESOLVED" : window.participantIdentityMode,
      participantIdentityConfidencePct: coverage != null && coverage >= 60 ? Math.min(90, Math.max(60, coverage)) : window.participantIdentityConfidencePct,
      routerAdjusted: coverage != null && coverage >= 60 ? true : window.routerAdjusted,
    }];
  }));
  const existingMicrostructure = project.marketMicrostructure && typeof project.marketMicrostructure === "object" ? project.marketMicrostructure : {};
  const existingWindows = existingMicrostructure.windows && typeof existingMicrostructure.windows === "object" ? existingMicrostructure.windows : {};
  const eventTimestamps = Array.isArray(eventTape.meaningfulEventTimestamps) ? eventTape.meaningfulEventTimestamps : [];
  const mergedTimestamps = [...new Set([...(Array.isArray(project.meaningfulEventTimestamps) ? project.meaningfulEventTimestamps : []), ...eventTimestamps])].sort();
  const oneHourTape = observedWindows["1h"] || null;
  const prePositioningEvents = Array.isArray(prePositioningCapital?.walletTemporalEvents) ? prePositioningCapital.walletTemporalEvents : [];
  const existingTemporalEvents = Array.isArray(project.walletTemporalEvents) ? project.walletTemporalEvents : [];
  const temporalByKey = new Map();
  for (const event of [...existingTemporalEvents, ...prePositioningEvents]) {
    const key = `${event?.type || ""}:${event?.wallet || event?.address || ""}:${event?.txHash || ""}:${event?.timestamp || event?.observedAt || ""}`;
    if (key !== ":::") temporalByKey.set(key, event);
  }

  return {
    ...project,
    ...(Object.keys(depthByMovePct).length ? {
      depthByMovePct,
      liquiditySurface: {
        ...(project.liquiditySurface || {}),
        ...liquidity.liquiditySurface,
        sensorStatus: liquidity.status,
        source: liquidity.source,
        observedAt: liquidity.observedAt,
        blockNumber: liquidity.blockNumber,
      },
    } : {}),
    ...(holderCohorts ? {
      holderCohorts: {
        ...(project.holderCohorts || {}),
        ...holderCohorts,
      },
      recentAcquisitionRetention1hPct: holderCohorts.recentAcquisitionRetention1hPct ?? project.recentAcquisitionRetention1hPct,
      recentAcquisitionRetention6hPct: holderCohorts.recentAcquisitionRetention6hPct ?? project.recentAcquisitionRetention6hPct,
      holderRetentionEvidenceMode: holderCohorts.mode || project.holderRetentionEvidenceMode,
      holderRetentionConfidencePct: holderCohorts.confidencePct ?? project.holderRetentionConfidencePct,
    } : {}),
    ...(observedDerivatives ? {
      derivatives: {
        ...existingDerivatives,
        ...observedDerivatives,
        // Never erase a stronger position-level liquidation ladder if the project already has one.
        liquidationBands: Array.isArray(existingDerivatives.liquidationBands) && existingDerivatives.liquidationBands.length
          ? existingDerivatives.liquidationBands
          : observedDerivatives.liquidationBands || [],
      },
      openInterestUsd: project.openInterestUsd ?? observedDerivatives.openInterestUsd,
      fundingRate: project.fundingRate ?? observedDerivatives.fundingRate,
    } : {}),
    ...(observedMicrostructure ? {
      marketMicrostructure: {
        ...existingMicrostructure,
        ...observedMicrostructure,
        windows: { ...existingWindows, ...observedWindows },
      },
      lpEventTape: { ...(project.lpEventTape || {}), ...(eventTape.lpEventTape || {}) },
      meaningfulEventTimestamps: mergedTimestamps,
      liquidityAddedUsd: project.liquidityAddedUsd ?? oneHourTape?.liquidityAddedUsd ?? undefined,
      liquidityRemovedUsd: project.liquidityRemovedUsd ?? oneHourTape?.liquidityRemovedUsd ?? undefined,
      liquidityRefillHalfLifeMinutes: project.liquidityRefillHalfLifeMinutes ?? eventTape.lpEventTape?.refillHalfLife?.halfLifeMinutes ?? undefined,
      swapTimeAccelerationRatio: eventTape.marketMicrostructure?.swapTimeAcceleration?.ratio ?? project.swapTimeAccelerationRatio,
      sequenceCompressionRatio: eventTape.marketMicrostructure?.sequenceCompression?.ratio ?? project.sequenceCompressionRatio,
    } : {}),
    ...(holderInventory ? {
      holderInventoryReconstruction: holderInventory,
      sampledHolderInventoryUsd: holderInventory.sampledInventoryUsd ?? project.sampledHolderInventoryUsd,
      holderKnownCostBasisCoveragePct: holderInventory.knownCostBasisCoveragePct ?? project.holderKnownCostBasisCoveragePct,
      holderActorBalanceCoveragePct: holderInventory.actorBalanceCoveragePct ?? project.holderActorBalanceCoveragePct,
      holderAcquisitionCostBands: holderInventory.acquisitionCostBands || project.holderAcquisitionCostBands,
      holderDormancyBands: holderInventory.dormancyBands || project.holderDormancyBands,
    } : {}),
    ...(marginalSellerCurve ? {
      marginalSellerCurve,
      holderSellSupplyBands: marginalSellerCurve.bands || project.holderSellSupplyBands,
      currentSellInventoryUsd: marginalSellerCurve.nearPriceSellInventoryUsd ?? project.currentSellInventoryUsd,
      previousSellInventoryUsd: marginalSellerCurve.previousNearPriceSellInventoryUsd ?? project.previousSellInventoryUsd,
      marginalSellerInventoryState: marginalSellerCurve.inventoryState || project.marginalSellerInventoryState,
      marginalSellerInventoryBurnPct: marginalSellerCurve.nearPriceInventoryBurnPct ?? project.marginalSellerInventoryBurnPct,
      marginalSellerCurveConfidencePct: marginalSellerCurve.confidencePct ?? project.marginalSellerCurveConfidencePct,
    } : {}),
    ...(participantFlow ? {
      economicParticipantFlow: participantFlow,
      observedNewBuyerInitiators1h: participantWindows["1h"]?.newToObservedHistoryBuyers ?? project.observedNewBuyerInitiators1h,
      observedRepeatBuyerInitiators1h: participantWindows["1h"]?.repeatObservedBuyers ?? project.observedRepeatBuyerInitiators1h,
      resolvedUniqueSellers1h: participantWindows["1h"]?.uniqueEconomicSellers ?? project.resolvedUniqueSellers1h,
      priorResolvedUniqueSellers1h: participantWindows["1h"]?.priorUniqueEconomicSellers ?? project.priorResolvedUniqueSellers1h,
      resolvedSellerExhaustionScore: participantWindows["1h"]?.sellerExhaustionScore ?? project.resolvedSellerExhaustionScore,
      resolvedAbsorptionState: participantWindows["1h"]?.absorptionState ?? project.resolvedAbsorptionState,
    } : {}),
    ...(supplyLineage ? {
      supplyLineage,
      supplyLineageConfidencePct: supplyLineage.confidencePct ?? project.supplyLineageConfidencePct,
      marketFacingSupplyUsd: supplyLineage.marketFacingPotentialSupplyUsd ?? project.marketFacingSupplyUsd,
      confirmedSellSupplyUsd: supplyLineage.confirmedSellSupplyUsd ?? project.confirmedSellSupplyUsd,
      cexDirectedSupplyUsd: supplyLineage.cexDirectedSupplyUsd ?? project.cexDirectedSupplyUsd,
      bridgeMobilityUsd: supplyLineage.bridgeMobilityUsd ?? project.bridgeMobilityUsd,
      stagedOneHopSupplyUsd: supplyLineage.stagedOneHopSupplyUsd ?? project.stagedOneHopSupplyUsd,
      unresolvedStagedSupplyUsd: supplyLineage.unresolvedStagedUsd ?? project.unresolvedStagedSupplyUsd,
      dormantSupplyWakeupUsd: supplyLineage.dormantWakeupUsd ?? project.dormantSupplyWakeupUsd,
    } : {}),
    ...(supplyLineageIntelligence ? {
      supplyLineageIntelligence,
      supplyLineageRiskScore: supplyLineageIntelligence.riskScore ?? project.supplyLineageRiskScore,
      supplyLineageState: supplyLineageIntelligence.state || project.supplyLineageState,
      supplyLineageContextualRiskUsd: supplyLineageIntelligence.contextualSupplyRiskUsd ?? project.supplyLineageContextualRiskUsd,
      supplyVacuumIntegrityState: supplyLineageIntelligence.vacuumIntegrityState || project.supplyVacuumIntegrityState,
      oneHopSupplyRiskUsd: (supplyLineageIntelligence.stagedOneHopSupplyUsd ?? 0) + (supplyLineageIntelligence.unresolvedStagedSupplyUsd ?? 0),
    } : {}),
    ...(prePositioningCapital ? {
      prePositioningCapital,
      observedFreshCapitalUsd: prePositioningCapital.observedFreshCapitalUsd ?? project.observedFreshCapitalUsd,
      executionReadyCapitalUsd: prePositioningCapital.executionReadyCapitalUsd ?? project.executionReadyCapitalUsd,
      targetProximityCapitalUsd: prePositioningCapital.targetProximityCapitalUsd ?? project.targetProximityCapitalUsd,
      visiblePrePositioningDeployedUsd: prePositioningCapital.visibleDeployedToTargetUsd ?? project.visiblePrePositioningDeployedUsd,
      walletTemporalEvents: [...temporalByKey.values()],
      stablecoinInflowUsd: project.stablecoinInflowUsd ?? prePositioningCapital.observedFreshCapitalUsd ?? undefined,
      approvalActivityScore: project.approvalActivityScore ?? ((prePositioningCapital.executionReadyCapitalUsd ?? 0) > 0 ? 75 : undefined),
    } : {}),
    ...(prePositioningIntelligence ? {
      prePositioningIntelligence,
      prePositioningState: prePositioningIntelligence.state || project.prePositioningState,
      prePositioningScore: prePositioningIntelligence.score ?? project.prePositioningScore,
      stagedCapitalUsd: prePositioningIntelligence.stagedCapitalUsd ?? project.stagedCapitalUsd,
      candidateAdjustedStagedCapitalUsd: prePositioningIntelligence.candidateAdjustedStagedCapitalUsd ?? project.candidateAdjustedStagedCapitalUsd,
      prePositioningTargetingConfidencePct: prePositioningIntelligence.targetingConfidencePct ?? project.prePositioningTargetingConfidencePct,
    } : {}),
    ...(chainCapitalRadarCandidate ? {
      chainCapitalRadarCandidate,
      chainRadarExecutionReadyCapitalUsd: chainCapitalRadarCandidate.executionReadyCapitalUsd ?? project.chainRadarExecutionReadyCapitalUsd,
      chainRadarCandidateAdjustedCapitalUsd: chainCapitalRadarCandidate.candidateAdjustedRadarCapitalUsd ?? project.chainRadarCandidateAdjustedCapitalUsd,
    } : {}),
    ...(capitalDestinationIntelligence ? {
      capitalDestinationIntelligence,
      capitalDestinationState: capitalDestinationIntelligence.state || project.capitalDestinationState,
      capitalDestinationScore: capitalDestinationIntelligence.score ?? project.capitalDestinationScore,
    } : {}),
    ignitionRawSensors: raw,
    ignitionRawSensorCoveragePct: raw.coveragePct,
    ignitionRawSensorStatus: raw.status,
  };
}

function summarizeStatus(result = {}) {
  return result && ![
    "SENSOR_FAILED", "UNSUPPORTED_CHAIN", "MISSING_POOL_OR_TOKEN_ADDRESS", "MISSING_TOKEN_ADDRESS",
    "NO_MATCHING_PERP_MARKET", "MISSING_SYMBOL", "NO_TRACKED_WALLETS",
    "NO_USD_STABLECOIN_CONFIGURATION", "STABLECOIN_METADATA_UNRESOLVED"
  ].includes(result.status)
    ? 1
    : 0;
}

async function observeOne(project = {}, options = {}) {
  const history = ignitionRawSensorHistoryFor(project, { limit: 20 });
  const eventHistory = ignitionEventTapeHistoryFor(project, { limit: Number(options.participantHistoryLimit || 20_000) });
  const holderInventoryHistory = holderInventoryHistoryFor(project, { limit: Number(options.holderInventoryHistoryLimit || 120) });
  const capitalPreparationHistory = capitalPreparationHistoryFor(project, { limit: Number(options.capitalPreparationHistoryLimit || 120) });
  const [liquidity, holders, leverage, rawEventTape] = await Promise.all([
    observeUniswapV3Liquidity(project, options.liquidity || options),
    observeErc20HolderCohorts(project, options.holders || options),
    observeHyperliquidLeverage(project, options.leverage || options),
    observeUniswapV3EventTape(project, options.eventTape || options),
  ]);

  let actorResolution = {
    status: "NO_SWAP_EVENTS",
    events: rawEventTape?.events || [],
    coveragePct: 0,
    shadowOnly: true,
    rankingInfluence: false,
  };
  if (Array.isArray(rawEventTape?.events) && rawEventTape.events.length) {
    actorResolution = await resolveEvmTransactionActors(project, rawEventTape.events, options.actorResolution || options);
  }
  const eventTape = {
    ...rawEventTape,
    events: actorResolution.events || rawEventTape?.events || [],
    actorResolution: {
      status: actorResolution.status,
      source: actorResolution.source || null,
      coveragePct: actorResolution.coveragePct ?? 0,
      traceCoveragePct: actorResolution.traceCoveragePct ?? 0,
      transactionsInspected: actorResolution.transactionsInspected ?? 0,
      resolvedSwaps: actorResolution.resolvedSwaps ?? 0,
      routerAdjustedSwaps: actorResolution.routerAdjustedSwaps ?? 0,
      contractInitiatorSwaps: actorResolution.contractInitiatorSwaps ?? 0,
      policy: actorResolution.policy || null,
    },
    marketMicrostructure: rawEventTape?.marketMicrostructure ? {
      ...rawEventTape.marketMicrostructure,
      participantIdentityMode: actorResolution.coveragePct >= 60
        ? "EVM_TRANSACTION_INITIATOR_RESOLVED"
        : rawEventTape.marketMicrostructure.participantIdentityMode,
      participantIdentityConfidencePct: actorResolution.coveragePct >= 60
        ? Math.min(90, Math.max(60, actorResolution.coveragePct))
        : rawEventTape.marketMicrostructure.participantIdentityConfidencePct,
      routerAdjusted: actorResolution.coveragePct >= 60,
    } : rawEventTape?.marketMicrostructure,
  };
  const participantProject = analyzeEconomicParticipantFlow(
    { ...project, ignitionRawSensors: { eventTape } },
    {
      events: eventTape.events || [],
      history: eventHistory,
      nowMs: new Date(eventTape.observedAt || Date.now()).getTime(),
      minConfidencePct: options.participantMinConfidencePct || 60,
    }
  );
  const economicParticipants = participantProject.economicParticipantFlow || null;
  const holderInventory = await observeHolderInventoryReconstruction(project, {
    ...(options.holderInventory || options),
    events: eventTape.events || [],
    history: eventHistory,
    minConfidencePct: options.participantMinConfidencePct || 60,
  });
  const marginalSellerProject = analyzeMarginalSellerCurve(
    { ...project, holderInventoryReconstruction: holderInventory },
    { inventory: holderInventory, history: holderInventoryHistory }
  );
  const marginalSellerCurve = marginalSellerProject.marginalSellerCurve || null;
  const supplyLineage = await observeSupplyLineage(
    { ...project, holderInventoryReconstruction: holderInventory, marginalSellerCurve, ignitionRawSensors: { eventTape } },
    { ...(options.supplyLineage || options), events: eventTape.events || [] }
  );
  const supplyLineageProject = analyzeSupplyLineageIntelligence(
    { ...project, holderInventoryReconstruction: holderInventory, marginalSellerCurve, supplyLineage },
    { observation: supplyLineage }
  );
  const supplyLineageIntelligence = supplyLineageProject.supplyLineageIntelligence || null;
  const prePositioningCapital = await observePrePositioningCapital(
    { ...project, ignitionRawSensors: { eventTape }, holderInventoryReconstruction: holderInventory, supplyLineage, supplyLineageIntelligence },
    { ...(options.prePositioning || options), history: capitalPreparationHistory }
  );
  const prePositioningProject = analyzePrePositioningIntelligence(
    { ...project, prePositioningCapital },
    { observation: prePositioningCapital }
  );
  const prePositioningIntelligence = prePositioningProject.prePositioningIntelligence || null;
  const capitalDestinationProject = analyzeCapitalDestinationIntelligence(
    { ...project, prePositioningCapital, prePositioningIntelligence },
    { match: project.chainCapitalRadarCandidate || null }
  );
  const capitalDestinationIntelligence = capitalDestinationProject.capitalDestinationIntelligence || null;
  const observedCount =
    summarizeStatus(liquidity) +
    summarizeStatus(holders) +
    summarizeStatus(leverage) +
    summarizeStatus(eventTape) +
    summarizeStatus(holderInventory) +
    summarizeStatus(supplyLineage) +
    summarizeStatus(prePositioningCapital);
  const prior = history.at(-1) || null;
  const depth10 = num(liquidity.liquiditySurface?.depthByMovePct?.["10"]);
  const priorDepth10 = num(prior?.liquidity?.depthByMovePct?.["10"]);
  const depth10ChangePct = depth10 !== null && priorDepth10 !== null && priorDepth10 > 0
    ? ((depth10 - priorDepth10) / priorDepth10) * 100
    : null;

  return {
    status: observedCount > 0 ? (observedCount === 7 ? "OBSERVED_ALL_AVAILABLE_SENSORS" : "PARTIAL_SENSOR_COVERAGE") : "NO_SENSOR_COVERAGE",
    observedAt: new Date().toISOString(),
    coveragePct: Math.round((observedCount / 7) * 100),
    liquidity,
    holders,
    leverage,
    eventTape,
    actorResolution: {
      status: actorResolution.status,
      coveragePct: actorResolution.coveragePct ?? 0,
      traceCoveragePct: actorResolution.traceCoveragePct ?? 0,
      transactionsInspected: actorResolution.transactionsInspected ?? 0,
      resolvedSwaps: actorResolution.resolvedSwaps ?? 0,
      routerAdjustedSwaps: actorResolution.routerAdjustedSwaps ?? 0,
      contractInitiatorSwaps: actorResolution.contractInitiatorSwaps ?? 0,
      policy: actorResolution.policy || null,
    },
    economicParticipants,
    holderInventory,
    marginalSellerCurve,
    supplyLineage,
    supplyLineageIntelligence,
    prePositioningCapital,
    prePositioningIntelligence,
    chainCapitalRadarCandidate: project.chainCapitalRadarCandidate || null,
    capitalDestinationIntelligence,
    derived: {
      depth10ChangePct,
      priorObservationAt: prior?.observedAt || null,
    },
    policy: "Raw sensors are read-only and shadow-only. EVM participants and funding addresses are never asserted beneficial owners. Holder inventory/cost basis covers only sampled resolved actors and observed swap history. Supply lineage uses only explicit/canonical address labels and observed transfers; it does not infer intent. Pre-positioning capital uses confirmed stablecoin funding/balances and explicit execution-contract approvals; generic router preparation is not treated as target-specific demand. Chain-wide Capital Radar discovers funded execution-ready EOAs before candidate attribution, but only explicit target-specific evidence or prior target activity can assign a destination. Missing sensor data remains unobserved and never becomes a bullish or safe default.",
    shadowOnly: true,
    rankingInfluence: false,
  };
}

async function mapWithConcurrency(items, concurrency, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, () => worker()));
  return out;
}

function writeReport(projects = []) {
  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  const rows = projects
    .filter((project) => project.ignitionRawSensors)
    .map((project) => ({
      symbol: project.symbol || null,
      chain: project.chain || project.canonicalChain || null,
      tokenAddress: project.tokenAddress || project.contractAddress || project.address || null,
      poolAddress: project.poolAddress || project.pairAddress || null,
      status: project.ignitionRawSensorStatus,
      coveragePct: project.ignitionRawSensorCoveragePct,
      liquidityStatus: project.ignitionRawSensors?.liquidity?.status || null,
      holderStatus: project.ignitionRawSensors?.holders?.status || null,
      leverageStatus: project.ignitionRawSensors?.leverage?.status || null,
      eventTapeStatus: project.ignitionRawSensors?.eventTape?.status || null,
      depthByMovePct: project.liquiditySurface?.depthByMovePct || {},
      recentRetention6hPct: project.holderCohorts?.recentAcquisitionRetention6hPct ?? null,
      openInterestUsd: project.derivatives?.openInterestUsd ?? null,
      fundingRate: project.derivatives?.fundingRate ?? null,
      liquidationLadderState: project.derivatives?.liquidationLadderState || null,
      swapEvents: project.ignitionRawSensors?.eventTape?.swapEvents ?? null,
      netFlow1hUsd: project.marketMicrostructure?.windows?.["1h"]?.netFlowUsd ?? null,
      activeLiquidityWithdrawalPressure1hPct: project.marketMicrostructure?.windows?.["1h"]?.activeLiquidityWithdrawalPressurePct ?? null,
      liquidityRefillHalfLifeMinutes: project.liquidityRefillHalfLifeMinutes ?? null,
      swapTimeAccelerationRatio: project.swapTimeAccelerationRatio ?? null,
      sequenceCompressionRatio: project.sequenceCompressionRatio ?? null,
      actorResolutionStatus: project.ignitionRawSensors?.actorResolution?.status || null,
      actorResolutionCoveragePct: project.ignitionRawSensors?.actorResolution?.coveragePct ?? null,
      actorTraceCoveragePct: project.ignitionRawSensors?.actorResolution?.traceCoveragePct ?? null,
      uniqueEconomicBuyers1h: project.economicParticipantFlow?.windows?.["1h"]?.uniqueEconomicBuyers ?? null,
      uniqueEconomicSellers1h: project.economicParticipantFlow?.windows?.["1h"]?.uniqueEconomicSellers ?? null,
      newToObservedHistoryBuyers1h: project.economicParticipantFlow?.windows?.["1h"]?.newToObservedHistoryBuyers ?? null,
      sellerExhaustionState1h: project.economicParticipantFlow?.windows?.["1h"]?.sellerExhaustionState ?? null,
      sellerExhaustionScore1h: project.economicParticipantFlow?.windows?.["1h"]?.sellerExhaustionScore ?? null,
      absorptionState1h: project.economicParticipantFlow?.windows?.["1h"]?.absorptionState ?? null,
      holderInventoryStatus: project.holderInventoryReconstruction?.status || null,
      sampledHolderInventoryUsd: project.holderInventoryReconstruction?.sampledInventoryUsd ?? null,
      holderKnownCostBasisCoveragePct: project.holderInventoryReconstruction?.knownCostBasisCoveragePct ?? null,
      holderActorBalanceCoveragePct: project.holderInventoryReconstruction?.actorBalanceCoveragePct ?? null,
      marginalSellerCurveStatus: project.marginalSellerCurve?.status || null,
      nearPriceSellInventoryUsd: project.marginalSellerCurve?.nearPriceSellInventoryUsd ?? null,
      nearPriceSellInventoryLowerUsd: project.marginalSellerCurve?.nearPriceSellInventoryLowerUsd ?? null,
      nearPriceSellInventoryUpperUsd: project.marginalSellerCurve?.nearPriceSellInventoryUpperUsd ?? null,
      marginalSellerInventoryState: project.marginalSellerCurve?.inventoryState || null,
      marginalSellerInventoryBurnPct: project.marginalSellerCurve?.nearPriceInventoryBurnPct ?? null,
      supplyLineageStatus: project.supplyLineage?.status || null,
      supplyLineageState: project.supplyLineageIntelligence?.state || null,
      supplyLineageRiskScore: project.supplyLineageIntelligence?.riskScore ?? null,
      supplyLineageContextualRiskUsd: project.supplyLineageIntelligence?.contextualSupplyRiskUsd ?? null,
      stagedOneHopSupplyUsd: project.supplyLineage?.stagedOneHopSupplyUsd ?? null,
      unresolvedStagedSupplyUsd: project.supplyLineage?.unresolvedStagedUsd ?? null,
      cexDirectedSupplyUsd: project.supplyLineage?.cexDirectedSupplyUsd ?? null,
      dormantSupplyWakeupUsd: project.supplyLineage?.dormantWakeupUsd ?? null,
      supplyVacuumIntegrityState: project.supplyLineageIntelligence?.vacuumIntegrityState || null,
      prePositioningStatus: project.prePositioningCapital?.status || null,
      prePositioningState: project.prePositioningIntelligence?.state || project.prePositioningCapital?.state || null,
      prePositioningConfidencePct: project.prePositioningIntelligence?.confidencePct ?? project.prePositioningCapital?.confidencePct ?? null,
      observedFreshCapitalUsd: project.prePositioningCapital?.observedFreshCapitalUsd ?? null,
      executionReadyCapitalUsd: project.prePositioningCapital?.executionReadyCapitalUsd ?? null,
      targetProximityCapitalUsd: project.prePositioningCapital?.targetProximityCapitalUsd ?? null,
      candidateAdjustedStagedCapitalUsd: project.prePositioningIntelligence?.candidateAdjustedStagedCapitalUsd ?? null,
      capitalConvergenceState: project.prePositioningCapital?.capitalConvergence?.state || null,
      preparedWalletCount: project.prePositioningCapital?.capitalConvergence?.preparedWalletCount ?? null,
      distinctFundingSourceCount: project.prePositioningCapital?.capitalConvergence?.distinctFundingSourceCount ?? null,
      chainRadarState: project.chainCapitalRadarCandidate?.state || null,
      chainRadarExecutionReadyCapitalUsd: project.chainCapitalRadarCandidate?.executionReadyCapitalUsd ?? null,
      chainRadarCandidateAdjustedCapitalUsd: project.chainCapitalRadarCandidate?.candidateAdjustedRadarCapitalUsd ?? null,
      chainRadarWalletCount: project.chainCapitalRadarCandidate?.candidateWallets?.length ?? null,
      chainRadarTargetWalletCount: project.chainCapitalRadarCandidate?.targetProximityWallets?.length ?? null,
      capitalDestinationState: project.capitalDestinationIntelligence?.state || null,
      capitalDestinationScore: project.capitalDestinationIntelligence?.score ?? null,
    }));
  const report = {
    generatedAt: new Date().toISOString(),
    projects: rows.length,
    fullCoverage: rows.filter((row) => row.coveragePct === 100).length,
    partialCoverage: rows.filter((row) => row.coveragePct > 0 && row.coveragePct < 100).length,
    noCoverage: rows.filter((row) => !row.coveragePct).length,
    rows,
  };
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  return report;
}

function writeCapitalRadarReport(radar = {}) {
  fs.mkdirSync(path.dirname(CAPITAL_RADAR_REPORT_FILE), { recursive: true });
  fs.writeFileSync(CAPITAL_RADAR_REPORT_FILE, JSON.stringify(radar, null, 2));
  return CAPITAL_RADAR_REPORT_FILE;
}

export async function analyzeIgnitionRawSensorsBatch(projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  if (!enabled(options)) {
    return safeProjects.map((project) => ({
      ...project,
      ignitionRawSensors: {
        status: "DISABLED",
        observedAt: new Date().toISOString(),
        coveragePct: 0,
        policy: "Set IGNITION_RAW_SENSORS_ENABLED=true or pass {enabled:true} to activate live read-only sensors.",
        shadowOnly: true,
        rankingInfluence: false,
      },
      ignitionRawSensorStatus: "DISABLED",
      ignitionRawSensorCoveragePct: 0,
    }));
  }

  const maxProjects = Math.max(1, Number(options.maxProjects || process.env.IGNITION_RAW_SENSOR_MAX_PROJECTS || 8));
  const concurrency = Math.max(1, Number(options.concurrency || process.env.IGNITION_RAW_SENSOR_CONCURRENCY || 2));
  let chainCapitalRadar = { status: "DISABLED", observedAt: new Date().toISOString(), chains: [], shadowOnly: true, rankingInfluence: false };
  let radarProjects = safeProjects;
  if (capitalRadarEnabled(options)) {
    const chains = [...new Set(safeProjects.map(projectChain).filter(Boolean))];
    const historyByChain = Object.fromEntries(chains.map((chain) => [chain, chainCapitalRadarHistoryFor(chain, { limit: Number(options.capitalRadarHistoryLimit || 120) })]));
    chainCapitalRadar = await observeChainWideCapitalRadar(safeProjects, { ...(options.capitalRadar || options), historyByChain });
    radarProjects = safeProjects.map((project, index) => {
      const match = capitalRadarCandidateMatch(chainCapitalRadar, project, index);
      if (!match) return project;
      return {
        ...project,
        chainCapitalRadarCandidate: match,
        prePositioningWalletCandidates: mergeUniqueAddresses(project.prePositioningWalletCandidates || [], match.candidateWallets || []),
        targetProximityWallets: mergeUniqueAddresses(project.targetProximityWallets || [], match.targetProximityWallets || []),
      };
    });
    if (options.persist !== false) appendChainCapitalRadarObservations(chainCapitalRadar.chains || []);
    if (options.writeReport !== false) writeCapitalRadarReport(chainCapitalRadar);
  }
  const indexes = new Set(selectedIndexes(radarProjects, maxProjects));
  const selected = radarProjects.filter((_, index) => indexes.has(index));
  const observations = await mapWithConcurrency(selected, concurrency, (project) => observeOne(project, options));
  let observationCursor = 0;
  const enriched = radarProjects.map((project, index) => {
    if (!indexes.has(index)) {
      return {
        ...project,
        ignitionRawSensors: {
          status: "BUDGET_DEFERRED",
          observedAt: new Date().toISOString(),
          coveragePct: 0,
          maxProjects,
          shadowOnly: true,
          rankingInfluence: false,
        },
        ignitionRawSensorStatus: "BUDGET_DEFERRED",
        ignitionRawSensorCoveragePct: 0,
      };
    }
    const raw = observations[observationCursor++];
    return mergeObserved(project, raw);
  });

  if (options.persist !== false) {
    const observedProjects = enriched.filter((project) => project.ignitionRawSensorStatus !== "BUDGET_DEFERRED");
    appendIgnitionRawSensorObservations(observedProjects);
    for (const project of observedProjects) {
      const events = project.ignitionRawSensors?.eventTape?.events || [];
      if (events.length) appendIgnitionEventTape(project, events);
      const holderInventory = project.ignitionRawSensors?.holderInventory;
      if (holderInventory && !["SENSOR_FAILED", "UNSUPPORTED_CHAIN", "MISSING_TOKEN_ADDRESS", "NO_RESOLVED_ACTOR_HISTORY", "BALANCES_UNRESOLVED"].includes(holderInventory.status)) {
        appendHolderInventoryObservation(project, holderInventory);
      }
      const supplyLineage = project.ignitionRawSensors?.supplyLineage;
      const supplyLineageIntelligence = project.ignitionRawSensors?.supplyLineageIntelligence;
      if (supplyLineage && !["SENSOR_FAILED", "UNSUPPORTED_CHAIN", "MISSING_TOKEN_ADDRESS"].includes(supplyLineage.status)) {
        appendSupplyLineageObservation(project, supplyLineage, supplyLineageIntelligence || {});
      }
      const prePositioningCapital = project.ignitionRawSensors?.prePositioningCapital;
      const prePositioningIntelligence = project.ignitionRawSensors?.prePositioningIntelligence;
      if (prePositioningCapital && !["SENSOR_FAILED", "UNSUPPORTED_CHAIN", "NO_TRACKED_WALLETS", "NO_USD_STABLECOIN_CONFIGURATION", "STABLECOIN_METADATA_UNRESOLVED"].includes(prePositioningCapital.status)) {
        appendCapitalPreparationObservation(project, prePositioningCapital, prePositioningIntelligence || {});
      }
    }
  }
  let finalProjects = enriched;
  let pathLearningResult = null;
  if (capitalRadarEnabled(options)) {
    try {
      pathLearningResult = processCapitalPathLearning(enriched, chainCapitalRadar, {
        ...(options.capitalPath || {}),
        persist: options.persist !== false,
        writeReport: options.writeReport !== false,
      });
      finalProjects = pathLearningResult.projects.map((project) => ({
        ...project,
        capitalPathLearningStatus: pathLearningResult.status,
        capitalPathModelTrainingExamples: pathLearningResult.model?.trainingExamples ?? 0,
        capitalPathPromotionState: pathLearningResult.lab?.promotionState || "SHADOW_MODE",
      }));
    } catch (error) {
      finalProjects = enriched.map((project) => ({
        ...project,
        capitalPathLearningStatus: "FAILED_SAFE",
        capitalPathLearningError: error.message,
      }));
    }
    try {
      const commitment = processCapitalCommitmentLearning(finalProjects, chainCapitalRadar, pathLearningResult || {}, {
        ...(options.capitalCommitment || {}),
        persist: options.persist !== false,
        writeReport: options.writeReport !== false,
      });
      finalProjects = commitment.projects.map((project) => ({
        ...project,
        capitalCommitmentLearningStatus: commitment.status,
        capitalCommitmentTrainingExamples: commitment.model?.trainingExamples ?? 0,
        capitalCommitmentPromotionState: commitment.lab?.promotionState || "SHADOW_MODE",
      }));
    } catch (error) {
      finalProjects = finalProjects.map((project) => ({
        ...project,
        capitalCommitmentLearningStatus: "FAILED_SAFE",
        capitalCommitmentLearningError: error.message,
      }));
    }
  }
  if (options.writeReport !== false) writeReport(finalProjects.filter((project) => project.ignitionRawSensorStatus !== "BUDGET_DEFERRED"));
  return finalProjects;
}

export { REPORT_FILE as IGNITION_RAW_SENSOR_REPORT_FILE };

export const __ignitionRawSensorOrchestratorTestHooks = {
  enabled,
  mergeObserved,
  priority,
  selectedIndexes,
  summarizeStatus,
};

export default analyzeIgnitionRawSensorsBatch;
