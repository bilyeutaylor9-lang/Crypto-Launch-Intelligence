import test from "node:test";
import assert from "node:assert/strict";

import { EvmFactoryEventAdapter, fetchEvmFactoryLogs } from "../src/data/native/evm/evmFactoryEventConnector.js";

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
