import fs from "fs";
import path from "path";
import { identityKeyForProject } from "../discovery/projectIdentityGraph.js";

const DATA_DIR = path.resolve("data");
const LEDGER_FILE = path.join(DATA_DIR, "research-coverage-ledger.json");
const MAX_PROJECTS = Number(process.env.MAX_RESEARCH_COVERAGE_PROJECTS || 100000);

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function emptyLedger() {
  return {
    ledgerVersion: "research-coverage-v1",
    generatedAt: null,
    runCount: 0,
    projects: {},
  };
}

function normalizeLedger(value = {}) {
  return {
    ledgerVersion: value.ledgerVersion || "research-coverage-v1",
    generatedAt: value.generatedAt || null,
    runCount: num(value.runCount),
    projects: value.projects && typeof value.projects === "object" ? value.projects : {},
  };
}

function readLedger() {
  if (!fs.existsSync(LEDGER_FILE)) return emptyLedger();

  try {
    return normalizeLedger(JSON.parse(fs.readFileSync(LEDGER_FILE, "utf8")));
  } catch {
    return emptyLedger();
  }
}

function writeLedger(ledger) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporaryFile = `${LEDGER_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(normalizeLedger(ledger), null, 2));
  fs.renameSync(temporaryFile, LEDGER_FILE);
}

function trimProjects(projects = {}) {
  return Object.fromEntries(
    Object.entries(projects)
      .sort(([, left], [, right]) =>
        Date.parse(right.lastSeenAt || 0) - Date.parse(left.lastSeenAt || 0) ||
        num(right.deferredCount) - num(left.deferredCount)
      )
      .slice(0, MAX_PROJECTS)
  );
}

function compactProject(project = {}) {
  return {
    name: project.name || "Unknown",
    symbol: project.symbol || project.ticker || "UNKNOWN",
    chain: project.chain || project.chainId || "unknown",
    discoveryLane: project.discoveryLane || "unknown",
  };
}

export function loadResearchCoverageLedger() {
  return readLedger();
}

export function saveResearchCoveragePlan(projects = [], plan = {}, context = {}) {
  const ledger = readLedger();
  const candidates = Array.isArray(projects) ? projects : [];
  const selectedKeys = new Set(plan.selectedIdentityKeys || []);
  const observedAt = context.observedAt || new Date().toISOString();
  const runSequence = Math.max(num(ledger.runCount) + 1, num(plan.report?.runSequence));

  for (const project of candidates) {
    const identityKey = identityKeyForProject(project);
    if (identityKey.endsWith(":alias:unknown")) continue;

    const previous = ledger.projects[identityKey] || {
      identityKey,
      firstSeenAt: observedAt,
      seenCount: 0,
      queuedCount: 0,
      deferredCount: 0,
    };
    const selected = selectedKeys.has(identityKey);

    ledger.projects[identityKey] = {
      ...previous,
      ...compactProject(project),
      identityKey,
      firstSeenAt: previous.firstSeenAt || observedAt,
      lastSeenAt: observedAt,
      seenCount: num(previous.seenCount) + 1,
      queuedCount: num(previous.queuedCount) + (selected ? 1 : 0),
      deferredCount: num(previous.deferredCount) + (selected ? 0 : 1),
      lastQueuedAt: selected ? observedAt : previous.lastQueuedAt || null,
      lastSelectedAt: selected ? observedAt : previous.lastSelectedAt || previous.lastQueuedAt || null,
      lastSelectionReason: selected
        ? plan.selectionReasons?.[identityKey] || "SELECTED"
        : previous.lastSelectionReason || null,
      lastState: selected ? "SELECTED" : "DEFERRED",
    };
  }

  ledger.generatedAt = observedAt;
  ledger.runCount = runSequence;
  ledger.projects = trimProjects(ledger.projects);
  writeLedger(ledger);

  return {
    status: "OK",
    file: LEDGER_FILE,
    generatedAt: observedAt,
    runSequence,
    savedProjects: candidates.length,
    trackedProjects: Object.keys(ledger.projects).length,
    selectedThisRun: selectedKeys.size,
    deferredThisRun: Math.max(0, candidates.length - selectedKeys.size),
  };
}

export function summarizeResearchCoverageLedger(ledger = readLedger()) {
  const normalized = normalizeLedger(ledger);
  const projects = Object.values(normalized.projects);

  return {
    file: LEDGER_FILE,
    generatedAt: normalized.generatedAt,
    runCount: normalized.runCount,
    trackedProjects: projects.length,
    neverQueued: projects.filter((project) => num(project.queuedCount) === 0).length,
    deferredProjects: projects.filter((project) => num(project.deferredCount) > 0).length,
  };
}
