import { NativePoolAdapter, NATIVE_EVENT_TYPES, normalizeNativeEvent } from "../NativePoolAdapter.js";
import { getNativeProtocolConfigs } from "../nativePoolConfig.js";
import { recordNativeDeadLetter, recordNativeEvents, updateNativeCheckpoint } from "../nativeEventStore.js";
import { jsonRpc } from "../../../sensors/rpcJsonClient.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clean(value = "") {
  return String(value || "").trim();
}

export function normalizeSolanaAddress(value = "") {
  const address = clean(value);
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address) ? address : "";
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
      poolAddress: normalizeSolanaAddress(instruction.poolAddress || accounts.pool || accounts.amm || accounts.market || ""),
      tokenAddress: normalizeSolanaAddress(instruction.tokenAddress || instruction.mint || accounts.mint || accounts.baseMint || ""),
      baseToken: normalizeSolanaAddress(instruction.baseToken || instruction.mint || accounts.baseMint || ""),
      quoteToken: normalizeSolanaAddress(instruction.quoteToken || accounts.quoteMint || ""),
      creator: normalizeSolanaAddress(instruction.creator || instruction.deployer || accounts.creator || accounts.owner || ""),
      deployer: normalizeSolanaAddress(instruction.deployer || instruction.creator || accounts.creator || accounts.owner || ""),
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
      exactIdentityEvidence: instruction.exactIdentityEvidence || null,
      raw: instruction,
    },
    config
  );
}

function accountKey(value) {
  return clean(typeof value === "string" ? value : value?.pubkey || value?.address);
}

function transactionAccountKeys(transaction = {}) {
  const staticKeys = transaction?.transaction?.message?.accountKeys || [];
  const loaded = transaction?.meta?.loadedAddresses || {};
  return [
    ...staticKeys.map(accountKey),
    ...(loaded.writable || []).map(accountKey),
    ...(loaded.readonly || []).map(accountKey),
  ];
}

function programIdForInstruction(instruction = {}, keys = []) {
  return clean(
    instruction.programId ||
    (Number.isInteger(instruction.programIdIndex) ? keys[instruction.programIdIndex] : "")
  );
}

function structuredAddress(info = {}, fields = []) {
  for (const field of fields) {
    const value = normalizeSolanaAddress(info?.[field]);
    if (value) return value;
  }
  return "";
}

function transactionInstructions(transaction = {}) {
  const top = transaction?.transaction?.message?.instructions || [];
  const inner = transaction?.meta?.innerInstructions || [];
  return [
    ...top.map((instruction, index) => ({ instruction, instructionIndex: index, innerInstructionIndex: null })),
    ...inner.flatMap((group) => (group?.instructions || []).map((instruction, index) => ({
      instruction,
      instructionIndex: group.index,
      innerInstructionIndex: index,
    }))),
  ];
}

export function decodeExactSolanaTransaction(transaction = {}, signatureInfo = {}, config = {}, options = {}) {
  const keys = transactionAccountKeys(transaction);
  const programId = normalizeSolanaAddress(config.programId);
  const blockTimeSeconds = Number(transaction.blockTime ?? signatureInfo.blockTime);
  const observedAt = Number.isFinite(blockTimeSeconds) && blockTimeSeconds > 0
    ? new Date(blockTimeSeconds * 1000).toISOString()
    : null;
  const observedMs = observedAt ? Date.parse(observedAt) : NaN;
  const asOfMs = Date.parse(options.asOf || options.now || new Date().toISOString());
  if (!programId || !observedAt || !Number.isFinite(asOfMs) || observedMs > asOfMs) return [];

  const logMessages = Array.isArray(transaction?.meta?.logMessages) ? transaction.meta.logMessages : [];
  return transactionInstructions(transaction).flatMap(({ instruction, instructionIndex, innerInstructionIndex }) => {
    if (programIdForInstruction(instruction, keys) !== programId) return [];
    const info = instruction?.parsed?.info;
    if (!info || typeof info !== "object") return [];
    const tokenAddress = structuredAddress(info, [
      "mint", "tokenMint", "baseMint", "baseTokenMint", "tokenAddress",
    ]);
    const poolAddress = structuredAddress(info, [
      "pool", "poolAddress", "amm", "market", "bondingCurve", "pair",
    ]);
    if (!tokenAddress) return [];
    const quoteToken = structuredAddress(info, ["quoteMint", "quoteTokenMint", "quoteToken"]);
    const creator = structuredAddress(info, ["creator", "owner", "authority", "payer"]);
    return [{
      eventType: eventTypeFromInstruction({
        eventType: instruction?.parsed?.type,
        logs: logMessages,
      }),
      chain: "solana",
      protocol: config.protocol,
      protocolVersion: config.protocolVersion,
      poolAddress,
      tokenAddress,
      baseToken: tokenAddress,
      quoteToken,
      creator,
      deployer: creator,
      slot: transaction.slot ?? signatureInfo.slot ?? null,
      signature: signatureInfo.signature || transaction?.transaction?.signatures?.[0] || "",
      transactionHash: signatureInfo.signature || transaction?.transaction?.signatures?.[0] || "",
      instructionIndex,
      innerInstructionIndex,
      timestamp: observedAt,
      observedAt,
      evidenceConfidence: Number(options.evidenceConfidence || 88),
      exactIdentityEvidence: {
        source: "SOLANA_JSON_PARSED_INSTRUCTION",
        programId,
        tokenFieldObserved: true,
        poolFieldObserved: Boolean(poolAddress),
        accountOrderGuessingAllowed: false,
      },
      raw: instruction,
    }];
  });
}

export async function fetchSolanaProgramInstructions(config = {}, options = {}) {
  const rpcUrl = options.rpcUrl || config.rpcUrl;
  const programId = normalizeSolanaAddress(options.programId || config.programId);
  if (!rpcUrl || !programId) {
    return {
      status: "NOT_CONFIGURED",
      instructions: [],
      requests: 0,
      reason: "Live Solana collection requires an RPC URL and exact base58 program identity.",
    };
  }
  const rpcCall = options.rpcCall || jsonRpc;
  const limit = Math.max(1, Math.min(100, Number(options.signatureLimit || process.env.NATIVE_SOLANA_SIGNATURE_LIMIT || 25)));
  const signatureConfig = {
    commitment: options.commitment || "confirmed",
    limit,
    ...(options.before ? { before: options.before } : {}),
    ...(options.until ? { until: options.until } : {}),
  };
  const signatures = await rpcCall(rpcUrl, "getSignaturesForAddress", [programId, signatureConfig], options);
  const eligible = (Array.isArray(signatures) ? signatures : [])
    .filter((row) => row?.signature && !row.err)
    .slice(0, limit);
  const instructions = [];
  let requests = 1;
  for (const signatureInfo of eligible) {
    const transaction = await rpcCall(rpcUrl, "getTransaction", [signatureInfo.signature, {
      commitment: options.commitment || "confirmed",
      encoding: "jsonParsed",
      maxSupportedTransactionVersion: 0,
    }], options);
    requests += 1;
    if (!transaction || transaction.meta?.err) continue;
    instructions.push(...decodeExactSolanaTransaction(transaction, signatureInfo, config, options));
  }
  instructions.sort((left, right) => String(left.observedAt).localeCompare(String(right.observedAt)));
  return {
    status: instructions.length
      ? "OK"
      : eligible.length
        ? "NO_EXACT_DECODABLE_EVENTS"
        : "NO_CONFIRMED_TRANSACTIONS",
    instructions,
    requests,
    signaturesExamined: eligible.length,
    ambiguousTransactionsRejected: Math.max(0, eligible.length - new Set(instructions.map((row) => row.signature)).size),
    accountOrderGuessingAllowed: false,
  };
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
    let instructions = Array.isArray(options.instructions) ? options.instructions : [];
    let liveCollection = null;
    if (!instructions.length && this.config.configured && options.collectLive !== false) {
      liveCollection = await fetchSolanaProgramInstructions(this.config, options);
      instructions = liveCollection.instructions;
    }
    const events = instructions.map((instruction) => this.decodeEvent(instruction));
    const status = events.length
      ? "OK"
      : liveCollection
        ? liveCollection.status
        : this.config.configured
          ? "NO_SUPPLIED_EXACT_EVENTS"
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
        : liveCollection
          ? "Live RPC collection returned no exact structured mint identity; ambiguous account roles were rejected."
          : this.config.configured
          ? "No supplied exact instructions were available and live collection was disabled."
          : "No Solana RPC/program settings were supplied; decoded only provided instructions.",
      liveCollection: liveCollection ? {
        status: liveCollection.status,
        requests: liveCollection.requests,
        signaturesExamined: liveCollection.signaturesExamined,
        ambiguousTransactionsRejected: liveCollection.ambiguousTransactionsRejected,
        accountOrderGuessingAllowed: false,
      } : null,
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
      const supplied = Object.prototype.hasOwnProperty.call(instructionsByProgram, adapter.config.id);
      const instructions = supplied && Array.isArray(instructionsByProgram[adapter.config.id])
        ? instructionsByProgram[adapter.config.id]
        : [];
      const result = await adapter.backfill({
        ...options,
        instructions,
        collectLive: supplied ? false : options.collectLive,
      });
      allEvents.push(...result.events);
      reports.push({
        source: adapter.config.id,
        status: result.status,
        configured: Boolean(adapter.config.configured),
        events: result.events.length,
        reason: result.reason,
        liveCollection: result.liveCollection,
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
