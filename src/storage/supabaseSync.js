// src/storage/supabaseSync.js
import "../config/loadEnv.js";

const DEFAULT_SCAN_RUNS_TABLE = "scan_runs";
const DEFAULT_SCAN_PROJECTS_TABLE = "scan_projects";
const DEFAULT_SCAN_REPORTS_TABLE = "scan_reports";
const DEFAULT_ALPHA_RECEIPTS_TABLE = "alpha_truth_receipts";
const DEFAULT_PROJECT_LIMIT = 500;

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

function scoreOf(project = {}) {
  return num(project.pipelineScore ?? project.opportunityScore ?? project.score);
}

function reportRowsFor(runId = "", reportPaths = {}) {
  return Object.entries(reportPaths || {})
    .filter(([key, value]) => key.endsWith("Path") && typeof value === "string" && value)
    .map(([key, value]) => ({
      run_id: runId,
      report_name: key.replace(/Path$/, ""),
      report_path: value,
    }));
}

function compactProjectPayload(project = {}) {
  return {
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
  };
}

function receiptRowsFor(receipts = []) {
  return (Array.isArray(receipts) ? receipts : []).map((receipt) => ({
    receipt_id: receipt.receiptId || receipt.receiptHash,
    run_id: receipt.runId,
    project_key: receipt.projectKey,
    decision_at: receipt.decisionAt,
    name: receipt.identity?.name || "Unknown",
    symbol: receipt.identity?.symbol || "UNKNOWN",
    chain: receipt.identity?.chain || null,
    contract_address: receipt.identity?.contractAddress || null,
    pool_address: receipt.identity?.poolAddress || null,
    rank: num(receipt.decision?.rank),
    final_state: receipt.decision?.finalState || null,
    final_qualified: Boolean(receipt.decision?.finalQualified),
    score: num(receipt.decision?.score),
    confidence: receipt.decision?.confidence || null,
    truth_status: receipt.truthStatus || "UNKNOWN",
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
  const url = text(env.SUPABASE_URL).replace(/\/+$/, "");
  const key = text(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY);
  const enabled = boolEnv(env.SUPABASE_ENABLED, Boolean(url && key));

  return {
    enabled,
    configured: Boolean(url && key),
    url,
    key,
    keyType: env.SUPABASE_SERVICE_ROLE_KEY ? "service_role" : env.SUPABASE_ANON_KEY ? "anon" : "missing",
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
    run_id: runId,
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
    best_project: best.name || null,
    best_symbol: best.symbol || null,
    best_chain: best.chain || null,
    best_score: scoreOf(best),
    market_regime: summary.marketRegime || null,
    scoring_model: summary.scoringPrimaryModel || "legacy",
    summary_json: {
      ...summary,
      alerts: undefined,
    },
  };

  const projectRows = syncedProjects.map((project, index) => ({
    run_id: runId,
    project_key: projectKeyFor(project),
    rank: index + 1,
    name: project.name || "Unknown",
    symbol: project.symbol || "UNKNOWN",
    chain: project.chain || null,
    score: scoreOf(project),
    tier: project.pipelineTier || project.tier || null,
    confidence: project.pipelineConfidence || project.confidence || null,
    final_state: project.finalSelectionState || null,
    final_qualified: Boolean(project.finalSelectionQualified || project.finalSelectionState === "QUALIFIED"),
    risk_score: clamp(project.riskScore ?? project.trapRiskScore ?? project.instantSafetyRiskScore),
    liquidity_usd: num(project.liquidityUsd ?? project.liquidity),
    volume_24h: num(project.volume24h ?? project.volume),
    market_cap_usd: num(project.circulatingMarketCapUsd ?? project.circulatingMarketCap ?? project.marketCap),
    source: project.source || null,
    payload_json: compactProjectPayload(project),
  }));

  return {
    run,
    projects: projectRows,
    reports: reportRowsFor(runId, reportPaths),
    alphaReceipts: receiptRowsFor(input.alphaTruth?.receipts || []),
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
        headers: {
          apikey: config.key,
          authorization: `Bearer ${config.key}`,
          "content-type": "application/json",
          prefer: "resolution=merge-duplicates,return=minimal",
        },
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
      reason: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY are required.",
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
