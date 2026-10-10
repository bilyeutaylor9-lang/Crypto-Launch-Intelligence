import test from "node:test";
import assert from "node:assert/strict";
import { BASE_B20_FACTORY, getBaseB20LifecycleEvidence, isBaseB20Candidate, isVerifiedBaseB20Evidence } from "../src/data/baseB20LifecycleConnector.js";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";
import { analyzeDeployerReputation } from "../src/engines/deployerReputationEngine.js";
import { buildCandidateProofState } from "../src/kernel/candidateTruthState.js";
import { getEngineContracts } from "../src/kernel/engineContractManifest.js";
import { analyzeEngineDataReadiness } from "../src/engines/engineDataReadinessEngine.js";

const TOKEN = "0xb2000000000000000000007b9fcbd005511acbd5";
const project = { chain: "base", tokenAddress: TOKEN };
const TRUE = `0x${"0".repeat(63)}1`;
const requests = [{ field: "nativeLifecycle", sources: ["native RPC"] }];
function rpcFixture(overrides = {}, calls = []) {
  return async (url, method, params) => {
    calls.push({ method, params });
    if (overrides[method] instanceof Error) throw overrides[method];
    return overrides[method] ?? ({ eth_chainId: "0x2105", eth_blockNumber: "0x100", eth_getCode: "0xef", eth_call: TRUE })[method];
  };
}
const options = (overrides = {}, calls = []) => ({ useCache: false, rpcUrl: "https://rpc.invalid", jsonRpc: rpcFixture(overrides, calls) });

test("Base B20 prefix is only routing evidence and is chain-specific", () => {
  assert.equal(isBaseB20Candidate(project), true);
  assert.equal(isBaseB20Candidate({ ...project, chain: "ethereum" }), false);
  assert.equal(isBaseB20Candidate({ ...project, tokenAddress: TOKEN.replace("b2", "b3") }), false);
  assert.equal(isBaseB20Candidate({ chain: "base", symbol: "SPCXC" }), false);
});

test("native initialization proof is pinned to exact Base token and observation block", async () => {
  const calls = [];
  const result = await getBaseB20LifecycleEvidence(project, options({}, calls));
  assert.equal(isVerifiedBaseB20Evidence(result), true);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[2].params, [TOKEN, "0x100"]);
  assert.equal(calls[3].params[0].to, BASE_B20_FACTORY);
  assert.ok(calls[3].params[0].data.endsWith(TOKEN.slice(2)));
  assert.equal(calls[3].params[1], "0x100");
  assert.equal(result.nativeLifecycle.creator, null);
  assert.equal(result.creatorAddress, null);
  assert.equal(result.creationBlockNumber, null);
  assert.equal(result.nativeLifecycle.observedBlockNumber, 256);
});

test("wrong chain, empty calls, uninitialized tokens and ordinary bytecode remain unknown", async () => {
  for (const override of [{ eth_chainId: "0x1" }, { eth_blockNumber: "0x" },
    { eth_getCode: "0x" }, { eth_getCode: "0x6000" }, { eth_call: "0x" },
    { eth_call: `0x${"0".repeat(64)}` }, { eth_call: new Error("RPC unavailable") }]) {
    const result = await getBaseB20LifecycleEvidence(project, options(override));
    assert.equal(result.status, "UNKNOWN");
    assert.equal(result.nativeLifecycle, null);
    assert.equal(result.creatorAddress, null);
  }
});

test("a cold production cache proceeds to RPC and never promotes a missing stub", async () => {
  const calls = [];
  const result = await getBaseB20LifecycleEvidence({ ...project,
    tokenAddress: "0xb200000000000000000000123456789abcdef012" }, {
    rpcUrl: "https://rpc.invalid", jsonRpc: rpcFixture({ eth_getCode: "0x" }, calls),
  });
  assert.equal(calls.length, 4);
  assert.equal(result.status, "UNKNOWN");
  assert.equal(result.nativeLifecycle, null);
});

test("native lifecycle promotion cannot manufacture creator reputation or clean safety", async () => {
  const proof = await getBaseB20LifecycleEvidence(project, options());
  const result = await executeActiveEvidenceProviderRequests(project, requests, {
    providers: { getBaseB20LifecycleEvidence: async () => proof }, useCache: false,
  });
  const native = result.observations.find((item) => item.field === "nativeLifecycle");
  assert.equal(native.value.initialized, true);
  assert.equal(native.source, "base-b20-native");
  assert.equal(native.verificationStatus, "VERIFIED_PROVIDER_OBSERVATION");
  assert.ok(!result.observations.some((item) => ["creator", "deployer", "creatorAddress", "deployerAddress"].includes(item.field)));
  const hydrated = { ...project, nativeLifecycle: native.value };
  assert.equal(analyzeDeployerReputation(hydrated).deployerReputationScore, analyzeDeployerReputation(project).deployerReputationScore);
  assert.notEqual(buildCandidateProofState(hydrated).safety.status, "VERIFIED_SAFE");
  const contracts = getEngineContracts().filter((contract) => contract.id === "deployerReputation");
  assert.equal(contracts.length, 1);
  assert.equal(analyzeEngineDataReadiness(project, { contracts }).engineDataReadiness.coreDataStarved, true);
  assert.equal(analyzeEngineDataReadiness(hydrated, { contracts }).engineDataReadiness.coreDataStarved, false);
});

test("foreign native identity cannot be promoted", async () => {
  const proof = await getBaseB20LifecycleEvidence(project, options());
  assert.equal(isVerifiedBaseB20Evidence(null), false);
  assert.equal(isVerifiedBaseB20Evidence(undefined), false);
  assert.equal(isVerifiedBaseB20Evidence({ ...proof, tokenAddress: TOKEN.replace(/5$/, "6") }), false);
  assert.equal(isVerifiedBaseB20Evidence({ ...proof, chain: "ethereum" }), false);
  const result = await executeActiveEvidenceProviderRequests(project, requests, {
    useCache: false, maxProviderRequests: 4, providers: { getBaseB20LifecycleEvidence: async () => ({
      ...proof, address: TOKEN.replace(/5$/, "6"), tokenAddress: TOKEN.replace(/5$/, "6"),
    }) },
  });
  assert.equal(result.observations.length, 0);
});

test("cached exact native lifecycle proof spends no provider requests", async () => {
  const proof = await getBaseB20LifecycleEvidence(project, options());
  let calls = 0;
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 0 });
  const result = await executeActiveEvidenceProviderRequests(project, requests, {
    readCachedSecurityEvidence: (source) => source === "base-b20-native" ? proof : null,
    providers: { getBaseB20LifecycleEvidence: async () => { calls++; return proof; } },
  }, state);
  assert.equal(calls, 0);
  assert.equal(state.requestsUsed, 0);
  assert.equal(result.observations.find((item) => item.field === "nativeLifecycle").value.tokenAddress, TOKEN);
});

test("four RPC units must fit budget before native hydration begins", async () => {
  let calls = 0;
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 3 });
  const result = await executeActiveEvidenceProviderRequests(project, requests, {
    useCache: false, providers: { getBaseB20LifecycleEvidence: async () => { calls++; return {}; },
      getDeployerEvidence: async () => ({ status: "UNKNOWN" }) },
  }, state);
  assert.equal(calls, 0);
  assert.equal(result.observations.length, 0);
  assert.ok(state.requestsUsed <= 3);
});
