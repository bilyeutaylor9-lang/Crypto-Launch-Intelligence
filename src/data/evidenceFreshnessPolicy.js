const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const EVIDENCE_FRESHNESS_POLICY = Object.freeze({
  identity: 30 * DAY,
  safety: 6 * HOUR,
  execution: 10 * MINUTE,
  market: 30 * MINUTE,
  liquidity: 30 * MINUTE,
  buyers: 30 * MINUTE,
  wallets: 2 * HOUR,
  development: 7 * DAY,
  catalysts: 24 * HOUR,
  social: 2 * HOUR,
  historical: Number.POSITIVE_INFINITY,
});

export const FIELD_FRESHNESS_FAMILY = Object.freeze({
  tokenAddress: "identity",
  poolAddress: "identity",
  chain: "identity",
  honeypotDetected: "safety",
  sellRestricted: "safety",
  contractVerified: "safety",
  liquidityUsd: "liquidity",
  stableExitLiquidityUsd: "liquidity",
  volume24hUsd: "market",
  priceUsd: "market",
  uniqueBuyers24h: "buyers",
  buyTransactions24h: "buyers",
  sellTransactions24h: "buyers",
  smartWalletScore: "wallets",
  smartWalletArrivalScore: "wallets",
  githubRepo: "development",
  developerActivityScore: "development",
  roadmap: "catalysts",
  catalystScore: "catalysts",
  purchaseRouteConfirmed: "execution",
  sellRouteAvailable: "execution",
});

export function freshnessFamilyForField(field = "") {
  return FIELD_FRESHNESS_FAMILY[field] || "market";
}

export function evaluateEvidenceFreshness(timestamp = null, field = "", now = new Date()) {
  if (!timestamp) {
    return {
      status: "MISSING_TIMESTAMP",
      ageMs: null,
      maxAgeMs: EVIDENCE_FRESHNESS_POLICY[freshnessFamilyForField(field)],
      stale: true,
    };
  }

  const observed = Date.parse(timestamp);
  if (!Number.isFinite(observed)) {
    return {
      status: "INVALID_TIMESTAMP",
      ageMs: null,
      maxAgeMs: EVIDENCE_FRESHNESS_POLICY[freshnessFamilyForField(field)],
      stale: true,
    };
  }

  const ageMs = Math.max(0, now.getTime() - observed);
  const maxAgeMs = EVIDENCE_FRESHNESS_POLICY[freshnessFamilyForField(field)];

  return {
    status: ageMs > maxAgeMs ? "STALE_DATA" : "CURRENT",
    ageMs,
    maxAgeMs,
    stale: ageMs > maxAgeMs,
  };
}
