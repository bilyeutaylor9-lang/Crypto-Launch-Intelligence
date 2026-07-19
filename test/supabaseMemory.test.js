import test from "node:test";
import assert from "node:assert/strict";

import {
  applySupabaseMemory,
  collectSupabaseMemory,
  summarizeSupabaseMemoryImpact,
} from "../src/storage/supabaseMemory.js";
import { runSupabaseHealthCheck } from "../src/storage/supabaseHealthCheck.js";

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
