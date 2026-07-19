import test from "node:test";
import assert from "node:assert/strict";

import {
  addressRejectionReason,
  isValidEvmAddress,
  isValidSolanaAddress,
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../src/identity/strictIdentityValidators.js";

const EVM = "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD";
const SOL = "So11111111111111111111111111111111111111112";

test("strict chain registry normalizes only supported chain aliases", () => {
  assert.equal(normalizeChainId("8453"), "base");
  assert.equal(normalizeChainId("binance-smart-chain"), "bsc");
  assert.equal(normalizeChainId("0xa4b1"), "arbitrum");
  assert.equal(normalizeChainId("SOL"), "solana");

  assert.equal(normalizeChainId("gaming"), null);
  assert.equal(normalizeChainId("depin"), null);
  assert.equal(normalizeChainId("coinbase"), null);
  assert.equal(normalizeChainId("google-news"), null);
  assert.equal(normalizeChainId("made-up-chain"), null);
});

test("address validators reject provider IDs, URLs, tickers, and wrong-chain addresses", () => {
  assert.equal(isValidEvmAddress(EVM), true);
  assert.equal(normalizeTokenAddress(EVM, "base"), EVM.toLowerCase());
  assert.equal(normalizeTokenAddress("0xnot-a-contract", "base"), null);
  assert.equal(normalizeTokenAddress("coingecko:bitcoin", "ethereum"), null);
  assert.equal(normalizeTokenAddress("coinpaprika:btc-bitcoin", "ethereum"), null);
  assert.equal(normalizeTokenAddress("AKE", "base"), null);
  assert.equal(normalizePoolAddress("https://dexscreener.com/base/abc", "base"), null);

  assert.equal(isValidSolanaAddress(SOL), true);
  assert.equal(normalizeTokenAddress(SOL, "solana"), SOL);
  assert.equal(normalizeTokenAddress(SOL, "ethereum"), null);
  assert.match(addressRejectionReason("AKE", "token address", "base"), /Rejected token address/);
});
