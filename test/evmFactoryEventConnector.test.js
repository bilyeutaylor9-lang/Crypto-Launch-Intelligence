import test from "node:test";
import assert from "node:assert/strict";

import {
  EvmFactoryEventAdapter,
  fetchEvmFactoryLogs,
  getEvmFactoryEventCandidates,
} from "../src/data/native/evm/evmFactoryEventConnector.js";
import {
  SolanaProgramEventAdapter,
  decodeExactSolanaTransaction,
  fetchSolanaProgramInstructions,
} from "../src/data/native/solana/solanaProgramEventConnector.js";
import { summarizeNativeDiscoveryMesh } from "../src/data/native/nativeDiscoveryMesh.js";

const FACTORY = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";
const QUOTE = "0x3333333333333333333333333333333333333333";
const POOL = "0x4444444444444444444444444444444444444444";
const TOPIC = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function addressWord(address) {
  return address.replace(/^0x/, "").padStart(64, "0");
}

test("EVM factory collector requests a bounded exact-topic log range", async () => {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const request = JSON.parse(init.body);
    calls.push(request);
    return {
      ok: true,
      json: async () => request.method === "eth_blockNumber"
        ? { jsonrpc: "2.0", id: 1, result: "0x64" }
        : { jsonrpc: "2.0", id: 1, result: [] },
    };
  };

  const result = await fetchEvmFactoryLogs(
    { rpcUrl: "https://rpc.example", factoryAddress: FACTORY, eventTopic0: TOPIC },
    { fetchImpl, lookbackBlocks: 12 }
  );

  assert.equal(result.status, "OK");
  assert.equal(calls[0].method, "eth_blockNumber");
  assert.equal(calls[1].method, "eth_getLogs");
  assert.deepEqual(calls[1].params[0], {
    address: FACTORY,
    fromBlock: "0x59",
    toBlock: "0x64",
    topics: [TOPIC],
  });
});

test("EVM factory collector accepts decimal checkpoint blocks without hex reinterpretation", async () => {
  let filter = null;
  const result = await fetchEvmFactoryLogs(
    { rpcUrl: "https://rpc.example", factoryAddress: FACTORY, eventTopic0: TOPIC },
    {
      fromBlock: 90,
      fetchImpl: async (_url, init) => {
        const request = JSON.parse(init.body);
        if (request.method === "eth_getLogs") filter = request.params[0];
        return {
          ok: true,
          json: async () => request.method === "eth_blockNumber"
            ? { jsonrpc: "2.0", id: 1, result: "0x64" }
            : { jsonrpc: "2.0", id: 1, result: [] },
        };
      },
    }
  );

  assert.equal(result.status, "OK");
  assert.equal(filter.fromBlock, "0x5a");
});

test("native EVM candidate collection polls RPC when no fixture logs were supplied", async () => {
  const methods = [];
  const result = await getEvmFactoryEventCandidates({
    chains: "base",
    checkpoints: {},
    persist: false,
    lookbackBlocks: 2,
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(init.body);
      methods.push(request.method);
      return {
        ok: true,
        json: async () => request.method === "eth_blockNumber"
          ? { jsonrpc: "2.0", id: 1, result: "0x64" }
          : { jsonrpc: "2.0", id: 1, result: [] },
      };
    },
  });

  assert.ok(methods.includes("eth_blockNumber"));
  assert.ok(methods.includes("eth_getLogs"));
  assert.ok(result.report.adapters.some((adapter) => adapter.status === "OK"));
});

test("EVM factory collector tries fallback RPC endpoints before failing the route", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const request = JSON.parse(init.body);
    calls.push({ url, method: request.method });
    if (url === "https://bad-rpc.example") {
      throw new Error("temporary RPC outage");
    }
    return {
      ok: true,
      json: async () =>
        request.method === "eth_blockNumber"
          ? { jsonrpc: "2.0", id: 1, result: "0x64" }
          : { jsonrpc: "2.0", id: 1, result: [] },
    };
  };

  const result = await fetchEvmFactoryLogs(
    {
      id: "test-route",
      rpcUrls: ["https://bad-rpc.example", "https://good-rpc.example"],
      factoryAddress: FACTORY,
      eventTopic0: TOPIC,
    },
    { fetchImpl, lookbackBlocks: 12 }
  );

  assert.equal(result.status, "OK");
  assert.equal(result.rpcUrl, "https://good-rpc.example");
  assert.deepEqual(result.rpcAttempts.map((attempt) => attempt.status), ["FAILED", "OK"]);
  assert.deepEqual(calls.map((call) => call.url), [
    "https://bad-rpc.example",
    "https://good-rpc.example",
    "https://good-rpc.example",
  ]);
});

test("EVM factory adapter decodes configured pool and token fields from a raw log", async () => {
  const adapter = new EvmFactoryEventAdapter({
    id: "test-factory",
    chain: "base",
    chainId: 8453,
    protocol: "test-dex",
    factoryAddress: FACTORY,
    poolAddressDataWord: 0,
  });
  const { events, status } = await adapter.backfill({
    logs: [{
      address: FACTORY,
      topics: [TOPIC, `0x${addressWord(TOKEN)}`, `0x${addressWord(QUOTE)}`],
      data: `0x${addressWord(POOL)}`,
      blockNumber: "0x64",
      transactionHash: "0xabc",
      logIndex: "0x0",
    }],
    persist: false,
  });

  assert.equal(status, "OK");
  assert.equal(events[0].tokenAddress, TOKEN);
  assert.equal(events[0].quoteToken, QUOTE);
  assert.equal(events[0].poolAddress, POOL);
  assert.equal(events[0].factoryAddress, FACTORY);
});

test("inactive native collectors report no evidence instead of a healthy success", async () => {
  const adapter = new SolanaProgramEventAdapter({
    id: "configured-solana-program",
    chain: "solana",
    protocol: "test-program",
    programId: "11111111111111111111111111111111",
    rpcUrl: "https://solana.example",
    configured: true,
  });
  const result = await adapter.backfill({ instructions: [], collectLive: false, persist: false });
  const summary = summarizeNativeDiscoveryMesh({ candidates: [], lifecycles: [], eventCount: 0 });

  assert.equal(result.status, "NO_SUPPLIED_EXACT_EVENTS");
  assert.equal(summary.status, "INACTIVE");
  assert.equal(summary.collectionStatus, "NO_EVENTS_COLLECTED");
});

test("Solana program collector uses bounded RPC and preserves case-sensitive exact identities", async () => {
  const programId = "11111111111111111111111111111111";
  const tokenAddress = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
  const poolAddress = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";
  const creator = "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD";
  const blockTime = Date.parse("2026-08-24T00:00:00.000Z") / 1000;
  const calls = [];
  const rpcCall = async (_url, method) => {
    calls.push(method);
    if (method === "getSignaturesForAddress") {
      return [{ signature: "SignatureCaseSensitive111111111111111111111111111111", slot: 99, blockTime, err: null }];
    }
    return {
      slot: 99,
      blockTime,
      meta: { err: null, innerInstructions: [], logMessages: ["Program log: initialize pool"] },
      transaction: {
        signatures: ["SignatureCaseSensitive111111111111111111111111111111"],
        message: {
          accountKeys: [programId],
          instructions: [{
            programId,
            parsed: {
              type: "initializePool",
              info: { mint: tokenAddress, pool: poolAddress, authority: creator },
            },
          }],
        },
      },
    };
  };
  const collected = await fetchSolanaProgramInstructions({
    id: "solana-test",
    protocol: "test-program",
    programId,
    rpcUrl: "https://solana.invalid.example",
  }, {
    now: "2026-08-24T01:00:00.000Z",
    rpcCall,
    signatureLimit: 2,
  });
  const adapter = new SolanaProgramEventAdapter({
    id: "solana-test",
    chain: "solana",
    protocol: "test-program",
    programId,
    rpcUrl: "https://solana.invalid.example",
    configured: true,
  });
  const result = await adapter.backfill({
    now: "2026-08-24T01:00:00.000Z",
    rpcCall,
    persist: false,
  });

  assert.equal(collected.status, "OK");
  assert.deepEqual(calls.slice(0, 2), ["getSignaturesForAddress", "getTransaction"]);
  assert.equal(result.status, "OK");
  assert.equal(result.events[0].tokenAddress, tokenAddress);
  assert.equal(result.events[0].poolAddress, poolAddress);
  assert.equal(result.events[0].exactIdentityEvidence.accountOrderGuessingAllowed, false);
});

test("Solana program collector rejects future and ambiguous unparsed instructions", () => {
  const programId = "11111111111111111111111111111111";
  const transaction = {
    blockTime: Date.parse("2026-08-24T02:00:00.000Z") / 1000,
    meta: { innerInstructions: [], logMessages: [] },
    transaction: {
      message: {
        accountKeys: [programId],
        instructions: [{ programId, accounts: [0], data: "not-structured" }],
      },
    },
  };
  assert.deepEqual(decodeExactSolanaTransaction(
    transaction,
    { signature: "sig", blockTime: transaction.blockTime },
    { programId, protocol: "test" },
    { asOf: "2026-08-24T01:00:00.000Z" }
  ), []);
});
