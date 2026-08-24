import crypto from "node:crypto";

export function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function clamp(value, min = 0, max = 1) {
  const n = finite(value);
  return Math.max(min, Math.min(max, n === null ? 0 : n));
}

export function mean(values = []) {
  const active = values.map(finite).filter((v) => v !== null);
  return active.length ? active.reduce((a, b) => a + b, 0) / active.length : null;
}

export function median(values = []) {
  const active = values.map(finite).filter((v) => v !== null).sort((a, b) => a - b);
  if (!active.length) return null;
  const mid = Math.floor(active.length / 2);
  return active.length % 2 ? active[mid] : (active[mid - 1] + active[mid]) / 2;
}

export function percentile(values = [], q = 0.5) {
  const active = values.map(finite).filter((v) => v !== null).sort((a, b) => a - b);
  if (!active.length) return null;
  const p = clamp(q);
  const idx = (active.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? active[lo] : active[lo] + (active[hi] - active[lo]) * (idx - lo);
}

export function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

const EVM_CHAINS = new Set([
  "ethereum", "base", "bsc", "arbitrum", "optimism", "polygon", "avalanche",
  "fantom", "linea", "scroll", "zksync", "mantle", "blast", "ronin", "mode",
  "berachain", "sonic", "robinhood", "robinhood-chain",
]);

export function strictIdentity(row = {}) {
  const chain = String(row.chain || row.canonicalChain || row.network || row.chainId || "")
    .trim()
    .toLowerCase();
  const rawToken = String(
    row.tokenAddress || row.contractAddress || row.canonicalAddress || row.baseToken?.address || ""
  ).trim();
  const rawPool = String(row.poolAddress || row.pairAddress || row.primaryTradablePool || "").trim();
  if (!chain || !rawToken) return null;

  const evm = EVM_CHAINS.has(chain) || /^0x/i.test(rawToken);
  if (evm && !/^0x[0-9a-f]{40}$/i.test(rawToken)) return null;
  if (rawPool && evm && !/^0x[0-9a-f]{40}$/i.test(rawPool)) return null;

  const tokenAddress = evm ? rawToken.toLowerCase() : rawToken;
  const poolAddress = rawPool ? (evm ? rawPool.toLowerCase() : rawPool) : null;
  return {
    chain,
    tokenAddress,
    poolAddress,
    identityKey: `${chain}:${tokenAddress}`,
    routeKey: `${chain}:${tokenAddress}:${poolAddress || "TOKEN_SCOPED"}`,
  };
}

export function strictIdentityKey(row = {}) {
  return strictIdentity(row)?.identityKey || null;
}

export function strictRouteKey(row = {}) {
  return strictIdentity(row)?.routeKey || null;
}

// Research-only grouping helper. Forward evidence and outcome truth must use
// strictIdentityKey/strictIdentity so symbols can never substitute for identity.
export function identityKey(row = {}) {
  const exact = strictIdentityKey(row);
  if (exact) return exact;
  if (row.identityKey && /^(?:[a-z0-9_-]+):(?:0x[0-9a-f]{40}|[A-Za-z0-9_-]{20,})$/i.test(String(row.identityKey))) {
    return String(row.identityKey);
  }
  const chain = String(row.chain || row.canonicalChain || row.network || "unknown").toLowerCase();
  return `${chain}:${String(row.symbol || row.name || "unknown").toLowerCase()}`;
}

export function wilsonLowerBound(wins = 0, total = 0, z = 1.96) {
  const n = Math.max(0, Number(total) || 0);
  const k = Math.max(0, Math.min(n, Number(wins) || 0));
  if (!n) return 0;
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return Math.max(0, (center - margin) / denom);
}

export function stableHash(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

export function seededRandom(seed = 1729) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
