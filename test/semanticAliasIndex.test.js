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

const legacyDefaultIgnores = [
  /^engineResults(\.|$)/i, /^fieldProvenance(\.|$)/i, /^canonicalAliasProvenance(\.|$)/i,
  /^aliasResolutionAudit(\.|$)/i, /^aliasResolutionConflicts(\.|$)/i,
  /^canonicalAliasConflicts(\.|$)/i, /^canonicalAliases(\.|$)/i,
  /^engineDataContractHealth(\.|$)/i, /^engineDataReadiness(\.|$)/i,
  /^dataStarvation(\.|$)/i, /^targetedEnrichmentPlan(\.|$)/i,
  /^starvationRecoveryPlan(\.|$)/i, /^valueOfInformationItems(\.|$)/i,
  /^(?:baselineDeviation|baselineDeviationVector|modelDiagnostics|scoreBreakdown|dataConfidenceBreakdown)(\.|$)/i,
  /^engineDataReadiness\.engines\.\d+\.(score|status|warnings|engineName|engineVersion|criticality|confidence|evidenceCoverage|dataFreshness|warningCount)$/i,
  /\.(engineName|engineVersion|criticality|warningCount)$/i,
];

test("default semantic scans never traverse already-ignored metadata branches", () => {
  let visited = 0;
  const metadata = {};
  for (let i = 0; i < 5000; i++) Object.defineProperty(metadata, `ignored${i}`, {
    enumerable: true, get() { visited++; return i; },
  });
  const result = resolveCanonicalAliases({...base, engineResults: metadata}, {fields: allFields});
  assert.equal(visited, 0);
  assert.equal(result.resolved.tokenAddress, base.contractAddress);
});

test("metadata pruning preserves default legacy matching, ordering and scan caps", () => {
  const project = {...base};
  const ignored = ["engineResults", "fieldProvenance", "canonicalAliasProvenance", "aliasResolutionAudit",
    "aliasResolutionConflicts", "canonicalAliasConflicts", "canonicalAliases", "engineDataContractHealth",
    "engineDataReadiness", "dataStarvation", "targetedEnrichmentPlan", "starvationRecoveryPlan",
    "valueOfInformationItems", "baselineDeviation", "baselineDeviationVector", "modelDiagnostics",
    "scoreBreakdown", "dataConfidenceBreakdown"];
  for (const [index, root] of ignored.entries()) {
    project[root] = {liquidity: 9_000_000 + index, nested: {market_cap: 20_000_000}};
    project[root.toUpperCase() + ".literal"] = {liquidity: 100_000_000};
    project[root + "Extra"] = {liquidity: index + 20};
  }
  project[".engineResults"] = {liquidity: 50};
  project["raw.engineName"] = {liquidity: 60};
  project["scoreBrea\u212Adown"] = {liquidity: 777};
  for (const maximum of [0, 1, 10, 1200]) {
    const options = {fields: allFields, semanticScanMaxFields: maximum};
    assert.deepEqual(resolveCanonicalAliases(project, options), resolveCanonicalAliases(project, {
      ...options, semanticScanIgnores: legacyDefaultIgnores,
    }));
  }
});

test("custom semantic ignore policies retain their original traversal behavior", () => {
  const project = {chain: "base", modelDiagnostics: {liquidity: 1234}};
  assert.equal(resolveCanonicalAliases(project, {fields: ["liquidityUsd"]}).resolved.liquidityUsd, null);
  assert.equal(resolveCanonicalAliases(project, {fields: ["liquidityUsd"], semanticScanIgnores: []})
    .resolved.liquidityUsd, 1234);
});

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

test("one multi-field resolution looks up its chain context only once", () => {
  let reads = 0;
  const project = {
    source: "dexscreener", priceUsd: 1, liquidityUsd: 25000, volume24h: 50000,
    contractAddress: base.contractAddress, poolAddress: base.poolAddress,
  };
  Object.defineProperty(project, "network", {
    enumerable: true,
    get() { reads += 1; return "base"; },
  });
  const options = {fields: ["priceUsd", "liquidityUsd", "volume24hUsd", "tokenAddress", "poolAddress"],
    disableSemanticScan: true};
  const result = resolveCanonicalAliases(project, options);
  assert.equal(reads, 1, "Chain resolution must be call-local rather than repeated for every field");
  assert.deepEqual(result, referenceResolution({...project, network: "base"}, options));
  assert.equal(result.resolved.tokenAddress, base.contractAddress);
});

test("chain context reuse never survives a changed project or provenance", () => {
  const project = {...base, network: "base", fieldProvenance: {network: {source: "native rpc"}}};
  delete project.chain;
  const options = {fields: ["liquidityUsd", "tokenAddress", "chain", "poolAddress"], semanticScanIgnores: []};
  assert.deepEqual(resolveCanonicalAliases(project, options), referenceResolution(project, options));
  project.network = "solana";
  project.fieldProvenance.network = {source: "goplus", sourceTimestamp: "2026-10-18T11:00:00.000Z"};
  const changed = resolveCanonicalAliases(project, options);
  assert.deepEqual(changed, referenceResolution(project, options));
  assert.equal(changed.resolved.chain, "solana");
  assert.equal(changed.resolved.tokenAddress, null);
  assert.equal(changed.provenance.chain.sourceProvider, "goplus");
});

test("an explicit chain context is not fetched again from the project", () => {
  const project = {liquidityUsd: 25, contractAddress: base.contractAddress};
  Object.defineProperty(project, "network", {enumerable: true,
    get() { throw new Error("Explicit chain context must not trigger chain lookup"); }});
  const options = {fields: ["tokenAddress", "liquidityUsd"], resolvedChain: "base", disableSemanticScan: true};
  assert.deepEqual(resolveCanonicalAliases(project, options), referenceResolution(project, options));
});

test("an explicitly null context keeps the existing normalization and conflict behavior", () => {
  const options = {fields: allFields, resolvedChain: null, semanticScanIgnores: []};
  for (const project of [base, {...base, chain: "solana"}, {network: "unrecognized-chain"}, {}]) {
    assert.deepEqual(resolveCanonicalAliases(project, options), referenceResolution(project, options));
  }
});
