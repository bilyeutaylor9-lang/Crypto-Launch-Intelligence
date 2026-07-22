import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.resolve("data", "web-crawler");
const RUNS_FILE = path.join(DATA_DIR, "crawler-runs.json");
const EVIDENCE_FILE = path.join(DATA_DIR, "crawler-evidence.json");
const DEFAULT_MAX_RUNS = 25;
const DEFAULT_MAX_EVIDENCE = 2_000;

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(filePath = "", fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function atomicWriteJson(filePath = "", payload = {}) {
  ensureDir();
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2));
  fs.renameSync(tmpPath, filePath);
}

export function loadCrawlerRuns(options = {}) {
  const maxRuns = Number(options.maxRuns || DEFAULT_MAX_RUNS);
  return readJson(RUNS_FILE, []).slice(-maxRuns);
}

export function persistCrawlerRun(run = {}, options = {}) {
  const maxRuns = Number(options.maxRuns || DEFAULT_MAX_RUNS);
  const runs = [...loadCrawlerRuns({ maxRuns }), run].slice(-maxRuns);
  atomicWriteJson(RUNS_FILE, runs);
  return { file: RUNS_FILE, runs: runs.length };
}

export function loadCrawlerEvidence(options = {}) {
  const maxEvidence = Number(options.maxEvidence || DEFAULT_MAX_EVIDENCE);
  return readJson(EVIDENCE_FILE, []).slice(-maxEvidence);
}

export function persistCrawlerEvidence(evidence = [], options = {}) {
  const maxEvidence = Number(options.maxEvidence || DEFAULT_MAX_EVIDENCE);
  const next = [...loadCrawlerEvidence({ maxEvidence }), ...evidence].slice(-maxEvidence);
  atomicWriteJson(EVIDENCE_FILE, next);
  return { file: EVIDENCE_FILE, evidenceRecords: next.length };
}

export function summarizeCrawlerStorage() {
  const runs = loadCrawlerRuns();
  const evidence = loadCrawlerEvidence();
  return {
    dataDir: DATA_DIR,
    runs: runs.length,
    evidenceRecords: evidence.length,
    latestRunAt: runs.at(-1)?.generatedAt || null,
  };
}
