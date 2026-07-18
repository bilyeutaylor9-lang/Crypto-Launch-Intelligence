import {
  chainKey,
  evmChainId,
  fetchJson,
  getCachedSecurityEvidence,
  isEvmAddress,
  lower,
  setCachedSecurityEvidence,
  tokenAddress,
  unknownSecurityEvidence,
} from "./securityEvidenceUtils.js";

const SOURCIFY_PROVIDER = "sourcify-v2";
const SOURCIFY_BASE_URL = "https://sourcify.dev/server";

function matchValue(raw = {}) {
  return lower(raw.match || raw.matchType || raw.runtimeMatch || raw.creationMatch || "");
}

export function normalizeSourcifyContract(raw = {}, meta = {}) {
  const match = matchValue(raw);
  const verifiedSource = Boolean(match && match !== "false" && match !== "none");
  const exactMatch = match.includes("exact") || lower(raw.creationMatch).includes("perfect") || lower(raw.runtimeMatch).includes("perfect");

  if (!verifiedSource) {
    return {
      ...unknownSecurityEvidence(SOURCIFY_PROVIDER, "Sourcify did not return a verified source match."),
      chain: meta.chain || null,
      address: meta.address || null,
      raw: raw || null,
    };
  }

  return {
    provider: SOURCIFY_PROVIDER,
    status: "EVIDENCE_AVAILABLE",
    observedAt: new Date().toISOString(),
    chain: meta.chain || null,
    address: meta.address || null,
    verifiedSource,
    exactMatch,
    sourceMatch: raw.match || raw.matchType || raw.runtimeMatch || raw.creationMatch || "matched",
    proxy: false,
    ownerRisk: false,
    mintRisk: false,
    freezeRisk: false,
    blacklistRisk: false,
    highTaxRisk: false,
    malicious: false,
    honeypot: false,
    riskFindings: [],
    warnings: exactMatch ? [] : ["Sourcify source is verified but not an exact/perfect match."],
    confidence: exactMatch ? 90 : 76,
    raw,
  };
}

export async function getSourcifySecurityEvidence(project = {}, options = {}) {
  const address = tokenAddress(project);
  const chain = chainKey(project.chain || project.network || project.chainId || "");
  const chainId = evmChainId(chain || project.chainId);

  if (!chainId || !isEvmAddress(address)) {
    return unknownSecurityEvidence(SOURCIFY_PROVIDER, "Sourcify requires a supported EVM chain and contract address.");
  }

  const cached = options.useCache === false ? null : getCachedSecurityEvidence(SOURCIFY_PROVIDER, chain, address, options.cacheTtlMs);
  if (cached) return cached;

  try {
    const url = `${SOURCIFY_BASE_URL}/v2/contract/${chainId}/${address}`;
    const raw = await fetchJson(url, { timeoutMs: options.timeoutMs });
    const evidence = normalizeSourcifyContract(raw, { chain, address });
    return options.useCache === false ? evidence : setCachedSecurityEvidence(SOURCIFY_PROVIDER, chain, address, evidence);
  } catch (error) {
    return unknownSecurityEvidence(SOURCIFY_PROVIDER, `Sourcify request failed: ${error.message}`);
  }
}
