import test from "node:test";
import assert from "node:assert/strict";
import { collectAliasCandidates, resolveCanonicalAliases } from "../src/data/canonicalAliasResolver.js";
import { CANONICAL_FIELD_ALIAS_REGISTRY, EXTENDED_CANONICAL_FIELD_ALIAS_REGISTRY, canonicalFieldForAlias } from "../src/data/canonicalFieldAliasRegistry.js";
import { getEngineContracts } from "../src/kernel/engineContractManifest.js";
import { resolveFieldConflict } from "../src/data/fieldConflictResolver.js";
import { PROVIDER_VOCABULARY } from "../src/data/providerVocabularyRegistry.js";
import { performance } from "node:perf_hooks";

function flatten(object, prefix = "", result = []) {
  for (const [key, value] of Object.entries(object)) {
    const sourcePath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, sourcePath, result);
    else result.push({sourcePath, sourceField: key, rawValue: value});
  }
  return result;
}

// Standalone collection retains the original full-scan implementation.
function referenceResolution(project, options) {
  const semanticFields = options.disableSemanticScan ? [] : flatten(project);
  const maximum = options.semanticScanMaxFields ?? 1200;
  const fields = maximum ? semanticFields.slice(0, maximum) : semanticFields;
  const resolved = {}, provenance = {}, conflicts = {}, audits = [];
  for (const field of options.fields) {
    const candidates = collectAliasCandidates(project, field, {...options, _semanticFields: fields});
    const {winner, conflicts: fieldConflicts, status} = resolveFieldConflict(candidates);
    if (winner) {
      resolved[field] = winner.canonicalValue;
      provenance[field] = {...winner, conflicts: fieldConflicts, conflictStatus: status};
      audits.push({...winner, conflicts: fieldConflicts, conflictStatus: status});
      if (fieldConflicts.length) conflicts[field] = fieldConflicts;
    } else if (!options.shallow) resolved[field] = null;
  }
  if (resolved.tokenAddress && resolved.tokenAddress === resolved.poolAddress) {
    conflicts.tokenAddress = [...(conflicts.tokenAddress || []), {canonicalField: "tokenAddress",
      canonicalValue: resolved.tokenAddress, reason: "Token address equals pool address."}];
    resolved.tokenAddress = null;
    if (provenance.tokenAddress) provenance.tokenAddress.validationStatus = "INVALID";
  }
  return {resolved, provenance, conflicts, audits, aliasResolutionSummary: {
    requestedFields: options.fields.length,
    resolvedFields: Object.values(resolved).filter(value => value !== null && value !== undefined && value !== "").length,
    conflictFields: Object.keys(conflicts),
  }};
}

const allFields = [...new Set([...Object.keys(CANONICAL_FIELD_ALIAS_REGISTRY),
  ...Object.keys(EXTENDED_CANONICAL_FIELD_ALIAS_REGISTRY), ...getEngineContracts().flatMap(contract =>
    [...(contract.inputContract?.requiredAny || []).flat(), ...(contract.inputContract?.optional || [])]
      .map(field => canonicalFieldForAlias(field) || field)), "unrecognizedEvidence"] )];
const base = {
  chain: "base", source: "dexscreener", sourceTimestamp: "2026-10-18T10:00:00.000Z",
  contractAddress: "0x1111111111111111111111111111111111111111",
  poolAddress: "0x2222222222222222222222222222222222222222",
  raw: {"MARKET-CAP": 1500000, "liqudity": 250000, "volme": 400000,
    "hodlers": 450, "buyors": 80, "buy_tax": "1.5%", "sell_tax": null,
    "market_pair": "TOKEN/USDC", "txns": {h24: {buys: 25, sells: 11}}},
  second: {"market_cap": 1700000, "liquidity": 260000, "BUY_TAX": 0, "holders": ["wallet"]},
  unknown: {"contrct": "0x3333333333333333333333333333333333333333", "canSell": "unknown"},
  fieldProvenance: {"raw.liqudity": {source: "blockscout", sourceTimestamp: "2026-10-18T09:59:00.000Z"}},
};

test("semantic index preserves complete legacy winners, conflicts, ordering and provenance", () => {
  for (const sourceProvider of ["unknown", "dexscreener", "native rpc", "unrecognized-provider"]) {
    for (const semanticScanMaxFields of [0, 1, 8, 1200]) {
      const options = {fields: allFields, sourceProvider, semanticScanIgnores: [], semanticScanMaxFields};
      assert.deepEqual(resolveCanonicalAliases(base, options), referenceResolution(base, options));
    }
  }
});

test("semantic index preserves missing, false, zero and disabled-scan evidence", () => {
  for (const project of [{}, {chain: "solana", value: null},
    {...base, raw: {"buy_tax": false, "liquidity": 0, holders: [], nested: {buy_tax: "unknown"}}}]) {
    for (const disableSemanticScan of [false, true]) {
      const options = {fields: allFields, semanticScanIgnores: [], disableSemanticScan};
      assert.deepEqual(resolveCanonicalAliases(project, options), referenceResolution(project, options));
    }
  }
});

test("wide final-audit shapes retain every legacy decision with indexed matching", (t) => {
  const project = {...base, research: {}};
  for (let i = 0; i < 1100; i++) project.research[`derivedField${i}`] = i;
  const options = {fields: allFields, semanticScanIgnores: [], semanticScanMaxFields: 1200};
  const before = performance.now();
  const reference = referenceResolution(project, options);
  const referenceMs = performance.now() - before;
  const after = performance.now();
  const indexed = resolveCanonicalAliases(project, options);
  const indexedMs = performance.now() - after;
  assert.deepEqual(indexed, reference);
  t.diagnostic(JSON.stringify({semanticFields: flatten(project).length, canonicalFields: allFields.length,
    referenceMs, indexedMs}));
});

test("semantic index keeps token-equals-pool rejection and never accepts fuzzy identities", () => {
  const project = {...base, poolAddress: base.contractAddress};
  const options = {fields: ["chain", "tokenAddress", "poolAddress"], semanticScanIgnores: []};
  const result = resolveCanonicalAliases(project, options);
  assert.deepEqual(result, referenceResolution(project, options));
  assert.equal(result.resolved.tokenAddress, null);
  const unknown = resolveCanonicalAliases({chain: "base", raw: {
    kontractt: base.contractAddress}}, options);
  assert.equal(unknown.resolved.tokenAddress, null);
});

test("semantic index preserves default ignore patterns and explicit aliases beyond scan cap", () => {
  const options = {fields: ["liquidityUsd"], semanticScanMaxFields: 1};
  const project = {noise: {ignored: null}, engineDataReadiness: {liquidity: 900000},
    engineResults: {liquidity: 800000}, raw: {liqudity: 700000}, liquidityUsd: 25};
  const result = resolveCanonicalAliases(project, options);
  assert.equal(result.resolved.liquidityUsd, 25);
  assert.equal(result.provenance.liquidityUsd.sourcePath, "liquidityUsd");
  const missing = resolveCanonicalAliases({engineDataReadiness: {liquidity: 900000},
    engineResults: {liquidity: 800000}}, options);
  assert.equal(missing.resolved.liquidityUsd, null);
});

test("semantic index retains literal dotted keys and empty path components", () => {
  const project = {chain: "base", source: "unknown", raw: {
    "nested.liquidity": 45, "nested.market_cap": 250, "": {"BUY_TAX": 0},
    "holders.": 50, "metrics..price_usd": 1.5,
  }};
  const options = {fields: allFields, semanticScanIgnores: []};
  assert.deepEqual(resolveCanonicalAliases(project, options), referenceResolution(project, options));
  assert.equal(resolveCanonicalAliases(project, options).resolved.liquidityUsd, 45);
});

test("provider memoization cannot retain old provenance or mutable vocabulary between resolutions", () => {
  const options = {fields: ["liquidityUsd", "circulatingMarketCapUsd"], semanticScanIgnores: []};
  const project = {chain: "base", source: "unknown", raw: {liquidity: 25, market_cap: 100},
    fieldProvenance: {"raw.liquidity": {source: "local-observation-provider"}}};
  const first = resolveCanonicalAliases(project, options);
  assert.equal(first.provenance.liquidityUsd.sourceProvider, "local-observation-provider");
  const aliases = PROVIDER_VOCABULARY.blockscout.aliases;
  aliases.push("local-observation-provider");
  try {
    const second = resolveCanonicalAliases(project, options);
    assert.deepEqual(second, referenceResolution(project, options));
    assert.equal(second.provenance.liquidityUsd.sourceProvider, "blockscout");
    project.fieldProvenance["raw.liquidity"].source = "goplus";
    assert.equal(resolveCanonicalAliases(project, options).provenance.liquidityUsd.sourceProvider, "goplus");
  } finally { aliases.pop(); }
  assert.equal(resolveCanonicalAliases({...project, fieldProvenance: {
    "raw.liquidity": {source: "local-observation-provider"}}}, options).provenance.liquidityUsd.sourceProvider,
  "local-observation-provider");
});
