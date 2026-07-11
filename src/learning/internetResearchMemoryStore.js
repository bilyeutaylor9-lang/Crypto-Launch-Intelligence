// src/learning/internetResearchMemoryStore.js

import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const RESEARCH_MEMORY_FILE = path.join(DATA_DIR, "internet-research-memory.json");
const MAX_RECORDS = Number(process.env.MAX_INTERNET_RESEARCH_RECORDS || 15000);

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readMemory() {
  ensureDataDir();

  if (!fs.existsSync(RESEARCH_MEMORY_FILE)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(RESEARCH_MEMORY_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMemory(records = []) {
  ensureDataDir();
  fs.writeFileSync(RESEARCH_MEMORY_FILE, JSON.stringify(records.slice(-MAX_RECORDS), null, 2));
}

function projectId(project = {}) {
  return String(
    project.address ||
      project.pairAddress ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  ).toLowerCase();
}

export function saveInternetResearchMemory(projects = []) {
  const existing = readMemory();
  const records = (Array.isArray(projects) ? projects : [])
    .filter((project) => project.internetResearch)
    .map((project) => ({
      id: projectId(project),
      name: project.name || "Unknown",
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || "unknown",
      researchedAt: new Date().toISOString(),
      score: project.internetResearchScore || 0,
      riskScore: project.internetResearchRiskScore || 0,
      status: project.internetResearch?.status || {},
      catalystHits: project.internetResearch?.catalystHits || [],
      narrativeHits: project.internetResearch?.narrativeHits || [],
      riskHits: project.internetResearch?.riskHits || [],
      sourceCount: project.internetResearch?.sourceCount || 0,
      crawlPageCount: project.internetResearch?.crawlPageCount || 0,
      webcrawl: project.internetResearch?.webcrawl || {},
      articles: (project.internetResearch?.articles || []).slice(0, 8),
      pages: (project.internetResearch?.pages || []).slice(0, 6),
      summary: project.internetResearch?.summary || "",
    }));
  const updated = [...existing, ...records].slice(-MAX_RECORDS);

  writeMemory(updated);

  return {
    saved: records.length,
    totalRecords: updated.length,
    file: RESEARCH_MEMORY_FILE,
  };
}

export function loadInternetResearchMemory() {
  return readMemory();
}

export function getProjectInternetResearchHistory(project = {}, limit = 25) {
  const id = typeof project === "string" ? project.toLowerCase() : projectId(project);

  return readMemory()
    .filter((record) => record.id === id)
    .slice(-Number(limit || 25));
}

export function summarizeInternetResearchMemory() {
  const memory = readMemory();

  return {
    file: RESEARCH_MEMORY_FILE,
    records: memory.length,
    latest: memory.at(-1) || null,
    latestProjects: memory.slice(-10).map((record) => ({
      name: record.name,
      symbol: record.symbol,
      score: record.score,
      sourceCount: record.sourceCount,
      crawlPageCount: record.crawlPageCount || 0,
    })),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizeInternetResearchMemory(), null, 2));
}
