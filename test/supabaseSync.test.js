import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSupabaseRestHeaders,
  buildSupabaseScanPayload,
  resolveSupabaseConfig,
  summarizeSupabaseConfig,
  syncScanToSupabase,
} from "../src/storage/supabaseSync.js";
import { createScannerSupabaseClient } from "../src/storage/supabaseClient.js";

const ENV = {
  SUPABASE_ENABLED: "true",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-secret",
  SUPABASE_SYNC_PROJECT_LIMIT: "2",
};

test("Supabase config stays disabled unless credentials or explicit enablement are present", () => {
  const config = resolveSupabaseConfig({});

  assert.equal(config.enabled, false);
  assert.equal(config.configured, false);
});

test("Supabase config summary never exposes the API key", () => {
  const summary = summarizeSupabaseConfig(ENV);
  const serialized = JSON.stringify(summary);

  assert.equal(summary.enabled, true);
  assert.equal(summary.configured, true);
  assert.equal(summary.hasKey, true);
  assert.equal(summary.serverWriteCapable, true);
  assert.equal(serialized.includes("service-secret"), false);
});

test("Supabase config supports new Supabase URL, secret, publishable, and JWKS names", () => {
  const config = resolveSupabaseConfig({
    SUPABASE_URL: "https://example.supabase.co/",
    SUPABASE_PUBLISHABLE_KEY: "public-key",
    SUPABASE_SECRET_KEY: "server-secret",
    SUPABASE_JWKS_URL: "https://example.supabase.co/auth/v1/.well-known/jwks.json",
  });

  assert.equal(config.enabled, true);
  assert.equal(config.configured, true);
  assert.equal(config.url, "https://example.supabase.co");
  assert.equal(config.keyType, "secret");
  assert.equal(config.key, "server-secret");
  assert.equal(config.serverWriteCapable, true);
  assert.equal(config.jwksUrl.endsWith("/.well-known/jwks.json"), true);
  assert.equal(JSON.stringify(summarizeSupabaseConfig({ ...ENV, SUPABASE_SECRET_KEY: "server-secret" })).includes("server-secret"), false);
});

test("Supabase config retains a separate server-key fallback without exposing it in summaries", () => {
  const env = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_primary",
    SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role-fallback",
  };
  const config = resolveSupabaseConfig(env);
  const summary = summarizeSupabaseConfig(env);

  assert.equal(config.key, "sb_secret_primary");
  assert.equal(config.fallbackServerKeys.length, 1);
  assert.equal(config.fallbackServerKeys[0].keyType, "service_role");
  assert.equal(JSON.stringify(summary).includes("legacy-service-role-fallback"), false);
});

test("REST headers distinguish modern API keys from legacy JWT keys", () => {
  const modern = buildSupabaseRestHeaders({ key: "sb_secret_modern-test-key" });
  const legacy = buildSupabaseRestHeaders({ key: "legacy-service-role-jwt" });

  assert.equal(modern.apikey, "sb_secret_modern-test-key");
  assert.equal(modern.authorization, undefined);
  assert.equal(legacy.authorization, "Bearer legacy-service-role-jwt");
});

test("Supabase publishable-only config is read-only and cannot sync scanner writes", async () => {
  const env = {
    SUPABASE_ENABLED: "true",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "public-key",
  };
  const config = resolveSupabaseConfig(env);
  const sync = await syncScanToSupabase({ projects: [] }, { env });
  const client = createScannerSupabaseClient({ env });

  assert.equal(config.configured, true);
  assert.equal(config.keyType, "publishable");
  assert.equal(config.serverWriteCapable, false);
  assert.equal(sync.status, "FAILED");
  assert.match(sync.reason, /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  assert.equal(client.status, "PUBLIC_READ_ONLY");
});

test("Supabase payload builds a run, ranked project rows, and report rows", () => {
  const payload = buildSupabaseScanPayload(
    {
      projects: [
        {
          name: "Alpha",
          symbol: "ALPHA",
          chain: "base",
          pipelineScore: 72,
          liquidityUsd: 12345,
          finalSelectionState: "RESEARCH_ONLY",
          confidence: "Medium",
        },
        {
          name: "Blocked",
          symbol: "BAD",
          chain: "ethereum",
          pipelineScore: 12,
          finalSelectionState: "BLOCKED",
          finalBlockingReasons: ["identity conflict"],
        },
      ],
      summary: { marketRegime: "Risk-Off", strongWatchlistCount: 1 },
      meta: {
        runId: "scan_test",
        startedAt: "2026-07-19T00:00:00.000Z",
        completedAt: "2026-07-19T00:01:00.000Z",
        discoveredProjects: 100,
      },
      reportPaths: {
        jsonPath: "/tmp/report.json",
        htmlPath: "/tmp/report.html",
      },
      alphaTruth: {
        receipts: [
          {
            receiptId: "receipt_1",
            runId: "scan_test",
            projectKey: "base:alpha",
            decisionAt: "2026-07-19T00:01:00.000Z",
            identity: { name: "Alpha", symbol: "ALPHA", chain: "base" },
            decision: { rank: 1, finalState: "RESEARCH_ONLY", score: 72, confidence: "Medium" },
            truthStatus: "RESEARCH_ONLY",
            evidenceLineage: { effectiveIndependentEvidenceCount: 2, groups: [] },
            requiredProof: {},
            executionSnapshot: {},
            marketSnapshot: {},
          },
        ],
      },
    },
    { projectLimit: 1 }
  );

  assert.equal(payload.run.run_id, "scan_test");
  assert.equal(payload.run.discovery_count, 100);
  assert.equal(payload.run.scanned_count, 2);
  assert.equal(payload.run.blocked_count, 1);
  assert.equal(payload.projects.length, 1);
  assert.equal(payload.projects[0].symbol, "ALPHA");
  assert.equal(payload.projects[0].rank, 1);
  assert.equal(payload.reports.length, 2);
  assert.equal(payload.alphaReceipts.length, 1);
  assert.equal(payload.alphaReceipts[0].receipt_id, "receipt_1");
});

test("Supabase sync posts scan rows through PostgREST with conflict keys", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({
      url,
      headers: init.headers,
      body: JSON.parse(init.body),
    });
    return {
      ok: true,
      text: async () => "",
    };
  };

  const result = await syncScanToSupabase(
    {
      projects: [
        { name: "Alpha", symbol: "ALPHA", chain: "base", pipelineScore: 72 },
        { name: "Beta", symbol: "BETA", chain: "ethereum", pipelineScore: 65 },
        { name: "Gamma", symbol: "GAMMA", chain: "arbitrum", pipelineScore: 55 },
      ],
      summary: { marketRegime: "Risk-On" },
      meta: {
        runId: "scan_sync_test",
        startedAt: "2026-07-19T00:00:00.000Z",
        completedAt: "2026-07-19T00:01:00.000Z",
      },
      reportPaths: { jsonPath: "/tmp/report.json" },
      alphaTruth: {
        receipts: [
          {
            receiptId: "receipt_sync_1",
            runId: "scan_sync_test",
            projectKey: "base:alpha",
            decisionAt: "2026-07-19T00:01:00.000Z",
            identity: { name: "Alpha", symbol: "ALPHA", chain: "base" },
            decision: { rank: 1, finalState: "RESEARCH_ONLY", score: 72 },
            truthStatus: "RESEARCH_ONLY",
            evidenceLineage: { effectiveIndependentEvidenceCount: 2, groups: [] },
            requiredProof: {},
            executionSnapshot: {},
            marketSnapshot: {},
          },
        ],
      },
    },
    { env: ENV, fetchImpl }
  );

  assert.equal(result.status, "OK");
  assert.equal(result.syncedProjects, 2);
  assert.equal(result.syncedReports, 1);
  assert.equal(result.syncedAlphaReceipts, 1);
  assert.equal(JSON.stringify(result).includes("service-secret"), false);
  assert.equal(calls.length, 4);
  assert.ok(calls[0].url.endsWith("/scan_runs?on_conflict=run_id"));
  assert.ok(calls[1].url.endsWith("/scan_projects?on_conflict=run_id%2Cproject_key"));
  assert.ok(calls[2].url.endsWith("/scan_reports?on_conflict=run_id%2Creport_name"));
  assert.ok(calls[3].url.endsWith("/alpha_truth_receipts?on_conflict=receipt_id"));
  assert.equal(calls[0].headers.authorization, "Bearer service-secret");
  assert.equal(calls[1].body.length, 2);
});

test("Supabase sync compacts oversized indexed project fields before upload", async () => {
  const hugeName = Array.from({ length: 800 }, (_, index) => `Token${index}`).join(" ");
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({
      url,
      body: JSON.parse(init.body),
    });
    return {
      ok: true,
      text: async () => "",
    };
  };

  const result = await syncScanToSupabase(
    {
      projects: [
        {
          name: hugeName,
          symbol: hugeName,
          chain: "base",
          pipelineScore: 88,
        },
        {
          name: hugeName,
          symbol: hugeName,
          chain: "base",
          pipelineScore: 72,
        },
      ],
      meta: {
        runId: "scan_oversized",
        startedAt: "2026-07-19T00:00:00.000Z",
        completedAt: "2026-07-19T00:01:00.000Z",
      },
      alphaTruth: {
        receipts: [
          {
            receiptId: `receipt_${hugeName}`,
            runId: "scan_oversized",
            projectKey: `base:${hugeName}`,
            decisionAt: "2026-07-19T00:01:00.000Z",
            identity: { name: hugeName, symbol: hugeName, chain: "base" },
            decision: { rank: 1, finalState: "RESEARCH_ONLY", score: 88 },
            truthStatus: "RESEARCH_ONLY",
            evidenceLineage: { effectiveIndependentEvidenceCount: 1, groups: [] },
            requiredProof: {},
            executionSnapshot: {},
            marketSnapshot: {},
          },
        ],
      },
    },
    { env: ENV, fetchImpl }
  );
  const projectRows = calls.find((call) => call.url.includes("/scan_projects"))?.body || [];
  const receiptRows = calls.find((call) => call.url.includes("/alpha_truth_receipts"))?.body || [];

  assert.equal(result.status, "OK");
  assert.equal(result.syncedProjects, 1);
  assert.equal(projectRows.length, 1);
  assert.ok(projectRows[0].project_key.length <= 220);
  assert.ok(projectRows[0].name.length <= 240);
  assert.ok(projectRows[0].symbol.length <= 80);
  assert.ok(receiptRows[0].receipt_id.length <= 220);
  assert.ok(receiptRows[0].project_key.length <= 220);
  assert.ok(receiptRows[0].symbol.length <= 80);
});
