export const NATIVE_EVENT_TYPES = {
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
  const normalized = {
    eventType: event.eventType || defaults.eventType || NATIVE_EVENT_TYPES.POOL_CREATED,
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
    creator: chainAddress(event.creator || event.deployer || event.owner || "", chain),
    deployer: chainAddress(event.deployer || event.creator || event.owner || "", chain),
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
    initialLiquidityUsd: num(event.initialLiquidityUsd),
    activeLiquidityUsd: num(event.activeLiquidityUsd),
    displayedLiquidityUsd: num(event.displayedLiquidityUsd || event.liquidityUsd),
    stableExitLiquidityUsd: num(event.stableExitLiquidityUsd),
    uniqueBuyers: num(event.uniqueBuyers),
    uniqueSellers: num(event.uniqueSellers),
    independentBuyers: num(event.independentBuyers),
    sameFunderBuyers: num(event.sameFunderBuyers),
    sniperBuyers: num(event.sniperBuyers),
    buyVolumeUsd: num(event.buyVolumeUsd),
    sellVolumeUsd: num(event.sellVolumeUsd),
    deployerNetFlow: num(event.deployerNetFlow),
    liquidityChange: num(event.liquidityChange),
    evidenceConfidence: num(event.evidenceConfidence || defaults.evidenceConfidence || 55),
    exactIdentityEvidence: event.exactIdentityEvidence || null,
    raw: event.raw || null,
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
