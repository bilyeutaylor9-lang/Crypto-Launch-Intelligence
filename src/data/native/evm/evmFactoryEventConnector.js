import { NativePoolAdapter, NATIVE_EVENT_TYPES, normalizeNativeEvent } from "../NativePoolAdapter.js";
import { getNativeProtocolConfigs } from "../nativePoolConfig.js";
import { recordNativeEvents, recordNativeDeadLetter, updateNativeCheckpoint } from "../nativeEventStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function lower(value = "") {
  return String(value || "").trim().toLowerCase();
}

function chooseTopic(topics = [], index = 1) {
  return lower(topics[index] || "");
}

function addressFromWord(value = "") {
  const hex = String(value || "").replace(/^0x/i, "");
  return hex.length >= 40 ? `0x${hex.slice(-40)}`.toLowerCase() : "";
}

function dataWord(data = "", index = 0) {
  const hex = String(data || "").replace(/^0x/i, "");
  const offset = Math.max(0, Number(index) || 0) * 64;
  return hex.slice(offset, offset + 64);
}

function hexQuantity(value = 0) {
  return `0x${Math.max(0, Number(value) || 0).toString(16)}`;
}

function numberFromQuantity(value = "0x0") {
  const parsed = Number.parseInt(String(value || "0x0"), 16);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function rpcRequest(rpcUrl = "", method = "", params = [], options = {}) {
  if (!rpcUrl) throw new Error("Missing EVM RPC URL.");
  const controller = new AbortController();
  const timeoutMs = Math.max(1_000, Number(options.rpcTimeoutMs || process.env.NATIVE_RPC_TIMEOUT_MS || 12_000));
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await (options.fetchImpl || fetch)(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`EVM RPC ${method} failed: ${response.status}`);

    const body = await response.json();
    if (body.error) throw new Error(`EVM RPC ${method} failed: ${body.error.message || body.error.code}`);
    return body.result;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchEvmFactoryLogs(config = {}, options = {}) {
  const rpcUrl = options.rpcUrl || config.rpcUrl;
  const factoryAddress = lower(options.factoryAddress || config.factoryAddress);
  const eventTopic0 = lower(options.eventTopic0 || config.eventTopic0);

  if (!rpcUrl || !factoryAddress || !eventTopic0) {
    return {
      status: "NOT_CONFIGURED",
      logs: [],
      reason: "Live EVM collection requires an RPC URL, factory address, and exact event topic.",
    };
  }

  const latestHex = await rpcRequest(rpcUrl, "eth_blockNumber", [], options);
  const latestBlock = numberFromQuantity(latestHex);
  const lookbackBlocks = Math.max(1, Number(options.lookbackBlocks || process.env.NATIVE_EVM_LOOKBACK_BLOCKS || 120));
  const requestedFrom = options.fromBlock == null ? null : numberFromQuantity(options.fromBlock);
  const fromBlock = requestedFrom == null ? Math.max(0, latestBlock - lookbackBlocks + 1) : Math.min(requestedFrom, latestBlock);
  const filter = {
    address: factoryAddress,
    fromBlock: hexQuantity(fromBlock),
    toBlock: hexQuantity(latestBlock),
    topics: [eventTopic0],
  };
  const logs = await rpcRequest(rpcUrl, "eth_getLogs", [filter], options);

  return {
    status: "OK",
    logs: Array.isArray(logs) ? logs : [],
    fromBlock,
    toBlock: latestBlock,
    filter,
  };
}

export function decodeEvmFactoryLog(log = {}, config = {}) {
  const eventType = log.eventType || log.kind || log.decoded?.eventType || NATIVE_EVENT_TYPES.POOL_CREATED;
  const decoded = log.decoded || {};
  const args = decoded.args || log.args || {};
  const rawTopics = log.topics || [];
  const poolAddress =
    args.pool ||
    args.pair ||
    args.poolAddress ||
    log.poolAddress ||
    addressFromWord(dataWord(log.data, config.poolAddressDataWord)) ||
    addressFromWord(chooseTopic(rawTopics, 3));
  const tokenAddress =
    args.token ||
    args.token0 ||
    args.baseToken ||
    log.tokenAddress ||
    addressFromWord(chooseTopic(rawTopics, 1));
  const quoteToken = args.token1 || args.quoteToken || log.quoteToken || addressFromWord(chooseTopic(rawTopics, 2));

  return normalizeNativeEvent(
    {
      eventType,
      chain: log.chain || config.chain,
      chainId: log.chainId || config.chainId,
      protocol: log.protocol || config.protocol,
      protocolVersion: log.protocolVersion || config.protocolVersion,
      dex: log.dex || config.protocol,
      factoryAddress: config.factoryAddress || log.address || "",
      poolAddress,
      tokenAddress,
      baseToken: args.token0 || args.baseToken || args.token || log.baseToken || tokenAddress,
      quoteToken,
      feeTier: args.fee ?? log.feeTier,
      tickSpacing: args.tickSpacing ?? log.tickSpacing,
      creator: args.creator || args.deployer || log.creator,
      deployer: args.deployer || args.creator || log.deployer,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash || log.txHash,
      logIndex: log.logIndex ?? log.eventIndex,
      timestamp: log.timestamp || log.blockTimestamp,
      initialLiquidityUsd: num(log.initialLiquidityUsd || args.initialLiquidityUsd),
      activeLiquidityUsd: num(log.activeLiquidityUsd || args.activeLiquidityUsd),
      displayedLiquidityUsd: num(log.displayedLiquidityUsd || log.liquidityUsd || args.liquidityUsd),
      stableExitLiquidityUsd: num(log.stableExitLiquidityUsd || args.stableExitLiquidityUsd),
      uniqueBuyers: num(log.uniqueBuyers || args.uniqueBuyers),
      independentBuyers: num(log.independentBuyers || args.independentBuyers),
      sameFunderBuyers: num(log.sameFunderBuyers || args.sameFunderBuyers),
      sniperBuyers: num(log.sniperBuyers || args.sniperBuyers),
      buyVolumeUsd: num(log.buyVolumeUsd || args.buyVolumeUsd),
      sellVolumeUsd: num(log.sellVolumeUsd || args.sellVolumeUsd),
      deployerNetFlow: num(log.deployerNetFlow || args.deployerNetFlow),
      liquidityChange: num(log.liquidityChange || args.liquidityChange),
      evidenceConfidence: num(log.evidenceConfidence || config.evidenceConfidence || 62),
      raw: log,
    },
    config
  );
}

export class EvmFactoryEventAdapter extends NativePoolAdapter {
  constructor(config = {}) {
    super({
      family: "evm-factory",
      ...config,
      factories: [config.factoryAddress, ...(config.factories || [])].filter(Boolean),
    });
  }

  decodeEvent(log = {}) {
    return decodeEvmFactoryLog(log, this.config);
  }

  async backfill(options = {}) {
    const providedLogs = Array.isArray(options.logs) ? options.logs : null;
    const collection = providedLogs
      ? { status: "PROVIDED", logs: providedLogs, fromBlock: options.fromBlock || null, toBlock: options.toBlock || null }
      : options.collect === false
      ? { status: "COLLECTION_DISABLED", logs: [], fromBlock: null, toBlock: null }
      : await fetchEvmFactoryLogs(this.config, options);
    const logs = collection.logs || [];
    const events = logs.map((log) => this.decodeEvent(log));

    if (options.persist !== false && events.length) {
      recordNativeEvents(events, { confirmed: Boolean(options.confirmed) });
    }

    if (options.persist !== false && (collection.toBlock || options.toBlock || options.toSlot)) {
      updateNativeCheckpoint(this.config.id || `${this.config.chain}:${this.config.protocol}`, {
        chain: this.config.chain,
        protocol: this.config.protocol,
        blockNumber: collection.toBlock || options.toBlock || null,
        slot: options.toSlot || null,
        mode: "backfill",
      });
    }

    return {
      status: ["OK", "PROVIDED"].includes(collection.status) ? "OK" : collection.status,
      source: this.config.id || this.config.protocol,
      events,
      fromBlock: collection.fromBlock || null,
      toBlock: collection.toBlock || null,
      reason: collection.reason || null,
    };
  }
}

export function createEvmFactoryAdapters(options = {}) {
  return getNativeProtocolConfigs(options)
    .filter((config) => config.family === "evm-factory" || config.family === "evm-deployment")
    .map((config) => new EvmFactoryEventAdapter(config));
}

export async function getEvmFactoryEventCandidates(options = {}) {
  const adapters = createEvmFactoryAdapters(options);
  const logsByProtocol = options.logsByProtocol || {};
  const allEvents = [];
  const reports = [];

  for (const adapter of adapters) {
    try {
      const logs = Array.isArray(logsByProtocol[adapter.config.id]) ? logsByProtocol[adapter.config.id] : [];
      const result = await adapter.backfill({ ...options, logs, collect: options.collect !== false });
      allEvents.push(...result.events);
      reports.push({
        source: adapter.config.id,
        status: result.status,
        configured: Boolean(adapter.config.configured),
        events: result.events.length,
        reason: result.reason,
      });
    } catch (error) {
      recordNativeDeadLetter({
        source: adapter.config.id,
        error: error.message,
        stage: "evm-factory-backfill",
      });
      reports.push({
        source: adapter.config.id,
        status: "FAILED",
        configured: Boolean(adapter.config.configured),
        events: 0,
        error: error.message,
      });
    }
  }

  return {
    events: allEvents,
    report: {
      source: "evm-factory-events",
      adapters: reports,
      eventCount: allEvents.length,
    },
  };
}
