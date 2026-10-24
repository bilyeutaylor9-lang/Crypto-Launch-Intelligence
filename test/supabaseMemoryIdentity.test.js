import test from "node:test";
import assert from "node:assert/strict";
import { applySupabaseMemory, collectSupabaseMemory, summarizeSupabaseMemoryImpact } from "../src/storage/supabaseMemory.js";
import { normalizeTokenAddress } from "../src/identity/strictIdentityValidators.js";

const MINT_A = "9a98oQHtxfqmr4EyzsP6wfw69uYAK3JbUeVEuNW1pump";
const MINT_B = "9A98oQHtxfqmr4EyzsP6wfw69uYAK3JbUeVEuNW1pump";
const BASE_A = `0x${"ab".repeat(20)}`;
const BASE_B = `0x${"cd".repeat(20)}`;

function memoryFor(key, symbol = "SAME") {
  return {
    status: "OK",
    byProject: { [key]: { projectKey: key, previousRunCount: 7, latestScore: 90,
      bestHistoricalScore: 95, qualifiedCount: 5, blockedCount: 1 } },
    bySymbolChain: { [`${key.split(":")[0]}:${symbol}`]: key },
  };
}

function assertUnattributed(project, memory, expected = "NEW_OR_NOT_SEEN") {
  const before = JSON.stringify({ project, memory });
  const [result] = applySupabaseMemory([project], memory);
  assert.equal(result.supabaseMemory.status, expected);
  assert.equal(result.supabaseMemory.projectKey, undefined);
  assert.equal(result.supabaseMemory.qualifiedCount, undefined);
  assert.equal(result.pipelineScore, project.pipelineScore);
  assert.equal(summarizeSupabaseMemoryImpact([result], memory).matchedProjects, 0);
  assert.equal(JSON.stringify({ project, memory }), before, "neither stored history nor input identity is rewritten");
}

test("remote memory cannot attribute a same-chain ticker collision to another exact EVM token", () => {
  assertUnattributed({ chain: "base", tokenAddress: BASE_B, symbol: "SAME", pipelineScore: 50 }, memoryFor(`base:${BASE_A}`));
});

test("case-distinct valid Solana mints cannot inherit each other's qualifications through a ticker", () => {
  assert.equal(normalizeTokenAddress(MINT_A, "solana"), MINT_A);
  assert.equal(normalizeTokenAddress(MINT_B, "solana"), MINT_B);
  assertUnattributed({ chain: "solana", tokenAddress: MINT_B, symbol: "SAME", pipelineScore: 50 }, memoryFor(`solana:${MINT_A}`));
});

test("a lowercased legacy Solana key cannot substitute for the case-sensitive current mint", () => {
  const lowerKey = `solana:${MINT_A.toLowerCase()}`;
  assertUnattributed({ chain: "solana", tokenAddress: MINT_A, symbol: "DIFFERENT", pipelineScore: 50 }, memoryFor(lowerKey));
});

test("symbol-only temporary keys are not historical identity proof even when their text matches", () => {
  assertUnattributed({ chain: "base", symbol: "SAME", pipelineScore: 50 }, memoryFor("temporary:symbol:base:SAME"));
});

test("unavailable remote reads cannot attribute stale retained memory entries", () => {
  const memory = { ...memoryFor(`solana:${MINT_A}`), status: "FAILED" };
  assertUnattributed({ chain: "solana", tokenAddress: MINT_A, symbol: "SAME", pipelineScore: 50 }, memory, "UNAVAILABLE");
});

test("an inconsistent memory index cannot relabel another stored project as the current identity", () => {
  const memory = memoryFor(`solana:${MINT_A}`);
  memory.byProject[`solana:${MINT_A}`].projectKey = `solana:${MINT_B}`;
  assertUnattributed({ chain: "solana", tokenAddress: MINT_A, symbol: "SAME", pipelineScore: 50 }, memory);
});

test("an exact Solana key still matches independently of display ticker", () => {
  const memory = memoryFor(`solana:${MINT_A}`);
  const project = { chain: "solana", tokenAddress: MINT_A, symbol: "RENAMED", pipelineScore: 50 };
  const original = JSON.stringify({ memory, project });
  const [result] = applySupabaseMemory([project], memory);
  assert.equal(result.supabaseMemory.status, "MATCHED");
  assert.equal(result.supabaseMemory.projectKey, `solana:${MINT_A}`);
  assert.equal(result.supabaseMemory.qualifiedCount, 5);
  assert.equal(result.pipelineScore, 50);
  assert.equal(JSON.stringify({ memory, project }), original);
});

test("canonical EVM case and chain aliases retain exact matches", () => {
  const [result] = applySupabaseMemory([{ chainId: 8453, tokenAddress: `0x${"aB".repeat(20)}`, symbol: "RENAMED" }],
    memoryFor(`base:${BASE_A}`));
  assert.equal(result.supabaseMemory.status, "MATCHED");
  assert.equal(result.supabaseMemory.projectKey, `base:${BASE_A}`);
});

test("actual collector output keeps legacy rows diagnostic without using ticker fallback or adding requests", async () => {
  const calls = [];
  const rows = [
    { project_key: `base:token:${BASE_A}`, run_id: "run-a", chain: "base", symbol: "SAME",
      score: 90, final_state: "QUALIFIED", final_qualified: true, created_at: "2026-10-20T12:00:00.000Z" },
    { project_key: "base:same", run_id: "legacy-run", chain: "base", symbol: "SAME",
      score: 99, final_state: "QUALIFIED", final_qualified: true, created_at: "2026-10-20T11:00:00.000Z" },
  ];
  const original = JSON.stringify(rows);
  const memory = await collectSupabaseMemory({
    env: { SUPABASE_ENABLED: "true", SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "test-server-key" },
    fetchImpl: async (url) => {
      const endpoint = new URL(String(url)).pathname;
      calls.push(endpoint);
      const body = endpoint.endsWith("/scan_projects") ? rows : [];
      return { ok: true, json: async () => body };
    },
  });
  assert.equal(memory.status, "OK");
  assert.equal(calls.length, 3, "one existing read per table, no extra identity/provider lookup");
  assert.ok(memory.byProject["base:same"], "legacy originals remain available as diagnostic data");
  assertUnattributed({ chain: "base", tokenAddress: BASE_B, symbol: "SAME", pipelineScore: 50 }, memory);
  const [matched] = applySupabaseMemory([{ chain: "base", tokenAddress: BASE_A, symbol: "RENAMED", pipelineScore: 50 }], memory);
  assert.equal(matched.supabaseMemory.status, "MATCHED");
  assert.equal(matched.supabaseMemory.qualifiedCount, 1);
  assert.equal(JSON.stringify(rows), original);
});
