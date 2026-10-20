import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAliasText, compactAliasText, fieldNameFromPath, fuzzyAliasMatch, semanticAliasTermsForField } from "../src/data/semanticAliasNormalizer.js";
import { collectAliasCandidates } from "../src/data/canonicalAliasResolver.js";
import { aliasesForCanonicalField } from "../src/data/canonicalFieldAliasRegistry.js";

function originalNormalization(value = "") {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase()
    .replace(/[._/:-]+/g, " ").replace(/[$,()[\]{}]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

function originalFuzzyMatch(value, field) {
  if (["symbol", "tokenAddress", "poolAddress", "chain", "projectId", "marketPair",
    "transactionHash", "chainId", "contractId"].includes(field)) {
    return { matched: false, reason: "identity-critical-fuzzy-disabled" };
  }
  const source = compactAliasText(value);
  const terms = semanticAliasTermsForField(field);
  if (!source || !terms.length) return { matched: false, reason: "no-fuzzy-terms" };
  for (const term of terms) {
    const target = compactAliasText(term);
    if (source === target) return { matched: true, confidenceType: "SEMANTIC_ALIAS", matchedTerm: term };
    let distance;
    if (!source || !target) distance = Math.max(source.length, target.length);
    else if (Math.abs(source.length - target.length) > 3) distance = 99;
    else {
      let previous = Array.from({ length: target.length + 1 }, (_, i) => i);
      for (let i = 1; i <= source.length; i++) {
        const current = [i];
        for (let j = 1; j <= target.length; j++) {
          current[j] = source[i - 1] === target[j - 1] ? previous[j - 1] :
            Math.min(previous[j - 1] + 1, previous[j] + 1, current[j - 1] + 1);
        }
        previous = current;
      }
      distance = previous[target.length];
    }
    if (distance > 0 && distance <= (target.length <= 5 ? 1 : 2)) {
      return { matched: true, confidenceType: "FUZZY_ALIAS", matchedTerm: term, distance };
    }
  }
  return { matched: false, reason: "no-safe-fuzzy-match" };
}

test("cached fuzzy names preserve the original matcher and protected identities", () => {
  const fields = ["liquidityUsd", "circulatingMarketCapUsd", "volume24hUsd", "uniqueBuyers24h",
    "buyTaxPct", "sellTaxPct", "holderCount", "symbol", "chain", "tokenAddress", "poolAddress",
    "projectId", "marketPair", "transactionHash", "chainId", "contractId", "quoteAsset", "notAField"];
  const names = [undefined, null, "", "pipelineScore", "engineVersion", "BUY-TAX", "x".repeat(2048)];
  for (const field of fields) {
    for (const term of semanticAliasTermsForField(field)) names.push(term, term.slice(1), `${term}x`);
  }
  for (let pass = 0; pass < 2; pass++) {
    for (const field of fields) {
      for (const name of names) assert.deepEqual(fuzzyAliasMatch(name, field), originalFuzzyMatch(name, field));
    }
  }
});

test("fuzzy metadata is caller-isolated and vocabulary changes invalidate cached matches", () => {
  const first = fuzzyAliasMatch("liquidity", "liquidityUsd");
  first.matched = false;
  assert.equal(fuzzyAliasMatch("liquidity", "liquidityUsd").matched, true);
  const terms = semanticAliasTermsForField("liquidityUsd");
  const original = [...terms];
  const name = "previouslyunrecognizedfieldlabel";
  assert.equal(fuzzyAliasMatch(name, "liquidityUsd").matched, false);
  try {
    terms.push(name);
    assert.deepEqual(fuzzyAliasMatch(name, "liquidityUsd"), originalFuzzyMatch(name, "liquidityUsd"));
  } finally {
    terms.splice(0, terms.length, ...original);
  }
  assert.equal(fuzzyAliasMatch(name, "liquidityUsd").matched, false);
  let nameValue = "liquidity";
  const dynamic = { toString: () => nameValue };
  assert.equal(fuzzyAliasMatch(dynamic, "liquidityUsd").matched, true);
  nameValue = name;
  assert.equal(fuzzyAliasMatch(dynamic, "liquidityUsd").matched, false);
  for (let i = 0; i < 4200; i++) fuzzyAliasMatch(`unrecognized_field_${i}`, "liquidityUsd");
  assert.deepEqual(fuzzyAliasMatch("liquidity", "liquidityUsd"), originalFuzzyMatch("liquidity", "liquidityUsd"));
});

test("cached alias transforms preserve normalization and path semantics", () => {
  const values = [undefined, null, false, 0, 12, "", "...", " RAW.buy_tax ",
    "USDC.e / ETH", "\uFF35\uFF33\uFF24\uFF23", "nested..holders[0].address", "x".repeat(2048)];
  for (let pass = 0; pass < 2; pass += 1) {
    for (const value of values) {
      const normalized = originalNormalization(value);
      assert.equal(normalizeAliasText(value), normalized);
      assert.equal(compactAliasText(value), normalized.replace(/[^a-z0-9]+/g, ""));
      const path = String(value || "");
      assert.equal(fieldNameFromPath(value), path.split(".").filter(Boolean).at(-1) || path);
    }
  }
});

test("indexed alias comparisons preserve exact, structural and punctuation matching", () => {
  const aliases = aliasesForCanonicalField("circulatingMarketCapUsd");
  const comparable = (value) => String(value || "").replace(/[_\-\s]+/g, "").toLowerCase();
  const paths = [...aliases, "nested.MARKET_CAP", "MARKET-CAP", "market_cap", "metrics.market_cap_usd"];
  for (const provider of ["unknown", "dexscreener"]) {
    const records = collectAliasCandidates({}, "circulatingMarketCapUsd", {
      sourceProvider: provider, resolvedChain: "base",
      _semanticFields: paths.map((sourcePath) => ({ sourcePath, sourceField: fieldNameFromPath(sourcePath), rawValue: 123 })),
    });
    for (const sourcePath of paths) {
      const exact = aliases.some((alias) => alias === sourcePath);
      const explicit = aliases.some((alias) => comparable(alias) === comparable(sourcePath) ||
        comparable(alias) === comparable(fieldNameFromPath(sourcePath)));
      const expected = exact && sourcePath.includes(".") ? "STRUCTURAL_ALIAS" : exact ?
        provider === "unknown" ? "EXACT_ALIAS" : "PROVIDER_ALIAS" : explicit ?
          sourcePath.includes(".") ? "STRUCTURAL_ALIAS" : "EXACT_ALIAS" : null;
      const record = records.find((item) => item.sourcePath === sourcePath);
      assert.ok(record);
      assert.equal(record.normalizationRule.split(":")[0], expected);
      assert.equal(record.canonicalValue, 123);
    }
  }
});

test("alias cache eviction cannot change results or cache mutable input objects", () => {
  for (let index = 0; index < 8200; index += 1) {
    const value = `provider.${index}.Buy-Tax`;
    assert.equal(normalizeAliasText(value), originalNormalization(value));
    assert.equal(fieldNameFromPath(value), "Buy-Tax");
  }
  let text = "BUY_TAX";
  const dynamic = { toString: () => text };
  assert.equal(normalizeAliasText(dynamic), "buy tax");
  text = "SELL_TAX";
  assert.equal(normalizeAliasText(dynamic), "sell tax");
  assert.equal(normalizeAliasText(" RAW.buy_tax "), "raw buy tax");
});
