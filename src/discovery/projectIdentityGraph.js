import crypto from "crypto";

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

export function projectIdentitySignals(project = {}) {
  const chain = clean(project.chain || project.chainId || "unknown");
  const tokenContracts = [
    project.address,
    project.tokenAddress,
    project.contractAddress,
    project.baseToken?.address,
  ].map(clean).filter(Boolean);
  const poolAddresses = [
    project.pairAddress,
    project.poolAddress,
    project.pair?.address,
  ].map(clean).filter(Boolean);
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
  ].map(clean).filter(Boolean);
  const externalAssetIds = [
    project.verifiedCoinGeckoId,
    project.coinGeckoId,
    project.coingeckoId,
    project.verifiedCoinMarketCapId,
    project.coinMarketCapId,
    project.cmcId,
    project.assetId,
  ].map(clean).filter(Boolean);
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
  ].map(clean).filter(Boolean);
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
  if (signals.externalAssetIds[0]) return `asset:${signals.externalAssetIds[0]}`;
  if (signals.domains[0]) return `${signals.chain}:domain:${signals.domains[0]}`;
  if (signals.repositories[0]) return `repo:${signals.repositories[0]}`;
  if (signals.socialAccounts[0]) return `social:${signals.socialAccounts[0]}`;

  return `${signals.chain}:alias:${signals.aliases.join(":") || "unknown"}`;
}

export function attachProjectIdentity(project = {}) {
  const signals = projectIdentitySignals(project);
  const projectId = project.projectId || hashId([
    signals.tokenContracts[0],
    signals.poolAddresses[0],
    signals.exchangeAssetIds[0],
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
    projectIdentity: {
      projectId,
      canonicalName: project.name || project.symbol || "Unknown",
      ...signals,
      evidence: [
        ...(signals.tokenContracts.length ? ["contract"] : []),
        ...(signals.poolAddresses.length ? ["pool"] : []),
        ...(signals.exchangeAssetIds.length ? ["exchangeAssetId"] : []),
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
      identityEvidence: enriched.projectIdentity.evidence,
    });

    for (const contract of enriched.projectIdentity.tokenContracts) {
      edges.push({ projectId: enriched.projectId, type: "tokenContract", value: contract, confidence: 1 });
    }
    for (const domain of enriched.projectIdentity.domains) {
      edges.push({ projectId: enriched.projectId, type: "domain", value: domain, confidence: 0.82 });
    }
    for (const assetId of enriched.projectIdentity.exchangeAssetIds || []) {
      edges.push({ projectId: enriched.projectId, type: "exchangeAssetId", value: assetId, confidence: 0.9 });
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
