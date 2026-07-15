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

  CREATE TABLE IF NOT EXISTS evidence_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectKey TEXT NOT NULL,
    symbol TEXT,
    chain TEXT,
    source TEXT,
    family TEXT,
    eventType TEXT,
    score REAL,
    confidence REAL,
    payloadJson TEXT,
    observedAt INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_evidence_events_project
    ON evidence_events(projectKey, observedAt);

  CREATE INDEX IF NOT EXISTS idx_evidence_events_family
    ON evidence_events(family, observedAt);

  CREATE TABLE IF NOT EXISTS source_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    status TEXT,
    candidateCount INTEGER,
    durationMs INTEGER,
    errorType TEXT,
    errorMessage TEXT,
    payloadJson TEXT,
    observedAt INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_source_history_source
    ON source_history(source, observedAt);

  CREATE TABLE IF NOT EXISTS decision_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectKey TEXT NOT NULL,
    symbol TEXT,
    chain TEXT,
    finalState TEXT,
    finalQualified INTEGER,
    confidence TEXT,
    score REAL,
    blockingReasonsJson TEXT,
    warningReasonsJson TEXT,
    invalidationJson TEXT,
    payloadJson TEXT,
    decidedAt INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_decision_history_project
    ON decision_history(projectKey, decidedAt);

  CREATE INDEX IF NOT EXISTS idx_decision_history_state
    ON decision_history(finalState, decidedAt);

  CREATE TABLE IF NOT EXISTS outcome_labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectKey TEXT NOT NULL,
    symbol TEXT,
    chain TEXT,
    label TEXT,
    horizonDays INTEGER,
    returnPct REAL,
    maxDrawdownPct REAL,
    liquidityUsd REAL,
    buyable INTEGER,
    payloadJson TEXT,
    labeledAt INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_outcome_labels_project
    ON outcome_labels(projectKey, labeledAt);

  CREATE INDEX IF NOT EXISTS idx_outcome_labels_label
    ON outcome_labels(label, horizonDays);
`);

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeInteger(value, fallback = Date.now()) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function safeJson(value = null) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify({ serializationError: true });
  }
}

function projectKeyFor(row = {}) {
  return String(
    row.projectKey ||
      row.identityKey ||
      row.address ||
      row.pairAddress ||
      row.poolId ||
      `${row.chain || "unknown"}:${row.symbol || row.name || "unknown"}`
  ).toLowerCase();
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

export function saveEvidenceEvent(row = {}) {
  db.prepare(`
    INSERT INTO evidence_events (
      projectKey,
      symbol,
      chain,
      source,
      family,
      eventType,
      score,
      confidence,
      payloadJson,
      observedAt
    )
    VALUES (
      @projectKey,
      @symbol,
      @chain,
      @source,
      @family,
      @eventType,
      @score,
      @confidence,
      @payloadJson,
      @observedAt
    )
  `).run({
    projectKey: projectKeyFor(row),
    symbol: row.symbol || null,
    chain: row.chain || null,
    source: row.source || null,
    family: row.family || row.evidenceFamily || null,
    eventType: row.eventType || row.type || null,
    score: safeNumber(row.score),
    confidence: safeNumber(row.confidence),
    payloadJson: safeJson(row.payload || row),
    observedAt: safeInteger(row.observedAt || row.timestamp),
  });
}

export function saveSourceHistory(row = {}) {
  db.prepare(`
    INSERT INTO source_history (
      source,
      status,
      candidateCount,
      durationMs,
      errorType,
      errorMessage,
      payloadJson,
      observedAt
    )
    VALUES (
      @source,
      @status,
      @candidateCount,
      @durationMs,
      @errorType,
      @errorMessage,
      @payloadJson,
      @observedAt
    )
  `).run({
    source: row.source || "unknown",
    status: row.status || "UNKNOWN",
    candidateCount: safeInteger(row.candidateCount ?? row.candidates, 0),
    durationMs: safeInteger(row.durationMs, 0),
    errorType: row.errorType || null,
    errorMessage: row.errorMessage || row.error || null,
    payloadJson: safeJson(row.payload || row),
    observedAt: safeInteger(row.observedAt || row.timestamp),
  });
}

export function saveDecisionHistory(row = {}) {
  db.prepare(`
    INSERT INTO decision_history (
      projectKey,
      symbol,
      chain,
      finalState,
      finalQualified,
      confidence,
      score,
      blockingReasonsJson,
      warningReasonsJson,
      invalidationJson,
      payloadJson,
      decidedAt
    )
    VALUES (
      @projectKey,
      @symbol,
      @chain,
      @finalState,
      @finalQualified,
      @confidence,
      @score,
      @blockingReasonsJson,
      @warningReasonsJson,
      @invalidationJson,
      @payloadJson,
      @decidedAt
    )
  `).run({
    projectKey: projectKeyFor(row),
    symbol: row.symbol || null,
    chain: row.chain || null,
    finalState: row.finalState || row.state || "UNKNOWN",
    finalQualified: row.finalQualified ? 1 : 0,
    confidence: row.finalConfidence || row.confidence || null,
    score: safeNumber(row.score || row.pipelineScore || row.institutionalScore),
    blockingReasonsJson: safeJson(row.finalBlockingReasons || row.blockingReasons || []),
    warningReasonsJson: safeJson(row.finalWarningReasons || row.warningReasons || []),
    invalidationJson: safeJson(row.finalInvalidationConditions || row.invalidationConditions || []),
    payloadJson: safeJson(row.payload || row),
    decidedAt: safeInteger(row.decidedAt || row.timestamp),
  });
}

export function saveOutcomeLabel(row = {}) {
  db.prepare(`
    INSERT INTO outcome_labels (
      projectKey,
      symbol,
      chain,
      label,
      horizonDays,
      returnPct,
      maxDrawdownPct,
      liquidityUsd,
      buyable,
      payloadJson,
      labeledAt
    )
    VALUES (
      @projectKey,
      @symbol,
      @chain,
      @label,
      @horizonDays,
      @returnPct,
      @maxDrawdownPct,
      @liquidityUsd,
      @buyable,
      @payloadJson,
      @labeledAt
    )
  `).run({
    projectKey: projectKeyFor(row),
    symbol: row.symbol || null,
    chain: row.chain || null,
    label: row.label || row.outcomeLabel || "UNKNOWN",
    horizonDays: safeInteger(row.horizonDays, 0),
    returnPct: safeNumber(row.returnPct),
    maxDrawdownPct: safeNumber(row.maxDrawdownPct),
    liquidityUsd: safeNumber(row.liquidityUsd),
    buyable: row.buyable === false ? 0 : 1,
    payloadJson: safeJson(row.payload || row),
    labeledAt: safeInteger(row.labeledAt || row.timestamp),
  });
}

export function fetchEvidenceEvents(projectKey = "", limit = 250) {
  return db
    .prepare(
      `SELECT *
       FROM evidence_events
       WHERE projectKey = ?
       ORDER BY observedAt DESC
       LIMIT ?`
    )
    .all(String(projectKey || "").toLowerCase(), safeInteger(limit, 250));
}

export function fetchOutcomeLabels(limit = 5000) {
  return db
    .prepare(
      `SELECT *
       FROM outcome_labels
       ORDER BY labeledAt DESC
       LIMIT ?`
    )
    .all(safeInteger(limit, 5000));
}

export function summarizeStorage() {
  const tables = [
    "snapshots",
    "evidence_events",
    "source_history",
    "decision_history",
    "outcome_labels",
  ];

  return Object.fromEntries(
    tables.map((table) => [
      table,
      db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count,
    ])
  );
}
