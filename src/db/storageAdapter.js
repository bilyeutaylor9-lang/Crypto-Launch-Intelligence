import { createBackendSupabaseClient, summarizeBackendSupabaseConfig } from "./supabaseClient.js";
import { openSqliteFallbackStore } from "./sqliteFallbackStore.js";

function toSupabaseObservation(row = {}) {
  return {
    observation_key: row.observationKey,
    observed_at: row.observedAt,
    source_timestamp: row.sourceTimestamp,
    source: row.source || "unknown",
    canonical_project_id: row.canonicalProjectId,
    chain_id: row.chainId,
    token_address: row.tokenAddress,
    pool_address: row.poolAddress,
    quote_token_address: row.quoteTokenAddress,
    venue: row.venue,
    price_usd: row.priceUsd,
    circulating_market_cap_usd: row.circulatingMarketCapUsd,
    fully_diluted_value_usd: row.fullyDilutedValueUsd,
    dex_liquidity_usd: row.dexLiquidityUsd,
    stable_exit_liquidity_usd: row.stableExitLiquidityUsd,
    dex_volume_usd: row.dexVolumeUsd,
    buy_volume_usd: row.buyVolumeUsd,
    sell_volume_usd: row.sellVolumeUsd,
    net_flow_usd: row.netFlowUsd,
    buy_transactions: row.buyTransactions,
    sell_transactions: row.sellTransactions,
    unique_buyers: row.uniqueBuyers,
    unique_sellers: row.uniqueSellers,
    new_buyers: row.newBuyers,
    repeat_buyers: row.repeatBuyers,
    liquidity_added_usd: row.liquidityAddedUsd,
    liquidity_removed_usd: row.liquidityRemovedUsd,
    holder_count: row.holderCount,
    largest_buy_share_pct: row.largestBuySharePct,
    largest_wallet_flow_share_pct: row.largestWalletFlowSharePct,
    wallet_concentration_pct: row.walletConcentrationPct,
    data_confidence: row.dataConfidence,
    missing_fields_json: row.missingFields || [],
    field_provenance_json: row.fieldProvenance || {},
    ingested_at: row.ingestedAt,
  };
}

export function createStorageAdapter(options = {}) {
  const sqlite = options.sqliteStore || openSqliteFallbackStore(options);
  const supabase = options.supabase || createBackendSupabaseClient(options);
  const config = summarizeBackendSupabaseConfig(options.env || process.env);

  async function writeCapitalFlowObservations(observations = []) {
    const rows = Array.isArray(observations) ? observations : [];
    if (!rows.length) {
      return {
        status: "SKIPPED",
        backend: "none",
        attempted: 0,
        saved: 0,
        reason: "No observations supplied.",
      };
    }

    if (supabase.client && supabase.config?.serverWriteCapable) {
      try {
        const { error } = await supabase.client
          .from("capital_flow_observations")
          .upsert(rows.map(toSupabaseObservation), {
            onConflict: "observation_key",
            ignoreDuplicates: true,
          });
        if (error) throw error;
        return {
          status: "OK",
          backend: "supabase",
          attempted: rows.length,
          saved: rows.length,
          fallback: false,
        };
      } catch (error) {
        const fallback = sqlite.saveCapitalFlowObservations(rows);
        return {
          status: "FALLBACK_USED",
          backend: "sqlite",
          attempted: rows.length,
          saved: fallback.saved,
          fallback: true,
          failureReason: error.message,
        };
      }
    }

    const fallback = sqlite.saveCapitalFlowObservations(rows);
    return {
      ...fallback,
      status: "FALLBACK_USED",
      fallback: true,
      reason: config.serverWriteCapable
        ? "Supabase client unavailable."
        : "Supabase server key unavailable; wrote to SQLite fallback.",
    };
  }

  return {
    backend: supabase.client && supabase.config?.serverWriteCapable ? "supabase" : "sqlite",
    config,
    supabaseStatus: supabase.status,
    writeCapitalFlowObservations,
    loadCapitalFlowObservations: sqlite.loadCapitalFlowObservations,
    status: () => ({
      status: "OK",
      selectedBackend: supabase.client && supabase.config?.serverWriteCapable ? "supabase" : "sqlite",
      supabase: config,
      sqlite: sqlite.status(),
    }),
    close: sqlite.close,
  };
}
