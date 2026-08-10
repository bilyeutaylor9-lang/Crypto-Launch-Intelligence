const NARRATIVE_RULES = [
  { id: "ai", terms: ["ai", "agent", "compute", "gpu", "inference", "model"] },
  { id: "depin", terms: ["depin", "physical", "gpu", "cloud", "compute", "wireless", "storage"] },
  { id: "rwa", terms: ["rwa", "treasury", "tokenized", "credit", "real world", "institutional"] },
  { id: "restaking", terms: ["restaking", "lrt", "avs", "staking", "validator", "shared security"] },
  { id: "modular", terms: ["modular", "data availability", "rollup", "appchain", "celestia"] },
  { id: "base", terms: ["base", "coinbase", "onchain summer"] },
  { id: "solana", terms: ["solana", "jupiter", "lfg", "launchpad", "saga"] },
  { id: "zk", terms: ["zk", "zero knowledge", "privacy", "proof"] },
  { id: "stablecoin", terms: ["stablecoin", "synthetic dollar", "payments", "settlement"] },
  { id: "perps", terms: ["perp", "perps", "derivatives", "futures", "trading"] },
  { id: "gaming", terms: ["gaming", "gamefi", "games", "metaverse"] },
  { id: "oracle", terms: ["oracle", "data feed", "price feed"] },
];

const RESCUE_CANDIDATES = [
  ["ai", "Virtuals Protocol", "VIRTUAL", "base", "AI agents launchpad tokenized agents Base ecosystem"],
  ["ai", "Bittensor", "TAO", "bittensor", "AI subnet decentralized inference compute staking"],
  ["ai", "Render", "RNDR", "solana", "GPU rendering AI compute DePIN Solana"],
  ["ai", "Aethir", "ATH", "ethereum", "DePIN GPU cloud compute AI node network"],
  ["ai", "Nosana", "NOS", "solana", "Solana GPU compute AI inference DePIN"],
  ["ai", "io.net", "IO", "solana", "DePIN GPU compute AI cloud Solana"],
  ["ai", "Autonolas", "OLAS", "ethereum", "autonomous agents AI services network"],
  ["depin", "Akash Network", "AKT", "cosmos", "decentralized cloud compute DePIN GPU staking"],
  ["depin", "Helium", "HNT", "solana", "wireless DePIN IoT mobile Solana"],
  ["depin", "Filecoin", "FIL", "filecoin", "storage DePIN data infrastructure"],
  ["depin", "Arweave", "AR", "arweave", "permanent storage data infrastructure"],
  ["depin", "Grass", "GRASS", "solana", "data network AI web scraping DePIN"],
  ["rwa", "Ondo", "ONDO", "ethereum", "RWA tokenized treasury institutional yield"],
  ["rwa", "Centrifuge", "CFG", "polkadot", "real world assets credit tokenized finance"],
  ["rwa", "Maple Finance", "MPL", "ethereum", "institutional credit lending RWA"],
  ["rwa", "Goldfinch", "GFI", "ethereum", "real world credit lending protocol"],
  ["rwa", "Clearpool", "CPOOL", "ethereum", "institutional credit RWA lending"],
  ["restaking", "EigenLayer", "EIGEN", "ethereum", "restaking AVS shared security validators"],
  ["restaking", "Ether.fi", "ETHFI", "ethereum", "liquid restaking LRT staking rewards"],
  ["restaking", "Renzo", "REZ", "ethereum", "liquid restaking AVS points"],
  ["restaking", "Puffer", "PUFFER", "ethereum", "liquid restaking validator infrastructure"],
  ["restaking", "Kelp DAO", "KELP", "ethereum", "LRT restaking Ethereum points"],
  ["modular", "Celestia", "TIA", "celestia", "modular data availability rollups staking"],
  ["modular", "Dymension", "DYM", "cosmos", "modular rollapp appchain ecosystem"],
  ["modular", "Avail", "AVAIL", "avail", "data availability modular blockchain"],
  ["modular", "AltLayer", "ALT", "ethereum", "rollup restaking modular infrastructure"],
  ["modular", "Sovereign Labs", "SOV", "modular", "modular rollup SDK appchain"],
  ["base", "Aerodrome", "AERO", "base", "Base DEX liquidity ve governance"],
  ["base", "Moonwell", "WELL", "base", "Base lending DeFi ecosystem"],
  ["base", "Seamless", "SEAM", "base", "Base lending DeFi protocol"],
  ["base", "Extra Finance", "EXTRA", "base", "Base leveraged yield DeFi"],
  ["solana", "Jupiter", "JUP", "solana", "Solana DEX aggregator launchpad perps"],
  ["solana", "Pyth Network", "PYTH", "solana", "oracle data feeds Solana DeFi"],
  ["solana", "Drift", "DRIFT", "solana", "Solana perps trading DEX"],
  ["solana", "Jito", "JTO", "solana", "Solana liquid staking MEV governance"],
  ["solana", "Kamino", "KMNO", "solana", "Solana lending liquidity vaults"],
  ["zk", "Manta Network", "MANTA", "manta", "ZK modular privacy ecosystem"],
  ["zk", "Starknet", "STRK", "starknet", "ZK rollup Ethereum scaling"],
  ["zk", "zkSync", "ZK", "ethereum", "ZK rollup Ethereum scaling"],
  ["zk", "Mina", "MINA", "mina", "zero knowledge lightweight blockchain"],
  ["stablecoin", "Ethena", "ENA", "ethereum", "synthetic dollar stablecoin yield"],
  ["stablecoin", "Frax", "FXS", "ethereum", "stablecoin DeFi frxUSD staking"],
  ["stablecoin", "Usual", "USUAL", "ethereum", "stablecoin RWA treasury protocol"],
  ["stablecoin", "Reserve", "RSR", "ethereum", "stablecoin basket collateral protocol"],
  ["perps", "Hyperliquid", "HYPE", "hyperliquid", "perps DEX trading L1"],
  ["perps", "GMX", "GMX", "arbitrum", "perps DEX liquidity Arbitrum"],
  ["perps", "dYdX", "DYDX", "cosmos", "perps DEX appchain"],
  ["perps", "Aevo", "AEVO", "ethereum", "options perps trading exchange"],
  ["gaming", "Immutable", "IMX", "ethereum", "gaming L2 NFT ecosystem"],
  ["gaming", "Ronin", "RON", "ronin", "gaming chain Axie ecosystem"],
  ["gaming", "Beam", "BEAM", "avalanche", "gaming network gamefi"],
  ["oracle", "Chainlink", "LINK", "ethereum", "oracle data feeds CCIP"],
  ["oracle", "API3", "API3", "ethereum", "oracle first-party data feeds"],
  ["oracle", "RedStone", "RED", "ethereum", "oracle data feeds modular"],
];

const DEGRADED_SOURCE_STATUSES = new Set([
  "FAILED",
  "AUTH_REQUIRED",
  "RATE_LIMITED",
  "REGION_BLOCKED",
  "TIMEOUT",
  "UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_RATE_LIMITED",
  "REGION_RESTRICTED",
]);

const MEME_TERMS = /\b(meme|memecoin|doge|pepe|shib|inu|mascot)\b/i;

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function textFor(project = {}) {
  return [
    project.name,
    project.symbol,
    project.chain,
    project.category,
    project.description,
    project.source,
    ...(project.discoverySources || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function detectNarratives(project = {}) {
  const text = textFor(project);

  return NARRATIVE_RULES.filter((rule) =>
    rule.terms.some((term) => text.includes(term))
  ).map((rule) => rule.id);
}

function rescueCandidate([narrative, name, symbol, chain, description], reason = "narrative expansion") {
  return {
    name,
    symbol,
    chain,
    category: narrative,
    description,
    address: null,
    pairAddress: null,
    dex: "candidate-rescue",
    url: null,
    priceUsd: null,
    liquidityUsd: null,
    volume24h: null,
    marketCap: null,
    fdv: null,
    priceChange24h: null,
    source: "candidate-rescue",
    discoverySources: ["candidate-rescue"],
    researchOnly: true,
    tradableCandidate: false,
    rescueCandidate: true,
    rescueReason: reason,
    discoveredAt: new Date().toISOString(),
  };
}

function buildClusters(projects = []) {
  const clusters = new Map();

  for (const project of projects) {
    const narratives = detectNarratives(project);
    const chain = String(project.chain || "unknown").toLowerCase();

    for (const narrative of narratives) {
      const key = `${narrative}:${chain}`;
      const current = clusters.get(key) || {
        key,
        narrative,
        chain,
        count: 0,
        liquidityUsd: 0,
        volume24h: 0,
        projects: [],
      };

      current.count += 1;
      current.liquidityUsd += num(project.liquidityUsd);
      current.volume24h += num(project.volume24h);
      current.projects.push({
        name: project.name,
        symbol: project.symbol,
        source: project.source,
      });
      clusters.set(key, current);
    }
  }

  return [...clusters.values()]
    .map((cluster) => ({
      ...cluster,
      score:
        cluster.count * 12 +
        Math.log10(Math.max(1, cluster.liquidityUsd)) * 8 +
        Math.log10(Math.max(1, cluster.volume24h)) * 7,
      projects: cluster.projects.slice(0, 8),
    }))
    .sort((a, b) => b.score - a.score);
}

function degradedSourceNames(sourceReports = {}) {
  return Object.entries(sourceReports)
    .filter(([, report]) => {
      const status = String(report?.status || report?.failureType || report?.successClass || "").toUpperCase();
      const errorText = String(report?.error || report?.reason || "").toLowerCase();
      return (
        DEGRADED_SOURCE_STATUSES.has(status) ||
        status.includes("AUTH") ||
        status.includes("RATE_LIMIT") ||
        status.includes("REGION") ||
        status.includes("TIMEOUT") ||
        status.includes("UNAVAILABLE") ||
        errorText.includes("auth") ||
        errorText.includes("rate limit") ||
        errorText.includes("region") ||
        errorText.includes("timeout") ||
        errorText.includes("unavailable")
      );
    })
    .map(([name, report]) => ({
      name,
      status: report?.status || report?.failureType || "DEGRADED",
    }));
}

function nonMemeRows(rows = []) {
  return rows.filter((row) => !MEME_TERMS.test(row.join(" ")));
}

export function buildCandidateRescueExpansion(projects = [], context = {}, options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const rescueThreshold = Number(
    options.rescueThreshold || process.env.CANDIDATE_RESCUE_THRESHOLD || 500
  );
  const rescueLimit = Number(
    options.rescueLimit || process.env.CANDIDATE_RESCUE_LIMIT || 250
  );
  const degradedSources = degradedSourceNames(context.sourceReports || {});
  const failedSources = degradedSources.map((source) => source.name);
  const targetCandidates = Number(
    options.targetCandidates ||
      context.targetCoverage?.targetCandidates ||
      process.env.DISCOVERY_TARGET_CANDIDATES ||
      0
  );
  const targetShortfall = Math.max(0, targetCandidates - safeProjects.length);
  const targetShortfallPct = targetCandidates > 0
    ? Math.round((targetShortfall / targetCandidates) * 10_000) / 100
    : 0;
  const rescueShortfallPct = Number(
    options.rescueShortfallPct ||
      process.env.CANDIDATE_RESCUE_SHORTFALL_PCT ||
      10
  );
  const clusters = buildClusters(safeProjects);
  const activeNarratives = new Set(clusters.map((cluster) => cluster.narrative));
  const shouldRescue =
    safeProjects.length < rescueThreshold ||
    targetShortfallPct >= rescueShortfallPct ||
    degradedSources.length > 0 ||
    clusters.length < 4;
  const reasons = [];

  if (safeProjects.length < rescueThreshold) {
    reasons.push(`candidate count ${safeProjects.length} below rescue threshold ${rescueThreshold}`);
  }
  if (targetShortfallPct >= rescueShortfallPct) {
    reasons.push(`discovery target shortfall ${targetShortfallPct}% exceeds rescue threshold ${rescueShortfallPct}%`);
  }
  if (degradedSources.length) {
    reasons.push(`degraded sources: ${degradedSources.map((source) => `${source.name}:${source.status}`).join(", ")}`);
  }
  if (clusters.length < 4) reasons.push(`only ${clusters.length} narrative/chain clusters detected`);

  if (!shouldRescue) {
    return {
      candidates: [],
      report: {
        status: "SKIPPED",
        reasons: ["candidate pool and cluster coverage were sufficient"],
        originalCount: safeProjects.length,
        expandedCount: safeProjects.length,
        addedCount: 0,
        targetCandidates,
        targetShortfall,
        targetShortfallPct,
        failedSources,
        degradedSources,
        clusters,
      },
    };
  }

  const eligibleRows = nonMemeRows(RESCUE_CANDIDATES);
  const narrativeExpansion = eligibleRows.filter(([narrative]) =>
    activeNarratives.size ? activeNarratives.has(narrative) : true
  ).map((row) => rescueCandidate(row, "matched active narrative cluster"));
  const broadBackfill = eligibleRows.map((row) =>
    rescueCandidate(row, "broad rescue backfill")
  );
  const candidates = [...narrativeExpansion, ...broadBackfill].slice(0, rescueLimit);
  const expandedClusters = buildClusters([...safeProjects, ...candidates]);

  return {
    candidates,
    report: {
      status: "USED",
      reasons,
      originalCount: safeProjects.length,
      expandedCount: safeProjects.length + candidates.length,
      addedCount: candidates.length,
      targetCandidates,
      targetShortfall,
      targetShortfallPct,
      failedSources,
      degradedSources,
      clusters,
      expandedClusters,
      topClusters: expandedClusters.slice(0, 12),
      topAdded: candidates.slice(0, 25).map((project) => ({
        name: project.name,
        symbol: project.symbol,
        chain: project.chain,
        category: project.category,
        reason: project.rescueReason,
      })),
    },
  };
}

export default {
  buildCandidateRescueExpansion,
};
