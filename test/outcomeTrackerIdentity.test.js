import test from "node:test";
import assert from "node:assert/strict";
import { createOutcomeSnapshot } from "../src/learning/outcomeTracker.js";

test("outcome snapshots preserve case-sensitive Solana mint identity", () => {
  const mint = "So11111111111111111111111111111111111111112";
  const snapshot = createOutcomeSnapshot({
    chain: "solana",
    tokenAddress: mint,
    poolAddress: "9xQeWvG816bUx9EPf9ZkPqFhQ2eTzM9Zx9e8YgW7qf2",
    priceUsd: 1,
  });

  assert.equal(snapshot.key, `solana:${mint}`);
  assert.equal(snapshot.tokenAddress, mint);
  assert.equal(snapshot.identityCasePreserved, true);
});

test("outcome snapshots lowercase EVM contracts but preserve pool separately", () => {
  const snapshot = createOutcomeSnapshot({
    chain: "base",
    tokenAddress: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    poolAddress: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
    priceUsd: 1,
  });

  assert.equal(snapshot.key, "base:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(snapshot.tokenAddress, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(snapshot.poolAddress, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
});

test("pool-only observations cannot masquerade as token identity", () => {
  const pool = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
  const snapshot = createOutcomeSnapshot({ chain: "base", pairAddress: pool, priceUsd: 1 });

  assert.equal(snapshot.key, "base:pool:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  assert.equal(snapshot.tokenAddress, null);
  assert.equal(snapshot.poolAddress, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
});
