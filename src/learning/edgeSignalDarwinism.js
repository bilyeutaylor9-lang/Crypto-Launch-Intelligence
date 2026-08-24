import fs from "node:fs";
import path from "node:path";

export const DEFAULT_EDGE_SIGNAL_POLICY = Object.freeze({
  horizonHours: 24,
  targetReturnPct: 25,
  lossReturnPct: -15,
  priorWins: 2,
  priorLosses: 2,
  minimumVerifiedSamples: 60,
  minimumProductionSamples: 120,
  verifiedPosteriorHitRate: 0.60,
  productionPosteriorHitRate: 0.65,
  verifiedWilsonLowerBound: 0.50,
  productionWilsonLowerBound: 0.55,
});

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function featureBag(row = {}) {
  const frozen = row.frozenFeatures && typeof row.frozenFeatures === "object"
    ? row.frozenFeatures
    : {};
  return {
    liquidityUsd: finite(
      row.liquidityUsd ?? row.activeLiquidityUsd ?? frozen.liquidityUsd
    ),
    volume24hUsd: finite(
      row.volume24hUsd ?? row.volume24h ?? row.dexVolume24hUsd ?? frozen.volume24hUsd
    ),
    marketCapUsd: finite(
      row.marketCapUsd ?? row.marketCap ?? row.circulatingMarketCapUsd ?? frozen.marketCapUsd
    ),
    evidenceCoveragePct: finite(
      row.evidenceCoveragePct ??
      row.ignitionTwin?.evidenceCoveragePct ??
      frozen.evidenceCoveragePct
    ),
    productionScore: finite(row.productionScore ?? frozen.productionScore),
    riskScore: finite(row.riskScore ?? frozen.riskScore),
    sellerExhaustionScore: finite(
      row.sellerExhaustionScore ?? frozen.sellerExhaustionScore
    ),
    buyerReplacementScore: finite(
      row.buyerReplacementScore ?? frozen.buyerReplacementScore
    ),
    sixHourExpectedArrivalToIgnitionRatio: finite(
      row.sixHourExpectedArrivalToIgnitionRatio ??
      frozen.sixHourExpectedArrivalToIgnitionRatio
    ),
    ignitionState:
      row.ignitionState ??
      row.ignitionTwin?.state ??
      frozen.ignitionState ??
      null,
    capitalArrivalState:
      row.capitalArrivalState ?? frozen.capitalArrivalState ?? null,
    globalMarketRegimeState:
      row.globalMarketRegimeState ?? frozen.globalMarketRegimeState ?? null,
    supplyVacuumSupported:
      typeof row.supplyVacuumSupported === "boolean"
        ? row.supplyVacuumSupported
        : typeof frozen.supplyVacuumSupported === "boolean"
          ? frozen.supplyVacuumSupported
          : null,
    pressureWithoutMovement:
      typeof row.pressureWithoutMovement === "boolean"
        ? row.pressureWithoutMovement
        : typeof frozen.pressureWithoutMovement === "boolean"
          ? frozen.pressureWithoutMovement
          : null,
  };
}

export function extractEdgeSignalKeys(row = {}) {
  const f = featureBag(row);
  const keys = [];

  if (f.liquidityUsd !== null) {
    if (f.liquidityUsd >= 250_000) keys.push("LIQUIDITY_GE_250K");
    if (f.liquidityUsd >= 500_000) keys.push("LIQUIDITY_GE_500K");
    if (f.liquidityUsd >= 1_000_000) keys.push("LIQUIDITY_GE_1M");
  }
  if (f.volume24hUsd !== null) {
    if (f.volume24hUsd >= 500_000) keys.push("VOLUME_24H_GE_500K");
    if (f.volume24hUsd >= 1_000_000) keys.push("VOLUME_24H_GE_1M");
    if (f.volume24hUsd >= 5_000_000) keys.push("VOLUME_24H_GE_5M");
  }
  if (f.marketCapUsd !== null && f.marketCapUsd > 0) {
    if (f.marketCapUsd <= 10_000_000) keys.push("MARKET_CAP_LE_10M");
    if (f.marketCapUsd <= 50_000_000) keys.push("MARKET_CAP_LE_50M");
    if (f.marketCapUsd <= 100_000_000) keys.push("MARKET_CAP_LE_100M");
  }
  if (f.evidenceCoveragePct !== null && f.evidenceCoveragePct >= 70) {
    keys.push("EVIDENCE_COVERAGE_GE_70");
  }
  if (f.productionScore !== null && f.productionScore >= 70) {
    keys.push("PRODUCTION_SCORE_GE_70");
  }
  if (f.riskScore !== null && f.riskScore <= 30) {
    keys.push("RISK_SCORE_LE_30");
  }
  if (f.sellerExhaustionScore !== null && f.sellerExhaustionScore >= 60) {
    keys.push("SELLER_EXHAUSTION_GE_60");
  }
  if (f.buyerReplacementScore !== null && f.buyerReplacementScore >= 60) {
    keys.push("BUYER_REPLACEMENT_GE_60");
  }
  if (
    f.sixHourExpectedArrivalToIgnitionRatio !== null &&
    f.sixHourExpectedArrivalToIgnitionRatio >= 1
  ) {
    keys.push("ARRIVAL_TO_IGNITION_6H_GE_1");
  }
  if (f.supplyVacuumSupported === true) keys.push("SUPPLY_VACUUM_SUPPORTED");
  if (f.pressureWithoutMovement === true) keys.push("PRESSURE_WITHOUT_MOVEMENT");

  for (const [prefix, value] of [
    ["IGNITION_STATE", f.ignitionState],
    ["CAPITAL_ARRIVAL_STATE", f.capitalArrivalState],
    ["MARKET_REGIME", f.globalMarketRegimeState],
  ]) {
    const normalized = upper(value);
    if (normalized) keys.push(`${prefix}:${normalized}`);
  }

  return [...new Set(keys)].sort();
}

function isExactOutcome(row = {}) {
  const status = upper(row?.provenance?.verificationStatus);
  return status.startsWith("EXACT_") || row.exactIdentityVerified === true;
}

export function selectExactOutcomeForEpisode(episode, outcomes = [], policy = {}) {
  const horizonHours = Number(
    policy.horizonHours ?? DEFAULT_EDGE_SIGNAL_POLICY.horizonHours
  );
  const rows = outcomes
    .filter((row) =>
      row?.episodeId === episode?.episodeId &&
      Number(row?.horizonHours) === horizonHours &&
      finite(row?.priceUsd) !== null &&
      isExactOutcome(row)
    )
    .sort((a, b) => Date.parse(a.observedAt || 0) - Date.parse(b.observedAt || 0));
  return rows.at(-1) || null;
}

export function classifyEpisodeOutcome(episode, outcome, policy = {}) {
  if (!episode || !outcome) return null;
  const entry = finite(episode.signalPriceUsd);
  const exit = finite(outcome.priceUsd);
  if (entry === null || exit === null || entry <= 0 || exit <= 0) return null;

  const merged = { ...DEFAULT_EDGE_SIGNAL_POLICY, ...policy };
  const executionCostPct =
    Math.max(0, finite(episode.frozenRoundTripExecutionCostBps) ?? 0) / 100;
  const grossReturnPct = ((exit / entry) - 1) * 100;
  const netReturnPct = grossReturnPct - executionCostPct;

  let outcomeClass = "NEUTRAL";
  if (netReturnPct >= merged.targetReturnPct) outcomeClass = "WIN";
  else if (netReturnPct <= merged.lossReturnPct) outcomeClass = "LOSS";

  return {
    episodeId: episode.episodeId,
    role: episode.role,
    horizonHours: Number(merged.horizonHours),
    grossReturnPct,
    executionCostPct,
    netReturnPct,
    outcomeClass,
  };
}

function wilsonLowerBound(wins, trials, z = 1.96) {
  if (!trials) return 0;
  const p = wins / trials;
  const denominator = 1 + (z * z) / trials;
  const center = p + (z * z) / (2 * trials);
  const margin =
    z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials));
  return Math.max(0, (center - margin) / denominator);
}

function promotionState(stat, policy) {
  const decided = stat.wins + stat.losses;
  if (decided < 12) return "EXPERIMENTAL";
  if (decided < 30) return "SHADOW";
  if (decided < policy.minimumVerifiedSamples) return "EVIDENCE_ACCUMULATING";

  const verified =
    stat.posteriorHitRate >= policy.verifiedPosteriorHitRate &&
    stat.wilsonLowerBound >= policy.verifiedWilsonLowerBound &&
    stat.averageNetReturnPct > 0;
  if (!verified) return "EVIDENCE_ACCUMULATING";

  const production =
    decided >= policy.minimumProductionSamples &&
    stat.posteriorHitRate >= policy.productionPosteriorHitRate &&
    stat.wilsonLowerBound >= policy.productionWilsonLowerBound &&
    stat.averageNetReturnPct >= 5;
  return production ? "PRODUCTION_ELIGIBLE" : "VERIFIED";
}

function summarizeRows(rows, policy) {
  const wins = rows.filter((row) => row.outcomeClass === "WIN").length;
  const losses = rows.filter((row) => row.outcomeClass === "LOSS").length;
  const neutral = rows.filter((row) => row.outcomeClass === "NEUTRAL").length;
  const decided = wins + losses;
  const posteriorHitRate =
    (wins + policy.priorWins) /
    Math.max(1, decided + policy.priorWins + policy.priorLosses);
  const averageNetReturnPct = rows.length
    ? rows.reduce((sum, row) => sum + row.netReturnPct, 0) / rows.length
    : 0;
  const stat = {
    samples: rows.length,
    decided,
    wins,
    losses,
    neutral,
    rawHitRate: decided ? wins / decided : 0,
    posteriorHitRate,
    wilsonLowerBound: wilsonLowerBound(wins, decided),
    averageNetReturnPct,
  };
  return {
    ...stat,
    state: promotionState(stat, policy),
    rankingEligible: ["VERIFIED", "PRODUCTION_ELIGIBLE"].includes(
      promotionState(stat, policy)
    ),
  };
}

export function buildEdgeSignalDarwinism(episodes = [], outcomes = [], options = {}) {
  const policy = { ...DEFAULT_EDGE_SIGNAL_POLICY, ...(options.policy || {}) };
  const classified = [];

  for (const episode of Array.isArray(episodes) ? episodes : []) {
    if (episode?.role !== "TREATMENT") continue;
    const outcome = selectExactOutcomeForEpisode(episode, outcomes, policy);
    const result = classifyEpisodeOutcome(episode, outcome, policy);
    if (!result) continue;
    classified.push({
      ...result,
      signalDefinitionVersion: episode.signalDefinitionVersion || null,
      marketRegime:
        episode.frozenFeatures?.globalMarketRegimeState || "UNKNOWN",
      signals: extractEdgeSignalKeys(episode),
    });
  }

  const bySignal = new Map();
  const bySignalAndRegime = new Map();

  for (const row of classified) {
    for (const signal of row.signals) {
      if (!bySignal.has(signal)) bySignal.set(signal, []);
      bySignal.get(signal).push(row);

      const regimeKey = `${signal}@@${upper(row.marketRegime || "UNKNOWN") || "UNKNOWN"}`;
      if (!bySignalAndRegime.has(regimeKey)) bySignalAndRegime.set(regimeKey, []);
      bySignalAndRegime.get(regimeKey).push(row);
    }
  }

  const signals = [...bySignal.entries()]
    .map(([signal, rows]) => ({ signal, ...summarizeRows(rows, policy) }))
    .sort((a, b) =>
      Number(b.rankingEligible) - Number(a.rankingEligible) ||
      b.wilsonLowerBound - a.wilsonLowerBound ||
      b.samples - a.samples ||
      a.signal.localeCompare(b.signal)
    );

  const regimeSignals = [...bySignalAndRegime.entries()]
    .map(([key, rows]) => {
      const [signal, regime] = key.split("@@");
      return { signal, regime, ...summarizeRows(rows, policy) };
    })
    .sort((a, b) =>
      Number(b.rankingEligible) - Number(a.rankingEligible) ||
      b.wilsonLowerBound - a.wilsonLowerBound ||
      b.samples - a.samples
    );

  return {
    schemaVersion: 1,
    generatedAt: new Date(options.now || Date.now()).toISOString(),
    policy,
    matureTreatmentEpisodes: classified.length,
    signals,
    regimeSignals,
    invariants: {
      frozenObservationMutation: false,
      syntheticOutcomeAllowed: false,
      symbolOnlyEvidenceAllowed: false,
      automaticTrading: false,
      automaticProductionPromotion: false,
      rankingRequiresVerifiedEvidence: true,
    },
  };
}

export function writeEdgeSignalDarwinismReport(report, options = {}) {
  const file = path.resolve(
    options.file || "reports/edge-signal-darwinism.json"
  );
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  return file;
}

export const __edgeSignalDarwinismHooks = {
  finite,
  featureBag,
  wilsonLowerBound,
  promotionState,
  summarizeRows,
};
