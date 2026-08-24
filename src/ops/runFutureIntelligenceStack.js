import fs from "node:fs";
import path from "node:path";

import { buildRealtimeEventFabric } from "../production/realTimeMarketNervousSystem.js";
import { analyzeMicrostructure } from "../production/marketMicrostructureBrain.js";
import { buildEconomicEntityGraph } from "../production/economicEntityGraphV2.js";
import { predictStateTransition } from "../production/stateTransitionPredictor.js";
import { buildTimeToEventForecast } from "../production/timeToEventEngine.js";
import { buildInvalidationPolicy, evaluateInvalidation } from "../production/dynamicInvalidationEngine.js";
import { learnCrossMarketRelevance } from "../production/crossMarketIntelligence.js";
import { forecastLiquidityWeather } from "../production/liquidityWeatherForecast.js";
import { forecastCapitalDestinations } from "../production/capitalDestinationForecastV2.js";
import { evaluateDecisionUtility } from "../production/decisionTheoreticAlpha.js";
import { calculateOpportunityCost } from "../production/opportunityCostEngine.js";
import { decomposeUncertainty } from "../production/uncertaintyDecomposition.js";
import { optimizeResearchInfrastructure } from "../production/selfOptimizingResearchInfrastructure.js";
import { buildAlphaMemoryGraph } from "../production/alphaMemoryGraph.js";
import { generateMarketThesis } from "../production/marketThesisGenerator.js";
import { writeAtomicJson } from "../production/atomicArtifactStore.js";
import { strictIdentity, timestamp } from "../production/productionMath.js";

function readJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}
function eventsFromCandidates(candidates = []) {
  return candidates.flatMap((candidate) => {
    const events = candidate.lpEventTape?.events || candidate.eventTape?.events || [];
    return (Array.isArray(events) ? events : []).map((event) => ({
      ...candidate,
      ...event,
      chain: candidate.chain,
      tokenAddress: candidate.tokenAddress,
      poolAddress: candidate.poolAddress,
    }));
  });
}

export function runFutureIntelligenceStack(options = {}) {
  const now = options.now || new Date().toISOString();
  const universe = options.universe || readJson("data/edge-candidate-universe.json", { candidates: [] });
  const universeCandidates = Array.isArray(universe.candidates) ? universe.candidates : [];
  const candidates = universeCandidates.flatMap((candidate) => {
    const identity = strictIdentity(candidate);
    return identity ? [{ ...candidate, ...identity }] : [];
  });
  const rawLedger = options.marketObservations || readJsonl("data/production-market-observations.jsonl");
  const cutoffMs = timestamp(now);
  const exactLedger = (Array.isArray(rawLedger) ? rawLedger : []).flatMap((row) => {
    const identity = strictIdentity(row);
    const observedMs = timestamp(row.observedAt || row.timestamp || row.outcomeObservedAt);
    if (!identity || observedMs === null || (cutoffMs !== null && observedMs > cutoffMs)) return [];
    return [{ ...row, ...identity }];
  });
  const shadow = options.shadow || readJson("reports/production-shadow-ranking.json", { rows: [] });
  const alphaOS = options.alphaOS || readJson("reports/autonomous-alpha-os.json", {});
  const marketDiscovery = options.marketDiscovery || readJson("reports/market-discovery-engine.json", {});
  const eventRows = options.events || eventsFromCandidates(candidates);

  const fabric = buildRealtimeEventFabric(eventRows, { asOf: now });
  const micro = analyzeMicrostructure(fabric.events, { now });
  const entities = buildEconomicEntityGraph(fabric.events, exactLedger, { now });

  const microById = new Map(micro.projects.map((row) => [row.identityKey, row]));
  const candidateRows = candidates.map((candidate) => {
    const microstructure = microById.get(candidate.canonicalProjectId || `${candidate.chain}:${candidate.tokenAddress}`) ||
      microById.get(`${candidate.chain}:${candidate.tokenAddress}`) || {};
    const transition = predictStateTransition(
      candidate,
      { microstructure },
      { horizonHours: 6 }
    );
    const timeToEvent = buildTimeToEventForecast(
      { ...candidate, identityKey: transition.identityKey },
      { transition }
    );
    const policy = buildInvalidationPolicy(
      { ...candidate, identityKey: transition.identityKey },
      {
        qualifiedEntityFlowUsd: microstructure.netFlowUsd,
        genomeConvergenceScore: candidate.genomeConvergenceScore,
        regimeState: candidate.globalMarketRegimeState,
      },
      { now }
    );
    const invalidation = evaluateInvalidation(policy, {
      qualifiedEntityFlowUsd: microstructure.netFlowUsd,
      liquidityUsd: candidate.liquidityUsd,
      sellerInventoryUsd: candidate.sellerInventoryUsd,
      genomeConvergenceScore: candidate.genomeConvergenceScore,
      regimeState: candidate.globalMarketRegimeState,
    }, { now });
    const uncertainty = decomposeUncertainty(candidate, {
      sourceUncertaintyPct: candidate.evidenceCoveragePct ? 100 - candidate.evidenceCoveragePct : 30,
      identityUncertaintyPct: 0,
      modelDisagreementPct: transition.confidencePct ? 100 - transition.confidencePct : 50,
    });
    const utility = evaluateDecisionUtility(candidate, {
      p25: timeToEvent.events.plus25.probabilityByHorizon["24"],
      p50: timeToEvent.events.plus50.probabilityByHorizon["24"],
      p2x: timeToEvent.events.twoX.probabilityByHorizon["168"],
      pLoss20: timeToEvent.events.failure20.probabilityByHorizon["24"],
      medianTimeHours: timeToEvent.events.plus25.medianTimeHours,
      uncertaintyPct: uncertainty.totalUncertaintyPct,
      captureableExpectedValuePct: candidate.captureableExpectedValuePct || candidate.executionAwareExpectedValuePct || 0,
    });
    const opportunityCost = calculateOpportunityCost(candidate, {
      captureableExpectedValuePct: candidate.captureableExpectedValuePct || candidate.executionAwareExpectedValuePct || 0,
      expectedDurationHours: timeToEvent.events.plus25.medianTimeHours,
      riskScore: candidate.riskScore,
    });
    return {
      ...candidate,
      identityKey: transition.identityKey,
      microstructure,
      transition,
      timeToEvent,
      invalidationPolicy: policy,
      invalidation,
      uncertainty,
      decisionUtility: utility,
      opportunityCost,
      utilityScore: utility.utilityScore,
      totalUncertaintyPct: uncertainty.totalUncertaintyPct,
      ignitionProbabilityPct: (transition.probabilities.IGNITING || 0) * 100,
    };
  });

  const crossRows = exactLedger.map((row) => ({
    ...row,
    futureReturnPct: row.returnPct ?? row.realizedReturnPct,
    btcReturnPct: row.btcReturnPct,
    ethReturnPct: row.ethReturnPct,
    btcVolatility: row.btcVolatility,
    stablecoinFlowUsd: row.stablecoinFlowUsd,
    perpFundingRate: row.perpFundingRate,
    openInterestChangePct: row.openInterestChangePct,
    liquidationUsd: row.liquidationUsd,
    marketBreadthPct: row.marketBreadthPct,
  }));
  const crossMarket = learnCrossMarketRelevance(crossRows, { now });
  const liquidityWeather = forecastLiquidityWeather(exactLedger, { now, horizonHours: 12 });

  const existingRoutes = marketDiscovery.capitalRoutes || marketDiscovery.routes || [];
  const capitalDestination = forecastCapitalDestinations(existingRoutes, candidateRows, { now });
  const destinationById = new Map(capitalDestination.candidateMatches.map((row) => [row.identityKey, row.score]));
  const thesisCandidates = candidateRows.map((row) => ({
    ...row,
    capitalDestinationScore: destinationById.get(row.identityKey) || 0,
  }));

  const researchMetrics = [
    ...(alphaOS.researchEconomics || []),
    ...(marketDiscovery.evidenceValue || []),
  ];
  const researchOptimization = optimizeResearchInfrastructure(researchMetrics, { now });

  const memoryGraph = buildAlphaMemoryGraph({
    projects: thesisCandidates,
    predictions: [
      ...(shadow.rows || []),
      ...(alphaOS.predictions || []),
    ],
    hypotheses: readJson("data/autonomous-alpha-experiments.json", []),
    outcomes: exactLedger,
  }, { now });

  const thesis = generateMarketThesis({
    liquidityWeather,
    capitalDestination,
    crossMarket,
    marketShock: marketDiscovery.marketShock || {},
    primaryInvalidation: "Capital destination reverses, liquidity contracts, or candidate-specific invalidation rules trigger.",
  }, thesisCandidates, { now, topN: 10 });

  const report = {
    schemaVersion: 1,
    generatedAt: now,
    cliRange: "9.0-14.0",
    fabric,
    microstructure: micro,
    entityGraphV2: entities,
    candidates: thesisCandidates,
    crossMarket,
    liquidityWeather,
    capitalDestination,
    researchOptimization,
    alphaMemoryGraph: memoryGraph,
    marketThesis: thesis,
    identityHealth: {
      universeCandidates: universeCandidates.length,
      exactCandidates: candidates.length,
      rejectedCandidates: universeCandidates.length - candidates.length,
      marketObservations: Array.isArray(rawLedger) ? rawLedger.length : 0,
      exactPointInTimeMarketObservations: exactLedger.length,
      rejectedMarketObservations: (Array.isArray(rawLedger) ? rawLedger.length : 0) - exactLedger.length,
      symbolOrNameFallbackAllowed: false,
    },
    policy: {
      researchOnly: true,
      automaticTrading: false,
      automaticPromotion: false,
      exactIdentityRequired: true,
      pointInTimeEvidenceRequired: true,
      futureEvidenceCannotBackfillPastSignals: true,
    },
  };

  if (options.writeReports !== false) {
    writeAtomicJson("reports/future-intelligence-stack.json", report);
    writeAtomicJson("reports/realtime-market-nervous-system.json", fabric);
    writeAtomicJson("reports/market-microstructure-brain.json", micro);
    writeAtomicJson("reports/economic-entity-graph-v2.json", entities);
    writeAtomicJson("reports/cross-market-intelligence.json", crossMarket);
    writeAtomicJson("reports/liquidity-weather-forecast.json", liquidityWeather);
    writeAtomicJson("reports/capital-destination-v2.json", capitalDestination);
    writeAtomicJson("reports/self-optimizing-research.json", researchOptimization);
    writeAtomicJson("reports/alpha-memory-graph.json", memoryGraph);
    writeAtomicJson("reports/market-thesis.json", thesis);
  }

  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = runFutureIntelligenceStack();
    console.log(JSON.stringify({
      cliRange: report.cliRange,
      acceptedEvents: report.fabric.acceptedEvents,
      candidates: report.candidates.length,
      thesis: report.marketThesis.thesis,
    }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
