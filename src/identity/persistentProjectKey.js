import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "./strictIdentityValidators.js";

function text(value = "") {
  return String(value ?? "").trim();
}

function lower(value = "") {
  return text(value).toLowerCase();
}

function first(values = []) {
  return values.map(text).find(Boolean) || "";
}

function normalizeAddressKey(chain = "", address = "") {
  const normalizedChain = normalizeChainId(chain) || lower(chain);
  if (!normalizedChain || normalizedChain === "unknown") return "";

  const tokenAddress = normalizeTokenAddress(address, normalizedChain);
  if (tokenAddress) return `${normalizedChain}:${tokenAddress}`;

  const poolAddress = normalizePoolAddress(address, normalizedChain);
  if (poolAddress) return `${normalizedChain}:${poolAddress}`;

  return "";
}

export function normalizePersistentProjectKey(value = "") {
  const raw = text(value);
  if (!raw) return "";

  const roleAddressMatch = raw.match(/^([^:]+):(token|pool):(.+)$/i);
  if (roleAddressMatch) {
    return normalizeAddressKey(roleAddressMatch[1], roleAddressMatch[3]) || raw;
  }

  const chainAddressMatch = raw.match(/^([^:]+):([^:]+)$/);
  if (chainAddressMatch) {
    return normalizeAddressKey(chainAddressMatch[1], chainAddressMatch[2]) || lower(raw);
  }

  if (/^(exchange|asset|market|repo|social|domain|temporary):/i.test(raw)) {
    return lower(raw);
  }

  return raw;
}

export function buildPersistentProjectKey(project = {}) {
  const chain = normalizeChainId(
    project.chainId ||
      project.chain ||
      project.network ||
      project.baseToken?.chain ||
      project.marketData?.chain ||
      ""
  ) || lower(project.chain || project.network || "unknown");
  const exactAddress = first([
    project.contractAddress,
    project.tokenAddress,
    project.address,
    project.baseToken?.address,
    project.rawCandidate?.contractAddress,
    project.rawCandidate?.tokenAddress,
    project.rawCandidate?.address,
  ]);
  const exactAddressKey = normalizeAddressKey(chain, exactAddress);
  if (exactAddressKey) return exactAddressKey;

  const poolAddress = first([
    project.poolAddress,
    project.pairAddress,
    project.pair?.address,
    project.rawCandidate?.poolAddress,
    project.rawCandidate?.pairAddress,
  ]);
  const poolAddressKey = normalizeAddressKey(chain, poolAddress);
  if (poolAddressKey) return poolAddressKey;

  const explicit = first([
    project.permanentProjectKey,
    project.projectKey,
    project.identityKey,
  ]);
  if (explicit) return normalizePersistentProjectKey(explicit);

  const symbol = text(project.symbol || project.ticker || project.baseToken?.symbol).toUpperCase();
  const name = lower(project.name || project.canonicalName || "unknown");
  return `temporary:symbol:${chain || "unknown"}:${symbol || name || "unknown"}`;
}
