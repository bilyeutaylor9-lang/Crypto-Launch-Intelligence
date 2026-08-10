import test from "node:test";
import assert from "node:assert/strict";

import { normalizeSymbol } from "../src/data/expandedMarketDataConnector.js";
import { normalizeKrakenAssetSymbol } from "../src/data/freeMarketDataConnector.js";

test("global symbol normalization preserves legitimate X and Z symbols", () => {
  for (const symbol of ["XRP", "XLM", "XMR", "ZEC"]) {
    assert.equal(normalizeSymbol(symbol), symbol);
    assert.equal(normalizeKrakenAssetSymbol(symbol), symbol);
  }
});

test("Kraken-only legacy prefixes are stripped only in Kraken asset context", () => {
  assert.equal(normalizeSymbol("XXBT"), "XXBT");
  assert.equal(normalizeSymbol("XXBT", { krakenAsset: true }), "XBT");
  assert.equal(normalizeKrakenAssetSymbol("XXBT"), "XBT");
});
