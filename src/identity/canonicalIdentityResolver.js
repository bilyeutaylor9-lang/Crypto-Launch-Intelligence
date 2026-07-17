const CHAIN_ALIASES = {
  "1": "ethereum",
  eth: "ethereum",
  mainnet: "ethereum",
  ethereum: "ethereum",
  "8453": "base",
  base: "base",
  "42161": "arbitrum",
  arb: "arbitrum",
  arbitrum: "arbitrum",
  "10": "optimism",
  op: "optimism",
  optimism: "optimism",
  "137": "polygon",
  matic: "polygon",
  polygon: "polygon",
  "56": "bsc",
  bnb: "bsc",
  bsc: "bsc",
  "101": "solana",
  sol: "solana",
  solana: "solana",
  avax: "avalanche",
  avalanche: "avalanche",
};

const BRIDGE_TERMS = ["bridged", "wormhole", "wrapped", "weth", "wbtc", "portal", "layerzero", "omnichain"];
const CONTRACT_CONFLICT_TERMS = ["contract mismatch", "chain mismatch", "counterfeit", "impersonation", "incompatible contract"];

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

function normalizeAddress(value = "") {
  const raw = lower(value);
  if (!raw) return "";
  if (/^0x[a-f0-9]{40}$/.test(raw)) return raw;
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(clean(value))) return clean(value);
  return raw;
}

function normalizeChain(value = "") {
  const key = lower(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return CHAIN_ALIASES[key] || key || "";
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

function collectContracts(project = {}) {
  const contracts = [];
  const add = (address, chain, source, verified = false, role = "token") => {
    const normalizedAddress = normalizeAddress(address);
    if (!normalizedAddress) return;
    contracts.push({
      address: normalizedAddress,
      chain: normalizeChain(chain || project.chainId || project.chain || project.network),
      source,
      verified: Boolean(verified),
      role,
    });
  };

  add(project.finalContractAddress, project.finalChainId || project.finalChain, "final-selection", true);
  add(project.contractAddress, project.chainId || project.chain || project.network, "contractAddress", project.contractVerified);
  add(project.tokenAddress, project.chainId || project.chain || project.network, "tokenAddress", project.contractVerified);
  add(project.address, project.chainId || project.chain || project.network, "address", project.contractVerified);
  add(project.baseToken?.address, project.chainId || project.chain || project.network, "baseToken.address", project.contractVerified, "base-token");
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

  return contracts;
}

function collectPairs(project = {}) {
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
    .map(normalizeAddress)
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

function buildCanonicalId({ chain, address, pairAddress, domain, symbol, name }) {
  if (chain && address) return `chain:${chain}:contract:${address}`;
  if (chain && pairAddress) return `chain:${chain}:pair:${pairAddress}`;
  if (domain) return `domain:${domain}`;
  return `weak:${chain || "unknown"}:${symbol || normalizeName(name) || "unknown"}`;
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
  const verifiedContracts = contracts.filter((contract) => contract.verified || project.contractVerified === true);
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
  else if (bridged) identityStatus = "BRIDGED_VARIANT";
  else if (multiChainVariant) identityStatus = "MULTICHAIN_VARIANT";
  else if (canonicalChain && canonicalAddress && verifiedContracts.length) identityStatus = "VERIFIED";
  else if (canonicalChain && canonicalAddress) identityStatus = "PROBABLE_MATCH";
  else if (pairAddress && (project.baseToken?.address || project.tokenAddress || project.contractAddress)) identityStatus = "PROBABLE_MATCH";
  else if (domain || sourceIdentities.some((identity) => identity.type === "external-id")) identityStatus = "WEAK_MATCH";
  else if (collisionDetected) identityStatus = "SYMBOL_COLLISION";

  const conflictReasons = [];
  if (contractConflict) conflictReasons.push("Incompatible verified contract, chain, or external identity evidence.");
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
    canonicalProjectId: buildCanonicalId({
      chain: canonicalChain,
      address: canonicalAddress,
      pairAddress,
      domain,
      symbol: canonicalSymbol,
      name: canonicalName,
    }),
    canonicalName,
    canonicalSymbol,
    canonicalChain,
    canonicalAddress,
    aliases,
    sourceIdentities,
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
    canonicalProjectId: canonicalIdentity.canonicalProjectId,
    canonicalName: canonicalIdentity.canonicalName,
    canonicalSymbol: canonicalIdentity.canonicalSymbol,
    canonicalChain: canonicalIdentity.canonicalChain,
    canonicalAddress: canonicalIdentity.canonicalAddress,
    identityConfidence: canonicalIdentity.identityConfidence,
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
