export const SUPPORTED_CHAIN_REGISTRY = Object.freeze({
  ethereum: { chainId: 1, kind: "evm", name: "Ethereum" },
  base: { chainId: 8453, kind: "evm", name: "Base" },
  bsc: { chainId: 56, kind: "evm", name: "BNB Smart Chain" },
  arbitrum: { chainId: 42161, kind: "evm", name: "Arbitrum" },
  polygon: { chainId: 137, kind: "evm", name: "Polygon" },
  optimism: { chainId: 10, kind: "evm", name: "Optimism" },
  avalanche: { chainId: 43114, kind: "evm", name: "Avalanche" },
  solana: { chainId: 101, kind: "solana", name: "Solana" },
  sui: { chainId: "sui", kind: "sui", name: "Sui" },
  ton: { chainId: "ton", kind: "ton", name: "TON" },
  cosmos: { chainId: "cosmos", kind: "cosmos", name: "Cosmos" },
  aptos: { chainId: "aptos", kind: "aptos", name: "Aptos" },
  sei: { chainId: "sei", kind: "cosmos", name: "Sei" },
  osmosis: { chainId: "osmosis-1", kind: "cosmos", name: "Osmosis" },
  tron: { chainId: "tron", kind: "tron", name: "Tron" },
  near: { chainId: "near", kind: "near", name: "Near" },
  fantom: { chainId: 250, kind: "evm", name: "Fantom" },
  linea: { chainId: 59144, kind: "evm", name: "Linea" },
  scroll: { chainId: 534352, kind: "evm", name: "Scroll" },
  zksync: { chainId: 324, kind: "evm", name: "zkSync Era" },
  mantle: { chainId: 5000, kind: "evm", name: "Mantle" },
  blast: { chainId: 81457, kind: "evm", name: "Blast" },
  ronin: { chainId: 2020, kind: "evm", name: "Ronin" },
  mode: { chainId: 34443, kind: "evm", name: "Mode" },
  berachain: { chainId: 80094, kind: "evm", name: "Berachain" },
  sonic: { chainId: 146, kind: "evm", name: "Sonic" },
  hyperliquid: { chainId: "hyperliquid", kind: "hyperliquid", name: "Hyperliquid" },
  "robinhood-chain": { chainId: "robinhood-chain", kind: "evm", name: "Robinhood Chain" },
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
  "eip155-1": "ethereum",
  eth: "ethereum",
  ethereum: "ethereum",
  "ethereum-mainnet": "ethereum",
  mainnet: "ethereum",
  "8453": "base",
  "0x2105": "base",
  "eip155-8453": "base",
  base: "base",
  "base-mainnet": "base",
  "coinbase-l2": "base",
  "coinbase-layer-2": "base",
  "56": "bsc",
  "0x38": "bsc",
  "eip155-56": "bsc",
  bnb: "bsc",
  "bnb-chain": "bsc",
  "bnb-smart-chain": "bsc",
  "binance-smart-chain": "bsc",
  "smart-chain": "bsc",
  bep20: "bsc",
  bsc: "bsc",
  "42161": "arbitrum",
  "0xa4b1": "arbitrum",
  "eip155-42161": "arbitrum",
  arb: "arbitrum",
  "arbitrum-one": "arbitrum",
  arbitrum: "arbitrum",
  "137": "polygon",
  "0x89": "polygon",
  "eip155-137": "polygon",
  matic: "polygon",
  "polygon-pos": "polygon",
  polygon: "polygon",
  "10": "optimism",
  "0xa": "optimism",
  "eip155-10": "optimism",
  op: "optimism",
  "op-mainnet": "optimism",
  optimism: "optimism",
  "43114": "avalanche",
  "0xa86a": "avalanche",
  "eip155-43114": "avalanche",
  avax: "avalanche",
  "avax-c": "avalanche",
  avalanche: "avalanche",
  "avalanche-c": "avalanche",
  "avalanche-c-chain": "avalanche",
  "101": "solana",
  sol: "solana",
  solana: "solana",
  "solana-mainnet": "solana",
  "solana-mainnet-beta": "solana",
  "mainnet-beta": "solana",
  sui: "sui",
  "sui-mainnet": "sui",
  "sui-network": "sui",
  ton: "ton",
  "ton-mainnet": "ton",
  "the-open-network": "ton",
  aptos: "aptos",
  "aptos-mainnet": "aptos",
  sei: "sei",
  "sei-mainnet": "sei",
  "sei-network": "sei",
  cosmos: "cosmos",
  cosmoshub: "cosmos",
  "cosmos-hub": "cosmos",
  "cosmoshub-4": "cosmos",
  osmosis: "cosmos",
  osmo: "cosmos",
  "osmosis-1": "cosmos",
  tron: "tron",
  trx: "tron",
  "tron-mainnet": "tron",
  trc20: "tron",
  near: "near",
  "near-protocol": "near",
  "near-mainnet": "near",
  ftm: "fantom",
  fantom: "fantom",
  opera: "fantom",
  "fantom-opera": "fantom",
  linea: "linea",
  "linea-mainnet": "linea",
  scroll: "scroll",
  "scroll-mainnet": "scroll",
  zksync: "zksync",
  "zksync-era": "zksync",
  mantle: "mantle",
  "mantle-mainnet": "mantle",
  blast: "blast",
  "blast-mainnet": "blast",
  ronin: "ronin",
  "ronin-mainnet": "ronin",
  mode: "mode",
  "mode-network": "mode",
  berachain: "berachain",
  bera: "berachain",
  "berachain-mainnet": "berachain",
  sonic: "sonic",
  "sonic-mainnet": "sonic",
  "fantom-sonic": "sonic",
  hyperliquid: "hyperliquid",
  "hyperliquid-l1": "hyperliquid",
  "robinhood-chain": "robinhood-chain",
  "robinhood-l2": "robinhood-chain",
});

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const SUI_RE = /^0x[a-fA-F0-9]{64}$/;
const TON_RE = /^(?:-?\d+:[a-fA-F0-9]{64}|[EU]Q[A-Za-z0-9_-]{46})$/;
const COSMOS_RE = /^(?:cosmos|osmo|sei|inj|akash|celestia|tia)1[02-9ac-hj-np-z]{20,80}$/i;
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

export function isValidSuiAddress(value = "") {
  return SUI_RE.test(clean(value));
}

export function isValidTonAddress(value = "") {
  return TON_RE.test(clean(value));
}

export function isValidCosmosAddress(value = "") {
  return COSMOS_RE.test(clean(value));
}

function looksLikeNonAddress(value = "") {
  const raw = clean(value);
  const lowered = raw.toLowerCase();
  if (!raw) return false;
  if (
    isValidEvmAddress(raw) ||
    isValidSolanaAddress(raw) ||
    isValidSuiAddress(raw) ||
    isValidTonAddress(raw) ||
    isValidCosmosAddress(raw)
  ) {
    return false;
  }
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
    if (kind && kind !== "evm") {
      return {
        state: "MALFORMED_ADDRESS",
        normalized: null,
        raw,
        reason: `EVM address supplied for a ${kind} chain.`,
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
    if (kind && kind !== "solana") {
      return {
        state: "MALFORMED_ADDRESS",
        normalized: null,
        raw,
        reason: `Solana address supplied for a ${kind} chain.`,
      };
    }
    return {
      state: "SYNTACTICALLY_VALID_UNVERIFIED",
      normalized: raw,
      raw,
      reason: "Address has valid Solana syntax but has not been verified on-chain in this step.",
    };
  }

  if (isValidSuiAddress(raw)) {
    if (kind && kind !== "sui") {
      return {
        state: "MALFORMED_ADDRESS",
        normalized: null,
        raw,
        reason: `Sui address supplied for a ${kind} chain.`,
      };
    }
    return {
      state: "SYNTACTICALLY_VALID_UNVERIFIED",
      normalized: raw.toLowerCase(),
      raw,
      reason: "Address has valid Sui syntax but has not been verified on-chain in this step.",
    };
  }

  if (isValidTonAddress(raw)) {
    if (kind && kind !== "ton") {
      return {
        state: "MALFORMED_ADDRESS",
        normalized: null,
        raw,
        reason: `TON address supplied for a ${kind} chain.`,
      };
    }
    return {
      state: "SYNTACTICALLY_VALID_UNVERIFIED",
      normalized: raw,
      raw,
      reason: "Address has valid TON syntax but has not been verified on-chain in this step.",
    };
  }

  if (isValidCosmosAddress(raw)) {
    if (kind && kind !== "cosmos") {
      return {
        state: "MALFORMED_ADDRESS",
        normalized: null,
        raw,
        reason: `Cosmos-family address supplied for a ${kind} chain.`,
      };
    }
    return {
      state: "SYNTACTICALLY_VALID_UNVERIFIED",
      normalized: raw,
      raw,
      reason: "Address has valid Cosmos-family syntax but has not been verified on-chain in this step.",
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
