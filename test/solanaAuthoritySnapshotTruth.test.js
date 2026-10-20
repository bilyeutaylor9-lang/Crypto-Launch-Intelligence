import test from "node:test";
import assert from "node:assert/strict";
import { getSolanaSecurityEvidence } from "../src/data/security/solanaSecurityConnector.js";

const MINT = "So11111111111111111111111111111111111111112";
const PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const NOW = Date.parse("2026-10-18T07:00:00Z");

function transport(overrides = {}, calls = []) {
  return async (url, init = {}) => {
    if (init.method !== "POST") throw new Error("No RugCheck report in this fixture");
    const { method, params } = JSON.parse(init.body);
    calls.push({ url, method, params });
    if (method === "getGenesisHash") return { result: overrides.genesis ?? GENESIS };
    if (method === "getBlockTime") return { result: Object.hasOwn(overrides, "time") ? overrides.time : NOW / 1000 - 2 };
    assert.equal(method, "getAccountInfo");
    return { result: { context: { slot: overrides.slot ?? 12345 }, value: {
      owner: PROGRAM, data: { parsed: { type: "mint", info: {
        isInitialized: true, mintAuthority: null, freezeAuthority: null, decimals: 9, supply: "1000000000", ...overrides.info,
      } } },
    } } };
  };
}

function options(fetchJson) {
  return { useCache: false, solanaRpcUrl: "https://rpc.invalid", now: () => NOW, fetchJson };
}

test("Solana authority proof requires mainnet genesis and fresh account-slot time", async () => {
  const calls = [];
  const result = await getSolanaSecurityEvidence({ chain: "solana", tokenAddress: MINT }, options(transport({}, calls)));
  assert.equal(result.identityVerifiedOnChain, true);
  assert.equal(result.snapshotTimestampVerified, true);
  assert.equal(result.sourceTimestamp, "2026-10-18T06:59:58.000Z");
  assert.equal(result.raw.rpc.genesisHash, GENESIS);
  assert.equal(result.raw.rpc.observedSlot, 12345);
  assert.deepEqual(calls.map(x => x.method), ["getGenesisHash", "getAccountInfo", "getBlockTime"]);
  assert.deepEqual(calls[2].params, [12345]);
});

test("wrong cluster, stale/future/unknown time and malformed slots cannot attest authorities", async () => {
  for (const bad of [{ genesis: "wrong-cluster" }, { time: null }, { time: NOW / 1000 + 1 },
    { time: NOW / 1000 - 301 }, { slot: -1 }, { slot: "12345" }]) {
    const result = await getSolanaSecurityEvidence({ chain: "solana", tokenAddress: MINT }, options(transport(bad)));
    assert.notEqual(result.identityVerifiedOnChain, true);
    assert.ok(!result.testedChecks?.includes("mint authority"));
  }
});

test("conflicting or malformed supplied chain/mint aliases issue no security requests", async () => {
  for (const extra of [{ chainId: 1 }, { network: "unknown-chain" }, { contractAddress: "broken" },
    { contractAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }]) {
    let calls = 0;
    const result = await getSolanaSecurityEvidence({ chain: "solana", tokenAddress: MINT, ...extra },
      options(async () => { calls++; throw new Error("must not fetch"); }));
    assert.equal(calls, 0);
    assert.equal(result.status, "UNKNOWN");
  }
});

test("independent configured endpoints can recover after a real transport failure", async () => {
  const calls = [];
  const good = transport({}, calls);
  const result = await getSolanaSecurityEvidence({ chain: "solana", tokenAddress: MINT }, {
    ...options(async (url, init) => {
      if (url === "https://failed.invalid") throw new Error("HTTP 403");
      return good(url, init);
    }), solanaRpcUrl: "https://failed.invalid", solanaRpcUrls: ["https://rpc.invalid", "https://not-used.invalid"],
  });
  assert.equal(result.identityVerifiedOnChain, true);
  assert.ok(calls.every(x => x.url === "https://rpc.invalid"));
  assert.equal(result.raw.rpc.rpcEndpointAttempts.length, 2);
});

test("a block produced during RPC collection is not falsely future at response time", async () => {
  let now = NOW;
  const fetch = transport({ time: NOW / 1000 + 1 });
  const opts = options(async (url, init) => {
    if (init.method === "POST" && JSON.parse(init.body).method === "getGenesisHash") now += 2000;
    return fetch(url, init);
  });
  opts.now = () => now;
  const result = await getSolanaSecurityEvidence({ chain: "solana", tokenAddress: MINT }, opts);
  assert.equal(result.identityVerifiedOnChain, true);
  assert.equal(result.sourceTimestamp, new Date(NOW + 1000).toISOString());
});
