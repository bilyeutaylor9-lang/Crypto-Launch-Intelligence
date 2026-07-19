export const UNISWAP_V3_POOL_CREATED_TOPIC0 =
  "0x783cca1c0412dd0d695e784568c98b25e9f8e00ae1352967ec6f45493ed1c2c";

export const UNISWAP_V2_PAIR_CREATED_TOPIC0 =
  "0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9";

export const PUBLIC_RPC_FALLBACKS = Object.freeze({
  ethereum: ["https://ethereum-rpc.publicnode.com"],
  base: ["https://base-rpc.publicnode.com", "https://mainnet.base.org"],
  bsc: ["https://bsc-rpc.publicnode.com"],
  polygon: ["https://polygon-bor-rpc.publicnode.com"],
  arbitrum: ["https://arbitrum-one-rpc.publicnode.com"],
  optimism: ["https://optimism-rpc.publicnode.com", "https://mainnet.optimism.io"],
  avalanche: ["https://avalanche-c-chain-rpc.publicnode.com"],
  solana: ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"],
});

const CHAIN_RPC_ENV_CANDIDATES = Object.freeze({
  ethereum: ["ETHEREUM_RPC_URL", "ETH_RPC_URL", "MAINNET_RPC_URL"],
  base: ["BASE_RPC_URL"],
  bsc: ["BSC_RPC_URL", "BNB_RPC_URL", "BINANCE_SMART_CHAIN_RPC_URL"],
  polygon: ["POLYGON_RPC_URL", "MATIC_RPC_URL"],
  arbitrum: ["ARBITRUM_RPC_URL", "ARB_RPC_URL"],
  optimism: ["OPTIMISM_RPC_URL", "OP_RPC_URL"],
  avalanche: ["AVALANCHE_RPC_URL", "AVAX_RPC_URL"],
  solana: ["SOLANA_RPC_URL", "HELIUS_RPC_URL"],
});

const EVM_CHAIN_IDS = Object.freeze({
  ethereum: 1,
  base: 8453,
  bsc: 56,
  polygon: 137,
  arbitrum: 42161,
  optimism: 10,
  avalanche: 43114,
});

const CHAIN_ENV_PREFIXES = Object.freeze({
  ethereum: "ETHEREUM",
  base: "BASE",
  bsc: "BSC",
  polygon: "POLYGON",
  arbitrum: "ARBITRUM",
  optimism: "OPTIMISM",
  avalanche: "AVALANCHE",
});

const UNISWAP_V2_FACTORY_ADDRESSES = Object.freeze({
  ethereum: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
  base: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
  bsc: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
  polygon: "0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C",
  arbitrum: "0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9",
  optimism: "0x0c3c1c532F1e39EdF36BE9Fe0bE1410313E074Bf",
  avalanche: "0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C",
});

const PANCAKESWAP_V2_FACTORY_ADDRESSES = Object.freeze({
  ethereum: "0x1097053Fd2ea711dad45caCcc45EfF7548fCB362",
  base: "0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E",
  arbitrum: "0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E",
});

const PANCAKESWAP_V3_FACTORY_ADDRESSES = Object.freeze({
  ethereum: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
  base: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
  arbitrum: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
});

function present(value = "") {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^(your_|optional_|example|changeme|replace_me)/i.test(text)) return null;
  return text;
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function envEnabled(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  return !/^(false|0|no|off)$/i.test(String(value).trim());
}

export function nativePublicRpcFallbacksEnabled(options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, "usePublicRpcFallbacks")) {
    return options.usePublicRpcFallbacks !== false;
  }
  const env = options.env || process.env;
  return envEnabled(env.NATIVE_PUBLIC_RPC_FALLBACKS, true);
}

export function chainRpcEnvCandidates(chain = "", protocol = {}) {
  return unique([
    protocol.rpcEnv,
    ...(protocol.rpcEnvCandidates || []),
    ...(CHAIN_RPC_ENV_CANDIDATES[chain] || []),
  ]);
}

function resolveValue({ env = process.env, envKey, fallbackValue }) {
  const envValue = envKey ? present(env[envKey]) : null;
  if (envValue) {
    return {
      value: envValue,
      source: "env",
      envUsed: envKey,
    };
  }
  const defaultValue = present(fallbackValue);
  if (defaultValue) {
    return {
      value: defaultValue,
      source: "static-default",
      envUsed: null,
    };
  }
  return {
    value: null,
    source: "missing",
    envUsed: null,
  };
}

export function resolveNativeRpcUrl(protocol = {}, options = {}) {
  const env = options.env || process.env;
  const rpcCandidates = chainRpcEnvCandidates(protocol.chain, protocol);
  const envHit = rpcCandidates
    .map((key) => ({ key, value: present(env[key]) }))
    .find((item) => item.value);
  const publicRpcUrls = unique([
    ...(protocol.publicRpcUrls || []),
    ...(PUBLIC_RPC_FALLBACKS[protocol.chain] || []),
  ]);

  if (envHit) {
    return {
      rpcUrl: envHit.value,
      rpcUrls: nativePublicRpcFallbacksEnabled(options) ? unique([envHit.value, ...publicRpcUrls]) : [envHit.value],
      rpcSource: "env",
      rpcEnvUsed: envHit.key,
      rpcCandidates,
      publicRpcUrls,
    };
  }

  if (nativePublicRpcFallbacksEnabled(options) && publicRpcUrls.length) {
    return {
      rpcUrl: publicRpcUrls[0],
      rpcUrls: publicRpcUrls,
      rpcSource: "public-fallback",
      rpcEnvUsed: null,
      rpcCandidates,
      publicRpcUrls,
    };
  }

  return {
    rpcUrl: null,
    rpcUrls: [],
    rpcSource: "missing",
    rpcEnvUsed: null,
    rpcCandidates,
    publicRpcUrls,
  };
}

function chainEnvPrefix(chain = "") {
  return CHAIN_ENV_PREFIXES[chain] || String(chain || "").toUpperCase();
}

function createUniswapV2Lane(chain = "") {
  const prefix = chainEnvPrefix(chain);
  return {
    id: `${chain}-uniswap-v2`,
    chain,
    chainId: EVM_CHAIN_IDS[chain],
    family: "evm-factory",
    protocol: "uniswap-v2",
    protocolVersion: "v2",
    factoryEnv: `${prefix}_UNISWAP_V2_FACTORY`,
    rpcEnv: `${prefix}_RPC_URL`,
    eventTopic0Env: `${prefix}_UNISWAP_V2_PAIR_CREATED_TOPIC0`,
    defaultFactoryAddress: UNISWAP_V2_FACTORY_ADDRESSES[chain],
    defaultEventTopic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
    poolAddressDataWord: 0,
    eventKinds: ["POOL_CREATED", "FIRST_LIQUIDITY_ADDED", "FIRST_SWAP"],
    priority: chain === "ethereum" ? 93 : 81,
  };
}

function createPancakeV2Lane(chain = "") {
  const prefix = chainEnvPrefix(chain);
  return {
    id: `${chain}-pancakeswap-v2`,
    chain,
    chainId: EVM_CHAIN_IDS[chain],
    family: "evm-factory",
    protocol: "pancakeswap-v2",
    protocolVersion: "v2",
    factoryEnv: `${prefix}_PANCAKESWAP_V2_FACTORY`,
    rpcEnv: `${prefix}_RPC_URL`,
    eventTopic0Env: `${prefix}_PANCAKESWAP_V2_POOL_CREATED_TOPIC0`,
    defaultFactoryAddress: PANCAKESWAP_V2_FACTORY_ADDRESSES[chain],
    defaultEventTopic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
    poolAddressDataWord: 0,
    eventKinds: ["POOL_CREATED", "FIRST_LIQUIDITY_ADDED", "FIRST_SWAP"],
    priority: chain === "ethereum" ? 83 : 80,
  };
}

function createPancakeV3Lane(chain = "") {
  const prefix = chainEnvPrefix(chain);
  return {
    id: `${chain}-pancakeswap-v3`,
    chain,
    chainId: EVM_CHAIN_IDS[chain],
    family: "evm-factory",
    protocol: "pancakeswap-v3",
    protocolVersion: "v3",
    factoryEnv: `${prefix}_PANCAKESWAP_V3_FACTORY`,
    rpcEnv: `${prefix}_RPC_URL`,
    eventTopic0Env: `${prefix}_PANCAKESWAP_V3_POOL_CREATED_TOPIC0`,
    defaultFactoryAddress: PANCAKESWAP_V3_FACTORY_ADDRESSES[chain],
    defaultEventTopic0: UNISWAP_V3_POOL_CREATED_TOPIC0,
    poolAddressDataWord: 1,
    eventKinds: ["POOL_CREATED", "POOL_INITIALIZED", "FIRST_SWAP"],
    priority: chain === "ethereum" ? 84 : 82,
  };
}

export const NATIVE_PROTOCOLS = [
  {
    id: "ethereum-uniswap-v3",
    chain: "ethereum",
    chainId: 1,
    family: "evm-factory",
    protocol: "uniswap-v3",
    protocolVersion: "v3",
    factoryEnv: "ETHEREUM_UNISWAP_V3_FACTORY",
    rpcEnv: "ETHEREUM_RPC_URL",
    eventTopic0Env: "ETHEREUM_UNISWAP_V3_POOL_CREATED_TOPIC0",
    defaultFactoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    defaultEventTopic0: UNISWAP_V3_POOL_CREATED_TOPIC0,
    poolAddressDataWord: 1,
    eventKinds: ["POOL_CREATED", "POOL_INITIALIZED", "FIRST_SWAP"],
    priority: 96,
  },
  ...Object.keys(UNISWAP_V2_FACTORY_ADDRESSES).map(createUniswapV2Lane),
  {
    id: "base-aerodrome-v2",
    chain: "base",
    chainId: 8453,
    family: "evm-factory",
    protocol: "aerodrome",
    protocolVersion: "volatile-stable-v2",
    factoryEnv: "BASE_AERODROME_FACTORY",
    rpcEnv: "BASE_RPC_URL",
    eventTopic0Env: "BASE_AERODROME_POOL_CREATED_TOPIC0",
    poolAddressDataWord: 1,
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
    rpcEnv: "BASE_RPC_URL",
    eventTopic0Env: "BASE_AERODROME_SLIPSTREAM_POOL_CREATED_TOPIC0",
    poolAddressDataWord: 1,
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
    rpcEnv: "BASE_RPC_URL",
    eventTopic0Env: "BASE_UNISWAP_V3_POOL_CREATED_TOPIC0",
    defaultFactoryAddress: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    defaultEventTopic0: UNISWAP_V3_POOL_CREATED_TOPIC0,
    poolAddressDataWord: 1,
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
    rpcEnv: "BASE_RPC_URL",
    eventTopic0Env: "BASE_UNISWAP_V4_POOL_INITIALIZED_TOPIC0",
    poolAddressDataWord: 1,
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
    rpcEnv: "SOLANA_RPC_URL",
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
    rpcEnv: "SOLANA_RPC_URL",
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
    rpcEnv: "SOLANA_RPC_URL",
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
    rpcEnv: "SOLANA_RPC_URL",
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
    rpcEnv: "SOLANA_RPC_URL",
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
    rpcEnv: "SOLANA_RPC_URL",
    eventKinds: ["POOL_CREATED", "FIRST_LIQUIDITY_ADDED", "FIRST_SWAP"],
    priority: 88,
  },
  ...Object.keys(PANCAKESWAP_V2_FACTORY_ADDRESSES).map(createPancakeV2Lane),
  ...Object.keys(PANCAKESWAP_V3_FACTORY_ADDRESSES).map(createPancakeV3Lane),
  {
    id: "bsc-uniswap-v3",
    chain: "bsc",
    chainId: 56,
    family: "evm-factory",
    protocol: "uniswap-v3",
    protocolVersion: "v3",
    factoryEnv: "BSC_UNISWAP_V3_FACTORY",
    rpcEnv: "BSC_RPC_URL",
    eventTopic0Env: "BSC_UNISWAP_V3_POOL_CREATED_TOPIC0",
    defaultFactoryAddress: "0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7",
    defaultEventTopic0: UNISWAP_V3_POOL_CREATED_TOPIC0,
    poolAddressDataWord: 1,
    eventKinds: ["POOL_CREATED", "POOL_INITIALIZED", "FIRST_SWAP"],
    priority: 87,
  },
  {
    id: "bnb-pancakeswap-v2",
    chain: "bsc",
    chainId: 56,
    family: "evm-factory",
    protocol: "pancakeswap-v2",
    protocolVersion: "v2",
    factoryEnv: "BSC_PANCAKESWAP_V2_FACTORY",
    rpcEnv: "BSC_RPC_URL",
    eventTopic0Env: "BSC_PANCAKESWAP_V2_POOL_CREATED_TOPIC0",
    defaultFactoryAddress: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
    defaultEventTopic0: UNISWAP_V2_PAIR_CREATED_TOPIC0,
    poolAddressDataWord: 0,
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
    rpcEnv: "BSC_RPC_URL",
    eventTopic0Env: "BSC_PANCAKESWAP_V3_POOL_CREATED_TOPIC0",
    defaultFactoryAddress: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
    defaultEventTopic0: UNISWAP_V3_POOL_CREATED_TOPIC0,
    poolAddressDataWord: 1,
    eventKinds: ["POOL_CREATED", "POOL_INITIALIZED", "FIRST_SWAP"],
    priority: 86,
  },
  {
    id: "polygon-uniswap-v3",
    chain: "polygon",
    chainId: 137,
    family: "evm-factory",
    protocol: "uniswap-v3",
    protocolVersion: "v3",
    factoryEnv: "POLYGON_UNISWAP_V3_FACTORY",
    rpcEnv: "POLYGON_RPC_URL",
    eventTopic0Env: "POLYGON_UNISWAP_V3_POOL_CREATED_TOPIC0",
    defaultFactoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    defaultEventTopic0: UNISWAP_V3_POOL_CREATED_TOPIC0,
    poolAddressDataWord: 1,
    eventKinds: ["POOL_CREATED", "POOL_INITIALIZED", "FIRST_SWAP"],
    priority: 85,
  },
  {
    id: "polygon-quickswap-algebra",
    chain: "polygon",
    chainId: 137,
    family: "evm-factory",
    protocol: "quickswap-algebra",
    protocolVersion: "algebra",
    factoryEnv: "POLYGON_QUICKSWAP_ALGEBRA_FACTORY",
    rpcEnv: "POLYGON_RPC_URL",
    eventTopic0Env: "POLYGON_QUICKSWAP_ALGEBRA_POOL_CREATED_TOPIC0",
    poolAddressDataWord: 1,
    eventKinds: ["POOL_CREATED", "POOL_INITIALIZED", "FIRST_SWAP"],
    priority: 82,
  },
  {
    id: "arbitrum-uniswap-v3",
    chain: "arbitrum",
    chainId: 42161,
    family: "evm-factory",
    protocol: "uniswap-v3",
    protocolVersion: "v3",
    factoryEnv: "ARBITRUM_UNISWAP_V3_FACTORY",
    rpcEnv: "ARBITRUM_RPC_URL",
    eventTopic0Env: "ARBITRUM_UNISWAP_V3_POOL_CREATED_TOPIC0",
    defaultFactoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    defaultEventTopic0: UNISWAP_V3_POOL_CREATED_TOPIC0,
    poolAddressDataWord: 1,
    eventKinds: ["POOL_CREATED", "POOL_INITIALIZED", "FIRST_SWAP"],
    priority: 89,
  },
  {
    id: "arbitrum-camelot",
    chain: "arbitrum",
    chainId: 42161,
    family: "evm-factory",
    protocol: "camelot",
    protocolVersion: "factory",
    factoryEnv: "ARBITRUM_CAMELOT_FACTORY",
    rpcEnv: "ARBITRUM_RPC_URL",
    eventTopic0Env: "ARBITRUM_CAMELOT_POOL_CREATED_TOPIC0",
    poolAddressDataWord: 0,
    eventKinds: ["POOL_CREATED", "FIRST_LIQUIDITY_ADDED", "FIRST_SWAP"],
    priority: 78,
  },
  {
    id: "optimism-uniswap-v3",
    chain: "optimism",
    chainId: 10,
    family: "evm-factory",
    protocol: "uniswap-v3",
    protocolVersion: "v3",
    factoryEnv: "OPTIMISM_UNISWAP_V3_FACTORY",
    rpcEnv: "OPTIMISM_RPC_URL",
    eventTopic0Env: "OPTIMISM_UNISWAP_V3_POOL_CREATED_TOPIC0",
    defaultFactoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    defaultEventTopic0: UNISWAP_V3_POOL_CREATED_TOPIC0,
    poolAddressDataWord: 1,
    eventKinds: ["POOL_CREATED", "POOL_INITIALIZED", "FIRST_SWAP"],
    priority: 84,
  },
  {
    id: "avalanche-uniswap-v3",
    chain: "avalanche",
    chainId: 43114,
    family: "evm-factory",
    protocol: "uniswap-v3",
    protocolVersion: "v3",
    factoryEnv: "AVALANCHE_UNISWAP_V3_FACTORY",
    rpcEnv: "AVALANCHE_RPC_URL",
    eventTopic0Env: "AVALANCHE_UNISWAP_V3_POOL_CREATED_TOPIC0",
    defaultFactoryAddress: "0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD",
    defaultEventTopic0: UNISWAP_V3_POOL_CREATED_TOPIC0,
    poolAddressDataWord: 1,
    eventKinds: ["POOL_CREATED", "POOL_INITIALIZED", "FIRST_SWAP"],
    priority: 80,
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
  const env = options.env || process.env;
  const enabledChains = new Set(
    String(options.chains || env.NATIVE_DISCOVERY_CHAINS || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );

  return NATIVE_PROTOCOLS
    .filter((config) => !enabledChains.size || enabledChains.has(config.chain))
    .map((config) => {
      const factory = resolveValue({
        env,
        envKey: config.factoryEnv,
        fallbackValue: config.defaultFactoryAddress,
      });
      const program = resolveValue({
        env,
        envKey: config.programEnv,
        fallbackValue: config.defaultProgramId,
      });
      const eventTopic = resolveValue({
        env,
        envKey: config.eventTopic0Env,
        fallbackValue: config.defaultEventTopic0,
      });
      const rpc = resolveNativeRpcUrl(config, { ...options, env });
      const factoryAddress = factory.value;
      const programId = program.value;
      const rpcUrl = rpc.rpcUrl;
      const eventTopic0 = eventTopic.value;
      const evmFactoryConfigured = Boolean(factoryAddress && rpcUrl && eventTopic0);
      const solanaProgramConfigured = Boolean(programId && rpcUrl);
      const evmDeploymentConfigured = Boolean(rpcUrl && config.family === "evm-deployment");
      const configured =
        config.family === "evm-factory"
          ? evmFactoryConfigured
          : config.family === "solana-program"
          ? solanaProgramConfigured
          : evmDeploymentConfigured;

      return {
        ...config,
        factoryAddress,
        programId,
        rpcUrl,
        eventTopic0,
        configured,
        factoryAddressSource: factory.source,
        factoryAddressEnvUsed: factory.envUsed,
        programIdSource: program.source,
        programIdEnvUsed: program.envUsed,
        eventTopic0Source: eventTopic.source,
        eventTopic0EnvUsed: eventTopic.envUsed,
        rpcSource: rpc.rpcSource,
        rpcEnvUsed: rpc.rpcEnvUsed,
        rpcUrls: rpc.rpcUrls,
        rpcCandidates: rpc.rpcCandidates,
        publicRpcUrls: rpc.publicRpcUrls,
        usesPublicRpcFallback: rpc.rpcSource === "public-fallback",
        usesStaticProtocolDefaults:
          factory.source === "static-default" ||
          program.source === "static-default" ||
          eventTopic.source === "static-default",
      };
    })
    .sort((a, b) => b.priority - a.priority);
}

export function getConfiguredNativeProtocols(options = {}) {
  return getNativeProtocolConfigs(options).filter((config) => config.configured);
}

export function summarizeNativeProtocolCoverage(options = {}) {
  const protocols = getNativeProtocolConfigs(options);
  const configured = protocols.filter((protocol) => protocol.configured);
  const byChain = protocols.reduce((acc, protocol) => {
    acc[protocol.chain] = acc[protocol.chain] || {
      total: 0,
      configured: 0,
      configuredWithEnvRpc: 0,
      configuredWithPublicRpc: 0,
      protocols: [],
    };
    acc[protocol.chain].total += 1;
    acc[protocol.chain].configured += protocol.configured ? 1 : 0;
    acc[protocol.chain].configuredWithEnvRpc += protocol.configured && protocol.rpcSource === "env" ? 1 : 0;
    acc[protocol.chain].configuredWithPublicRpc +=
      protocol.configured && protocol.rpcSource === "public-fallback" ? 1 : 0;
    acc[protocol.chain].protocols.push(protocol.id);
    return acc;
  }, {});

  return {
    totalProtocols: protocols.length,
    configuredProtocols: configured.length,
    configuredWithEnvRpc: configured.filter((protocol) => protocol.rpcSource === "env").length,
    configuredWithPublicRpc: configured.filter((protocol) => protocol.rpcSource === "public-fallback").length,
    publicRpcFallbacksEnabled: nativePublicRpcFallbacksEnabled(options),
    unconfiguredProtocols: protocols.length - configured.length,
    byChain,
    requiredEnvironmentVariables: protocols
      .flatMap((protocol) => [
        protocol.factoryEnv,
        protocol.programEnv,
        protocol.rpcEnv,
        protocol.eventTopic0Env,
        ...(protocol.rpcCandidates || []),
      ])
      .filter(Boolean),
    protocols,
  };
}
