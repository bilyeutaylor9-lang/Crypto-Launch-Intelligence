import { normalizeChainId, normalizeTokenAddress } from "../../identity/strictIdentityValidators.js";

export function securityHolderObservations(project = {}, items = [], options = {}) {
  const chain = normalizeChainId(project.chain || project.canonicalChain || project.network);
  const tokenAddress = normalizeTokenAddress(project.tokenAddress || project.contractAddress || project.address, chain);
  if (!chain || !/^0x[0-9a-f]{40}$/.test(tokenAddress || "")) return [];
  const chains = [project.chain, project.canonicalChain, project.network].map(normalizeChainId).filter(Boolean);
  const addresses = [project.tokenAddress, project.contractAddress, project.address]
    .map((value) => normalizeTokenAddress(value, chain)).filter(Boolean);
  if (chains.some((value) => value !== chain) || addresses.some((value) => value !== tokenAddress)) return [];
  const now = options.now ? new Date(typeof options.now === "function" ? options.now() : options.now).getTime() : Date.now();
  const maxAgeMs = Number(options.cacheTtlMs ?? process.env.SECURITY_EVIDENCE_CACHE_TTL_MS ?? 6 * 60 * 60 * 1000);
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return [];
  for (const item of Array.isArray(items) ? items : []) {
    if (item?.provider !== "goplus" || item.status !== "EVIDENCE_AVAILABLE" || item.responseIdentityVerified !== true ||
      normalizeChainId(item.chain) !== chain || normalizeTokenAddress(item.address, chain) !== tokenAddress) continue;
    const timestamp = typeof item.observedAt === "string" ? Date.parse(item.observedAt) : NaN;
    if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now || now - timestamp > maxAgeMs) continue;
    if (!Array.isArray(item.raw?.holders)) continue;
    const addresses = [...new Set(item.raw.holders.map((holder) => typeof holder?.address === "string"
      ? holder.address.trim().toLowerCase() : null).filter((address) => /^0x[0-9a-f]{40}$/.test(address || "") && !/^0x0{40}$/.test(address)))];
    if (!addresses.length) continue;
    const confidence = typeof item.confidence === "number" && Number.isFinite(item.confidence)
      ? Math.max(0, Math.min(1, item.confidence > 1 ? item.confidence / 100 : item.confidence)) : 0;
    if (confidence < 0.5) continue;
    const pool = normalizeTokenAddress(project.poolAddress || project.pairAddress, chain);
    const wallets = addresses.filter((address) => address !== tokenAddress && address !== pool);
    return [{ field: "holderAddresses", value: addresses }, ...(wallets.length ? [{ field: "wallets", value: wallets }] : [])]
      .map((observation) => ({ ...observation, source: "goplus", sourceTimestamp: item.observedAt,
        timestamp: item.observedAt, confidence, verificationStatus: "VERIFIED_PROVIDER_OBSERVATION",
        chain, tokenAddress, holderSampleOnly: true, completeHolderCoverage: false,
        acquisitionMode: "EXISTING_SECURITY_PAYLOAD", buyerClassificationAvailable: false }));
  }
  return [];
}

export function securityWalletEvidencePatch(project = {}, items = [], options = {}) {
  const observations = securityHolderObservations(project, items, options).filter((item) =>
    !Array.isArray(project[item.field]) || !project[item.field].length);
  if (!observations.length) return {};
  return { ...Object.fromEntries(observations.map((item) => [item.field, item.value])),
    canonicalAliasProvenance: { ...project.canonicalAliasProvenance,
      ...Object.fromEntries(observations.map((item) => [item.field, { ...item, value: undefined }])) } };
}
