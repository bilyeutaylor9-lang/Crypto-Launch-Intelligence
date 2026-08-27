import crypto from "node:crypto";

import {
  normalizeChainId,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";

const DEFAULT_BASE_URL = "https://api.llama.fi";

// DeFiLlama coin identifiers are namespace:address values. Keep this mapping
// explicit so a provider namespace can never be inferred from a ticker symbol.
const DEFILLAMA_CHAIN_NAMESPACES = Object.freeze({
  ethereum: "ethereum",
  base: "base",
  bsc: "bsc",
  arbitrum: "arbitrum",
  polygon: "polygon",
  optimism: "optimism",
  avalanche: "avalanche",
  solana: "solana",
  fantom: "fantom",
  linea: "linea",
  scroll: "scroll",
  zksync: "zksync",
  mantle: "mantle",
  blast: "blast",
  ronin: "ronin",
  mode: "mode",
  berachain: "berachain",
  sonic: "sonic",
});

function text(value = "") {
  return String(value ?? "").trim();
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function currentDate(options = {}) {
  const value = typeof options.now === "function" ? options.now() : options.now;
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function providerTimestamp(value) {
  const number = finite(value);
  if (number === null) return null;
  const milliseconds = number > 10_000_000_000 ? number : number * 1_000;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function resolveDefiLlamaCoinIdentity(chainValue, tokenValue) {
  const chain = normalizeChainId(chainValue);
  const namespace = DEFILLAMA_CHAIN_NAMESPACES[chain];
  const tokenAddress = normalizeTokenAddress(tokenValue, chain);
  if (!chain || !namespace || !tokenAddress) return null;
  return {
    chain,
    namespace,
    tokenAddress,
    identityKey: `${chain}:${tokenAddress}`,
    providerCoinKey: `${namespace}:${tokenAddress}`,
  };
}

function exactProviderRecord(payload = {}, identity = {}) {
  const rows = payload && typeof payload.coins === "object" ? payload.coins : {};
  const expected = text(identity.providerCoinKey);
  const expectedComparable = identity.chain === "solana" ? expected : expected.toLowerCase();
  const entry = Object.entries(rows).find(([key]) => {
    const comparable = identity.chain === "solana" ? text(key) : text(key).toLowerCase();
    return comparable === expectedComparable;
  });
  if (!entry) return null;
  const [providerCoinKey, record] = entry;
  const priceUsd = finite(record?.price);
  if (priceUsd === null || priceUsd <= 0) return null;
  return { providerCoinKey, record, priceUsd };
}

export function normalizeDefiLlamaExactPrice(payload = {}, identity = {}, context = {}) {
  const exact = exactProviderRecord(payload, identity);
  if (!exact) {
    return {
      status: "UNKNOWN",
      reason: "NO_EXACT_CHAIN_CONTRACT_PRICE",
      chain: identity.chain || null,
      tokenAddress: identity.tokenAddress || null,
      identityKey: identity.identityKey || null,
      priceUsd: null,
      observedAt: context.observedAt || null,
      sourceTimestamp: null,
      sourceUrl: context.sourceUrl || null,
      rawEvidenceHash: sha256(payload),
    };
  }

  const sourceTimestamp = providerTimestamp(exact.record.timestamp);
  return {
    status: "EXACT_PRICE_OBSERVED",
    provider: "DeFiLlama Exact Price",
    chain: identity.chain,
    tokenAddress: identity.tokenAddress,
    identityKey: identity.identityKey,
    providerCoinKey: exact.providerCoinKey,
    priceUsd: exact.priceUsd,
    confidence: finite(exact.record.confidence),
    observedAt: context.observedAt || new Date().toISOString(),
    sourceTimestamp,
    sourceUrl: context.sourceUrl || null,
    rawEvidenceHash: sha256(payload),
    rawEvidence: {
      providerCoinKey: exact.providerCoinKey,
      record: exact.record,
    },
    marketEvidenceOnly: true,
    executionEvidence: false,
  };
}

export async function getDefiLlamaExactPrice(project = {}, options = {}) {
  const identity = resolveDefiLlamaCoinIdentity(
    project.chain || project.canonicalChain || project.network || project.chainId,
    project.tokenAddress || project.contractAddress || project.canonicalAddress || project.address,
  );
  if (!identity) {
    return {
      status: "NOT_APPLICABLE",
      reason: "EXACT_SUPPORTED_CHAIN_CONTRACT_REQUIRED",
      priceUsd: null,
    };
  }

  const baseUrl = text(options.baseUrl || process.env.DEFILLAMA_FREE_API_BASE_URL || DEFAULT_BASE_URL)
    .replace(/\/$/, "");
  const sourceUrl = `${baseUrl}/prices/current/${encodeURIComponent(identity.providerCoinKey)}`;
  const controller = options.signal ? null : new AbortController();
  const timeout = controller
    ? setTimeout(() => controller.abort(), Math.max(500, Number(options.timeoutMs || 8_000)))
    : null;
  try {
    const fetchImpl = options.fetchImpl || fetch;
    const response = await fetchImpl(sourceUrl, {
      headers: { accept: "application/json" },
      signal: options.signal || controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`DeFiLlama exact price request failed: HTTP ${response.status}`);
      error.code = response.status === 429 ? "RATE_LIMITED" : `HTTP_${response.status}`;
      throw error;
    }
    const payload = await response.json();
    return normalizeDefiLlamaExactPrice(payload, identity, {
      observedAt: currentDate(options).toISOString(),
      sourceUrl,
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export const __defiLlamaExactPriceHooks = {
  exactProviderRecord,
  providerTimestamp,
  sha256,
  currentDate,
};
