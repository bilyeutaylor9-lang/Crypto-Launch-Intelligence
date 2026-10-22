import test from "node:test";
import assert from "node:assert/strict";
import { applyCanonicalAliases, resolveCanonicalAliases } from "../src/data/canonicalAliasResolver.js";
import { analyzeEngineDataReadiness } from "../src/engines/engineDataReadinessEngine.js";
import { analyzeDataStarvationRootCause } from "../src/engines/dataStarvationRootCauseEngine.js";
import { getEngineContracts } from "../src/kernel/engineContractManifest.js";

const accumulation = getEngineContracts().find((contract) => contract.id === "smartMoneyAccumulation");
const requiredFields = accumulation.inputContract.requiredAny[0];
const walletFields = [...requiredFields, "smartWalletBuys24h", "smartWalletSells24h",
  "smartWalletBuyVolumeUsd", "smartWalletSellVolumeUsd", "uniqueBuyers24h", "holderCount"];
const identity = { chain: "base", source: "native-rpc",
  tokenAddress: "0x1111111111111111111111111111111111111111",
  poolAddress: "0x2222222222222222222222222222222222222222" };

function assertDiagnosticOnly(project) {
  const resolution = resolveCanonicalAliases(project, { fields: walletFields });
  for (const field of walletFields) assert.equal(resolution.resolved[field], null, field);
  assert.deepEqual(resolution.audits, []);
  const applied = applyCanonicalAliases(project, { fields: walletFields });
  for (const field of walletFields) assert.equal(Object.hasOwn(applied, field), false, field);
  const ready = analyzeEngineDataReadiness(project, { contracts: [accumulation] });
  assert.equal(ready.engineDataReadiness.engines[0].requiredSatisfied, 0);
  assert.equal(ready.engineDataReadiness.engines[0].missingRequiredGroups.length, 1);
  const root = analyzeDataStarvationRootCause(ready, { contracts: [accumulation] });
  assert.equal(root.dataStarvationSatisfiedGroups, 0);
  assert.deepEqual(new Set(root.dataStarvationMissingEvidence.map((item) => item.canonicalField)), new Set(requiredFields));
  for (const field of requiredFields) assert.equal(root.canonicalAliases[field], null, field);
}

test("measured wallet diagnostic values and effectiveValues cannot supply flows or counts", () => {
  for (const key of ["values", "effectiveValues"]) {
    for (const value of [0, 123]) {
      assertDiagnosticOnly({ ...identity, measuredWalletFlow: {
        status: "MEASURED", [key]: Object.fromEntries(walletFields.map((field) => [field, value])),
      } });
    }
  }
});

test("measured wallet diagnostic receipts and history cannot supply canonical observations", () => {
  const values = Object.fromEntries(walletFields.map((field) => [field, 0]));
  for (const diagnostic of [
    { receipt: { values, effectiveValues: values } },
    { receiptHistory: { previous: { ...values, values }, latest: { effectiveValues: values } } },
    { history: [{ ...values, values }], receipts: [{ effectiveValues: values }] },
  ]) assertDiagnosticOnly({ ...identity, measuredWalletFlow: diagnostic });
  assertDiagnosticOnly({ ...identity, MEASUREDWALLETFLOW: { values } });
  assertDiagnosticOnly({ ...identity, "measuredWalletFlow.values": values });
});

test("promoted root observations and legitimate explicit zero remain usable beside wallet diagnostics", () => {
  for (const value of [0, 15]) {
    const observations = Object.fromEntries(walletFields.map((field) => [field, value]));
    const project = { ...identity, ...observations, measuredWalletFlow: {
      values: Object.fromEntries(walletFields.map((field) => [field, 999])),
      effectiveValues: Object.fromEntries(walletFields.map((field) => [field, 777])),
      receiptHistory: { prior: { smartWalletNetFlowUsd: -100 } },
    } };
    const resolved = resolveCanonicalAliases(project, { fields: walletFields });
    for (const field of walletFields) {
      assert.equal(resolved.resolved[field], value, field);
      assert.equal(resolved.provenance[field].sourcePath, field);
    }
    assert.deepEqual(resolved.conflicts, {});
    const ready = analyzeEngineDataReadiness(project, { contracts: [accumulation] });
    assert.equal(ready.engineDataReadiness.engines[0].requiredSatisfied, 1);
    const root = analyzeDataStarvationRootCause(ready, { contracts: [accumulation] });
    assert.equal(root.dataStarvationSatisfiedGroups, 1);
    assert.deepEqual(root.dataStarvationMissingEvidence, []);
    assert.equal(root.smartWalletNetFlowUsd, value);
  }
});

test("a single diagnostic zero cannot satisfy the actual accumulation required-any group", () => {
  assertDiagnosticOnly({ ...identity, measuredWalletFlow: { values: { smartWalletNetFlowUsd: 0 } } });
  const ready = analyzeEngineDataReadiness({ ...identity, smartWalletNetFlowUsd: 0 }, { contracts: [accumulation] });
  assert.equal(ready.engineDataReadiness.engines[0].requiredSatisfied, 1);
  assert.equal(analyzeDataStarvationRootCause(ready, { contracts: [accumulation] }).dataStarvationSatisfiedGroups, 1);
});

test("custom semantic ignores replace the defaults and must retain their own diagnostic boundary", () => {
  const project = { ...identity, measuredWalletFlow: { values: { smartWalletNetFlowUsd: 0 } } };
  const options = { fields: ["smartWalletNetFlowUsd"] };
  assert.equal(resolveCanonicalAliases(project, options).resolved.smartWalletNetFlowUsd, null);
  assert.equal(resolveCanonicalAliases(project, { ...options, semanticScanIgnores: [] })
    .resolved.smartWalletNetFlowUsd, 0);
  assert.equal(resolveCanonicalAliases(project, { ...options, semanticScanIgnores: [/^measuredWalletFlow(\.|$)/i] })
    .resolved.smartWalletNetFlowUsd, null);
});
