import fs from "node:fs";
import path from "node:path";

import { canonicalIdentityKey, num } from "../edge/edgeMath.js";

const FILE = path.resolve("data", "committed-loaded-vacuum-observations.jsonl");
const DEFAULT_LIMIT = 100_000;
const DEFAULT_MAX_BYTES = 96 * 1024 * 1024;
export const COMMITTED_LOADED_VACUUM_SIGNAL_VERSION = "V10_COMMITTED_LOADED_VACUUM_V1";

function explicitRoundTripExecutionCostBps(project = {}) {
  const execution = project.executionReality || project.executionCostEvidence || project.executionRealityEvidence || {};
  const explicit = finite(
    execution.roundTripExecutionCostBps,
    execution.roundTripCostBps,
    project.roundTripExecutionCostBps,
    project.estimatedRoundTripExecutionCostBps
  );
  if (explicit !== null) return explicit;
  const components = [
    finite(execution.entrySlippageBps, project.estimatedEntrySlippageBps),
    finite(execution.exitSlippageBps, project.estimatedExitSlippageBps),
    finite(execution.entryProtocolFeeBps, project.entryProtocolFeeBps),
    finite(execution.exitProtocolFeeBps, project.exitProtocolFeeBps),
    finite(execution.gasCostBps, project.gasCostBps),
  ];
  return components.every((value) => value !== null) ? components.reduce((sum, value) => sum + value, 0) : null;
}

function finite(...values) {
  for (const value of values) {
    const parsed = num(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function triBool(value) {
  return typeof value === "boolean" ? value : null;
}

function arrivalAt(arrival = {}, horizonHours) {
  const rows = Array.isArray(arrival.arrivalCurve) ? arrival.arrivalCurve : [];
  const exact = rows.find((row) => Number(row?.horizonHours) === Number(horizonHours));
  if (!exact) return { expectedArrivingCapitalUsd: null, expectedArrivalToIgnitionRatio: null };
  return {
    expectedArrivingCapitalUsd: finite(exact.expectedArrivingCapitalUsd),
    expectedArrivalToIgnitionRatio: finite(exact.expectedArrivalToIgnitionRatio),
  };
}

function readTail(file = FILE, maxBytes = DEFAULT_MAX_BYTES) {
  if (!fs.existsSync(file)) return [];
  const stat = fs.statSync(file);
  const bytes = Math.min(stat.size, Math.max(1024, Number(maxBytes) || DEFAULT_MAX_BYTES));
  const start = Math.max(0, stat.size - bytes);
  const buffer = Buffer.alloc(bytes);
  const fd = fs.openSync(file, "r");
  try { fs.readSync(fd, buffer, 0, bytes, start); } finally { fs.closeSync(fd); }
  const lines = buffer.toString("utf8").split("\n");
  if (start > 0) lines.shift();
  return lines.filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

export function buildCommittedLoadedVacuumObservation(project = {}, observedAt = new Date().toISOString()) {
  const arrival = project.capitalArrivalIntelligence || {};
  const twin = project.ignitionTwin || {};
  const supply = project.ignitionRawSensors?.supplyLineageIntelligence || project.supplyLineageIntelligence || {};
  const state = arrival.state || "NO_CALIBRATED_ARRIVAL_EVIDENCE";
  const h1 = arrivalAt(arrival, 1);
  const h6 = arrivalAt(arrival, 6);
  const h24 = arrivalAt(arrival, 24);
  const supplyVacuumEvidence = triBool(arrival.supplyVacuumSupported) ?? (supply.vacuumIntegrityState ? supply.vacuumIntegrityState === "VACUUM_INTEGRITY_SUPPORTED" : null);
  return {
    schemaVersion: 3,
    signalDefinitionVersion: COMMITTED_LOADED_VACUUM_SIGNAL_VERSION,
    identityKey: canonicalIdentityKey(project),
    observedAt,
    scanRunId: project.scanRunId || project.runId || null,
    codeCommitSha: project.codeCommitSha || process.env.GITHUB_SHA || null,
    chain: project.chain || project.network || project.canonicalChain || null,
    symbol: project.symbol || null,
    name: project.name || null,
    priceUsd: finite(project.priceUsd, project.price, project.marketData?.priceUsd),
    marketCapUsd: finite(project.circulatingMarketCapUsd, project.marketCap, project.marketData?.marketCap),
    liquidityUsd: finite(project.stableExitLiquidityUsd, project.activeLiquidityUsd, project.liquidityUsd, project.marketData?.liquidityUsd),
    volume24hUsd: finite(project.volume24h, project.dexVolume24hUsd, project.marketData?.volume24h),
    priceChange24hPct: finite(project.priceChange24hPct, project.priceChange24h, project.marketData?.priceChange24hPct),
    productionScore: finite(project.finalScore, project.opportunityScore, project.score),
    riskScore: finite(project.riskScore),
    productionTier: project.tier || project.opportunityTier || null,
    ignitionState: twin.state || project.ignitionState || null,
    capitalArrivalState: state,
    treatment: state === "COMMITTED_LOADED_VACUUM_SHADOW",
    oneHourExpectedArrivalUsd: finite(h1.expectedArrivingCapitalUsd),
    oneHourExpectedArrivalToIgnitionRatio: finite(h1.expectedArrivalToIgnitionRatio),
    sixHourExpectedArrivalUsd: finite(arrival.sixHourExpectedArrivalUsd, h6.expectedArrivingCapitalUsd),
    sixHourExpectedArrivalToIgnitionRatio: finite(arrival.sixHourExpectedArrivalToIgnitionRatio, h6.expectedArrivalToIgnitionRatio),
    twentyFourHourExpectedArrivalUsd: finite(h24.expectedArrivingCapitalUsd),
    twentyFourHourExpectedArrivalToIgnitionRatio: finite(h24.expectedArrivalToIgnitionRatio),
    ignitionCapitalUsd: finite(arrival.ignitionCapitalUsd, twin.ignitionCapitalUsd),
    supplyVacuumSupported: supplyVacuumEvidence,
    vacuumIntegrityState: supply.vacuumIntegrityState || twin.vacuumIntegrityState || null,
    sellerExhaustionScore: finite(project.sellerExhaustionScore),
    buyerReplacementScore: finite(project.buyerReplacementScore),
    marginalSellerInventoryBurnPct: finite(project.marginalSellerCurve?.nearPriceInventoryBurnPct, project.marginalSellerInventoryBurnPct),
    liquidityConvexityIndex: finite(project.liquidityConvexityIndex),
    reflexivityMechanismStrengthScore: finite(project.reflexivityMechanismStrengthScore),
    evidenceCoveragePct: finite(twin.evidenceCoveragePct, project.evidenceCoveragePct),
    pressureWithoutMovement: project.marketPressure ? triBool(project.marketPressure.pressureWithoutMovement) : null,
    globalMarketRegimeState: project.globalMarketRegime?.state || project.globalMarketRegimeState || null,
    marketVolatilityPercentile: finite(project.globalMarketRegime?.inputs?.marketVolatilityPercentile, project.globalMarketSnapshot?.marketVolatilityPercentile),
    altBreadthPct: finite(project.globalMarketRegime?.inputs?.altBreadthPct, project.globalMarketSnapshot?.altBreadthPct),
    roundTripExecutionCostBps: explicitRoundTripExecutionCostBps(project),
    executionCostProvenance: project.executionReality?.provenance || project.executionCostEvidence?.provenance || project.executionRealityEvidence?.provenance || null,
    shadowOnly: true,
    rankingInfluence: false,
  };
}

export function appendCommittedLoadedVacuumObservations(projects = [], options = {}) {
  const file = options.file || FILE;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const observedAt = options.observedAt || new Date().toISOString();
  const rows = (Array.isArray(projects) ? projects : []).map((project) => buildCommittedLoadedVacuumObservation(project, observedAt));
  if (rows.length) fs.appendFileSync(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  if (fs.existsSync(file) && fs.statSync(file).size > Number(options.maxBytes || DEFAULT_MAX_BYTES)) {
    const retained = readTail(file, Math.floor(Number(options.maxBytes || DEFAULT_MAX_BYTES) * 0.75));
    fs.writeFileSync(file, retained.map((row) => JSON.stringify(row)).join("\n") + (retained.length ? "\n" : ""));
  }
  return { file, saved: rows.length, observations: rows };
}

export function loadCommittedLoadedVacuumObservations(options = {}) {
  return readTail(options.file || FILE, options.maxBytes).slice(-Math.max(1, Number(options.limit || DEFAULT_LIMIT)));
}

export function summarizeCommittedLoadedVacuumObservations(options = {}) {
  const rows = loadCommittedLoadedVacuumObservations(options);
  return {
    file: options.file || FILE,
    observations: rows.length,
    schemaV2Observations: rows.filter((row) => Number(row.schemaVersion) >= 2).length,
    schemaV3Observations: rows.filter((row) => Number(row.schemaVersion) >= 3).length,
    explicitExecutionCostObservations: rows.filter((row) => finite(row.roundTripExecutionCostBps) !== null).length,
    uniqueProjects: new Set(rows.map((row) => row.identityKey).filter(Boolean)).size,
    treatments: rows.filter((row) => row.treatment).length,
    latestObservedAt: rows.at(-1)?.observedAt || null,
  };
}

export const COMMITTED_LOADED_VACUUM_OBSERVATION_FILE = FILE;
export const __committedLoadedVacuumObservationHooks = { finite, triBool, arrivalAt, readTail, explicitRoundTripExecutionCostBps };
