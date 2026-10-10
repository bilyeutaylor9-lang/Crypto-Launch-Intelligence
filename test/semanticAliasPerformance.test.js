import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAliasText, compactAliasText, fieldNameFromPath } from "../src/data/semanticAliasNormalizer.js";
import { collectAliasCandidates } from "../src/data/canonicalAliasResolver.js";
import { aliasesForCanonicalField } from "../src/data/canonicalFieldAliasRegistry.js";

function originalNormalization(value = "") {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase()
    .replace(/[._/:-]+/g, " ").replace(/[$,()[\]{}]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

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
