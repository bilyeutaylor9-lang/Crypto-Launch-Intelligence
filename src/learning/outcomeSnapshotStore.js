import fs from "fs";
import path from "path";
import { createOutcomeSnapshot, compareOutcomeSnapshots } from "./outcomeTracker.js";

const DATA_DIR = path.resolve("data");
const SNAPSHOT_FILE = path.join(DATA_DIR, "outcome-snapshots.json");
const MAX_SNAPSHOTS = Number(process.env.MAX_OUTCOME_SNAPSHOTS || 50000);

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readSnapshots() {
  ensureDataDir();

  if (!fs.existsSync(SNAPSHOT_FILE)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSnapshots(snapshots = []) {
  ensureDataDir();
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshots.slice(-MAX_SNAPSHOTS), null, 2));
}

export function saveOutcomeSnapshots(projects = []) {
  const existing = readSnapshots();
  const createdAt = new Date().toISOString();
  const snapshots = (Array.isArray(projects) ? projects : []).map((project) =>
    createOutcomeSnapshot(project, createdAt)
  );

  writeSnapshots([...existing, ...snapshots]);

  return {
    saved: snapshots.length,
    totalSnapshots: Math.min(existing.length + snapshots.length, MAX_SNAPSHOTS),
    file: SNAPSHOT_FILE,
  };
}

export function loadOutcomeSnapshots() {
  return readSnapshots();
}

export function compareLatestOutcomes(projects = []) {
  const snapshots = readSnapshots();
  const byKey = new Map();

  for (const snapshot of snapshots) {
    if (!snapshot.key) continue;
    byKey.set(snapshot.key, snapshot);
  }

  return (Array.isArray(projects) ? projects : []).map((project) => {
    const current = createOutcomeSnapshot(project);
    const previous = byKey.get(current.key);

    return {
      project: project.name || project.symbol || "Unknown",
      symbol: project.symbol || "Unknown",
      status: previous ? "tracked" : "new",
      outcome: previous ? compareOutcomeSnapshots(previous, current) : null,
    };
  });
}

export function summarizeOutcomeSnapshots() {
  const snapshots = readSnapshots();
  const latest = snapshots.at(-1);

  return {
    file: SNAPSHOT_FILE,
    snapshots: snapshots.length,
    latestTimestamp: latest?.timestamp || null,
    uniqueProjects: new Set(snapshots.map((snapshot) => snapshot.key)).size,
  };
}
