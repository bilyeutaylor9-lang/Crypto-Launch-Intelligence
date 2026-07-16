import crypto from "crypto";
import fs from "fs";
import path from "path";

import { buildEvidenceBrief } from "./swarmBrain.js";

const DEFAULT_QUEUE_FILE = path.resolve("data/local-ai-research-queue.json");
const MAX_QUEUE_ITEMS = 5_000;
const LOCK_RETRY_COUNT = 80;
const LOCK_RETRY_MS = 25;
const STALE_LOCK_MS = 5 * 60_000;

function now() {
  return new Date().toISOString();
}

function queueFile(options = {}) {
  return path.resolve(options.filePath || DEFAULT_QUEUE_FILE);
}

function emptyQueue() {
  return { version: 1, updatedAt: now(), tasks: [] };
}

function readQueue(filePath) {
  if (!fs.existsSync(filePath)) return emptyQueue();

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      version: parsed.version || 1,
      updatedAt: parsed.updatedAt || now(),
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    };
  } catch {
    return emptyQueue();
  }
}

function writeQueue(queue, filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const normalized = {
    version: 1,
    updatedAt: now(),
    tasks: (queue.tasks || []).slice(-MAX_QUEUE_ITEMS),
  };
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2));
  fs.renameSync(tempPath, filePath);
  return normalized;
}

function pause(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function withQueueLock(filePath, operation) {
  const lockPath = `${filePath}.lock`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  for (let attempt = 0; attempt < LOCK_RETRY_COUNT; attempt += 1) {
    let descriptor;
    try {
      descriptor = fs.openSync(lockPath, "wx");
      try {
        return operation();
      } finally {
        fs.closeSync(descriptor);
        fs.unlinkSync(lockPath);
      }
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;

      try {
        const ageMs = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (ageMs > STALE_LOCK_MS) fs.unlinkSync(lockPath);
      } catch (lockError) {
        if (lockError?.code !== "ENOENT") throw lockError;
      }
      pause(LOCK_RETRY_MS);
    }
  }

  throw new Error("Timed out waiting for the local AI research queue lock.");
}

function compactText(value, maxLength = 500) {
  if (value === null || value === undefined || value === "") return null;
  const text = typeof value === "string" ? value : String(value);
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 18))}[truncated]` : text;
}

function compactList(value, maxItems = 8) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.slice(0, maxItems).map((item) => compactText(item, 240)).filter(Boolean);
}

function compactNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export function buildResearchProjectSnapshot(project = {}) {
  const fields = [
    "name",
    "symbol",
    "chain",
    "chainId",
    "permanentProjectKey",
    "contractAddress",
    "tokenAddress",
    "address",
    "pairAddress",
    "poolAddress",
    "finalSelectionState",
    "finalIntegrityVerdict",
    "finalIdentityState",
    "identityState",
    "contractVerificationStatus",
    "ownershipStatus",
    "adminControlStatus",
    "deployerAddress",
    "purchaseRouteStatus",
    "executionRouteStatus",
    "primaryNarrative",
    "narrative",
  ];
  const numericFields = [
    "pipelineScore",
    "confidenceAdjustedScore",
    "dataConfidenceScore",
    "evidenceQualityScore",
    "sourceTruthScore",
    "sourceReliabilityScore",
    "finalIntegrityScore",
    "liquidityUsd",
    "activeLiquidityTruthScore",
    "liquidityControlRisk",
    "volume24h",
    "marketCap",
    "fdv",
    "buyers24h",
    "buyerCount24h",
    "priceChange24h",
    "riskScore",
    "instantSafetyRiskScore",
    "contractRiskScore",
    "honeypotRiskScore",
    "washTradingRiskScore",
    "walletClusterRiskScore",
    "bundledLaunchRiskScore",
    "holderConcentrationScore",
    "topHolderConcentrationPct",
    "holderCount",
    "buyerRetentionScore",
    "smartMoneyAccumulationScore",
    "smartWalletPerformanceScore",
    "deployerReputationScore",
    "deployerRiskScore",
    "developerActivityScore",
    "githubProScore",
    "githubScore",
    "narrativeHeatScore",
    "catalystScore",
    "catalystCalendarScore",
    "accelerationScore",
    "tokenomicsScore",
  ];
  const snapshot = Object.fromEntries(fields.map((field) => [field, compactText(project[field], 500)]));

  for (const field of numericFields) snapshot[field] = compactNumber(project[field]);

  snapshot.identityVerified = project.identityVerified === true ? true : project.identityVerified === false ? false : null;
  snapshot.contractVerified = project.contractVerified === true ? true : project.contractVerified === false ? false : null;
  snapshot.liquidityVerified = project.liquidityVerified === true ? true : project.liquidityVerified === false ? false : null;
  snapshot.honeypotDetected = project.honeypotDetected === true ? true : project.honeypotDetected === false ? false : null;
  snapshot.sourceCodeVerified = project.sourceCodeVerified === true ? true : project.sourceCodeVerified === false ? false : null;
  snapshot.ownershipRenounced = project.ownershipRenounced === true ? true : project.ownershipRenounced === false ? false : null;
  snapshot.purchaseRouteConfirmed = project.purchaseRouteConfirmed === true ? true : project.purchaseRouteConfirmed === false ? false : null;
  snapshot.executionRouteAvailable = project.executionRouteAvailable === true ? true : project.executionRouteAvailable === false ? false : null;
  snapshot.discoverySources = compactList(project.discoverySources);
  snapshot.sourcesWithUsableEvidence = compactList(project.sourcesWithUsableEvidence);
  snapshot.sourcesConfigured = compactList(project.sourcesConfigured);
  snapshot.sourcesFailed = compactList(project.sourcesFailed);
  snapshot.sourcesSkipped = compactList(project.sourcesSkipped);
  snapshot.sourcesRateLimited = compactList(project.sourcesRateLimited);
  snapshot.sourcesRegionBlocked = compactList(project.sourcesRegionBlocked);
  snapshot.riskFlags = compactList(project.riskFlags);
  snapshot.finalBlockingReasons = compactList(project.finalBlockingReasons);
  snapshot.finalWarningReasons = compactList(project.finalWarningReasons);
  snapshot.narratives = compactList(project.narratives);
  snapshot.catalysts = compactList(project.catalysts || project.catalystEvidence);

  return snapshot;
}

function fingerprintFor(project) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(buildEvidenceBrief(project)))
    .digest("hex")
    .slice(0, 20);
}

function taskIdFor(projectKey, fingerprint) {
  return crypto.createHash("sha256").update(`${projectKey}:${fingerprint}`).digest("hex").slice(0, 24);
}

export function loadLocalAIResearchQueue(options = {}) {
  const filePath = queueFile(options);
  const queue = readQueue(filePath);
  return { ...queue, file: filePath };
}

export function summarizeLocalAIResearchQueue(queue = {}) {
  const tasks = Array.isArray(queue.tasks) ? queue.tasks : [];
  const count = (status) => tasks.filter((task) => task.status === status).length;
  return {
    total: tasks.length,
    queued: count("QUEUED"),
    running: count("RUNNING"),
    complete: count("COMPLETE"),
    file: queue.file || null,
  };
}

export function enqueueLocalAIResearchTasks(assignments = [], options = {}) {
  const filePath = queueFile(options);
  return withQueueLock(filePath, () => {
    const queue = readQueue(filePath);
    const queuedAt = now();
    const queuedTasks = [];

    for (const assignment of Array.isArray(assignments) ? assignments : []) {
      const project = buildResearchProjectSnapshot(assignment.project);
      const projectKey = String(assignment.projectKey || project.permanentProjectKey || project.contractAddress || project.symbol || "unknown").toLowerCase();
      const fingerprint = fingerprintFor(project);
      const id = taskIdFor(projectKey, fingerprint);
      const existing = queue.tasks.find((task) => task.id === id);

      if (existing) {
        existing.priority = assignment.priority;
        existing.depth = assignment.depth;
        existing.agentIds = assignment.agentIds;
        existing.gate = assignment.gate;
        existing.project = project;
        existing.updatedAt = queuedAt;
        queuedTasks.push(existing);
        continue;
      }

      const task = {
        id,
        projectKey,
        fingerprint,
        status: "QUEUED",
        depth: assignment.depth,
        priority: assignment.priority,
        agentIds: Array.isArray(assignment.agentIds) ? assignment.agentIds : [],
        gate: assignment.gate || {},
        project,
        queuedAt,
        updatedAt: queuedAt,
        attempts: 0,
      };
      queue.tasks.push(task);
      queuedTasks.push(task);
    }

    const saved = writeQueue(queue, filePath);
    return {
      tasks: queuedTasks,
      queue: { ...saved, file: filePath },
      summary: summarizeLocalAIResearchQueue({ ...saved, file: filePath }),
    };
  });
}

export function claimNextLocalAIResearchTask(options = {}) {
  const filePath = queueFile(options);
  return withQueueLock(filePath, () => {
    const queue = readQueue(filePath);
    const leaseMs = Math.max(60_000, Number(options.leaseMs || 30 * 60_000));
    const current = Date.now();

    for (const task of queue.tasks) {
      if (task.status !== "RUNNING" || !task.startedAt) continue;
      if (current - new Date(task.startedAt).getTime() > leaseMs) {
        task.status = "QUEUED";
        task.lastError = "Worker lease expired; task returned to the queue.";
        task.updatedAt = now();
      }
    }

    const next = queue.tasks
      .filter((task) => task.status === "QUEUED")
      .sort((left, right) => right.priority - left.priority || String(left.queuedAt).localeCompare(String(right.queuedAt)))[0];

    if (!next) {
      writeQueue(queue, filePath);
      return null;
    }

    next.status = "RUNNING";
    next.startedAt = now();
    next.updatedAt = next.startedAt;
    next.attempts = Number(next.attempts || 0) + 1;
    writeQueue(queue, filePath);
    return { ...next };
  });
}

export function completeLocalAIResearchTask(taskId, result = {}, options = {}) {
  const filePath = queueFile(options);
  return withQueueLock(filePath, () => {
    const queue = readQueue(filePath);
    const task = queue.tasks.find((item) => item.id === taskId);
    if (!task) return null;

    task.status = "COMPLETE";
    task.completedAt = now();
    task.updatedAt = task.completedAt;
    task.result = result;
    delete task.lastError;
    writeQueue(queue, filePath);
    return { ...task };
  });
}

export function releaseLocalAIResearchTask(taskId, error, options = {}) {
  const filePath = queueFile(options);
  return withQueueLock(filePath, () => {
    const queue = readQueue(filePath);
    const task = queue.tasks.find((item) => item.id === taskId);
    if (!task) return null;

    task.status = "QUEUED";
    task.updatedAt = now();
    task.lastError = compactText(error?.message || error, 300) || "Local worker failed before completing this task.";
    delete task.startedAt;
    writeQueue(queue, filePath);
    return { ...task };
  });
}
