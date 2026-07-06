// src/storage/db.js
import Database from "better-sqlite3";
import fs from "fs";

fs.mkdirSync("data", { recursive: true });

const db = new Database("data/cli.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    poolId TEXT,
    symbol TEXT,
    chain TEXT,

    priceUsd REAL,
    liquidityUsd REAL,
    volume24h REAL,
    priceChange24h REAL,

    buyPressure24h REAL,
    totalTransactions24h REAL,

    smartMoneyScore REAL,
    communityScore REAL,
    developerScore REAL,
    githubScore REAL,
    narrativeScore REAL,
    whaleScore REAL,
    holderGrowthScore REAL,
    liquidityScore REAL,
    overallScore REAL,

    timestamp INTEGER
  );
`);

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function saveSnapshot(row = {}) {
  db.prepare(`
    INSERT INTO snapshots (
      poolId,
      symbol,
      chain,
      priceUsd,
      liquidityUsd,
      volume24h,
      priceChange24h,
      buyPressure24h,
      totalTransactions24h,
      smartMoneyScore,
      communityScore,
      developerScore,
      githubScore,
      narrativeScore,
      whaleScore,
      holderGrowthScore,
      liquidityScore,
      overallScore,
      timestamp
    )
    VALUES (
      @poolId,
      @symbol,
      @chain,
      @priceUsd,
      @liquidityUsd,
      @volume24h,
      @priceChange24h,
      @buyPressure24h,
      @totalTransactions24h,
      @smartMoneyScore,
      @communityScore,
      @developerScore,
      @githubScore,
      @narrativeScore,
      @whaleScore,
      @holderGrowthScore,
      @liquidityScore,
      @overallScore,
      @timestamp
    )
  `).run({
    poolId: row.poolId || null,
    symbol: row.symbol || "UNKNOWN",
    chain: row.chain || "unknown",

    priceUsd: safeNumber(row.priceUsd),
    liquidityUsd: safeNumber(row.liquidityUsd),
    volume24h: safeNumber(row.volume24h),
    priceChange24h: safeNumber(row.priceChange24h),

    buyPressure24h: safeNumber(row.buyPressure24h),
    totalTransactions24h: safeNumber(row.totalTransactions24h),

    smartMoneyScore: safeNumber(row.smartMoneyScore),
    communityScore: safeNumber(row.communityScore),
    developerScore: safeNumber(row.developerScore),
    githubScore: safeNumber(row.githubScore),
    narrativeScore: safeNumber(row.narrativeScore),
    whaleScore: safeNumber(row.whaleScore),
    holderGrowthScore: safeNumber(row.holderGrowthScore),
    liquidityScore: safeNumber(row.liquidityScore),
    overallScore: safeNumber(row.overallScore),

    timestamp: safeNumber(row.timestamp, Date.now()),
  });
}

export function fetchTrainingRows(limit = 5000) {
  return db
    .prepare(
      `SELECT
        priceUsd,
        liquidityUsd,
        volume24h,
        priceChange24h,
        buyPressure24h,
        totalTransactions24h,
        smartMoneyScore,
        communityScore,
        developerScore,
        githubScore,
        narrativeScore,
        whaleScore,
        holderGrowthScore,
        liquidityScore,
        overallScore
       FROM snapshots
       ORDER BY timestamp DESC
       LIMIT ?`
    )
    .all(limit);
}
