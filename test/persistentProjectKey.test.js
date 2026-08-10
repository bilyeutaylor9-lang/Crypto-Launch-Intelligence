import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPersistentProjectKey,
  normalizePersistentProjectKey,
} from "../src/identity/persistentProjectKey.js";

test("persistent keys lower-case EVM addresses but preserve Solana address casing", () => {
  const evm = buildPersistentProjectKey({
    chain: "base",
    tokenAddress: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD",
  });
  const solanaA = buildPersistentProjectKey({
    chain: "solana",
    tokenAddress: "So11111111111111111111111111111111111111112",
  });
  const solanaB = buildPersistentProjectKey({
    chain: "solana",
    tokenAddress: "so11111111111111111111111111111111111111112",
  });

  assert.equal(evm, "base:0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
  assert.equal(solanaA, "solana:So11111111111111111111111111111111111111112");
  assert.equal(solanaB, "solana:so11111111111111111111111111111111111111112");
  assert.notEqual(solanaA, solanaB);
});

test("persistent key normalization removes role labels without losing non-EVM case", () => {
  assert.equal(
    normalizePersistentProjectKey("solana:token:So11111111111111111111111111111111111111112"),
    "solana:So11111111111111111111111111111111111111112"
  );
});
