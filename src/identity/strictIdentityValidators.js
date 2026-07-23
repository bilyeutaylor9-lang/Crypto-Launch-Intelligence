import {
  CHAIN_ALIASES,
  SUPPORTED_CHAIN_REGISTRY,
  normalizeChainAliasKey,
} from "../data/chainAliasRegistry.js";

export { SUPPORTED_CHAIN_REGISTRY };

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
  "top-volume",
  "trending",
]);

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
  return normalizeChainAliasKey(value);
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

export function summarizeUnknownChainValues(projects = []) {
  const unknown = new Map();

  for (const project of Array.isArray(projects) ? projects : []) {
    const raw =
      project.chainId ||
      project.chain ||
      project.network ||
      project.rawCandidate?.chain ||
      "";
    if (!raw || normalizeChainId(raw)) continue;

    const key = clean(raw);
    if (!key) continue;
    const current = unknown.get(key) || {
      rawValue: key,
      count: 0,
      providers: new Set(),
      examples: [],
    };
    current.count += 1;
    current.providers.add(project.source || project.provider || project.discoverySource || "unknown");
    if (current.examples.length < 5) {
      current.examples.push({
        name: project.name || null,
        symbol: project.symbol || null,
        contract: project.contractAddress || project.tokenAddress || project.address || null,
      });
    }
    unknown.set(key, current);
  }

  return [...unknown.values()]
    .map((entry) => ({
      ...entry,
      providers: [...entry.providers],
    }))
    .sort((a, b) => b.count - a.count);
}
