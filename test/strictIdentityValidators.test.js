import test from "node:test";
import assert from "node:assert/strict";

import {
  CHAIN_ALIAS_GROUPS,
  SUPPORTED_CHAIN_REGISTRY,
} from "../src/data/chainAliasRegistry.js";
import {
  addressRejectionReason,
  isValidCosmosAddress,
  isValidEvmAddress,
  isValidSolanaAddress,
  isValidSuiAddress,
  isValidTonAddress,
  normalizeChainId,
  normalizePoolAddress,
  summarizeUnknownChainValues,
  normalizeTokenAddress,
} from "../src/identity/strictIdentityValidators.js";

const EVM = "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD";
const SOL = "So11111111111111111111111111111111111111112";
const SUI = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TON = "0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const COSMOS = "cosmos1p8s3ww7c8u0dls0c0fj3y7r7yqruw8k6awf69d";

test("strict chain registry normalizes only supported chain aliases", () => {
  assert.equal(normalizeChainId("8453"), "base");
  assert.equal(normalizeChainId("binance-smart-chain"), "bsc");
  assert.equal(normalizeChainId("0xa4b1"), "arbitrum");
  assert.equal(normalizeChainId("SOL"), "solana");
  assert.equal(normalizeChainId("sui-network"), "sui");
  assert.equal(normalizeChainId("the-open-network"), "ton");
  assert.equal(normalizeChainId("osmosis"), "osmosis");

  assert.equal(normalizeChainId("gaming"), null);
  assert.equal(normalizeChainId("depin"), null);
  assert.equal(normalizeChainId("coinbase"), null);
  assert.equal(normalizeChainId("google-news"), null);
  assert.equal(normalizeChainId("made-up-chain"), null);
});

test("extensive chain aliases normalize centrally", () => {
  for (const [canonical, aliases] of Object.entries(CHAIN_ALIAS_GROUPS)) {
    for (const alias of aliases) {
      assert.equal(normalizeChainId(alias), canonical, `${alias} should normalize to ${canonical}`);
    }
  }

  for (const canonical of Object.keys(SUPPORTED_CHAIN_REGISTRY)) {
    assert.equal(normalizeChainId(canonical), canonical);
  }
});

test("Robinhood Chain and Osmosis stay distinct from provider/category vocabulary", () => {
  assert.equal(normalizeChainId("robinhood"), "robinhood-chain");
  assert.equal(normalizeChainId("Robinhood Chain"), "robinhood-chain");
  assert.equal(normalizeChainId("rhchain"), "robinhood-chain");
  assert.equal(normalizeChainId("4663"), "robinhood-chain");
  assert.equal(SUPPORTED_CHAIN_REGISTRY["robinhood-chain"].chainId, 4663);
  assert.equal(normalizeChainId("osmosis"), "osmosis");
  assert.equal(normalizeChainId("osmo"), "osmosis");
  assert.equal(normalizeChainId("osmosis-1"), "osmosis");
  assert.equal(normalizeChainId("cosmoshub-4"), "cosmos");
  assert.equal(normalizeChainId("eip155:1"), "ethereum");
  assert.equal(normalizeChainId("eip155:8453"), "base");
  assert.equal(normalizeChainId("eip155:42161"), "arbitrum");
  assert.equal(normalizeChainId("coinbase"), null);
  assert.equal(normalizeChainId("binance"), null);
  assert.equal(normalizeChainId("bitget"), null);
  assert.equal(normalizeChainId("dexscreener"), null);
  assert.equal(normalizeChainId("github"), null);
  assert.equal(normalizeChainId("trending"), null);
  assert.equal(normalizeChainId("totally-made-up-network"), null);
});

test("unknown chain values are audited for review instead of guessed", () => {
  const unknown = summarizeUnknownChainValues([
    { name: "One", symbol: "ONE", chain: "provider-new-chain-name", source: "geckoterminal" },
    { name: "Two", symbol: "TWO", network: "provider-new-chain-name", provider: "dexscreener" },
    { name: "Known", symbol: "OSMO", chain: "osmosis", source: "geckoterminal" },
  ]);

  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].rawValue, "provider-new-chain-name");
  assert.equal(unknown[0].count, 2);
  assert.deepEqual(unknown[0].providers.sort(), ["dexscreener", "geckoterminal"]);
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
  assert.equal(isValidSuiAddress(SUI), true);
  assert.equal(normalizeTokenAddress(SUI, "sui"), SUI);
  assert.equal(normalizeTokenAddress(SUI, "base"), null);
  assert.equal(isValidTonAddress(TON), true);
  assert.equal(normalizeTokenAddress(TON, "ton"), TON);
  assert.equal(isValidCosmosAddress(COSMOS), true);
  assert.equal(normalizeTokenAddress(COSMOS, "cosmos"), COSMOS);
  assert.match(addressRejectionReason("AKE", "token address", "base"), /Rejected token address/);
});
