import crypto from "node:crypto";

function lower(value = "") {
  return String(value || "").trim().toLowerCase();
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function address(value = "") {
  const normalized = lower(value);
  return /^0x[0-9a-f]{40}$/.test(normalized) ? normalized : null;
}

function hash(parts = []) {
  return crypto.createHash("sha256").update(parts.map((part) => String(part ?? "")).join("|")).digest("hex").slice(0, 32);
}

function eventTime(event = {}) {
  const value = event.eventTime || event.observedAt || event.timestamp || null;
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function sizeBucket(value) {
  const usd = finite(value);
  if (usd === null || usd <= 0) return "UNKNOWN";
  if (usd < 10_000) return "LT_10K";
  if (usd < 25_000) return "10K_25K";
  if (usd < 100_000) return "25K_100K";
  if (usd < 500_000) return "100K_500K";
  return "500K_PLUS";
}

function sourceCountBucket(value) {
  const count = finite(value);
  if (count === null) return "UNKNOWN";
  if (count <= 1) return "ONE";
  if (count === 2) return "TWO";
  return "THREE_PLUS";
}

function concentrationBucket(sources = []) {
  const rows = Array.isArray(sources) ? sources : [];
  const total = rows.reduce((sum, row) => sum + (finite(row.amountUsd) ?? 0), 0);
  if (!rows.length || total <= 0) return "UNKNOWN";
  const largest = rows.reduce((max, row) => Math.max(max, finite(row.amountUsd) ?? 0), 0);
  const share = largest / total;
  if (rows.length === 1 || share >= 0.85) return "SINGLE_OR_DOMINANT";
  if (share >= 0.65) return "CONCENTRATED";
  return "DISTRIBUTED";
}

function latencyBucket(fundingEvents = [], approvalEvents = []) {
  const fundingTimes = (Array.isArray(fundingEvents) ? fundingEvents : []).map(eventTime).filter(Boolean).map(Date.parse);
  const approvals = (Array.isArray(approvalEvents) ? approvalEvents : []).map(eventTime).filter(Boolean).map(Date.parse);
  if (!fundingTimes.length || !approvals.length) return "UNKNOWN";
  const firstFunding = Math.min(...fundingTimes);
  const firstApproval = Math.min(...approvals.filter((time) => time >= firstFunding));
  if (!Number.isFinite(firstApproval)) return "UNKNOWN";
  const minutes = (firstApproval - firstFunding) / 60_000;
  if (minutes <= 2) return "LE_2M";
  if (minutes <= 10) return "2M_10M";
  if (minutes <= 30) return "10M_30M";
  if (minutes <= 120) return "30M_2H";
  return "GT_2H";
}

function stablecoinMix(wallet = {}) {
  const symbols = new Set();
  for (const event of [...(wallet.fundingEvents || []), ...(wallet.approvalEvents || [])]) {
    const symbol = String(event?.tokenSymbol || "").trim().toUpperCase();
    if (symbol) symbols.add(symbol);
  }
  if (!symbols.size) return "UNKNOWN";
  return [...symbols].sort().slice(0, 4).join("+");
}

function genericRouteKeys(wallet = {}) {
  const keys = [];
  for (const event of Array.isArray(wallet.approvalEvents) ? wallet.approvalEvents : []) {
    const targetKeys = Array.isArray(event?.targetCandidateKeys) ? event.targetCandidateKeys.filter(Boolean) : [];
    const genericKeys = Array.isArray(event?.genericCandidateKeys) ? event.genericCandidateKeys.filter(Boolean) : [];
    // Target-specific approvals are intentionally excluded from model features because they would leak the answer.
    if (targetKeys.length) continue;
    if (!genericKeys.length) continue;
    const spender = address(event.spender);
    if (spender) keys.push(spender);
  }
  return [...new Set(keys)].sort().slice(0, 4);
}

export function capitalPathFeatureVector(wallet = {}, chainObservation = {}, options = {}) {
  const walletAddress = address(wallet.address || wallet.wallet || wallet.owner);
  const chain = lower(chainObservation.chain || wallet.chain || options.chain || "unknown");
  const observedAtRaw = chainObservation.observedAt || wallet.observedAt || options.observedAt || new Date().toISOString();
  const observedAtMs = Date.parse(observedAtRaw);
  const featureObservedAt = Number.isFinite(observedAtMs) ? new Date(observedAtMs).toISOString() : new Date().toISOString();
  const fundingSources = Array.isArray(wallet.fundingSources) ? wallet.fundingSources : [];
  const routes = genericRouteKeys(wallet);
  const executionReadyCapitalUsd = finite(wallet.executionReadyCapitalUsd) ?? 0;
  const sourceCount = fundingSources.length;
  const feature = {
    schemaVersion: 1,
    chain,
    walletAddress,
    featureObservedAt,
    blockNumber: chainObservation.blockNumber ?? wallet.blockNumber ?? null,
    executionReadyCapitalUsd,
    inflowSizeBucket: sizeBucket(executionReadyCapitalUsd || wallet.freshAvailableCapitalUsd || wallet.observedStablecoinInflowUsd),
    fundingSourceCount: sourceCount,
    fundingSourceCountBucket: sourceCountBucket(sourceCount),
    fundingConcentrationBucket: concentrationBucket(fundingSources),
    stablecoinMix: stablecoinMix(wallet),
    approvalCount: Array.isArray(wallet.approvalEvents) ? wallet.approvalEvents.filter((event) => !(event?.targetCandidateKeys || []).length).length : 0,
    genericRouteKeys: routes,
    genericRouteKey: routes[0] || "NO_GENERIC_ROUTE",
    fundingToApprovalLatencyBucket: latencyBucket(wallet.fundingEvents, wallet.approvalEvents),
    nativeGasReady: Boolean(wallet.nativeGasReady),
    newlyDiscovered: Boolean(wallet.newlyDiscovered),
    explicitDestinationAbsent: !wallet.destination?.assignedProjectKey,
    featurePolicy: "Only pre-destination public-chain features are retained. Target-specific approvals, target contract identities, token addresses, candidate scores, prices after the feature timestamp, and future outcomes are excluded from the feature vector.",
  };
  return {
    ...feature,
    snapshotId: hash([
      chain,
      walletAddress || "unknown-wallet",
      chainObservation.blockNumber ?? featureObservedAt,
      executionReadyCapitalUsd,
      routes.join(","),
    ]),
  };
}

export function extractUnassignedCapitalPathFeatures(radar = {}, options = {}) {
  const features = [];
  for (const chainObservation of Array.isArray(radar?.chains) ? radar.chains : []) {
    for (const wallet of Array.isArray(chainObservation?.wallets) ? chainObservation.wallets : []) {
      if (!wallet?.executionPrepared || !(finite(wallet.executionReadyCapitalUsd) > 0)) continue;
      if (wallet.destination?.assignedProjectKey) continue;
      const feature = capitalPathFeatureVector(wallet, chainObservation, options);
      if (!feature.walletAddress) continue;
      features.push(feature);
    }
  }
  return features;
}

export function capitalPathSignatureLevels(feature = {}) {
  const route = feature.genericRouteKey || "NO_GENERIC_ROUTE";
  const chain = feature.chain || "unknown";
  const size = feature.inflowSizeBucket || "UNKNOWN";
  const sources = feature.fundingSourceCountBucket || "UNKNOWN";
  const concentration = feature.fundingConcentrationBucket || "UNKNOWN";
  const latency = feature.fundingToApprovalLatencyBucket || "UNKNOWN";
  const stable = feature.stablecoinMix || "UNKNOWN";
  return [
    { level: "L0_EXACT_PATH", key: [chain, route, size, sources, concentration, latency, stable].join("|") },
    { level: "L1_ROUTE_SIZE_SOURCE", key: [chain, route, size, sources, concentration].join("|") },
    { level: "L2_ROUTE_SIZE", key: [chain, route, size].join("|") },
    { level: "L3_ROUTE", key: [chain, route].join("|") },
    { level: "L4_CHAIN", key: chain },
  ];
}

export const __capitalPathFeatureTestHooks = {
  sizeBucket,
  sourceCountBucket,
  concentrationBucket,
  latencyBucket,
  stablecoinMix,
  genericRouteKeys,
};
