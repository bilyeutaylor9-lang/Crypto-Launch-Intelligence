// src/ingest.js
//
// Crypto Launch Intelligence
// Learning Ingest Engine
//
// Pulls live GeckoTerminal data and stores every feature
// needed for future AI learning.
//

import { getGeckoTerminalCandidates } from "./data/geckoTerminalConnector.js";
import { saveSnapshot } from "./storage/db.js";

export async function ingest(pages = 1) {
  const pools = await getGeckoTerminalCandidates({ pages });

  const now = Date.now();

  let saved = 0;

  for (const pool of pools) {
    saveSnapshot({
      poolId: pool.rawPoolId || pool.address,
      symbol: pool.symbol,
      chain: pool.chain,

      priceUsd: pool.priceUsd,
      liquidityUsd: pool.liquidityUsd,
      volume24h: pool.volume24h,
      priceChange24h: pool.priceChange24h,

      buyPressure24h: pool.buyPressure24h,
      totalTransactions24h: pool.totalTransactions24h,

      smartMoneyScore:
        pool.smartMoneyAccumulationScore ??
        pool.smartMoneyScore ??
        0,

      communityScore: pool.communityScore ?? 0,

      developerScore: pool.developerScore ?? 0,

      githubScore: pool.githubScore ?? 0,

      narrativeScore:
        pool.narrativeForecastScore ??
        pool.narrativeScore ??
        0,

      whaleScore: pool.whaleScore ?? 0,

      holderGrowthScore: pool.holderGrowthScore ?? 0,

      liquidityScore: pool.liquidityScore ?? 0,

      overallScore:
        pool.pipelineScore ??
        pool.finalScore ??
        pool.score ??
        0,

      timestamp: now,
    });

    saved++;
  }

  console.log("");
  console.log("======================================");
  console.log(" AI Learning Snapshot Complete");
  console.log("======================================");
  console.log(`Snapshots Saved : ${saved}`);
  console.log(`Timestamp       : ${new Date(now).toISOString()}`);
  console.log("======================================");
}
