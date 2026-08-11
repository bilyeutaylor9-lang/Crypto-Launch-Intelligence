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

test("Supabase remote memory loads prior scan rows and ignores health-check rows", async () => {
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
  assert.equal(projects[0].supabaseMemory.status, "MATCHED");
  assert.equal(projects[0].supabaseMemory.previousRunCount, 1);
  assert.equal(projects[0].supabaseMemory.scoreDeltaFromLatest, 12);
  assert.equal(projects[1].supabaseMemory.status, "NEW_OR_NOT_SEEN");
  assert.equal(summary.matchedProjects, 1);
  assert.equal(calls[0].headers.authorization, "Bearer server-secret");
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
