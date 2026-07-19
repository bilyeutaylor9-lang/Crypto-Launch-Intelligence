// src/data/fallbackResearchSeedConnector.js

const RESEARCH_SEEDS = [
  {
    name: "Bittensor",
    symbol: "TAO",
    chain: "bittensor",
    category: "ai compute subnet",
    description: "AI decentralized compute inference subnet ecosystem staking validators emissions agents",
  },
  {
    name: "Render",
    symbol: "RNDR",
    chain: "solana",
    category: "ai depin gpu",
    description: "DePIN GPU rendering AI compute network creator economy Solana migration",
  },
  {
    name: "Akash Network",
    symbol: "AKT",
    chain: "cosmos",
    category: "depin compute",
    description: "DePIN decentralized cloud compute GPU marketplace AI infrastructure staking validators",
  },
  {
    name: "Ondo",
    symbol: "ONDO",
    chain: "ethereum",
    category: "rwa tokenized treasury",
    description: "RWA tokenized treasury real world asset institutional yield credit settlement",
  },
  {
    name: "Pendle",
    symbol: "PENDLE",
    chain: "ethereum",
    category: "yield restaking",
    description: "yield trading restaking liquid restaking LRT points staking rewards DeFi",
  },
  {
    name: "EigenLayer",
    symbol: "EIGEN",
    chain: "ethereum",
    category: "restaking avs",
    description: "restaking AVS shared security staking rewards validator delegation mainnet ecosystem",
  },
  {
    name: "Celestia",
    symbol: "TIA",
    chain: "celestia",
    category: "modular data availability",
    description: "modular blockchain data availability rollup appchain staking validators ecosystem",
  },
  {
    name: "Jupiter",
    symbol: "JUP",
    chain: "solana",
    category: "dex launchpad",
    description: "Solana DEX aggregator launchpad LFG token launch trading perps ecosystem",
  },
  {
    name: "Ethena",
    symbol: "ENA",
    chain: "ethereum",
    category: "stablecoin yield",
    description: "synthetic dollar stablecoin payments settlement yield staking rewards DeFi",
  },
  {
    name: "Aerodrome",
    symbol: "AERO",
    chain: "base",
    category: "base dex",
    description: "Base ecosystem DEX liquidity flywheel ve token staking rewards governance",
  },
  {
    name: "Virtuals Protocol",
    symbol: "VIRTUAL",
    chain: "base",
    category: "ai agents launchpad",
    description: "AI agents launchpad tokenized agents Base ecosystem agent economy",
  },
  {
    name: "Aethir",
    symbol: "ATH",
    chain: "ethereum",
    category: "depin gpu ai",
    description: "DePIN GPU cloud compute AI gaming node network staking rewards",
  },
  {
    name: "Pyth Network",
    symbol: "PYTH",
    chain: "solana",
    category: "oracle infra",
    description: "oracle infrastructure Solana ecosystem data feeds DeFi perps trading",
  },
  {
    name: "Wormhole",
    symbol: "W",
    chain: "solana",
    category: "cross chain infra",
    description: "cross-chain messaging interoperability bridge modular ecosystem staking governance",
  },
  {
    name: "Manta Network",
    symbol: "MANTA",
    chain: "manta",
    category: "zk modular",
    description: "ZK modular privacy zero knowledge identity rollup ecosystem staking",
  },
  {
    name: "LayerZero",
    symbol: "ZRO",
    chain: "omnichain",
    category: "cross chain launch",
    description: "omnichain messaging interoperability airdrop TGE token launch ecosystem",
  },
  {
    name: "Berachain",
    symbol: "BERA",
    chain: "berachain",
    category: "upcoming launch",
    description: "upcoming mainnet TGE airdrop testnet staking validators DeFi ecosystem launch",
  },
  {
    name: "Monad",
    symbol: "MONAD",
    chain: "monad",
    category: "upcoming l1",
    description: "upcoming mainnet testnet high performance EVM airdrop ecosystem launch",
  },
  {
    name: "MegaETH",
    symbol: "MEGA",
    chain: "ethereum",
    category: "upcoming l2",
    description: "upcoming launch real-time Ethereum L2 testnet airdrop modular rollup",
  },
  {
    name: "Eclipse",
    symbol: "ES",
    chain: "ethereum",
    category: "modular launch",
    description: "SVM Ethereum L2 modular rollup mainnet launch airdrop ecosystem",
  },
];

function seedToCandidate(seed = {}, index = 0) {
  return {
    ...seed,
    address: null,
    pairAddress: null,
    dex: "research-seed",
    url: null,
    priceUsd: null,
    liquidityUsd: null,
    volume24h: null,
    marketCap: null,
    fdv: null,
    priceChange24h: null,
    source: "research-seed",
    discoverySources: ["research-seed"],
    researchOnly: true,
    tradableCandidate: false,
    researchSeed: true,
    discoveredAt: new Date().toISOString(),
  };
}

export function getFallbackResearchSeedCandidates(options = {}) {
  const limit = Number(options.limit || process.env.RESEARCH_SEED_LIMIT || RESEARCH_SEEDS.length);

  return RESEARCH_SEEDS.slice(0, limit).map(seedToCandidate);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(getFallbackResearchSeedCandidates(), null, 2));
}
