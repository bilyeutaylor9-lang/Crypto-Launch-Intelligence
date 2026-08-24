import { getCoinGeckoMarketsByIds } from "../data/coinGeckoConnector.js";
import { getDefiLlamaStablecoinSnapshot } from "../data/expandedMarketDataConnector.js";
import { observeHyperliquidLeverage } from "../sensors/hyperliquidLeverageSensor.js";
import { finite, median, strictIdentity, timestamp } from "./productionMath.js";

const CONTEXT_FIELDS = Object.freeze([
  "btcReturnPct",
  "ethReturnPct",
  "btcVolatility",
  "btcVolatilityPct",
  "stablecoinSupplyUsd",
  "stablecoinFlowUsd",
  "stablecoinNetFlowUsd",
  "perpFundingRate",
  "openInterestUsd",
  "openInterestChangePct",
  "liquidationUsd",
  "bridgeNetFlowUsd",
  "dexVolumeChangePct",
  "liquidityChangePct",
  "marketBreadthPct",
  "marketBreadthSampleSize",
  "dexVolumeChangeSampleSize",
  "liquidityChangeSampleSize",
]);

function latestPointInTime(rows = [], at) {
  const atMs = timestamp(at);
  if (atMs === null) return null;
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => {
      const rowMs = timestamp(row.observedAt || row.timestamp);
      return rowMs !== null && rowMs <= atMs && !row.__marketContextLedgerParseFailure;
    })
    .sort((left, right) => timestamp(right.observedAt || right.timestamp) - timestamp(left.observedAt || left.timestamp))[0] || null;
}

function percentChange(current, previous) {
  const a = finite(current);
  const b = finite(previous);
  return a === null || b === null || b <= 0 ? null : ((a - b) / b) * 100;
}

function exactRouteCompatible(left = {}, right = {}) {
  const a = strictIdentity(left);
  const b = strictIdentity(right);
  if (!a || !b || a.identityKey !== b.identityKey) return false;
  return !a.poolAddress || !b.poolAddress || a.poolAddress === b.poolAddress;
}

function previousExactObservation(row = {}, history = []) {
  const rowMs = timestamp(row.observedAt || row.timestamp);
  if (rowMs === null) return null;
  return (Array.isArray(history) ? history : [])
    .filter((candidate) => {
      const candidateMs = timestamp(candidate.observedAt || candidate.timestamp);
      return candidateMs !== null && candidateMs < rowMs && exactRouteCompatible(row, candidate);
    })
    .sort((left, right) => timestamp(right.observedAt || right.timestamp) - timestamp(left.observedAt || left.timestamp))[0] || null;
}

export function deriveExactMarketSampleContext(currentRows = [], historyRows = []) {
  const comparisons = (Array.isArray(currentRows) ? currentRows : []).flatMap((row) => {
    if (!strictIdentity(row)) return [];
    const previous = previousExactObservation(row, historyRows);
    if (!previous) return [];
    return [{
      priceChangePct: percentChange(row.priceUsd ?? row.price, previous.priceUsd ?? previous.price),
      volumeChangePct: percentChange(
        row.volume24hUsd ?? row.volume24h,
        previous.volume24hUsd ?? previous.volume24h
      ),
      liquidityChangePct: percentChange(row.liquidityUsd, previous.liquidityUsd),
    }];
  });
  const returns = comparisons.map((row) => row.priceChangePct).filter((value) => value !== null);
  const volumes = comparisons.map((row) => row.volumeChangePct).filter((value) => value !== null);
  const liquidities = comparisons.map((row) => row.liquidityChangePct).filter((value) => value !== null);

  return {
    marketBreadthPct: returns.length
      ? (returns.filter((value) => value > 0).length / returns.length) * 100
      : null,
    marketBreadthSampleSize: returns.length,
    dexVolumeChangePct: median(volumes),
    dexVolumeChangeSampleSize: volumes.length,
    liquidityChangePct: median(liquidities),
    liquidityChangeSampleSize: liquidities.length,
  };
}

function normalizeCoinGecko(rows = []) {
  const markets = Array.isArray(rows) ? rows : [];
  const btc = markets.find((row) => String(row.id || row.coinGeckoId || "").toLowerCase() === "bitcoin");
  const eth = markets.find((row) => String(row.id || row.coinGeckoId || "").toLowerCase() === "ethereum");
  const btcPrice = finite(btc?.current_price ?? btc?.priceUsd);
  const high = finite(btc?.high_24h);
  const low = finite(btc?.low_24h);
  const volatility = btcPrice !== null && btcPrice > 0 && high !== null && low !== null && high >= low
    ? ((high - low) / btcPrice) * 100
    : null;
  return {
    btcReturnPct: finite(btc?.price_change_percentage_24h ?? btc?.priceChange24h),
    ethReturnPct: finite(eth?.price_change_percentage_24h ?? eth?.priceChange24h),
    btcVolatilityPct: volatility,
  };
}

function providerFailure(reason) {
  return { status: "UNAVAILABLE", reason: String(reason || "provider unavailable") };
}

export async function collectMarketContextSnapshot(options = {}) {
  const now = new Date(options.now || Date.now()).toISOString();
  const providers = {
    getCoinGeckoMarketsByIds: options.providers?.getCoinGeckoMarketsByIds || getCoinGeckoMarketsByIds,
    getDefiLlamaStablecoinSnapshot:
      options.providers?.getDefiLlamaStablecoinSnapshot || getDefiLlamaStablecoinSnapshot,
    observeHyperliquidLeverage:
      options.providers?.observeHyperliquidLeverage || observeHyperliquidLeverage,
  };
  const previousStablecoin = latestPointInTime(
    (options.previousContext || []).filter((row) => finite(row.stablecoinSupplyUsd) !== null),
    now
  );
  const previousOpenInterest = latestPointInTime(
    (options.previousContext || []).filter((row) => finite(row.openInterestUsd) !== null),
    now
  );
  const sample = deriveExactMarketSampleContext(
    options.currentExactObservations || [],
    options.previousExactObservations || []
  );
  const settled = await Promise.allSettled([
    providers.getCoinGeckoMarketsByIds(["bitcoin", "ethereum"], {
      now,
      timeoutMs: options.timeoutMs,
      delayMs: 0,
    }),
    providers.getDefiLlamaStablecoinSnapshot({ now, timeoutMs: options.timeoutMs }),
    providers.observeHyperliquidLeverage({}, {
      coin: "BTC",
      now,
      timeoutMs: options.timeoutMs,
      retries: options.retries ?? 0,
    }),
  ]);

  const macro = settled[0].status === "fulfilled" ? normalizeCoinGecko(settled[0].value) : {};
  const stablecoin = settled[1].status === "fulfilled" ? settled[1].value : {};
  const derivatives = settled[2].status === "fulfilled" ? settled[2].value?.derivatives || {} : {};
  const stablecoinSupplyUsd = finite(stablecoin.totalSupplyUsd);
  const providerHealth = {
    coingecko: finite(macro.btcReturnPct) !== null || finite(macro.ethReturnPct) !== null
      ? { status: "OBSERVED" }
      : providerFailure(
          settled[0].status === "rejected"
            ? settled[0].reason?.message
            : "Expected Bitcoin/Ethereum market rows were not observed."
        ),
    defillamaStablecoins: stablecoinSupplyUsd !== null
      ? { status: "OBSERVED" }
      : providerFailure(
          settled[1].status === "rejected"
            ? settled[1].reason?.message
            : "No stablecoin circulating-supply total was observed."
        ),
    hyperliquid: settled[2].status === "fulfilled" && settled[2].value?.status === "OBSERVED_PERP_MARKET"
      ? { status: "OBSERVED" }
      : providerFailure(
          settled[2].status === "rejected"
            ? settled[2].reason?.message
            : settled[2].value?.error || settled[2].value?.status
        ),
  };
  const priorStablecoinSupplyUsd = finite(previousStablecoin?.stablecoinSupplyUsd);
  const stablecoinNetFlowUsd = stablecoinSupplyUsd !== null && priorStablecoinSupplyUsd !== null
    ? stablecoinSupplyUsd - priorStablecoinSupplyUsd
    : null;
  const openInterestUsd = finite(derivatives.openInterestUsd);
  const openInterestChangePct = percentChange(openInterestUsd, previousOpenInterest?.openInterestUsd);
  const fields = {
    ...macro,
    btcVolatility: finite(macro.btcVolatilityPct),
    stablecoinSupplyUsd,
    stablecoinNetFlowUsd,
    stablecoinFlowUsd: stablecoinNetFlowUsd,
    perpFundingRate: finite(derivatives.fundingRate),
    openInterestUsd,
    openInterestChangePct,
    liquidationUsd: null,
    bridgeNetFlowUsd: null,
    ...sample,
  };
  const fieldProvenance = {
    btcReturnPct: "coingecko:bitcoin:trailing-24h",
    ethReturnPct: "coingecko:ethereum:trailing-24h",
    btcVolatilityPct: "coingecko:bitcoin:24h-high-low-range-proxy",
    btcVolatility: "coingecko:bitcoin:24h-high-low-range-proxy",
    stablecoinSupplyUsd: "defillama-stablecoins:current-circulating-pegged-usd",
    stablecoinNetFlowUsd: "defillama-stablecoins:change-since-prior-point-in-time-snapshot",
    stablecoinFlowUsd: "defillama-stablecoins:change-since-prior-point-in-time-snapshot",
    perpFundingRate: "hyperliquid:btc-public-asset-context",
    openInterestUsd: "hyperliquid:btc-public-asset-context",
    openInterestChangePct: "hyperliquid:change-since-prior-point-in-time-snapshot",
    dexVolumeChangePct: "exact-outcome-sample:median-route-change",
    liquidityChangePct: "exact-outcome-sample:median-route-change",
    marketBreadthPct: "exact-outcome-sample:positive-route-share",
  };
  const unavailableFields = Object.entries(fields)
    .filter(([, value]) => value === null)
    .map(([field]) => ({
      field,
      reason: field === "liquidationUsd"
        ? "No verified aggregate liquidation-notional source is wired; the system will not infer it from account-agnostic data."
        : field === "bridgeNetFlowUsd"
          ? "No verified aggregate bridge-flow observation was supplied for this point in time."
          : field.endsWith("SampleSize")
            ? "No exact prior-route comparison was available."
            : "The upstream point-in-time provider or prior observation was unavailable.",
    }));
  const coreFields = ["btcReturnPct", "ethReturnPct", "stablecoinSupplyUsd", "perpFundingRate"];
  const coreAvailable = coreFields.filter((field) => finite(fields[field]) !== null).length;

  return {
    schemaVersion: 1,
    observedAt: now,
    source: "market-context-snapshot-provider",
    state: coreAvailable === coreFields.length
      ? unavailableFields.length ? "PARTIAL_POINT_IN_TIME_CONTEXT" : "COMPLETE_POINT_IN_TIME_CONTEXT"
      : coreAvailable ? "PARTIAL_POINT_IN_TIME_CONTEXT" : "CONTEXT_PROVIDERS_UNAVAILABLE",
    ...fields,
    fieldProvenance,
    unavailableFields,
    providerHealth,
    pointInTimeVerified: true,
    scoringOrSelectionAllowed: false,
    automaticTrading: false,
  };
}

export function attachMarketContext(observations = [], context = {}) {
  const contextMs = timestamp(context.observedAt);
  return (Array.isArray(observations) ? observations : []).map((observation) => {
    const observationMs = timestamp(observation.observedAt || observation.timestamp || context.observedAt);
    if (contextMs === null || observationMs === null || contextMs > observationMs) {
      return { ...observation, marketContextPointInTimeVerified: false };
    }
    const attached = Object.fromEntries(CONTEXT_FIELDS.map((field) => [field, context[field] ?? null]));
    return {
      ...observation,
      ...attached,
      marketContextObservationKey: context.observationKey || null,
      marketContextObservedAt: context.observedAt,
      marketContextState: context.state || null,
      marketContextFieldProvenance: context.fieldProvenance || {},
      marketContextPointInTimeVerified: context.pointInTimeVerified === true,
    };
  });
}

export const MARKET_CONTEXT_FIELDS = CONTEXT_FIELDS;
export const __marketContextSnapshotProviderHooks = {
  exactRouteCompatible,
  latestPointInTime,
  normalizeCoinGecko,
  percentChange,
};
