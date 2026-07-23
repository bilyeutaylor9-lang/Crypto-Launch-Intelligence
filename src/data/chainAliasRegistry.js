export const CHAIN_DEFINITIONS = Object.freeze([
  {
    canonical: "ethereum",
    chainId: 1,
    kind: "evm",
    name: "Ethereum",
    aliases: ["eth", "ether", "ethereum-chain", "ethereum-network", "ethereum-mainnet", "eth-mainnet", "ethereum-l1", "eth-l1", "erc20", "erc-20", "coingecko-ethereum"],
  },
  {
    canonical: "base",
    chainId: 8453,
    kind: "evm",
    name: "Base",
    aliases: ["base-chain", "base-network", "base-mainnet", "base-l2", "coinbase-base", "coinbase-l2", "coinbase-layer-2", "coinbase-layer2", "base-ethereum"],
  },
  {
    canonical: "bsc",
    chainId: 56,
    kind: "evm",
    name: "BNB Smart Chain",
    aliases: ["bnb", "bnb-chain", "bnbchain", "bnb-smart-chain", "bnb-smartchain", "binance-smart-chain", "binance-smartchain", "smart-chain", "bep20", "bep-20", "bsc-mainnet"],
  },
  {
    canonical: "arbitrum",
    chainId: 42161,
    kind: "evm",
    name: "Arbitrum One",
    aliases: ["arb", "arbitrum-one", "arbitrum-one-mainnet", "arb-one", "arb1", "arbitrum-mainnet", "arbitrum-l2", "arbitrum-ethereum"],
  },
  {
    canonical: "polygon",
    chainId: 137,
    kind: "evm",
    name: "Polygon PoS",
    aliases: ["matic", "polygon-pos", "polygon-pos-chain", "polygon-mainnet", "matic-mainnet", "polygon-chain", "polygon-network", "polygon-ethereum"],
  },
  {
    canonical: "optimism",
    chainId: 10,
    kind: "evm",
    name: "Optimism",
    aliases: ["op", "optimistic-ethereum", "optimism-mainnet", "op-mainnet", "optimism-l2", "op-stack-optimism", "optimism-ethereum"],
  },
  {
    canonical: "avalanche",
    chainId: 43114,
    kind: "evm",
    name: "Avalanche C-Chain",
    aliases: ["avax", "avalanche-c", "avalanche-c-chain", "avalanche-cchain", "avax-c", "avax-c-chain", "c-chain", "avalanche-mainnet"],
  },
  {
    canonical: "solana",
    chainId: 101,
    kind: "solana",
    name: "Solana",
    aliases: ["101", "sol", "solana-chain", "solana-network", "solana-mainnet", "solana-mainnet-beta", "mainnet-beta", "solana-l1", "spl", "spl-token", "solana:mainnet"],
  },
  {
    canonical: "sui",
    chainId: "sui",
    kind: "sui",
    name: "Sui",
    aliases: ["sui-chain", "sui-network", "sui-mainnet", "sui-l1", "sui:mainnet"],
  },
  {
    canonical: "ton",
    chainId: "ton",
    kind: "ton",
    name: "The Open Network",
    aliases: ["ton-chain", "ton-network", "ton-mainnet", "toncoin", "toncoin-network", "the-open-network", "open-network", "ton:mainnet"],
  },
  {
    canonical: "cosmos",
    chainId: "cosmoshub-4",
    kind: "cosmos",
    name: "Cosmos Hub",
    aliases: ["cosmos-hub", "cosmoshub", "cosmoshub-4", "cosmos-mainnet", "cosmos-network", "cosmos-sdk", "cosmos:cosmoshub-4"],
  },
  {
    canonical: "osmosis",
    chainId: "osmosis-1",
    kind: "cosmos",
    name: "Osmosis",
    aliases: ["osmo", "osmosis-chain", "osmosis-network", "osmosis-mainnet", "osmosis-1", "cosmos:osmosis-1"],
  },
  {
    canonical: "aptos",
    chainId: "aptos",
    kind: "aptos",
    name: "Aptos",
    aliases: ["apt", "aptos-chain", "aptos-network", "aptos-mainnet", "aptos-l1", "aptos:1"],
  },
  {
    canonical: "sei",
    chainId: "sei",
    kind: "cosmos",
    name: "Sei",
    aliases: ["sei-chain", "sei-network", "sei-mainnet", "sei-v2", "pacific-1", "cosmos:pacific-1"],
  },
  {
    canonical: "tron",
    chainId: "tron",
    kind: "tron",
    name: "Tron",
    aliases: ["tron-chain", "tron-network", "tron-mainnet", "trx", "trc20", "trc-20"],
  },
  {
    canonical: "near",
    chainId: "near",
    kind: "near",
    name: "NEAR Protocol",
    aliases: ["near-chain", "near-network", "near-mainnet", "near-protocol", "near-l1", "near:mainnet"],
  },
  {
    canonical: "fantom",
    chainId: 250,
    kind: "evm",
    name: "Fantom Opera",
    aliases: ["ftm", "fantom-chain", "fantom-opera", "fantom-mainnet", "opera", "opera-mainnet"],
  },
  {
    canonical: "linea",
    chainId: 59144,
    kind: "evm",
    name: "Linea",
    aliases: ["linea-chain", "linea-network", "linea-mainnet", "linea-l2", "consensys-linea"],
  },
  {
    canonical: "scroll",
    chainId: 534352,
    kind: "evm",
    name: "Scroll",
    aliases: ["scroll-chain", "scroll-network", "scroll-mainnet", "scroll-l2", "scroll-ethereum"],
  },
  {
    canonical: "zksync",
    chainId: 324,
    kind: "evm",
    name: "zkSync Era",
    aliases: ["zk-sync", "zksync-era", "zk-sync-era", "zksync-mainnet", "zksync-era-mainnet", "zksync-l2", "matter-labs-zksync"],
  },
  {
    canonical: "mantle",
    chainId: 5000,
    kind: "evm",
    name: "Mantle",
    aliases: ["mantle-chain", "mantle-network", "mantle-mainnet", "mantle-l2"],
  },
  {
    canonical: "blast",
    chainId: 81457,
    kind: "evm",
    name: "Blast",
    aliases: ["blast-chain", "blast-network", "blast-mainnet", "blast-l2", "blast-ethereum"],
  },
  {
    canonical: "ronin",
    chainId: 2020,
    kind: "evm",
    name: "Ronin",
    aliases: ["ronin-chain", "ronin-network", "ronin-mainnet", "ronin-evm"],
  },
  {
    canonical: "mode",
    chainId: 34443,
    kind: "evm",
    name: "Mode",
    aliases: ["mode-chain", "mode-network", "mode-mainnet", "mode-l2", "mode-ethereum"],
  },
  {
    canonical: "berachain",
    chainId: 80094,
    kind: "evm",
    name: "Berachain",
    aliases: ["bera", "bera-chain", "berachain-network", "berachain-mainnet", "berachain-evm"],
  },
  {
    canonical: "sonic",
    chainId: 146,
    kind: "evm",
    name: "Sonic",
    aliases: ["sonic-chain", "sonic-network", "sonic-mainnet", "sonic-evm", "fantom-sonic", "sonic-labs"],
  },
  {
    canonical: "hyperliquid",
    chainId: "hyperliquid",
    kind: "hyperliquid",
    name: "Hyperliquid",
    aliases: ["hyper-liquid", "hyperliquid-l1", "hyperliquid-chain", "hyperliquid-network", "hypercore", "hyper-core"],
  },
  {
    canonical: "robinhood-chain",
    chainId: "robinhood-chain",
    kind: "evm",
    name: "Robinhood Chain",
    aliases: ["robinhood", "robinhoodchain", "robinhood-l2", "robinhood-layer-2", "robinhood-layer2", "rhchain", "rh-chain", "hood-chain", "hoodchain"],
  },
]);

export function normalizeChainAliasKey(value = "") {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[:/_.\s]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildSupportedRegistry() {
  return Object.fromEntries(
    CHAIN_DEFINITIONS.map((definition) => [
      definition.canonical,
      {
        chainId: definition.chainId,
        kind: definition.kind,
        name: definition.name,
      },
    ])
  );
}

function aliasesForDefinition(definition = {}) {
  const aliases = new Set([definition.canonical, definition.name, ...(definition.aliases || [])]);

  if (definition.kind === "evm" && Number.isInteger(definition.chainId)) {
    const decimal = String(definition.chainId);
    const hexadecimal = `0x${definition.chainId.toString(16)}`;
    aliases.add(decimal);
    aliases.add(hexadecimal);
    aliases.add(`eip155:${decimal}`);
    aliases.add(`eip155-${decimal}`);
    aliases.add(`chain-${decimal}`);
    aliases.add(`chainid-${decimal}`);
    aliases.add(`chain-id-${decimal}`);
  }

  return [...aliases];
}

function buildAliasRegistry() {
  const registry = {};
  const collisions = [];

  for (const definition of CHAIN_DEFINITIONS) {
    for (const rawAlias of aliasesForDefinition(definition)) {
      const alias = normalizeChainAliasKey(rawAlias);
      if (!alias) continue;
      if (registry[alias] && registry[alias] !== definition.canonical) {
        collisions.push({
          alias,
          existingCanonical: registry[alias],
          attemptedCanonical: definition.canonical,
        });
        continue;
      }
      registry[alias] = definition.canonical;
    }
  }

  if (collisions.length) {
    const details = collisions
      .map((collision) => `${collision.alias}: ${collision.existingCanonical} vs ${collision.attemptedCanonical}`)
      .join(", ");
    throw new Error(`Chain alias collisions detected: ${details}`);
  }

  return registry;
}

export const SUPPORTED_CHAIN_REGISTRY = Object.freeze(buildSupportedRegistry());
export const CHAIN_ALIASES = Object.freeze(buildAliasRegistry());
export const CHAIN_ALIAS_GROUPS = Object.freeze(
  Object.fromEntries(
    CHAIN_DEFINITIONS.map((definition) => [
      definition.canonical,
      Object.freeze(aliasesForDefinition(definition)),
    ])
  )
);

export function canonicalChainForAlias(value = "") {
  return CHAIN_ALIASES[normalizeChainAliasKey(value)] || null;
}
