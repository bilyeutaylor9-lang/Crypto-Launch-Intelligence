import crypto from "crypto";
import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
  normalizeWalletAddress,
} from "../identity/strictIdentityValidators.js";

function clean(value = "") {
  return String(value || "").trim().toLowerCase();
}

function domainFrom(value = "") {
  try {
    const parsed = new URL(String(value));
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    const match = String(value || "").match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/i);
    return match ? match[1].toLowerCase() : "";
  }
}

function hashId(parts = []) {
  const input = parts.filter(Boolean).join("|").toLowerCase();
  return `cli_project_${crypto.createHash("sha1").update(input || "unknown").digest("hex").slice(0, 16)}`;
}

function hashNamespace(prefix = "cli_id", parts = []) {
  const input = parts.filter(Boolean).join("|").toLowerCase();
  return `${prefix}_${crypto.createHash("sha1").update(input || "unknown").digest("hex").slice(0, 16)}`;
}

function normalizeSymbol(value = "") {
  const symbol = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "")
    .slice(0, 32);

  return symbol || "UNKNOWN";
}

function namespaceId(source = "unknown", value = "") {
  const cleanSource = clean(source || "unknown").replace(/[^a-z0-9._-]+/g, "-") || "unknown";
  const cleanValue = clean(value);
  return cleanValue ? `${cleanSource}:${cleanValue}` : "";
}

function flattenMarket(value) {
  if (!value) return "";
  if (typeof value === "string") return clean(value);
  if (typeof value !== "object") return clean(value);
  return clean(
    value.marketKey ||
      value.marketPair ||
      value.pair ||
      value.symbol ||
      value.id ||
      [value.exchange || value.venue, value.base || value.baseAsset || value.baseSymbol, value.quote || value.quoteAsset || value.quoteSymbol]
        .filter(Boolean)
        .join(":")
  );
}

export function symbolIdentityForProject(project = {}) {
  const signals = projectIdentitySignals(project);
  const canonicalSymbol = normalizeSymbol(project.symbol || project.ticker || signals.aliases[0]);
  const chain = signals.chain || "unknown";
  const strongestProjectAnchor =
    signals.tokenContracts[0] ||
    signals.poolAddresses[0] ||
    signals.exchangeAssetIds[0] ||
    signals.marketKeys[0] ||
    signals.externalAssetIds[0] ||
    signals.domains[0] ||
    signals.repositories[0] ||
    signals.socialAccounts[0] ||
    signals.aliases.join(":") ||
    "unknown";

  return {
    symbolIdentityId: hashNamespace("cli_symbol", [canonicalSymbol]),
    chainSymbolIdentityId: hashNamespace("cli_chain_symbol", [chain, canonicalSymbol]),
    symbolInstanceId: hashNamespace("cli_symbol_instance", [chain, canonicalSymbol, strongestProjectAnchor]),
    canonicalSymbol,
    normalizedSymbol: canonicalSymbol.toLowerCase(),
    chain,
    projectAnchor: strongestProjectAnchor,
    collisionScope: "symbol",
    chainCollisionScope: "chain-symbol",
    instanceScope: "project-symbol-instance",
  };
}

export function projectIdentitySignals(project = {}) {
  const chain = normalizeChainId(project.chain || project.chainId) || "unknown";
  const tokenContracts = [
    project.address,
    project.tokenAddress,
    project.contractAddress,
    project.baseToken?.address,
  ].map((value) => normalizeTokenAddress(value, chain)).filter(Boolean);
  const poolAddresses = [
    project.pairAddress,
    project.poolAddress,
    project.pair?.address,
  ].map((value) => normalizePoolAddress(value, chain)).filter(Boolean);
  const websites = [
    project.website,
    project.url,
    project.projectUrl,
    project.links?.website,
  ].filter(Boolean);
  const domains = websites.map(domainFrom).filter(Boolean);
  const repositories = [
    project.github,
    project.githubUrl,
    project.repository,
    ...(Array.isArray(project.repositories) ? project.repositories : []),
  ].map(clean).filter(Boolean);
  const exchangeAssetIds = [
    project.verifiedExchangeAssetId,
    project.exchangeAssetId,
    project.coinbaseAssetId,
    project.binanceAssetId,
    project.krakenAssetId,
    project.listingAssetId,
    project.assetKey,
    project.providerExchangeAssetId,
    ...(Array.isArray(project.exchangeAssetIds) ? project.exchangeAssetIds : []),
  ].map(clean).filter(Boolean);
  const externalAssetIds = [
    project.verifiedCoinGeckoId ? namespaceId("coingecko", project.verifiedCoinGeckoId) : null,
    project.coinGeckoId ? namespaceId("coingecko", project.coinGeckoId) : null,
    project.coingeckoId ? namespaceId("coingecko", project.coingeckoId) : null,
    project.verifiedCoinMarketCapId ? namespaceId("coinmarketcap", project.verifiedCoinMarketCapId) : null,
    project.coinMarketCapId ? namespaceId("coinmarketcap", project.coinMarketCapId) : null,
    project.cmcId ? namespaceId("coinmarketcap", project.cmcId) : null,
    project.coinPaprikaId ? namespaceId("coinpaprika", project.coinPaprikaId) : null,
    project.assetId,
    project.providerProjectId,
    project.providerAssetId ? namespaceId(project.source || project.provider || project.exchange, project.providerAssetId) : null,
  ].map(clean).filter(Boolean);
  const marketKeys = [
    project.marketKey,
    project.marketPair && project.exchange ? namespaceId(project.exchange, project.marketPair) : null,
    ...(Array.isArray(project.exchangeMarkets) ? project.exchangeMarkets.map(flattenMarket) : []),
  ].map((value) => {
    const text = clean(value);
    return text && text.includes(":") ? text : namespaceId(project.source || project.exchange || "market", text);
  }).filter(Boolean);
  const socialAccounts = [
    project.x,
    project.twitter,
    project.telegram,
    project.discord,
  ].map(clean).filter(Boolean);
  const deployerWallets = [
    project.deployer,
    project.deployerAddress,
    project.creatorAddress,
  ].map((value) => normalizeWalletAddress(value, chain)).filter(Boolean);
  const aliases = [
    project.name,
    project.symbol,
    ...(Array.isArray(project.aliases) ? project.aliases : []),
  ].map(clean).filter(Boolean);

  return {
    chain,
    aliases: [...new Set(aliases)],
    websites: [...new Set(websites)],
    domains: [...new Set(domains)],
    repositories: [...new Set(repositories)],
    exchangeAssetIds: [...new Set(exchangeAssetIds)],
    externalAssetIds: [...new Set(externalAssetIds)],
    marketKeys: [...new Set(marketKeys)],
    socialAccounts: [...new Set(socialAccounts)],
    tokenContracts: [...new Set(tokenContracts)],
    poolAddresses: [...new Set(poolAddresses)],
    deployerWallets: [...new Set(deployerWallets)],
  };
}

export function identityKeyForProject(project = {}) {
  const signals = projectIdentitySignals(project);

  if (signals.tokenContracts[0]) return `${signals.chain}:token:${signals.tokenContracts[0]}`;
  if (signals.poolAddresses[0]) return `${signals.chain}:pool:${signals.poolAddresses[0]}`;
  if (signals.exchangeAssetIds[0]) return `exchange:${signals.exchangeAssetIds[0]}`;
  if (signals.marketKeys[0]) return `market:${signals.marketKeys[0]}`;
  if (signals.externalAssetIds[0]) return `asset:${signals.externalAssetIds[0]}`;
  if (signals.domains[0]) return `${signals.chain}:domain:${signals.domains[0]}`;
  if (signals.repositories[0]) return `repo:${signals.repositories[0]}`;
  if (signals.socialAccounts[0]) return `social:${signals.socialAccounts[0]}`;

  return `${signals.chain}:alias:${signals.aliases.join(":") || "unknown"}`;
}

export function attachProjectIdentity(project = {}) {
  const signals = projectIdentitySignals(project);
  const symbolIdentity = project.symbolIdentity || symbolIdentityForProject(project);
  const projectId = project.projectId || hashId([
    signals.tokenContracts[0],
    signals.poolAddresses[0],
    signals.exchangeAssetIds[0],
    signals.marketKeys[0],
    signals.externalAssetIds[0],
    signals.domains[0],
    signals.repositories[0],
    signals.socialAccounts[0],
    signals.chain,
    signals.aliases[0],
  ]);

  return {
    ...project,
    projectId,
    symbolIdentity,
    symbolIdentityId: symbolIdentity.symbolIdentityId,
    chainSymbolIdentityId: symbolIdentity.chainSymbolIdentityId,
    symbolInstanceId: symbolIdentity.symbolInstanceId,
    projectIdentity: {
      projectId,
      canonicalName: project.name || project.symbol || "Unknown",
      symbolIdentity,
      symbolIdentityId: symbolIdentity.symbolIdentityId,
      chainSymbolIdentityId: symbolIdentity.chainSymbolIdentityId,
      symbolInstanceId: symbolIdentity.symbolInstanceId,
      ...signals,
      evidence: [
        ...(symbolIdentity.canonicalSymbol !== "UNKNOWN" ? ["symbol"] : []),
        ...(signals.tokenContracts.length ? ["contract"] : []),
        ...(signals.poolAddresses.length ? ["pool"] : []),
        ...(signals.exchangeAssetIds.length ? ["exchangeAssetId"] : []),
        ...(signals.marketKeys.length ? ["marketKey"] : []),
        ...(signals.externalAssetIds.length ? ["externalAssetId"] : []),
        ...(signals.domains.length ? ["domain"] : []),
        ...(signals.repositories.length ? ["repository"] : []),
        ...(signals.socialAccounts.length ? ["social"] : []),
        ...(signals.deployerWallets.length ? ["deployer"] : []),
      ],
    },
  };
}

export function buildProjectIdentityGraph(projects = []) {
  const nodes = [];
  const edges = [];

  for (const project of Array.isArray(projects) ? projects : []) {
    const enriched = attachProjectIdentity(project);
    nodes.push({
      projectId: enriched.projectId,
      name: enriched.name || "Unknown",
      symbol: enriched.symbol || "UNKNOWN",
      symbolIdentityId: enriched.symbolIdentityId,
      chainSymbolIdentityId: enriched.chainSymbolIdentityId,
      symbolInstanceId: enriched.symbolInstanceId,
      identityEvidence: enriched.projectIdentity.evidence,
    });

    if (enriched.symbolIdentity?.canonicalSymbol) {
      edges.push({
        projectId: enriched.projectId,
        type: "symbolIdentity",
        value: enriched.symbolIdentity.symbolIdentityId,
        symbol: enriched.symbolIdentity.canonicalSymbol,
        confidence: enriched.symbolIdentity.canonicalSymbol === "UNKNOWN" ? 0.2 : 0.72,
      });
      edges.push({
        projectId: enriched.projectId,
        type: "chainSymbolIdentity",
        value: enriched.symbolIdentity.chainSymbolIdentityId,
        symbol: enriched.symbolIdentity.canonicalSymbol,
        chain: enriched.symbolIdentity.chain,
        confidence: enriched.symbolIdentity.canonicalSymbol === "UNKNOWN" ? 0.2 : 0.8,
      });
      edges.push({
        projectId: enriched.projectId,
        type: "symbolInstance",
        value: enriched.symbolIdentity.symbolInstanceId,
        symbol: enriched.symbolIdentity.canonicalSymbol,
        chain: enriched.symbolIdentity.chain,
        confidence: 0.86,
      });
    }

    for (const contract of enriched.projectIdentity.tokenContracts) {
      edges.push({ projectId: enriched.projectId, type: "tokenContract", value: contract, confidence: 1 });
    }
    for (const domain of enriched.projectIdentity.domains) {
      edges.push({ projectId: enriched.projectId, type: "domain", value: domain, confidence: 0.82 });
    }
    for (const assetId of enriched.projectIdentity.exchangeAssetIds || []) {
      edges.push({ projectId: enriched.projectId, type: "exchangeAssetId", value: assetId, confidence: 0.9 });
    }
    for (const marketKey of enriched.projectIdentity.marketKeys || []) {
      edges.push({ projectId: enriched.projectId, type: "marketKey", value: marketKey, confidence: 0.88 });
    }
    for (const assetId of enriched.projectIdentity.externalAssetIds || []) {
      edges.push({ projectId: enriched.projectId, type: "externalAssetId", value: assetId, confidence: 0.86 });
    }
    for (const repository of enriched.projectIdentity.repositories) {
      edges.push({ projectId: enriched.projectId, type: "repository", value: repository, confidence: 0.78 });
    }
    for (const deployer of enriched.projectIdentity.deployerWallets) {
      edges.push({ projectId: enriched.projectId, type: "deployer", value: deployer, confidence: 0.74 });
    }
  }

  return {
    nodes,
    edges,
    weakIdentityCount: nodes.filter((node) => node.identityEvidence.length <= 1).length,
  };
}
