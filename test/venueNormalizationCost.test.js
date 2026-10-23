import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { VENUE_REGISTRY, normalizeVenue } from "../src/data/venueVocabularyRegistry.js";

function oldNorm(value = "") {
  return String(value ?? "").trim().toLowerCase().replace(/[_\s]+/g, "-");
}

// Literal pre-optimization scan, including first-match precedence and coercion.
function oldNormalizeVenue(value = "") {
  const key = oldNorm(value);
  if (!key) return null;
  for (const [venue, aliases] of Object.entries(VENUE_REGISTRY)) {
    if (oldNorm(venue) === key || aliases.some((alias) => oldNorm(alias) === key)) return venue;
  }
  return key;
}

function assertEquivalent(values) {
  for (const value of values) assert.strictEqual(normalizeVenue(value), oldNormalizeVenue(value));
}

test("venue normalization exactly matches the old scan for every registry alias and coercion", () => {
  assert.equal(Object.isFrozen(VENUE_REGISTRY), true);
  for (const [venue, aliases] of Object.entries(VENUE_REGISTRY)) {
    assert.equal(Object.isFrozen(aliases), false);
    for (const value of [venue, ...aliases]) {
      assertEquivalent([
        value,
        value.toUpperCase(),
        ` \t${value}\n `,
        value.replace(/ /g, "__"),
        value.replace(/ /g, "\t "),
      ]);
    }
  }

  assertEquivalent([
    undefined, null, "", " \t\n", 0, -0, 123, NaN, Infinity, -Infinity, 42n,
    true, false, Symbol("Unknown Venue"), {}, [], ["Uniswap", "V3"],
    new String("BINANCE.US"), new Number(123),
    "Unknown__Venue", "__proto__", "constructor", "toString", "prototype",
    "Unknown---Venue", "BINANCE_US", "BINANCE.US", "BINANCE", "0x", "1inch",
    "\u00a0Uniswap\u2003V3\ufeff", "\u0130_UNKNOWN", "\u212aRAKEN",
    "Unknown " + "Long_Name_".repeat(1000),
  ]);
  assert.equal(normalizeVenue(), null);
  assert.equal(normalizeVenue("Unregistered__Venue"), "unregistered-venue");
  assert.equal(normalizeVenue("Binance.US"), "binance_us");
  assert.equal(normalizeVenue("Binance"), "binance");

  const uncoercible = Object.create(null);
  assert.throws(() => oldNormalizeVenue(uncoercible), TypeError);
  assert.throws(() => normalizeVenue(uncoercible), TypeError);
  const failure = new Error("coercion failure");
  const throwing = { [Symbol.toPrimitive]() { throw failure; } };
  assert.throws(() => normalizeVenue(throwing), (error) => error === failure);
});

test("venue normalization never retains mutable input objects or their coercion", () => {
  let text = "GDAX";
  let conversions = 0;
  const value = { toString() { conversions += 1; return text; } };
  assert.equal(normalizeVenue(value), "coinbase");
  assert.equal(conversions, 1);
  text = "Unknown_Object_Venue";
  assert.equal(normalizeVenue(value), "unknown-object-venue");
  assert.equal(conversions, 2);
  text = "GDAX";
  assert.equal(normalizeVenue(value), "coinbase");
  assert.equal(conversions, 3);
});

test("venue aliases remain live after push, splice, index edits and collisions", () => {
  const snapshots = Object.values(VENUE_REGISTRY).map((aliases) => [aliases, aliases.slice()]);
  const check = () => assertEquivalent([
    "Mutable_Venue", "Another_Mutable_Venue", "Kraken Pro", "Replacement_Alias",
    "Removed_Alias", "raydium", "GDAX", "Dynamic_Alias", "Next_Dynamic_Alias", 42,
    ...Object.entries(VENUE_REGISTRY).flatMap(([venue, aliases]) => [venue, ...aliases]),
  ]);
  try {
    check();
    assert.equal(normalizeVenue("Mutable_Venue"), "mutable-venue");
    VENUE_REGISTRY.kraken.push("Mutable Venue");
    check();
    assert.equal(normalizeVenue("Mutable_Venue"), "kraken");
    VENUE_REGISTRY.coinbase.push("Mutable__Venue");
    check();
    assert.equal(normalizeVenue("Mutable_Venue"), "coinbase");
    VENUE_REGISTRY.coinbase.splice(-1, 1);
    VENUE_REGISTRY.kraken.splice(-1, 1, "Another Mutable Venue");
    check();
    assert.equal(normalizeVenue("Mutable_Venue"), "mutable-venue");

    VENUE_REGISTRY.kraken[1] = "Replacement Alias";
    check();
    assert.equal(normalizeVenue("Kraken Pro"), "kraken-pro");
    assert.equal(normalizeVenue("Replacement_Alias"), "kraken");
    VENUE_REGISTRY.kraken.splice(1, 1, "Removed Alias");
    delete VENUE_REGISTRY.kraken[1];
    check();
    assert.equal(normalizeVenue("Removed_Alias"), "removed-alias");

    VENUE_REGISTRY.coinbase.push("raydium");
    check();
    assert.equal(normalizeVenue("raydium"), "coinbase");
    VENUE_REGISTRY.coinbase.pop();
    assert.equal(normalizeVenue("raydium"), "raydium");

    let aliasText = "Dynamic Alias";
    VENUE_REGISTRY.coinbase.push({ toString() { return aliasText; } }, 42, null);
    check();
    assert.equal(normalizeVenue("Dynamic_Alias"), "coinbase");
    assert.equal(normalizeVenue(42), "coinbase");
    aliasText = "Next Dynamic Alias";
    check();
    assert.equal(normalizeVenue("Dynamic_Alias"), "dynamic-alias");
    assert.equal(normalizeVenue("Next_Dynamic_Alias"), "coinbase");

    VENUE_REGISTRY.coinbase.length = 0;
    check();
    assert.equal(normalizeVenue("GDAX"), "gdax");
    assert.equal(normalizeVenue("coinbase"), "coinbase");
  } finally {
    for (const [aliases, original] of snapshots) aliases.splice(0, aliases.length, ...original);
  }
  check();
  assert.equal(normalizeVenue("GDAX"), "coinbase");
});

test("venue normalization stays equivalent after cache turnover and oversized strings", () => {
  for (let index = 0; index < 3000; index += 1) {
    const value = `Unregistered_${index}_Venue`;
    assert.strictEqual(normalizeVenue(value), oldNormalizeVenue(value));
  }
  assertEquivalent([
    "Unregistered_0_Venue", "GDAX", "Kraken Pro", "Paraswap Aggregator",
    "unknown_".repeat(1000), " UNKNOWN_".repeat(1000), "", " \t ", null,
  ]);
});

test("benchmark repeated known and unknown venue strings against the literal old function", {
  skip: process.env.BENCHMARK_VENUE_NORMALIZATION !== "1",
}, (t) => {
  const known = [
    "Coinbase Advanced Trade", "Kraken Pro", "Binance.US", "Crypto.com Exchange",
    "Uniswap V3", "Aerodrome Slipstream", "Raydium CLMM", "Meteora DLMM",
    "Jupiter Routing", "0x API", "Paraswap Aggregator", "STON.FI",
  ];
  const unknown = [
    "Unknown Venue", "Unlisted__Market", "Uniswap V5", "Raydium Futures",
    "Example Exchange", "Unregistered DEX", "pool:unknown", "custom_router_v9",
    "experimental.venue", "unrecognized spot", "Other_Liquidity_Market", "no-known-venue",
  ];
  const rounds = 7;
  const repeats = 256;
  const median = (values) => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const run = (normalize, values) => {
    let checksum = 0;
    const start = performance.now();
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      for (const value of values) checksum += normalize(value)?.length ?? 0;
    }
    return { ms: performance.now() - start, checksum };
  };

  for (const [label, values] of [["known", known], ["unknown", unknown], ["mixed", [...known, ...unknown]]]) {
    assertEquivalent(values);
    for (let warmup = 0; warmup < 2; warmup += 1) {
      run(oldNormalizeVenue, values);
      run(normalizeVenue, values);
    }
    const before = [];
    const after = [];
    for (let round = 0; round < rounds; round += 1) {
      const results = new Map();
      const order = round % 2 ? [normalizeVenue, oldNormalizeVenue] : [oldNormalizeVenue, normalizeVenue];
      for (const normalize of order) results.set(normalize, run(normalize, values));
      assert.equal(results.get(normalizeVenue).checksum, results.get(oldNormalizeVenue).checksum);
      before.push(results.get(oldNormalizeVenue).ms);
      after.push(results.get(normalizeVenue).ms);
    }
    t.diagnostic(JSON.stringify({ label, node: process.version, callsPerRound: repeats * values.length,
      rounds, beforeMs: before, afterMs: after, beforeMedianMs: median(before), afterMedianMs: median(after),
      speedup: median(before) / median(after) }));
  }
});
