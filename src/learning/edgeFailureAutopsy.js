import fs from "node:fs";
import path from "node:path";

const REPORT_FILE = path.resolve("reports", "edge-failure-autopsy.json");

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mechanismEvidence(record = {}) {
  const features = record.episode?.frozenFeatures || {};
  const ratio = finite(features.sixHourExpectedArrivalToIgnitionRatio);
  const seller = finite(features.sellerExhaustionScore);
  const buyer = finite(features.buyerReplacementScore);
  const inventoryBurn = finite(features.marginalSellerInventoryBurnPct);
  const executionCost = finite(record.episode?.frozenRoundTripExecutionCostBps);
  const vacuumThreatened = features.supplyVacuumSupported === false ||
    /THREATENED|REPLENISH/i.test(String(features.vacuumIntegrityState || ""));
  const sellerRiskObserved = (seller !== null && seller < 50) ||
    (inventoryBurn !== null && inventoryBurn < 5);
  return {
    capitalArrival: ratio === null ? "UNKNOWN" : ratio < 1 ? "WEAK" : "SUPPORTED",
    sellerReplenishment: vacuumThreatened
      ? "RISK_OBSERVED"
      : seller === null && inventoryBurn === null
        ? "UNKNOWN"
        : sellerRiskObserved
          ? "RISK_OBSERVED"
          : "SUPPORTED",
    buyerReplacement: buyer === null ? "UNKNOWN" : buyer < 50 ? "WEAK" : "SUPPORTED",
    executionFriction: executionCost === null ? "UNKNOWN" : executionCost > 500 ? "HIGH" : "SUPPORTED",
    marketRegime: !features.globalMarketRegimeState
      ? "UNKNOWN"
      : /RISK_OFF|STRESS|CONTRACTION/i.test(features.globalMarketRegimeState)
        ? "ADVERSE"
        : "OBSERVED_NON_ADVERSE",
  };
}

function primaryFailure(mechanisms = {}) {
  if (mechanisms.executionFriction === "HIGH") return "EXECUTION_FRICTION";
  if (mechanisms.capitalArrival === "WEAK") return "CAPITAL_ARRIVAL";
  if (mechanisms.sellerReplenishment === "RISK_OBSERVED") return "SELLER_REPLENISHMENT";
  if (mechanisms.buyerReplacement === "WEAK") return "BUYER_REPLACEMENT";
  if (mechanisms.marketRegime === "ADVERSE") return "MARKET_REGIME";
  return "UNKNOWN_OR_UNOBSERVED";
}

export function buildEdgeFailureAutopsy(outcomeLab = {}, options = {}) {
  const records = (outcomeLab.records || [])
    .filter((record) => record.episode?.role === "TREATMENT")
    .map((record) => {
      const terminalLabel = record.terminal168?.plus25BeforeMinus15;
      const net168 = finite(record.outcomes?.["168h"]?.netReturnPct);
      const failed = terminalLabel === false || (net168 !== null && net168 <= 0);
      if (!failed) return null;
      const mechanisms = mechanismEvidence(record);
      return {
        episodeId: record.episode.episodeId,
        identityKey: record.episode.identityKey,
        signalObservedAt: record.episode.signalObservedAt,
        terminalState: record.terminal168?.state || "UNKNOWN",
        net168hReturnPct: net168,
        mechanisms,
        primaryFailure: primaryFailure(mechanisms),
        evidencePolicy: "FROZEN_PRE_OUTCOME_FEATURES_ONLY",
      };
    })
    .filter(Boolean);
  const counts = {};
  for (const row of records) counts[row.primaryFailure] = (counts[row.primaryFailure] || 0) + 1;
  const ordered = Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return {
    schemaVersion: 1,
    generatedAt: new Date(options.now || Date.now()).toISOString(),
    state: records.length ? "EDGE_FAILURES_AUTOPSIED" : "NO_RESOLVED_EDGE_FAILURES",
    failures: records.length,
    primaryFailureCounts: Object.fromEntries(ordered),
    leadingObservedFailureMechanism: ordered.find(([name]) => name !== "UNKNOWN_OR_UNOBSERVED")?.[0] || null,
    records: records.slice(-5000),
    policy: "Unknown mechanism evidence remains unknown. Autopsy labels use only features frozen before outcomes and cannot change ranking or manufacture a bullish score.",
    rankingInfluence: false,
    scoringInfluence: false,
  };
}

export function runEdgeFailureAutopsy(outcomeLab = {}, options = {}) {
  const report = buildEdgeFailureAutopsy(outcomeLab, options);
  if (options.writeReport !== false) {
    const file = options.reportFile || REPORT_FILE;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

export const EDGE_FAILURE_AUTOPSY_REPORT = REPORT_FILE;
export const __edgeFailureAutopsyHooks = { finite, mechanismEvidence, primaryFailure };
