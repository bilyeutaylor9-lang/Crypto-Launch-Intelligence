import {
  getPairByAddress,
  getTokenPairs,
  normalizeDexPair,
  searchDexPairs,
} from "./dexScreenerConnector.js";
import {
  getCoinGeckoMarketsByIds,
  normalizeCoinGeckoMarket,
} from "./coinGeckoConnector.js";
import { getCoinPaprikaTickerById } from "./freeMarketDataConnector.js";
import { getFreeSecurityEvidence } from "./security/freeSecurityEvidenceConnector.js";
import {
  getBlockscoutDeployerEvidence,
  getBlockscoutSecurityEvidence,
} from "./security/blockscoutConnector.js";
import {
  etherscanV2ApiKey,
  getEtherscanV2SecurityEvidence,
} from "./security/etherscanV2Connector.js";
import { getGoPlusSecurityEvidence } from "./security/goplusSecurityConnector.js";
import { getSourcifySecurityEvidence } from "./security/sourcifyV2Connector.js";
import { getBlockscoutWalletEvidence } from "./blockscoutWalletConnector.js";
import {
  normalizeChainId,
  normalizePoolAddress,
  normalizeTokenAddress,
} from "../identity/strictIdentityValidators.js";

const DEX_FIELDS = new Set([
  "chain",
  "tokenAddress",
  "poolAddress",
  "priceUsd",
  "liquidityUsd",
  "stableExitLiquidityUsd",
  "volume24hUsd",
  "circulatingMarketCapUsd",
  "fullyDilutedValuationUsd",
  "estimatedMarketCapUsd",
  "buyTransactions24h",
  "sellTransactions24h",
]);

const DEX_COMPANION_FIELDS = [
  "chain",
  "tokenAddress",
  "poolAddress",
  "priceUsd",
  "liquidityUsd",
  "volume24hUsd",
  "circulatingMarketCapUsd",
  "fullyDilutedValuationUsd",
  "buyTransactions24h",
  "sellTransactions24h",
];

const SECURITY_FIELDS = new Set([
  "honeypotDetected",
  "sellRestricted",
  "blacklistEnabled",
  "contractVerified",
  "mintAuthorityEnabled",
  "holderCount",
  "buyTaxPct",
  "sellTaxPct",
]);

const AGGREGATE_MARKET_FIELDS = new Set([
  "priceUsd",
  "volume24hUsd",
  "circulatingMarketCapUsd",
  "fullyDilutedValuationUsd",
  "estimatedMarketCapUsd",
]);

const DEPLOYER_FIELDS = new Set([
  "creatorAddress",
  "deployerAddress",
  "creator",
  "deployer",
  "deploymentTransactionHash",
  "contractCreationTimestamp",
  "creationBlockNumber",
  "walletAgeDays",
  "priorDeployments",
  "deployerHistory",
  "nativeLifecycle",
]);

const WALLET_RAW_FIELDS = new Set([
  "wallets",
  "holderAddresses",
  "holderCount",
  "buyerAddresses",
  "sellerAddresses",
  "walletTransactions",
  "walletParticipationHistory",
  "uniqueBuyers24h",
  "buyTransactions24h",
  "sellTransactions24h",
  "buyVolumeUsd",
  "sellVolumeUsd",
  "smartWalletBuys24h",
  "smartWalletSells24h",
  "smartWalletBuyVolumeUsd",
  "smartWalletSellVolumeUsd",
  "smartWalletBuyCount",
  "smartWalletSellCount",
  "smartWallets",
  "trackedWallets",
]);

function text(value = "") {
  return String(value ?? "").trim();
}

function lower(value = "") {
  return text(value).toLowerCase();
}

function first(values = []) {
  return values.find((value) => value !== null && value !== undefined && value !== "") ?? null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function valueKnown(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

function fieldOf(request = {}) {
  return request.field || request.canonicalField || request.item?.canonicalField || request.item?.field || "";
}

function targetSourceNames(requests = []) {
  return new Set(
    requests
      .flatMap((request) => request.item?.targetSources || request.targetSources || [])
      .map((source) => lower(source?.source || source))
      .filter(Boolean)
  );
}

function sourceRequested(sources = new Set(), patterns = []) {
  if (!sources.size) return true;
  return [...sources].some((source) => patterns.some((pattern) => source.includes(pattern)));
}

function chainOf(project = {}) {
  return normalizeChainId(
    first([
      project.chain,
      project.chainId,
      project.network,
      project.canonicalChain,
      project.rawCandidate?.chain,
      project.marketData?.chain,
    ])
  );
}

function tokenAddressOf(project = {}, chain = chainOf(project)) {
  return normalizeTokenAddress(
    first([
      project.tokenAddress,
      project.contractAddress,
      project.address,
      project.canonicalAddress,
      project.baseToken?.address,
      project.rawCandidate?.tokenAddress,
      project.rawCandidate?.contractAddress,
      project.rawCandidate?.address,
      project.marketData?.tokenAddress,
    ]),
    chain
  );
}

function poolAddressOf(project = {}, chain = chainOf(project)) {
  return normalizePoolAddress(
    first([
      project.poolAddress,
      project.pairAddress,
      project.primaryPool,
      project.pair?.address,
      project.rawCandidate?.poolAddress,
      project.rawCandidate?.pairAddress,
      project.marketData?.poolAddress,
    ]),
    chain
  );
}

function providerFunctions(options = {}) {
  const injected = options.providers || {};
  const customDeployerProvider = Boolean(
    injected.getBlockscoutDeployerEvidence ||
      injected.getDeployerEvidence ||
      options.getBlockscoutDeployerEvidence
  );
  const customSourcifyProvider = Boolean(
    injected.getSourcifyDeployerEvidence ||
      injected.getSourcifySecurityEvidence ||
      options.getSourcifyDeployerEvidence ||
      options.getSourcifySecurityEvidence
  );
  const customEtherscanProvider = Boolean(
    injected.getEtherscanV2SecurityEvidence ||
      options.getEtherscanV2SecurityEvidence
  );
  return {
    getTokenPairs: injected.getTokenPairs || options.getTokenPairs || getTokenPairs,
    getPairByAddress: injected.getPairByAddress || options.getPairByAddress || getPairByAddress,
    searchDexPairs: injected.searchDexPairs || options.searchDexPairs || searchDexPairs,
    getFreeSecurityEvidence:
      injected.getFreeSecurityEvidence ||
      options.getFreeSecurityEvidence ||
      getFreeSecurityEvidence,
    getBlockscoutDeployerEvidence:
      injected.getBlockscoutDeployerEvidence ||
      injected.getDeployerEvidence ||
      options.getBlockscoutDeployerEvidence ||
      getBlockscoutDeployerEvidence,
    getSourcifyDeployerEvidence:
      injected.getSourcifyDeployerEvidence ||
      injected.getSourcifySecurityEvidence ||
      options.getSourcifyDeployerEvidence ||
      options.getSourcifySecurityEvidence ||
      getSourcifySecurityEvidence,
    useSourcifyDeployerFallback: customSourcifyProvider || !customDeployerProvider,
    getGoPlusDeployerEvidence:
      injected.getGoPlusDeployerEvidence ||
      injected.getGoPlusSecurityEvidence ||
      options.getGoPlusDeployerEvidence ||
      getGoPlusSecurityEvidence,
    useGoPlusDeployerFallback:
      Boolean(
        injected.getGoPlusDeployerEvidence ||
          injected.getGoPlusSecurityEvidence ||
          options.getGoPlusDeployerEvidence
      ) || !customDeployerProvider,
    getBlockscoutSecurityEvidence:
      injected.getBlockscoutSecurityEvidence ||
      options.getBlockscoutSecurityEvidence ||
      getBlockscoutSecurityEvidence,
    getEtherscanV2SecurityEvidence:
      injected.getEtherscanV2SecurityEvidence ||
      options.getEtherscanV2SecurityEvidence ||
      getEtherscanV2SecurityEvidence,
    customEtherscanDeployerProvider: customEtherscanProvider,
    getBlockscoutWalletEvidence:
      injected.getBlockscoutWalletEvidence ||
      injected.getWalletEvidence ||
      options.getBlockscoutWalletEvidence ||
      getBlockscoutWalletEvidence,
    getCoinGeckoMarketsByIds:
      injected.getCoinGeckoMarketsByIds ||
      options.getCoinGeckoMarketsByIds ||
      getCoinGeckoMarketsByIds,
    getCoinPaprikaTickerById:
      injected.getCoinPaprikaTickerById ||
      options.getCoinPaprikaTickerById ||
      getCoinPaprikaTickerById,
  };
}

export function createActiveEvidenceExecutionState(options = {}) {
  const maxRequests = Math.max(
    1,
    Number(
      options.maxProviderRequests ||
      options.maxRequests ||
        process.env.ACTIVE_EVIDENCE_MAX_PROVIDER_REQUESTS ||
        process.env.ACTIVE_EVIDENCE_RECOVERY_MAX_PROVIDER_REQUESTS ||
        500
    )
  );
  const circuitFailureThreshold = Math.max(
    1,
    Number(
      options.circuitFailureThreshold ||
        process.env.ACTIVE_EVIDENCE_RECOVERY_CIRCUIT_FAILURES ||
        3
    )
  );

  return {
    maxRequests,
    requestsUsed: 0,
    concurrency: Math.max(
      1,
      Number(options.concurrency || process.env.ACTIVE_EVIDENCE_CONCURRENCY || 4)
    ),
    circuitFailureThreshold,
    providers: new Map(),
  };
}

function providerState(state = {}, provider = "unknown", circuitScope = null) {
  const stateKey = circuitScope ? `${provider}:${circuitScope}` : provider;
  const current = state.providers.get(stateKey) || {
    provider,
    circuitScope,
    attempts: 0,
    successes: 0,
    failures: 0,
    skipped: 0,
    circuitOpen: false,
    lastError: null,
  };
  state.providers.set(stateKey, current);
  return current;
}

async function executeProviderCall(
  provider,
  operation,
  options = {},
  state = {},
  cost = 1,
  circuitScope = null
) {
  const health = providerState(state, provider, circuitScope);
  if (health.circuitOpen) {
    health.skipped += 1;
    return {
      status: "CIRCUIT_OPEN",
      provider,
      value: null,
      reason: health.lastError || "Provider circuit is open for this scan.",
      durationMs: 0,
    };
  }
  if (state.requestsUsed + cost > state.maxRequests) {
    health.skipped += 1;
    return {
      status: "REQUEST_BUDGET_EXHAUSTED",
      provider,
      value: null,
      reason: "Active evidence provider request budget exhausted.",
      durationMs: 0,
    };
  }

  state.requestsUsed += cost;
  health.attempts += 1;
  const startedAt = Date.now();
  const timeoutMs = Math.max(
    250,
    Number(
      options.providerTimeoutMs ||
        options.timeoutMs ||
        process.env.ACTIVE_EVIDENCE_PROVIDER_TIMEOUT_MS ||
        process.env.ACTIVE_EVIDENCE_RECOVERY_PROVIDER_TIMEOUT_MS ||
        8_000
    )
  );
  let timer;

  try {
    const value = await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${provider} recovery timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);
    health.successes += 1;
    return {
      status: "SUCCESS",
      provider,
      value,
      reason: null,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    health.failures += 1;
    health.lastError = error?.message || String(error);
    if (health.failures >= state.circuitFailureThreshold) health.circuitOpen = true;
    return {
      status: "FAILED",
      provider,
      value: null,
      reason: health.lastError,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

function evmIdentity(project = {}) {
  const chain = chainOf(project);
  const tokenAddress = tokenAddressOf(project, chain);
  return {
    chain,
    tokenAddress,
    exact:
      Boolean(chain) &&
      /^0x[0-9a-f]{40}$/i.test(String(tokenAddress || "")),
  };
}

function solanaIdentity(project = {}) {
  const chain = chainOf(project);
  const tokenAddress = tokenAddressOf(project, chain);
  return {
    chain,
    tokenAddress,
    exact: chain === "solana" && Boolean(tokenAddress),
  };
}

function deployerValue(result = {}, field = "") {
  const rawCreator = lower(result.creatorAddress || result.contractCreator);
  const creator = /^0x[0-9a-f]{40}$/.test(rawCreator) ? rawCreator : null;
  switch (field) {
    case "creatorAddress":
    case "deployerAddress":
    case "creator":
    case "deployer":
      return creator || null;
    case "deploymentTransactionHash":
      return result.deploymentTransactionHash || result.creationTxHash || null;
    case "contractCreationTimestamp":
      return result.contractCreationTimestamp || result.creationTimestamp || null;
    case "creationBlockNumber":
      return numberOrNull(result.creationBlockNumber);
    case "walletAgeDays":
      return numberOrNull(result.walletAgeDays);
    case "priorDeployments":
      return numberOrNull(result.priorDeployments);
    case "deployerHistory":
      return result.deployerHistory || null;
    default:
      return null;
  }
}

function confidenceFraction(value, fallback = 0.8) {
  const numeric = numberOrNull(value);
  if (numeric === null) return fallback;
  return Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric));
}

function exactDeployerResult(result = {}, identity = {}) {
  if (!deployerValue(result, "creatorAddress")) return false;
  const resultChain = result.chain ? normalizeChainId(result.chain) : null;
  const resultAddress = lower(result.address || result.tokenAddress);
  if (resultChain && resultChain !== identity.chain) return false;
  if (resultAddress && resultAddress !== lower(identity.tokenAddress)) return false;
  return true;
}

function existingDeployerEvidence(project = {}, identity = {}) {
  const candidates = [
    ...(Array.isArray(project.securityEvidence) ? project.securityEvidence : []),
    ...(Array.isArray(project.freeSecurityEvidence?.evidence)
      ? project.freeSecurityEvidence.evidence
      : []),
    project.blockscoutDeployerEvidence,
    project.goplusDeployerEvidence,
  ].filter(Boolean);
  return candidates.find(
    (item) => item.status !== "UNKNOWN" && exactDeployerResult(item, identity)
  ) || null;
}

function deployerObservations(result = {}, fields = [], identity = {}, source = "blockscout") {
  const companionFields = [
    "creatorAddress",
    "deployerAddress",
    "creator",
    "deployer",
    "deploymentTransactionHash",
    "contractCreationTimestamp",
    "creationBlockNumber",
    "walletAgeDays",
    "priorDeployments",
    "deployerHistory",
  ];
  const timestamp = result.observedAt || result.sourceTimestamp || new Date().toISOString();
  return [...new Set([...fields, ...companionFields])]
    .map((field) => observation(
      field,
      deployerValue(result, field),
      source,
      timestamp,
      confidenceFraction(result.confidence),
      { chain: identity.chain, tokenAddress: identity.tokenAddress }
    ))
    .filter((item) => valueKnown(item.value));
}

export async function recoverDeployerEvidence(
  project = {},
  fields = [],
  providers = providerFunctions({}),
  options = {},
  state = createActiveEvidenceExecutionState(options)
) {
  const evm = evmIdentity(project);
  if (evm.exact) {
    const existing = existingDeployerEvidence(project, evm);
    if (existing) {
      const source = existing.provider || existing.source || "existing-security-evidence";
      return {
        observations: deployerObservations(existing, fields, evm, source),
        attempts: [{
          status: "LOCAL_EVIDENCE_AVAILABLE",
          provider: source,
          reason: null,
          durationMs: 0,
        }],
        projectPatch: {},
      };
    }

    let sourcifyAttempt = null;
    let sourcifyResult = {};
    if (providers.useSourcifyDeployerFallback) {
      sourcifyAttempt = await executeProviderCall(
        "sourcify-v2-deployer",
        () => providers.getSourcifyDeployerEvidence(
          { ...project, chain: evm.chain, tokenAddress: evm.tokenAddress },
          { ...options, useCache: options.useCache }
        ),
        options,
        state,
        Math.max(1, Number(options.sourcifyDeployerProviderRequestCost || 1)),
        evm.chain
      );
      sourcifyResult = sourcifyAttempt.value || {};
      if (
        sourcifyAttempt.status === "SUCCESS" &&
        exactDeployerResult(sourcifyResult, evm)
      ) {
        return {
          observations: deployerObservations(
            sourcifyResult,
            fields,
            evm,
            "sourcify-v2"
          ),
          attempts: [{ ...sourcifyAttempt, value: undefined }],
          projectPatch: { sourcifyDeployerEvidence: sourcifyResult },
        };
      }
    }

    const blockscoutAttempt = await executeProviderCall(
      "blockscout-deployer",
      () => providers.getBlockscoutDeployerEvidence(
        { ...project, chain: evm.chain, tokenAddress: evm.tokenAddress },
        { ...options, useCache: options.useCache }
      ),
      options,
      state,
      Math.max(1, Number(options.deployerProviderRequestCost || 1)),
      evm.chain
    );
    const blockscoutResult = blockscoutAttempt.value || {};
    if (
      blockscoutAttempt.status === "SUCCESS" &&
      exactDeployerResult(blockscoutResult, evm)
    ) {
      return {
        observations: deployerObservations(blockscoutResult, fields, evm, "blockscout"),
        attempts: [
          ...(sourcifyAttempt ? [{ ...sourcifyAttempt, value: undefined }] : []),
          { ...blockscoutAttempt, value: undefined },
        ],
        projectPatch: {
          ...(sourcifyAttempt ? { sourcifyDeployerEvidence: sourcifyResult } : {}),
          blockscoutDeployerEvidence: blockscoutResult,
        },
      };
    }

    let goplusAttempt = null;
    let goplusResult = {};
    if (providers.useGoPlusDeployerFallback) {
      goplusAttempt = await executeProviderCall(
        "goplus-deployer",
        () => providers.getGoPlusDeployerEvidence(
          { ...project, chain: evm.chain, tokenAddress: evm.tokenAddress },
          { ...options, useCache: options.useCache }
        ),
        options,
        state,
        Math.max(1, Number(options.goplusDeployerProviderRequestCost || 1)),
        evm.chain
      );
      goplusResult = goplusAttempt.value || {};
      if (
        goplusAttempt.status === "SUCCESS" &&
        exactDeployerResult(goplusResult, evm)
      ) {
        return {
          observations: deployerObservations(goplusResult, fields, evm, "goplus"),
          attempts: [
            ...(sourcifyAttempt ? [{ ...sourcifyAttempt, value: undefined }] : []),
            { ...blockscoutAttempt, value: undefined },
            { ...goplusAttempt, value: undefined },
          ],
          projectPatch: {
            ...(sourcifyAttempt ? { sourcifyDeployerEvidence: sourcifyResult } : {}),
            blockscoutDeployerEvidence: blockscoutResult,
            goplusDeployerEvidence: goplusResult,
          },
        };
      }
    }

    const etherscanAvailable =
      providers.customEtherscanDeployerProvider ||
      Boolean(etherscanV2ApiKey(evm.chain, options.env || process.env));
    const etherscanAttempt = etherscanAvailable
      ? await executeProviderCall(
          "etherscan-v2-deployer",
          () => providers.getEtherscanV2SecurityEvidence(
            { ...project, chain: evm.chain, tokenAddress: evm.tokenAddress },
            { ...options, useCache: options.useCache }
          ),
          options,
          state,
          Math.max(1, Number(options.etherscanDeployerProviderRequestCost || 3)),
          evm.chain
        )
      : {
          status: "PROVIDER_UNAVAILABLE",
          provider: "etherscan-v2-deployer",
          value: null,
          reason: "Etherscan deployer recovery skipped because no API key is configured.",
          durationMs: 0,
        };
    const etherscanResult = etherscanAttempt.value || {};
    const observations =
      etherscanAttempt.status === "SUCCESS" && exactDeployerResult(etherscanResult, evm)
        ? deployerObservations(etherscanResult, fields, evm, "etherscan-v2")
        : [];
    return {
      observations,
      attempts: [
        ...(sourcifyAttempt ? [{ ...sourcifyAttempt, value: undefined }] : []),
        { ...blockscoutAttempt, value: undefined },
        ...(goplusAttempt ? [{ ...goplusAttempt, value: undefined }] : []),
        { ...etherscanAttempt, value: undefined },
      ],
      projectPatch: {
        ...(sourcifyAttempt ? { sourcifyDeployerEvidence: sourcifyResult } : {}),
        blockscoutDeployerEvidence: blockscoutResult,
        ...(goplusAttempt ? { goplusDeployerEvidence: goplusResult } : {}),
        ...(etherscanAvailable ? { etherscanDeployerEvidence: etherscanResult } : {}),
      },
    };
  }

  const solana = solanaIdentity(project);
  if (solana.exact) {
    const lifecycle = project.nativeLifecycle || {};
    const creator = first([
      lifecycle.creator,
      lifecycle.deployer,
      lifecycle.mintAuthority,
      project.creatorAddress,
      project.creator,
    ]);
    const timestamp = lifecycle.observedAt || project.sourceTimestamp || new Date().toISOString();
    const observations = fields
      .map((field) => {
        if (!["creatorAddress", "creator"].includes(field) || !creator) return null;
        return observation(field, creator, "native-lifecycle", timestamp, 0.8, {
          chain: "solana",
          applicability: "SOLANA_CREATOR_OR_MINT_AUTHORITY",
        });
      })
      .filter(Boolean);
    return {
      observations,
      attempts: [{
        status: observations.length ? "LOCAL_EVIDENCE_AVAILABLE" : "NOT_APPLICABLE",
        provider: "native-lifecycle",
        reason: observations.length
          ? null
          : "No trustworthy Solana creator or mint-authority evidence was present.",
        durationMs: 0,
      }],
      projectPatch: {},
    };
  }

  return {
    observations: [],
    attempts: [{
      status: "NOT_APPLICABLE",
      provider: "blockscout-deployer",
      reason: "Deployer recovery requires an exact chain and token contract identity.",
      durationMs: 0,
    }],
    projectPatch: {},
  };
}

export async function recoverWalletEvidence(
  project = {},
  fields = [],
  providers = providerFunctions({}),
  options = {},
  state = createActiveEvidenceExecutionState(options)
) {
  const evm = evmIdentity(project);
  if (!evm.exact) {
    return {
      observations: [],
      attempts: [{
        status: "NOT_APPLICABLE",
        provider: "blockscout-wallets",
        reason: "Wallet recovery requires an exact supported chain and token contract identity.",
        durationMs: 0,
      }],
      projectPatch: {},
    };
  }
  const attempt = await executeProviderCall(
    "blockscout-wallets",
    () => providers.getBlockscoutWalletEvidence(
      {
        ...project,
        chain: evm.chain,
        tokenAddress: evm.tokenAddress,
        poolAddress: poolAddressOf(project, evm.chain),
      },
      options
    ),
    options,
    state,
    Math.max(1, Number(options.walletProviderRequestCost || 3)),
    evm.chain
  );
  if (attempt.status !== "SUCCESS") {
    return { observations: [], attempts: [attempt], projectPatch: {} };
  }
  const result = attempt.value || {};
  if (result.status !== "EVIDENCE_AVAILABLE") {
    return {
      observations: [],
      attempts: [{ ...attempt, status: result.status || "UNKNOWN", value: undefined }],
      projectPatch: { blockscoutWalletEvidence: result },
    };
  }
  const timestamp = result.observedAt || new Date().toISOString();
  const observations = [...new Set(fields)]
    .map((field) => observation(field, result[field], "blockscout-wallets", timestamp, 0.82, {
      chain: evm.chain,
      tokenAddress: evm.tokenAddress,
      poolAddress: result.poolAddress || null,
      exactPoolIdentity: result.exactPoolIdentity === true,
    }))
    .filter((item) => valueKnown(item.value));
  return {
    observations,
    attempts: [{ ...attempt, value: undefined }],
    projectPatch: { blockscoutWalletEvidence: result },
  };
}

function rawDexPairs(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.pairs)) return payload.pairs;
  if (payload?.pair && typeof payload.pair === "object") return [payload.pair];
  return [];
}

function sameAddress(left, right) {
  return Boolean(left && right && lower(left) === lower(right));
}

function strictDexPair(payload, project = {}, lookup = {}) {
  const expectedChain = lookup.chain || chainOf(project);
  const expectedToken = lookup.tokenAddress || tokenAddressOf(project, expectedChain);
  const expectedPool = lookup.poolAddress || poolAddressOf(project, expectedChain);
  const expectedSymbol = text(project.symbol || project.ticker).toUpperCase();
  const expectedName = lower(project.name || project.projectName);

  let pairs = rawDexPairs(payload)
    .map((raw) => ({ raw, normalized: normalizeDexPair(raw) }))
    .filter(({ normalized }) => normalized.chain && normalized.tokenAddress);

  if (expectedChain) {
    pairs = pairs.filter(({ normalized }) => normalized.chain === expectedChain);
  }
  if (expectedToken) {
    pairs = pairs.filter(({ normalized }) => sameAddress(normalized.tokenAddress, expectedToken));
  }
  if (expectedPool) {
    pairs = pairs.filter(({ normalized }) => sameAddress(normalized.poolAddress, expectedPool));
  }
  if (!expectedToken && !expectedPool) {
    if (!expectedSymbol) return null;
    pairs = pairs.filter(({ normalized }) =>
      text(normalized.symbol).toUpperCase() === expectedSymbol &&
      (!expectedName || lower(normalized.name) === expectedName)
    );
  }

  const identityKeys = new Set(
    pairs.map(({ normalized }) => `${normalized.chain}:${lower(normalized.tokenAddress)}`)
  );
  if (identityKeys.size !== 1) return null;

  return pairs
    .sort(
      (left, right) =>
        (numberOrNull(right.normalized.liquidityUsd) || 0) -
        (numberOrNull(left.normalized.liquidityUsd) || 0)
    )[0]?.normalized || null;
}

function dexValue(pair = {}, field = "") {
  switch (field) {
    case "chain":
      return pair.chain || null;
    case "tokenAddress":
      return pair.tokenAddress || null;
    case "poolAddress":
      return pair.poolAddress || null;
    case "priceUsd":
      return numberOrNull(pair.priceUsd);
    case "liquidityUsd":
    case "stableExitLiquidityUsd":
      return numberOrNull(pair.liquidityUsd);
    case "volume24hUsd":
      return numberOrNull(pair.volume24hUsd ?? pair.volume24h);
    case "circulatingMarketCapUsd":
      return numberOrNull(pair.circulatingMarketCapUsd ?? pair.marketCap);
    case "fullyDilutedValuationUsd":
      return numberOrNull(pair.fullyDilutedValuationUsd ?? pair.fdv);
    case "estimatedMarketCapUsd":
      return numberOrNull(pair.circulatingMarketCapUsd ?? pair.marketCap ?? pair.fdv);
    case "buyTransactions24h":
      return numberOrNull(pair.buyTransactions24h);
    case "sellTransactions24h":
      return numberOrNull(pair.sellTransactions24h);
    default:
      return null;
  }
}

function observation(field, value, source, timestamp, confidence, details = {}) {
  return {
    field,
    value,
    source,
    sourceTimestamp: timestamp,
    confidence,
    verificationStatus: "VERIFIED_PROVIDER_OBSERVATION",
    recoveryRun: true,
    ...details,
  };
}

function dexObservations(pair = {}, fields = [], timestamp = new Date().toISOString(), mode = "exact") {
  const confidence = mode === "strict-unambiguous-search" ? 0.82 : 0.92;
  return fields
    .map((field) => observation(
      field,
      dexValue(pair, field),
      "dexscreener",
      timestamp,
      confidence,
      { identityMatchMode: mode }
    ))
    .filter((item) => valueKnown(item.value));
}

async function recoverDex(project = {}, fields = [], providers = {}, options = {}, state = {}) {
  const chain = chainOf(project);
  const tokenAddress = tokenAddressOf(project, chain);
  const poolAddress = poolAddressOf(project, chain);
  const allowSymbolDiscovery =
    options.allowSymbolDiscovery !== false &&
    process.env.ACTIVE_EVIDENCE_RECOVERY_SYMBOL_DISCOVERY !== "false";
  let call;
  let mode = "exact-address";

  if (chain && tokenAddress) {
    call = () => providers.getTokenPairs(chain, tokenAddress);
  } else if (chain && poolAddress) {
    call = () => providers.getPairByAddress(chain, poolAddress);
    mode = "exact-pool";
  } else if (tokenAddress || poolAddress) {
    call = () => providers.searchDexPairs(tokenAddress || poolAddress);
    mode = "strict-unambiguous-search";
  } else if (allowSymbolDiscovery && text(project.symbol || project.name)) {
    call = () => providers.searchDexPairs(text(project.symbol || project.name));
    mode = "strict-unambiguous-search";
  } else {
    return {
      observations: [],
      attempts: [{
        status: "NOT_APPLICABLE",
        provider: "dexscreener",
        reason: "No exact identity was available and strict discovery search was disabled.",
        durationMs: 0,
      }],
    };
  }

  const attempt = await executeProviderCall(
    "dexscreener",
    call,
    options,
    state,
    1,
    chain || "unresolved"
  );
  if (attempt.status !== "SUCCESS") return { observations: [], attempts: [attempt] };
  const pair = strictDexPair(attempt.value, project, { chain, tokenAddress, poolAddress });
  if (!pair) {
    return {
      observations: [],
      attempts: [{
        ...attempt,
        status: "AMBIGUOUS_OR_NO_EXACT_MATCH",
        reason: "DexScreener did not return one unambiguous chain/token identity.",
        value: undefined,
      }],
    };
  }

  return {
    observations: dexObservations(
      pair,
      [...new Set([...fields, ...DEX_COMPANION_FIELDS])],
      options.now?.().toISOString?.() || new Date().toISOString(),
      mode
    ),
    attempts: [{ ...attempt, value: undefined, matchedIdentity: `${pair.chain}:${pair.tokenAddress}` }],
  };
}

function knownSecurityItems(result = {}) {
  return (Array.isArray(result.evidence) ? result.evidence : []).filter(
    (item) => item && item.status !== "UNKNOWN"
  );
}

function securitySourceEligible(item = {}, field = "") {
  const provider = lower(item.provider);
  if (field === "contractVerified") return Object.hasOwn(item, "verifiedSource");
  if (["honeypotDetected", "sellRestricted", "blacklistEnabled", "buyTaxPct", "sellTaxPct", "holderCount"].includes(field)) {
    return provider.includes("goplus") || provider.includes("solana") || provider.includes("rugcheck");
  }
  if (field === "mintAuthorityEnabled") {
    return provider.includes("goplus") || provider.includes("solana") || provider.includes("rugcheck");
  }
  return false;
}

function securityValue(items = [], field = "") {
  const capable = items.filter((item) => securitySourceEligible(item, field));
  if (!capable.length) return null;
  switch (field) {
    case "honeypotDetected":
      return capable.some((item) => item.honeypot === true);
    case "sellRestricted":
    case "blacklistEnabled":
      return capable.some((item) => item.blacklistRisk === true);
    case "contractVerified":
      return capable.some((item) => item.verifiedSource === true);
    case "mintAuthorityEnabled":
      return capable.some((item) => item.mintRisk === true);
    case "holderCount":
      return first(capable.map((item) => numberOrNull(item.holderCount)));
    case "buyTaxPct":
      return first(capable.map((item) => numberOrNull(item.buyTaxPct)));
    case "sellTaxPct":
      return first(capable.map((item) => numberOrNull(item.sellTaxPct)));
    default:
      return null;
  }
}

async function recoverSecurity(project = {}, fields = [], providers = {}, options = {}, state = {}) {
  const chain = chainOf(project);
  const tokenAddress = tokenAddressOf(project, chain);
  if (!chain || !tokenAddress) {
    return {
      observations: [],
      attempts: [{
        status: "NOT_APPLICABLE",
        provider: "free-security",
        reason: "Security recovery requires exact chain and token identity.",
        durationMs: 0,
      }],
      projectPatch: {},
    };
  }
  const attempt = await executeProviderCall(
    "free-security",
    () => providers.getFreeSecurityEvidence(
      { ...project, chain, tokenAddress, contractAddress: project.contractAddress || tokenAddress },
      options.securityEvidence || options
    ),
    options,
    state,
    Math.max(1, Number(options.securityProviderRequestCost || 4)),
    chain
  );
  if (attempt.status !== "SUCCESS") {
    return { observations: [], attempts: [attempt], projectPatch: {} };
  }

  const result = attempt.value || {};
  const items = knownSecurityItems(result);
  const observations = fields
    .map((field) => {
      const capable = items.filter((item) => securitySourceEligible(item, field));
      const value = securityValue(items, field);
      if (!valueKnown(value) || !capable.length) return null;
      const sourceItem = capable.find((item) => {
        if (field === "honeypotDetected") return item.honeypot === value;
        if (["sellRestricted", "blacklistEnabled"].includes(field)) return item.blacklistRisk === value;
        if (field === "contractVerified") return item.verifiedSource === value;
        if (field === "mintAuthorityEnabled") return item.mintRisk === value;
        return valueKnown(item[field]);
      }) || capable[0];
      return observation(
        field,
        value,
        lower(sourceItem.provider || "free-security"),
        sourceItem.observedAt || result.observedAt || new Date().toISOString(),
        Math.max(0, Math.min(1, Number(sourceItem.confidence || result.summary?.confidence || 0) / 100))
      );
    })
    .filter(Boolean);

  return {
    observations,
    attempts: [{ ...attempt, value: undefined, providers: result.summary?.knownProviders || [] }],
    projectPatch: {
      freeSecurityEvidence: result,
      securityEvidence: result.evidence || [],
      securityEvidenceSummary: result.summary || null,
    },
  };
}

function aggregateValue(candidate = {}, field = "") {
  switch (field) {
    case "priceUsd":
      return numberOrNull(candidate.priceUsd);
    case "volume24hUsd":
      return numberOrNull(candidate.volume24hUsd ?? candidate.volume24h);
    case "circulatingMarketCapUsd":
      return numberOrNull(candidate.circulatingMarketCapUsd ?? candidate.marketCap);
    case "fullyDilutedValuationUsd":
      return numberOrNull(candidate.fullyDilutedValuationUsd ?? candidate.fullyDilutedValueUsd ?? candidate.fdv);
    case "estimatedMarketCapUsd":
      return numberOrNull(candidate.circulatingMarketCapUsd ?? candidate.marketCap ?? candidate.fdv);
    default:
      return null;
  }
}

function aggregateObservations(candidate = {}, fields = [], source = "aggregate-market") {
  const timestamp = new Date().toISOString();
  return fields
    .map((field) => observation(field, aggregateValue(candidate, field), source, timestamp, 0.78, {
      providerAssetId: candidate.providerAssetId || candidate.coinGeckoId || candidate.coinPaprikaId || null,
    }))
    .filter((item) => valueKnown(item.value));
}

async function recoverCoinGecko(project = {}, fields = [], providers = {}, options = {}, state = {}) {
  const id = text(first([
    project.verifiedCoinGeckoId,
    project.coinGeckoId,
    project.coingeckoId,
    lower(project.marketKey).startsWith("coingecko:") ? text(project.marketKey).split(":").slice(1).join(":") : null,
  ]));
  if (!id) return { observations: [], attempts: [] };
  const attempt = await executeProviderCall(
    "coingecko",
    () => providers.getCoinGeckoMarketsByIds([id], options.coinGecko || options),
    options,
    state,
    1
  );
  if (attempt.status !== "SUCCESS") return { observations: [], attempts: [attempt] };
  const raw = (Array.isArray(attempt.value) ? attempt.value : []).find(
    (coin) => text(coin?.id) === id
  );
  if (!raw) {
    return {
      observations: [],
      attempts: [{ ...attempt, status: "NO_EXACT_ID_MATCH", value: undefined }],
    };
  }
  const candidate = normalizeCoinGeckoMarket(raw);
  return {
    observations: aggregateObservations(candidate, fields, "coingecko"),
    attempts: [{ ...attempt, value: undefined, providerAssetId: id }],
  };
}

async function recoverCoinPaprika(project = {}, fields = [], providers = {}, options = {}, state = {}) {
  const id = text(first([
    project.verifiedCoinPaprikaId,
    project.coinPaprikaId,
    project.coinpaprikaId,
    lower(project.marketKey).startsWith("coinpaprika:") ? text(project.marketKey).split(":").slice(1).join(":") : null,
  ]));
  if (!id) return { observations: [], attempts: [] };
  const attempt = await executeProviderCall(
    "coinpaprika",
    () => providers.getCoinPaprikaTickerById(id, options.coinPaprika || options),
    options,
    state,
    1
  );
  if (attempt.status !== "SUCCESS") return { observations: [], attempts: [attempt] };
  const candidate = attempt.value;
  if (!candidate || text(candidate.coinPaprikaId) !== id) {
    return {
      observations: [],
      attempts: [{ ...attempt, status: "NO_EXACT_ID_MATCH", value: undefined }],
    };
  }
  return {
    observations: aggregateObservations(candidate, fields, "coinpaprika"),
    attempts: [{ ...attempt, value: undefined, providerAssetId: id }],
  };
}

export async function executeActiveEvidenceProviderRequests(
  project = {},
  requests = [],
  options = {},
  executionState = createActiveEvidenceExecutionState(options)
) {
  const providers = providerFunctions(options);
  const fields = [...new Set((Array.isArray(requests) ? requests : []).map(fieldOf).filter(Boolean))];
  const sources = targetSourceNames(requests);
  const attempts = [];
  const observations = [];
  let projectPatch = {};

  const dexFields = fields.filter((field) => DEX_FIELDS.has(field));
  if (
    dexFields.length &&
    sourceRequested(sources, ["dexscreener", "geckoterminal", "native rpc"])
  ) {
    const result = await recoverDex(project, dexFields, providers, options, executionState);
    observations.push(...result.observations);
    attempts.push(...result.attempts);
  }

  const recoveredFields = new Set(observations.map((item) => item.field));
  const deployerFields = fields.filter(
    (field) => DEPLOYER_FIELDS.has(field) && !recoveredFields.has(field)
  );
  const walletFields = fields.filter(
    (field) => WALLET_RAW_FIELDS.has(field) && !recoveredFields.has(field)
  );
  const securityFields = fields.filter(
    (field) => SECURITY_FIELDS.has(field) && !recoveredFields.has(field)
  );
  const aggregateFields = fields.filter(
    (field) => AGGREGATE_MARKET_FIELDS.has(field) && !recoveredFields.has(field)
  );
  const parallel = [];
  if (
    deployerFields.length &&
    sourceRequested(sources, ["sourcify", "blockscout", "block explorers", "explorer", "native rpc", "security providers"])
  ) {
    parallel.push(
      recoverDeployerEvidence(project, deployerFields, providers, options, executionState).then((result) => ({
        kind: "deployer",
        result,
      }))
    );
  }
  if (
    walletFields.length &&
    sourceRequested(sources, ["blockscout", "block explorers", "explorer", "chain rpc", "wallet history", "supabase"])
  ) {
    parallel.push(
      recoverWalletEvidence(project, walletFields, providers, options, executionState).then((result) => ({
        kind: "wallets",
        result,
      }))
    );
  }
  if (
    securityFields.length &&
    sourceRequested(sources, ["goplus", "sourcify", "blockscout", "rugcheck", "explorer", "chain rpc"])
  ) {
    parallel.push(
      recoverSecurity(project, securityFields, providers, options, executionState).then((result) => ({
        kind: "security",
        result,
      }))
    );
  }
  if (
    aggregateFields.length &&
    sourceRequested(sources, ["coingecko"])
  ) {
    parallel.push(
      recoverCoinGecko(project, aggregateFields, providers, options, executionState).then((result) => ({
        kind: "coingecko",
        result,
      }))
    );
  }
  if (
    aggregateFields.length &&
    sourceRequested(sources, ["coinpaprika"])
  ) {
    parallel.push(
      recoverCoinPaprika(project, aggregateFields, providers, options, executionState).then((result) => ({
        kind: "coinpaprika",
        result,
      }))
    );
  }

  for (const { result } of await Promise.all(parallel)) {
    observations.push(...(result.observations || []));
    attempts.push(...(result.attempts || []));
    projectPatch = { ...projectPatch, ...(result.projectPatch || {}) };
  }

  const bestByField = new Map();
  for (const item of observations) {
    const current = bestByField.get(item.field);
    if (!current || Number(item.confidence || 0) > Number(current.confidence || 0)) {
      bestByField.set(item.field, item);
    }
  }

  return {
    observations: [...bestByField.values()],
    attempts,
    projectPatch,
  };
}

export function summarizeActiveEvidenceExecutionState(state = {}) {
  return {
    maxRequests: state.maxRequests || 0,
    requestsUsed: state.requestsUsed || 0,
    providers: [...(state.providers?.values?.() || [])].map((provider) => ({ ...provider })),
  };
}

export async function mapWithBoundedConcurrency(items = [], concurrency = 4, worker = async (item) => item) {
  const input = Array.isArray(items) ? items : [];
  const output = new Array(input.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(input.length || 1, Math.floor(Number(concurrency) || 1)));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < input.length) {
        const index = cursor;
        cursor += 1;
        output[index] = await worker(input[index], index);
      }
    })
  );
  return output;
}
