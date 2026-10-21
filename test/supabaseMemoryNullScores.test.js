import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const previousCwd = process.cwd();
const root = fs.mkdtempSync(path.join(os.tmpdir(), "remote-memory-null-scores-"));
process.chdir(root);
const { collectSupabaseMemory, applySupabaseMemory, scanMemoryRecordsFromSupabase } = await import("../src/storage/supabaseMemory.js");
const { primeScanMemory } = await import("../src/learning/scanMemoryStore.js");
const { analyzeProjectChangeBatch } = await import("../src/engines/projectChangeDetectionEngine.js");
after(() => { primeScanMemory([]); process.chdir(previousCwd); fs.rmSync(root, { recursive: true, force: true }); });

const address = `0x${"a".repeat(40)}`;
const key = `base:${address}`;
const prior = "2026-10-20T10:00:00.000Z";
const clock = () => "2026-10-20T12:00:00.000Z";
const current = { chain: "base", tokenAddress: address, pipelineScore: 50, riskScore: 40 };
const env = { SUPABASE_ENABLED: "true", SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_fixture_only" };

async function load(score) {
  const row = { run_id: "prior", project_key: key, chain: "base", score, created_at: prior };
  const original = structuredClone(row), calls = [];
  const memory = await collectSupabaseMemory({ env, maxRetries: 0, fetchImpl: async (url, init) => {
    calls.push({ pathname: new URL(url).pathname, method: init.method });
    return { ok: true, json: async () => new URL(url).pathname.endsWith("/scan_projects") ? [row] : [] };
  } });
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.method === "GET"));
  assert.deepEqual(row, original);
  return memory;
}

test("nullable remote scores remain unknown through collection, attribution, priming and actual change engine", async () => {
  for (const score of [undefined, null, "", " ", false, true, "invalid"]) {
    const memory = await load(score);
    assert.equal(memory.byProject[key].observations[0].score, null);
    assert.equal(memory.byProject[key].latestScore, null);
    assert.equal(memory.byProject[key].bestHistoricalScore, null);
    const applied = applySupabaseMemory([current], memory)[0];
    assert.equal(applied.supabaseMemory.scoreDeltaFromLatest, null);
    const rows = scanMemoryRecordsFromSupabase(memory);
    assert.equal(rows[0].scores.pipeline, null);
    primeScanMemory(rows);
    const actual = analyzeProjectChangeBatch([current], { clock })[0];
    assert.equal(actual.projectChangeScore, 50);
    assert.equal(actual.projectChange.scoreDelta, null);
    assert.equal(actual.projectChange.riskDelta, null);
  }
});

test("real zero and finite numeric-string scores remain measured; unknown current score has no delta", async () => {
  for (const [input, expected] of [[0, 0], ["40", 40], [40.5, 40.5]]) {
    const memory = await load(input);
    assert.equal(memory.byProject[key].observations[0].score, expected);
    assert.equal(memory.byProject[key].latestScore, expected);
    assert.equal(applySupabaseMemory([current], memory)[0].supabaseMemory.scoreDeltaFromLatest, 50 - expected);
    assert.equal(applySupabaseMemory([{ ...current, pipelineScore: false }], memory)[0].supabaseMemory.scoreDeltaFromLatest, null);
  }
});

test("an observation without its own timestamp cannot borrow another observation's project lastSeenAt", () => {
  const memory = { status: "OK", byProject: { [key]: { projectKey: key, chain: "base", lastSeenAt: prior,
    observations: [{ score: 10, observedAt: null }] } } };
  const rows = scanMemoryRecordsFromSupabase(memory);
  assert.equal(rows[0].scannedAt, null);
  primeScanMemory(rows);
  const actual = analyzeProjectChangeBatch([current], { clock })[0];
  assert.equal(actual.projectChangeScore, 50);
  assert.equal(actual.projectChange.historyEligibility, "NO_ELIGIBLE_PRIOR");
});
