import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

import { numberOrNull } from "../math/numericSafety.js";

const DATA_DIR = path.resolve("data");
const DEFAULT_DB_PATH = path.join(DATA_DIR, "capital-migration.sqlite");

function json(value = null) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify({ serializationError: true });
  }
}

function text(value = "") {
  const raw = String(value ?? "").trim();
  return raw || null;
}

function iso(value = null) {
  const parsed = value ? new Date(value) : new Date();
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}

export function openSqliteFallbackStore(options = {}) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dbPath = path.resolve(options.dbPath || process.env.CAPITAL_SQLITE_PATH || DEFAULT_DB_PATH);
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      canonical_project_id TEXT PRIMARY KEY,
      name TEXT,
      symbol TEXT,
      chain_id TEXT,
      token_address TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      metadata_json TEXT
    );

    CREATE TABLE IF NOT EXISTS pools (
      pool_key TEXT PRIMARY KEY,
      canonical_project_id TEXT,
      chain_id TEXT,
      token_address TEXT,
      pool_address TEXT,
      quote_token_address TEXT,
      venue TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      metadata_json TEXT
    );

    CREATE TABLE IF NOT EXISTS capital_flow_observations (
      observation_key TEXT PRIMARY KEY,
      observed_at TEXT NOT NULL,
      source_timestamp TEXT,
      source TEXT NOT NULL,
      canonical_project_id TEXT,
      chain_id TEXT,
      token_address TEXT,
      pool_address TEXT,
      quote_token_address TEXT,
      venue TEXT,
      price_usd REAL,
      circulating_market_cap_usd REAL,
      fully_diluted_value_usd REAL,
      dex_liquidity_usd REAL,
      stable_exit_liquidity_usd REAL,
      dex_volume_usd REAL,
      buy_volume_usd REAL,
      sell_volume_usd REAL,
      net_flow_usd REAL,
      buy_transactions INTEGER,
      sell_transactions INTEGER,
      unique_buyers INTEGER,
      unique_sellers INTEGER,
      new_buyers INTEGER,
      repeat_buyers INTEGER,
      liquidity_added_usd REAL,
      liquidity_removed_usd REAL,
      holder_count INTEGER,
      largest_buy_share_pct REAL,
      largest_wallet_flow_share_pct REAL,
      wallet_concentration_pct REAL,
      data_confidence REAL,
      missing_fields_json TEXT,
      field_provenance_json TEXT,
      ingested_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_capital_observations_project_time
      ON capital_flow_observations(canonical_project_id, observed_at);

    CREATE INDEX IF NOT EXISTS idx_capital_observations_pool_time
      ON capital_flow_observations(chain_id, pool_address, observed_at);

    CREATE INDEX IF NOT EXISTS idx_capital_observations_source_time
      ON capital_flow_observations(source, source_timestamp, observed_at);

    CREATE TABLE IF NOT EXISTS engine_runs (
      run_id TEXT,
      engine_name TEXT,
      status TEXT,
      projects_received INTEGER,
      projects_processed INTEGER,
      duration_ms INTEGER,
      failure_reason TEXT,
      payload_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (run_id, engine_name)
    );
  `);

  const insertProject = db.prepare(`
    INSERT INTO projects (
      canonical_project_id, name, symbol, chain_id, token_address, updated_at, metadata_json
    )
    VALUES (
      @canonical_project_id, @name, @symbol, @chain_id, @token_address, @updated_at, @metadata_json
    )
    ON CONFLICT(canonical_project_id) DO UPDATE SET
      name = excluded.name,
      symbol = excluded.symbol,
      chain_id = excluded.chain_id,
      token_address = excluded.token_address,
      updated_at = excluded.updated_at,
      metadata_json = excluded.metadata_json
  `);
  const insertPool = db.prepare(`
    INSERT INTO pools (
      pool_key, canonical_project_id, chain_id, token_address, pool_address, quote_token_address, venue, metadata_json
    )
    VALUES (
      @pool_key, @canonical_project_id, @chain_id, @token_address, @pool_address, @quote_token_address, @venue, @metadata_json
    )
    ON CONFLICT(pool_key) DO NOTHING
  `);
  const insertObservation = db.prepare(`
    INSERT INTO capital_flow_observations (
      observation_key, observed_at, source_timestamp, source, canonical_project_id, chain_id,
      token_address, pool_address, quote_token_address, venue, price_usd,
      circulating_market_cap_usd, fully_diluted_value_usd, dex_liquidity_usd,
      stable_exit_liquidity_usd, dex_volume_usd, buy_volume_usd, sell_volume_usd,
      net_flow_usd, buy_transactions, sell_transactions, unique_buyers, unique_sellers,
      new_buyers, repeat_buyers, liquidity_added_usd, liquidity_removed_usd, holder_count,
      largest_buy_share_pct, largest_wallet_flow_share_pct, wallet_concentration_pct,
      data_confidence, missing_fields_json, field_provenance_json, ingested_at
    )
    VALUES (
      @observation_key, @observed_at, @source_timestamp, @source, @canonical_project_id, @chain_id,
      @token_address, @pool_address, @quote_token_address, @venue, @price_usd,
      @circulating_market_cap_usd, @fully_diluted_value_usd, @dex_liquidity_usd,
      @stable_exit_liquidity_usd, @dex_volume_usd, @buy_volume_usd, @sell_volume_usd,
      @net_flow_usd, @buy_transactions, @sell_transactions, @unique_buyers, @unique_sellers,
      @new_buyers, @repeat_buyers, @liquidity_added_usd, @liquidity_removed_usd, @holder_count,
      @largest_buy_share_pct, @largest_wallet_flow_share_pct, @wallet_concentration_pct,
      @data_confidence, @missing_fields_json, @field_provenance_json, @ingested_at
    )
    ON CONFLICT(observation_key) DO NOTHING
  `);

  function saveCapitalFlowObservations(observations = []) {
    const rows = Array.isArray(observations) ? observations : [];
    const transaction = db.transaction((items) => {
      let saved = 0;
      for (const observation of items) {
        if (observation.canonicalProjectId) {
          insertProject.run({
            canonical_project_id: observation.canonicalProjectId,
            name: text(observation.name),
            symbol: text(observation.symbol),
            chain_id: text(observation.chainId),
            token_address: text(observation.tokenAddress),
            updated_at: iso(observation.observedAt),
            metadata_json: json({
              identityStatus: observation.identityStatus,
              source: observation.source,
            }),
          });
        }
        if (observation.poolAddress && observation.chainId) {
          insertPool.run({
            pool_key: `${observation.chainId}:${observation.poolAddress}`,
            canonical_project_id: text(observation.canonicalProjectId),
            chain_id: text(observation.chainId),
            token_address: text(observation.tokenAddress),
            pool_address: text(observation.poolAddress),
            quote_token_address: text(observation.quoteTokenAddress),
            venue: text(observation.venue),
            metadata_json: json({ source: observation.source }),
          });
        }
        const result = insertObservation.run({
          observation_key: observation.observationKey,
          observed_at: iso(observation.observedAt),
          source_timestamp: observation.sourceTimestamp ? iso(observation.sourceTimestamp) : null,
          source: text(observation.source) || "unknown",
          canonical_project_id: text(observation.canonicalProjectId),
          chain_id: text(observation.chainId),
          token_address: text(observation.tokenAddress),
          pool_address: text(observation.poolAddress),
          quote_token_address: text(observation.quoteTokenAddress),
          venue: text(observation.venue),
          price_usd: numberOrNull(observation.priceUsd),
          circulating_market_cap_usd: numberOrNull(observation.circulatingMarketCapUsd),
          fully_diluted_value_usd: numberOrNull(observation.fullyDilutedValueUsd),
          dex_liquidity_usd: numberOrNull(observation.dexLiquidityUsd),
          stable_exit_liquidity_usd: numberOrNull(observation.stableExitLiquidityUsd),
          dex_volume_usd: numberOrNull(observation.dexVolumeUsd),
          buy_volume_usd: numberOrNull(observation.buyVolumeUsd),
          sell_volume_usd: numberOrNull(observation.sellVolumeUsd),
          net_flow_usd: numberOrNull(observation.netFlowUsd),
          buy_transactions: numberOrNull(observation.buyTransactions),
          sell_transactions: numberOrNull(observation.sellTransactions),
          unique_buyers: numberOrNull(observation.uniqueBuyers),
          unique_sellers: numberOrNull(observation.uniqueSellers),
          new_buyers: numberOrNull(observation.newBuyers),
          repeat_buyers: numberOrNull(observation.repeatBuyers),
          liquidity_added_usd: numberOrNull(observation.liquidityAddedUsd),
          liquidity_removed_usd: numberOrNull(observation.liquidityRemovedUsd),
          holder_count: numberOrNull(observation.holderCount),
          largest_buy_share_pct: numberOrNull(observation.largestBuySharePct),
          largest_wallet_flow_share_pct: numberOrNull(observation.largestWalletFlowSharePct),
          wallet_concentration_pct: numberOrNull(observation.walletConcentrationPct),
          data_confidence: numberOrNull(observation.dataConfidence),
          missing_fields_json: json(observation.missingFields || []),
          field_provenance_json: json(observation.fieldProvenance || {}),
          ingested_at: iso(observation.ingestedAt),
        });
        saved += result.changes;
      }
      return saved;
    });

    return {
      status: "OK",
      backend: "sqlite",
      dbPath,
      attempted: rows.length,
      saved: transaction(rows),
    };
  }

  function loadCapitalFlowObservations(options = {}) {
    const limit = Math.max(1, Number(options.limit || 5000));
    const projectId = text(options.canonicalProjectId);
    const rows = projectId
      ? db.prepare(`
          SELECT * FROM capital_flow_observations
          WHERE canonical_project_id = ?
          ORDER BY observed_at DESC
          LIMIT ?
        `).all(projectId, limit)
      : db.prepare(`
          SELECT * FROM capital_flow_observations
          ORDER BY observed_at DESC
          LIMIT ?
        `).all(limit);
    return rows.map((row) => ({
      observationKey: row.observation_key,
      observedAt: row.observed_at,
      sourceTimestamp: row.source_timestamp,
      source: row.source,
      canonicalProjectId: row.canonical_project_id,
      chainId: row.chain_id,
      tokenAddress: row.token_address,
      poolAddress: row.pool_address,
      quoteTokenAddress: row.quote_token_address,
      venue: row.venue,
      priceUsd: row.price_usd,
      circulatingMarketCapUsd: row.circulating_market_cap_usd,
      fullyDilutedValueUsd: row.fully_diluted_value_usd,
      dexLiquidityUsd: row.dex_liquidity_usd,
      stableExitLiquidityUsd: row.stable_exit_liquidity_usd,
      dexVolumeUsd: row.dex_volume_usd,
      buyVolumeUsd: row.buy_volume_usd,
      sellVolumeUsd: row.sell_volume_usd,
      netFlowUsd: row.net_flow_usd,
      buyTransactions: row.buy_transactions,
      sellTransactions: row.sell_transactions,
      uniqueBuyers: row.unique_buyers,
      uniqueSellers: row.unique_sellers,
      newBuyers: row.new_buyers,
      repeatBuyers: row.repeat_buyers,
      liquidityAddedUsd: row.liquidity_added_usd,
      liquidityRemovedUsd: row.liquidity_removed_usd,
      holderCount: row.holder_count,
      largestBuySharePct: row.largest_buy_share_pct,
      largestWalletFlowSharePct: row.largest_wallet_flow_share_pct,
      walletConcentrationPct: row.wallet_concentration_pct,
      dataConfidence: row.data_confidence,
      missingFields: JSON.parse(row.missing_fields_json || "[]"),
      fieldProvenance: JSON.parse(row.field_provenance_json || "{}"),
      ingestedAt: row.ingested_at,
    }));
  }

  function status() {
    const tables = ["projects", "pools", "capital_flow_observations", "engine_runs"];
    return {
      status: "OK",
      backend: "sqlite",
      dbPath,
      tables: Object.fromEntries(
        tables.map((table) => [
          table,
          db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
        ])
      ),
    };
  }

  return {
    backend: "sqlite",
    dbPath,
    saveCapitalFlowObservations,
    loadCapitalFlowObservations,
    status,
    close: () => db.close(),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const store = openSqliteFallbackStore();
  console.log(JSON.stringify(store.status(), null, 2));
  store.close();
}
