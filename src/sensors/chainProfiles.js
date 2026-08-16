const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bdA02913";

const PROFILES = {
  base: {
    chainId: 8453,
    aliases: new Set(["base", "8453", "base-mainnet"]),
    rpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org",
    blockTimeSeconds: 2,
    safeBlockTag: "safe",
    quoteUsd: {
      [BASE_USDC.toLowerCase()]: { priceUsd: 1, symbol: "USDC", confidencePct: 100, source: "CANONICAL_BASE_USDC" },
    },
  },
};

export function chainProfileFor(value = "") {
  const normalized = String(value || "").toLowerCase();
  return Object.values(PROFILES).find((profile) => profile.aliases.has(normalized)) || null;
}

export function quoteUsdFor(profile = {}, address = "", options = {}) {
  const key = String(address || "").toLowerCase();
  const explicit = Number(options.quoteTokenUsdPrice);
  if (Number.isFinite(explicit) && explicit > 0) {
    return { priceUsd: explicit, symbol: options.quoteTokenSymbol || null, confidencePct: Number(options.quoteTokenUsdConfidencePct || 80), source: "EXPLICIT_QUOTE_PRICE" };
  }
  return profile?.quoteUsd?.[key] || null;
}

export { BASE_USDC, PROFILES };
