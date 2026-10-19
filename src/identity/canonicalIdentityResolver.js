import {
  addressRejectionReason,
  chainRejectionReason,
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
  normalizeWalletAddress,
} from "./strictIdentityValidators.js";
import { SUPPORTED_CHAIN_REGISTRY } from "../data/chainAliasRegistry.js";
import { buildStrictCanonicalId } from "../execution/routeResolver.js";

const BRIDGE_TERMS = ["bridged", "wormhole", "wrapped", "weth", "wbtc", "portal", "layerzero", "omnichain"];
const CONTRACT_CONFLICT_TERMS = ["contract mismatch", "chain mismatch", "counterfeit", "impersonation", "incompatible contract"];
export const SOLANA_MINT_SCOPE = "SOLANA_MINT_ACCOUNT";
const SOLANA_MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const SOLANA_TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);

function clean(value = "") {
  return String(value ?? "").trim();
}

function lower(value = "") {
  return clean(value).toLowerCase();
}

function upper(value = "") {
  return clean(value).toUpperCase();
}

function normalizeName(value = "") {
  return lower(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(token|coin|protocol|network|finance|games|game|wrapped|bridged)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeChain(value = "") {
  return normalizeChainId(value) || "";
}

function first(values = []) {
  return values.map(clean).find(Boolean) || "";
}

function officialDomain(value = "") {
  const raw = clean(value);
  if (!raw) return "";
  try {
    return new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    const match = raw.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/i);
    return match ? match[1].toLowerCase() : "";
  }
}

function sourceValues(project = {}, key = "") {
  return [
    project[key],
    project.baseToken?.[key],
    project.rawCandidate?.[key],
    project.marketData?.[key],
  ].filter((value) => value !== undefined && value !== null && value !== "");
}

function usesMintAccountProof(project) {
  return project.identityVerificationScope === SOLANA_MINT_SCOPE ||
    project.canonicalIdentity?.verificationScope === SOLANA_MINT_SCOPE;
}

function verifiedContractFlag(project) {
  return project.contractVerified === true && !usesMintAccountProof(project);
}

function solanaMintIdentityEvidence(project) {
  const supplied = (value) => value !== undefined && value !== null && value !== "";
  const chains = [project.chain, project.chainId, project.network, project.canonicalChain, project.finalChain, project.finalChainId].filter(supplied);
  if (!chains.length || !chains.every((chain) => normalizeChainId(chain) === "solana")) return null;
  const addresses = [project.tokenAddress, project.contractAddress, project.address, project.canonicalAddress,
    project.finalContractAddress, project.baseToken?.address].filter(supplied);
  const mint = normalizeTokenAddress(addresses[0], "solana");
  if (!mint || !addresses.every((address) => normalizeTokenAddress(address, "solana") === mint)) return null;
  const now = Date.now();
  const items = [project.solanaMintAccountEvidence,
    ...(Array.isArray(project.securityEvidence) ? project.securityEvidence : [])].filter(Boolean);
  return items.find((item) => {
    const rpc = item?.raw?.rpc || (item.verificationScope === SOLANA_MINT_SCOPE ? item : null);
    const stamp = typeof item?.sourceTimestamp === "string" ? Date.parse(item.sourceTimestamp) : NaN;
    const observed = typeof item?.observedAt === "string" ? Date.parse(item.observedAt) : NaN;
    const checks = Array.isArray(item?.testedChecks) ? item.testedChecks : [];
    return item?.provider === "solana-rpc-rugcheck" && ["EVIDENCE_AVAILABLE", "RISK_REVIEW"].includes(item.status) && item.chain === "solana" &&
      item.address === mint && item.responseIdentityVerified === true && item.identityVerifiedOnChain === true &&
      item.snapshotTimestampVerified === true && item.verifiedSource === true &&
      ["mint-account identity", "mint authority", "freeze authority"].every((check) => checks.includes(check)) &&
      rpc?.genesisHash === SOLANA_MAINNET_GENESIS && SOLANA_TOKEN_PROGRAMS.has(rpc.ownerProgram) &&
      Number.isSafeInteger(rpc.observedSlot) && rpc.observedSlot > 0 &&
      Number.isSafeInteger(rpc.blockTimestamp) && rpc.blockTimestamp > 0 &&
      Number.isFinite(stamp) && stamp === rpc.blockTimestamp * 1000 && Date.parse(rpc.sourceTimestamp) === stamp &&
      stamp <= now && now - stamp <= 300000 && Number.isFinite(observed) && observed <= now &&
      ["mintAuthority", "freezeAuthority"].every((field) => Object.hasOwn(rpc, field) &&
        (rpc[field] === null || Boolean(normalizeWalletAddress(rpc[field], "solana")))) &&
      typeof item.mintRisk === "boolean" && typeof item.freezeRisk === "boolean" &&
      (!rpc.mintAuthority || item.mintRisk) && (!rpc.freezeAuthority || item.freezeRisk);
  }) || null;
}

function mintAccountProjection(item) {
  const rpc = item.raw?.rpc || item;
  const fields = ["provider", "status", "chain", "address", "sourceTimestamp", "observedAt", "verifiedSource",
    "responseIdentityVerified", "identityVerifiedOnChain", "snapshotTimestampVerified", "mintRisk", "freezeRisk"];
  const rpcFields = ["genesisHash", "ownerProgram", "observedSlot", "blockTimestamp", "mintAuthority", "freezeAuthority"];
  return { ...Object.fromEntries(fields.map((field) => [field, item[field]])),
    ...Object.fromEntries(rpcFields.map((field) => [field, rpc[field]])),
    testedChecks: ["mint-account identity", "mint authority", "freeze authority"], verificationScope: SOLANA_MINT_SCOPE };
}

function collectContracts(project = {}) {
  const contracts = [];
  const add = (address, chain, source, verified = false, role = "token") => {
    const normalizedChain = normalizeChain(chain || project.chainId || project.chain || project.network);
    const normalizedAddress = normalizeTokenAddress(address, normalizedChain);
    if (!normalizedAddress) return;
    contracts.push({
      address: normalizedAddress,
      chain: normalizedChain,
      source,
      verified: verified === true,
      role,
    });
  };

  // Final selection also emits addresses for UNKNOWN identities. Its output is
  // an alias, not an independent verification source on a later pass.
  add(project.finalContractAddress, project.finalChainId || project.finalChain, "final-selection");
  add(project.contractAddress, project.chainId || project.chain || project.network, "contractAddress", verifiedContractFlag(project));
  add(project.tokenAddress, project.chainId || project.chain || project.network, "tokenAddress", verifiedContractFlag(project));
  add(project.address, project.chainId || project.chain || project.network, "address", verifiedContractFlag(project));
  add(project.baseToken?.address, project.chainId || project.chain || project.network, "baseToken.address", verifiedContractFlag(project), "base-token");
  add(project.rawCandidate?.contractAddress, project.rawCandidate?.chain || project.chain, "rawCandidate.contractAddress");
  add(project.rawCandidate?.tokenAddress, project.rawCandidate?.chain || project.chain, "rawCandidate.tokenAddress");

  const platforms = project.platforms || project.platformContracts || project.coinGeckoPlatforms || project.coinGeckoPlatformContracts || {};
  for (const [chain, address] of Object.entries(platforms || {})) {
    add(address, chain, "coingecko-platform", true);
  }

  for (const route of [
    ...(project.purchaseRoute?.routes || []),
    ...(project.smallCapHunter?.purchaseRoute?.routes || []),
    ...(project.proofOfAlphaExecutionTwin?.route?.routes || []),
  ]) {
    add(route.contract || route.tokenAddress || route.address, route.chain || project.chain, "execution-route", route.verified, "route-token");
  }

  const mintProof = solanaMintIdentityEvidence(project);
  if (mintProof) contracts.unshift({ address: mintProof.address, chain: "solana", source: "solana-rpc-mint-account",
    verified: true, role: "token", verificationScope: SOLANA_MINT_SCOPE,
    sourceTimestamp: mintProof.sourceTimestamp, observedSlot: (mintProof.raw?.rpc || mintProof).observedSlot,
    accountEvidence: mintAccountProjection(mintProof) });

  return contracts;
}

function collectPairs(project = {}) {
  const chain = normalizeChain(project.chainId || project.chain || project.network);
  return [
    project.finalPairAddress,
    project.pairAddress,
    project.poolAddress,
    project.pair?.address,
    project.rawCandidate?.pairAddress,
    project.rawCandidate?.poolAddress,
    ...(project.purchaseRoute?.routes || []).map((route) => route.pairAddress),
    ...(project.smallCapHunter?.purchaseRoute?.routes || []).map((route) => route.pairAddress),
    ...(project.proofOfAlphaExecutionTwin?.route?.routes || []).map((route) => route.pairAddress),
  ]
    .map((address) => normalizePoolAddress(address, chain))
    .filter(Boolean);
}

function collectAliases(project = {}) {
  const aliases = new Set();
  [
    project.name,
    project.canonicalName,
    project.baseToken?.name,
    project.rawCandidate?.name,
    project.symbol,
    project.ticker,
    project.baseToken?.symbol,
    project.rawCandidate?.symbol,
  ]
    .map(clean)
    .filter(Boolean)
    .forEach((value) => aliases.add(value));
  return [...aliases];
}

function collectSourceIdentities(project = {}, contracts = [], pairs = []) {
  const identities = [
    ...contracts.map((contract) => ({
      type: contract.role,
      source: contract.source,
      chain: contract.chain,
      address: contract.address,
      verified: contract.verified,
      ...(contract.verificationScope ? { verificationScope: contract.verificationScope,
        sourceTimestamp: contract.sourceTimestamp, observedSlot: contract.observedSlot } : {}),
    })),
    ...pairs.map((pairAddress) => ({
      type: "pair",
      source: "pairAddress",
      chain: normalizeChain(project.chainId || project.chain || project.network),
      address: pairAddress,
      verified: Boolean(project.pairVerified || project.liquidityVerified),
    })),
  ];

  const domain = officialDomain(first([
    project.website,
    project.projectUrl,
    project.links?.homepage?.[0],
    project.links?.website,
    project.officialUrl,
  ]));
  if (domain) identities.push({ type: "domain", source: "official-website", domain, verified: Boolean(project.websiteVerified) });

  for (const social of [
    project.twitter,
    project.x,
    project.telegram,
    project.discord,
    project.links?.twitter,
    project.links?.telegram,
  ].filter(Boolean)) {
    identities.push({ type: "social", source: "official-social", handle: clean(social), verified: Boolean(project.socialVerified) });
  }

  for (const externalId of [
    project.coinGeckoId,
    project.coingeckoId,
    project.coinMarketCapId,
    project.cmcId,
    project.assetId,
    project.exchangeAssetId,
  ].filter(Boolean)) {
    identities.push({ type: "external-id", source: "external-provider", id: clean(externalId), verified: true });
  }

  return identities;
}

function symbolCollisionContext(project = {}, context = {}) {
  const symbol = upper(project.symbol || project.ticker || project.baseToken?.symbol);
  if (!symbol) return null;
  return context.symbols?.get(symbol) || null;
}

function conflictFromText(project = {}) {
  const text = lower([
    project.identityVerdict,
    project.projectIdentityVerdict,
    project.identityState,
    project.projectIdentityState,
    project.chainIdentityStatus,
    project.contractVerdict,
    ...(Array.isArray(project.identityWarnings) ? project.identityWarnings : []),
    ...(Array.isArray(project.finalBlockingReasons) ? project.finalBlockingReasons : []),
  ].join(" "));
  return CONTRACT_CONFLICT_TERMS.some((term) => text.includes(term));
}

function identityInputWarnings(project = {}) {
  const rawChain = first([project.finalChainId, project.chainId, project.chain, project.network]);
  const chain = normalizeChain(rawChain);
  return [
    ...(Array.isArray(project.identityConflicts) ? project.identityConflicts : []),
    chainRejectionReason(rawChain),
    addressRejectionReason(
      first([
        project.finalContractAddress,
        project.contractAddress,
        project.tokenAddress,
        project.address,
        project.baseToken?.address,
      ]),
      "token address",
      chain
    ),
    addressRejectionReason(
      first([project.finalPairAddress, project.pairAddress, project.poolAddress, project.pair?.address]),
      "pool address",
      chain
    ),
  ].filter(Boolean);
}

function canonicalChainId(chain = "") {
  const normalized = normalizeChain(chain);
  return normalized ? SUPPORTED_CHAIN_REGISTRY[normalized]?.chainId ?? null : null;
}

function buildCanonicalId({ chain, address }) {
  return buildStrictCanonicalId(chain, address);
}

export function buildCanonicalIdentityContext(projects = []) {
  const symbols = new Map();
  for (const project of Array.isArray(projects) ? projects : []) {
    const symbol = upper(project.symbol || project.ticker || project.baseToken?.symbol);
    if (!symbol) continue;
    const chain = normalizeChain(project.chainId || project.chain || project.network) || "unknown";
    const contract = collectContracts(project)[0]?.address || "";
    const key = `${chain}:${contract || officialDomain(project.website || project.projectUrl) || normalizeName(project.name) || "symbol-only"}`;
    const current = symbols.get(symbol) || { symbol, keys: new Set(), chains: new Set(), contracts: new Set(), names: new Set() };
    current.keys.add(key);
    current.chains.add(chain);
    if (contract) current.contracts.add(contract);
    if (project.name) current.names.add(normalizeName(project.name));
    symbols.set(symbol, current);
  }
  return { symbols };
}

export function resolveCanonicalIdentity(project = {}, context = buildCanonicalIdentityContext([project])) {
  const contracts = collectContracts(project);
  const pairs = collectPairs(project);
  const aliases = collectAliases(project);
  const sourceIdentities = collectSourceIdentities(project, contracts, pairs);
  const inputWarnings = identityInputWarnings(project);
  const verifiedContracts = contracts.filter((contract) => contract.verified || verifiedContractFlag(project));
  const primaryContract = verifiedContracts[0] || contracts[0] || null;
  const canonicalChain = normalizeChain(project.finalChainId || project.chainId || primaryContract?.chain || project.chain || project.network);
  const canonicalAddress = primaryContract?.address || "";
  const canonicalSymbol = upper(project.symbol || project.ticker || project.baseToken?.symbol || aliases.find((alias) => alias.length <= 12));
  const canonicalName = clean(project.canonicalName || project.name || project.baseToken?.name || aliases[0] || canonicalSymbol || "Unknown");
  const domain = sourceIdentities.find((identity) => identity.type === "domain")?.domain || "";
  const pairAddress = pairs[0] || "";
  const collision = symbolCollisionContext(project, context);
  const collisionDetected = Boolean(canonicalSymbol && (collision?.keys?.size || 0) > 1);
  const contractSet = new Set(contracts.filter((contract) => contract.chain === canonicalChain || !contract.chain || !canonicalChain).map((contract) => contract.address));
  const incompatibleVerifiedContracts = new Set(
    verifiedContracts
      .filter((contract) => contract.chain === canonicalChain || !contract.chain || !canonicalChain)
      .map((contract) => contract.address)
  );
  const explicitContractConflict =
    project.chainMismatch === true ||
    project.contractChainMismatch === true ||
    project.externalIdMismatch === true ||
    conflictFromText(project);
  const contractConflict = explicitContractConflict || incompatibleVerifiedContracts.size > 1;
  const bridged = BRIDGE_TERMS.some((term) => lower(`${canonicalName} ${canonicalSymbol} ${project.bridge || ""} ${project.variant || ""}`).includes(term));
  const multiChainVariant = collisionDetected && (collision?.chains?.size || 0) > 1 && Boolean(canonicalAddress);

  let identityStatus = "UNRESOLVED";
  if (contractConflict) identityStatus = "CONTRACT_CONFLICT";
  else if (canonicalChain && canonicalAddress && verifiedContracts.length) identityStatus = "VERIFIED";
  else if (bridged) identityStatus = "BRIDGED_VARIANT";
  else if (multiChainVariant) identityStatus = "MULTICHAIN_VARIANT";
  else if (canonicalChain && canonicalAddress) identityStatus = "PROBABLE_MATCH";
  else if (pairAddress && contracts.length) identityStatus = "PROBABLE_MATCH";
  else if (domain || sourceIdentities.some((identity) => identity.type === "external-id")) identityStatus = "WEAK_MATCH";
  else if (collisionDetected) identityStatus = "SYMBOL_COLLISION";

  const conflictReasons = [];
  if (contractConflict) conflictReasons.push("Incompatible verified contract, chain, or external identity evidence.");
  conflictReasons.push(...inputWarnings);
  if (collisionDetected) conflictReasons.push("Ticker appears across distinct instruments; no cross-chain or issuer relationship is established by the symbol.");
  if (collisionDetected && identityStatus === "SYMBOL_COLLISION") conflictReasons.push("Ticker symbol appears across multiple unresolved identities.");
  if (contractSet.size > 1 && !contractConflict) conflictReasons.push("Multiple aliases/contracts observed; treated as variant evidence until verified.");

  const identityConfidence = Math.round(
    Math.max(
      5,
      Math.min(
        100,
        (identityStatus === "VERIFIED" ? 90 : identityStatus === "PROBABLE_MATCH" ? 72 : identityStatus === "MULTICHAIN_VARIANT" ? 68 : identityStatus === "BRIDGED_VARIANT" ? 64 : identityStatus === "WEAK_MATCH" ? 46 : identityStatus === "SYMBOL_COLLISION" ? 32 : identityStatus === "CONTRACT_CONFLICT" ? 8 : 18) +
          Math.min(10, sourceIdentities.length * 2)
      )
    )
  );

  return {
    canonicalId: buildCanonicalId({
      chain: canonicalChain,
      address: canonicalAddress,
    }),
    canonicalChainId: canonicalChainId(canonicalChain),
    canonicalProjectId: buildCanonicalId({
      chain: canonicalChain,
      address: canonicalAddress,
    }),
    canonicalName,
    canonicalSymbol,
    canonicalChain,
    canonicalAddress,
    aliases,
    sourceIdentities,
    verificationScope: primaryContract?.verificationScope || (usesMintAccountProof(project) ? SOLANA_MINT_SCOPE : null),
    mintAccountEvidence: primaryContract?.accountEvidence || null,
    symbolCollisionDetected: collisionDetected,
    identityConfidence,
    identityStatus,
    conflictReasons,
    requiresManualReview: ["SYMBOL_COLLISION", "UNRESOLVED", "WEAK_MATCH", "CONTRACT_CONFLICT"].includes(identityStatus),
  };
}

export function attachCanonicalIdentity(project = {}, context) {
  const canonicalIdentity = resolveCanonicalIdentity(project, context);
  return {
    ...project,
    canonicalIdentity,
    canonicalId: canonicalIdentity.canonicalId,
    canonicalChainId: canonicalIdentity.canonicalChainId,
    canonicalProjectId: canonicalIdentity.canonicalProjectId,
    canonicalName: canonicalIdentity.canonicalName,
    canonicalSymbol: canonicalIdentity.canonicalSymbol,
    canonicalChain: canonicalIdentity.canonicalChain,
    canonicalAddress: canonicalIdentity.canonicalAddress,
    identityConfidence: canonicalIdentity.identityConfidence,
    identityVerificationScope: canonicalIdentity.verificationScope,
    solanaMintAccountEvidence: canonicalIdentity.mintAccountEvidence || project.solanaMintAccountEvidence || null,
    identityStatus: canonicalIdentity.identityStatus,
    identityReviewQueueReason: canonicalIdentity.requiresManualReview ? canonicalIdentity.conflictReasons[0] || canonicalIdentity.identityStatus : "",
    canonicalIdentityHardBlock: canonicalIdentity.identityStatus === "CONTRACT_CONFLICT",
  };
}

export function attachCanonicalIdentityBatch(projects = []) {
  const safe = Array.isArray(projects) ? projects : [];
  const context = buildCanonicalIdentityContext(safe);
  return safe.map((project) => attachCanonicalIdentity(project, context));
}
