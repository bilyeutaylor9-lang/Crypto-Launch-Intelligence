import test from "node:test";
import assert from "node:assert/strict";
import { collectAliasCandidates, getPath, resolveCanonicalAliases } from "../src/data/canonicalAliasResolver.js";
import { aliasesForCanonicalField } from "../src/data/canonicalFieldAliasRegistry.js";

function referencePath(object = {}, path = "") {
  return String(path || "").split(".").filter(Boolean)
    .reduce((value, part) => value && Object.prototype.hasOwnProperty.call(value, part) ? value[part] : undefined, object);
}

test("compiled lookup paths preserve own-property, empty-component and primitive behavior", () => {
  const inherited = Object.create({ inherited: { value: 99 } });
  inherited.own = { value: 0, no: false, empty: "", absent: null, array: ["first", "second"] };
  for (const path of ["", null, undefined, 0, false, ".own..value.", "own.no", "own.empty", "own.absent",
    "own.array.0", "own.array.1", "own.absent.value", "inherited.value", "toString", "missing.value"])
    assert.equal(getPath(inherited, path), referencePath(inherited, path), String(path));
  for (const value of [null, false, 0, NaN, "text", [], {}]) {
    for (const path of ["", "length", "0", "missing.value"])
      assert.equal(getPath(value, path), referencePath(value, path));
  }
});

test("a reused path reads current values and getters rather than retaining evidence", () => {
  let reads = 0;
  const project = { get nested() { return { value: ++reads }; } };
  assert.equal(getPath(project, "nested.value"), 1);
  assert.equal(getPath(project, "nested.value"), 2);
  const mutable = { nested: { value: false } };
  assert.equal(getPath(mutable, "nested.value"), false);
  mutable.nested.value = 0;
  assert.equal(getPath(mutable, "nested.value"), 0);
  mutable.nested = { value: null };
  assert.equal(getPath(mutable, "nested.value"), null);
  delete mutable.nested;
  assert.equal(getPath(mutable, "nested.value"), undefined);
});

test("mutable path objects are converted on every call", () => {
  let current = "left.value";
  let conversions = 0;
  const path = { toString() { conversions++; return current; } };
  const project = { left: { value: 10 }, right: { value: 20 } };
  assert.equal(getPath(project, path), 10);
  current = "right.value";
  assert.equal(getPath(project, path), 20);
  assert.equal(conversions, 2);
});

test("lookup churn and long provider keys cannot change later reads", () => {
  const project = { nested: { value: 1 } };
  assert.equal(getPath(project, "nested.value"), 1);
  for (let index = 0; index < 5000; index++) {
    const key = "probe_" + index;
    project[key] = index;
    assert.equal(getPath(project, key), index);
  }
  const longKey = "provider-key-".repeat(100);
  project[longKey] = { value: 3 };
  assert.equal(getPath(project, longKey + ".value"), 3);
  project[longKey].value = 4;
  assert.equal(getPath(project, longKey + ".value"), 4);
  project.nested.value = 9;
  assert.equal(getPath(project, "nested.value"), 9);
});

test("alias lookup respects edits to the public vocabulary array", () => {
  const aliases = aliasesForCanonicalField("liquidityUsd");
  const original = [...aliases];
  const project = { metadataProbeAlpha: 345, metadataProbeBeta: 789 };
  const resolve = () => resolveCanonicalAliases(project, { fields: ["liquidityUsd"], disableSemanticScan: true });
  try {
    assert.equal(resolve().resolved.liquidityUsd, null);
    aliases.push("metadataProbeAlpha");
    assert.equal(resolve().resolved.liquidityUsd, 345);
    aliases[aliases.length - 1] = "metadataProbeBeta";
    assert.equal(resolve().resolved.liquidityUsd, 789);
    aliases.splice(aliases.length - 1, 1);
    assert.equal(resolve().resolved.liquidityUsd, null);
  } finally { aliases.splice(0, aliases.length, ...original); }
});

test("vocabulary reordering preserves the existing conflict winner order", () => {
  const aliases = aliasesForCanonicalField("priceUsd");
  const original = [...aliases];
  const project = { metadataProbeAlpha: 11, metadataProbeBeta: 22 };
  const resolve = () => resolveCanonicalAliases(project, { fields: ["priceUsd"], disableSemanticScan: true });
  try {
    aliases.push("metadataProbeAlpha", "metadataProbeBeta");
    assert.equal(resolve().resolved.priceUsd, 11);
    aliases.splice(aliases.length - 2, 2, "metadataProbeBeta", "metadataProbeAlpha");
    assert.equal(resolve().resolved.priceUsd, 22);
  } finally { aliases.splice(0, aliases.length, ...original); }
});

test("deleting an alias leaves no stale semantic match", () => {
  const aliases = aliasesForCanonicalField("priceUsd");
  const original = [...aliases];
  const project = { metadataProbeAlpha: 11 };
  const collect = () => collectAliasCandidates(project, "priceUsd");
  try {
    aliases.push("metadataProbeAlpha");
    assert.equal(collect().length, 1);
    delete aliases[aliases.length - 1];
    assert.equal(collect().length, 0);
    aliases[aliases.length - 1] = "metadataProbeAlpha";
    assert.equal(collect().length, 1);
  } finally { aliases.splice(0, aliases.length, ...original); }
});

test("accessor mutations keep the original per-resolution alias read sequence", () => {
  const aliases = aliasesForCanonicalField("priceUsd");
  const original = [...aliases];
  const descriptor = Object.getOwnPropertyDescriptor(aliases, "0");
  let reads = 0;
  try {
    aliases.push("opaqueEvidence");
    Object.defineProperty(aliases, "0", { configurable: true, enumerable: true, get() {
      if (++reads === 4) aliases[aliases.length - 1] = "otherEvidence";
      return "priceUsd";
    } });
    const project = { opaqueEvidence: 11 };
    assert.deepEqual(Array.from({ length: 3 }, () => collectAliasCandidates(project, "priceUsd").length), [1, 0, 0]);
  } finally {
    Object.defineProperty(aliases, "0", descriptor);
    aliases.splice(0, aliases.length, ...original);
  }
});

test("repeated resolutions retain updated values, provider attribution and source clocks", () => {
  const project = { priceUsd: 1, priceUsdTimestamp: "2026-10-22T19:00:00Z",
    fieldProvenance: { priceUsd: { source: "dexscreener" } } };
  const options = { fields: ["priceUsd"], disableSemanticScan: true };
  const first = resolveCanonicalAliases(project, options);
  project.priceUsd = 2;
  project.priceUsdTimestamp = "2026-10-22T20:00:00Z";
  project.fieldProvenance.priceUsd.source = "coingecko";
  const second = resolveCanonicalAliases(project, options);
  assert.equal(first.resolved.priceUsd, 1);
  assert.equal(second.resolved.priceUsd, 2);
  assert.equal(first.provenance.priceUsd.sourceTimestamp, "2026-10-22T19:00:00Z");
  assert.equal(second.provenance.priceUsd.sourceTimestamp, "2026-10-22T20:00:00Z");
  assert.equal(first.provenance.priceUsd.sourceProvider, "dexscreener");
  assert.equal(second.provenance.priceUsd.sourceProvider, "coingecko");
});
