// src/ingest.js
//
// Pulls the latest GeckoTerminal pools, normalises them,
// and stores a one-row snapshot for each pool in SQLite.

import { getGeckoTerminalCandidates } from "./data/geckoTerminalConnector.js";
import { saveSnapshot } from "./storage/db.js";

export async function ingest(pages = 1) {
  const pools = await getGeckoTerminalCandidates({ pages });
  const now = Date.now();

  pools.forEach((p) =>
    saveSnapshot({
      poolId: p.rawPoolId,
      symbol: p.symbol,
      chain: p.chain,
      priceUsd: p.priceUsd,
      liquidityUsd: p.liquidityUsd,
      volume24h: p.volume24h,
      priceChange24h: p.priceChange24h,
      timestamp: now,
    })
  );

  console.log(`Saved ${pools.length} snapshots @ ${new Date(now).toISOString()}`);
}
