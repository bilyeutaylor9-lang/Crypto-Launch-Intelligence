import fs from "fs";
import path from "path";
import {
  appendMemorySidecar,
  memoryFileSizeBytes,
  memoryRewriteLimitBytes,
  memorySidecarPath,
  readMemorySidecarTail,
  shouldUseAppendOnlyMemory,
} from "./boundedMemoryStore.js";

const DATA_DIR = path.resolve("data");
const WATCHLIST_FILE = path.join(DATA_DIR, "project-watchlist.json");
const MAX_HISTORY = Number(process.env.MAX_PROJECT_WATCH_HISTORY || 120);
const DEFAULT_MAX_LOAD_RECORDS = 10000;
let cachedStore = null;
let cachedStoreKey = "";

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(true|1|yes|on)$/i.test(String(value).trim());
}

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function maxLoadRecords(options = {}) {
  const configured = Math.floor(num(options.limit || process.env.MAX_PROJECT_WATCH_LOAD_RECORDS));
  return configured > 0 ? configured : DEFAULT_MAX_LOAD_RECORDS;
}

function fileMtimeMs(filePath = WATCHLIST_FILE) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function emptyStore() {
  return {
    version: 1,
    updatedAt: null,
    projects: {},
  };
}

function storeFromSidecarRecords(records = []) {
  const store = emptyStore();
  for (const entry of Array.isArray(records) ? records : []) {
    const record = entry?.record || entry;
    const id = entry?.id || projectWatchId(entry);
    if (!id || !record) continue;
    const existing = store.projects[id] || {
      id,
      firstSeenAt: record.scannedAt || null,
      history: [],
    };
    const history = [...(existing.history || []), record].slice(-MAX_HISTORY);
    store.projects[id] = {
      ...existing,
      id,
      name: entry.name || existing.name || "Unknown",
      symbol: entry.symbol || existing.symbol || "UNKNOWN",
      chain: entry.chain || existing.chain || "unknown",
      lastSeenAt: record.scannedAt || existing.lastSeenAt || null,
      lastScore: record.score,
      lastConviction: record.conviction,
      lastAllocationBucket: record.allocationBucket,
      lastWatchlistPriority: record.watchlistPriority,
      lastThesis: record.thesis,
      trend: trendFromHistory(existing.history || [], record.score),
      history,
    };
    if (record.scannedAt && (!store.updatedAt || Date.parse(record.scannedAt) > Date.parse(store.updatedAt))) {
      store.updatedAt = record.scannedAt;
    }
  }
  return store;
}

function readStore(options = {}) {
  ensureDataDir();

  const sidecarPath = memorySidecarPath(WATCHLIST_FILE);
  const mtimeMs = fileMtimeMs(WATCHLIST_FILE);
  const sidecarMtimeMs = fileMtimeMs(sidecarPath);
  const limit = maxLoadRecords(options);
  const cacheKey = `${mtimeMs}:${sidecarMtimeMs}:${limit}`;

  if (!mtimeMs && !sidecarMtimeMs) {
    cachedStore = null;
    cachedStoreKey = "";
    return emptyStore();
  }

  if (cachedStore && cachedStoreKey === cacheKey) return cachedStore;

  const sidecarRecords = sidecarMtimeMs
    ? readMemorySidecarTail(WATCHLIST_FILE, {
        limit,
        maxBytes: Number(process.env.PROJECT_WATCH_SIDECAR_READ_BYTES || 16 * 1024 * 1024),
      })
    : [];
  const largeLegacyJson = memoryFileSizeBytes(WATCHLIST_FILE) > memoryRewriteLimitBytes(process.env);
  const preferSidecar = sidecarRecords.length && boolEnv(process.env.PROJECT_WATCH_PREFER_SIDECAR, true);
  const allowLargeLegacyRead = boolEnv(process.env.PROJECT_WATCH_ALLOW_LARGE_JSON_READ, false);

  if (preferSidecar || (largeLegacyJson && !allowLargeLegacyRead)) {
    cachedStore = storeFromSidecarRecords(sidecarRecords);
    cachedStoreKey = cacheKey;
    return cachedStore;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(WATCHLIST_FILE, "utf8"));
    cachedStore = parsed?.projects ? parsed : { version: 1, updatedAt: null, projects: {} };
    cachedStoreKey = cacheKey;
    return cachedStore;
  } catch {
    cachedStore = storeFromSidecarRecords(sidecarRecords);
    cachedStoreKey = cacheKey;
    return cachedStore;
  }
}

function writeStore(store = {}) {
  ensureDataDir();
  const normalized = {
    version: 1,
    updatedAt: new Date().toISOString(),
    projects: store.projects || {},
  };
  fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(normalized, null, 2));
  cachedStore = normalized;
  cachedStoreKey = "";
}

export function projectWatchId(project = {}) {
  return String(
    project.address ||
      project.tokenAddress ||
      project.pairAddress ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  ).toLowerCase();
}

export function loadProjectWatchStore() {
  return readStore();
}

export function getWatchedProject(project = {}, store = null) {
  const resolvedStore = store?.projects ? store : readStore();
  return resolvedStore.projects[projectWatchId(project)] || null;
}

function compactWatchRecord(project = {}) {
  return {
    scannedAt: new Date().toISOString(),
    score: Number(project.pipelineScore || project.opportunityScore || 0),
    rawScore: Number(project.rawPipelineScore || project.pipelineScore || 0),
    conviction: project.conviction || "Unknown",
    allocationBucket: project.allocationBucket || "Unknown",
    marketRegime: project.marketRegime || "Unknown",
    watchlistPriority: Number(project.watchlistPriority || 0),
    xSocialScore: Number(project.xSocialScore || 0),
    xSocialVelocityScore: Number(project.xSocialVelocityScore || 0),
    institutionalWatchScore: Number(project.institutionalWatchScore || 0),
    signalDensityScore: Number(project.signalDensityScore || 0),
    riskScore: Number(project.signalProfile?.risk || project.riskScore || 0),
    liquidityUsd: Number(project.liquidityUsd || project.liquidity || 0),
    volume24h: Number(project.volume24h || project.volume || 0),
    prePumpPatternMatchPct: Number(project.prePumpPatternMatchPct || 0),
    trapPatternMatchPct: Number(project.trapPatternMatchPct || 0),
    liquidityMigrationScore: Number(project.liquidityMigrationScore || 0),
    smartMoneyConvictionScore: Number(project.smartMoneyConvictionScore || 0),
    vestingPressureScore: Number(project.vestingPressureScore || 0),
    aiDecision: project.aiDecision || null,
    alphaTags: project.alphaTags || [],
    riskFlags: project.riskFlags || [],
    thesis: project.aiThesis?.memo || project.opportunityThesis || "",
  };
}

function trendFromHistory(history = [], currentScore = 0) {
  const previous = history.at(-1);
  const priorScore = Number(previous?.score || 0);
  const delta = Math.round(Number(currentScore || 0) - priorScore);

  return {
    previousScore: priorScore,
    scoreDelta: delta,
    direction: delta >= 8 ? "improving" : delta <= -8 ? "deteriorating" : "stable",
  };
}

export function saveProjectWatchlist(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const records = safeProjects.map(compactWatchRecord);

  if (shouldUseAppendOnlyMemory(WATCHLIST_FILE)) {
    const sidecar = appendMemorySidecar(
      WATCHLIST_FILE,
      safeProjects.map((project, index) => ({
        id: projectWatchId(project),
        name: project.name || "Unknown",
        symbol: project.symbol || "UNKNOWN",
        chain: project.chain || "unknown",
        record: records[index],
      })),
      { recordType: "project-watchlist" }
    );
    return {
      saved: safeProjects.length,
      watchedProjects: null,
      file: sidecar.file,
      persistenceMode: sidecar.mode,
      legacyFilePreserved: sidecar.legacyFilePreserved,
      legacyFileBytes: sidecar.legacyFileBytes,
    };
  }

  const store = readStore();

  for (const [index, project] of safeProjects.entries()) {
    const id = projectWatchId(project);
    const existing = store.projects[id] || {
      id,
      firstSeenAt: new Date().toISOString(),
      history: [],
    };
    const record = records[index];
    const history = [...(existing.history || []), record].slice(-MAX_HISTORY);

    store.projects[id] = {
      ...existing,
      id,
      name: project.name || existing.name || "Unknown",
      symbol: project.symbol || existing.symbol || "UNKNOWN",
      chain: project.chain || existing.chain || "unknown",
      lastSeenAt: record.scannedAt,
      lastScore: record.score,
      lastConviction: record.conviction,
      lastAllocationBucket: record.allocationBucket,
      lastWatchlistPriority: record.watchlistPriority,
      lastThesis: record.thesis,
      trend: trendFromHistory(existing.history || [], record.score),
      history,
    };
  }

  writeStore(store);

  return {
    saved: safeProjects.length,
    watchedProjects: Object.keys(store.projects).length,
    file: WATCHLIST_FILE,
  };
}

export function summarizeProjectWatchlist() {
  const store = readStore();
  const projects = Object.values(store.projects || {});

  return {
    file: WATCHLIST_FILE,
    watchedProjects: projects.length,
    lastUpdatedAt: store.updatedAt,
    topWatched: projects
      .sort((a, b) => Number(b.lastWatchlistPriority || 0) - Number(a.lastWatchlistPriority || 0))
      .slice(0, 15)
      .map((project) => ({
        name: project.name,
        symbol: project.symbol,
        score: project.lastScore,
        bucket: project.lastAllocationBucket,
        priority: project.lastWatchlistPriority,
        trend: project.trend?.direction || "unknown",
      })),
  };
}
