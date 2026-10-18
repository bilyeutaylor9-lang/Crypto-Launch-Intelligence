import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { resolveCanonicalHistoryIdentity } from "../src/identity/canonicalHistoryIdentity.js";
import { normalizeCapitalFlowHistoryIdentity, normalizeCapitalFlowObservation } from "../src/data/capitalFlowNormalizer.js";
import { analyzeCapitalFlowBaseline } from "../src/engines/capitalFlowBaselineEngine.js";
import { buildResearchWorthyBoard } from "../src/reports/githubPagesPublisher.js";

// Syntax fixtures only; neither mint is asserted to exist on-chain.
const MINT = "HKZDfZnkHZxd9agRDNPyDv4iT6LmAurJnpRtj9wpump";
const CASE_MINT = `h${MINT.slice(1)}`;
const OLD_ID = `101:${MINT.toLowerCase()}`;
const EXACT_ID = `101:${MINT}`;
const OTHER_MINT = "So11111111111111111111111111111111111111112";

function legacy(overrides = {}) {
  return { chain: "solana", tokenAddress: MINT, canonicalProjectId: OLD_ID, ...overrides };
}

function isolatedStore(script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "canonical-history-"));
  try {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: dir, encoding: "utf8", timeout: 15_000,
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return JSON.parse(result.stdout);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("legacy canonical history rekeys only address-backed identities", () => {
  assert.deepEqual(resolveCanonicalHistoryIdentity(legacy()), {
    status: "LEGACY_ADDRESS_MATCH", canonicalId: EXACT_ID,
  });
  assert.equal(resolveCanonicalHistoryIdentity(legacy({ tokenAddress: CASE_MINT })).canonicalId, `101:${CASE_MINT}`);
  for (const overrides of [
    { tokenAddress: OTHER_MINT }, { tokenAddress: null }, { chain: null },
    { contractAddress: CASE_MINT }, { chainId: "base" }, { chain: "unregistered" },
    { identityKey: `solana:${CASE_MINT}` }, { historyIdentityStatus: "UNKNOWN" },
    { canonicalId: `101:${CASE_MINT}` },
    { canonicalIdentityHardBlock: true },
  ]) {
    assert.equal(resolveCanonicalHistoryIdentity(legacy(overrides)).status, "UNKNOWN", JSON.stringify(overrides));
  }
  assert.equal(resolveCanonicalHistoryIdentity({ name: "Same Name", symbol: "CASE" }).status, "UNKNOWN");
  assert.equal(resolveCanonicalHistoryIdentity(null).status, "UNKNOWN");
  const evm = "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD";
  assert.equal(resolveCanonicalHistoryIdentity({
    chain: "BASE", chainId: 8453, tokenAddress: evm, canonicalProjectId: `base:${evm.toLowerCase()}`,
  }).status, "UNCHANGED");
});

test("exact EVM history retains opaque IDs; unbacked or conflicting EVM history is explicitly unknown", () => {
  const token = "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD";
  const row = { chain: "base", chainId: 8453, tokenAddress: token,
    contractAddress: token.toLowerCase(), canonicalProjectId: "trusted-provider-project-id" };
  assert.equal(resolveCanonicalHistoryIdentity(row).status, "UNCHANGED");
  assert.deepEqual(normalizeCapitalFlowHistoryIdentity(row), row);
  assert.equal(resolveCanonicalHistoryIdentity({ ...row, tokenAddress: null, contractAddress: null }).status, "UNKNOWN");
  assert.equal(resolveCanonicalHistoryIdentity({ ...row, contractAddress: "0x1111111111111111111111111111111111111111" }).status, "UNKNOWN");
  const previous = { ...row, observedAt: "2026-10-17T00:00:00Z", uniqueBuyers: 10 };
  const current = { ...row, observedAt: "2026-10-17T01:00:00Z", uniqueBuyers: 20 };
  const result = analyzeCapitalFlowBaseline(current, { observations: [previous] });
  assert.equal(result.capitalFlowObservation.canonicalProjectId, row.canonicalProjectId);
  assert.equal(result.capitalFlowBaseline.observationCount, 2);
  assert.equal(result.capitalFlowBaseline.uniqueBuyerGrowthPct, 100);
});

test("capital baseline retains exact legacy mint history and refuses wrong/no-address history", () => {
  const previous = legacy({ observedAt: "2026-10-17T00:00:00Z", priceUsd: 1, uniqueBuyers: 10 });
  const wrongCase = legacy({ tokenAddress: CASE_MINT, observedAt: "2026-10-17T00:30:00Z", uniqueBuyers: 999 });
  const noAddress = legacy({ tokenAddress: null, observedAt: "2026-10-17T00:45:00Z", uniqueBuyers: 777 });
  const current = { chain: "solana", tokenAddress: MINT, canonicalProjectId: EXACT_ID,
    observedAt: "2026-10-17T01:00:00Z", priceUsd: 2, uniqueBuyers: 20 };
  const result = analyzeCapitalFlowBaseline(current, { observations: [previous, wrongCase, noAddress] });
  assert.equal(result.capitalFlowBaseline.observationCount, 2);
  assert.equal(result.capitalFlowBaseline.uniqueBuyerGrowthPct, 100);
  assert.equal(previous.canonicalProjectId, OLD_ID);
  assert.equal(normalizeCapitalFlowHistoryIdentity(noAddress).historyIdentityStatus, "UNKNOWN");
  const conflicted = normalizeCapitalFlowObservation({ ...current, contractAddress: CASE_MINT });
  assert.equal(conflicted.canonicalProjectId, null);
  assert.equal(conflicted.identityStatus, "UNKNOWN");
});

test("capital history load uses an address-backed read view without rewriting the file", () => {
  const storeUrl = new URL("../src/data/capitalFlowObservationStore.js", import.meta.url).href;
  const rows = [legacy(), legacy({ tokenAddress: CASE_MINT }), legacy({ tokenAddress: OTHER_MINT }),
    legacy({ tokenAddress: null }), legacy({ contractAddress: CASE_MINT })];
  const result = isolatedStore(`
    import fs from "node:fs";
    fs.mkdirSync("data");
    const file = "data/capital-flow-observations.jsonl";
    const raw = ${JSON.stringify(rows)}.map(row => JSON.stringify(row)).join("\\n") + "\\n";
    fs.writeFileSync(file, raw);
    const { loadCapitalFlowObservations } = await import(${JSON.stringify(storeUrl)});
    const exact = loadCapitalFlowObservations({ canonicalProjectId: ${JSON.stringify(EXACT_ID)} });
    const all = loadCapitalFlowObservations();
    console.log(JSON.stringify({ exact, all, unchanged: fs.readFileSync(file, "utf8") === raw }));
  `);
  assert.equal(result.exact.length, 1);
  assert.equal(result.exact[0].tokenAddress, MINT);
  assert.equal(result.all.length, rows.length);
  assert.equal(result.all.filter((row) => row.historyIdentityStatus === "UNKNOWN").length, 3);
  assert.equal(result.unchanged, true);
});

test("paper outcomes preserve exact legacy records and quarantine ambiguous records without loss", () => {
  const storeUrl = new URL("../src/learning/paperTradingOutcomeStore.js", import.meta.url).href;
  const record = (overrides) => ({ id: OLD_ID, canonicalId: OLD_ID, chain: "solana", contractAddress: MINT,
    strategyId: "strategy", openedAt: "2026-10-01T00:00:00Z", entryPriceUsd: 1,
    latestPriceUsd: 1, checkpoints: {}, ...overrides });
  const rows = [record({}), record({ strategyId: "wrong-case", contractAddress: CASE_MINT }),
    record({ strategyId: "no-address", contractAddress: null }),
    record({ strategyId: "conflict", tokenAddress: CASE_MINT }),
    record({ strategyId: "duplicate" }), record({ strategyId: "duplicate", entryPriceUsd: 9 }), null];
  const result = isolatedStore(`
    import fs from "node:fs";
    fs.mkdirSync("data");
    const file = "data/paper-trading-outcomes.json";
    const raw = JSON.stringify({records: ${JSON.stringify(rows)}});
    fs.writeFileSync(file, raw);
    const store = await import(${JSON.stringify(storeUrl)});
    const before = store.loadPaperTradingOutcomes();
    const readOnly = fs.readFileSync(file, "utf8") === raw;
    const candidate = {name:"Utility Network", symbol:"CASE", chain:"solana", tokenAddress:${JSON.stringify(MINT)},
      contractAddress:${JSON.stringify(MINT)}, baseTokenAddress:${JSON.stringify(MINT)},
      quoteTokenAddress:"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", dexName:"Jupiter", routeType:"DEX_AGGREGATOR",
      liquidityUsd:100000, volume24hUsd:100000, buyQuoteVerified:true, sellQuoteVerified:true,
      discoverySources:["dexscreener"], routeTruthStatus:"LIVE_EXECUTION_READY",
      quoteAgeSeconds:1, exactIdentityVerified:true, estimatedRoundTripSlippagePct:0.5, slippageIsHeuristic:false,
      priceUsd:2, autonomousAlphaOSVerdict:"OS Paper Trade"};
    const saved = store.savePaperTradingOutcomes(["strategy","wrong-case","no-address","conflict","duplicate"].map(id =>
      ({...candidate, bestAutonomousStrategy:{id}})));
    const after = store.loadPaperTradingOutcomes();
    console.log(JSON.stringify({before, readOnly, saved, after, summary:store.summarizePaperTradingOutcomes()}));
  `);
  assert.equal(result.readOnly, true);
  assert.equal(result.saved.updated, 1);
  assert.equal(result.saved.opened, 4);
  assert.equal(result.after.records.length, rows.length + 4);
  assert.equal(result.after.records.find((row) => Object.hasOwn(row, "legacyRecord")).legacyRecord, null);
  const exact = result.after.records.find((row) => row.strategyId === "strategy");
  assert.equal(exact.id, EXACT_ID);
  assert.equal(exact.legacyCanonicalId, OLD_ID);
  assert.equal(exact.entryPriceUsd, 1);
  assert.equal(exact.latestPriceUsd, 2);
  const wrong = result.after.records.find((row) => row.strategyId === "wrong-case" && row.contractAddress === CASE_MINT);
  assert.equal(wrong.latestPriceUsd, 1);
  assert.equal(wrong.id, `101:${CASE_MINT}`);
  assert.equal(result.summary.unknownIdentityRecords, 5);
});

test("paper history keeps safely exact opaque EVM records and enforces MAX_RECORDS on save", () => {
  const storeUrl = new URL("../src/learning/paperTradingOutcomeStore.js", import.meta.url).href;
  const result = isolatedStore(`
    import fs from "node:fs";
    process.env.MAX_PAPER_TRADING_RECORDS = "2";
    fs.mkdirSync("data");
    const token = "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD";
    const rows = ["oldest", "middle", "newest"].map(id => ({ id, chain:"base", contractAddress:token,
      strategyId:id, entryPriceUsd:1, latestPriceUsd:1, daysOpen:2, latestReturnPct:10 }));
    fs.writeFileSync("data/paper-trading-outcomes.json", JSON.stringify({records:rows}));
    const store = await import(${JSON.stringify(storeUrl)});
    const before = store.loadPaperTradingOutcomes();
    const saved = store.savePaperTradingOutcomes([]);
    const after = store.loadPaperTradingOutcomes();
    console.log(JSON.stringify({before, saved, after, summary:store.summarizePaperTradingOutcomes()}));
  `);
  assert.equal(result.before.records.length, 3);
  assert.equal(result.saved.totalRecords, 2);
  assert.deepEqual(result.after.records.map((row) => row.id), ["middle", "newest"]);
  assert.equal(result.summary.unknownIdentityRecords, 0);
  assert.equal(result.summary.evaluatedRecords, 2);
});

test("published research board preserves non-EVM identifiers and retains EVM/unknown deduplication", () => {
  const board = (chain, tokens) => buildResearchWorthyBoard({ hottestTenNow: {
    topTenCurrentResearchBoard: tokens.map((tokenAddress) => ({
      chain, tokenAddress, contractAddress: tokenAddress, canonicalId: `${chain}:${tokenAddress}`,
      symbol: "UTILITY", name: "Utility Network", strictRankEligible: true, score: 90,
    })),
  } });
  assert.equal(board("solana", [MINT, CASE_MINT]).length, 2);
  assert.equal(board("solana", [MINT, MINT]).length, 1);
  const evm = "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD";
  assert.equal(board("base", [evm, evm.toLowerCase()]).length, 1);
  assert.equal(board("unregistered", ["ABC", "abc"]).length, 1);
});
