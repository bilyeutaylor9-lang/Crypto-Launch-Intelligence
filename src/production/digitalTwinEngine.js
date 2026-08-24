import { finite, identityKey, stableHash, timestamp } from "./productionMath.js";

const TRACKED = Object.freeze([
  "priceUsd", "liquidityUsd", "volume24hUsd", "marketCapUsd",
  "capitalMigrationForecastScore", "walletEntityScore", "multiscaleGenomeScore",
  "narrativePropagationScore", "captureableExpectedValuePct", "lateChaseProbabilityPct",
]);

function value(observation, field) {
  if (field === "priceUsd") return finite(observation.priceUsd ?? observation.marketData?.priceUsd);
  if (field === "liquidityUsd") return finite(observation.liquidityUsd ?? observation.activeLiquidityUsd ?? observation.stableExitLiquidityUsd);
  if (field === "volume24hUsd") return finite(observation.volume24hUsd ?? observation.volume24h ?? observation.dexVolume24hUsd);
  if (field === "marketCapUsd") return finite(observation.marketCapUsd ?? observation.marketCap ?? observation.circulatingMarketCapUsd);
  return finite(observation[field]);
}

export function createDigitalTwin(observation = {}, options = {}) {
  const observedAt = options.observedAt || observation.observedAt || observation.generatedAt || new Date().toISOString();
  const state = Object.fromEntries(TRACKED.map((field) => [field, value(observation, field)]));
  return {
    schemaVersion: 1,
    twinId: `twin:${stableHash(identityKey(observation)).slice(0,16)}`,
    identityKey: identityKey(observation),
    symbol: observation.symbol || null,
    chain: observation.chain || null,
    createdAt: observedAt,
    updatedAt: observedAt,
    state,
    categoricalState: {
      regime: observation.regimeState || observation.globalMarketRegimeState || null,
      migration: observation.capitalMigrationForecastState || observation.capitalMigrationState || null,
      halfLife: observation.opportunityHalfLife?.state || observation.halfLifeState || null,
      execution: observation.executionAwareEV?.state || observation.executionState || null,
    },
    version: 1,
    materialChanges: [],
    shadowOnly: true,
  };
}

export function updateDigitalTwin(previous = null, observation = {}, options = {}) {
  if (!previous) return createDigitalTwin(observation, options);
  const observedAt = options.observedAt || observation.observedAt || observation.generatedAt || new Date().toISOString();
  if (previous.identityKey !== identityKey(observation)) throw new Error("DIGITAL_TWIN_IDENTITY_MISMATCH");
  const nextState = { ...previous.state };
  const changes = [];
  for (const field of TRACKED) {
    const oldValue = finite(previous.state?.[field]);
    const newValue = value(observation, field);
    if (newValue === null) continue;
    nextState[field] = newValue;
    if (oldValue === null) {
      changes.push({ field, type: "NEW_EVIDENCE", from: null, to: newValue, materiality: 1 });
      continue;
    }
    const scale = Math.max(Math.abs(oldValue), 1);
    const relative = Math.abs(newValue - oldValue) / scale;
    const threshold = Number(options.materialChangeThreshold || 0.12);
    if (relative >= threshold) changes.push({ field, type: newValue > oldValue ? "INCREASE" : "DECREASE", from: oldValue, to: newValue, relativeChange: relative, materiality: Math.min(1, relative / Math.max(threshold, 1e-6)) });
  }
  const categoricalState = {
    regime: observation.regimeState || observation.globalMarketRegimeState || previous.categoricalState?.regime || null,
    migration: observation.capitalMigrationForecastState || observation.capitalMigrationState || previous.categoricalState?.migration || null,
    halfLife: observation.opportunityHalfLife?.state || observation.halfLifeState || previous.categoricalState?.halfLife || null,
    execution: observation.executionAwareEV?.state || observation.executionState || previous.categoricalState?.execution || null,
  };
  for (const [field, next] of Object.entries(categoricalState)) {
    const old = previous.categoricalState?.[field] ?? null;
    if (next !== null && next !== old) changes.push({ field: `categorical.${field}`, type: "STATE_TRANSITION", from: old, to: next, materiality: 1 });
  }
  return { ...previous, updatedAt: observedAt, version: Number(previous.version || 1) + 1, state: nextState, categoricalState, materialChanges: changes };
}

export function summarizeTwinChange(twin = {}) {
  const changes = twin.materialChanges || [];
  const significant = changes.filter((row) => Number(row.materiality || 0) >= 0.7);
  return { identityKey: twin.identityKey, version: twin.version, materialChangeCount: changes.length, significantChangeCount: significant.length, significantChanges: significant.slice(0,10), state: significant.length >= 3 ? "MULTI_FACTOR_STATE_CHANGE" : significant.length ? "MATERIAL_STATE_CHANGE" : "NO_MATERIAL_CHANGE" };
}
