import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCanonicalExecutionRoute } from "../src/engines/canonicalExecutionRouteEngine.js";

const tokenAddress = "0x1111111111111111111111111111111111111111";

test("aggregate discovery labels and exchange-like substrings do not invent CEX routes", () => {
  for (const dex of ["market-aggregate", "DEX Aggregator", "gatekeeping", "notcoinbase", "kraken-impostor"]) {
    const project = analyzeCanonicalExecutionRoute({ source: "coingecko", dex, chain: "base", tokenAddress,
      marketPair: "UNKNOWN", priceUsd: 1 });
    assert.notEqual(project.canonicalExecutionRoute.routeType, "CEX", dex);
    assert.notEqual(project.canonicalExecutionRoute.venue, "Gate", dex);
    assert.equal(project.canonicalExecutionRoute.buyQuoteVerified, false);
    assert.equal(project.canonicalExecutionRoute.sellQuoteVerified, false);
  }
});

test("exchange names in unrelated URL paths, lookalike hosts and credentials are not CEX evidence", () => {
  for (const url of ["https://example.com/gate.io", "https://gate.io.example.com/token", "https://gate.io@example.com/token",
    "https://example.com/coinbase", "https://fakecoinbase.com/token"]) {
    assert.notEqual(analyzeCanonicalExecutionRoute({ source: "coingecko", url, chain: "base", tokenAddress })
      .canonicalExecutionRoute.routeType, "CEX", url);
  }
});

test("explicit supported exchange metadata and real hosts retain route detection without verification", () => {
  for (const patch of [{ source: "coinbase" }, { exchange: "Gate.io" }, { listingExchange: "Kraken Pro" },
    { marketUrl: "https://api.exchange.coinbase.com/products/ETH-USD" }]) {
    const route = analyzeCanonicalExecutionRoute({ ...patch, marketPair: "ETH-USD", priceUsd: 1 }).canonicalExecutionRoute;
    assert.equal(route.routeType, "CEX", JSON.stringify(patch));
    assert.equal(route.buyQuoteVerified, false);
    assert.equal(route.sellQuoteVerified, false);
    assert.notEqual(route.status, "VERIFIED");
  }
});
