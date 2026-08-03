import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { auditPointInTimeRecord, stripFutureEvidence } from "./pointInTimeLeakageGuard.js";

const EVM_CHAINS = new Set([
  "ethereum",
  "base",
  "bsc",
  "arbitrum",
  "optimism",
  "polygon",
  "avalanche",
  "fantom",
  "linea",
  "scroll",
  "zksync",
  "mantle",
  "blast",
  "ronin",
  "mode",
  "berachain",
  "sonic",
  "robinhood",
  "robinhood-chain",
]);

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function readJsonLines(file) {
  if (!fs.existsSync(file)) return { records: [], lineCount: 0, malformedLineCount: 0 };
  const records = [];
  let lineCount = 0;
  let malformedLineCount = 0;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    lineCount += 1;
    try {
      const parsed = JSON.parse(line);
      records.push(parsed?.record && typeof parsed.record === "object" ? parsed.record : parsed);
    } catch {
      malformedLineCount += 1;
    }
  }
  return { records, lineCount, malformedLineCount };
}

function arrayRows(value, keys = []) {
  if (Array.isArray(value)) return value;
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}

function normalizedChain(value) {
  const chain = String(value || "").trim().toLowerCase();
  const aliases = {
    eth: "ethereum",
    sol: "solana",
    bnb: "bsc",
    "bnb-chain": "bsc",
    "binance-smart-chain": "bsc",
    arb: "arbitrum",
    op: "optimism",
    matic: "polygon",
    avax: "avalanche",
    ftm: "fantom",
  };
  return aliases[chain] || chain;
}

function looksLikeTokenAddress(chain, token) {
  if (!chain || chain === "unknown" || !token || token === "unknown") return false;
  if (/^https?:|^[a-z]+:\/\//i.test(token)) return false;
  if (EVM_CHAINS.has(chain)) return /^0x[0-9a-f]{40}$/i.test(token);
  if (chain === "solana") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token);
  if (chain === "sui") return /^0x[0-9a-f]{1,64}::[a-z0-9_]+::[a-z0-9_]+$/i.test(token);
  if (chain === "ton") return /^(?:EQ|UQ)[A-Za-z0-9_-]{40,60}$/.test(token);
  if (chain === "aptos") return /^0x[0-9a-f]{1,64}(?:::[A-Za-z0-9_]+::[A-Za-z0-9_]+)?$/i.test(token);
  if (chain === "sei") return /^sei1[0-9a-z]{20,80}$/.test(token);
  if (chain === "cosmos") return /^cosmos1[0-9a-z]{20,80}$/.test(token);
  if (chain === "osmosis") return /^osmo1[0-9a-z]{20,80}$/.test(token);
  if (chain === "near") return /^(?:[a-z0-9._-]{2,64}\.near|[0-9a-f]{64})$/.test(token);
  if (chain === "tron") return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(token);
  return false;
}

function exactIdentity(row = {}) {
  const chain = normalizedChain(row.chain || row.network);
  const declaredPool = row.poolAddress || row.pairAddress || row.marketData?.poolAddress || null;
  const stronglyTypedAddress =
    row.tokenAddress ||
    row.contractAddress ||
    row.canonicalAddress ||
    row.baseToken?.address ||
    row.marketData?.tokenAddress ||
    null;
  const genericAddress = row.address && String(row.address) !== String(declaredPool || "") ? row.address : null;
  const explicitAddress = stronglyTypedAddress || genericAddress;
  const rawId = String(explicitAddress || row.id || row.key || "").trim();
  let token = rawId;
  const prefix = `${chain}:`;
  if (chain && rawId.toLowerCase().startsWith(prefix)) token = rawId.slice(prefix.length);
  if (!chain && rawId.includes(":")) {
    const [possibleChain, ...rest] = rawId.split(":");
    const inferredChain = normalizedChain(possibleChain);
    const inferredToken = rest.join(":");
    if (looksLikeTokenAddress(inferredChain, inferredToken)) {
      if (inferredChain === "solana" && !explicitAddress && row.identityCasePreserved !== true) return null;
      const canonicalToken = EVM_CHAINS.has(inferredChain) ? inferredToken.toLowerCase() : inferredToken;
      return { chain: inferredChain, tokenAddress: inferredToken, identityKey: `${inferredChain}:${canonicalToken}` };
    }
  }
  const symbol = String(row.symbol || "").trim().toLowerCase();
  const name = String(row.name || "").trim().toLowerCase();
  if (token.toLowerCase() === symbol || token.toLowerCase() === name) return null;
  if (chain === "solana" && !explicitAddress && row.identityCasePreserved !== true) return null;
  if (!looksLikeTokenAddress(chain, token)) return null;
  const canonicalToken = EVM_CHAINS.has(chain) ? token.toLowerCase() : token;
  return { chain, tokenAddress: token, identityKey: `${chain}:${canonicalToken}` };
}

function syntheticRecord(row = {}) {
  const text = [row.id, row.key, row.name, row.symbol, row.source]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return /engine[-_ ]audit|audit sample|synthetic|demo project|test fixture|mock token/.test(text);
}

function timestampMs(row = {}) {
  const parsed = new Date(
    row.scannedAt || row.decisionAt || row.timestamp || row.observedAt || row.createdAt || 0
  ).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function numericOrNull(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))
    ? Number(value)
    : null;
}

function booleanOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

function getPath(object, fieldPath) {
  return fieldPath.split(".").reduce((value, key) => value?.[key], object);
}

function firstNumberAtPaths(object, paths) {
  for (const fieldPath of paths) {
    const value = getPath(object, fieldPath);
    if (value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value)));
}

function priceUsd(row = {}) {
  return positiveNumber(row.priceUsd, row.price, row.entryPriceUsd, row.market?.priceUsd, row.marketData?.priceUsd);
}

function liquidityUsd(row = {}) {
  return positiveNumber(
    row.liquidityUsd,
    row.dexLiquidityUsd,
    row.stableExitLiquidityUsd,
    row.market?.liquidityUsd,
    row.marketData?.liquidityUsd
  );
}

function percentReturn(entryPrice, exitPrice) {
  if (!(entryPrice > 0) || !(exitPrice > 0)) return null;
  return ((exitPrice - entryPrice) / entryPrice) * 100;
}

function dateRange(rows, getter = timestampMs) {
  const timestamps = rows.map(getter).filter((value) => value > 0);
  if (!timestamps.length) return { first: null, last: null, spanDays: 0 };
  const first = Math.min(...timestamps);
  const last = Math.max(...timestamps);
  return {
    first: new Date(first).toISOString(),
    last: new Date(last).toISOString(),
    spanDays: Number(((last - first) / 86400000).toFixed(2)),
  };
}

function reasonCounts(rows = []) {
  const counts = {};
  for (const row of rows) counts[row.reason] = (counts[row.reason] || 0) + 1;
  return counts;
}

function inventory(dataDir) {
  if (!fs.existsSync(dataDir)) return { totalBytes: 0, files: [] };
  const files = fs
    .readdirSync(dataDir)
    .map((name) => path.join(dataDir, name))
    .filter((file) => fs.statSync(file).isFile())
    .map((file) => ({ file, bytes: fs.statSync(file).size }))
    .sort((a, b) => b.bytes - a.bytes);
  return { totalBytes: files.reduce((sum, item) => sum + item.bytes, 0), files };
}

function inspectJsonSource(file, keys = [], options = {}) {
  const exists = fs.existsSync(file);
  const bytes = exists ? fs.statSync(file).size : 0;
  const maximumInspectionBytes = Number(options.maximumInspectionBytes ?? 64 * 1024 * 1024);
  const inspected = exists && bytes <= maximumInspectionBytes;
  const value = inspected ? readJson(file) : null;
  return {
    file,
    exists,
    bytes,
    rows: inspected ? arrayRows(value, keys).length : null,
    inspectionStatus: inspected ? "INSPECTED" : exists ? "DEFERRED_LARGE_SOURCE" : "MISSING",
  };
}

function inspectSqlite(file) {
  if (!fs.existsSync(file)) return { file, exists: false, tables: {} };
  try {
    const database = new Database(file, { readonly: true, fileMustExist: true });
    const tableNames = ["decision_history", "outcome_labels", "snapshots", "evidence_events"];
    const tables = Object.fromEntries(
      tableNames.map((table) => {
        const count = database.prepare(`SELECT count(*) AS count FROM ${table}`).get().count;
        return [table, count];
      })
    );
    database.close();
    return { file, exists: true, bytes: fs.statSync(file).size, tables };
  } catch (error) {
    return { file, exists: true, bytes: fs.statSync(file).size, error: error.message, tables: {} };
  }
}

function buildSourceAudit(dataDir, reportDir) {
  const sqlite = inspectSqlite(path.join(dataDir, "cli.db"));
  return [
    {
      ...inspectJsonSource(path.join(dataDir, "scan-history.json"), [], { maximumInspectionBytes: 0 }),
      disposition: "USED_PREDICTIONS",
    },
    {
      file: path.join(dataDir, "scan-history.jsonl"),
      exists: fs.existsSync(path.join(dataDir, "scan-history.jsonl")),
      bytes: fs.existsSync(path.join(dataDir, "scan-history.jsonl"))
        ? fs.statSync(path.join(dataDir, "scan-history.jsonl")).size
        : 0,
      disposition: "USED_PREDICTIONS",
    },
    { ...inspectJsonSource(path.join(dataDir, "outcome-snapshots.json")), disposition: "USED_OUTCOME_PRICES" },
    {
      ...inspectJsonSource(path.join(dataDir, "paper-trading-outcomes.json"), ["records"]),
      disposition: "AUDITED_EXCLUDED_SELECTION_BIAS",
    },
    {
      ...inspectJsonSource(path.join(dataDir, "project-watchlist.json"), ["records", "projects"]),
      disposition: "AUDITED_EXCLUDED_DUPLICATE_DERIVED_WATCHLIST",
    },
    {
      ...inspectJsonSource(path.join(dataDir, "point-in-time-observations.json"), ["projects"]),
      disposition: "AUDITED_EXCLUDED_NO_EXACT_ADDRESS_FIELD",
    },
    {
      ...inspectJsonSource(path.join(reportDir, "exact-outcome-horizon-lab.json"), ["evaluations"]),
      disposition: "AUDITED_EXCLUDED_NO_MATURE_EVALUATIONS",
    },
    {
      ...inspectJsonSource(path.join(reportDir, "missed-winner-replay.json"), ["replay"]),
      disposition: "AUDITED_EXCLUDED_HINDSIGHT_REPLAY",
    },
    {
      ...inspectJsonSource(path.join(reportDir, "first-seen-opportunities.json"), ["opportunities", "projects"]),
      disposition: "AUDITED_EXCLUDED_REPORT_DERIVATIVE",
    },
    {
      ...sqlite,
      disposition:
        Number(sqlite.tables?.outcome_labels || 0) > 0
          ? "AUDITED_NOT_JOINED_SCHEMA_REQUIRES_EXACT_IDENTITY_EXPORT"
          : "AUDITED_EXCLUDED_NO_OUTCOME_LABELS",
    },
    {
      source: "Supabase",
      disposition: "AUDITED_EXCLUDED_NO_IMMUTABLE_LOCAL_EXPORT_FOR_THIS_RUN",
      reason: "A live remote query would not be a reproducible point-in-time backtest input.",
    },
  ];
}

function findNearestSnapshot(snapshots, targetAt, toleranceMs) {
  let best = null;
  for (const snapshot of snapshots) {
    const delta = Math.abs(snapshot.timestampMs - targetAt);
    if (delta > toleranceMs) continue;
    if (!best || delta < best.delta) best = { snapshot, delta };
  }
  return best?.snapshot || null;
}

const OUTCOME_HORIZONS = Object.freeze([
  { id: "1h", hours: 1, toleranceHours: 0.5 },
  { id: "6h", hours: 6, toleranceHours: 2 },
  { id: "24h", hours: 24, toleranceHours: 6 },
  { id: "72h", hours: 72, toleranceHours: 12 },
  { id: "168h", hours: 168, toleranceHours: 24 },
  { id: "720h", hours: 720, toleranceHours: 72 },
]);

function horizonReturns(prediction, snapshots) {
  return Object.fromEntries(
    OUTCOME_HORIZONS.map((horizon) => {
      const targetAt = prediction.timestampMs + horizon.hours * 3600000;
      const snapshot = findNearestSnapshot(snapshots, targetAt, horizon.toleranceHours * 3600000);
      return [
        horizon.id,
        snapshot
          ? {
              status: "RESOLVED",
              targetAt: new Date(targetAt).toISOString(),
              observedAt: new Date(snapshot.timestampMs).toISOString(),
              deltaHours: Number(((snapshot.timestampMs - targetAt) / 3600000).toFixed(2)),
              returnPct: Number(percentReturn(prediction.entryPriceUsd, snapshot.priceUsd).toFixed(4)),
            }
          : { status: "UNRESOLVED", targetAt: new Date(targetAt).toISOString(), returnPct: null },
      ];
    })
  );
}

function firstTarget(pathRows, entryPrice, targetPct, maximumHours) {
  const cutoff = pathRows.length ? pathRows[0].decisionTimestampMs + maximumHours * 3600000 : 0;
  const hit = pathRows.find(
    (snapshot) =>
      (!cutoff || snapshot.timestampMs <= cutoff) && percentReturn(entryPrice, snapshot.priceUsd) >= targetPct
  );
  return hit
    ? {
        hit: true,
        observedAt: new Date(hit.timestampMs).toISOString(),
        hoursFromEntry: Number(((hit.timestampMs - hit.decisionTimestampMs) / 3600000).toFixed(2)),
      }
    : { hit: false, observedAt: null, hoursFromEntry: null };
}

function buildOutcome(prediction, snapshots, options = {}) {
  const horizonHours = Number(options.horizonHours ?? 168);
  const toleranceHours = Number(options.outcomeToleranceHours ?? 24);
  const targetAt = prediction.timestampMs + horizonHours * 3600000;
  const exit = findNearestSnapshot(snapshots, targetAt, toleranceHours * 3600000);
  if (!exit) return { status: "UNRESOLVED_NO_7D_SNAPSHOT", targetAt: new Date(targetAt).toISOString() };

  const pathRows = snapshots.filter(
    (snapshot) => snapshot.timestampMs > prediction.timestampMs && snapshot.timestampMs <= exit.timestampMs
  ).map((snapshot) => ({ ...snapshot, decisionTimestampMs: prediction.timestampMs }));
  const pathReturns = pathRows
    .map((snapshot) => percentReturn(prediction.entryPriceUsd, snapshot.priceUsd))
    .filter((value) => value !== null);
  const returnAt168hPct = percentReturn(prediction.entryPriceUsd, exit.priceUsd);
  if (returnAt168hPct === null) return { status: "UNRESOLVED_INVALID_EXIT_PRICE", targetAt: new Date(targetAt).toISOString() };

  const maximumReturn168hPct = pathReturns.length ? Math.max(...pathReturns) : returnAt168hPct;
  const maximumAdverseExcursionPct = pathReturns.length ? Math.min(...pathReturns) : returnAt168hPct;
  let runningPeakPrice = prediction.entryPriceUsd;
  let maximumDrawdownPct = 0;
  for (const snapshot of pathRows) {
    runningPeakPrice = Math.max(runningPeakPrice, snapshot.priceUsd);
    maximumDrawdownPct = Math.max(
      maximumDrawdownPct,
      ((runningPeakPrice - snapshot.priceUsd) / runningPeakPrice) * 100
    );
  }
  const terminalFailure = (snapshot) =>
    Boolean(snapshot.rugged || snapshot.becameUntradeable || snapshot.liquidityWasRemoved || snapshot.deadToken);
  const firstLiquidityFailure = pathRows.find(terminalFailure);
  const firstSellRouteFailure = pathRows.find((snapshot) => snapshot.sellRouteAvailable === false);
  const explicitFailure = terminalFailure(exit) || Boolean(firstLiquidityFailure);
  const entryLiquidity = prediction.entryLiquidityUsd;
  const exitLiquidity = exit.liquidityUsd;
  const liquiditySurvived =
    explicitFailure
      ? false
      : entryLiquidity && exitLiquidity
        ? exitLiquidity >= Math.max(1000, entryLiquidity * 0.1)
        : null;

  const targets = {
    plus25Within24h: firstTarget(pathRows, prediction.entryPriceUsd, 25, 24),
    plus50Within72h: firstTarget(pathRows, prediction.entryPriceUsd, 50, 72),
    plus100Within168h: firstTarget(pathRows, prediction.entryPriceUsd, 100, 168),
    plus200Within168h: firstTarget(pathRows, prediction.entryPriceUsd, 200, 168),
  };
  const firstTwoXAt = targets.plus100Within168h.observedAt
    ? new Date(targets.plus100Within168h.observedAt).getTime()
    : Infinity;
  const catastrophicBeforeTwoX = pathRows.some(
    (snapshot) =>
      snapshot.timestampMs < firstTwoXAt && percentReturn(prediction.entryPriceUsd, snapshot.priceUsd) <= -50
  );
  const firstCatastrophic = pathRows.find(
    (snapshot) => percentReturn(prediction.entryPriceUsd, snapshot.priceUsd) <= -50
  );
  const liquidityFailureBeforeTwoX = Boolean(
    firstLiquidityFailure && firstLiquidityFailure.timestampMs <= firstTwoXAt
  );
  const sellRouteFailureBeforeTwoX = Boolean(
    firstSellRouteFailure && firstSellRouteFailure.timestampMs <= firstTwoXAt
  );
  const sellRouteSurvived = firstSellRouteFailure
    ? false
    : typeof exit.sellRouteAvailable === "boolean"
      ? exit.sellRouteAvailable
      : null;
  const successfulSevenDayBreakout =
    targets.plus100Within168h.hit &&
    !catastrophicBeforeTwoX &&
    !liquidityFailureBeforeTwoX &&
    !sellRouteFailureBeforeTwoX &&
    liquiditySurvived === true;

  return {
    status: "RESOLVED",
    horizonHours,
    targetAt: new Date(targetAt).toISOString(),
    exitObservedAt: new Date(exit.timestampMs).toISOString(),
    deltaHours: Number(((exit.timestampMs - targetAt) / 3600000).toFixed(2)),
    entryPriceUsd: prediction.entryPriceUsd,
    exitPriceUsd: exit.priceUsd,
    returnAt168hPct: Number(returnAt168hPct.toFixed(4)),
    maximumReturn168hPct: Number(maximumReturn168hPct.toFixed(4)),
    maximumDrawdownPct: Number(maximumDrawdownPct.toFixed(4)),
    maximumAdverseExcursionPct: Number(maximumAdverseExcursionPct.toFixed(4)),
    pathObservationCount: pathRows.length,
    horizonReturns: horizonReturns(prediction, snapshots),
    targets,
    successfulSevenDayBreakout,
    catastrophicDrawdownBeforeTwoX: catastrophicBeforeTwoX,
    firstCatastrophicAt: firstCatastrophic ? new Date(firstCatastrophic.timestampMs).toISOString() : null,
    firstLiquidityFailureAt: firstLiquidityFailure
      ? new Date(firstLiquidityFailure.timestampMs).toISOString()
      : null,
    firstSellRouteFailureAt: firstSellRouteFailure
      ? new Date(firstSellRouteFailure.timestampMs).toISOString()
      : null,
    liquidityFailureBeforeTwoX,
    sellRouteFailureBeforeTwoX,
    timeToTwoXHours: targets.plus100Within168h.hoursFromEntry,
    entryLiquidityUsd: entryLiquidity,
    exitLiquidityUsd: exitLiquidity,
    liquiditySurvived,
    sellRouteSurvived,
    rugged: explicitFailure || undefined,
    outcomeSource: exit.sourceFile,
    executionCostsIncluded: false,
  };
}

function compactPrediction(record, identity, timestamp, entryPrice, sourceFile, cleaned) {
  const pointInTime = record.pointInTime || {};
  const legacyProductionScore = firstNumberAtPaths(record, ["scores.pipeline", "pipelineScore"]);
  const storedProductionScore = numericOrNull(pointInTime.productionDecision?.score) ??
    (legacyProductionScore !== null && legacyProductionScore > 0 ? legacyProductionScore : null);
  const rawSmartWalletNetFlowUsd = firstNumberAtPaths(record, [
    "pointInTime.smartWallets.qualifiedNetFlowUsd",
    "qualifiedSmartWalletNetFlowUsd",
    "walletFlow.qualifiedSmartWalletNetFlowUsd",
    "signals.intelligenceSignals.smartWallet.signal.smartWalletNetFlowUsd",
  ]);
  const hasExplicitQualifiedWalletEvidence = Boolean(
    pointInTime.smartWallets?.qualificationMethod ||
      Number(pointInTime.smartWallets?.qualifiedWalletCount) > 0 ||
      getPath(record, "pointInTime.smartWallets.qualifiedNetFlowUsd") !== undefined
  );
  const smartWalletPerformanceScore = firstNumberAtPaths(record, [
    "smartWalletPerformanceScore",
    "scores.smartWalletPerformance",
  ]);
  const strongestCatalyst = record.pointInTime?.catalyst || record.signals?.strongestCatalyst;
  const verifiedCatalyst =
    record.pointInTime?.catalyst?.verified === true ||
    record.verifiedCatalyst === true ||
    Boolean(
      strongestCatalyst &&
        typeof strongestCatalyst === "object" &&
        strongestCatalyst.title &&
        strongestCatalyst.source
    );
  return {
    identityKey: identity.identityKey,
    chain: identity.chain,
    tokenAddress: identity.tokenAddress,
    name: record.name || null,
    symbol: record.symbol || null,
    scannedAt: new Date(timestamp).toISOString(),
    timestampMs: timestamp,
    entryPriceUsd: entryPrice,
    entryLiquidityUsd: liquidityUsd(record),
    market: {
      priceUsd: entryPrice,
      liquidityUsd: liquidityUsd(record),
      volume24h: numericOrNull(record.market?.volume24h ?? record.volume24h),
      marketCap: numericOrNull(record.market?.marketCap ?? record.marketCap),
      priceChange24h: numericOrNull(record.market?.priceChange24h ?? record.priceChange24h),
    },
    storedProductionScore,
    storedProductionRank: numericOrNull(pointInTime.productionDecision?.rank),
    storedProductionVerdict:
      pointInTime.productionDecision?.verdict || record.signals?.finalSelectionState || null,
    storedProductionConfidence: numericOrNull(pointInTime.productionDecision?.confidence),
    productionScoreProvenance:
      numericOrNull(pointInTime.productionDecision?.score) !== null
        ? "NULL_PRESERVING_POINT_IN_TIME_RECORD"
        : storedProductionScore !== null
          ? "LEGACY_POSITIVE_STORED_SCORE"
          : "UNAVAILABLE_LEGACY_ZERO_OR_MISSING",
    scores: record.scores && typeof record.scores === "object" ? record.scores : {},
    signals: {
      evidence: Array.isArray(record.signals?.evidence)
        ? record.signals.evidence.map((item) => ({ engine: item?.engine, signal: item?.signal }))
        : [],
    },
    rawEvidence: {
      qualifiedSmartWalletNetFlowUsd:
        rawSmartWalletNetFlowUsd !== null &&
        (hasExplicitQualifiedWalletEvidence || (rawSmartWalletNetFlowUsd !== 0 && smartWalletPerformanceScore > 0))
          ? rawSmartWalletNetFlowUsd
          : null,
      qualifiedSmartWalletCount: numericOrNull(pointInTime.smartWallets?.qualifiedWalletCount),
      qualifiedSmartWalletSource: pointInTime.smartWallets?.source || null,
      independentBuyerAccelerationPct: numericOrNull(pointInTime.buyers?.accelerationPct),
      clusterAdjustedUniqueBuyers24h: numericOrNull(
        pointInTime.buyers?.clusterAdjustedUniqueBuyers24h
      ),
      previousClusterAdjustedUniqueBuyers24h: numericOrNull(
        pointInTime.buyers?.previousClusterAdjustedUniqueBuyers24h
      ),
      buyerSource: pointInTime.buyers?.source || null,
      verifiedCatalystScore: verifiedCatalyst ? 100 : null,
      catalystSource: pointInTime.catalyst?.source || strongestCatalyst?.source || null,
      catalystAnnouncedAt: pointInTime.catalyst?.announcedAt || null,
      priceChange24hPct: numericOrNull(
        pointInTime.market?.priceChange24hPct ?? record.market?.priceChange24h ?? record.priceChange24h
      ),
      volume24hUsd: numericOrNull(
        pointInTime.market?.volume24hUsd ?? record.market?.volume24h ?? record.volume24h
      ),
      previousVolume24hUsd: numericOrNull(pointInTime.market?.previousVolume24hUsd),
      volumeAccelerationPct: numericOrNull(pointInTime.market?.volumeAccelerationPct),
      liquidityUsd: numericOrNull(pointInTime.liquidity?.liquidityUsd) ?? liquidityUsd(record),
      previousLiquidityUsd: numericOrNull(pointInTime.liquidity?.previousLiquidityUsd),
      liquidityGrowthPct: numericOrNull(pointInTime.liquidity?.growthPct),
      marketCapUsd: numericOrNull(
        pointInTime.market?.marketCapUsd ?? record.market?.marketCap ?? record.marketCap
      ),
      safetyStatus: pointInTime.safety?.status || null,
      safetyTestedChecks: Array.isArray(pointInTime.safety?.testedChecks)
        ? pointInTime.safety.testedChecks
        : [],
      safetyUnknownChecks: Array.isArray(pointInTime.safety?.unknownChecks)
        ? pointInTime.safety.unknownChecks
        : [],
      deterministicSafetyBlocks: Array.isArray(pointInTime.safety?.deterministicBlocks)
        ? pointInTime.safety.deterministicBlocks
        : [],
    },
    honeypotDetected: booleanOrNull(pointInTime.safety?.honeypotDetected ?? record.honeypotDetected),
    sellRestricted: booleanOrNull(pointInTime.safety?.sellRestricted ?? record.sellRestricted),
    contractVerified: booleanOrNull(pointInTime.safety?.contractVerified ?? record.contractVerified),
    buyQuoteVerified: booleanOrNull(pointInTime.execution?.buyQuoteVerified ?? record.buyQuoteVerified),
    sellQuoteVerified: booleanOrNull(pointInTime.execution?.sellQuoteVerified ?? record.sellQuoteVerified),
    depthVerified: booleanOrNull(pointInTime.execution?.depthVerified ?? record.depthVerified),
    slippageVerified: booleanOrNull(pointInTime.execution?.slippageVerified ?? record.slippageVerified),
    quoteTimestamp: pointInTime.execution?.quoteTimestamp || record.quoteTimestamp || null,
    purchaseRouteConfirmed: booleanOrNull(record.purchaseRouteConfirmed),
    sellRouteAvailable: booleanOrNull(record.sellRouteAvailable),
    providerFailure: Array.isArray(pointInTime.provenance?.providerStatuses)
      ? pointInTime.provenance.providerStatuses.some((item) =>
          ["FAILED", "TIMEOUT", "RATE_LIMITED", "REGION_BLOCKED"].includes(item?.status)
        )
      : null,
    aliasConflict: Array.isArray(pointInTime.provenance?.aliasConflicts)
      ? pointInTime.provenance.aliasConflicts.length > 0
      : null,
    sourceFile,
    leakageRejectedFields: cleaned.rejected,
  };
}

function enrichMeasuredSequenceEvidence(predictions) {
  const histories = new Map();
  for (const prediction of predictions) {
    if (!histories.has(prediction.identityKey)) histories.set(prediction.identityKey, []);
    histories.get(prediction.identityKey).push(prediction);
  }
  for (const history of histories.values()) {
    history.sort((left, right) => left.timestampMs - right.timestampMs);
    for (let index = 0; index < history.length; index += 1) {
      const current = history[index];
      const previous = history
        .slice(0, index)
        .reverse()
        .find((candidate) => {
          const ageHours = (current.timestampMs - candidate.timestampMs) / 3600000;
          return ageHours >= 1 && ageHours <= 168;
        });
      const currentVolume = current.rawEvidence.volume24hUsd;
      const previousVolume = previous?.rawEvidence.volume24hUsd;
      const currentLiquidity = current.rawEvidence.liquidityUsd;
      const previousLiquidity = previous?.rawEvidence.liquidityUsd;
      const explicitVolumeGrowth = current.rawEvidence.volumeAccelerationPct;
      if (explicitVolumeGrowth !== null) {
        current.rawEvidence.volumeGrowth = explicitVolumeGrowth / 100;
        current.rawEvidence.volumeAccelerationScore = clamp(50 + explicitVolumeGrowth / 2);
      } else if (currentVolume !== null && previousVolume > 0) {
        const growth = (currentVolume - previousVolume) / previousVolume;
        current.rawEvidence.volumeGrowth = growth;
        current.rawEvidence.volumeAccelerationScore = clamp(50 + growth * 50);
      } else {
        current.rawEvidence.volumeGrowth = null;
        current.rawEvidence.volumeAccelerationScore = null;
      }
      const explicitLiquidityGrowth = current.rawEvidence.liquidityGrowthPct;
      if (explicitLiquidityGrowth !== null) {
        current.rawEvidence.liquidityGrowth = explicitLiquidityGrowth / 100;
        current.rawEvidence.liquidityFormationScore = clamp(50 + explicitLiquidityGrowth / 2);
      } else if (currentLiquidity !== null && previousLiquidity > 0) {
        const growth = (currentLiquidity - previousLiquidity) / previousLiquidity;
        current.rawEvidence.liquidityGrowth = growth;
        current.rawEvidence.liquidityFormationScore = clamp(50 + growth * 50);
      } else {
        current.rawEvidence.liquidityGrowth = null;
        current.rawEvidence.liquidityFormationScore = null;
      }
      current.rawEvidence.relativeStrengthScore =
        current.rawEvidence.priceChange24hPct === null
          ? null
          : clamp(50 + current.rawEvidence.priceChange24hPct / 2);
      const smartFlow = current.rawEvidence.qualifiedSmartWalletNetFlowUsd;
      const marketCap = current.rawEvidence.marketCapUsd;
      current.rawEvidence.qualifiedSmartWalletFlowScore =
        smartFlow === null
          ? null
          : marketCap > 0
            ? clamp((smartFlow / marketCap) * 5000)
            : clamp(smartFlow / 25000);
      const buyerAcceleration = current.rawEvidence.independentBuyerAccelerationPct;
      const currentBuyers = current.rawEvidence.clusterAdjustedUniqueBuyers24h;
      const previousBuyers = current.rawEvidence.previousClusterAdjustedUniqueBuyers24h;
      current.rawEvidence.independentBuyerAccelerationScore =
        buyerAcceleration !== null
          ? clamp(50 + buyerAcceleration / 2)
          : currentBuyers !== null && previousBuyers > 0
            ? clamp(50 + ((currentBuyers - previousBuyers) / previousBuyers) * 50)
            : null;
      current.rawEvidence.safetyScore =
        current.honeypotDetected === true || current.sellRestricted === true
          ? 0
          : current.honeypotDetected === false && current.sellRestricted === false
            ? 100
            : null;
    }
  }
}

export function buildHistoricalDataset(options = {}) {
  const dataDir = path.resolve(options.dataDir || "data");
  const reportDir = path.resolve(options.reportDir || "reports");
  const predictionFiles = [path.join(dataDir, "scan-history.json"), path.join(dataDir, "scan-history.jsonl")];
  const snapshotFile = path.join(dataDir, "outcome-snapshots.json");
  const sourceInventory = inventory(dataDir);
  const sourceAudit = buildSourceAudit(dataDir, reportDir);

  const legacyPredictions = arrayRows(readJson(predictionFiles[0]), ["records", "projects", "snapshots"]);
  const sidecarRead = readJsonLines(predictionFiles[1]);
  const sidecarPredictions = sidecarRead.records;
  const rawPredictions = [
    ...legacyPredictions.map((row) => ({ ...row, __sourceFile: predictionFiles[0] })),
    ...sidecarPredictions.map((row) => ({ ...row, __sourceFile: predictionFiles[1] })),
  ];
  const rawOutcomeSnapshots = arrayRows(readJson(snapshotFile), ["records", "snapshots", "observations"]);
  for (const source of sourceAudit) {
    if (source.file === predictionFiles[0]) {
      source.rows = legacyPredictions.length;
      source.inspectionStatus = "LOADED_FOR_BACKTEST";
    } else if (source.file === predictionFiles[1]) {
      source.rows = sidecarPredictions.length;
      source.lineCount = sidecarRead.lineCount;
      source.malformedLineCount = sidecarRead.malformedLineCount;
      source.inspectionStatus = "LOADED_FOR_BACKTEST";
    } else if (source.file === snapshotFile) {
      source.rows = rawOutcomeSnapshots.length;
      source.inspectionStatus = "LOADED_FOR_BACKTEST";
    }
  }
  const rejected = [];
  const quarantined = [];
  const deduped = new Map();
  const leakageRemovals = [];

  for (const raw of rawPredictions) {
    if (syntheticRecord(raw)) {
      quarantined.push({ reason: "SYNTHETIC_OR_TEST_RECORD", sourceFile: raw.__sourceFile, id: raw.id || null });
      continue;
    }
    const identity = exactIdentity(raw);
    if (!identity) {
      quarantined.push({ reason: "MISSING_EXACT_CHAIN_TOKEN_IDENTITY", sourceFile: raw.__sourceFile, id: raw.id || null });
      continue;
    }
    const timestamp = timestampMs(raw);
    if (!timestamp) {
      rejected.push({ reason: "MISSING_DECISION_TIMESTAMP", identityKey: identity.identityKey });
      continue;
    }
    const entryPrice = priceUsd(raw);
    if (!entryPrice) {
      quarantined.push({ reason: "MISSING_ENTRY_PRICE", identityKey: identity.identityKey, scannedAt: raw.scannedAt || null });
      continue;
    }
    const cleaned = stripFutureEvidence(raw);
    leakageRemovals.push(...cleaned.rejected.map((item) => ({ ...item, identityKey: identity.identityKey })));
    const cleanAudit = auditPointInTimeRecord(cleaned.record);
    if (!cleanAudit.valid) {
      rejected.push({ reason: "POINT_IN_TIME_LEAKAGE", identityKey: identity.identityKey, violations: cleanAudit.violations });
      continue;
    }
    const key = `${identity.identityKey}:${new Date(timestamp).toISOString()}`;
    if (deduped.has(key)) continue;
    deduped.set(
      key,
      compactPrediction(cleaned.record, identity, timestamp, entryPrice, raw.__sourceFile, cleaned)
    );
  }

  const predictions = [...deduped.values()].sort((a, b) => a.timestampMs - b.timestampMs);
  enrichMeasuredSequenceEvidence(predictions);
  const snapshotIndex = new Map();
  let validOutcomeSnapshotCount = 0;
  let invalidOutcomeSnapshotCount = 0;
  const addSnapshot = (identityKey, snapshot) => {
    if (!snapshotIndex.has(identityKey)) snapshotIndex.set(identityKey, []);
    const list = snapshotIndex.get(identityKey);
    if (!list.some((item) => item.timestampMs === snapshot.timestampMs && item.priceUsd === snapshot.priceUsd)) {
      list.push(snapshot);
    }
  };

  for (const raw of rawOutcomeSnapshots) {
    const identity = exactIdentity(raw);
    const timestamp = timestampMs(raw);
    const price = priceUsd(raw);
    if (!identity || !timestamp || !price) {
      invalidOutcomeSnapshotCount += 1;
      continue;
    }
    validOutcomeSnapshotCount += 1;
    addSnapshot(identity.identityKey, {
      timestampMs: timestamp,
      priceUsd: price,
      liquidityUsd: liquidityUsd(raw),
      rugged: raw.rugged === true,
      becameUntradeable: raw.becameUntradeable === true,
      liquidityWasRemoved: raw.liquidityWasRemoved === true,
      deadToken: raw.deadToken === true,
      sourceFile: snapshotFile,
      sellRouteAvailable: booleanOrNull(raw.sellRouteAvailable),
    });
  }
  for (const prediction of predictions) {
    addSnapshot(prediction.identityKey, {
      timestampMs: prediction.timestampMs,
      priceUsd: prediction.entryPriceUsd,
      liquidityUsd: prediction.entryLiquidityUsd,
      sourceFile: prediction.sourceFile,
    });
  }
  for (const snapshots of snapshotIndex.values()) snapshots.sort((a, b) => a.timestampMs - b.timestampMs);

  const records = [];
  const unresolvedOutcomeReasons = new Map();
  for (const prediction of predictions) {
    const outcome = buildOutcome(prediction, snapshotIndex.get(prediction.identityKey) || [], options);
    if (outcome.status !== "RESOLVED") {
      unresolvedOutcomeReasons.set(outcome.status, (unresolvedOutcomeReasons.get(outcome.status) || 0) + 1);
      continue;
    }
    records.push({ ...prediction, outcome });
  }

  const outcomeSnapshotIdentities = [...snapshotIndex.keys()].length;
  return {
    records,
    health: {
      status: records.length ? "READY_FOR_SAMPLE_AUDIT" : "INSUFFICIENT_RESOLVED_OUTCOMES",
      dataDirectoryBytes: sourceInventory.totalBytes,
      sourceInventory: sourceInventory.files,
      sourceAudit,
      predictionFiles,
      outcomeFiles: [snapshotFile],
      intentionallyExcludedOutcomeSources: [
        { file: path.join(dataDir, "paper-trading-outcomes.json"), reason: "Selection-biased paper positions are not a market-wide seven-day label source." },
        { file: path.join(dataDir, "point-in-time-observations.json"), reason: "Stored projects do not preserve exact chain-plus-token-address identity." },
      ],
      rawLegacyPredictions: legacyPredictions.length,
      rawSidecarPredictions: sidecarPredictions.length,
      sidecarLineCount: sidecarRead.lineCount,
      malformedSidecarLineCount: sidecarRead.malformedLineCount,
      rawPredictions: rawPredictions.length,
      rawOutcomeSnapshots: rawOutcomeSnapshots.length,
      validOutcomeSnapshots: validOutcomeSnapshotCount,
      invalidOutcomeSnapshots: invalidOutcomeSnapshotCount,
      exactSnapshotIdentities: outcomeSnapshotIdentities,
      exactIdentityPredictions: predictions.length,
      resolvedSevenDayOutcomes: records.length,
      rejectedCount: rejected.length,
      rejectedReasonCounts: reasonCounts(rejected),
      quarantinedCount: quarantined.length,
      quarantinedReasonCounts: reasonCounts(quarantined),
      deduplicatedCount: rawPredictions.length - predictions.length - rejected.length - quarantined.length,
      leakageFieldsRemoved: leakageRemovals.length,
      unresolvedOutcomeReasons: Object.fromEntries(unresolvedOutcomeReasons),
      predictionRange: dateRange(predictions),
      resolvedOutcomeDecisionRange: dateRange(records),
      snapshotRange: dateRange([...snapshotIndex.values()].flat(), (row) => row.timestampMs),
      identityRule: "normalized chain plus validated token address; symbols and names are never identity keys",
      outcomeRule: "nearest observed price to the seven-day target within a 24-hour tolerance",
    },
    leakageAudit: {
      status: rejected.some((item) => item.reason === "POINT_IN_TIME_LEAKAGE") ? "FAIL" : "PASS",
      strippedFieldCount: leakageRemovals.length,
      populatedFutureLabelsRemoved: leakageRemovals.filter(
        (item) => item.type === "POPULATED_FUTURE_LABEL_REMOVED"
      ).length,
      emptyFuturePlaceholdersRemoved: leakageRemovals.filter(
        (item) => item.type === "EMPTY_FUTURE_PLACEHOLDER_REMOVED"
      ).length,
      postDecisionEvidenceRemoved: leakageRemovals.filter(
        (item) => item.type === "FUTURE_EVIDENCE"
      ).length,
      strippedFieldExamples: leakageRemovals.slice(0, 100),
      unresolvedViolationCount: rejected.filter((item) => item.reason === "POINT_IN_TIME_LEAKAGE").length,
      unresolvedViolationExamples: rejected
        .filter((item) => item.reason === "POINT_IN_TIME_LEAKAGE")
        .slice(0, 50),
    },
    rejected: rejected.slice(0, 100),
    quarantined: quarantined.slice(0, 100),
  };
}

export { exactIdentity, looksLikeTokenAddress };
