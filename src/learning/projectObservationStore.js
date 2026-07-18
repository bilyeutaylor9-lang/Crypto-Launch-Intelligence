import fs from "fs";
import path from "path";
import { normalizeMetricTruthBatch } from "../data/metricTruthNormalizer.js";

const DATA_DIR = path.resolve("data");
const OBSERVATION_FILE = path.join(DATA_DIR, "project-observations.jsonl");
const MAX_READ_LINES = Number(process.env.PROJECT_OBSERVATION_READ_LIMIT || 5000);

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function observationKey(project = {}) {
  return first([
    project.canonicalProjectId,
    project.projectId,
    project.chainId && project.tokenAddress ? `${project.chainId}:${project.tokenAddress}` : null,
    project.chainId && project.poolAddress ? `${project.chainId}:pool:${project.poolAddress}` : null,
    project.coinGeckoId ? `coingecko:${project.coinGeckoId}` : null,
    project.coinPaprikaId ? `coinpaprika:${project.coinPaprikaId}` : null,
  ]) || `unresolved:${project.symbol || project.name || "unknown"}`;
}

export function createProjectObservation(project = {}, observedAt = new Date().toISOString()) {
  const normalized = normalizeMetricTruthBatch([project])[0] || {};
  return {
    observedAt,
    key: observationKey(normalized),
    projectId: normalized.projectId || null,
    name: normalized.name || "Unknown",
    symbol: normalized.symbol || "UNKNOWN",
    chainId: normalized.chainId || null,
    tokenAddress: normalized.tokenAddress || null,
    poolAddress: normalized.poolAddress || null,
    priceUsd: num(normalized.priceUsd),
    dexLiquidityUsd: num(normalized.dexLiquidityUsd),
    stableExitLiquidityUsd: num(normalized.stableExitLiquidityUsd),
    protocolTvlUsd: num(normalized.protocolTvlUsd),
    cexVolume24hUsd: num(normalized.cexVolume24hUsd),
    dexVolume24hUsd: num(normalized.dexVolume24hUsd),
    circulatingMarketCapUsd: num(normalized.circulatingMarketCapUsd),
    fullyDilutedValueUsd: num(normalized.fullyDilutedValueUsd),
    holderCount: num(normalized.holderCount),
    buyCount24h: num(first([project.buyTransactions24h, project.buyCount24h])),
    sellCount24h: num(first([project.sellTransactions24h, project.sellCount24h])),
    uniqueBuyers24h: num(project.uniqueBuyers24h),
    independentBuyers24h: num(project.independentBuyers24h),
    sameFunderBuyers24h: num(project.sameFunderBuyers24h),
    medianBuySizeUsd: num(project.medianBuySizeUsd),
    largestBuySharePct: num(project.largestBuySharePct),
    deployerNetFlow: num(project.deployerNetFlow),
    smartWalletCount: num(first([project.unrelatedSmartWalletCount, project.smartWalletCount])),
    socialScore: num(first([project.socialAccelerationScore, project.xSocialScore])),
    developerScore: num(first([project.developerActivityScore, project.githubProScore])),
    securityStatus: project.instantSafetyStatus || project.contractSafetyStatus || "UNKNOWN",
    evidenceSources: normalized.evidenceSources || [],
    fieldProvenance: normalized.fieldProvenance || {},
  };
}

export function saveProjectObservations(projects = [], options = {}) {
  ensureDataDir();
  const observedAt = options.observedAt || new Date().toISOString();
  const observations = (Array.isArray(projects) ? projects : []).map((project) =>
    createProjectObservation(project, observedAt)
  );
  if (observations.length) {
    fs.appendFileSync(
      OBSERVATION_FILE,
      observations.map((observation) => JSON.stringify(observation)).join("\n") + "\n"
    );
  }
  return {
    file: OBSERVATION_FILE,
    saved: observations.length,
    observedAt,
  };
}

export function loadProjectObservations(options = {}) {
  ensureDataDir();
  if (!fs.existsSync(OBSERVATION_FILE)) return [];
  const limit = Number(options.limit || MAX_READ_LINES);
  const lines = fs.readFileSync(OBSERVATION_FILE, "utf8").trim().split("\n").filter(Boolean);
  return lines.slice(-limit).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

export function summarizeProjectObservations() {
  const observations = loadProjectObservations();
  return {
    file: OBSERVATION_FILE,
    observations: observations.length,
    uniqueProjects: new Set(observations.map((observation) => observation.key)).size,
    latestObservedAt: observations.at(-1)?.observedAt || null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizeProjectObservations(), null, 2));
}
