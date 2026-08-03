// src/storage/supabaseMemory.js
import fs from "fs";
import path from "path";

import "../config/loadEnv.js";
import {
  buildSupabaseRestHeaders,
  resolveSupabaseConfig,
} from "./supabaseSync.js";

const DEFAULT_REPORT_PATH = "reports/supabase-memory.json";

function text(value = "") {
  return String(value || "").trim();
}

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(true|1|yes|on)$/i.test(String(value).trim());
}

function scoreOf(project = {}) {
  return num(project.pipelineScore ?? project.opportunityScore ?? project.score);
}

function projectKeyFor(project = {}) {
  return String(
    project.permanentProjectKey ||
      project.projectKey ||
      project.identityKey ||
      project.address ||
      project.tokenAddress ||
      project.poolAddress ||
      project.pairAddress ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  ).toLowerCase();
}

function symbolChainKey(value = {}) {
  const symbol = text(value.symbol).toUpperCase();
  const chain = text(value.chain).toLowerCase();
  return symbol ? `${chain || "unknown"}:${symbol}` : "";
}

function compactRows(rows = [], limit = 8) {
  return rows.slice(0, limit).map((row) => ({
    runId: row.run_id || null,
    observedAt: row.created_at || row.decision_at || null,
    rank: row.rank ?? null,
    score: num(row.score),
    finalState: row.final_state || null,
    confidence: row.confidence || null,
  }));
}

function isHealthCheckRow(row = {}) {
  return (
    row.final_state === "HEALTH_CHECK" ||
    row.source === "supabase-health-check" ||
    String(row.project_key || "").startsWith("system:supabase-health-check")
  );
}

function ensureReportDir(filePath = DEFAULT_REPORT_PATH) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

async function fetchTableRows(config = {}, table = "", params = {}, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || config.timeoutMs || 15000));
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const url = new URL(`${config.restUrl}/${encodeURIComponent(table)}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: buildSupabaseRestHeaders(config, {
        accept: "application/json",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = typeof response.text === "function" ? await response.text() : "";
      throw new Error(`Supabase ${table} read failed: ${response.status} ${String(detail).slice(0, 400)}`);
    }

    return typeof response.json === "function" ? await response.json() : [];
  } finally {
    clearTimeout(timer);
  }
}

function aggregateProjectMemory(projectRows = [], receiptRows = []) {
  const byProject = new Map();
  const bySymbolChain = new Map();

  for (const row of projectRows.filter((item) => !isHealthCheckRow(item))) {
    const key = text(row.project_key).toLowerCase();
    if (!key) continue;

    const current =
      byProject.get(key) || {
        projectKey: key,
        name: row.name || "Unknown",
        symbol: row.symbol || "UNKNOWN",
        chain: row.chain || null,
        previousRunCount: 0,
        qualifiedCount: 0,
        blockedCount: 0,
        bestHistoricalScore: 0,
        latestScore: 0,
        latestRank: null,
        latestFinalState: null,
        latestConfidence: null,
        firstSeenAt: row.created_at || null,
        lastSeenAt: row.created_at || null,
        observations: [],
        receiptCount: 0,
        lastTruthStatus: null,
      };

    current.previousRunCount += 1;
    current.qualifiedCount += row.final_qualified ? 1 : 0;
    current.blockedCount += ["BLOCKED", "IDENTITY_CONFLICT", "REJECTED"].includes(row.final_state || "") ? 1 : 0;
    current.bestHistoricalScore = Math.max(current.bestHistoricalScore, num(row.score));

    if (!current.lastSeenAt || String(row.created_at || "") >= String(current.lastSeenAt || "")) {
      current.lastSeenAt = row.created_at || current.lastSeenAt;
      current.latestScore = num(row.score);
      current.latestRank = row.rank ?? null;
      current.latestFinalState = row.final_state || null;
      current.latestConfidence = row.confidence || null;
    }

    if (!current.firstSeenAt || String(row.created_at || "") < String(current.firstSeenAt || "")) {
      current.firstSeenAt = row.created_at || current.firstSeenAt;
    }

    current.observations.push(row);
    byProject.set(key, current);

    const alternateKey = symbolChainKey(row);
    if (alternateKey && !bySymbolChain.has(alternateKey)) bySymbolChain.set(alternateKey, key);
  }

  for (const row of receiptRows.filter((item) => !isHealthCheckRow(item))) {
    const key = text(row.project_key).toLowerCase();
    if (!key || !byProject.has(key)) continue;
    const current = byProject.get(key);
    current.receiptCount += 1;
    current.lastTruthStatus = row.truth_status || current.lastTruthStatus;
  }

  return {
    byProject: Object.fromEntries(
      [...byProject.entries()].map(([key, value]) => [
        key,
        {
          ...value,
          observations: compactRows(value.observations),
        },
      ])
    ),
    bySymbolChain: Object.fromEntries(bySymbolChain.entries()),
  };
}

function matchProjectMemory(project = {}, memory = {}) {
  const byProject = memory.byProject || {};
  const bySymbolChain = memory.bySymbolChain || {};
  const direct = byProject[projectKeyFor(project)];
  if (direct) return direct;

  const alternateProjectKey = bySymbolChain[symbolChainKey(project)];
  return alternateProjectKey ? byProject[alternateProjectKey] : null;
}

export async function collectSupabaseMemory(options = {}) {
  const env = options.env || process.env;
  const enabled = boolEnv(env.SUPABASE_MEMORY_ENABLED, true);
  const config = options.config || resolveSupabaseConfig(env);

  if (!enabled) {
    return {
      status: "SKIPPED",
      reason: "SUPABASE_MEMORY_ENABLED is false.",
    };
  }

  if (!config.enabled) {
    return {
      status: "SKIPPED",
      reason: "Supabase is disabled.",
    };
  }

  if (!config.configured) {
    return {
      status: "FAILED",
      reason: "Supabase URL/key configuration is incomplete.",
    };
  }

  if (!config.serverWriteCapable) {
    return {
      status: "FAILED",
      reason: "Remote memory reads require a server key because scanner tables use RLS.",
      keyType: config.keyType,
    };
  }

  try {
    const runLimit = Math.max(1, Number(options.runLimit || env.SUPABASE_MEMORY_RUN_LIMIT || 25));
    const projectLimit = Math.max(1, Number(options.projectLimit || env.SUPABASE_MEMORY_PROJECT_LIMIT || 2500));
    const receiptLimit = Math.max(1, Number(options.receiptLimit || env.SUPABASE_MEMORY_RECEIPT_LIMIT || 1000));
    const [runs, projects, receipts] = await Promise.all([
      fetchTableRows(
        config,
        config.tables.runs,
        {
          select:
            "run_id,completed_at,status,discovery_count,scanned_count,qualified_count,blocked_count,best_symbol,best_score,market_regime,scoring_model",
          order: "completed_at.desc",
          limit: runLimit,
        },
        options
      ),
      fetchTableRows(
        config,
        config.tables.projects,
        {
          select:
            "run_id,project_key,rank,name,symbol,chain,score,tier,confidence,final_state,final_qualified,risk_score,liquidity_usd,volume_24h,market_cap_usd,source,created_at",
          order: "created_at.desc",
          limit: projectLimit,
        },
        options
      ),
      fetchTableRows(
        config,
        config.tables.alphaReceipts,
        {
          select:
            "receipt_id,run_id,project_key,decision_at,symbol,chain,rank,final_state,final_qualified,score,confidence,truth_status,effective_independent_evidence_count",
          order: "decision_at.desc",
          limit: receiptLimit,
        },
        options
      ),
    ]);
    const indexed = aggregateProjectMemory(projects, receipts);

    return {
      status: "OK",
      generatedAt: new Date().toISOString(),
      keyType: config.keyType,
      tables: config.tables,
      counts: {
        runs: runs.length,
        projectRows: projects.length,
        receiptRows: receipts.length,
        rememberedProjects: Object.keys(indexed.byProject).length,
      },
      latestRun: runs[0] || null,
      byProject: indexed.byProject,
      bySymbolChain: indexed.bySymbolChain,
    };
  } catch (error) {
    return {
      status: "FAILED",
      reason: error.message,
      tables: config.tables,
    };
  }
}

export function applySupabaseMemory(projects = [], memory = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => {
    const match = matchProjectMemory(project, memory);
    const currentScore = scoreOf(project);

    if (!match) {
      return {
        ...project,
        supabaseMemory: {
          status: memory.status === "OK" ? "NEW_OR_NOT_SEEN" : "UNAVAILABLE",
          remoteMemoryStatus: memory.status || "UNKNOWN",
        },
      };
    }

    return {
      ...project,
      supabaseMemory: {
        status: "MATCHED",
        remoteMemoryStatus: memory.status,
        projectKey: match.projectKey,
        previousRunCount: match.previousRunCount,
        firstSeenAt: match.firstSeenAt,
        lastSeenAt: match.lastSeenAt,
        latestScore: match.latestScore,
        bestHistoricalScore: match.bestHistoricalScore,
        scoreDeltaFromLatest: Math.round((currentScore - num(match.latestScore)) * 100) / 100,
        latestRank: match.latestRank,
        latestFinalState: match.latestFinalState,
        latestConfidence: match.latestConfidence,
        qualifiedCount: match.qualifiedCount,
        blockedCount: match.blockedCount,
        receiptCount: match.receiptCount,
        lastTruthStatus: match.lastTruthStatus,
      },
    };
  });
}

export function summarizeSupabaseMemoryImpact(projects = [], memory = {}) {
  const values = Array.isArray(projects) ? projects : [];
  const matched = values.filter((project) => project.supabaseMemory?.status === "MATCHED");

  return {
    status: memory.status || "UNKNOWN",
    rememberedProjects: memory.counts?.rememberedProjects || 0,
    matchedProjects: matched.length,
    newOrUnseenProjects: values.filter((project) => project.supabaseMemory?.status === "NEW_OR_NOT_SEEN").length,
    returningQualifiedBefore: matched.filter((project) => num(project.supabaseMemory?.qualifiedCount) > 0).length,
    returningPreviouslyBlocked: matched.filter((project) => num(project.supabaseMemory?.blockedCount) > 0).length,
  };
}

export function writeSupabaseMemoryReport(memory = {}, filePath = DEFAULT_REPORT_PATH) {
  ensureReportDir(filePath);
  fs.writeFileSync(path.resolve(filePath), JSON.stringify(memory, null, 2));
  return path.resolve(filePath);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const memory = await collectSupabaseMemory();
  const filePath = writeSupabaseMemoryReport(memory);
  console.log(JSON.stringify({ filePath, status: memory.status, counts: memory.counts, reason: memory.reason }, null, 2));
}
