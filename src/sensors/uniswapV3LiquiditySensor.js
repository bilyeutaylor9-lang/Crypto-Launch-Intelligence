import { jsonRpc } from "./rpcJsonClient.js";
import {
  SELECTORS,
  callData,
  decodeAddress,
  decodeInt,
  decodeUint,
  encodeSignedWord,
} from "./evmAbi.js";
import { chainProfileFor, quoteUsdFor } from "./chainProfiles.js";

const Q96 = 2 ** 96;
const MIN_TICK = -887272;
const MAX_TICK = 887272;
const MOVE_TARGETS = [1, 2, 5, 10, 25, 50, 100];

function lower(value = "") {
  return String(value || "").toLowerCase();
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function floorDiv(a, b) {
  return Math.floor(a / b);
}

function sqrtRatioAtTick(tick) {
  return Math.pow(1.0001, tick / 2) * Q96;
}

function tickForPriceMove(currentTick, movePct, tokenIs0) {
  const ratio = 1 + Number(movePct) / 100;
  const delta = Math.log(ratio) / Math.log(1.0001);
  return Math.max(MIN_TICK, Math.min(MAX_TICK, tokenIs0 ? currentTick + delta : currentTick - delta));
}

function amount1Delta(liquidity, sqrtA, sqrtB) {
  return liquidity * Math.abs(sqrtB - sqrtA) / Q96;
}

function amount0Delta(liquidity, sqrtA, sqrtB) {
  const low = Math.min(sqrtA, sqrtB);
  const high = Math.max(sqrtA, sqrtB);
  if (!(low > 0) || !(high > 0)) return null;
  return liquidity * Q96 * (high - low) / (high * low);
}

function decodeSlot0(hex) {
  return {
    sqrtPriceX96: Number(decodeUint(hex, 0)),
    tick: Number(decodeInt(hex, 1, 24)),
  };
}

function decodeTickInfo(hex) {
  return {
    liquidityGross: Number(decodeUint(hex, 0)),
    liquidityNet: Number(decodeInt(hex, 1, 128)),
    initialized: decodeUint(hex, 7) !== 0n,
  };
}

function bitsSet(bitmap) {
  const out = [];
  let value = BigInt(bitmap);
  for (let bit = 0; bit < 256; bit += 1) {
    if ((value & (1n << BigInt(bit))) !== 0n) out.push(bit);
  }
  return out;
}

async function ethCall(rpcUrl, to, data, blockTag, options = {}) {
  return jsonRpc(rpcUrl, "eth_call", [{ to, data }, blockTag], options);
}

async function readPoolSnapshot(rpcUrl, poolAddress, blockTag, options = {}) {
  const [token0Hex, token1Hex, feeHex, spacingHex, slot0Hex, liquidityHex] = await Promise.all([
    ethCall(rpcUrl, poolAddress, SELECTORS.token0, blockTag, options),
    ethCall(rpcUrl, poolAddress, SELECTORS.token1, blockTag, options),
    ethCall(rpcUrl, poolAddress, SELECTORS.fee, blockTag, options),
    ethCall(rpcUrl, poolAddress, SELECTORS.tickSpacing, blockTag, options),
    ethCall(rpcUrl, poolAddress, SELECTORS.slot0, blockTag, options),
    ethCall(rpcUrl, poolAddress, SELECTORS.liquidity, blockTag, options),
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
    fee: Number(decodeUint(feeHex, 0)),
    tickSpacing: Number(decodeInt(spacingHex, 0, 24)),
    ...decodeSlot0(slot0Hex),
    liquidity: Number(decodeUint(liquidityHex, 0)),
  };
}

async function readInitializedTicks(rpcUrl, poolAddress, currentTick, tickSpacing, blockTag, options = {}) {
  const wordRadius = Math.max(1, Math.min(8, Number(options.tickBitmapWordRadius || 2)));
  const maxTicks = Math.max(8, Math.min(160, Number(options.maxInitializedTicks || 96)));
  const compressed = floorDiv(currentTick, tickSpacing);
  const centerWord = floorDiv(compressed, 256);
  const wordPositions = [];
  for (let word = centerWord - wordRadius; word <= centerWord + wordRadius; word += 1) wordPositions.push(word);

  const words = await Promise.all(wordPositions.map(async (wordPos) => {
    const data = callData(SELECTORS.tickBitmap, [encodeSignedWord(wordPos, 16)]);
    const result = await ethCall(rpcUrl, poolAddress, data, blockTag, options);
    return { wordPos, bitmap: decodeUint(result, 0) };
  }));

  const tickIndices = words.flatMap(({ wordPos, bitmap }) =>
    bitsSet(bitmap).map((bit) => (wordPos * 256 + bit) * tickSpacing)
  ).filter((tick) => tick >= MIN_TICK && tick <= MAX_TICK)
    .sort((a, b) => Math.abs(a - currentTick) - Math.abs(b - currentTick))
    .slice(0, maxTicks)
    .sort((a, b) => a - b);

  const ticks = await Promise.all(tickIndices.map(async (tick) => {
    const data = callData(SELECTORS.ticks, [encodeSignedWord(tick, 24)]);
    const result = await ethCall(rpcUrl, poolAddress, data, blockTag, options);
    return { tick, ...decodeTickInfo(result) };
  }));

  const minCompressed = (centerWord - wordRadius) * 256;
  const maxCompressed = (centerWord + wordRadius + 1) * 256 - 1;
  return {
    ticks: ticks.filter((item) => item.initialized),
    scannedMinTick: minCompressed * tickSpacing,
    scannedMaxTick: maxCompressed * tickSpacing,
    bitmapWordsRead: words.length,
  };
}

function simulateQuoteToMove(snapshot, initializedTicks, movePct, tokenIs0, quoteDecimals) {
  const targetTickFloat = tickForPriceMove(snapshot.tick, movePct, tokenIs0);
  const targetSqrt = sqrtRatioAtTick(targetTickFloat);
  let currentSqrt = snapshot.sqrtPriceX96;
  let liquidity = snapshot.liquidity;
  let quoteRaw = 0;

  if (!(liquidity > 0) || !(currentSqrt > 0)) return null;

  if (tokenIs0) {
    const crossings = initializedTicks
      .filter((item) => item.tick > snapshot.tick && item.tick <= targetTickFloat)
      .sort((a, b) => a.tick - b.tick);
    for (const crossing of crossings) {
      const nextSqrt = sqrtRatioAtTick(crossing.tick);
      quoteRaw += amount1Delta(liquidity, currentSqrt, nextSqrt);
      currentSqrt = nextSqrt;
      liquidity += crossing.liquidityNet;
      if (!(liquidity > 0)) return null;
    }
    quoteRaw += amount1Delta(liquidity, currentSqrt, targetSqrt);
  } else {
    const crossings = initializedTicks
      .filter((item) => item.tick < snapshot.tick && item.tick >= targetTickFloat)
      .sort((a, b) => b.tick - a.tick);
    for (const crossing of crossings) {
      const nextSqrt = sqrtRatioAtTick(crossing.tick);
      const delta = amount0Delta(liquidity, currentSqrt, nextSqrt);
      if (delta === null) return null;
      quoteRaw += delta;
      currentSqrt = nextSqrt;
      liquidity -= crossing.liquidityNet;
      if (!(liquidity > 0)) return null;
    }
    const delta = amount0Delta(liquidity, currentSqrt, targetSqrt);
    if (delta === null) return null;
    quoteRaw += delta;
  }

  const feeFraction = snapshot.fee > 0 ? snapshot.fee / 1_000_000 : 0;
  const grossRaw = feeFraction < 1 ? quoteRaw / (1 - feeFraction) : quoteRaw;
  return grossRaw / (10 ** quoteDecimals);
}

export function buildDepthCurveFromSnapshot(snapshot, tickSurface, tokenAddress, quoteUsd, options = {}) {
  const token = lower(tokenAddress);
  const tokenIs0 = token === lower(snapshot.token0);
  const tokenIs1 = token === lower(snapshot.token1);
  if (!tokenIs0 && !tokenIs1) return { status: "TOKEN_NOT_IN_POOL", depthByMovePct: {} };
  if (!quoteUsd?.priceUsd) return { status: "QUOTE_USD_PRICE_UNOBSERVED", depthByMovePct: {} };

  const quoteDecimals = tokenIs0 ? snapshot.token1Decimals : snapshot.token0Decimals;
  const depthByMovePct = {};
  const coverage = {};
  for (const movePct of options.moveTargets || MOVE_TARGETS) {
    const targetTick = tickForPriceMove(snapshot.tick, movePct, tokenIs0);
    const covered = tokenIs0
      ? targetTick <= tickSurface.scannedMaxTick
      : targetTick >= tickSurface.scannedMinTick;
    coverage[String(movePct)] = covered;
    if (!covered) continue;
    const quoteTokens = simulateQuoteToMove(snapshot, tickSurface.ticks, movePct, tokenIs0, quoteDecimals);
    if (quoteTokens === null || !Number.isFinite(quoteTokens) || quoteTokens < 0) continue;
    depthByMovePct[String(movePct)] = Number((quoteTokens * quoteUsd.priceUsd).toFixed(2));
  }
  return {
    status: Object.keys(depthByMovePct).length ? "OBSERVED_CLMM_DEPTH" : "NO_COVERED_DEPTH_TARGETS",
    tokenIs0,
    quoteTokenAddress: tokenIs0 ? snapshot.token1 : snapshot.token0,
    quoteTokenDecimals: quoteDecimals,
    quoteUsd,
    depthByMovePct,
    targetCoverage: coverage,
  };
}

export async function observeUniswapV3Liquidity(project = {}, options = {}) {
  const chain = project.chain || project.canonicalChain || project.network || options.chain;
  const profile = options.chainProfile || chainProfileFor(chain);
  const poolAddress = lower(project.poolAddress || project.pairAddress || project.primaryTradablePool || options.poolAddress);
  const tokenAddress = lower(project.tokenAddress || project.contractAddress || project.address || options.tokenAddress);
  if (!profile && !options.rpcUrl) return { status: "UNSUPPORTED_CHAIN", source: "EVM_CLMM_RPC", shadowOnly: true };
  if (!/^0x[0-9a-f]{40}$/i.test(poolAddress) || !/^0x[0-9a-f]{40}$/i.test(tokenAddress)) {
    return { status: "MISSING_POOL_OR_TOKEN_ADDRESS", source: "EVM_CLMM_RPC", shadowOnly: true };
  }

  const rpcUrl = options.rpcUrl || profile.rpcUrl;
  const rpcOptions = { timeoutMs: options.timeoutMs || 8_000, retries: options.retries ?? 1 };
  try {
    const safeBlock = await jsonRpc(rpcUrl, "eth_getBlockByNumber", [options.blockTag || profile?.safeBlockTag || "safe", false], rpcOptions);
    const blockTag = safeBlock?.number || "latest";
    const snapshot = await readPoolSnapshot(rpcUrl, poolAddress, blockTag, rpcOptions);
    if (!(snapshot.tickSpacing > 0) || !(snapshot.sqrtPriceX96 > 0) || !(snapshot.liquidity > 0)) {
      return { status: "NOT_UNIV3_COMPATIBLE", source: "EVM_CLMM_RPC", blockNumber: blockTag, shadowOnly: true };
    }
    const tickSurface = await readInitializedTicks(rpcUrl, poolAddress, snapshot.tick, snapshot.tickSpacing, blockTag, { ...rpcOptions, ...options });
    const quoteAddress = lower(tokenAddress) === lower(snapshot.token0) ? snapshot.token1 : snapshot.token0;
    const quoteUsd = quoteUsdFor(profile, quoteAddress, {
      quoteTokenUsdPrice: project.quoteTokenUsdPrice ?? options.quoteTokenUsdPrice,
      quoteTokenSymbol: project.quoteTokenSymbol ?? options.quoteTokenSymbol,
      quoteTokenUsdConfidencePct: project.quoteTokenUsdConfidencePct ?? options.quoteTokenUsdConfidencePct,
    });
    const curve = buildDepthCurveFromSnapshot(snapshot, tickSurface, tokenAddress, quoteUsd, options);
    return {
      status: curve.status,
      source: "EVM_UNIV3_COMPATIBLE_RPC",
      observedAt: new Date().toISOString(),
      chainId: profile?.chainId || chain,
      rpcUrl: options.exposeRpcUrl ? rpcUrl : null,
      blockNumber: blockTag,
      poolAddress,
      tokenAddress,
      protocolCompatibility: "UNIV3_POOL_INTERFACE_PROBED",
      poolState: {
        token0: snapshot.token0,
        token1: snapshot.token1,
        fee: snapshot.fee,
        tickSpacing: snapshot.tickSpacing,
        currentTick: snapshot.tick,
        sqrtPriceX96: String(Math.trunc(snapshot.sqrtPriceX96)),
        activeLiquidityRaw: String(Math.trunc(snapshot.liquidity)),
        initializedTicksRead: tickSurface.ticks.length,
        bitmapWordsRead: tickSurface.bitmapWordsRead,
        scannedMinTick: tickSurface.scannedMinTick,
        scannedMaxTick: tickSurface.scannedMaxTick,
      },
      liquiditySurface: {
        depthByMovePct: curve.depthByMovePct,
        targetCoverage: curve.targetCoverage || {},
        quoteTokenAddress: curve.quoteTokenAddress || quoteAddress,
        quoteTokenUsdPrice: quoteUsd?.priceUsd ?? null,
        quotePriceSource: quoteUsd?.source || null,
        sourceConfidencePct: quoteUsd ? Math.min(92, quoteUsd.confidencePct ?? 80) : 0,
        executableQuote: false,
        protocolAware: true,
        blockConsistent: true,
        reorgSafety: blockTag === "latest" ? "LATEST_BLOCK" : "SAFE_OR_EXPLICIT_BLOCK",
      },
      warning: "Depth is a read-only Uniswap-v3-compatible concentrated-liquidity simulation from one block snapshot. It is not an executable quote and does not model pending LP changes, MEV, routing across pools, or future holder selling.",
      shadowOnly: true,
      rankingInfluence: false,
    };
  } catch (error) {
    return {
      status: "SENSOR_FAILED",
      source: "EVM_CLMM_RPC",
      error: error.message,
      poolAddress,
      tokenAddress,
      shadowOnly: true,
      rankingInfluence: false,
    };
  }
}

export const __uniswapV3LiquiditySensorTestHooks = {
  amount0Delta,
  amount1Delta,
  bitsSet,
  decodeSlot0,
  decodeTickInfo,
  floorDiv,
  simulateQuoteToMove,
  sqrtRatioAtTick,
  tickForPriceMove,
};

export default observeUniswapV3Liquidity;
