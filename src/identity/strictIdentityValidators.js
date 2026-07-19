export const SUPPORTED_CHAIN_REGISTRY = Object.freeze({
  ethereum: { chainId: 1, kind: "evm", name: "Ethereum" },
  base: { chainId: 8453, kind: "evm", name: "Base" },
  bsc: { chainId: 56, kind: "evm", name: "BNB Smart Chain" },
  arbitrum: { chainId: 42161, kind: "evm", name: "Arbitrum" },
  polygon: { chainId: 137, kind: "evm", name: "Polygon" },
  optimism: { chainId: 10, kind: "evm", name: "Optimism" },
  avalanche: { chainId: 43114, kind: "evm", name: "Avalanche" },
  solana: { chainId: 101, kind: "solana", name: "Solana" },
});

export const REJECTED_CHAIN_VALUES = new Set([
  "artificial-intelligence",
  "binance",
  "bitget",
  "coinbase",
  "coingecko",
  "coingecko-trending",
  "coinpaprika",
  "defillama",
  "defillama-chain",
  "depin",
  "dexscreener",
  "gaming",
  "github",
  "github-project-discovery",
  "google-news",
  "google-news-discovery",
  "market",
  "real-world-assets-rwa",
  "research",
  "research-seed",
  "robinhood",
  "top-volume",
  "trending",
]);

const CHAIN_ALIASES = Object.freeze({
  "1": "ethereum",
  "0x1": "ethereum",
  eth: "ethereum",
  ethereum: "ethereum",
  "ethereum-mainnet": "ethereum",
  mainnet: "ethereum",
  "8453": "base",
  "0x2105": "base",
  base: "base",
  "56": "bsc",
  "0x38": "bsc",
  bnb: "bsc",
  "bnb-chain": "bsc",
  "binance-smart-chain": "bsc",
  bsc: "bsc",
  "42161": "arbitrum",
  "0xa4b1": "arbitrum",
  arb: "arbitrum",
  "arbitrum-one": "arbitrum",
  arbitrum: "arbitrum",
  "137": "polygon",
  "0x89": "polygon",
  matic: "polygon",
  polygon: "polygon",
  "10": "optimism",
  "0xa": "optimism",
  op: "optimism",
  optimism: "optimism",
  "43114": "avalanche",
  "0xa86a": "avalanche",
  avax: "avalanche",
  avalanche: "avalanche",
  "avalanche-c-chain": "avalanche",
  "101": "solana",
  sol: "solana",
  solana: "solana",
});

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const PLACEHOLDER_RE = /^(research-seed-|rescue-|unknown$|pending$|n\/a$|na$|none$|null$|undefined$|symbol-only$|unresolved:)/i;
const OBVIOUS_NON_ADDRESS_TERMS = [
  "airdrop",
  "artificial-intelligence",
  "binance",
  "bitget",
  "coinbase",
  "coingecko",
  "coinpaprika",
  "defillama",
  "depin",
  "gaming",
  "github",
  "google-news",
  "market",
  "research",
  "rwa",
  "top-volume",
  "trending",
];

function clean(value = "") {
  return String(value ?? "").trim();
}

function chainKey(value = "") {
  return clean(value)
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/^-+|-+$/g, "");
}

export function normalizeChainId(value = "") {
  const key = chainKey(value);
  if (!key || REJECTED_CHAIN_VALUES.has(key)) return null;
  const normalized = CHAIN_ALIASES[key] || key;
  return SUPPORTED_CHAIN_REGISTRY[normalized] ? normalized : null;
}

export function chainRejectionReason(value = "") {
  const raw = clean(value);
  if (!raw) return null;
  const key = chainKey(raw);
  if (REJECTED_CHAIN_VALUES.has(key)) return `Rejected non-chain value in chain field: ${raw}`;
  if (!normalizeChainId(raw)) return `Unsupported chain value: ${raw}`;
  return null;
}

export function isSupportedChain(value = "") {
  return Boolean(normalizeChainId(value));
}

export function chainKind(value = "") {
  const chain = normalizeChainId(value);
  return chain ? SUPPORTED_CHAIN_REGISTRY[chain].kind : null;
}

export function isValidEvmAddress(value = "") {
  return EVM_RE.test(clean(value));
}

export function isValidSolanaAddress(value = "") {
  const raw = clean(value);
  return raw.length >= 32 && raw.length <= 44 && BASE58_RE.test(raw);
}

function looksLikeNonAddress(value = "") {
  const raw = clean(value);
  const lowered = raw.toLowerCase();
  if (!raw) return false;
  if (PLACEHOLDER_RE.test(raw)) return true;
  if (/^https?:\/\//i.test(raw) || raw.includes("/") || raw.includes("?") || raw.includes("#")) return true;
  if (raw.includes(".") && !EVM_RE.test(raw)) return true;
  if (raw.includes(":") && !EVM_RE.test(raw)) return true;
  return OBVIOUS_NON_ADDRESS_TERMS.some((term) => lowered.includes(term));
}

export function classifyAddressState(value = "", chain = null) {
  const raw = clean(value);
  const normalizedChain = normalizeChainId(chain);
  const kind = normalizedChain ? chainKind(normalizedChain) : null;

  if (!raw) {
    return {
      state: "MISSING_ADDRESS",
      normalized: null,
      raw: raw || null,
      reason: "Address is missing.",
    };
  }

  if (PLACEHOLDER_RE.test(raw) || looksLikeNonAddress(raw)) {
    return {
      state: "SYNTHETIC_PLACEHOLDER",
      normalized: null,
      raw,
      reason: `Address-like field contains a placeholder or non-address value: ${raw}.`,
    };
  }

  if (isValidEvmAddress(raw)) {
    if (kind === "solana") {
      return {
        state: "MALFORMED_ADDRESS",
        normalized: null,
        raw,
        reason: "EVM address supplied for a Solana chain.",
      };
    }
    return {
      state: "SYNTACTICALLY_VALID_UNVERIFIED",
      normalized: raw.toLowerCase(),
      raw,
      reason: "Address has valid EVM syntax but has not been verified on-chain in this step.",
    };
  }

  if (isValidSolanaAddress(raw)) {
    if (kind === "evm") {
      return {
        state: "MALFORMED_ADDRESS",
        normalized: null,
        raw,
        reason: "Solana address supplied for an EVM chain.",
      };
    }
    return {
      state: "SYNTACTICALLY_VALID_UNVERIFIED",
      normalized: raw,
      raw,
      reason: "Address has valid Solana syntax but has not been verified on-chain in this step.",
    };
  }

  return {
    state: "MALFORMED_ADDRESS",
    normalized: null,
    raw,
    reason: `Address failed supported chain syntax validation: ${raw}.`,
  };
}

export function normalizeAddress(value = "", chain = null) {
  return classifyAddressState(value, chain).normalized;
}

export function normalizeTokenAddress(value = "", chain = null) {
  return normalizeAddress(value, chain);
}

export function normalizePoolAddress(value = "", chain = null) {
  return normalizeAddress(value, chain);
}

export function normalizeWalletAddress(value = "", chain = null) {
  return normalizeAddress(value, chain);
}

export function addressRejectionReason(value = "", role = "address", chain = null) {
  const raw = clean(value);
  if (!raw) return null;
  if (normalizeAddress(raw, chain)) return null;
  if (looksLikeNonAddress(raw)) return `Rejected ${role}: non-address value "${raw}".`;
  const normalizedChain = normalizeChainId(chain);
  if (normalizedChain) return `Rejected ${role}: invalid ${normalizedChain} address "${raw}".`;
  return `Rejected ${role}: invalid or unsupported address "${raw}".`;
}
