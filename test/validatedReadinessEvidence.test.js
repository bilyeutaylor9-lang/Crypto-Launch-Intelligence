import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeEngineDataReadiness,
  evaluateEngineDataReadiness,
} from "../src/engines/engineDataReadinessEngine.js";
import { analyzeDataStarvationRootCause } from "../src/engines/dataStarvationRootCauseEngine.js";

const token = "0x1111111111111111111111111111111111111111";
const pool = "0x2222222222222222222222222222222222222222";
const base = { chain: "base", tokenAddress: token, poolAddress: pool };
const contractFor = (field, optional = []) => ({
  id: "validatedEvidence",
  phase: "safety",
  affectsFinalDecision: true,
  canBlockCandidate: true,
  inputContract: { requiredAny: [[field]], optional },
});

for (const [field, value] of [
  ["honeypotDetected", "UNKNOWN"],
  ["honeypotDetected", "not_tested"],
  ["sellRestricted", "UNKNOWN"],
  ["buyTaxPct", "UNKNOWN"],
  ["liquidityUsd", "not available"],
  ["tokenAddress", "not-a-contract"],
]) {
  test(`rejected ${field}=${value} cannot satisfy a core readiness input`, () => {
    const project = { ...base, [field]: value };
    const before = structuredClone(project);
    const contract = contractFor(field);
    for (const disableSemanticScan of [false, true]) {
      const options = { contracts: [contract], disableSemanticScan };
      const ready = analyzeEngineDataReadiness(project, options);
      const missing = analyzeDataStarvationRootCause(project, options);
      assert.equal(ready.engineDataReadinessStatus, "CORE_DATA_STARVED");
      assert.equal(ready.engineDataReadiness.engines[0].requiredCoveragePct, 0);
      assert.equal(missing.coreDataStarved, true);
      assert.equal(missing.canonicalAliases[field], null);
      assert.ok(missing.coreMissingEvidence.some(item => item.canonicalField === field));
    }
    assert.equal(evaluateEngineDataReadiness(project, contract).status, "DATA_STARVED");
    assert.deepEqual(project, before);
  });
}

for (const [field, value] of [
  ["honeypotDetected", false],
  ["honeypotDetected", true],
  ["sellRestricted", false],
  ["buyTaxPct", 0],
  ["liquidityUsd", 0],
  ["buyTransactions24h", 0],
  ["tokenAddress", token],
]) {
  test(`validated ${field}=${value} remains observed, without implying a favorable result`, () => {
    const project = { ...base, [field]: value };
    const contract = contractFor(field);
    for (const disableSemanticScan of [false, true]) {
      const options = { contracts: [contract], disableSemanticScan };
      const ready = analyzeEngineDataReadiness(project, options);
      const missing = analyzeDataStarvationRootCause(project, options);
      assert.equal(ready.engineDataReadinessStatus, "CORE_READY");
      assert.equal(missing.coreDataStarved, false);
      assert.equal(missing.canonicalAliases[field], value);
      assert.equal(ready.fullyQualified, undefined);
      assert.equal(ready.executionProofVerified, undefined);
    }
    assert.equal(evaluateEngineDataReadiness(project, contract).status, "READY");
  });
}

test("metadata-only honeypot negatives remain rejected in required and optional coverage", () => {
  const project = { ...base, source: "blockscout", honeypotDetected: false, liquidityUsd: 0 };
  const required = contractFor("honeypotDetected");
  const optional = contractFor("liquidityUsd", ["honeypotDetected"]);
  for (const disableSemanticScan of [false, true]) {
    const options = { contracts: [required], disableSemanticScan };
    assert.equal(analyzeEngineDataReadiness(project, options).engineDataReadinessStatus, "CORE_DATA_STARVED");
    assert.equal(analyzeDataStarvationRootCause(project, options).coreDataStarved, true);
    const ready = analyzeEngineDataReadiness(project, { contracts: [optional], disableSemanticScan });
    assert.equal(ready.engineDataReadinessStatus, "CORE_READY");
    assert.equal(ready.engineDataReadiness.engines[0].optionalCoveragePct, 0);
    assert.deepEqual(ready.engineDataReadiness.engines[0].optionalMissing, ["honeypotDetected"]);
  }
});

test("rejected token-equals-pool identity cannot be counted from its raw field", () => {
  const project = { ...base, poolAddress: token };
  const contracts = [contractFor("tokenAddress"), { ...contractFor("poolAddress"), id: "poolEvidence" }];
  assert.equal(analyzeEngineDataReadiness(project, { contracts }).engineDataReadinessStatus, "CORE_DATA_STARVED");
  assert.equal(analyzeDataStarvationRootCause(project, { contracts }).coreDataStarved, true);
});

test("a validated alternative satisfies requiredAny while unknown alternatives stay missing", () => {
  const project = { ...base, honeypotDetected: "UNKNOWN", sellRestricted: false };
  const contract = contractFor("honeypotDetected");
  contract.inputContract.requiredAny[0].push("sellRestricted");
  const options = { contracts: [contract] };
  assert.equal(analyzeEngineDataReadiness(project, options).engineDataReadinessStatus, "CORE_READY");
  const missing = analyzeDataStarvationRootCause(project, options);
  assert.equal(missing.coreDataStarved, false);
  assert.equal(missing.canonicalAliases.honeypotDetected, null);
  assert.equal(missing.canonicalAliases.sellRestricted, false);
});

test("an explicit validated lookup cannot be overridden by a rejected raw field", () => {
  const contract = contractFor("honeypotDetected", ["sellRestricted"]);
  const ready = evaluateEngineDataReadiness(
    { honeypotDetected: "UNKNOWN", sellRestricted: "UNKNOWN" },
    contract,
    { lookupCanonicalValue: () => null }
  );
  assert.equal(ready.status, "DATA_STARVED");
  assert.equal(ready.optionalCoveragePct, 0);
});

test("changed custom contracts recompute the full identity validation field set", () => {
  const project = { ...base, poolAddress: token };
  const contracts = [contractFor("tokenAddress")];
  analyzeEngineDataReadiness(project, { contracts });
  contracts.push({ ...contractFor("poolAddress"), id: "poolEvidence" });
  const ready = analyzeEngineDataReadiness(project, { contracts });
  assert.equal(ready.engineDataReadinessStatus, "CORE_DATA_STARVED");
  assert.deepEqual(ready.engineDataReadiness.engines[0].missingRequiredGroups[0].canonicalFields, ["tokenAddress"]);
});

test("an explicit field subset cannot turn a fallback raw unknown into validated evidence", () => {
  const ready = analyzeEngineDataReadiness(
    { ...base, honeypotDetected: "UNKNOWN" },
    { contracts: [contractFor("honeypotDetected")], canonicalFields: ["chain"] }
  );
  assert.equal(ready.engineDataReadinessStatus, "CORE_DATA_STARVED");
});

for (const [field, value] of [["liquidityUsd", 0], ["sellRestricted", false], ["tokenAddress", token]]) {
  test(`canonical-only ${field}=${value} is revalidated rather than discarded`, () => {
    const project = { chain: "base", canonicalAliases: { [field]: value },
      canonicalAliasProvenance: { [field]: { sourceProvider: "dexscreener", sourceTimestamp: "2026-10-22T22:00:00Z" } } };
    const before = structuredClone(project), contract = contractFor(field);
    for (const disableSemanticScan of [false, true]) {
      const options = { contracts: [contract], disableSemanticScan };
      assert.equal(analyzeEngineDataReadiness(project, options).engineDataReadinessStatus, "CORE_READY");
      const root = analyzeDataStarvationRootCause(project, options);
      assert.equal(root.coreDataStarved, false);
      assert.equal(root.canonicalAliases[field], value);
      assert.equal(root.canonicalAliasProvenance[field].sourceTimestamp, project.canonicalAliasProvenance[field].sourceTimestamp);
    }
    assert.equal(evaluateEngineDataReadiness(project, contract).status, "READY");
    assert.deepEqual(project, before);
  });
}

for (const value of ["UNKNOWN", "not_tested"]) {
  test(`canonical-only safety value ${value} still fails normalization`, () => {
    const project = { ...base, canonicalAliases: { honeypotDetected: value } };
    const contracts = [contractFor("honeypotDetected")];
    assert.equal(analyzeEngineDataReadiness(project, { contracts }).engineDataReadinessStatus, "CORE_DATA_STARVED");
    assert.equal(analyzeDataStarvationRootCause(project, { contracts }).coreDataStarved, true);
  });
}

test("canonical-only values retain metadata provider rejection and joint address checks", () => {
  const metadata = { ...base, source: "dexscreener", canonicalAliases: { honeypotDetected: false },
    canonicalAliasProvenance: { honeypotDetected: { sourceProvider: "blockscout" } } };
  const contracts = [contractFor("honeypotDetected")];
  assert.equal(analyzeEngineDataReadiness(metadata, { contracts }).engineDataReadinessStatus, "CORE_DATA_STARVED");
  assert.equal(analyzeDataStarvationRootCause(metadata, { contracts }).coreDataStarved, true);
  const sameAddress = { chain: "base", canonicalAliases: { tokenAddress: token, poolAddress: token } };
  const identity = [contractFor("tokenAddress")];
  assert.equal(analyzeEngineDataReadiness(sameAddress, { contracts: identity }).engineDataReadinessStatus, "CORE_DATA_STARVED");
  assert.equal(analyzeDataStarvationRootCause(sameAddress, { contracts: identity }).coreDataStarved, true);
});

test("stored canonical observations cannot replace current raw values or rejected aliases", () => {
  for (const [raw, expected] of [[{ liquidityUsd: 0 }, "CORE_READY"], [{ liquidityUsd: "UNKNOWN" }, "CORE_DATA_STARVED"],
    [{ liquidity: "UNKNOWN" }, "CORE_DATA_STARVED"]]) {
    const project = { ...base, ...raw, canonicalAliases: { liquidityUsd: 50000 } };
    const contracts = [contractFor("liquidityUsd")];
    const ready = analyzeEngineDataReadiness(project, { contracts });
    assert.equal(ready.engineDataReadinessStatus, expected);
    assert.equal(analyzeDataStarvationRootCause(project, { contracts }).coreDataStarved, expected !== "CORE_READY");
  }
});

test("fresh semantic raw observations are not overridden by canonical-only fallback values", () => {
  const project = { ...base, reading: { liquidity: 45 }, canonicalAliases: { liquidityUsd: 50000 } };
  const contracts = [contractFor("liquidityUsd")];
  assert.equal(analyzeEngineDataReadiness(project, { contracts }).engineDataReadinessStatus, "CORE_READY");
  assert.equal(analyzeDataStarvationRootCause(project, { contracts }).liquidityUsd, 45);
});

test("partial current provenance cannot erase a stored metadata provider", () => {
  const project = { ...base, source: "dexscreener", canonicalAliases: { honeypotDetected: false },
    canonicalAliasProvenance: { honeypotDetected: { sourceProvider: "blockscout" } },
    fieldProvenance: { honeypotDetected: {} } };
  const contracts = [contractFor("honeypotDetected")];
  assert.equal(analyzeEngineDataReadiness(project, { contracts }).engineDataReadinessStatus, "CORE_DATA_STARVED");
  assert.equal(analyzeDataStarvationRootCause(project, { contracts }).coreDataStarved, true);
});

test("stored liquidity retains pool versus protocol source-path validation", () => {
  const contracts = [contractFor("liquidityUsd")];
  for (const [provider, sourcePath, expected] of [["defillama", "pool.tvlUsd", "CORE_READY"],
    ["dexscreener", "protocol.tvlUsd", "CORE_DATA_STARVED"]]) {
    const project = { ...base, canonicalAliases: { liquidityUsd: 75000 },
      canonicalAliasProvenance: { liquidityUsd: { sourceProvider: provider, sourcePath } } };
    assert.equal(analyzeEngineDataReadiness(project, { contracts }).engineDataReadinessStatus, expected);
    const root = analyzeDataStarvationRootCause(project, { contracts });
    assert.equal(root.coreDataStarved, expected !== "CORE_READY");
    if (expected === "CORE_READY") assert.equal(root.canonicalAliasProvenance.liquidityUsd.sourcePath, sourcePath);
    assert.equal(root.pool, undefined);
    assert.equal(root.protocol, undefined);
    assert.equal(root.liquidityUsd, undefined);
  }
});

test("stored confidence and source clock cannot borrow a newer root timestamp", () => {
  const old = "2026-10-01T00:00:00Z", current = "2026-10-22T22:00:00Z";
  const project = { ...base, source: "dexscreener", canonicalAliases: { liquidityUsd: 0 },
    canonicalAliasProvenance: { liquidityUsd: { sourceProvider: "dexscreener", confidence: 0, sourceTimestamp: old } },
    liquidityUsdTimestamp: current };
  const before = structuredClone(project);
  const root = analyzeDataStarvationRootCause(project, { contracts: [contractFor("liquidityUsd")] });
  assert.equal(root.canonicalAliasProvenance.liquidityUsd.confidence, 0);
  assert.equal(root.canonicalAliasProvenance.liquidityUsd.sourceTimestamp, old);
  assert.equal(root.aliasResolutionAudit.find(record => record.canonicalField === "liquidityUsd").sourceTimestamp, old);
  assert.equal(root.liquidityUsdTimestamp, current);
  assert.equal(root.liquidityUsd, undefined);
  assert.deepEqual(project, before);
});

test("stored source paths, confidence, raw units and clocks survive repeated audits", () => {
  const stamp = "2026-10-01T00:00:00Z";
  const project = { ...base, liquidityUsdTimestamp: "2026-10-22T22:00:00Z", canonicalAliases: { liquidityUsd: 75000 },
    canonicalAliasProvenance: { liquidityUsd: { sourceProvider: "defillama", sourcePath: "pool.tvlUsd", confidence: 0,
      sourceTimestamp: stamp, rawValue: 75, originalValue: 75, sourceUnit: "thousand USD", conversionApplied: "x1000" } } };
  const contracts = [contractFor("liquidityUsd")];
  let observed = project;
  for (let index = 0; index < 3; index++) {
    observed = analyzeDataStarvationRootCause(observed, { contracts });
    const provenance = observed.canonicalAliasProvenance.liquidityUsd;
    assert.equal(observed.liquidityUsd, undefined);
    assert.equal(observed.pool, undefined);
    assert.equal(observed.canonicalAliases.liquidityUsd, 75000);
    assert.equal(provenance.sourcePath, "pool.tvlUsd");
    assert.equal(provenance.confidence, 0);
    assert.equal(provenance.sourceTimestamp, stamp);
    assert.equal(provenance.rawValue, 75);
    assert.equal(provenance.sourceUnit, "thousand USD");
    assert.equal(provenance.conversionApplied, "x1000");
  }
});

test("contradictory cached observations sharing a path are quarantined independent of contract order", () => {
  const project = { ...base, canonicalAliases: { honeypotDetected: true, sellRestricted: false },
    canonicalAliasProvenance: { honeypotDetected: { sourcePath: "cannotSell" }, sellRestricted: { sourcePath: "cannotSell" } } };
  const before = structuredClone(project);
  for (const fields of [["honeypotDetected", "sellRestricted"], ["sellRestricted", "honeypotDetected"]]) {
    const contracts = fields.map(field => ({ ...contractFor(field), id: field }));
    assert.equal(analyzeEngineDataReadiness(project, { contracts }).engineDataReadinessStatus, "CORE_DATA_STARVED");
    const root = analyzeDataStarvationRootCause(project, { contracts });
    assert.equal(root.coreDataStarved, true);
    for (const field of fields) {
      assert.equal(root.canonicalAliases[field], null);
      assert.ok(root.canonicalAliasConflicts[field].some(record => record.canonicalValue === true));
      assert.ok(root.coreMissingEvidence.some(record => record.canonicalField === field && record.rootCause === "CONFLICTED_DATA"));
    }
  }
  assert.deepEqual(project, before);
});

for (const provenance of [{ chain: "ethereum" }, { tokenAddress: pool }, { poolAddress: token },
  { chain: "base", chainId: "1" }, { tokenAddress: "invalid" }]) {
  test(`stored provider identity cannot contradict the candidate: ${JSON.stringify(provenance)}`, () => {
    const project = { ...base, canonicalAliases: { liquidityUsd: 75000 },
      canonicalAliasProvenance: { liquidityUsd: { sourceProvider: "dexscreener", ...provenance } } };
    const contracts = [contractFor("liquidityUsd")];
    assert.equal(analyzeEngineDataReadiness(project, { contracts }).engineDataReadinessStatus, "CORE_DATA_STARVED");
    assert.equal(analyzeDataStarvationRootCause(project, { contracts }).coreDataStarved, true);
  });
}

test("matching declared identities retain canonical-only evidence", () => {
  const project = { ...base, canonicalAliases: { liquidityUsd: 0 }, canonicalAliasProvenance: { liquidityUsd: {
    sourceProvider: "dexscreener", chain: "base", chainId: 8453, tokenAddress: token, poolAddress: pool,
  } } };
  const contracts = [contractFor("liquidityUsd")];
  assert.equal(analyzeEngineDataReadiness(project, { contracts }).engineDataReadinessStatus, "CORE_READY");
  assert.equal(analyzeDataStarvationRootCause(project, { contracts }).coreDataStarved, false);
});

test("a cached chain cannot retain addresses rejected by the joint identity validator", () => {
  const project = { tokenAddress: token, poolAddress: pool, canonicalAliases: { chain: "solana" },
    canonicalAliasProvenance: { chain: { chain: "solana" } } };
  const contracts = ["chain", "tokenAddress", "poolAddress"].map(field => ({ ...contractFor(field), id: field }));
  assert.equal(analyzeEngineDataReadiness(project, { contracts }).engineDataReadinessStatus, "CORE_DATA_STARVED");
  const result = analyzeDataStarvationRootCause(project, { contracts });
  assert.equal(result.coreDataStarved, true);
  assert.equal(result.canonicalAliases.tokenAddress, null);
  assert.equal(result.canonicalAliases.poolAddress, null);
});

test("matching canonical-only identity observations validate as one complete tuple", () => {
  const tuple = { chain: "base", tokenAddress: token, poolAddress: pool };
  const project = { canonicalAliases: tuple, canonicalAliasProvenance: Object.fromEntries(
    Object.keys(tuple).map(field => [field, { ...tuple, sourceProvider: "dexscreener" }])) };
  const contracts = Object.keys(tuple).map(field => ({ ...contractFor(field), id: field }));
  assert.equal(analyzeEngineDataReadiness(project, { contracts }).engineDataReadinessStatus, "CORE_READY");
  const result = analyzeDataStarvationRootCause(project, { contracts });
  assert.equal(result.coreDataStarved, false);
  for (const [field, value] of Object.entries(tuple)) assert.equal(result.canonicalAliases[field], value);
  assert.equal(result.executionProofVerified, undefined);
});

test("rejected cached identity cannot bind a different stored provider observation", () => {
  const project = { chain: "base", canonicalAliases: { tokenAddress: token, liquidityUsd: 75000 },
    canonicalAliasProvenance: { tokenAddress: { chain: "ethereum" }, liquidityUsd: {
      sourceProvider: "dexscreener", chain: "base", tokenAddress: token,
    } } };
  const contracts = [contractFor("liquidityUsd")];
  assert.equal(analyzeEngineDataReadiness(project, { contracts }).engineDataReadinessStatus, "CORE_DATA_STARVED");
  const result = analyzeDataStarvationRootCause(project, { contracts });
  assert.equal(result.canonicalAliases.tokenAddress, null);
  assert.equal(result.canonicalAliases.liquidityUsd, null);
  assert.equal(result.coreDataStarved, true);
});

test("Solana applicability and deep-deferred exclusions remain unchanged", () => {
  const contracts = [contractFor("buyTaxPct")];
  const solana = { chain: "solana", buyTaxPct: "UNKNOWN" };
  assert.equal(analyzeEngineDataReadiness(solana, { contracts }).engineDataReadinessStatus, "CORE_READY");
  assert.equal(analyzeDataStarvationRootCause(solana, { contracts }).coreDataStarved, false);
  const deferred = { ...base, deepEvaluationState: "DEFERRED_BEFORE_DEEP", honeypotDetected: "UNKNOWN" };
  assert.equal(analyzeEngineDataReadiness(deferred, { contracts }).engineDataReadinessStatus, "DEFERRED_BEFORE_DEEP");
  assert.equal(analyzeDataStarvationRootCause(deferred, { contracts }).coreDataStarved, false);
});
