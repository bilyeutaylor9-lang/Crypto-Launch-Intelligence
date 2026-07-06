// src/storage/db.js
import Database from "better-sqlite3";
import fs from "fs";

fs.mkdirSync("data", { recursive: true });
const db = new Database("data/cli.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS snapshots (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    poolId        TEXT,
    symbol        TEXT,
    chain         TEXT,
    priceUsd      REAL,
    liquidityUsd  REAL,
    volume24h     REAL,
    priceChange24h REAL,
    timestamp     INTEGER
  );
`);

export function saveSnapshot(row = {}) {
  db.prepare(`
    INSERT INTO snapshots (poolId, symbol, chain,
      priceUsd, liquidityUsd, volume24h, priceChange24h, timestamp)
    VALUES (@poolId, @symbol, @chain, @priceUsd, @liquidityUsd,
      @volume24h, @priceChange24h, @timestamp)
  `).run(row);
}

export function fetchTrainingRows(limit = 5000) {
  return db
    .prepare(
      `SELECT priceUsd, liquidityUsd, volume24h, priceChange24h
       FROM snapshots ORDER BY timestamp DESC LIMIT ?`
    )
    .all(limit);
}
