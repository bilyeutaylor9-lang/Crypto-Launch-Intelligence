import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const WATCHLIST_FILE = path.join(DATA_DIR, "project-watchlist.json");
const MAX_HISTORY = Number(process.env.MAX_PROJECT_WATCH_HISTORY || 120);

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readStore() {
  ensureDataDir();

  if (!fs.existsSync(WATCHLIST_FILE)) {
    return {
      version: 1,
      updatedAt: null,
      projects: {},
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(WATCHLIST_FILE, "utf8"));
    return parsed?.projects ? parsed : { version: 1, updatedAt: null, projects: {} };
  } catch {
    return { version: 1, updatedAt: null, projects: {} };
  }
}

function writeStore(store = {}) {
  ensureDataDir();
  fs.writeFileSync(
    WATCHLIST_FILE,
    JSON.stringify(
      {
        version: 1,
        updatedAt: new Date().toISOString(),
        projects: store.projects || {},
      },
      null,
      2
    )
  );
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

export function getWatchedProject(project = {}) {
  const store = readStore();
  return store.projects[projectWatchId(project)] || null;
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
  const store = readStore();
  const safeProjects = Array.isArray(projects) ? projects : [];

  for (const project of safeProjects) {
    const id = projectWatchId(project);
    const existing = store.projects[id] || {
      id,
      firstSeenAt: new Date().toISOString(),
      history: [],
    };
    const record = compactWatchRecord(project);
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
