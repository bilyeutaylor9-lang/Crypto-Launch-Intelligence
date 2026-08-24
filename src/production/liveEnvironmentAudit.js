import { writeAtomicJson } from "./atomicArtifactStore.js";

const DEFAULT_SECRET_NAMES = Object.freeze([
  "BASE_RPC_URL",
]);

function secretState(env, name) {
  const value = String(env[name] || "").trim();
  return {
    name,
    configured: Boolean(value),
    valueExposed: false,
  };
}

async function fetchJson(url, body, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return {
      ok: response.ok,
      statusCode: response.status,
      json,
      error: response.ok ? null : `HTTP_${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: null,
      json: null,
      error: error?.name === "AbortError" ? "TIMEOUT" : error?.message || "FETCH_FAILED",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function auditBaseRpc(env, options = {}) {
  const url = String(env.BASE_RPC_URL || "").trim();
  if (!url) {
    return { state: "NOT_CONFIGURED", configured: false };
  }
  const started = Date.now();
  const result = await fetchJson(
    url,
    { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
    Number(options.timeoutMs || 8000)
  );
  const blockHex = result.json?.result;
  const blockNumber =
    typeof blockHex === "string" && /^0x[0-9a-f]+$/i.test(blockHex)
      ? Number.parseInt(blockHex, 16)
      : null;
  return {
    state: result.ok && Number.isFinite(blockNumber) ? "HEALTHY" : "FAILED",
    configured: true,
    latencyMs: Date.now() - started,
    statusCode: result.statusCode,
    blockNumber,
    error: result.error,
  };
}

async function auditStorage(options = {}) {
  let adapter;
  try {
    const { createStorageAdapter } = await import("../db/storageAdapter.js");
    adapter = createStorageAdapter(options);
    const status = adapter.status();
    return {
      state: status?.sqlite?.status === "OK" ? "HEALTHY" : "FAILED",
      selectedBackend: status?.selectedBackend || null,
      supabaseConfigured: Boolean(status?.supabase?.configured || status?.supabase?.urlConfigured),
      sqliteStatus: status?.sqlite?.status || null,
    };
  } catch (error) {
    return {
      state: "FAILED",
      error: error?.message || "STORAGE_AUDIT_FAILED",
    };
  } finally {
    adapter?.close?.();
  }
}

export async function runLiveEnvironmentAudit(options = {}) {
  const env = options.env || process.env;
  const requiredSecrets = options.requiredSecrets || DEFAULT_SECRET_NAMES;
  const secrets = requiredSecrets.map((name) => secretState(env, name));
  const baseRpc = await auditBaseRpc(env, options);
  const storage = await auditStorage({ env });

  const blockers = [];
  for (const row of secrets) {
    if (!row.configured) blockers.push(`MISSING_SECRET:${row.name}`);
  }
  if (baseRpc.state !== "HEALTHY") blockers.push("BASE_RPC_UNHEALTHY");
  if (storage.state !== "HEALTHY") blockers.push("STORAGE_UNHEALTHY");

  const report = {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    state: blockers.length ? "ENVIRONMENT_NOT_READY" : "ENVIRONMENT_READY",
    secrets,
    baseRpc,
    storage,
    blockers,
    policy: {
      secretValuesNeverReported: true,
      automaticTrading: false,
    },
  };

  if (options.writeReport !== false) {
    writeAtomicJson(
      options.reportFile || "reports/live-environment-audit.json",
      report
    );
  }
  return report;
}

export const __liveEnvironmentAuditHooks = {
  auditBaseRpc,
  auditStorage,
  fetchJson,
  secretState,
};
