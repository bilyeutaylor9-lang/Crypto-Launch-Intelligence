import test from "node:test";
import assert from "node:assert/strict";
import { resolveCanonicalAliases } from "../src/data/canonicalAliasResolver.js";
import {
  CANONICAL_FIELD_ALIAS_REGISTRY,
  EXTENDED_CANONICAL_FIELD_ALIAS_REGISTRY,
  aliasesForCanonicalField,
} from "../src/data/canonicalFieldAliasRegistry.js";

const ignoredRoots = [
  "engineResults", "fieldProvenance", "canonicalAliasProvenance", "aliasResolutionAudit",
  "aliasResolutionConflicts", "canonicalAliasConflicts", "canonicalAliases", "engineDataContractHealth",
  "engineDataReadiness", "dataStarvation", "targetedEnrichmentPlan", "starvationRecoveryPlan",
  "valueOfInformationItems", "baselineDeviation", "baselineDeviationVector", "modelDiagnostics",
  "scoreBreakdown", "dataConfidenceBreakdown", "measuredWalletFlow",
];

// A custom list exercises the original per-pattern path, without root pruning.
function referenceIgnores() {
  return [
    ...ignoredRoots.map((root) => new RegExp(`^${root}(\\.|$)`, "i")),
    /^engineDataReadiness\.engines\.\d+\.(score|status|warnings|engineName|engineVersion|criticality|confidence|evidenceCoverage|dataFreshness|warningCount)$/i,
    /\.(engineName|engineVersion|criticality|warningCount)$/i,
  ];
}

const fields = [...new Set([
  ...Object.keys(CANONICAL_FIELD_ALIAS_REGISTRY),
  ...Object.keys(EXTENDED_CANONICAL_FIELD_ALIAS_REGISTRY),
  "unrecognizedEvidence",
])];

function assertDefaultEquivalent(project, options = {}) {
  const actual = resolveCanonicalAliases(project, { fields, ...options });
  const expected = resolveCanonicalAliases(project, {
    fields, ...options, semanticScanIgnores: referenceIgnores(),
  });
  assert.deepEqual(actual, expected);
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
  return actual;
}

const base = {
  chain: "base",
  source: "dexscreener",
  sourceTimestamp: "2026-10-18T10:00:00.000Z",
  tokenAddress: "0x1111111111111111111111111111111111111111",
  poolAddress: "0x2222222222222222222222222222222222222222",
  raw: { liquidity: 0, market_cap: 1_000_000, hodlers: 40, buy_tax: 0, canSell: "unknown" },
  second: { liquidity: 500, market_cap: 2_000_000, sell_tax: false },
  odd: { "nested.liquidity": 45, "nested..market_cap": 10, "": { BUY_TAX: 0 } },
};

test("default ignore matcher preserves full winners, conflicts, provenance and audit byte order", () => {
  const project = structuredClone(base);
  for (const root of ignoredRoots) {
    project[root] = { liquidity: 9_000_000, nested: { market_cap: 8_000_000 } };
    project[`${root.toUpperCase()}.literal`] = { liquidity: 7_000_000 };
    project[`${root}Extra`] = { liquidity: 600 };
  }
  project[".engineResults"] = { liquidity: 12 };
  project["raw.engineName"] = { liquidity: 13 };
  project["scoreBrea\u212Adown"] = { liquidity: 14 };
  for (const sourceProvider of ["unknown", "dexscreener", "native rpc"]) {
    const result = assertDefaultEquivalent(project, { sourceProvider });
    assert.ok(result.conflicts.liquidityUsd.length > 0);
    assert.ok(result.audits.length > 0);
    assert.equal(result.resolved.tokenAddress, base.tokenAddress);
  }
});

test("default ignore matcher preserves caps, filtering order, unlimited scans and explicit aliases", () => {
  const project = { engineResults: { liquidity: 900 }, noise: {} };
  for (let index = 0; index < 1250; index += 1) project.noise[`field${index}`] = index;
  project.tail = { liquidity: 50 };
  for (const maximum of [undefined, 0, 1, 1.5, 10, 1200, 1251, -1, NaN, Infinity, "3"]) {
    assertDefaultEquivalent(project, { semanticScanMaxFields: maximum });
  }
  assert.equal(resolveCanonicalAliases(project, { fields: ["liquidityUsd"] }).resolved.liquidityUsd, null);
  assert.equal(resolveCanonicalAliases(project, { fields: ["liquidityUsd"], semanticScanMaxFields: 0 })
    .resolved.liquidityUsd, 50);
  project.liquidityUsd = 0;
  assert.equal(assertDefaultEquivalent(project, { semanticScanMaxFields: 1 }).resolved.liquidityUsd, 0);
});

test("default ignore matcher preserves false, zero, unknown, missing and protected identity semantics", () => {
  for (const project of [
    {},
    { chain: "base", liquidityUsd: 0, sellRestricted: false, buyTaxPct: 0 },
    { chain: "solana", raw: { liquidity: null, buy_tax: "unknown", holders: [] } },
    { chain: "base", priceUsd: NaN, volume24h: Infinity, liquidityUsd: "", holders: undefined },
    { ...base, poolAddress: base.tokenAddress },
    { chain: "base", raw: { kontractt: base.tokenAddress } },
  ]) {
    for (const disableSemanticScan of [false, true]) assertDefaultEquivalent(project, { disableSemanticScan });
  }
  const result = assertDefaultEquivalent({ chain: "base", liquidityUsd: 0, sellRestricted: false });
  assert.equal(result.resolved.liquidityUsd, 0);
  assert.equal(result.resolved.sellRestricted, false);
  assert.equal(result.resolved.priceUsd, null);
  assert.equal(assertDefaultEquivalent({ ...base, poolAddress: base.tokenAddress }).resolved.tokenAddress, null);
});

test("default ignore matcher never traverses excluded diagnostic subtrees", () => {
  let reads = 0;
  const diagnostic = {};
  Object.defineProperty(diagnostic, "liquidity", { enumerable: true, get() { reads += 1; return 1000; } });
  const project = { chain: "base", liquidityUsd: 0 };
  for (const root of ignoredRoots) project[root] = diagnostic;
  assert.equal(resolveCanonicalAliases(project, { fields: ["liquidityUsd"] }).resolved.liquidityUsd, 0);
  assert.equal(reads, 0);
});

function flattenedPaths(object, prefix = "", output = []) {
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flattenedPaths(value, path, output);
    else output.push(path);
  }
  return output;
}

test("custom regex flags, lastIndex, call order and short-circuit behavior remain caller-owned", () => {
  const project = { raw: { liquidity: 10, holders: 20, empty: null }, RAW: { liquidity: 30 },
    modelDiagnostics: { liquidity: 40 }, tail: { liquidity: 50 } };
  const paths = flattenedPaths(project);
  const cases = [
    () => [/^raw\./g, /liquidity$/g],
    () => [/^raw\./y, /^RAW\./iy],
    () => [/^RAW\..+$/im, /holders$/msu],
    () => [],
  ];
  for (const make of cases) {
    const actualPatterns = make(), referencePatterns = make();
    for (const patterns of [actualPatterns, referencePatterns]) {
      patterns.forEach((pattern, index) => { pattern.lastIndex = index + 1; });
    }
    for (const maximum of [1, 0, 3]) {
      const expectedCalls = [], actualCalls = [];
      paths.filter((path) => !referencePatterns.some((pattern, index) => {
        const before = pattern.lastIndex;
        const result = pattern.test(path);
        expectedCalls.push({ index, path, before, after: pattern.lastIndex, result, flags: pattern.flags });
        return result;
      }));
      actualPatterns.forEach((pattern, index) => {
        pattern.test = function (path) {
          const before = this.lastIndex;
          const result = RegExp.prototype.test.call(this, path);
          actualCalls.push({ index, path, before, after: this.lastIndex, result, flags: this.flags });
          return result;
        };
      });
      resolveCanonicalAliases(project, {
        fields: ["liquidityUsd", "holderCount"],
        semanticScanIgnores: actualPatterns,
        semanticScanMaxFields: maximum,
      });
      assert.deepEqual(actualCalls, expectedCalls);
      assert.deepEqual(actualPatterns.map((pattern) => pattern.lastIndex),
        referencePatterns.map((pattern) => pattern.lastIndex));
    }
  }
});

test("custom ignores remain a replacement, retain test objects, and are not called with scanning disabled", () => {
  const project = { modelDiagnostics: { liquidity: 123 } };
  assert.equal(resolveCanonicalAliases(project, { fields: ["liquidityUsd"] }).resolved.liquidityUsd, null);
  assert.equal(resolveCanonicalAliases(project, { fields: ["liquidityUsd"], semanticScanIgnores: [] })
    .resolved.liquidityUsd, 123);
  const calls = [];
  const custom = { test(path) { calls.push(path); return path.startsWith("modelDiagnostics."); } };
  assert.equal(resolveCanonicalAliases(project, { fields: ["liquidityUsd"], semanticScanIgnores: [custom] })
    .resolved.liquidityUsd, null);
  assert.deepEqual(calls, ["modelDiagnostics.liquidity"]);
  const pattern = /liquidity/gy;
  pattern.lastIndex = 3;
  pattern.test = () => { throw new Error("Disabled semantic scan must not test ignore patterns"); };
  resolveCanonicalAliases(project, { fields: ["liquidityUsd"], semanticScanIgnores: [pattern], disableSemanticScan: true });
  assert.equal(pattern.lastIndex, 3);
});

test("mutable public alias vocabulary and changed observations remain visible after matcher warmup", () => {
  const project = { chain: "base", customObservation: { amount: 0 } };
  const options = { fields: ["liquidityUsd"], semanticScanMaxFields: 1 };
  assert.equal(resolveCanonicalAliases(project, options).resolved.liquidityUsd, null);
  const aliases = aliasesForCanonicalField("liquidityUsd");
  aliases.push("customObservation.amount");
  try {
    assert.equal(assertDefaultEquivalent(project, options).resolved.liquidityUsd, 0);
    project.customObservation.amount = 75;
    assert.equal(assertDefaultEquivalent(project, options).resolved.liquidityUsd, 75);
  } finally { aliases.pop(); }
  assert.equal(resolveCanonicalAliases(project, options).resolved.liquidityUsd, null);
});
