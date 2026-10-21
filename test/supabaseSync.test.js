import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildSupabaseRestHeaders,
  buildSupabaseScanPayload,
  resolveSupabaseConfig,
  summarizeSupabaseConfig,
  syncScanToSupabase,
} from "../src/storage/supabaseSync.js";
import { createScannerSupabaseClient } from "../src/storage/supabaseClient.js";
import { collectSupabaseMemory } from "../src/storage/supabaseMemory.js";
import { loadRemoteOperationalCircuit, openRemoteOperationalCircuit, supabaseCircuitScope,
  REMOTE_OPERATIONAL_CIRCUIT_FILE } from "../src/production/remoteOperationalCircuit.js";

const ENV = {
  SUPABASE_ENABLED: "true",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-secret",
  SUPABASE_SYNC_PROJECT_LIMIT: "2",
};
const DATABASE_SIZE_MESSAGE = "Service for this project is restricted due to the following violations: exceed_db_size_quota. " +
  "The project owner must upgrade their plan or remove spend caps to restore service.";

function temporaryRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "supabase-sync-circuit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function pendingFixtures(root) {
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  const fixtures = new Map([
    ["production-market-observations.jsonl", '{"observationKey":"pending-observation"}\n'],
    ["prospective-edge-cohorts.jsonl", '{"episodeId":"pending-cohort"}\n'],
    ["outbox-fixture.jsonl", '{"state":"PENDING","receipt":null}\n'],
  ].map(([name, bytes]) => [path.join(root, "data", name), Buffer.from(bytes)]));
  for (const [file, bytes] of fixtures) fs.writeFileSync(file, bytes);
  return fixtures;
}

function assertPendingUnchanged(fixtures) {
  for (const [file, bytes] of fixtures) assert.deepEqual(fs.readFileSync(file), bytes);
}

function scanFixture() {
  return {
    projects: ["alpha", "beta", "gamma", "delta"].map((symbol, index) => ({ name: symbol, symbol, chain: "base", pipelineScore: 80 - index })),
    meta: { runId: "pending-scan", completedAt: "2026-10-21T18:44:54.161Z" },
    reportPaths: { jsonPath: "reports/report.json", htmlPath: "reports/report.html" },
    alphaTruth: { receipts: [{ receiptId: "pending-receipt", runId: "pending-scan", projectKey: "base:alpha" }] },
  };
}

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

test("production legacy sync opts into the same workspace circuit as production memory", () => {
  const source = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.match(source, /collectSupabaseMemory\(\{ projects: researchQueue, root: process\.cwd\(\) \}\)/);
  assert.match(source, /const supabaseSync = await syncScanToSupabase\(\{[\s\S]*?\}, \{ root: process\.cwd\(\) \}\);/);
});

for (const required of [false, true]) {
  test(`production memory restriction suppresses every legacy POST, required=${required}`, async t => {
    const root = temporaryRoot(t), pending = pendingFixtures(root), input = scanFixture();
    const beforeInput = structuredClone(input);
    const env = { ...ENV, SUPABASE_SYNC_REQUIRED: String(required) };
    let reads = 0, posts = 0;
    const memory = await collectSupabaseMemory({ root, env, writeReport: false, maxRetries: 0,
      fetchImpl: async () => {
        reads++;
        return { ok: false, status: 402, text: async () => JSON.stringify({ message: DATABASE_SIZE_MESSAGE }) };
      },
    });
    assert.equal(reads, 3);
    assert.equal(memory.remoteCircuit.providerCode, "exceed_db_size_quota");
    const file = path.join(root, REMOTE_OPERATIONAL_CIRCUIT_FILE), snapshot = fs.readFileSync(file);
    const operation = syncScanToSupabase(input, { root, env, fetchImpl: async () => { posts++; assert.fail("No POST after memory confirms restriction"); } });
    if (required) {
      await assert.rejects(operation, error => {
        assert.equal(error.providerCode, "exceed_db_size_quota");
        assert.equal(error.remoteCircuit.state, "REMOTE_DATABASE_SIZE_OUTAGE");
        assert.equal(error.skipped, true);
        return true;
      });
    } else {
      const result = await operation;
      assert.equal(result.status, "FAILED");
      assert.equal(result.providerCode, "exceed_db_size_quota");
      assert.equal(result.remoteCircuit.state, "REMOTE_DATABASE_SIZE_OUTAGE");
      assert.equal(result.skipped, true);
      assert.equal(result.operations, undefined);
    }
    assert.equal(posts, 0);
    assert.deepEqual(fs.readFileSync(file), snapshot);
    assert.deepEqual(input, beforeInput);
    assertPendingUnchanged(pending);
  });
}

for (const providerCode of ["exceed_db_size_quota", "exceed_egress_quota"]) {
  for (const required of [false, true]) {
    test(`legacy chunk failure persists ${providerCode} and prevents remaining POSTs, required=${required}`, async t => {
      const root = temporaryRoot(t), pending = pendingFixtures(root);
      const env = { ...ENV, SUPABASE_SYNC_PROJECT_LIMIT: "10", SUPABASE_SYNC_REQUIRED: String(required) };
      const options = { root, env, chunkSize: 1, now: "2026-10-21T18:44:54.161Z", fetchImpl: async (_url, init) => {
        assert.equal(init.method, "POST");
        calls++;
        assert.ok(calls <= 3, "No remaining chunk, report or receipt POST after the failure");
        return calls === 3 ? { ok: false, status: 403, text: async () => JSON.stringify(providerCode === "exceed_db_size_quota"
          ? { message: DATABASE_SIZE_MESSAGE } : { code: providerCode, message: "quota" }) } : { ok: true, status: 201 };
      } };
      let calls = 0;
      const operation = syncScanToSupabase(scanFixture(), options);
      if (required) {
        await assert.rejects(operation, error => {
          assert.equal(error.providerCode, providerCode);
          assert.equal(error.remoteCircuit.providerCode, providerCode);
          assert.deepEqual(loadRemoteOperationalCircuit(supabaseCircuitScope({ url: env.SUPABASE_URL }), { root }), error.remoteCircuit);
          return true;
        });
      } else {
        const result = await operation;
        assert.equal(result.status, "FAILED");
        assert.equal(result.providerCode, providerCode);
        assert.equal(result.remoteCircuit.providerCode, providerCode);
        assert.equal(result.syncedProjects, undefined);
        assert.equal(result.operations, undefined);
      }
      assert.equal(calls, 3);
      const incident = loadRemoteOperationalCircuit(supabaseCircuitScope({ url: env.SUPABASE_URL }), { root });
      assert.equal(incident.state, providerCode === "exceed_db_size_quota" ? "REMOTE_DATABASE_SIZE_OUTAGE" : "REMOTE_EGRESS_OUTAGE");
      assert.equal(incident.detectedAt, options.now);
      const next = await syncScanToSupabase(scanFixture(), { ...options, env: { ...env, SUPABASE_SYNC_REQUIRED: "false" } });
      assert.equal(next.status, "FAILED");
      assert.equal(next.skipped, true);
      assert.equal(calls, 3);
      assertPendingUnchanged(pending);
    });
  }
}

for (const restrictedAfterPost of [1, 2]) {
  test(`legacy sync checks admission between tables and chunks after POST ${restrictedAfterPost}`, async t => {
    const root = temporaryRoot(t), pending = pendingFixtures(root);
    const scope = supabaseCircuitScope({ url: ENV.SUPABASE_URL });
    let calls = 0, snapshot;
    const result = await syncScanToSupabase(scanFixture(), { root, env: { ...ENV, SUPABASE_SYNC_PROJECT_LIMIT: "10" }, chunkSize: 1,
      fetchImpl: async () => {
        calls++;
        if (calls === restrictedAfterPost) {
          openRemoteOperationalCircuit(scope, "exceed_db_size_quota", { root });
          snapshot = fs.readFileSync(path.join(root, REMOTE_OPERATIONAL_CIRCUIT_FILE));
        }
        return { ok: true, status: 201 };
      },
    });
    assert.equal(result.status, "FAILED");
    assert.equal(result.skipped, true);
    assert.equal(result.remoteCircuit.state, "REMOTE_DATABASE_SIZE_OUTAGE");
    assert.equal(calls, restrictedAfterPost);
    assert.deepEqual(fs.readFileSync(path.join(root, REMOTE_OPERATIONAL_CIRCUIT_FILE)), snapshot);
    assertPendingUnchanged(pending);
  });
}

test("legacy sync never persists generic 403, HTML, malformed JSON or non-exact quota envelopes", async t => {
  for (const body of [
    JSON.stringify({ code: "403", message: "Forbidden" }), `<html>${DATABASE_SIZE_MESSAGE}</html>`,
    `{"message":${JSON.stringify(DATABASE_SIZE_MESSAGE)}`, JSON.stringify({ message: "exceed_db_size_quota" }),
    JSON.stringify({ message: `${DATABASE_SIZE_MESSAGE} suffix` }),
    JSON.stringify({ code: "EXCEED_DB_SIZE_QUOTA" }), JSON.stringify({ code: "exceed_db_size_quota_extra" }),
  ]) {
    const root = temporaryRoot(t), pending = pendingFixtures(root);
    let calls = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await syncScanToSupabase(scanFixture(), { root, env: ENV, fetchImpl: async () => {
        calls++;
        return { ok: false, status: 403, text: async () => body };
      } });
      assert.equal(result.status, "FAILED");
      assert.equal(result.providerCode, undefined);
      assert.equal(result.remoteCircuit, undefined);
    }
    assert.equal(calls, 2);
    assert.equal(fs.existsSync(path.join(root, REMOTE_OPERATIONAL_CIRCUIT_FILE)), false);
    assertPendingUnchanged(pending);
  }
});

test("legacy sync does not block another project or clear the original project's incident on HTTP success", async t => {
  const root = temporaryRoot(t), scope = supabaseCircuitScope({ url: ENV.SUPABASE_URL });
  openRemoteOperationalCircuit(scope, "exceed_db_size_quota", { root });
  const file = path.join(root, REMOTE_OPERATIONAL_CIRCUIT_FILE), before = fs.readFileSync(file);
  let calls = 0;
  const result = await syncScanToSupabase(scanFixture(), { root, env: { ...ENV, SUPABASE_URL: "https://other-project.supabase.co" },
    fetchImpl: async url => {
      assert.equal(new URL(url).origin, "https://other-project.supabase.co");
      calls++;
      return { ok: true, status: 201 };
    },
  });
  assert.equal(result.status, "OK");
  assert.equal(calls, 4);
  assert.deepEqual(fs.readFileSync(file), before);
});

test("legacy library callers without a root never consult or persist a circuit", async t => {
  const root = temporaryRoot(t), scope = supabaseCircuitScope({ url: ENV.SUPABASE_URL });
  openRemoteOperationalCircuit(scope, "exceed_db_size_quota", { root });
  const file = path.join(root, REMOTE_OPERATIONAL_CIRCUIT_FILE), before = fs.readFileSync(file);
  const exists = fs.existsSync;
  t.mock.method(fs, "existsSync", value => {
    assert.ok(!String(value).endsWith(REMOTE_OPERATIONAL_CIRCUIT_FILE), "No circuit I/O without explicit root");
    return exists(value);
  });
  let calls = 0;
  const failed = await syncScanToSupabase({}, { env: ENV, fetchImpl: async () => {
    calls++;
    return { ok: false, status: 403, text: async () => JSON.stringify({ message: DATABASE_SIZE_MESSAGE }) };
  } });
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.providerCode, "exceed_db_size_quota");
  assert.equal(failed.remoteCircuit, undefined);
  assert.equal(failed.circuitPersistenceError, undefined);
  const healthy = await syncScanToSupabase({}, { env: ENV, fetchImpl: async () => { calls++; return { ok: true, status: 201 }; } });
  assert.equal(healthy.status, "OK");
  assert.equal(calls, 2);
  assert.deepEqual(fs.readFileSync(file), before);
});

test("legacy sync fails closed on corrupt circuit state without dispatch or changing pending bytes", async t => {
  const root = temporaryRoot(t), pending = pendingFixtures(root);
  const file = path.join(root, REMOTE_OPERATIONAL_CIRCUIT_FILE);
  fs.writeFileSync(file, "not-json");
  let calls = 0;
  const result = await syncScanToSupabase(scanFixture(), { root, env: ENV, fetchImpl: async () => { calls++; assert.fail("No POST with corrupt state"); } });
  assert.equal(result.status, "FAILED");
  assert.match(result.reason, /circuit state is malformed/);
  assert.equal(calls, 0);
  assert.equal(fs.readFileSync(file, "utf8"), "not-json");
  assertPendingUnchanged(pending);
});

test("legacy sync reports quota persistence failure explicitly without acknowledging writes", async t => {
  const root = temporaryRoot(t), pending = pendingFixtures(root);
  const rename = fs.renameSync;
  t.mock.method(fs, "renameSync", (source, target) => {
    if (String(target).endsWith(REMOTE_OPERATIONAL_CIRCUIT_FILE)) throw new Error("fixture persistence denied");
    return rename(source, target);
  });
  let calls = 0;
  const result = await syncScanToSupabase(scanFixture(), { root, env: ENV, fetchImpl: async () => {
    calls++;
    return { ok: false, status: 403, text: async () => JSON.stringify({ code: "exceed_db_size_quota" }) };
  } });
  assert.equal(result.status, "FAILED");
  assert.equal(result.providerCode, "exceed_db_size_quota");
  assert.match(result.circuitPersistenceError, /fixture persistence denied/);
  assert.equal(result.remoteCircuit, undefined);
  assert.equal(result.operations, undefined);
  assert.equal(calls, 1);
  assertPendingUnchanged(pending);
});
