import test from "node:test";
import assert from "node:assert/strict";

import {
  applySupabaseMemory,
  collectSupabaseMemory,
  scanMemoryRecordsFromSupabase,
  summarizeSupabaseMemoryImpact,
} from "../src/storage/supabaseMemory.js";
import { runSupabaseHealthCheck } from "../src/storage/supabaseHealthCheck.js";
import { loadScanMemory, primeScanMemory } from "../src/learning/scanMemoryStore.js";

const ENV = {
  SUPABASE_ENABLED: "true",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "server-secret",
};

function jsonResponse(body) {
  return {
    ok: true,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function errorResponse(status, body) {
  return {
    ok: false,
    status,
    json: async () => body,
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  };
}

function createFetchStub(calls = []) {
  return async (url, init = {}) => {
    const parsed = new URL(String(url));
    calls.push({
      method: init.method || "GET",
      path: parsed.pathname,
      headers: init.headers,
      body: init.body ? JSON.parse(init.body) : null,
    });

    if ((init.method || "GET") === "POST") return jsonResponse({});

    if (parsed.pathname.endsWith("/scan_runs")) {
      return jsonResponse([
        {
          run_id: "scan_old",
          completed_at: "2026-07-19T00:00:00.000Z",
          status: "COMPLETED",
          scanned_count: 2,
          qualified_count: 1,
          blocked_count: 1,
          best_symbol: "ALPHA",
          best_score: 70,
        },
      ]);
    }

    if (parsed.pathname.endsWith("/scan_projects")) {
      return jsonResponse([
        {
          run_id: "scan_old",
          project_key: "base:alpha",
          rank: 3,
          name: "Alpha",
          symbol: "ALPHA",
          chain: "base",
          score: 70,
          confidence: "Medium",
          final_state: "RESEARCH_ONLY",
          final_qualified: false,
          created_at: "2026-07-19T00:00:00.000Z",
        },
        {
          run_id: "scan_health",
          project_key: "system:supabase-health-check",
          symbol: "SUPABASE_HEALTH",
          final_state: "HEALTH_CHECK",
          source: "supabase-health-check",
          score: 0,
          created_at: "2026-07-19T00:01:00.000Z",
        },
      ]);
    }

    if (parsed.pathname.endsWith("/alpha_truth_receipts")) {
      return jsonResponse([
        {
          receipt_id: "receipt_old",
          run_id: "scan_old",
          project_key: "base:alpha",
          decision_at: "2026-07-19T00:00:00.000Z",
          symbol: "ALPHA",
          chain: "base",
          truth_status: "RESEARCH_ONLY",
          score: 70,
        },
      ]);
    }

    return jsonResponse([]);
  };
}

test("Supabase remote memory retains legacy rows diagnostically without attributing symbol-only history", async () => {
  const calls = [];
  const memory = await collectSupabaseMemory({
    env: ENV,
    fetchImpl: createFetchStub(calls),
  });
  const projects = applySupabaseMemory(
    [
      { name: "Alpha", symbol: "ALPHA", chain: "base", pipelineScore: 82 },
      { name: "New", symbol: "NEW", chain: "base", pipelineScore: 40 },
    ],
    memory
  );
  const summary = summarizeSupabaseMemoryImpact(projects, memory);

  assert.equal(memory.status, "OK");
  assert.equal(memory.counts.rememberedProjects, 1);
  assert.equal(memory.byProject["base:alpha"].previousRunCount, 1);
  assert.equal(memory.byProject["base:alpha"].latestScore, 70);
  assert.equal(projects[0].supabaseMemory.status, "NEW_OR_NOT_SEEN");
  assert.equal(projects[0].supabaseMemory.previousRunCount, undefined);
  assert.equal(projects[0].supabaseMemory.scoreDeltaFromLatest, undefined);
  assert.equal(projects[1].supabaseMemory.status, "NEW_OR_NOT_SEEN");
  assert.equal(summary.matchedProjects, 0);
  assert.equal(calls[0].headers.authorization, "Bearer server-secret");
});

test("Supabase memory selects only consumed columns without changing output or exact identity", async () => {
  const address = `0x${"aB".repeat(20)}`;
  const baseKey = `base:${address.toLowerCase()}`;
  const mint = "So11111111111111111111111111111111111111112";
  const solanaKey = `solana:${mint}`;
  const project = {
    run_id: "scan_latest", project_key: `base:token:${address}`, rank: 3,
    name: "Alpha", symbol: "ALPHA", chain: "base", score: 70, confidence: "Medium",
    final_state: "RESEARCH_ONLY", final_qualified: false, source: "mock",
    created_at: "2026-07-19T00:00:00.000Z", tier: "unused", risk_score: 90,
    liquidity_usd: 123, volume_24h: 456, market_cap_usd: 789,
  };
  const receipt = {
    receipt_id: "receipt_latest", run_id: "scan_latest", project_key: baseKey,
    decision_at: project.created_at, symbol: "ALPHA", chain: "base", rank: 3,
    final_state: "RESEARCH_ONLY", final_qualified: false, score: 70, confidence: "Medium",
    truth_status: "RESEARCH_ONLY", effective_independent_evidence_count: 4,
  };
  const rows = {
    scan_runs: [{
      run_id: "scan_latest", completed_at: project.created_at, status: "COMPLETED",
      discovery_count: 20, scanned_count: 2, qualified_count: 0, blocked_count: 1,
      best_symbol: "ALPHA", best_score: 70, market_regime: "NEUTRAL", scoring_model: "mock",
    }],
    scan_projects: [
      project,
      { ...project, run_id: "scan_older", score: 90, rank: 1, final_qualified: true,
        final_state: "QUALIFIED", created_at: "2026-07-18T00:00:00.000Z" },
      { ...project, project_key: `solana:token:${mint}`, chain: "solana", final_state: "BLOCKED" },
      { ...project, source: "supabase-health-check" },
      { ...project, final_state: "HEALTH_CHECK" },
      { ...project, project_key: "system:supabase-health-check" },
    ],
    alpha_truth_receipts: [
      receipt,
      { ...receipt, project_key: solanaKey, truth_status: "BLOCKED" },
      { ...receipt, final_state: "HEALTH_CHECK", truth_status: "SHOULD_BE_IGNORED" },
      { ...receipt, project_key: "system:supabase-health-check" },
      { ...receipt, project_key: "base:not-remembered" },
    ],
  };
  const projections = {
    scan_runs: {
      select: "run_id,completed_at,status,discovery_count,scanned_count,qualified_count,blocked_count,best_symbol,best_score,market_regime,scoring_model",
      order: "completed_at.desc", limit: "2",
    },
    scan_projects: {
      select: "run_id,project_key,rank,name,symbol,chain,score,confidence,final_state,final_qualified,source,created_at",
      order: "created_at.desc", limit: "6",
    },
    alpha_truth_receipts: {
      select: "project_key,final_state,truth_status",
      order: "decision_at.desc", limit: "5",
    },
  };
  const calls = [];
  const collect = (projectResponse) => collectSupabaseMemory({
    env: ENV, runLimit: 2, projectLimit: 6, receiptLimit: 5,
    fetchImpl: async (url) => {
      const parsed = new URL(String(url));
      const table = parsed.pathname.split("/").at(-1);
      const params = Object.fromEntries(parsed.searchParams);
      if (!projectResponse) return jsonResponse(rows[table]);
      calls.push({ table, params });
      const columns = params.select.split(",");
      return jsonResponse(rows[table].map((row) => Object.fromEntries(
        columns.filter((column) => Object.hasOwn(row, column)).map((column) => [column, row[column]])
      )));
    },
  });
  const original = await collect(false);
  const minimal = await collect(true);

  assert.deepEqual(calls.map((call) => call.table).sort(), Object.keys(projections).sort());
  for (const { table, params } of calls) assert.deepEqual(params, projections[table]);
  assert.deepEqual({ ...minimal, generatedAt: null }, { ...original, generatedAt: null });
  assert.equal(minimal.status, "OK");
  assert.deepEqual(Object.keys(minimal.byProject), [baseKey, solanaKey]);
  assert.equal(minimal.byProject[baseKey].previousRunCount, 2);
  assert.equal(minimal.byProject[baseKey].qualifiedCount, 1);
  assert.equal(minimal.byProject[baseKey].bestHistoricalScore, 90);
  assert.equal(minimal.byProject[baseKey].latestScore, 70);
  assert.equal(minimal.byProject[baseKey].receiptCount, 1);
  assert.equal(minimal.byProject[baseKey].lastTruthStatus, "RESEARCH_ONLY");
  assert.equal(minimal.byProject[solanaKey].blockedCount, 1);
  assert.equal(minimal.byProject[solanaKey].receiptCount, 1);
  assert.equal(minimal.byProject[solanaKey].lastTruthStatus, "BLOCKED");
  const projects = [
    { address, chain: "base", symbol: "ALPHA", pipelineScore: 82 },
    { address: mint, chain: "solana", symbol: "ALPHA", pipelineScore: 60 },
    { chain: "ethereum", symbol: "NEW" },
  ];
  const applied = applySupabaseMemory(projects, minimal);
  assert.deepEqual(applied, applySupabaseMemory(projects, original));
  assert.deepEqual(applied.map((row) => row.supabaseMemory.projectKey), [baseKey, solanaKey, undefined]);
  assert.deepEqual(scanMemoryRecordsFromSupabase(minimal), scanMemoryRecordsFromSupabase(original));
  assert.deepEqual(summarizeSupabaseMemoryImpact(applied, minimal), summarizeSupabaseMemoryImpact(applied, original));
});

for (const restriction of [
  { label: "402 restriction", status: 402, detail: "Service for this project is restricted." },
  { label: "402 payment", status: 402, detail: { code: "overdue_payment", message: "Payment required" } },
  { label: "explicit quota on 403", status: 403, detail: { message: "exceed_egress_quota" } },
  { label: "explicit quota before transient/clock-skew retry", status: 503,
    detail: { message: "EXCEED_EGRESS_QUOTA; clock skew" } },
]) {
  for (const required of [false, true]) {
    test(`Supabase memory stops credential attempts for ${restriction.label}, required=${required}`, async () => {
      const calls = [];
      const sleeps = [];
      const memory = await collectSupabaseMemory({
        env: { ...ENV, SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fallback-test-key",
          SUPABASE_SYNC_REQUIRED: String(required) },
        maxRetries: 2,
        sleepImpl: async (delay) => sleeps.push(delay),
        fetchImpl: async (url, init) => {
          calls.push({ path: new URL(String(url)).pathname, key: init.headers.apikey });
          return errorResponse(restriction.status, restriction.detail);
        },
      });

      assert.equal(calls.length, 3);
      assert.equal(new Set(calls.map((call) => call.path)).size, 3);
      assert.ok(calls.every((call) => call.key === ENV.SUPABASE_SECRET_KEY));
      assert.deepEqual(sleeps, []);
      assert.equal(memory.status, "FAILED");
      assert.equal(memory.counts.failedTables, 3);
      for (const health of Object.values(memory.tableHealth)) {
        assert.equal(health.status, "FAILED");
        assert.ok(health.reason.includes(`read failed: ${restriction.status}`));
        assert.ok(health.reason.includes(typeof restriction.detail === "string"
          ? restriction.detail : JSON.stringify(restriction.detail)));
        assert.ok(memory.reason.includes(health.reason));
      }
      assert.deepEqual(scanMemoryRecordsFromSupabase(memory), []);
      assert.equal(applySupabaseMemory([{ symbol: "ALPHA" }], memory)[0].supabaseMemory.status, "UNAVAILABLE");
      assert.equal(JSON.stringify(memory).includes("fallback-test-key"), false);
    });
  }
}

for (const failure of [429, 503, "network"]) {
  test(`Supabase memory preserves primary-key transient retry for ${failure}`, async () => {
    const calls = new Map();
    const baseFetch = createFetchStub([]);
    const memory = await collectSupabaseMemory({
      env: { ...ENV, SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fallback-test-key" },
      maxRetries: 1, retryDelayMs: 0,
      fetchImpl: async (url, init) => {
        const path = new URL(String(url)).pathname;
        const keys = calls.get(path) || [];
        keys.push(init.headers.apikey);
        calls.set(path, keys);
        if (keys.length === 1) {
          if (failure === "network") throw new Error("temporary network failure");
          return errorResponse(failure, "temporary service failure");
        }
        return baseFetch(url, init);
      },
    });

    assert.equal(memory.status, "OK");
    assert.equal(calls.size, 3);
    for (const keys of calls.values()) assert.deepEqual(keys, [ENV.SUPABASE_SECRET_KEY, ENV.SUPABASE_SECRET_KEY]);
  });
}

test("Supabase memory preserves auth fallback after exhausted clock-skew retries", async () => {
  const calls = new Map();
  const baseFetch = createFetchStub([]);
  const fallback = "sb_secret_fallback-test-key";
  const memory = await collectSupabaseMemory({
    env: { ...ENV, SUPABASE_SERVICE_ROLE_KEY: fallback },
    maxRetries: 1, retryDelayMs: 0,
    fetchImpl: async (url, init) => {
      const path = new URL(String(url)).pathname;
      const keys = calls.get(path) || [];
      keys.push(init.headers.apikey);
      calls.set(path, keys);
      return init.headers.apikey === fallback ? baseFetch(url, init)
        : errorResponse(401, { code: "PGRST303", message: "JWT issued in the future" });
    },
  });

  assert.equal(memory.status, "OK");
  assert.equal(calls.size, 3);
  for (const keys of calls.values()) assert.deepEqual(keys, [ENV.SUPABASE_SECRET_KEY, ENV.SUPABASE_SECRET_KEY, fallback]);
});

test("Supabase memory keeps receipt restrictions visible while project memory remains usable", async () => {
  const calls = [];
  const baseFetch = createFetchStub([]);
  const memory = await collectSupabaseMemory({
    env: { ...ENV, SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fallback-test-key" },
    maxRetries: 2, retryDelayMs: 0,
    fetchImpl: async (url, init) => {
      const path = new URL(String(url)).pathname;
      calls.push(path);
      return path.endsWith("/alpha_truth_receipts")
        ? errorResponse(402, { code: "overdue_payment" }) : baseFetch(url, init);
    },
  });

  assert.equal(calls.length, 3);
  assert.equal(memory.status, "DEGRADED");
  assert.equal(memory.tableHealth.projects.status, "OK");
  assert.equal(memory.tableHealth.alphaReceipts.status, "FAILED");
  assert.match(memory.reason, /overdue_payment/);
  assert.equal(scanMemoryRecordsFromSupabase(memory).length, 1);
});

test("Supabase memory stops quota retries after a genuine auth fallback", async () => {
  const calls = new Map();
  const fallback = "sb_secret_fallback-test-key";
  const memory = await collectSupabaseMemory({
    env: { ...ENV, SUPABASE_SERVICE_ROLE_KEY: fallback },
    maxRetries: 2, retryDelayMs: 0,
    fetchImpl: async (url, init) => {
      const path = new URL(String(url)).pathname;
      const keys = calls.get(path) || [];
      keys.push(init.headers.apikey);
      calls.set(path, keys);
      return init.headers.apikey === fallback
        ? errorResponse(503, { message: "exceed_egress_quota" })
        : errorResponse(401, "invalid legacy JWT");
    },
  });

  assert.equal(memory.status, "FAILED");
  assert.equal(calls.size, 3);
  for (const keys of calls.values()) assert.deepEqual(keys, [ENV.SUPABASE_SECRET_KEY, fallback]);
  assert.match(memory.reason, /exceed_egress_quota/);
  assert.doesNotMatch(memory.reason, /invalid legacy JWT/);
});

test("Supabase remote memory can prime runtime scan memory before learning engines run", async () => {
  const memory = await collectSupabaseMemory({
    env: ENV,
    fetchImpl: createFetchStub([]),
  });
  const records = scanMemoryRecordsFromSupabase(memory);
  const primed = primeScanMemory(records, { source: "test-supabase-memory", limit: 10 });
  const loaded = loadScanMemory();

  assert.equal(primed.primed, 1);
  assert.ok(loaded.some((record) => record.source === "supabase-remote-memory" && record.identityKey === "base:alpha"));

  primeScanMemory([], { source: "test-cleanup" });
});

test("modern Supabase secret keys use apikey without a fake bearer JWT", async () => {
  const calls = [];
  const memory = await collectSupabaseMemory({
    env: {
      ...ENV,
      SUPABASE_SECRET_KEY: "sb_secret_modern-test-key",
    },
    fetchImpl: createFetchStub(calls),
  });

  assert.equal(memory.status, "OK");
  assert.equal(calls[0].headers.apikey, "sb_secret_modern-test-key");
  assert.equal(calls[0].headers.authorization, undefined);
});

test("Supabase memory retries transient JWT clock skew and keeps recovered rows", async () => {
  const attempts = new Map();
  const baseFetch = createFetchStub([]);
  const memory = await collectSupabaseMemory({
    env: ENV,
    maxRetries: 1,
    retryDelayMs: 0,
    fetchImpl: async (url, init) => {
      const path = new URL(String(url)).pathname;
      attempts.set(path, (attempts.get(path) || 0) + 1);
      if (path.endsWith("/scan_projects") && attempts.get(path) === 1) {
        return errorResponse(401, { code: "PGRST303", message: "JWT issued at future" });
      }
      return baseFetch(url, init);
    },
  });

  assert.equal(memory.status, "OK");
  assert.equal(memory.counts.rememberedProjects, 1);
  assert.equal(attempts.get("/rest/v1/scan_projects"), 2);
});

test("optional receipt-table failure leaves run and project memory usable", async () => {
  const baseFetch = createFetchStub([]);
  const memory = await collectSupabaseMemory({
    env: ENV,
    maxRetries: 0,
    fetchImpl: async (url, init) => {
      if (new URL(String(url)).pathname.endsWith("/alpha_truth_receipts")) {
        return errorResponse(503, "temporary receipt table outage");
      }
      return baseFetch(url, init);
    },
  });
  const records = scanMemoryRecordsFromSupabase(memory);

  assert.equal(memory.status, "DEGRADED");
  assert.equal(memory.tableHealth.runs.status, "OK");
  assert.equal(memory.tableHealth.projects.status, "OK");
  assert.equal(memory.tableHealth.alphaReceipts.status, "FAILED");
  assert.equal(memory.counts.rememberedProjects, 1);
  assert.equal(records.length, 1);
});

test("Supabase memory falls back from a rejected legacy secret to a separate server key", async () => {
  const seenKeys = [];
  const baseFetch = createFetchStub([]);
  const memory = await collectSupabaseMemory({
    env: {
      ...ENV,
      SUPABASE_SECRET_KEY: "legacy-rejected-secret",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_fallback-server-key",
    },
    maxRetries: 0,
    fetchImpl: async (url, init) => {
      seenKeys.push(init.headers.apikey);
      if (init.headers.apikey === "legacy-rejected-secret") {
        return errorResponse(401, "invalid legacy JWT");
      }
      return baseFetch(url, init);
    },
  });

  assert.equal(memory.status, "OK");
  assert.ok(seenKeys.includes("legacy-rejected-secret"));
  assert.ok(seenKeys.includes("sb_secret_fallback-server-key"));
  assert.equal(JSON.stringify(memory).includes("fallback-server-key"), false);
});

test("Supabase health check can verify memory reads and write path without exposing secrets", async () => {
  const calls = [];
  const report = await runSupabaseHealthCheck({
    env: ENV,
    writeCheck: true,
    fetchImpl: createFetchStub(calls),
  });
  const serialized = JSON.stringify(report);

  assert.equal(report.status, "OK");
  assert.equal(report.memory.status, "OK");
  assert.equal(report.writeCheck.status, "OK");
  assert.ok(calls.some((call) => call.method === "POST" && call.path.endsWith("/scan_runs")));
  assert.ok(calls.some((call) => call.method === "POST" && call.path.endsWith("/scan_projects")));
  assert.ok(calls.some((call) => call.method === "POST" && call.path.endsWith("/alpha_truth_receipts")));
  assert.equal(serialized.includes("server-secret"), false);
});
