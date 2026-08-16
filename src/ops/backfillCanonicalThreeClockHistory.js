import fs from "fs";
import path from "path";
import { analyzeCanonicalThreeClockEdge } from "../engines/canonicalThreeClockEdgeEngine.js";
import {
  appendCanonicalThreeClockObservations,
  canonicalThreeClockKey,
  historyForCanonicalThreeClock,
  loadCanonicalThreeClockObservations,
} from "../data/canonicalThreeClockObservationStore.js";

const DEFAULT_SCAN_HISTORY = path.resolve("data", "scan-history.json");
const MIN_OBSERVATIONS = 5;

const numberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? null;
}

/**
 * Converts a dated scanner record into the same evidence fields used by the
 * canonical engine. This deliberately maps only recorded values; missing
 * historical evidence remains missing rather than being filled with zeros.
 */
export function scanHistoryRecordToThreeClockProject(record = {}) {
  const scores = record.scores || {};
  const market = record.market || {};
  return {
    chain: first(record.chain, record.network),
    symbol: record.symbol,
    name: record.name,
    tokenAddress: first(record.tokenAddress, record.contractAddress, record.address, record.id),
    poolAddress: first(record.poolAddress, record.pairAddress),
    priceUsd: first(market.priceUsd, record.priceUsd),
    liquidityUsd: first(market.liquidityUsd, record.liquidityUsd),
    marketCap: first(market.marketCap, record.marketCap),
    priceChange24h: first(market.priceChange24h, record.priceChange24h),
    developerActivityScore: numberOrNull(scores.developer),
    projectChangeScore: numberOrNull(scores.projectChange),
    githubProScore: numberOrNull(first(scores.githubPro, scores.github)),
    liveCatalystRadarScore: numberOrNull(first(scores.liveCatalystRadar, scores.catalyst)),
    adoptionAccelerationScore: numberOrNull(scores.ecosystemIntegration),
    capitalFlowScore: numberOrNull(scores.capitalFlow),
    smartWalletArrivalScore: numberOrNull(first(scores.smartWallet, scores.smartMoneyAccumulation)),
    buyerBreadthAccelerationScore: numberOrNull(scores.buyPressure),
    socialAccelerationScore: numberOrNull(scores.socialAcceleration),
    xSocialScore: numberOrNull(scores.xSocial),
    narrativeHeatScore: numberOrNull(scores.narrativeHeat),
    holderGrowthScore: numberOrNull(scores.holderGrowth),
    volumeAccelerationScore: numberOrNull(scores.velocity),
    newsCoverageScore: numberOrNull(scores.externalSignal),
  };
}

function readScanHistory(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Hydrates the canonical store from genuine, timestamped scanner records.
 * It is idempotent and only keeps identities with the minimum useful history.
 */
export function backfillCanonicalThreeClockHistory(options = {}) {
  const scanHistoryPath = options.scanHistoryPath || DEFAULT_SCAN_HISTORY;
  const source = readScanHistory(scanHistoryPath)
    .map((record) => ({ record, observedAt: record.scannedAt || record.timestamp || null }))
    .filter(({ record, observedAt }) => Number.isFinite(Date.parse(observedAt)) && canonicalThreeClockKey(scanHistoryRecordToThreeClockProject(record)).includes(":token:"));
  const byIdentity = new Map();
  for (const item of source) {
    const project = scanHistoryRecordToThreeClockProject(item.record);
    const identityKey = canonicalThreeClockKey(project);
    const records = byIdentity.get(identityKey) || [];
    records.push({ ...item, project, identityKey });
    byIdentity.set(identityKey, records);
  }
  const eligible = [...byIdentity.values()].filter((records) => records.length >= MIN_OBSERVATIONS);
  const existing = loadCanonicalThreeClockObservations({ filePath: options.filePath });
  const existingKeys = new Set(existing.map((row) => `${row.identityKey}:${row.observedAt}`));
  const staged = [];
  for (const records of eligible) {
    for (const item of records.sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))) {
      const key = `${item.identityKey}:${item.observedAt}`;
      if (existingKeys.has(key)) continue;
      const history = historyForCanonicalThreeClock(item.project, [...existing, ...staged]);
      staged.push(analyzeCanonicalThreeClockEdge(item.project, { history, observedAt: item.observedAt }));
    }
  }
  const write = options.dryRun ? { saved: 0 } : appendCanonicalThreeClockObservations(staged, { filePath: options.filePath });
  return {
    status: staged.length ? "BACKFILLED" : "UP_TO_DATE",
    sourceRecords: source.length,
    eligibleProjects: eligible.length,
    existingObservations: existing.length,
    backfilledObservations: staged.length,
    saved: write.saved,
    minimumObservationsPerProject: MIN_OBSERVATIONS,
    source: scanHistoryPath,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  console.log(JSON.stringify(backfillCanonicalThreeClockHistory(), null, 2));
}
