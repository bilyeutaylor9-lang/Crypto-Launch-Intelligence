// src/storage/supabaseSync.js
import crypto from "node:crypto";

import "../config/loadEnv.js";
import { buildPersistentProjectKey } from "../identity/persistentProjectKey.js";

const DEFAULT_SCAN_RUNS_TABLE = "scan_runs";
const DEFAULT_SCAN_PROJECTS_TABLE = "scan_projects";
const DEFAULT_SCAN_REPORTS_TABLE = "scan_reports";
const DEFAULT_ALPHA_RECEIPTS_TABLE = "alpha_truth_receipts";
const DEFAULT_PROJECT_LIMIT = 500;

function text(value = "") {
  return String(value || "").trim();
}

function firstText(...values) {
  return values.map((value) => text(value)).find(Boolean) || "";
}

export function isModernSupabaseApiKey(value = "") {
  return /^sb_(?:secret|publishable)_/i.test(text(value));
}

export function buildSupabaseRestHeaders(config = {}, extraHeaders = {}) {
  const key = text(config.key);
  const headers = {
    apikey: key,
    ...extraHeaders,
  };

  // Modern sb_secret_/sb_publishable_ keys are API keys, not JWTs.
  if (key && !isModernSupabaseApiKey(key)) {
    headers.authorization = `Bearer ${key}`;
  }

  return headers;
}

function resolveSupabaseKey(env = {}) {
  const candidates = [
    ["secret", env.SUPABASE_SECRET_KEY, true],
    ["service_role", env.SUPABASE_SERVICE_ROLE_KEY, true],
    ["anon", env.SUPABASE_ANON_KEY, false],
    ["publishable", env.SUPABASE_PUBLISHABLE_KEY, false],
    ["next_public_publishable", env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, false],
  ];

  const configured = candidates.filter(([, value]) => text(value));
  const found = configured[0];

  return {
    key: found ? text(found[1]) : "",
    keyType: found ? found[0] : "missing",
    serverWriteCapable: Boolean(found?.[2]),
    fallbackServerKeys: configured
      .filter(([, value, serverWriteCapable]) => serverWriteCapable && text(value) !== text(found?.[1]))
      .map(([keyType, value]) => ({ keyType, key: text(value) })),
  };
}

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(true|1|yes|on)$/i.test(String(value).trim());
}

function safeTableName(value = "", fallback = "") {
  const table = text(value || fallback);
  return /^[a-z][a-z0-9_]*$/i.test(table) ? table : fallback;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function safeIso(value = null, fallback = new Date().toISOString()) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function compactText(value = "", maxLength = 1200) {
  const raw = String(value ?? "");
  return raw.length > maxLength ? `${raw.slice(0, Math.max(0, maxLength - 18))}[truncated]` : raw;
}

function compactIndexedText(value = "", maxLength = 220) {
  const raw = String(value ?? "").trim();
  if (raw.length <= maxLength) return raw;
  const hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
  const prefixLength = Math.max(12, maxLength - hash.length - 6);
  return `${raw.slice(0, prefixLength)}#${hash}`;
}

function nullableIndexedText(value = "", maxLength = 220) {
  const raw = compactIndexedText(value, maxLength);
  return raw || null;
}

function compactList(values = [], limit = 12) {
  return (Array.isArray(values) ? values : [values])
    .slice(0, limit)
    .map((value) => {
      if (typeof value === "string" || typeof value === "number") return compactText(value, 320);
      if (!value || typeof value !== "object") return "";
      return compactText(value.reason || value.label || value.title || value.name || value.signal || "", 320);
    })
    .filter(Boolean);
}

function dedupeRows(rows = [], keyFor = () => "") {
  const seen = new Map();

  for (const row of rows) {
    const key = keyFor(row);
    if (!key || seen.has(key)) continue;
    seen.set(key, row);
  }

  return [...seen.values()];
}

function projectKeyFor(project = {}) {
  return compactIndexedText(buildPersistentProjectKey(project), 220);
}

function scoreOf(project = {}) {
  return num(project.pipelineScore ?? project.opportunityScore ?? project.score);
}

function reportRowsFor(runId = "", reportPaths = {}) {
  return Object.entries(reportPaths || {})
    .filter(([key, value]) => key.endsWith("Path") && typeof value === "string" && value)
    .map(([key, value]) => ({
      run_id: compactIndexedText(runId, 180),
      report_name: compactIndexedText(key.replace(/Path$/, ""), 120),
      report_path: value,
    }));
}

function compactProjectPayload(project = {}) {
  return {
    guardedLiveScore: project.guardedLiveScore ?? null,
    liveRank: project.liveRank ?? null,
    liveActionStatus: project.liveActionStatus || null,
    liveRankingModel: project.liveRankingModel || null,
    liveRankingCoverage: project.liveRankingCoverage ?? null,
    liveExecutionReady: project.liveExecutionReady === true,
    liveRankingDisplayEligible: project.liveRankingDisplayEligible === true,
    liveRankingUtilityEligible: project.liveRankingUtilityEligible === true,
    legacyProductionScore: project.legacyProductionScore ?? null,
    legacyRank: project.legacyRank ?? null,
    liveRankingMissingEvidence: compactList(project.liveRankingMissingEvidence, 16),
    liveRankingBlocks: compactList(project.liveRankingBlocks, 12),
    microTestPlan: project.microTestPlan || null,
    source: project.source || null,
    discoverySources: project.discoverySources || [],
    address: project.address || project.tokenAddress || null,
    poolAddress: project.poolAddress || project.pairAddress || null,
    finalIntegrityVerdict: project.finalIntegrityVerdict || null,
    finalBlockingReasons: compactList(project.finalBlockingReasons, 10),
    finalWarningReasons: compactList(project.finalWarningReasons, 10),
    vNextRecommendation: project.vNextRecommendation || null,
    evidenceCoverageScore: num(project.evidenceCoverageScore),
    trustScore: num(project.trustScore ?? project.progressiveTrustScore),
    executionScore: num(project.executionScore ?? project.progressiveExecutionScore),
    moneyRank: num(project.moneyRankScore ?? project.marketOpportunityRankScore),
    sniperState: project.sniperState || null,
    smallCapHunterVerdict: project.smallCapHunterVerdict || null,
    proofOfAlphaExecutionTwinVerdict: project.proofOfAlphaExecutionTwinVerdict || null,
    opportunityThesis: compactText(project.opportunityThesis || project.explainabilitySummary || "", 900),
    supabaseMemory: project.supabaseMemory || null,
  };
}

function receiptRowsFor(receipts = []) {
  return (Array.isArray(receipts) ? receipts : []).map((receipt) => ({
    receipt_id: compactIndexedText(receipt.receiptId || receipt.receiptHash || `${receipt.runId}:${receipt.projectKey}`, 220),
    run_id: compactIndexedText(receipt.runId, 180),
    project_key: compactIndexedText(receipt.projectKey, 220),
    decision_at: receipt.decisionAt,
    name: compactIndexedText(receipt.identity?.name || "Unknown", 240),
    symbol: compactIndexedText(receipt.identity?.symbol || "UNKNOWN", 80),
    chain: nullableIndexedText(receipt.identity?.chain, 80),
    contract_address: nullableIndexedText(receipt.identity?.contractAddress, 160),
    pool_address: nullableIndexedText(receipt.identity?.poolAddress, 160),
    rank: num(receipt.decision?.rank),
    final_state: nullableIndexedText(receipt.decision?.finalState, 80),
    final_qualified: Boolean(receipt.decision?.finalQualified),
    score: num(receipt.decision?.score),
    confidence: nullableIndexedText(receipt.decision?.confidence, 80),
    truth_status: compactIndexedText(receipt.truthStatus || "UNKNOWN", 80),
    effective_independent_evidence_count: num(receipt.evidenceLineage?.effectiveIndependentEvidenceCount),
    evidence_families_json: receipt.evidenceLineage?.groups || [],
    required_proof_json: receipt.requiredProof || {},
    execution_snapshot_json: receipt.executionSnapshot || {},
    market_snapshot_json: receipt.marketSnapshot || {},
    receipt_json: {
      ...receipt,
      evidenceLineage: {
        ...(receipt.evidenceLineage || {}),
        groups: (receipt.evidenceLineage?.groups || []).slice(0, 20),
      },
    },
  }));
}

export function resolveSupabaseConfig(env = process.env) {
  const url = firstText(env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  const keyConfig = resolveSupabaseKey(env);
  const enabled = boolEnv(env.SUPABASE_ENABLED, Boolean(url && keyConfig.key));

  return {
    enabled,
    configured: Boolean(url && keyConfig.key),
    url,
    key: keyConfig.key,
    keyType: keyConfig.keyType,
    serverWriteCapable: keyConfig.serverWriteCapable,
    fallbackServerKeys: keyConfig.fallbackServerKeys,
    jwksUrl: text(env.SUPABASE_JWKS_URL),
    restUrl: url ? `${url}/rest/v1` : "",
    required: boolEnv(env.SUPABASE_SYNC_REQUIRED, false),
    syncReports: boolEnv(env.SUPABASE_SYNC_REPORTS, true),
    syncAlphaReceipts: boolEnv(env.SUPABASE_SYNC_ALPHA_RECEIPTS, true),
    timeoutMs: Math.max(1000, Number(env.SUPABASE_TIMEOUT_MS || 15000)),
    projectLimit: Math.max(1, Number(env.SUPABASE_SYNC_PROJECT_LIMIT || DEFAULT_PROJECT_LIMIT)),
    tables: {
      runs: safeTableName(env.SUPABASE_SCAN_RUNS_TABLE, DEFAULT_SCAN_RUNS_TABLE),
      projects: safeTableName(env.SUPABASE_SCAN_PROJECTS_TABLE, DEFAULT_SCAN_PROJECTS_TABLE),
      reports: safeTableName(env.SUPABASE_SCAN_REPORTS_TABLE, DEFAULT_SCAN_REPORTS_TABLE),
      alphaReceipts: safeTableName(env.SUPABASE_ALPHA_RECEIPTS_TABLE, DEFAULT_ALPHA_RECEIPTS_TABLE),
    },
  };
}

export function summarizeSupabaseConfig(env = process.env) {
  const config = resolveSupabaseConfig(env);
  return {
    enabled: config.enabled,
    configured: config.configured,
    hasUrl: Boolean(config.url),
    hasKey: Boolean(config.key),
    keyType: config.keyType,
    serverWriteCapable: config.serverWriteCapable,
    hasJwksUrl: Boolean(config.jwksUrl),
    required: config.required,
    syncReports: config.syncReports,
    syncAlphaReceipts: config.syncAlphaReceipts,
    projectLimit: config.projectLimit,
    tables: config.tables,
  };
}

export function buildSupabaseScanPayload(input = {}, options = {}) {
  const projects = Array.isArray(input.projects) ? input.projects : [];
  const summary = input.summary || {};
  const meta = input.meta || {};
  const reportPaths = input.reportPaths || {};
  const completedAt = safeIso(meta.completedAt || new Date().toISOString());
  const startedAt = safeIso(meta.startedAt, completedAt);
  const runId = text(meta.runId || `scan_${Date.parse(completedAt) || Date.now()}`);
  const projectLimit = Math.max(1, Number(options.projectLimit || DEFAULT_PROJECT_LIMIT));
  const sorted = [...projects].sort((a, b) => scoreOf(b) - scoreOf(a));
  const syncedProjects = sorted.slice(0, projectLimit);
  const qualified = projects.filter((project) => project.finalSelectionQualified || project.finalSelectionState === "QUALIFIED");
  const blocked = projects.filter((project) =>
    ["BLOCKED", "IDENTITY_CONFLICT", "REJECTED"].includes(project.finalSelectionState || "")
  );
  const best = sorted[0] || {};

  const run = {
    run_id: compactIndexedText(runId, 180),
    started_at: startedAt,
    completed_at: completedAt,
    platform: meta.platform || "Crypto Launch Intelligence",
    status: meta.status || "COMPLETED",
    discovery_count: num(meta.discoveredProjects || meta.discovery?.dedupedCount || meta.discovery?.acceptedCount),
    scanned_count: projects.length,
    synced_project_count: syncedProjects.length,
    qualified_count: qualified.length,
    blocked_count: blocked.length,
    strong_watchlist_count: num(summary.strongWatchlistCount),
    best_project: nullableIndexedText(best.name, 240),
    best_symbol: nullableIndexedText(best.symbol, 80),
    best_chain: nullableIndexedText(best.chain, 80),
    best_score: scoreOf(best),
    market_regime: summary.marketRegime || null,
    scoring_model: meta.scoringMode || summary.scoringPrimaryModel || "legacy",
    summary_json: {
      ...summary,
      alerts: undefined,
    },
  };

  const projectRows = syncedProjects.map((project, index) => ({
    run_id: compactIndexedText(runId, 180),
    project_key: projectKeyFor(project),
    rank: index + 1,
    name: compactIndexedText(project.name || "Unknown", 240),
    symbol: compactIndexedText(project.symbol || "UNKNOWN", 80),
    chain: nullableIndexedText(project.chain, 80),
    score: scoreOf(project),
    tier: nullableIndexedText(project.pipelineTier || project.tier, 80),
    confidence: nullableIndexedText(project.pipelineConfidence || project.confidence, 80),
    final_state: nullableIndexedText(project.finalSelectionState, 80),
    final_qualified: Boolean(project.finalSelectionQualified || project.finalSelectionState === "QUALIFIED"),
    risk_score: clamp(project.riskScore ?? project.trapRiskScore ?? project.instantSafetyRiskScore),
    liquidity_usd: num(project.liquidityUsd ?? project.liquidity),
    volume_24h: num(project.volume24h ?? project.volume),
    market_cap_usd: num(project.circulatingMarketCapUsd ?? project.circulatingMarketCap ?? project.marketCap),
    source: nullableIndexedText(project.source, 120),
    payload_json: compactProjectPayload(project),
  }));
  const dedupedProjectRows = dedupeRows(projectRows, (row) => `${row.run_id}:${row.project_key}`).map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
  run.synced_project_count = dedupedProjectRows.length;

  return {
    run,
    projects: dedupedProjectRows,
    reports: dedupeRows(reportRowsFor(runId, reportPaths), (row) => `${row.run_id}:${row.report_name}`),
    alphaReceipts: dedupeRows(receiptRowsFor(input.alphaTruth?.receipts || []), (row) => row.receipt_id),
  };
}

async function postRows(config = {}, table = "", rows = [], options = {}) {
  if (!rows.length) return { table, rows: 0, chunks: 0 };

  const fetchImpl = options.fetchImpl || fetch;
  const chunkSize = Math.max(1, Number(options.chunkSize || 500));
  const chunks = [];

  for (let index = 0; index < rows.length; index += chunkSize) {
    chunks.push(rows.slice(index, index + chunkSize));
  }

  for (const chunk of chunks) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    const onConflict = options.onConflict ? `?on_conflict=${encodeURIComponent(options.onConflict)}` : "";
    const response = await Promise.resolve(
      fetchImpl(`${config.restUrl}/${encodeURIComponent(table)}${onConflict}`, {
        method: "POST",
        headers: buildSupabaseRestHeaders(config, {
          "content-type": "application/json",
          prefer: "resolution=merge-duplicates,return=minimal",
        }),
        body: JSON.stringify(chunk),
        signal: controller.signal,
      })
    ).finally(() => clearTimeout(timer));

    if (!response.ok) {
      const detail = typeof response.text === "function" ? await response.text() : "";
      throw new Error(`Supabase ${table} sync failed: ${response.status} ${compactText(detail, 500)}`);
    }
  }

  return {
    table,
    rows: rows.length,
    chunks: chunks.length,
  };
}

export async function syncScanToSupabase(input = {}, options = {}) {
  const env = options.env || process.env;
  const config = options.config || resolveSupabaseConfig(env);

  if (!config.enabled) {
    return {
      enabled: false,
      status: "SKIPPED",
      reason: "SUPABASE_ENABLED is false and Supabase credentials are not configured.",
    };
  }

  if (!config.configured) {
    const result = {
      enabled: true,
      status: "FAILED",
      reason: "SUPABASE_URL and a Supabase key are required.",
    };
    if (config.required) throw new Error(result.reason);
    return result;
  }

  if (!config.serverWriteCapable) {
    const result = {
      enabled: true,
      status: "FAILED",
      reason:
        "Supabase scan sync requires SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY because RLS is enabled for scanner tables.",
      keyType: config.keyType,
      tables: config.tables,
    };
    if (config.required) throw new Error(result.reason);
    return result;
  }

  try {
    const payload = buildSupabaseScanPayload(input, {
      projectLimit: config.projectLimit,
    });
    const synced = [];

    synced.push(
      await postRows(config, config.tables.runs, [payload.run], {
        ...options,
        onConflict: "run_id",
      })
    );
    synced.push(
      await postRows(config, config.tables.projects, payload.projects, {
        ...options,
        onConflict: "run_id,project_key",
      })
    );

    if (config.syncReports) {
      synced.push(
        await postRows(config, config.tables.reports, payload.reports, {
          ...options,
          onConflict: "run_id,report_name",
        })
      );
    }

    if (config.syncAlphaReceipts) {
      synced.push(
        await postRows(config, config.tables.alphaReceipts, payload.alphaReceipts, {
          ...options,
          onConflict: "receipt_id",
        })
      );
    }

    return {
      enabled: true,
      status: "OK",
      runId: payload.run.run_id,
      syncedProjects: payload.projects.length,
      syncedReports: config.syncReports ? payload.reports.length : 0,
      syncedAlphaReceipts: config.syncAlphaReceipts ? payload.alphaReceipts.length : 0,
      tables: config.tables,
      operations: synced,
    };
  } catch (error) {
    if (config.required) throw error;
    return {
      enabled: true,
      status: "FAILED",
      reason: error.message,
      tables: config.tables,
    };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizeSupabaseConfig(), null, 2));
}
