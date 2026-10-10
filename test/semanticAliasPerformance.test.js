import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAliasText, compactAliasText, fieldNameFromPath } from "../src/data/semanticAliasNormalizer.js";

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
