import {
  REJECTED_CHAIN_VALUES,
  SUPPORTED_CHAIN_REGISTRY,
  chainKind,
  normalizeChainId,
} from "../identity/strictIdentityValidators.js";

export const SUPPORTED_CHAINS = Object.freeze(SUPPORTED_CHAIN_REGISTRY);
export const REJECTED_CHAIN_TERMS = Object.freeze([...REJECTED_CHAIN_VALUES]);

export function normalizeChainVocabulary(value = "") {
  const normalized = normalizeChainId(value);
  return {
    raw: value ?? null,
    canonical: normalized,
    supported: Boolean(normalized),
    kind: normalized ? chainKind(normalized) : null,
    status: normalized ? "SUPPORTED" : value ? "UNSUPPORTED_OR_REJECTED" : "MISSING",
  };
}

export function isEvmChain(value = "") {
  return normalizeChainVocabulary(value).kind === "evm";
}

export function chainFamily(value = "") {
  return normalizeChainVocabulary(value).kind || "unknown";
}
