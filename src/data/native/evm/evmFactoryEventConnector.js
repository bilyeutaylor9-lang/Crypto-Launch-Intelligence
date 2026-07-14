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

export function decodeEvmFactoryLog(log = {}, config = {}) {
  const eventType = log.eventType || log.kind || log.decoded?.eventType || NATIVE_EVENT_TYPES.POOL_CREATED;
  const decoded = log.decoded || {};
  const args = decoded.args || log.args || {};

  return normalizeNativeEvent(
    {
      eventType,
      chain: log.chain || config.chain,
      chainId: log.chainId || config.chainId,
      protocol: log.protocol || config.protocol,
      protocolVersion: log.protocolVersion || config.protocolVersion,
      dex: log.dex || config.protocol,
      poolAddress: args.pool || args.pair || args.poolAddress || log.poolAddress || chooseTopic(log.topics, 3),
      tokenAddress: args.token || args.token0 || args.baseToken || log.tokenAddress || chooseTopic(log.topics, 1),
      baseToken: args.token0 || args.baseToken || args.token || log.baseToken,
      quoteToken: args.token1 || args.quoteToken || log.quoteToken || chooseTopic(log.topics, 2),
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
    const logs = Array.isArray(options.logs) ? options.logs : [];
    const events = logs.map((log) => this.decodeEvent(log));

    if (options.persist !== false && events.length) {
      recordNativeEvents(events, { confirmed: Boolean(options.confirmed) });
    }

    if (options.toBlock || options.toSlot) {
      updateNativeCheckpoint(this.config.id || `${this.config.chain}:${this.config.protocol}`, {
        chain: this.config.chain,
        protocol: this.config.protocol,
        blockNumber: options.toBlock || null,
        slot: options.toSlot || null,
        mode: "backfill",
      });
    }

    return {
      status: this.config.configured || logs.length ? "OK" : "NOT_CONFIGURED",
      source: this.config.id || this.config.protocol,
      events,
      reason: this.config.configured ? null : "No RPC/factory settings were supplied; decoded only provided logs.",
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
      const result = await adapter.backfill({ ...options, logs });
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
