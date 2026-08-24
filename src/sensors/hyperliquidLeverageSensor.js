import { jsonPost } from "./rpcJsonClient.js";

const DEFAULT_INFO_URL = "https://api.hyperliquid.xyz/info";

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function upper(value = "") {
  return String(value || "").trim().toUpperCase();
}

function normalizeCoin(project = {}, options = {}) {
  return upper(
    options.coin ||
    project.hyperliquidCoin ||
    project.derivatives?.hyperliquidCoin ||
    project.symbol ||
    project.ticker
  );
}

function findAsset(meta = {}, contexts = [], coin = "") {
  const universe = Array.isArray(meta?.universe) ? meta.universe : [];
  const index = universe.findIndex((item) => upper(item?.name) === upper(coin));
  if (index < 0) return null;
  return { meta: universe[index], ctx: contexts[index] || {}, index };
}

function aggregateBookDepth(book = {}, markPrice = null) {
  const mark = finite(markPrice);
  const levels = Array.isArray(book?.levels) ? book.levels : [[], []];
  const bids = Array.isArray(levels[0]) ? levels[0] : [];
  const asks = Array.isArray(levels[1]) ? levels[1] : [];
  const out = {};
  if (!(mark > 0)) return out;

  for (const pct of [1, 2, 5, 10]) {
    const low = mark * (1 - pct / 100);
    const high = mark * (1 + pct / 100);
    const bidUsd = bids.reduce((sum, level) => {
      const px = finite(level?.px);
      const sz = finite(level?.sz);
      return px !== null && sz !== null && px >= low ? sum + px * sz : sum;
    }, 0);
    const askUsd = asks.reduce((sum, level) => {
      const px = finite(level?.px);
      const sz = finite(level?.sz);
      return px !== null && sz !== null && px <= high ? sum + px * sz : sum;
    }, 0);
    out[String(pct)] = {
      bidUsd: Number(bidUsd.toFixed(2)),
      askUsd: Number(askUsd.toFixed(2)),
    };
  }
  return out;
}

export async function observeHyperliquidLeverage(project = {}, options = {}) {
  const coin = normalizeCoin(project, options);
  if (!coin) return { status: "MISSING_SYMBOL", source: "HYPERLIQUID_PUBLIC_INFO", shadowOnly: true };
  const infoUrl = options.infoUrl || process.env.HYPERLIQUID_INFO_URL || DEFAULT_INFO_URL;
  const requestOptions = { timeoutMs: options.timeoutMs || 8_000, retries: options.retries ?? 1 };

  try {
    const payload = await jsonPost(infoUrl, { type: "metaAndAssetCtxs", ...(options.dex ? { dex: options.dex } : {}) }, requestOptions);
    const meta = Array.isArray(payload) ? payload[0] : null;
    const contexts = Array.isArray(payload) ? payload[1] : null;
    if (!meta || !Array.isArray(contexts)) throw new Error("Unexpected metaAndAssetCtxs response shape.");
    const asset = findAsset(meta, contexts, coin);
    if (!asset) {
      return {
        status: "NO_MATCHING_PERP_MARKET",
        source: "HYPERLIQUID_PUBLIC_INFO",
        coin,
        liquidationBands: [],
        shadowOnly: true,
        rankingInfluence: false,
      };
    }

    const markPrice = finite(asset.ctx.markPx ?? asset.ctx.midPx ?? asset.ctx.oraclePx);
    const openInterestBase = finite(asset.ctx.openInterest);
    const openInterestUsd = markPrice !== null && openInterestBase !== null ? markPrice * openInterestBase : null;
    let book = null;
    try {
      book = await jsonPost(infoUrl, {
        type: "l2Book",
        coin,
        ...(options.nSigFigs ? { nSigFigs: options.nSigFigs } : {}),
      }, requestOptions);
    } catch {
      book = null;
    }

    const bookDepthByMovePct = aggregateBookDepth(book || {}, markPrice);
    return {
      status: "OBSERVED_PERP_MARKET",
      source: "HYPERLIQUID_PUBLIC_INFO",
      observedAt: new Date(options.now || Date.now()).toISOString(),
      coin,
      derivatives: {
        venue: "Hyperliquid",
        markPrice,
        oraclePrice: finite(asset.ctx.oraclePx),
        midPrice: finite(asset.ctx.midPx),
        openInterestBase,
        openInterestUsd: openInterestUsd === null ? null : Number(openInterestUsd.toFixed(2)),
        fundingRate: finite(asset.ctx.funding),
        premium: finite(asset.ctx.premium),
        dayNotionalVolumeUsd: finite(asset.ctx.dayNtlVlm),
        bookDepthByMovePct,
        liquidationBands: [],
        liquidationLadderState: "NOT_AVAILABLE_FROM_AGGREGATE_PUBLIC_MARKET_SNAPSHOT",
        sourceConfidencePct: 92,
      },
      warning: "Hyperliquid aggregate public asset context exposes mark price, funding and open interest, but this sensor does not fabricate a system-wide liquidation ladder. Exact liquidation prices depend on account-specific margin state and are left unobserved unless a future position-level source is explicitly added.",
      shadowOnly: true,
      rankingInfluence: false,
    };
  } catch (error) {
    return {
      status: "SENSOR_FAILED",
      source: "HYPERLIQUID_PUBLIC_INFO",
      coin,
      error: error.message,
      liquidationBands: [],
      shadowOnly: true,
      rankingInfluence: false,
    };
  }
}

export const __hyperliquidLeverageSensorTestHooks = {
  aggregateBookDepth,
  findAsset,
};

export default observeHyperliquidLeverage;
