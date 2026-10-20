import test from "node:test";
import assert from "node:assert/strict";
import { fetchEvmContractDeployments } from "../src/data/native/evm/evmContractDeploymentConnector.js";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const CREATOR = "0x2222222222222222222222222222222222222222";
const OTHER = "0x3333333333333333333333333333333333333333";
const TX = `0x${"a".repeat(64)}`;
const BLOCK = `0x${"b".repeat(64)}`;
const project = { chain: "base", tokenAddress: TOKEN };
const requests = [{ field: "creatorAddress" }];

async function observations() {
  const tx = { hash: TX, blockNumber: "0xa", blockHash: BLOCK, transactionIndex: "0x0",
    chainId: "0x2105", from: CREATOR, to: null };
  const block = { number: "0xa", hash: BLOCK, parentHash: `0x${"c".repeat(64)}`,
    timestamp: "0x6553f10a", transactions: [tx] };
  const receipt = { transactionHash: TX, blockNumber: "0xa", blockHash: BLOCK, transactionIndex: "0x0",
    chainId: "0x2105", from: CREATOR, to: null, status: "0x1", contractAddress: TOKEN };
  const result = await fetchEvmContractDeployments({ chain: "base", rpcUrl: "https://rpc.invalid" }, {
    fromBlock: 10, toBlock: 10, persist: false,
    jsonRpc: async (_url, method) => ({ eth_chainId: "0x2105", eth_blockNumber: "0xa",
      eth_getBlockByNumber: block, eth_getTransactionReceipt: receipt }[method]),
  });
  assert.equal(result.status, "OK");
  assert.equal(result.events.length, 1);
  return result.events;
}

test("exact stored top-level creator receipts hydrate deployer aliases at zero provider cost", async () => {
  const events = await observations();
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 0, timeBudgetMs: 0 });
  const result = await executeActiveEvidenceProviderRequests(project, requests, {
    nativeDeploymentEvents: events, useCache: false,
    providers: { getBlockscoutDeployerEvidence: async () => assert.fail("Existing exact creator evidence needs no explorer") },
  }, state);
  const values = Object.fromEntries(result.observations.map((item) => [item.field, item.value]));
  for (const field of ["creatorAddress", "deployerAddress", "creator", "deployer"]) assert.equal(values[field], CREATOR);
  assert.equal(values.creationBlockNumber, 10);
  assert.equal(values.deploymentTransactionHash, TX);
  assert.equal(state.requestsUsed, 0);
  assert.equal(result.projectPatch.nativeContractDeploymentEvidence.tokenKind, "UNKNOWN");
  for (const observation of result.observations) {
    assert.equal(observation.source, "native-contract-deployment");
    assert.equal(observation.verificationStatus, "VERIFIED_PROVIDER_OBSERVATION");
    assert.equal(observation.recoveryRun, true);
    assert.equal(observation.finalityStatus, "UNFINALIZED");
    assert.equal(observation.sourceProvenance.blockHash, BLOCK);
    assert.equal(observation.sourceTimestamp, events[0].observedAt);
  }
  for (const field of ["walletAgeDays", "priorDeployments", "nativeLifecycle", "contractVerified", "honeypotDetected", "liveExecutionReady"]) {
    assert.equal(values[field], undefined);
  }
});

test("stored creator identity cannot be borrowed across contracts, chains or symbol-only projects", async () => {
  const events = await observations();
  for (const candidate of [{ ...project, tokenAddress: OTHER }, { chain: "bsc", tokenAddress: TOKEN },
    { chain: "base", symbol: "TOKEN" }, { ...project, contractAddress: OTHER }, { chain: "solana", tokenAddress: TOKEN }]) {
    const state = createActiveEvidenceExecutionState({ maxProviderRequests: 0 });
    const result = await executeActiveEvidenceProviderRequests(candidate, requests, {
      nativeDeploymentEvents: events, useCache: false,
      providers: { getBlockscoutDeployerEvidence: async () => assert.fail("No request budget") },
    }, state);
    assert.deepEqual(result.observations, []);
    assert.equal(state.requestsUsed, 0);
  }
});

test("corrupt raw creation metadata cannot promote a transaction sender to creator", async () => {
  const events = await observations();
  events[0].raw.to = OTHER;
  const result = await executeActiveEvidenceProviderRequests(project, requests, {
    nativeDeploymentEvents: events, maxProviderRequests: 0, useCache: false,
    providers: { getBlockscoutDeployerEvidence: async () => assert.fail("No request budget") },
  });
  assert.deepEqual(result.observations, []);
});

test("native creation history is indexed once and reused across recovery waves", async () => {
  const events = await observations();
  let loads = 0;
  const options = { loadNativeDeploymentEvents: () => { loads++; return events; },
    providers: { getBlockscoutDeployerEvidence: async () => assert.fail("Existing exact proof") } };
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 0 });
  for (let i = 0; i < 2; i++) {
    const result = await executeActiveEvidenceProviderRequests(project, requests, options, state);
    assert.ok(result.observations.some((item) => item.field === "creatorAddress"));
  }
  assert.equal(loads, 1);
  assert.equal(state.requestsUsed, 0);
});

test("a broken native memory read remains visible and does not disable independent creator providers", async () => {
  let calls = 0;
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 1 });
  const result = await executeActiveEvidenceProviderRequests(project, requests, {
    loadNativeDeploymentEvents: () => { throw new Error("corrupt native evidence ledger"); },
    providers: { getBlockscoutDeployerEvidence: async () => {
      calls++;
      return { chain: "base", address: TOKEN, creatorAddress: CREATOR, status: "EVIDENCE_AVAILABLE", observedAt: new Date().toISOString() };
    } },
  }, state);
  assert.equal(calls, 1);
  assert.equal(state.requestsUsed, 1);
  assert.ok(result.observations.some((item) => item.field === "creatorAddress"));
  assert.ok(result.attempts.some((item) => item.status === "MEMORY_READ_FAILED" && item.requestCost === 0));
});
