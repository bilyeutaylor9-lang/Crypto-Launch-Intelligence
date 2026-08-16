import { jsonRpc, jsonRpcBatch } from "./rpcJsonClient.js";
import {
  SELECTORS,
  addressFromTopic,
  decodeAddress,
  decodeInt,
  decodeUint,
  wordAt,
} from "./evmAbi.js";
import { chainProfileFor, quoteUsdFor } from "./chainProfiles.js";
import { keccak256Hex } from "./keccak256.js";

const Q96 = 2 ** 96;
const WINDOW_SPECS = [
  ["5m", 5 * 60],
  ["15m", 15 * 60],
  ["1h", 60 * 60],
  ["6h", 6 * 60 * 60],
];

export const UNISWAP_V3_EVENT_TOPICS = Object.freeze({
  SWAP: keccak256Hex("Swap(address,address,int256,int256,uint160,uint128,int24)"),
  MINT: keccak256Hex("Mint(address,address,int24,int24,uint128,uint256,uint256)"),
  BURN: keccak256Hex("Burn(address,int24,int24,uint128,uint256,uint256)"),
});

function lower(value = "") {
  return String(value || "").toLowerCase();
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hexInt(value) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (!value) return null;
  const parsed = Number.parseInt(String(value), 16);
  return Number.isFinite(parsed) ? parsed : null;
}

function bigintDecimal(value, decimals = 18) {
  const raw = typeof value === "bigint" ? value : BigInt(value || 0);
  const scale = 10n ** BigInt(Math.max(0, decimals));
  const whole = raw / scale;
  const fraction = raw % scale;
  return Number(whole) + Number(fraction) / Number(scale);
}

function median(values = []) {
  const rows = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!rows.length) return null;
  const middle = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[middle] : (rows[middle - 1] + rows[middle]) / 2;
}

function pctChange(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

async function ethCall(rpcUrl, to, data, blockTag, options = {}) {
  return jsonRpc(rpcUrl, "eth_call", [{ to, data }, blockTag], options);
}

async function readPoolContext(rpcUrl, poolAddress, blockTag, options = {}) {
  const [token0Hex, token1Hex, slot0Hex] = await Promise.all([
    ethCall(rpcUrl, poolAddress, SELECTORS.token0, blockTag, options),
    ethCall(rpcUrl, poolAddress, SELECTORS.token1, blockTag, options),
    ethCall(rpcUrl, poolAddress, SELECTORS.slot0, blockTag, options),
  ]);
  const token0 = decodeAddress(token0Hex);
  const token1 = decodeAddress(token1Hex);
  const [dec0Hex, dec1Hex] = await Promise.all([
    ethCall(rpcUrl, token0, SELECTORS.decimals, blockTag, options),
    ethCall(rpcUrl, token1, SELECTORS.decimals, blockTag, options),
  ]);
  return {
    token0,
    token1,
    token0Decimals: Number(decodeUint(dec0Hex, 0)),
    token1Decimals: Number(decodeUint(dec1Hex, 0)),
    sqrtPriceX96: Number(decodeUint(slot0Hex, 0)),
    tick: Number(decodeInt(slot0Hex, 1, 24)),
  };
}

function humanPrice1Per0(sqrtPriceX96, decimals0, decimals1) {
  if (!(sqrtPriceX96 > 0)) return null;
  const raw = (sqrtPriceX96 / Q96) ** 2;
  const adjusted = raw * (10 ** (decimals0 - decimals1));
  return Number.isFinite(adjusted) && adjusted > 0 ? adjusted : null;
}

function priceContext(pool, tokenAddress, quoteUsd, project = {}) {
  const target = lower(tokenAddress);
  const tokenIs0 = target === lower(pool.token0);
  const tokenIs1 = target === lower(pool.token1);
  if (!tokenIs0 && !tokenIs1) return { status: "TOKEN_NOT_IN_POOL" };
  const price1Per0 = humanPrice1Per0(pool.sqrtPriceX96, pool.token0Decimals, pool.token1Decimals);
  const explicitTargetUsd = finite(project.priceUsd ?? project.price ?? project.marketData?.priceUsd);
  let token0Usd = null;
  let token1Usd = null;
  if (tokenIs0 && quoteUsd?.priceUsd && price1Per0) {
    token1Usd = quoteUsd.priceUsd;
    token0Usd = explicitTargetUsd || price1Per0 * token1Usd;
  } else if (tokenIs1 && quoteUsd?.priceUsd && price1Per0) {
    token0Usd = quoteUsd.priceUsd;
    token1Usd = explicitTargetUsd || token0Usd / price1Per0;
  }
  return {
    status: quoteUsd?.priceUsd ? "PRICED" : "UNPRICED",
    tokenIs0,
    tokenIs1,
    targetTokenUsd: tokenIs0 ? token0Usd : token1Usd,
    token0Usd,
    token1Usd,
    price1Per0,
  };
}

async function fetchLogsChunked(rpcUrl, poolAddress, fromBlock, toBlock, options = {}) {
  const chunkSize = Math.max(100, Math.min(5_000, Number(options.logChunkBlocks || 2_000)));
  const maxLogs = Math.max(50, Math.min(10_000, Number(options.maxLogs || 1_500)));
  const topics = [[
    UNISWAP_V3_EVENT_TOPICS.SWAP,
    UNISWAP_V3_EVENT_TOPICS.MINT,
    UNISWAP_V3_EVENT_TOPICS.BURN,
  ]];
  const rows = [];
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(toBlock, start + chunkSize - 1);
    const result = await jsonRpc(rpcUrl, "eth_getLogs", [{
      address: poolAddress,
      fromBlock: `0x${BigInt(start).toString(16)}`,
      toBlock: `0x${BigInt(end).toString(16)}`,
      topics,
    }], options);
    if (Array.isArray(result)) rows.push(...result.filter((log) => !log.removed));
    if (rows.length > maxLogs * 2) rows.splice(0, rows.length - maxLogs * 2);
  }
  return rows
    .sort((a, b) => (hexInt(a.blockNumber) ?? 0) - (hexInt(b.blockNumber) ?? 0) || (hexInt(a.logIndex) ?? 0) - (hexInt(b.logIndex) ?? 0))
    .slice(-maxLogs);
}

async function blockTimestampMap(rpcUrl, logs, safeBlock, profile, options = {}) {
  const blocks = [...new Set(logs.map((log) => lower(log.blockNumber)).filter(Boolean))];
  const out = new Map();
  const batchSize = Math.max(1, Math.min(100, Number(options.blockTimestampBatchSize || 50)));
  let batchSucceeded = true;
  try {
    for (let i = 0; i < blocks.length; i += batchSize) {
      const group = blocks.slice(i, i + batchSize);
      const responses = await jsonRpcBatch(rpcUrl, group.map((block) => ({
        method: "eth_getBlockByNumber",
        params: [block, false],
      })), options);
      responses.forEach((response, index) => {
        const timestamp = hexInt(response?.result?.timestamp);
        if (timestamp !== null) out.set(group[index], { timestamp, mode: "RPC_BLOCK_TIMESTAMP" });
      });
    }
  } catch {
    batchSucceeded = false;
  }

  const safeNumber = hexInt(safeBlock?.number);
  const safeTimestamp = hexInt(safeBlock?.timestamp);
  const blockTime = Number(profile?.blockTimeSeconds || options.blockTimeSeconds || 2);
  for (const blockHex of blocks) {
    if (out.has(blockHex)) continue;
    const number = hexInt(blockHex);
    if (number !== null && safeNumber !== null && safeTimestamp !== null) {
      out.set(blockHex, {
        timestamp: Math.max(0, Math.round(safeTimestamp - (safeNumber - number) * blockTime)),
        mode: "BLOCK_TIME_ESTIMATE",
      });
    }
  }
  return { map: out, batchSucceeded };
}

function eventKey(log) {
  return `${lower(log.transactionHash)}:${hexInt(log.logIndex) ?? lower(log.logIndex)}`;
}

function swapPriceUsd(sqrtPriceX96, pool, priceCtx, targetTokenAddress) {
  const p10 = humanPrice1Per0(Number(sqrtPriceX96), pool.token0Decimals, pool.token1Decimals);
  if (!p10) return null;
  if (lower(targetTokenAddress) === lower(pool.token0) && priceCtx.token1Usd) return p10 * priceCtx.token1Usd;
  if (lower(targetTokenAddress) === lower(pool.token1) && priceCtx.token0Usd) return priceCtx.token0Usd / p10;
  return null;
}

function commonLog(log, project, timestamp) {
  return {
    eventKey: eventKey(log),
    chain: project.chain || project.canonicalChain || null,
    tokenAddress: lower(project.tokenAddress || project.contractAddress || project.address),
    poolAddress: lower(project.poolAddress || project.pairAddress || project.primaryTradablePool),
    eventTime: timestamp ? new Date(timestamp.timestamp * 1000).toISOString() : null,
    timestampMode: timestamp?.mode || "UNKNOWN",
    observedAt: new Date().toISOString(),
    blockNumber: hexInt(log.blockNumber),
    blockHash: log.blockHash || null,
    txHash: log.transactionHash || null,
    logIndex: hexInt(log.logIndex),
    reorgSafe: true,
    source: "UNISWAP_V3_POOL_EVENTS",
  };
}

function decodeSwap(log, context) {
  const { pool, project, priceCtx, timestamp, quoteUsd } = context;
  const amount0 = decodeInt(log.data, 0, 256);
  const amount1 = decodeInt(log.data, 1, 256);
  const sqrtPriceX96 = decodeUint(log.data, 2);
  const liquidityRaw = decodeUint(log.data, 3);
  const tick = Number(decodeInt(log.data, 4, 24));
  const targetIs0 = lower(project.tokenAddress || project.contractAddress || project.address) === lower(pool.token0);
  const targetRaw = targetIs0 ? amount0 : amount1;
  const quoteRaw = targetIs0 ? amount1 : amount0;
  const targetDecimals = targetIs0 ? pool.token0Decimals : pool.token1Decimals;
  const quoteDecimals = targetIs0 ? pool.token1Decimals : pool.token0Decimals;
  const side = targetRaw < 0n ? "BUY" : targetRaw > 0n ? "SELL" : "UNKNOWN";
  const targetTokenAmount = Math.abs(bigintDecimal(targetRaw, targetDecimals));
  const quoteTokenAmount = Math.abs(bigintDecimal(quoteRaw, quoteDecimals));
  const usdNotional = quoteUsd?.priceUsd ? quoteTokenAmount * quoteUsd.priceUsd : null;
  const sender = addressFromTopic(log.topics?.[1]);
  const recipient = addressFromTopic(log.topics?.[2]);
  return {
    ...commonLog(log, project, timestamp),
    eventType: "SWAP",
    side,
    sender,
    recipient,
    actorAddress: side === "BUY" ? recipient : sender,
    actorConfidencePct: 35,
    routerAdjusted: false,
    participantIdentityMode: "POOL_EVENT_ACTORS_UNADJUSTED",
    targetTokenAmount,
    quoteTokenAmount,
    usdNotional: usdNotional === null ? null : Number(usdNotional.toFixed(2)),
    executionPriceUsd: swapPriceUsd(sqrtPriceX96, pool, priceCtx, project.tokenAddress || project.contractAddress || project.address),
    tick,
    sqrtPriceX96: sqrtPriceX96.toString(),
    poolLiquidityRaw: liquidityRaw.toString(),
  };
}

function decodeMint(log, context) {
  const { pool, project, priceCtx, timestamp } = context;
  const owner = addressFromTopic(log.topics?.[1]);
  const tickLower = Number(decodeInt(log.topics?.[2] || "0x", 0, 24));
  const tickUpper = Number(decodeInt(log.topics?.[3] || "0x", 0, 24));
  const sender = decodeAddress(log.data, 0);
  const amount = decodeUint(log.data, 1);
  const amount0 = decodeUint(log.data, 2);
  const amount1 = decodeUint(log.data, 3);
  const token0Amount = bigintDecimal(amount0, pool.token0Decimals);
  const token1Amount = bigintDecimal(amount1, pool.token1Decimals);
  const amount0Usd = priceCtx.token0Usd ? token0Amount * priceCtx.token0Usd : null;
  const amount1Usd = priceCtx.token1Usd ? token1Amount * priceCtx.token1Usd : null;
  const knownUsd = [amount0Usd, amount1Usd].filter((value) => value !== null);
  return {
    ...commonLog(log, project, timestamp),
    eventType: "MINT",
    owner,
    sender,
    actorAddress: owner,
    actorConfidencePct: 100,
    routerAdjusted: true,
    tickLower,
    tickUpper,
    activeRange: tickLower <= pool.tick && pool.tick < tickUpper,
    liquidityChangeRaw: amount.toString(),
    token0Amount,
    token1Amount,
    liquidityUsdNotional: knownUsd.length ? Number(knownUsd.reduce((sum, value) => sum + value, 0).toFixed(2)) : null,
    usdNotionalMode: knownUsd.length === 2 ? "BOTH_POOL_TOKENS_PRICED" : knownUsd.length === 1 ? "ONE_POOL_TOKEN_PRICED" : "UNPRICED",
  };
}

function decodeBurn(log, context) {
  const { pool, project, priceCtx, timestamp } = context;
  const owner = addressFromTopic(log.topics?.[1]);
  const tickLower = Number(decodeInt(log.topics?.[2] || "0x", 0, 24));
  const tickUpper = Number(decodeInt(log.topics?.[3] || "0x", 0, 24));
  const amount = decodeUint(log.data, 0);
  const amount0 = decodeUint(log.data, 1);
  const amount1 = decodeUint(log.data, 2);
  const token0Amount = bigintDecimal(amount0, pool.token0Decimals);
  const token1Amount = bigintDecimal(amount1, pool.token1Decimals);
  const amount0Usd = priceCtx.token0Usd ? token0Amount * priceCtx.token0Usd : null;
  const amount1Usd = priceCtx.token1Usd ? token1Amount * priceCtx.token1Usd : null;
  const knownUsd = [amount0Usd, amount1Usd].filter((value) => value !== null);
  return {
    ...commonLog(log, project, timestamp),
    eventType: "BURN",
    owner,
    actorAddress: owner,
    actorConfidencePct: 100,
    routerAdjusted: true,
    tickLower,
    tickUpper,
    activeRange: tickLower <= pool.tick && pool.tick < tickUpper,
    liquidityChangeRaw: `-${amount.toString()}`,
    burnedLiquidityRaw: amount.toString(),
    token0Amount,
    token1Amount,
    liquidityUsdNotional: knownUsd.length ? Number(knownUsd.reduce((sum, value) => sum + value, 0).toFixed(2)) : null,
    usdNotionalMode: knownUsd.length === 2 ? "BOTH_POOL_TOKENS_PRICED" : knownUsd.length === 1 ? "ONE_POOL_TOKEN_PRICED" : "UNPRICED",
  };
}

function decodeLog(log, context) {
  const topic = lower(log.topics?.[0]);
  if (topic === lower(UNISWAP_V3_EVENT_TOPICS.SWAP)) return decodeSwap(log, context);
  if (topic === lower(UNISWAP_V3_EVENT_TOPICS.MINT)) return decodeMint(log, context);
  if (topic === lower(UNISWAP_V3_EVENT_TOPICS.BURN)) return decodeBurn(log, context);
  return null;
}

function sumBigInt(events, predicate, field) {
  return events.filter(predicate).reduce((sum, event) => {
    try {
      const raw = event[field];
      if (raw === null || raw === undefined) return sum;
      return sum + BigInt(String(raw));
    } catch {
      return sum;
    }
  }, 0n);
}

function buildWindow(events, key, seconds, nowMs) {
  const cutoff = nowMs - seconds * 1000;
  const rows = events.filter((event) => {
    const ms = new Date(event.eventTime || 0).getTime();
    return Number.isFinite(ms) && ms >= cutoff && ms <= nowMs + 60_000;
  });
  const swaps = rows.filter((event) => event.eventType === "SWAP");
  const buys = swaps.filter((event) => event.side === "BUY");
  const sells = swaps.filter((event) => event.side === "SELL");
  const pricedSwaps = swaps.filter((event) => Number.isFinite(event.usdNotional));
  const buyVolumeUsd = buys.reduce((sum, event) => sum + (finite(event.usdNotional) || 0), 0);
  const sellVolumeUsd = sells.reduce((sum, event) => sum + (finite(event.usdNotional) || 0), 0);
  const lpMints = rows.filter((event) => event.eventType === "MINT");
  const lpBurns = rows.filter((event) => event.eventType === "BURN");
  const activeMints = lpMints.filter((event) => event.activeRange === true);
  const activeBurns = lpBurns.filter((event) => event.activeRange === true);
  const mintRaw = sumBigInt(activeMints, () => true, "liquidityChangeRaw");
  const burnRaw = activeBurns.reduce((sum, event) => {
    try { return sum + BigInt(event.burnedLiquidityRaw || 0); } catch { return sum; }
  }, 0n);
  const totalLpRaw = mintRaw + burnRaw;
  const withdrawalPressurePct = totalLpRaw > 0n ? Number((burnRaw * 10_000n) / totalLpRaw) / 100 : null;
  const refillRatioPct = burnRaw > 0n ? Number((mintRaw * 10_000n) / burnRaw) / 100 : null;
  const liquidityAddedUsd = lpMints.reduce((sum, event) => sum + (finite(event.liquidityUsdNotional) || 0), 0);
  const liquidityRemovedUsd = lpBurns.reduce((sum, event) => sum + (finite(event.liquidityUsdNotional) || 0), 0);
  const firstPrice = swaps.find((event) => Number.isFinite(event.executionPriceUsd))?.executionPriceUsd ?? null;
  const lastPrice = [...swaps].reverse().find((event) => Number.isFinite(event.executionPriceUsd))?.executionPriceUsd ?? null;
  const volumeKnown = pricedSwaps.length > 0;
  const uniqueBuyers = new Set(buys.map((event) => event.actorAddress).filter(Boolean));
  const uniqueSellers = new Set(sells.map((event) => event.actorAddress).filter(Boolean));
  return {
    window: key,
    windowSeconds: seconds,
    swaps: swaps.length,
    buySwaps: buys.length,
    sellSwaps: sells.length,
    buyVolumeUsd: volumeKnown ? Number(buyVolumeUsd.toFixed(2)) : null,
    sellVolumeUsd: volumeKnown ? Number(sellVolumeUsd.toFixed(2)) : null,
    netFlowUsd: volumeKnown ? Number((buyVolumeUsd - sellVolumeUsd).toFixed(2)) : null,
    uniqueObservedBuyers: uniqueBuyers.size || null,
    uniqueObservedSellers: uniqueSellers.size || null,
    uniqueBuyers: uniqueBuyers.size || null,
    uniqueSellers: uniqueSellers.size || null,
    participantIdentityMode: "POOL_EVENT_ACTORS_UNADJUSTED",
    participantIdentityConfidencePct: 35,
    routerAdjusted: false,
    priceStartUsd: finite(firstPrice),
    priceEndUsd: finite(lastPrice),
    priceDeltaPct: firstPrice && lastPrice ? pctChange(firstPrice, lastPrice) : null,
    liquidityAddedUsd: lpMints.some((event) => event.liquidityUsdNotional !== null) ? Number(liquidityAddedUsd.toFixed(2)) : null,
    liquidityRemovedUsd: lpBurns.some((event) => event.liquidityUsdNotional !== null) ? Number(liquidityRemovedUsd.toFixed(2)) : null,
    activeLiquidityMintRaw: mintRaw.toString(),
    activeLiquidityBurnRaw: burnRaw.toString(),
    netActiveLiquidityChangeRaw: (mintRaw - burnRaw).toString(),
    activeLiquidityWithdrawalPressurePct: withdrawalPressurePct,
    activeLiquidityRefillRatioPct: refillRatioPct,
    evidenceMode: "OBSERVED_POOL_EVENT_TAPE",
  };
}

function intervalAcceleration(events) {
  const swaps = events.filter((event) => event.eventType === "SWAP" && event.eventTime)
    .map((event) => new Date(event.eventTime).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (swaps.length < 7) return { state: "INSUFFICIENT_EVENTS", ratio: null, recentMedianSeconds: null, priorMedianSeconds: null };
  const intervals = swaps.slice(1).map((time, index) => Math.max(0.001, (time - swaps[index]) / 1000));
  const split = Math.max(2, Math.floor(intervals.length / 2));
  const prior = median(intervals.slice(0, split));
  const recent = median(intervals.slice(split));
  if (!(prior > 0) || !(recent > 0)) return { state: "INSUFFICIENT_EVENTS", ratio: null, recentMedianSeconds: recent, priorMedianSeconds: prior };
  const ratio = prior / recent;
  return {
    state: ratio >= 2 ? "EVENT_TIME_ACCELERATING_FAST" : ratio >= 1.35 ? "EVENT_TIME_ACCELERATING" : ratio <= 0.7 ? "EVENT_TIME_DECELERATING" : "EVENT_TIME_STABLE",
    ratio: Number(ratio.toFixed(3)),
    recentMedianSeconds: Number(recent.toFixed(2)),
    priorMedianSeconds: Number(prior.toFixed(2)),
  };
}

function sequenceCompression(events, options = {}) {
  const minSwapUsd = Math.max(0, Number(options.minMeaningfulSwapUsd || 1_000));
  const meaningful = events.filter((event) =>
    event.eventTime && (
      (event.eventType === "SWAP" && (event.usdNotional === null || event.usdNotional >= minSwapUsd)) ||
      (["MINT", "BURN"].includes(event.eventType) && event.activeRange === true)
    )
  ).map((event) => new Date(event.eventTime).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
  if (meaningful.length < 7) return { state: "INSUFFICIENT_EVENTS", ratio: null };
  const intervals = meaningful.slice(1).map((time, index) => Math.max(0.001, (time - meaningful[index]) / 1000));
  const split = Math.max(2, Math.floor(intervals.length / 2));
  const prior = median(intervals.slice(0, split));
  const recent = median(intervals.slice(split));
  if (!(prior > 0) || !(recent > 0)) return { state: "INSUFFICIENT_EVENTS", ratio: null };
  const ratio = prior / recent;
  return {
    state: ratio >= 2 ? "SEQUENCE_COMPRESSING_FAST" : ratio >= 1.35 ? "SEQUENCE_COMPRESSING" : ratio <= 0.7 ? "SEQUENCE_EXPANDING" : "SEQUENCE_STABLE",
    ratio: Number(ratio.toFixed(3)),
    priorMedianSeconds: Number(prior.toFixed(2)),
    recentMedianSeconds: Number(recent.toFixed(2)),
  };
}

function refillHalfLife(events) {
  const active = events.filter((event) => event.activeRange === true && ["MINT", "BURN"].includes(event.eventType) && event.eventTime)
    .sort((a, b) => new Date(a.eventTime) - new Date(b.eventTime));
  const recoveredMinutes = [];
  let unresolvedBurns = 0;
  for (let i = 0; i < active.length; i += 1) {
    const burn = active[i];
    if (burn.eventType !== "BURN") continue;
    let burnRaw;
    try { burnRaw = BigInt(burn.burnedLiquidityRaw || 0); } catch { continue; }
    if (burnRaw <= 0n) continue;
    const target = (burnRaw + 1n) / 2n;
    let filled = 0n;
    let recoveredAt = null;
    for (let j = i + 1; j < active.length; j += 1) {
      const event = active[j];
      if (event.eventType !== "MINT") continue;
      try { filled += BigInt(event.liquidityChangeRaw || 0); } catch { /* ignore */ }
      if (filled >= target) {
        recoveredAt = new Date(event.eventTime).getTime();
        break;
      }
    }
    if (recoveredAt) {
      const startedAt = new Date(burn.eventTime).getTime();
      recoveredMinutes.push((recoveredAt - startedAt) / 60_000);
    } else {
      unresolvedBurns += 1;
    }
  }
  const halfLife = median(recoveredMinutes);
  return {
    halfLifeMinutes: halfLife === null ? null : Number(halfLife.toFixed(2)),
    observedRecoveries: recoveredMinutes.length,
    unresolvedBurns,
    state: halfLife === null
      ? (unresolvedBurns ? "NOT_REFILLED_WITHIN_LOOKBACK" : "NO_ACTIVE_BURNS")
      : halfLife <= 5 ? "FAST_REFILL" : halfLife <= 30 ? "MODERATE_REFILL" : "SLOW_REFILL",
    mode: "OBSERVED_ACTIVE_RANGE_EVENT_RECOVERY_PROXY",
  };
}

function lpRangeMigration(events, currentTick, tokenIs0, tickSpacing = 1) {
  const mints = events.filter((event) => event.eventType === "MINT" && event.tickLower !== null && event.tickUpper !== null);
  if (!mints.length) return { state: "UNOBSERVED", weightedTickDistance: null, mintEvents: 0 };
  let weighted = 0;
  let weight = 0;
  const orientation = tokenIs0 ? 1 : -1;
  for (const event of mints) {
    let raw;
    try { raw = Number(BigInt(event.liquidityChangeRaw || 0)); } catch { raw = 0; }
    if (!(raw > 0) || !Number.isFinite(raw)) continue;
    const center = (event.tickLower + event.tickUpper) / 2;
    const distance = orientation * (center - currentTick);
    weighted += distance * raw;
    weight += raw;
  }
  if (!(weight > 0)) return { state: "UNOBSERVED", weightedTickDistance: null, mintEvents: mints.length };
  const distance = weighted / weight;
  const threshold = Math.max(1, Math.abs(tickSpacing) * 3);
  return {
    state: distance >= threshold ? "UPSIDE_REPOSITIONING" : distance <= -threshold ? "DOWNSIDE_REPOSITIONING" : "AROUND_SPOT",
    weightedTickDistance: Number(distance.toFixed(2)),
    mintEvents: mints.length,
    orientation: tokenIs0 ? "HIGHER_TICK_IS_TARGET_UP" : "LOWER_TICK_IS_TARGET_UP",
  };
}

export async function observeUniswapV3EventTape(project = {}, options = {}) {
  const chain = project.chain || project.canonicalChain || project.network || options.chain;
  const profile = options.chainProfile || chainProfileFor(chain);
  const poolAddress = lower(project.poolAddress || project.pairAddress || project.primaryTradablePool || options.poolAddress);
  const tokenAddress = lower(project.tokenAddress || project.contractAddress || project.address || options.tokenAddress);
  if (!profile && !options.rpcUrl) return { status: "UNSUPPORTED_CHAIN", source: "UNISWAP_V3_POOL_EVENTS", shadowOnly: true };
  if (!/^0x[0-9a-f]{40}$/i.test(poolAddress) || !/^0x[0-9a-f]{40}$/i.test(tokenAddress)) {
    return { status: "MISSING_POOL_OR_TOKEN_ADDRESS", source: "UNISWAP_V3_POOL_EVENTS", shadowOnly: true };
  }

  const rpcUrl = options.rpcUrl || profile.rpcUrl;
  const rpcOptions = { timeoutMs: options.timeoutMs || 10_000, retries: options.retries ?? 1 };
  try {
    const safeBlock = await jsonRpc(rpcUrl, "eth_getBlockByNumber", [options.blockTag || profile?.safeBlockTag || "safe", false], rpcOptions);
    const toBlock = hexInt(safeBlock?.number);
    if (toBlock === null) return { status: "SAFE_BLOCK_UNOBSERVED", source: "UNISWAP_V3_POOL_EVENTS", shadowOnly: true };
    const pool = await readPoolContext(rpcUrl, poolAddress, safeBlock.number, rpcOptions);
    const tokenIs0 = tokenAddress === lower(pool.token0);
    const tokenIs1 = tokenAddress === lower(pool.token1);
    if (!tokenIs0 && !tokenIs1) return { status: "TOKEN_NOT_IN_POOL", source: "UNISWAP_V3_POOL_EVENTS", shadowOnly: true };
    const quoteAddress = tokenIs0 ? pool.token1 : pool.token0;
    const quoteUsd = quoteUsdFor(profile, quoteAddress, {
      quoteTokenUsdPrice: project.quoteTokenUsdPrice || options.quoteTokenUsdPrice,
      quoteTokenSymbol: project.quoteTokenSymbol || options.quoteTokenSymbol,
      quoteTokenUsdConfidencePct: project.quoteTokenUsdConfidencePct || options.quoteTokenUsdConfidencePct,
    });
    const priceCtx = priceContext(pool, tokenAddress, quoteUsd, project);
    const lookbackSeconds = Math.max(5 * 60, Number(options.lookbackSeconds || process.env.IGNITION_EVENT_TAPE_LOOKBACK_SECONDS || 6 * 60 * 60));
    const blockTime = Math.max(0.1, Number(profile?.blockTimeSeconds || options.blockTimeSeconds || 2));
    const fromBlock = Math.max(0, toBlock - Math.ceil(lookbackSeconds / blockTime));
    const logs = await fetchLogsChunked(rpcUrl, poolAddress, fromBlock, toBlock, { ...rpcOptions, ...options });
    const timestamps = await blockTimestampMap(rpcUrl, logs, safeBlock, profile, { ...rpcOptions, ...options });
    const events = logs.flatMap((log) => {
      const decoded = decodeLog(log, {
        pool,
        project: { ...project, tokenAddress, poolAddress, chain },
        priceCtx,
        quoteUsd,
        timestamp: timestamps.map.get(lower(log.blockNumber)) || null,
      });
      return decoded ? [decoded] : [];
    });
    const safeTimestamp = hexInt(safeBlock.timestamp);
    const nowMs = safeTimestamp ? safeTimestamp * 1000 : Date.now();
    const windows = Object.fromEntries(WINDOW_SPECS.map(([key, seconds]) => [key, buildWindow(events, key, seconds, nowMs)]));
    const refill = refillHalfLife(events);
    const eventAcceleration = intervalAcceleration(events);
    const compression = sequenceCompression(events, options);
    const migration = lpRangeMigration(events, pool.tick, tokenIs0, project.tickSpacing || 1);
    const status = !events.length
      ? "OBSERVED_NO_RECENT_POOL_EVENTS"
      : quoteUsd?.priceUsd
        ? "OBSERVED_EVENT_TAPE"
        : "OBSERVED_EVENT_TAPE_UNPRICED";

    return {
      status,
      source: "UNISWAP_V3_POOL_EVENTS",
      observedAt: new Date(nowMs).toISOString(),
      chain,
      blockNumber: toBlock,
      fromBlock,
      lookbackSeconds,
      poolAddress,
      tokenAddress,
      poolState: {
        token0: pool.token0,
        token1: pool.token1,
        token0Decimals: pool.token0Decimals,
        token1Decimals: pool.token1Decimals,
        currentTick: pool.tick,
        targetTokenIs0: tokenIs0,
        quoteTokenAddress: quoteAddress,
        quoteUsd: quoteUsd || null,
      },
      eventsScanned: events.length,
      swapEvents: events.filter((event) => event.eventType === "SWAP").length,
      mintEvents: events.filter((event) => event.eventType === "MINT").length,
      burnEvents: events.filter((event) => event.eventType === "BURN").length,
      timestampMode: timestamps.batchSucceeded ? "RPC_BLOCK_TIMESTAMP_WITH_FALLBACK" : "BLOCK_TIME_ESTIMATE",
      marketMicrostructure: {
        source: "UNISWAP_V3_POOL_EVENTS",
        protocolAware: true,
        windows,
        swapTimeAcceleration: eventAcceleration,
        sequenceCompression: compression,
        participantIdentityMode: "POOL_EVENT_ACTORS_UNADJUSTED",
        participantIdentityConfidencePct: 35,
        routerAdjusted: false,
        reorgSafe: true,
      },
      lpEventTape: {
        refillHalfLife: refill,
        rangeMigration: migration,
        currentTick: pool.tick,
        activeMintCount: events.filter((event) => event.eventType === "MINT" && event.activeRange === true).length,
        activeBurnCount: events.filter((event) => event.eventType === "BURN" && event.activeRange === true).length,
      },
      meaningfulEventTimestamps: events.filter((event) => event.eventTime).slice(-128).map((event) => event.eventTime),
      events,
      policy: "Pool events are observed from finalized/safe chain state. Swap actors are not assumed to be end users; router-adjusted wallet identity remains unobserved until separately resolved.",
      shadowOnly: true,
      rankingInfluence: false,
    };
  } catch (error) {
    return {
      status: "SENSOR_FAILED",
      source: "UNISWAP_V3_POOL_EVENTS",
      error: error.message,
      shadowOnly: true,
      rankingInfluence: false,
    };
  }
}

export const __uniswapV3EventTapeSensorTestHooks = {
  buildWindow,
  decodeLog,
  intervalAcceleration,
  lpRangeMigration,
  priceContext,
  refillHalfLife,
  sequenceCompression,
};

export default observeUniswapV3EventTape;
