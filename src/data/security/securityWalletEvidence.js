import { normalizeChainId, normalizeTokenAddress, normalizeWalletAddress } from "../../identity/strictIdentityValidators.js";
import { createEvmWalletParticipantFilter } from "../walletParticipantPolicy.js";

function hasEligibleGoPlusHolderBalance(holder) {
  if (!holder || typeof holder !== "object" || Array.isArray(holder)) return false;
  if (!Object.hasOwn(holder, "balance")) return true;
  const { balance } = holder;
  if (typeof balance === "number") return Number.isFinite(balance) && balance > 0;
  if (typeof balance !== "string") return false;
  // Inspect decimal digits directly so provider amounts cannot underflow or overflow.
  const decimal = balance.trim();
  return /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(decimal) && /[1-9]/.test(decimal);
}

function solanaHolderObservations(project, items, options, tokenAddress) {
  const now = options.now ? new Date(typeof options.now === "function" ? options.now() : options.now).getTime() : Date.now();
  const maxAgeMs = Number(options.cacheTtlMs ?? process.env.SECURITY_EVIDENCE_CACHE_TTL_MS ?? 6 * 60 * 60 * 1000);
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return [];
  let newestTimestamp = Number.NEGATIVE_INFINITY;
  let newestObservations = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (item?.chain !== "solana" || item.address !== tokenAddress) continue;
    const report = item.provider === "solana-rpc-rugcheck" ? item.raw?.rugCheck?.holderEvidence : item;
    if (report?.provider !== "rugcheck-solana-full" || report.schemaVersion !== 1 || report.status !== "EVIDENCE_AVAILABLE" ||
      report.chain !== "solana" || report.address !== tokenAddress || report.raw?.mint !== tokenAddress || report.responseIdentityVerified !== true) continue;
    const timestamp = typeof report.observedAt === "string" ? Date.parse(report.observedAt) : NaN;
    if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now || now - timestamp > maxAgeMs) continue;
    if (typeof report.confidence !== "number" || !Number.isFinite(report.confidence) || report.confidence < 0.5 || report.confidence > 1) continue;
    const excluded = new Set([tokenAddress, project.poolAddress, project.pairAddress, "11111111111111111111111111111111",
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"]);
    const owners = [...new Set((Array.isArray(report.solanaHolderAccounts) ? report.solanaHolderAccounts : [])
      .filter((holder) => holder?.positiveBalanceReported === true && normalizeTokenAddress(holder.accountAddress, "solana") && holder.ownerAddress !== holder.accountAddress)
      .map((holder) => normalizeWalletAddress(holder.ownerAddress, "solana")).filter((owner) => owner && !excluded.has(owner)))];
    if (!owners.length) continue;
    // The validated inner report owns the observation clock, not its wrapper.
    if (timestamp <= newestTimestamp) continue;
    newestTimestamp = timestamp;
    const common = { source: report.provider, sourceTimestamp: report.observedAt, timestamp: report.observedAt,
      confidence: report.confidence, verificationStatus: "VERIFIED_PROVIDER_OBSERVATION", chain: "solana", tokenAddress,
      holderSampleOnly: true, completeHolderCoverage: false, holderAddressSemantics: "TOKEN_ACCOUNT_OWNER",
      identityVerifiedOnChain: false, snapshotTimestampVerified: false, providerReportDetectedAt: report.providerReportDetectedAt,
      sourceTimestampMeaning: "PROVIDER_RECEIPT_TIME_NOT_CHAIN_SNAPSHOT_TIME", acquisitionMode: "EXISTING_SECURITY_PAYLOAD", buyerClassificationAvailable: false };
    newestObservations = ["holderAddresses", "wallets"].map((field) => ({ ...common, field, value: owners }));
  }
  return newestObservations;
}

export function securityHolderObservations(project = {}, items = [], options = {}) {
  const chain = normalizeChainId(project.chain || project.canonicalChain || project.network);
  const tokenAddress = normalizeTokenAddress(project.tokenAddress || project.contractAddress || project.address, chain);
  if (!chain || !tokenAddress) return [];
  const chains = [project.chain, project.canonicalChain, project.network].map(normalizeChainId).filter(Boolean);
  const addresses = [project.tokenAddress, project.contractAddress, project.address]
    .map((value) => normalizeTokenAddress(value, chain)).filter(Boolean);
  if (chains.some((value) => value !== chain) || addresses.some((value) => value !== tokenAddress)) return [];
  if (chain === "solana") return solanaHolderObservations(project, items, options, tokenAddress);
  if (!/^0x[0-9a-f]{40}$/.test(tokenAddress)) return [];
  const now = options.now ? new Date(typeof options.now === "function" ? options.now() : options.now).getTime() : Date.now();
  const maxAgeMs = Number(options.cacheTtlMs ?? process.env.SECURITY_EVIDENCE_CACHE_TTL_MS ?? 6 * 60 * 60 * 1000);
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return [];
  let newestTimestamp = Number.NEGATIVE_INFINITY;
  let newestObservations = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (item?.provider !== "goplus" || item.status !== "EVIDENCE_AVAILABLE" || item.responseIdentityVerified !== true ||
      normalizeChainId(item.chain) !== chain || normalizeTokenAddress(item.address, chain) !== tokenAddress) continue;
    const timestamp = typeof item.observedAt === "string" ? Date.parse(item.observedAt) : NaN;
    if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now || now - timestamp > maxAgeMs) continue;
    if (!Array.isArray(item.raw?.holders)) continue;
    const addresses = [...new Set(item.raw.holders.filter(hasEligibleGoPlusHolderBalance).map((holder) => typeof holder?.address === "string"
      ? holder.address.trim().toLowerCase() : null).filter((address) => /^0x[0-9a-f]{40}$/.test(address || "") && !/^0x0{40}$/.test(address)))];
    if (!addresses.length) continue;
    const confidence = typeof item.confidence === "number" && Number.isFinite(item.confidence)
      ? Math.max(0, Math.min(1, item.confidence > 1 ? item.confidence / 100 : item.confidence)) : 0;
    if (confidence < 0.5) continue;
    const wallets = addresses.filter(createEvmWalletParticipantFilter(tokenAddress, project.poolAddress, project.pairAddress));
    // Compare only eligible samples; equal timestamps retain the original input order.
    if (timestamp <= newestTimestamp) continue;
    newestTimestamp = timestamp;
    newestObservations = [{ field: "holderAddresses", value: addresses }, ...(wallets.length ? [{ field: "wallets", value: wallets }] : [])]
      .map((observation) => ({ ...observation, source: "goplus", sourceTimestamp: item.observedAt,
        timestamp: item.observedAt, confidence, verificationStatus: "VERIFIED_PROVIDER_OBSERVATION",
        chain, tokenAddress, holderSampleOnly: true, completeHolderCoverage: false,
        acquisitionMode: "EXISTING_SECURITY_PAYLOAD", buyerClassificationAvailable: false }));
  }
  return newestObservations;
}

export function securityWalletEvidencePatch(project = {}, items = [], options = {}) {
  const observations = securityHolderObservations(project, items, options).filter((item) =>
    !Array.isArray(project[item.field]) || !project[item.field].length);
  if (!observations.length) return {};
  return { ...Object.fromEntries(observations.map((item) => [item.field, item.value])),
    canonicalAliasProvenance: { ...project.canonicalAliasProvenance,
      ...Object.fromEntries(observations.map((item) => [item.field, { ...item, value: undefined }])) } };
}
