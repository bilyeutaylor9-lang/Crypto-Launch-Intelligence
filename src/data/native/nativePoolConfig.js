export const NATIVE_PROTOCOLS = [
  {
    id: "base-aerodrome-v2",
    chain: "base",
    chainId: 8453,
    family: "evm-factory",
    protocol: "aerodrome",
    protocolVersion: "volatile-stable-v2",
    factoryEnv: "BASE_AERODROME_FACTORY",
    eventKinds: ["POOL_CREATED", "FIRST_LIQUIDITY_ADDED", "FIRST_SWAP"],
    priority: 100,
  },
  {
    id: "base-aerodrome-slipstream",
    chain: "base",
    chainId: 8453,
    family: "evm-factory",
    protocol: "aerodrome-slipstream",
    protocolVersion: "cl",
    factoryEnv: "BASE_AERODROME_SLIPSTREAM_FACTORY",
    eventKinds: ["POOL_CREATED", "POOL_INITIALIZED", "FIRST_LIQUIDITY_ADDED", "FIRST_SWAP"],
    priority: 100,
  },
  {
    id: "base-uniswap-v3",
    chain: "base",
    chainId: 8453,
    family: "evm-factory",
    protocol: "uniswap-v3",
    protocolVersion: "v3",
    factoryEnv: "BASE_UNISWAP_V3_FACTORY",
    eventKinds: ["POOL_CREATED", "POOL_INITIALIZED", "FIRST_SWAP"],
    priority: 94,
  },
  {
    id: "base-uniswap-v4",
    chain: "base",
    chainId: 8453,
    family: "evm-factory",
    protocol: "uniswap-v4",
    protocolVersion: "v4",
    factoryEnv: "BASE_UNISWAP_V4_POOL_MANAGER",
    eventKinds: ["POOL_INITIALIZED", "FIRST_SWAP"],
    priority: 88,
  },
  {
    id: "solana-pump-migrations",
    chain: "solana",
    family: "solana-program",
    protocol: "pump-fun",
    protocolVersion: "migration",
    programEnv: "SOLANA_PUMP_FUN_PROGRAM",
    eventKinds: ["TOKEN_DEPLOYED", "FIRST_EXTERNAL_BUYER", "POOL_CREATED", "FIRST_SWAP"],
    priority: 100,
  },
  {
    id: "solana-raydium-launchlab",
    chain: "solana",
    family: "solana-program",
    protocol: "raydium-launchlab",
    protocolVersion: "launchlab",
    programEnv: "SOLANA_RAYDIUM_LAUNCHLAB_PROGRAM",
    eventKinds: ["TOKEN_DEPLOYED", "FIRST_LIQUIDITY_ADDED", "POOL_CREATED"],
    priority: 96,
  },
  {
    id: "solana-raydium-cpmm",
    chain: "solana",
    family: "solana-program",
    protocol: "raydium-cpmm",
    protocolVersion: "cpmm",
    programEnv: "SOLANA_RAYDIUM_CPMM_PROGRAM",
    eventKinds: ["POOL_CREATED", "FIRST_LIQUIDITY_ADDED", "FIRST_SWAP"],
    priority: 94,
  },
  {
    id: "solana-raydium-clmm",
    chain: "solana",
    family: "solana-program",
    protocol: "raydium-clmm",
    protocolVersion: "clmm",
    programEnv: "SOLANA_RAYDIUM_CLMM_PROGRAM",
    eventKinds: ["POOL_CREATED", "POOL_INITIALIZED", "FIRST_SWAP"],
    priority: 92,
  },
  {
    id: "solana-meteora-dbc",
    chain: "solana",
    family: "solana-program",
    protocol: "meteora-dbc",
    protocolVersion: "dbc",
    programEnv: "SOLANA_METEORA_DBC_PROGRAM",
    eventKinds: ["TOKEN_DEPLOYED", "FIRST_EXTERNAL_BUYER", "POOL_CREATED"],
    priority: 92,
  },
  {
    id: "solana-meteora-dlmm",
    chain: "solana",
    family: "solana-program",
    protocol: "meteora-dlmm",
    protocolVersion: "dlmm",
    programEnv: "SOLANA_METEORA_DLMM_PROGRAM",
    eventKinds: ["POOL_CREATED", "FIRST_LIQUIDITY_ADDED", "FIRST_SWAP"],
    priority: 88,
  },
  {
    id: "bnb-pancakeswap-v2",
    chain: "bsc",
    chainId: 56,
    family: "evm-factory",
    protocol: "pancakeswap-v2",
    protocolVersion: "v2",
    factoryEnv: "BSC_PANCAKESWAP_V2_FACTORY",
    eventKinds: ["POOL_CREATED", "FIRST_LIQUIDITY_ADDED", "FIRST_SWAP"],
    priority: 86,
  },
  {
    id: "bnb-pancakeswap-v3",
    chain: "bsc",
    chainId: 56,
    family: "evm-factory",
    protocol: "pancakeswap-v3",
    protocolVersion: "v3",
    factoryEnv: "BSC_PANCAKESWAP_V3_FACTORY",
    eventKinds: ["POOL_CREATED", "POOL_INITIALIZED", "FIRST_SWAP"],
    priority: 86,
  },
  {
    id: "polygon-quickswap-algebra",
    chain: "polygon",
    chainId: 137,
    family: "evm-factory",
    protocol: "quickswap-algebra",
    protocolVersion: "algebra",
    factoryEnv: "POLYGON_QUICKSWAP_ALGEBRA_FACTORY",
    eventKinds: ["POOL_CREATED", "POOL_INITIALIZED", "FIRST_SWAP"],
    priority: 82,
  },
  {
    id: "arbitrum-camelot",
    chain: "arbitrum",
    chainId: 42161,
    family: "evm-factory",
    protocol: "camelot",
    protocolVersion: "factory",
    factoryEnv: "ARBITRUM_CAMELOT_FACTORY",
    eventKinds: ["POOL_CREATED", "FIRST_LIQUIDITY_ADDED", "FIRST_SWAP"],
    priority: 78,
  },
  {
    id: "evm-contract-deployments",
    chain: "multi-evm",
    family: "evm-deployment",
    protocol: "contract-deployment-radar",
    protocolVersion: "erc20-classifier",
    rpcEnv: "EVM_DEPLOYMENT_RADAR_RPC_URL",
    eventKinds: ["TOKEN_DEPLOYED"],
    priority: 90,
  },
];

export function getNativeProtocolConfigs(options = {}) {
  const enabledChains = new Set(
    String(options.chains || process.env.NATIVE_DISCOVERY_CHAINS || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );

  return NATIVE_PROTOCOLS
    .filter((config) => !enabledChains.size || enabledChains.has(config.chain))
    .map((config) => ({
      ...config,
      factoryAddress: config.factoryEnv ? process.env[config.factoryEnv] || null : null,
      programId: config.programEnv ? process.env[config.programEnv] || null : null,
      rpcUrl: config.rpcEnv ? process.env[config.rpcEnv] || null : null,
      configured: Boolean(
        (config.factoryEnv && process.env[config.factoryEnv]) ||
          (config.programEnv && process.env[config.programEnv]) ||
          (config.rpcEnv && process.env[config.rpcEnv])
      ),
    }))
    .sort((a, b) => b.priority - a.priority);
}

export function getConfiguredNativeProtocols(options = {}) {
  return getNativeProtocolConfigs(options).filter((config) => config.configured);
}

export function summarizeNativeProtocolCoverage(options = {}) {
  const protocols = getNativeProtocolConfigs(options);
  const configured = protocols.filter((protocol) => protocol.configured);
  const byChain = protocols.reduce((acc, protocol) => {
    acc[protocol.chain] = acc[protocol.chain] || { total: 0, configured: 0, protocols: [] };
    acc[protocol.chain].total += 1;
    acc[protocol.chain].configured += protocol.configured ? 1 : 0;
    acc[protocol.chain].protocols.push(protocol.id);
    return acc;
  }, {});

  return {
    totalProtocols: protocols.length,
    configuredProtocols: configured.length,
    unconfiguredProtocols: protocols.length - configured.length,
    byChain,
    requiredEnvironmentVariables: protocols
      .map((protocol) => protocol.factoryEnv || protocol.programEnv || protocol.rpcEnv)
      .filter(Boolean),
    protocols,
  };
}
