import { NativePoolAdapter, NATIVE_EVENT_TYPES, normalizeNativeEvent } from "../NativePoolAdapter.js";
import { getNativeProtocolConfigs } from "../nativePoolConfig.js";
import { recordNativeDeadLetter, recordNativeEvents, updateNativeCheckpoint } from "../nativeEventStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function lower(value = "") {
  return String(value || "").trim().toLowerCase();
}

function eventTypeFromInstruction(instruction = {}) {
  const text = [
    instruction.eventType,
    instruction.type,
    instruction.name,
    instruction.log,
    ...(Array.isArray(instruction.logs) ? instruction.logs : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/deploy|mint|create token/.test(text)) return NATIVE_EVENT_TYPES.TOKEN_DEPLOYED;
  if (/migrat|create pool|initialize pool|pool created/.test(text)) return NATIVE_EVENT_TYPES.POOL_CREATED;
  if (/liquidity|deposit/.test(text)) return NATIVE_EVENT_TYPES.FIRST_LIQUIDITY_ADDED;
  if (/swap|buy|sell/.test(text)) return NATIVE_EVENT_TYPES.FIRST_SWAP;
  if (/buyer|holder/.test(text)) return NATIVE_EVENT_TYPES.FIRST_EXTERNAL_BUYER;
  return NATIVE_EVENT_TYPES.POOL_CREATED;
}

export function decodeSolanaProgramEvent(instruction = {}, config = {}) {
  const accounts = instruction.accounts || {};
  const eventType = instruction.eventType || eventTypeFromInstruction(instruction);

  return normalizeNativeEvent(
    {
      eventType,
      chain: "solana",
      protocol: instruction.protocol || config.protocol,
      protocolVersion: instruction.protocolVersion || config.protocolVersion,
      dex: instruction.dex || config.protocol,
      poolAddress: lower(instruction.poolAddress || accounts.pool || accounts.amm || accounts.market || ""),
      tokenAddress: lower(instruction.tokenAddress || instruction.mint || accounts.mint || accounts.baseMint || ""),
      baseToken: lower(instruction.baseToken || instruction.mint || accounts.baseMint || ""),
      quoteToken: lower(instruction.quoteToken || accounts.quoteMint || ""),
      creator: lower(instruction.creator || instruction.deployer || accounts.creator || accounts.owner || ""),
      deployer: lower(instruction.deployer || instruction.creator || accounts.creator || accounts.owner || ""),
      slot: instruction.slot,
      signature: instruction.signature,
      transactionHash: instruction.signature,
      instructionIndex: instruction.instructionIndex ?? 0,
      innerInstructionIndex: instruction.innerInstructionIndex ?? null,
      timestamp: instruction.timestamp || instruction.blockTime,
      initialLiquidityUsd: num(instruction.initialLiquidityUsd),
      activeLiquidityUsd: num(instruction.activeLiquidityUsd),
      displayedLiquidityUsd: num(instruction.displayedLiquidityUsd || instruction.liquidityUsd),
      stableExitLiquidityUsd: num(instruction.stableExitLiquidityUsd),
      uniqueBuyers: num(instruction.uniqueBuyers),
      independentBuyers: num(instruction.independentBuyers),
      sameFunderBuyers: num(instruction.sameFunderBuyers),
      sniperBuyers: num(instruction.sniperBuyers),
      buyVolumeUsd: num(instruction.buyVolumeUsd),
      sellVolumeUsd: num(instruction.sellVolumeUsd),
      deployerNetFlow: num(instruction.deployerNetFlow),
      liquidityChange: num(instruction.liquidityChange),
      evidenceConfidence: num(instruction.evidenceConfidence || config.evidenceConfidence || 60),
      raw: instruction,
    },
    config
  );
}

export class SolanaProgramEventAdapter extends NativePoolAdapter {
  constructor(config = {}) {
    super({
      family: "solana-program",
      chain: "solana",
      ...config,
      programs: [config.programId, ...(config.programs || [])].filter(Boolean),
    });
  }

  decodeEvent(instruction = {}) {
    return decodeSolanaProgramEvent(instruction, this.config);
  }

  async backfill(options = {}) {
    const instructions = Array.isArray(options.instructions) ? options.instructions : [];
    const events = instructions.map((instruction) => this.decodeEvent(instruction));
    const status = events.length
      ? "OK"
      : this.config.configured
        ? "INACTIVE_NO_LIVE_COLLECTOR"
        : "NOT_CONFIGURED";

    if (options.persist !== false && events.length) {
      recordNativeEvents(events, { confirmed: Boolean(options.confirmed) });
    }

    if (options.toSlot || options.toBlock) {
      updateNativeCheckpoint(this.config.id || `solana:${this.config.protocol}`, {
        chain: "solana",
        protocol: this.config.protocol,
        slot: options.toSlot || null,
        blockNumber: options.toBlock || null,
        mode: "backfill",
      });
    }

    return {
      status,
      source: this.config.id || this.config.protocol,
      events,
      reason: events.length
        ? null
        : this.config.configured
          ? "Solana program identity is configured, but this adapter currently decodes supplied instructions only; no live evidence was collected."
          : "No Solana RPC/program settings were supplied; decoded only provided instructions.",
    };
  }
}

export function createSolanaProgramAdapters(options = {}) {
  return getNativeProtocolConfigs(options)
    .filter((config) => config.family === "solana-program")
    .map((config) => new SolanaProgramEventAdapter(config));
}

export async function getSolanaProgramEventCandidates(options = {}) {
  const adapters = createSolanaProgramAdapters(options);
  const instructionsByProgram = options.instructionsByProgram || {};
  const allEvents = [];
  const reports = [];

  for (const adapter of adapters) {
    try {
      const instructions = Array.isArray(instructionsByProgram[adapter.config.id])
        ? instructionsByProgram[adapter.config.id]
        : [];
      const result = await adapter.backfill({ ...options, instructions });
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
        stage: "solana-program-backfill",
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
      source: "solana-program-events",
      adapters: reports,
      eventCount: allEvents.length,
    },
  };
}
