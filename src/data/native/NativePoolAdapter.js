export const NATIVE_EVENT_TYPES = {
  CONTRACT_DEPLOYED: "CONTRACT_DEPLOYED",
  TOKEN_DEPLOYED: "TOKEN_DEPLOYED",
  POOL_CREATED: "POOL_CREATED",
  POOL_INITIALIZED: "POOL_INITIALIZED",
  FIRST_LIQUIDITY_ADDED: "FIRST_LIQUIDITY_ADDED",
  FIRST_SWAP: "FIRST_SWAP",
  FIRST_EXTERNAL_BUYER: "FIRST_EXTERNAL_BUYER",
  BUYER_MILESTONE: "BUYER_MILESTONE",
  LIQUIDITY_EXPANSION: "LIQUIDITY_EXPANSION",
  SMART_WALLET_ARRIVAL: "SMART_WALLET_ARRIVAL",
  DEVELOPER_SELL: "DEVELOPER_SELL",
  LP_REMOVAL: "LP_REMOVAL",
  FAILURE: "FAILURE",
};

function clean(value = "") {
  return String(value || "").trim();
}

function lower(value = "") {
  return clean(value).toLowerCase();
}

function chainAddress(value = "", chain = "") {
  const address = clean(value);
  return lower(chain) === "solana" ? address : address.toLowerCase();
}

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function nowIso() {
  return new Date().toISOString();
}

export function nativeEventId(event = {}) {
  if (event.eventId) return event.eventId;

  const chain = lower(event.chain || event.chainId || "unknown");
  const rawTx = clean(event.transactionHash || event.signature || "pending");
  const tx = chain === "solana" ? rawTx : rawTx.toLowerCase();
  const index = event.eventIndex ?? event.logIndex ?? event.instructionIndex ?? event.innerInstructionIndex ?? 0;
  const source = lower(event.protocol || event.source || event.dex || "native");

  return `${chain}:${source}:${tx}:${index}`;
}

export function normalizeNativeEvent(event = {}, defaults = {}) {
  const chain = lower(event.chain || defaults.chain || "unknown");
  const eventType = event.eventType || defaults.eventType || NATIVE_EVENT_TYPES.POOL_CREATED;
  const genericContract = eventType === NATIVE_EVENT_TYPES.CONTRACT_DEPLOYED;
  const metric = genericContract ? (value) => {
    if (value === null || value === undefined || value === "") return null;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  } : num;
  const normalized = {
    eventType,
    chain,
    chainId: event.chainId || defaults.chainId || null,
    protocol: lower(event.protocol || defaults.protocol || "unknown"),
    protocolVersion: event.protocolVersion || defaults.protocolVersion || null,
    dex: event.dex || defaults.dex || event.protocol || defaults.protocol || "unknown",
    factoryAddress: chainAddress(event.factoryAddress || defaults.factoryAddress || "", chain),
    poolAddress: chainAddress(event.poolAddress || event.pairAddress || event.pool || "", chain),
    tokenAddress: chainAddress(event.tokenAddress || event.baseToken || event.baseTokenAddress || "", chain),
    baseToken: chainAddress(event.baseToken || event.tokenAddress || event.baseTokenAddress || "", chain),
    quoteToken: chainAddress(event.quoteToken || event.quoteTokenAddress || "", chain),
    feeTier: event.feeTier ?? defaults.feeTier ?? null,
    tickSpacing: event.tickSpacing ?? defaults.tickSpacing ?? null,
    creator: chainAddress(genericContract ? event.creator : event.creator || event.deployer || event.owner || "", chain),
    deployer: chainAddress(genericContract ? event.deployer : event.deployer || event.creator || event.owner || "", chain),
    blockNumber: event.blockNumber ?? defaults.blockNumber ?? null,
    slot: event.slot ?? defaults.slot ?? null,
    transactionHash: chainAddress(event.transactionHash || event.txHash || "", chain),
    signature: event.signature || "",
    eventIndex: event.eventIndex ?? event.logIndex ?? event.instructionIndex ?? 0,
    instructionIndex: event.instructionIndex ?? null,
    innerInstructionIndex: event.innerInstructionIndex ?? null,
    timestamp: event.timestamp || event.blockTimestamp || event.observedAt || nowIso(),
    observedAt: event.observedAt || nowIso(),
    finalized: Boolean(event.finalized),
    initialLiquidityUsd: metric(event.initialLiquidityUsd),
    activeLiquidityUsd: metric(event.activeLiquidityUsd),
    displayedLiquidityUsd: metric(genericContract ? event.displayedLiquidityUsd ?? event.liquidityUsd : event.displayedLiquidityUsd || event.liquidityUsd),
    stableExitLiquidityUsd: metric(event.stableExitLiquidityUsd),
    uniqueBuyers: metric(event.uniqueBuyers),
    uniqueSellers: metric(event.uniqueSellers),
    independentBuyers: metric(event.independentBuyers),
    sameFunderBuyers: metric(event.sameFunderBuyers),
    sniperBuyers: metric(event.sniperBuyers),
    buyVolumeUsd: metric(event.buyVolumeUsd),
    sellVolumeUsd: metric(event.sellVolumeUsd),
    deployerNetFlow: metric(event.deployerNetFlow),
    liquidityChange: metric(event.liquidityChange),
    evidenceConfidence: num(event.evidenceConfidence || defaults.evidenceConfidence || 55),
    exactIdentityEvidence: event.exactIdentityEvidence || null,
    raw: event.raw || null,
    ...(genericContract ? {
      contractAddress: chainAddress(event.contractAddress, chain),
      blockHash: lower(event.blockHash), from: chainAddress(event.from, chain),
      to: event.to, receiptStatus: event.receiptStatus, creationKind: event.creationKind,
    } : {}),
  };

  return {
    ...normalized,
    projectId:
      event.projectId ||
      `${normalized.chain}:${normalized.tokenAddress || normalized.poolAddress || normalized.transactionHash || "unknown"}`,
    eventId: nativeEventId(normalized),
  };
}

export class NativePoolAdapter {
  constructor(config = {}) {
    this.config = {
      chain: "unknown",
      protocol: "unknown",
      protocolVersion: null,
      factories: [],
      programs: [],
      ...config,
    };
  }

  async getFactories() {
    return this.config.factories || [];
  }

  async subscribe() {
    return {
      status: "NOT_CONFIGURED",
      reason: "Live subscriptions require a configured RPC/WebSocket client.",
      events: [],
    };
  }

  async backfill() {
    return {
      status: "NOT_CONFIGURED",
      reason: "Backfill requires a configured HTTP RPC client and block range.",
      events: [],
    };
  }

  decodeEvent(log = {}) {
    return normalizeNativeEvent(log, this.config);
  }

  async getPoolState() {
    return {
      status: "NOT_CONFIGURED",
      displayedLiquidityUsd: 0,
      activeLiquidityUsd: 0,
      stableExitLiquidityUsd: 0,
    };
  }

  async getLiquidityPositions() {
    return [];
  }

  classifyTransaction(transaction = {}) {
    const type = transaction.eventType || transaction.type || "";
    if (/buy/i.test(type)) return "BUY";
    if (/sell/i.test(type)) return "SELL";
    if (/liquidity/i.test(type)) return "LIQUIDITY";
    if (/deploy/i.test(type)) return "DEPLOYMENT";
    return "UNKNOWN";
  }

  normalize(event = {}) {
    return normalizeNativeEvent(event, this.config);
  }
}
