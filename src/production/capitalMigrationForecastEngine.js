import { clamp, finite, identityKey, mean, timestamp } from "./productionMath.js";

function narratives(row = {}) {
  const values = row.narratives || row.tags || row.categories || [];
  return Array.isArray(values) ? values.map((v) => String(v).toLowerCase()) : [];
}

function currentFlow(row = {}) {
  return finite(
    row.capitalFlowBaseline?.netFlowUsd ??
    row.netFlowUsd ??
    row.capitalFlowObservation?.netFlowUsd
  ) ?? 0;
}

function migrationScore(row = {}) {
  return finite(row.capitalMigrationScore) ?? finite(row.capitalIntentGraphScore) ?? 0;
}

function timeOf(row = {}) {
  return timestamp(row.observedAt || row.generatedAt || row.timestamp || row.scannedAt);
}

export function buildCapitalMigrationForecast(currentProjects = [], historicalRows = [], options = {}) {
  const nowMs = timestamp(options.now || new Date().toISOString());
  const lookbackHours = Math.max(1, Number(options.lookbackHours || 24));
  const cutoff = nowMs - lookbackHours * 3_600_000;
  const history = (Array.isArray(historicalRows) ? historicalRows : []).filter((row) => {
    const at = timeOf(row);
    return at !== null && at >= cutoff && at <= nowMs;
  });

  function aggregate(rows, keyFn) {
    const map = new Map();
    for (const row of rows) {
      for (const key of keyFn(row)) {
        if (!map.has(key)) map.set(key, { key, netFlowUsd: 0, scoreSum: 0, rows: 0, latestAt: null });
        const target = map.get(key);
        target.netFlowUsd += currentFlow(row);
        target.scoreSum += migrationScore(row);
        target.rows += 1;
        target.latestAt = Math.max(target.latestAt || 0, timeOf(row) || 0);
      }
    }
    return map;
  }

  const chainCurrent = aggregate(currentProjects, (row) => [String(row.chain || row.canonicalChain || "unknown").toLowerCase()]);
  const chainHistory = aggregate(history, (row) => [String(row.chain || row.canonicalChain || "unknown").toLowerCase()]);
  const narrativeCurrent = aggregate(currentProjects, (row) => narratives(row));
  const narrativeHistory = aggregate(history, (row) => narratives(row));

  function scoreMaps(current, prior) {
    const keys = new Set([...current.keys(), ...prior.keys()]);
    return [...keys].map((key) => {
      const now = current.get(key) || { netFlowUsd: 0, scoreSum: 0, rows: 0 };
      const before = prior.get(key) || { netFlowUsd: 0, scoreSum: 0, rows: 0 };
      const nowMeanScore = now.rows ? now.scoreSum / now.rows : 0;
      const priorMeanScore = before.rows ? before.scoreSum / before.rows : 0;
      const flowDelta = now.netFlowUsd - before.netFlowUsd / Math.max(1, lookbackHours);
      const scoreDelta = nowMeanScore - priorMeanScore;
      const acceleration = clamp(0.5 + Math.tanh(flowDelta / 500_000) * 0.35 + scoreDelta / 200) * 100;
      return {
        key,
        currentNetFlowUsd: now.netFlowUsd,
        historicalNetFlowUsd: before.netFlowUsd,
        migrationScore: Number(nowMeanScore.toFixed(2)),
        migrationScoreDelta: Number(scoreDelta.toFixed(2)),
        flowAccelerationScore: Number(acceleration.toFixed(2)),
        state: acceleration >= 70 ? "CAPITAL_ROTATING_IN" : acceleration <= 35 ? "CAPITAL_ROTATING_OUT" : "CAPITAL_NEUTRAL",
      };
    }).sort((a, b) => b.flowAccelerationScore - a.flowAccelerationScore);
  }

  const chains = scoreMaps(chainCurrent, chainHistory);
  const narrativeRows = scoreMaps(narrativeCurrent, narrativeHistory);
  const chainMap = new Map(chains.map((row) => [row.key, row]));
  const narrativeMap = new Map(narrativeRows.map((row) => [row.key, row]));

  const candidates = (Array.isArray(currentProjects) ? currentProjects : []).map((row) => {
    const chainKey = String(row.chain || row.canonicalChain || "unknown").toLowerCase();
    const chain = chainMap.get(chainKey);
    const narrativeScores = narratives(row).map((n) => narrativeMap.get(n)).filter(Boolean);
    const narrativeAcceleration = mean(narrativeScores.map((n) => n.flowAccelerationScore));
    const projectScore = migrationScore(row);
    const forecast = clamp((projectScore / 100) * 0.45 + ((chain?.flowAccelerationScore ?? 50) / 100) * 0.30 + ((narrativeAcceleration ?? 50) / 100) * 0.25) * 100;
    return {
      identityKey: identityKey(row),
      symbol: row.symbol || null,
      chain: chainKey,
      projectMigrationScore: projectScore,
      chainMigrationState: chain?.state || "UNKNOWN",
      chainAccelerationScore: chain?.flowAccelerationScore ?? null,
      narrativeAccelerationScore: narrativeAcceleration === null ? null : Number(narrativeAcceleration.toFixed(2)),
      capitalMigrationForecastScore: Number(forecast.toFixed(2)),
      state: forecast >= 72 ? "PROJECT_IN_CAPITAL_DESTINATION" : forecast >= 58 ? "CAPITAL_DESTINATION_DEVELOPING" : forecast <= 35 ? "CAPITAL_LEAVING" : "NO_STRONG_MIGRATION_FORECAST",
    };
  }).sort((a, b) => b.capitalMigrationForecastScore - a.capitalMigrationForecastScore);

  return { schemaVersion: 1, generatedAt: options.now || new Date().toISOString(), lookbackHours, chains, narratives: narrativeRows, candidates, policy: { forecastIsResearchOnly: true, automaticTrading: false } };
}
