import {
  getPairByAddress,
  getTokenPairs,
  normalizeDexPair,
  searchDexPairs,
} from "./dexScreenerConnector.js";
import {
  getGeckoPoolByAddress,
  normalizeGeckoPool,
  resolveGeckoTerminalNetworkId,
} from "./geckoTerminalConnector.js";
import {
  getCoinGeckoMarketsByIds,
  normalizeCoinGeckoMarket,
} from "./coinGeckoConnector.js";
import { getCoinPaprikaTickerById } from "./freeMarketDataConnector.js";
import { getDefiLlamaExactPrice } from "./defiLlamaExactPriceConnector.js";
import { getFreeSecurityEvidence } from "./security/freeSecurityEvidenceConnector.js";
import { getRugCheckFullTokenEvidence } from "./security/solanaSecurityConnector.js";
import { securityHolderObservations } from "./security/securityWalletEvidence.js";
import {
  getBlockscoutDeployerEvidence,
  getBlockscoutSecurityEvidence,
} from "./security/blockscoutConnector.js";
import {
  etherscanV2ApiKey,
  getEtherscanV2SecurityEvidence,
} from "./security/etherscanV2Connector.js";
import { getGoPlusSecurityEvidence } from "./security/goplusSecurityConnector.js";
import { waitForGoPlusRequestSlot } from "./security/goplusRequestLimiter.js";
import { getCachedSecurityEvidence, summarizeSecurityEvidence } from "./security/securityEvidenceUtils.js";
import { getSourcifySecurityEvidence } from "./security/sourcifyV2Connector.js";
import { getBlockscoutWalletEvidence } from "./blockscoutWalletConnector.js";
import { getRpcWalletEvidence } from "./rpcWalletEvidenceConnector.js";
import { appendWalletParticipationHistory, loadWalletParticipationHistory, normalizeWalletParticipationObservation, walletParticipationHistoryFor } from "./walletParticipationHistoryStore.js";
import { getBaseB20LifecycleEvidence, isBaseB20Candidate, isVerifiedBaseB20Evidence } from "./baseB20LifecycleConnector.js";
import { analyzeExecutionProofRecoveryBatch } from "../engines/executionProofRecoveryEngine.js";
import { extractLiFiRoutePoolAddresses, verifyActionIdentity } from "../execution/lifiExecutableQuoteProvider.js";
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

// GeckoTerminal recovery is intentionally market-data-only. Its public pool
// endpoint is useful for an exact pool fallback, but it cannot establish an
// executable route, price impact, or stable exit liquidity.
const GECKO_FIELDS = new Set([
  "chain",
  "tokenAddress",
  "poolAddress",
  "priceUsd",
  "liquidityUsd",
  "volume24hUsd",
]);

const GECKO_COMPANION_FIELDS = [
  "chain",
  "tokenAddress",
  "poolAddress",
  "priceUsd",
  "liquidityUsd",
  "volume24hUsd",
];

// DeFiLlama's free contract-price endpoint is an exact token-price fallback.
// It cannot establish pool liquidity, volume, or execution route truth.
const DEFILLAMA_EXACT_PRICE_FIELDS = new Set(["priceUsd"]);

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
  "walletTransactions",
  "walletParticipationHistory",
]);

const EXECUTION_RAW_FIELDS = new Set([
  "purchaseRouteConfirmed", "sellRouteAvailable", "quoteTimestamp",
  "slippagePct", "priceImpactPct", "executableDepthUsd", "verifiedTradeSizeUsd",
  "orderBookDepthUsd", "bidDepthUsd", "askDepthUsd", "spreadPct",
]);

const EXECUTION_ROUTE_FIELDS = [
  "source", "provider", "venue", "underlyingVenue", "routeType", "chain", "chainId",
  "tokenAddress", "contractAddress", "baseTokenAddress", "poolAddress", "routePoolAddresses",
  "marketPair", "quoteAsset", "quoteTokenAddress", "buyRouteAvailable", "sellRouteAvailable",
  "buyQuoteVerified", "sellQuoteVerified", "quoteVerified", "quoteTimestamp",
  "slippagePct", "priceImpactPct", "estimatedRoundTripSlippagePct", "slippageIsHeuristic",
  "executableDepthUsd", "verifiedTradeSizeUsd", "verifiedDepthSource", "orderBookDepthVerified",
  "orderBookDepthUsd", "bidDepthUsd", "askDepthUsd", "spreadPct", "buyQuote", "sellQuote",
];

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
    getBaseB20LifecycleEvidence: injected.getBaseB20LifecycleEvidence || options.getBaseB20LifecycleEvidence || getBaseB20LifecycleEvidence,
    useBaseB20Lifecycle: Boolean(injected.getBaseB20LifecycleEvidence || options.getBaseB20LifecycleEvidence) || (!customDeployerProvider && !customSourcifyProvider),
    getTokenPairs: injected.getTokenPairs || options.getTokenPairs || getTokenPairs,
    getPairByAddress: injected.getPairByAddress || options.getPairByAddress || getPairByAddress,
    searchDexPairs: injected.searchDexPairs || options.searchDexPairs || searchDexPairs,
    getGeckoPoolByAddress:
      injected.getGeckoPoolByAddress ||
      options.getGeckoPoolByAddress ||
      getGeckoPoolByAddress,
    getFreeSecurityEvidence:
      injected.getFreeSecurityEvidence ||
      options.getFreeSecurityEvidence ||
      getFreeSecurityEvidence,
    defaultFreeSecurityProvider: !injected.getFreeSecurityEvidence && !options.getFreeSecurityEvidence,
    getBlockscoutDeployerEvidence:
      injected.getBlockscoutDeployerEvidence ||
      injected.getDeployerEvidence ||
      options.getBlockscoutDeployerEvidence ||
      getBlockscoutDeployerEvidence,
    blockscoutDeployerRequestCost: customDeployerProvider ? 1 : 2,
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
    preferGoPlusDeployer: !customDeployerProvider && !customSourcifyProvider,
    defaultGoPlusDeployerProvider:
      !injected.getGoPlusDeployerEvidence && !injected.getGoPlusSecurityEvidence && !options.getGoPlusDeployerEvidence,
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
    getRpcWalletEvidence: injected.getRpcWalletEvidence || options.getRpcWalletEvidence || getRpcWalletEvidence,
    getSolanaWalletEvidence: injected.getSolanaWalletEvidence || options.getSolanaWalletEvidence || getRugCheckFullTokenEvidence,
    useRpcWalletFallback: Boolean(injected.getRpcWalletEvidence || options.getRpcWalletEvidence) ||
      !(injected.getBlockscoutWalletEvidence || injected.getWalletEvidence || options.getBlockscoutWalletEvidence),
    getCoinGeckoMarketsByIds:
      injected.getCoinGeckoMarketsByIds ||
      options.getCoinGeckoMarketsByIds ||
      getCoinGeckoMarketsByIds,
    getCoinPaprikaTickerById:
      injected.getCoinPaprikaTickerById ||
      options.getCoinPaprikaTickerById ||
      getCoinPaprikaTickerById,
    getDefiLlamaExactPrice:
      injected.getDefiLlamaExactPrice ||
      options.getDefiLlamaExactPrice ||
      getDefiLlamaExactPrice,
  };
}

export function resolveActiveEvidenceRequestBudget(options = {}, defaultBudget = 500) {
  const raw = options.maxProviderRequests ?? options.maxRequests ??
    process.env.ACTIVE_EVIDENCE_MAX_PROVIDER_REQUESTS ??
    process.env.ACTIVE_EVIDENCE_RECOVERY_MAX_PROVIDER_REQUESTS ??
    process.env.ACTIVE_EVIDENCE_RECOVERY_MAX_REQUESTS ?? defaultBudget;
  if (typeof raw !== "number" && typeof raw !== "string") return 0;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER
    ? Math.floor(value) : 0;
}

export function createActiveEvidenceExecutionState(options = {}) {
  const now = options.now || Date.now;
  const timeBudgetMs = Number(options.timeBudgetMs);
  const maxRequests = resolveActiveEvidenceRequestBudget(options);
  const circuitFailureThreshold = Math.max(
    1,
    Number(
      options.circuitFailureThreshold ||
        process.env.ACTIVE_EVIDENCE_RECOVERY_CIRCUIT_FAILURES ||
        3
    )
  );

  return {
    now,
    deadlineAt: options.deadlineAt ?? (Number.isFinite(timeBudgetMs) && timeBudgetMs >= 0
      ? now() + timeBudgetMs : Number.POSITIVE_INFINITY),
    timeBudgetExceeded: false,
    timeBudgetSkippedCalls: 0,
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
  circuitScope = null,
  beforeOperation = null
) {
  const health = providerState(state, provider, circuitScope);
  if ((state.now || Date.now)() >= (state.deadlineAt ?? Number.POSITIVE_INFINITY)) {
    health.skipped += 1;
    state.timeBudgetExceeded = true;
    state.timeBudgetSkippedCalls = (state.timeBudgetSkippedCalls || 0) + 1;
    return {
      status: "TIME_BUDGET_EXHAUSTED",
      provider,
      value: null,
      reason: "Recovery time budget exhausted; missing evidence remains unknown.",
      durationMs: 0,
    };
  }
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

  if (beforeOperation) {
    const slotReserved = await beforeOperation();
    // Another queued operation may have exhausted the budget or opened the circuit.
    if (health.circuitOpen || state.requestsUsed + cost > state.maxRequests ||
        (state.now || Date.now)() >= (state.deadlineAt ?? Number.POSITIVE_INFINITY)) {
      return executeProviderCall(provider, operation, options, state, cost, circuitScope);
    }
    if (slotReserved === false) {
      health.skipped += 1;
      const retryAtMs = (options.goPlusRateLimiter || waitForGoPlusRequestSlot).cooldownUntil?.();
      return { status: "PROVIDER_COOLDOWN", provider, value: null, durationMs: 0,
        retryAt: Number.isFinite(retryAtMs) ? new Date(retryAtMs).toISOString() : null,
        reason: "Provider cooldown active; independent recovery fallbacks remain available." };
    }
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
    if (value?.candidateEvidenceUnavailable === true) {
      health.noDataResponses = (health.noDataResponses || 0) + 1;
      return { status: "NO_CANDIDATE_EVIDENCE", provider, value: null,
        reason: value.reason || "Provider returned no evidence for this candidate.", durationMs: Date.now() - startedAt };
    }
    if (value?.providerFailure === true && value.rateLimited === true) {
      health.rateLimitResponses = (health.rateLimitResponses || 0) + 1;
      return {
        status: "RATE_LIMITED",
        provider,
        value: null,
        reason: value.warnings?.[0] || "Provider rate limit reached; later calls wait for quota recovery.",
        durationMs: Date.now() - startedAt,
      };
    }
    if (value?.providerFailure === true) {
      throw new Error(value.warnings?.[0] || `${provider} acquisition failed`);
    }
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
  const creator = /^0x[0-9a-f]{40}$/.test(rawCreator) && !/^0x0{40}$/.test(rawCreator) ? rawCreator : null;
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
    case "nativeLifecycle":
      return isVerifiedBaseB20Evidence(result) ? result.nativeLifecycle : null;
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
  if (!deployerValue(result, "creatorAddress") && !isVerifiedBaseB20Evidence(result)) return false;
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
    project.sourcifyDeployerEvidence,
    project.etherscanDeployerEvidence,
    project.baseB20LifecycleEvidence,
  ].filter(Boolean);
  return candidates.find(
    (item) =>
      item.status !== "UNKNOWN" &&
      (!lower(item.provider || item.source).includes("goplus") || item.responseIdentityVerified === true) &&
      normalizeChainId(item.chain) === identity.chain &&
      lower(item.address || item.tokenAddress) === lower(identity.tokenAddress) &&
      exactDeployerResult(item, identity)
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
    "nativeLifecycle",
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
    let existing = existingDeployerEvidence(project, evm);
    if (!existing && providers.preferGoPlusDeployer && providers.defaultGoPlusDeployerProvider && options.useCache !== false) {
      const readCached = options.readCachedSecurityEvidence || getCachedSecurityEvidence;
      for (const source of ["goplus", "sourcify-v2", "blockscout-deployer", "etherscan-v2", "base-b20-native"]) {
        const cached = readCached(source, evm.chain, evm.tokenAddress, options.cacheTtlMs);
        existing = existingDeployerEvidence({ securityEvidence: cached ? [cached] : [] }, evm);
        if (existing) break;
      }
    }
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
        projectPatch: lower(source).includes("goplus") ? { goplusDeployerEvidence: existing } : {},
      };
    }

    if (providers.useBaseB20Lifecycle && isBaseB20Candidate({ chain: evm.chain, tokenAddress: evm.tokenAddress })) {
      const attempt = await executeProviderCall("base-b20-native",
        () => providers.getBaseB20LifecycleEvidence({ ...project, chain: evm.chain, tokenAddress: evm.tokenAddress }, options),
        options, state, 4, evm.chain);
      const result = attempt.value || {};
      if (attempt.status === "SUCCESS" && isVerifiedBaseB20Evidence(result) && result.address === evm.tokenAddress) {
        return { observations: deployerObservations(result, fields, evm, "base-b20-native"),
          attempts: [{ ...attempt, value: undefined }], projectPatch: { baseB20LifecycleEvidence: result } };
      }
      const fallback = await recoverDeployerEvidence(project, fields,
        { ...providers, useBaseB20Lifecycle: false }, options, state);
      return { ...fallback, attempts: [{ ...attempt, value: undefined }, ...fallback.attempts],
        projectPatch: { baseB20LifecycleEvidence: result, ...fallback.projectPatch } };
    }

    let goplusAttempt = null;
    let goplusResult = {};
    if (providers.preferGoPlusDeployer) {
      goplusAttempt = await executeProviderCall(
        "goplus-deployer",
        () => providers.getGoPlusDeployerEvidence(
          { ...project, chain: evm.chain, tokenAddress: evm.tokenAddress },
          { ...options, useCache: options.useCache, goPlusRequestSlotReserved: providers.defaultGoPlusDeployerProvider }
        ),
        options,
        state,
        Math.max(1, Number(options.goplusDeployerProviderRequestCost || 1)),
        evm.chain,
        providers.defaultGoPlusDeployerProvider ? () => (options.goPlusRateLimiter || waitForGoPlusRequestSlot)({ deadlineAt: state.deadlineAt, waitForCooldown: false }) : null
      );
      goplusResult = goplusAttempt.value || {};
      if (goplusAttempt.status === "SUCCESS" && exactDeployerResult(goplusResult, evm)) {
        return {
          observations: deployerObservations(goplusResult, fields, evm, "goplus"),
          attempts: [{ ...goplusAttempt, value: undefined }],
          projectPatch: { goplusDeployerEvidence: goplusResult },
        };
      }
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
          attempts: [
            ...(goplusAttempt ? [{ ...goplusAttempt, value: undefined }] : []),
            { ...sourcifyAttempt, value: undefined },
          ],
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
      Math.max(1, Number(options.deployerProviderRequestCost || providers.blockscoutDeployerRequestCost || 2)),
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
          ...(goplusAttempt ? [{ ...goplusAttempt, value: undefined }] : []),
          ...(sourcifyAttempt ? [{ ...sourcifyAttempt, value: undefined }] : []),
          { ...blockscoutAttempt, value: undefined },
        ],
        projectPatch: {
          ...(sourcifyAttempt ? { sourcifyDeployerEvidence: sourcifyResult } : {}),
          blockscoutDeployerEvidence: blockscoutResult,
        },
      };
    }

    if (providers.useGoPlusDeployerFallback && !goplusAttempt) {
      goplusAttempt = await executeProviderCall(
        "goplus-deployer",
        () => providers.getGoPlusDeployerEvidence(
          { ...project, chain: evm.chain, tokenAddress: evm.tokenAddress },
          { ...options, useCache: options.useCache, goPlusRequestSlotReserved: providers.defaultGoPlusDeployerProvider }
        ),
        options,
        state,
        Math.max(1, Number(options.goplusDeployerProviderRequestCost || 1)),
        evm.chain,
        providers.defaultGoPlusDeployerProvider ? () => (options.goPlusRateLimiter || waitForGoPlusRequestSlot)({ deadlineAt: state.deadlineAt, waitForCooldown: false }) : null
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
  if (chainOf(project) === "solana") {
    const tokenAddress = tokenAddressOf(project, "solana");
    const capableFields = ["wallets", "holderAddresses", "holderCount"];
    if (!tokenAddress || !fields.some((field) => capableFields.includes(field))) return {
      observations: [], attempts: [{ provider: "rugcheck-solana-full", status: "NOT_APPLICABLE", durationMs: 0,
        reason: "Exact Solana mint and supported holder-owner fields are required." }], projectPatch: {},
    };
    const localItems = [project.solanaWalletEvidence,
      ...(Array.isArray(project.securityEvidence) ? project.securityEvidence : [])].filter(Boolean);
    if (options.useCache !== false) {
      const cached = (options.readCachedSecurityEvidence || getCachedSecurityEvidence)("rugcheck-solana-full", "solana", tokenAddress, options.cacheTtlMs);
      if (cached) localItems.push(cached);
    }
    const local = securityHolderObservations(project, localItems, options);
    if (fields.every((field) => local.some((item) => item.field === field))) return {
      observations: local, attempts: [{ provider: "rugcheck-solana-full", status: "LOCAL_EVIDENCE_AVAILABLE", durationMs: 0 }], projectPatch: {},
    };
    const attempt = await executeProviderCall("rugcheck-solana-full",
      () => providers.getSolanaWalletEvidence({ ...project, chain: "solana", tokenAddress }, options), options, state, 1, "solana");
    const result = attempt.value || {};
    const observations = securityHolderObservations(project, [result], options);
    if (observations.length && fields.includes("holderCount") && Number.isSafeInteger(result.holderCount) && result.holderCount >= 0) {
      observations.push({ ...observations[0], field: "holderCount", value: result.holderCount, holderSampleOnly: false,
        holderCountSemantics: "PROVIDER_REPORTED_COUNT_NOT_SAMPLE_COUNT" });
    }
    return { observations: [...local, ...observations], attempts: [{ ...attempt, value: undefined }],
      projectPatch: result.status === "EVIDENCE_AVAILABLE" && observations.length ? { solanaWalletEvidence: result } : {} };
  }
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
  const result = attempt.value || {};
  const timestamp = result.observedAt || new Date().toISOString();
  const exactResult = (!result.chain || normalizeChainId(result.chain) === evm.chain) &&
    (!result.tokenAddress || lower(result.tokenAddress) === lower(evm.tokenAddress));
  const companionFields = ["wallets", "holderAddresses", "buyerAddresses", "sellerAddresses", "walletTransactions", "walletParticipationHistory"];
  const observations = attempt.status === "SUCCESS" && result.status === "EVIDENCE_AVAILABLE" && exactResult ? [...new Set([...fields, ...companionFields])]
    .map((field) => observation(field, result[field], "blockscout-wallets", timestamp, 0.82, {
      chain: evm.chain,
      tokenAddress: evm.tokenAddress,
      poolAddress: result.poolAddress || null,
      exactPoolIdentity: result.exactPoolIdentity === true,
    }))
    .filter((item) => valueKnown(item.value)) : [];
  const attempts = [{ ...attempt, value: undefined }];
  let rpcResult = null;
  const rpcFields = ["wallets", "walletTransactions", "walletParticipationHistory"];
  const missingRpcField = fields.some((field) => rpcFields.includes(field) &&
    !observations.some((item) => item.field === field));
  if (providers.useRpcWalletFallback && (missingRpcField || !observations.some((item) => companionFields.includes(item.field)))) {
    const rpcAttempt = await executeProviderCall("rpc-wallets",
      () => providers.getRpcWalletEvidence({ ...project, chain: evm.chain, tokenAddress: evm.tokenAddress }, options),
      options, state, 3, evm.chain);
    attempts.push({ ...rpcAttempt, value: undefined });
    rpcResult = rpcAttempt.value;
    if (rpcAttempt.status === "SUCCESS" && rpcResult?.status === "EVIDENCE_AVAILABLE" &&
      rpcResult.exactTokenIdentity === true && normalizeChainId(rpcResult.chain) === evm.chain &&
      lower(rpcResult.tokenAddress) === lower(evm.tokenAddress)) {
      for (const field of rpcFields) {
        if (valueKnown(rpcResult[field]) && !observations.some((item) => item.field === field)) observations.push(observation(field, rpcResult[field], "rpc-wallets",
          rpcResult.observedAt, confidenceFraction(rpcResult.confidence), { chain: evm.chain,
            tokenAddress: evm.tokenAddress, transferCoverage: rpcResult.transferCoverage }));
      }
    }
  }
  return {
    observations,
    attempts,
    projectPatch: { blockscoutWalletEvidence: result, ...(rpcResult ? { rpcWalletEvidence: rpcResult } : {}) },
  };
}

async function recoverWalletEvidenceWithHistory(project, fields, providers, options, state) {
  if (options.walletHistory === false) return recoverWalletEvidence(project, fields, providers, options, state);
  const historyOptions = options.walletHistory || {};
  const identity = { ...project, chain: chainOf(project), tokenAddress: tokenAddressOf(project) };
  const attempts = [];
  if (!state.walletHistoryRecords) {
    try { state.walletHistoryRecords = loadWalletParticipationHistory(historyOptions); }
    catch (error) {
      state.walletHistoryRecords = [];
      attempts.push({ provider: "wallet-history database", status: "MEMORY_READ_FAILED", reason: error.message, requestCost: 0 });
    }
  }
  let history = walletParticipationHistoryFor(identity, { ...historyOptions, records: state.walletHistoryRecords });
  const historyEvidence = (rows) => rows.length ? observation("walletParticipationHistory", rows,
    "wallet-history database", rows.map((row) => row.sourceTimestamp).sort().at(-1), Math.min(...rows.map((row) => row.confidence)),
    { chain: identity.chain, tokenAddress: identity.tokenAddress, historicalOnly: true,
      verificationStatus: "VERIFIED_HISTORICAL_RAW_OBSERVATION" }) : null;
  let historyObservation = historyEvidence(history);
  if (historyObservation) attempts.push({ provider: "wallet-history database", status: "LOCAL_EVIDENCE_AVAILABLE", requestCost: 0 });
  const liveFields = fields.filter((field) => field !== "walletParticipationHistory" || !historyObservation);
  const result = liveFields.length ? await recoverWalletEvidence(project, liveFields, providers, options, state)
    : { observations: [], attempts: [], projectPatch: {} };
  for (const evidence of [result.projectPatch?.blockscoutWalletEvidence, result.projectPatch?.rpcWalletEvidence]) {
    if (!evidence) continue;
    const raw = normalizeWalletParticipationObservation(identity, evidence, historyOptions);
    if (!raw) continue;
    state.walletHistoryRecords.push(raw);
    state.walletHistoryRecords = state.walletHistoryRecords.slice(-5000);
    try {
      appendWalletParticipationHistory(identity, evidence, historyOptions);
    } catch (error) {
      attempts.push({ provider: "wallet-history database", status: "MEMORY_WRITE_FAILED", reason: error.message, requestCost: 0 });
    }
  }
  history = walletParticipationHistoryFor(identity, { ...historyOptions, records: state.walletHistoryRecords });
  historyObservation = historyEvidence(history);
  return { ...result, attempts: [...attempts, ...result.attempts],
    observations: [...result.observations.filter((item) => item.field !== "walletParticipationHistory"),
      ...(historyObservation ? [historyObservation] : [])],
    projectPatch: { ...result.projectPatch, ...(history.length ? { walletHistory: {
      chain: identity.chain, tokenAddress: identity.tokenAddress, historicalOnly: true,
      walletParticipationHistory: history, smartWallets: null,
    } } : {}) } };
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

function strictGeckoPool(payload, project = {}, lookup = {}) {
  const expectedChain = lookup.chain || chainOf(project);
  const expectedToken = lookup.tokenAddress || tokenAddressOf(project, expectedChain);
  const expectedPool = lookup.poolAddress || poolAddressOf(project, expectedChain);
  if (!expectedChain || !expectedToken || !expectedPool) return null;

  const raw = payload?.data || payload?.pool || payload;
  if (!raw || Array.isArray(raw) || typeof raw !== "object") return null;
  const normalized = normalizeGeckoPool(raw);
  const chain = normalizeChainId(normalized.chain);
  const tokenAddress = normalizeTokenAddress(normalized.tokenAddress, chain);
  const poolAddress = normalizePoolAddress(normalized.poolAddress, chain);
  if (
    chain !== expectedChain ||
    tokenAddress !== expectedToken ||
    poolAddress !== expectedPool
  ) return null;

  return { ...normalized, chain, tokenAddress, poolAddress };
}

function geckoValue(pool = {}, field = "") {
  switch (field) {
    case "chain":
      return pool.chain || null;
    case "tokenAddress":
      return pool.tokenAddress || null;
    case "poolAddress":
      return pool.poolAddress || null;
    case "priceUsd":
      return numberOrNull(pool.priceUsd);
    case "liquidityUsd":
      return numberOrNull(pool.liquidityUsd);
    case "volume24hUsd":
      return numberOrNull(pool.volume24hUsd ?? pool.volume24h);
    default:
      return null;
  }
}

function geckoObservations(pool = {}, fields = [], timestamp = new Date().toISOString()) {
  return fields
    .map((field) => observation(
      field,
      geckoValue(pool, field),
      "geckoterminal",
      timestamp,
      0.9,
      {
        identityMatchMode: "exact-pool",
        marketEvidenceOnly: true,
        geckoTerminalPoolId: pool.geckoTerminalPoolId || null,
        endpoint: "exact-pool",
      }
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

async function recoverGeckoPool(project = {}, fields = [], providers = {}, options = {}, state = {}) {
  const chain = chainOf(project);
  const tokenAddress = tokenAddressOf(project, chain);
  const poolAddress = poolAddressOf(project, chain);
  if (!chain || !tokenAddress || !poolAddress || !resolveGeckoTerminalNetworkId(chain)) {
    return {
      observations: [],
      attempts: [{
        status: "NOT_APPLICABLE",
        provider: "geckoterminal",
        reason: "GeckoTerminal fallback requires an exact supported chain, token, and pool identity.",
        durationMs: 0,
      }],
    };
  }

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
  const attempt = await executeProviderCall(
    "geckoterminal",
    () => providers.getGeckoPoolByAddress(chain, poolAddress, { maxAttempts: 1, timeoutMs }),
    options,
    state,
    1,
    chain
  );
  if (attempt.status !== "SUCCESS") return { observations: [], attempts: [attempt] };
  const pool = strictGeckoPool(attempt.value, project, { chain, tokenAddress, poolAddress });
  if (!pool) {
    return {
      observations: [],
      attempts: [{
        ...attempt,
        status: "NO_EXACT_POOL_MATCH",
        reason: "GeckoTerminal did not return the exact requested chain, base token, and pool identity.",
        value: undefined,
      }],
    };
  }

  return {
    observations: geckoObservations(
      pool,
      [...new Set([...fields, ...GECKO_COMPANION_FIELDS])],
      options.now?.().toISOString?.() || new Date().toISOString(),
    ),
    attempts: [{
      ...attempt,
      value: undefined,
      matchedIdentity: `${pool.chain}:${pool.tokenAddress}:${pool.poolAddress}`,
    }],
  };
}

async function recoverDefiLlamaExactPrice(project = {}, fields = [], providers = {}, options = {}, state = {}) {
  const chain = chainOf(project);
  const tokenAddress = tokenAddressOf(project, chain);
  if (!chain || !tokenAddress) {
    return {
      observations: [],
      attempts: [{
        status: "NOT_APPLICABLE",
        provider: "defillama-exact-price",
        reason: "DeFiLlama exact-price recovery requires a supported chain and exact token contract.",
        durationMs: 0,
      }],
    };
  }

  const attempt = await executeProviderCall(
    "defillama-exact-price",
    () => providers.getDefiLlamaExactPrice(
      { ...project, chain, tokenAddress },
      {
        ...(options.defiLlama || {}),
        timeoutMs:
          options.providerTimeoutMs ||
          options.timeoutMs ||
          process.env.ACTIVE_EVIDENCE_PROVIDER_TIMEOUT_MS ||
          8_000,
        now: options.now,
      },
    ),
    options,
    state,
    1,
    chain,
  );
  if (attempt.status !== "SUCCESS") return { observations: [], attempts: [attempt] };
  const result = attempt.value || {};
  const resultChain = normalizeChainId(result.chain);
  const resultToken = normalizeTokenAddress(result.tokenAddress, resultChain);
  if (
    result.status !== "EXACT_PRICE_OBSERVED" ||
    resultChain !== chain ||
    resultToken !== tokenAddress ||
    !valueKnown(result.priceUsd)
  ) {
    return {
      observations: [],
      attempts: [{
        ...attempt,
        status: "NO_EXACT_CHAIN_CONTRACT_PRICE",
        reason: result.reason || "DeFiLlama returned no exact chain-contract price observation.",
        value: undefined,
      }],
    };
  }

  const confidence = Math.max(0, Math.min(1, numberOrNull(result.confidence) ?? 0.82));
  const timestamp = result.sourceTimestamp || result.observedAt || new Date().toISOString();
  const observations = fields
    .filter((field) => DEFILLAMA_EXACT_PRICE_FIELDS.has(field))
    .map((field) => observation(
      field,
      result.priceUsd,
      "defillama-exact-price",
      timestamp,
      confidence,
      {
        observedAt: result.observedAt || null,
        identityMatchMode: "exact-chain-contract",
        chain,
        tokenAddress,
        providerCoinKey: result.providerCoinKey || null,
        sourceUrl: result.sourceUrl || null,
        rawEvidenceHash: result.rawEvidenceHash || null,
        rawEvidence: result.rawEvidence || null,
        marketEvidenceOnly: true,
        executionEvidence: false,
      },
    ));
  return {
    observations,
    attempts: [{
      ...attempt,
      value: undefined,
      matchedIdentity: `${chain}:${tokenAddress}`,
      sourceUrl: result.sourceUrl || null,
      rawEvidenceHash: result.rawEvidenceHash || null,
    }],
  };
}

function knownSecurityItems(result = {}) {
  return (Array.isArray(result.evidence) ? result.evidence : []).filter(
    (item) => item && item.status !== "UNKNOWN"
  );
}

function securityIdentityMatches(item = {}, identity = {}, allowUnknown = false) {
  if (!item || typeof item !== "object") return false;
  if (allowUnknown && item.status === "UNKNOWN") {
    return (!item.chain || normalizeChainId(item.chain) === identity.chain) &&
      (!(item.address || item.tokenAddress) ||
        normalizeTokenAddress(item.address || item.tokenAddress, identity.chain) === identity.tokenAddress);
  }
  return normalizeChainId(item.chain) === identity.chain &&
    normalizeTokenAddress(item.address || item.tokenAddress, identity.chain) === identity.tokenAddress &&
    (!lower(item.provider).includes("goplus") || item.responseIdentityVerified === true);
}

function securitySourceEligible(item = {}, field = "") {
  const provider = lower(item.provider);
  if (provider.includes("goplus") && item.raw) {
    const rawFields = {
      contractVerified: ["is_open_source"],
      honeypotDetected: ["is_honeypot"],
      mintAuthorityEnabled: ["is_mintable"],
      blacklistEnabled: ["is_blacklisted", "cannot_sell_all", "slippage_modifiable"],
      sellRestricted: ["is_blacklisted", "cannot_sell_all", "slippage_modifiable"],
    }[field];
    if (rawFields && !rawFields.every((key) => ["0", "1", 0, 1, true, false].includes(item.raw[key]))) {
      if (!rawFields.some((key) => ["1", 1, true].includes(item.raw[key]))) return false;
    }
  }
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

function securityObservations(items = [], fields = [], identity = {}, result = {}) {
  items = items.filter((item) => securityIdentityMatches(item, identity));
  return fields
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
        confidenceFraction(sourceItem.confidence || result.summary?.confidence || 0, 0),
        identity
      );
    })
    .filter(Boolean);
}

function securityEvidencePatch(items = []) {
  items = [...new Set(items)];
  const summary = summarizeSecurityEvidence(items);
  return {
    freeSecurityEvidence: { evidence: items, summary },
    securityEvidence: items,
    securityEvidenceSummary: summary,
  };
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
  const existing = knownSecurityItems({ evidence: [
    ...(Array.isArray(project.securityEvidence) ? project.securityEvidence : []),
    ...(Array.isArray(project.freeSecurityEvidence?.evidence) ? project.freeSecurityEvidence.evidence : []),
    project.goplusDeployerEvidence,
  ].filter(Boolean) }).filter((item) =>
    normalizeChainId(item.chain) === chain &&
    normalizeTokenAddress(item.address || item.tokenAddress, chain) === tokenAddress &&
    (!lower(item.provider).includes("goplus") || item.responseIdentityVerified === true)
  );
  const identity = { chain, tokenAddress };
  const localObservations = securityObservations(existing, fields, identity);
  if (localObservations.length === fields.length) {
    return {
      observations: localObservations,
      attempts: [{ status: "LOCAL_EVIDENCE_AVAILABLE", provider: "existing-security-evidence", durationMs: 0, reason: null }],
      projectPatch: securityEvidencePatch(existing),
    };
  }
  let goPlusCooldownSkipped = false;
  const attempt = await executeProviderCall(
    "free-security",
    () => providers.getFreeSecurityEvidence(
      { ...project, chain, tokenAddress, contractAddress: project.contractAddress || tokenAddress },
      { ...(options.securityEvidence || options), goPlusRequestSlotReserved: providers.defaultFreeSecurityProvider && chain !== "solana",
        goPlusCooldownSkipped }
    ),
    options,
    state,
    Math.max(1, Number(options.securityProviderRequestCost || 4)),
    chain,
    providers.defaultFreeSecurityProvider && chain !== "solana" ? async () => {
      goPlusCooldownSkipped = !await (options.goPlusRateLimiter || waitForGoPlusRequestSlot)({ deadlineAt: state.deadlineAt, waitForCooldown: false });
      return true;
    } : null
  );
  if (attempt.status !== "SUCCESS") {
    return { observations: localObservations, attempts: [attempt], projectPatch: existing.length ? securityEvidencePatch(existing) : {} };
  }

  const result = attempt.value || {};
  const items = knownSecurityItems(result).filter((item) => securityIdentityMatches(item, identity));
  const observations = [
    ...securityObservations([...existing, ...items], fields, identity, result),
    ...securityHolderObservations(project, [...existing, ...items], options.securityEvidence || options),
  ];

  return {
    observations,
    attempts: [{ ...attempt, value: undefined, providers: result.summary?.knownProviders || [] }],
    projectPatch: securityEvidencePatch([...existing,
      ...(Array.isArray(result.evidence) ? result.evidence : items)
        .filter((item) => securityIdentityMatches(item, identity, true))]),
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

function executionIdentity(project = {}) {
  const route = project.canonicalExecutionRoute || {};
  const known = [project, project.rawCandidate || {}, project.marketData || {}, route];
  const unique = (values, normalize) => {
    const supplied = values.filter(valueKnown);
    const normalized = supplied.map(normalize);
    return normalized.every(Boolean) && new Set(normalized).size === 1 ? normalized[0] : null;
  };
  const chain = unique([
    ...known.flatMap((item) => [item.chain, item.chainId, item.network]),
    project.canonicalChain, project.finalChain,
  ], normalizeChainId);
  const tokenAddress = unique([
    ...known.flatMap((item) => [item.tokenAddress, item.contractAddress, item.baseToken?.address]),
    project.address, project.rawCandidate?.address, project.canonicalAddress, project.finalContractAddress,
  ], (value) => normalizeTokenAddress(value, chain));
  const poolAddress = unique([
    ...known.flatMap((item) => [item.poolAddress, item.pairAddress]),
    project.primaryPool, project.primaryTradablePool, project.finalPairAddress, project.pair?.address,
  ], (value) => normalizePoolAddress(value, chain));
  return { chain, tokenAddress, poolAddress,
    exact: Boolean(chain && tokenAddress && poolAddress && tokenAddress !== poolAddress &&
      !/^0x0{40}$/.test(tokenAddress) && !/^0x0{40}$/.test(poolAddress)) };
}

function exactExecutionMarket(project = {}) {
  const route = project.canonicalExecutionRoute || {};
  const routeType = text(project.executionProof?.routeType || project.routeType || route.routeType).toUpperCase();
  // Public books prove a venue market, never the contract identity of a DEX candidate.
  if (routeType !== "CEX" && (chainOf(project) || tokenAddressOf(project))) return null;
  const supported = new Set(["coinbase", "kraken", "gate", "mexc"]);
  const marketKey = text(project.marketKey).split(":");
  const venues = [marketKey.length > 1 ? marketKey[0] : null,
    project.exchange, project.provider, project.source, route.venue].map(lower).filter((value) => supported.has(value));
  if (!venues.length || new Set(venues).size !== 1) return null;
  const pairs = [project.marketPair, route.marketPair, project.marketData?.marketPair,
    marketKey.length > 1 ? marketKey.at(-1) : null].filter(valueKnown)
    .map((value) => text(value).toUpperCase().replace(/[-_/]/g, ""));
  if (!pairs.length || new Set(pairs).size !== 1 || !/^[A-Z0-9]+(?:USDT|USDC|USD)$/.test(pairs[0])) return null;
  return { provider: venues[0], marketPair: pairs[0] };
}

export function hasExactExecutionRecoveryIdentity(project = {}) {
  const routeType = text(project.executionProof?.routeType || project.routeType || project.canonicalExecutionRoute?.routeType).toUpperCase();
  if (routeType === "CEX") return Boolean(exactExecutionMarket(project));
  return executionIdentity(project).exact || Boolean(exactExecutionMarket(project));
}

function exactExecutionQuotes(route, identity, responses) {
  const source = lower(route.source);
  if (!["lifi", "jupiter", "0x"].includes(source) || !identity.exact ||
      normalizeChainId(route.chain) !== identity.chain ||
      normalizeTokenAddress(route.tokenAddress, identity.chain) !== identity.tokenAddress ||
      normalizeTokenAddress(route.contractAddress, identity.chain) !== identity.tokenAddress ||
      normalizePoolAddress(route.poolAddress, identity.chain) !== identity.poolAddress) return false;
  const quoteToken = normalizeTokenAddress(route.quoteTokenAddress, identity.chain);
  if (!quoteToken || quoteToken === identity.tokenAddress) return false;
  const quotes = responses.filter((item) => item.provider === source && item.adapter !== "lifi-token");
  if (quotes.length !== 2) return false;
  const sides = new Set();
  try {
    for (const { url, value } of quotes) {
      const params = new URL(url).searchParams;
      const from = normalizeTokenAddress(params.get(source === "jupiter" ? "inputMint" : source === "0x" ? "sellToken" : "fromToken"), identity.chain);
      const to = normalizeTokenAddress(params.get(source === "jupiter" ? "outputMint" : source === "0x" ? "buyToken" : "toToken"), identity.chain);
      const side = from === quoteToken && to === identity.tokenAddress ? "BUY"
        : from === identity.tokenAddress && to === quoteToken ? "SELL" : null;
      if (!side || sides.has(side)) return false;
      const amount = params.get(source === "jupiter" ? "amount" : source === "0x" ? "sellAmount" : "fromAmount");
      if (source === "lifi") {
        if (normalizeChainId(params.get("fromChain")) !== identity.chain ||
            normalizeChainId(params.get("toChain")) !== identity.chain) return false;
        verifyActionIdentity(value, { chain: identity.chain, side, tokenAddress: identity.tokenAddress,
          quoteTokenAddress: quoteToken, fromAmount: amount });
      } else {
        if (source === "jupiter" ? identity.chain !== "solana"
          : normalizeChainId(params.get("chainId")) !== identity.chain) return false;
        if (normalizeTokenAddress(value[source === "jupiter" ? "inputMint" : "sellToken"], identity.chain) !== from ||
            normalizeTokenAddress(value[source === "jupiter" ? "outputMint" : "buyToken"], identity.chain) !== to ||
            BigInt(value[source === "jupiter" ? "inAmount" : "sellAmount"]) !== BigInt(amount) ||
            BigInt(value[source === "jupiter" ? "outAmount" : "buyAmount"]) <= 0n) return false;
        if (value.chainId !== undefined && normalizeChainId(value.chainId) !== identity.chain) return false;
      }
      const pools = source === "jupiter"
        ? (value.routePlan || []).map((step) => normalizePoolAddress(step?.swapInfo?.ammKey, identity.chain))
        : [...extractLiFiRoutePoolAddresses(value, identity.chain),
          ...(Array.isArray(value.route?.fills) ? value.route.fills : []).map((fill) => normalizePoolAddress(fill.poolAddress, identity.chain))];
      if (!pools.includes(identity.poolAddress)) return false;
      sides.add(side);
    }
    return sides.has("BUY") && sides.has("SELL");
  } catch {
    return false;
  }
}

export async function recoverExecutionEvidence(
  project = {},
  fields = [],
  providers = {},
  options = {},
  state = createActiveEvidenceExecutionState(options)
) {
  let executionAdapterResults = [];
  const empty = (attempts) => ({ observations: [], projectPatch: {}, attempts, executionAdapterResults });
  if (!fields.some((field) => EXECUTION_RAW_FIELDS.has(field))) return empty([]);
  const identity = executionIdentity(project);
  const market = exactExecutionMarket(project);
  if (!hasExactExecutionRecoveryIdentity(project)) return empty([{ provider: "execution-proof-recovery", status: "MISSING_OR_CONFLICTING_IDENTITY",
    durationMs: 0, reason: "Execution recovery requires an exact chain, contract and known pool, or an exact CEX venue market." }]);

  // The batch owns adapter selection and safety gates; its candidate qualification output is never merged.
  // executionRecovery is primary; executionProofRecovery is a compatibility alias for injected batch options.
  const recovery = options.executionRecovery || options.executionProofRecovery || {};
  const clock = state.now || options.now || Date.now;
  const now = () => new Date(clock());
  const responses = [];
  const calls = [];
  const secrets = [recovery.lifiApiKey, recovery.jupiterApiKey, recovery.zeroxApiKey,
    (recovery.env || process.env).LIFI_API_KEY, (recovery.env || process.env).JUPITER_API_KEY,
    (recovery.env || process.env).ZEROX_API_KEY].filter(Boolean).map(String);
  const redact = (value) => secrets.reduce((result, secret) => result.split(secret).join("[REDACTED]"), text(value));
  const transport = recovery.fetchJson || providers.fetchJson || options.providers?.fetchJson || (async (url, init) => {
    const response = await (options.providers?.fetch || fetch)(url, init);
    if (!response.ok) {
      const error = new Error(`Execution provider HTTP ${response.status}`);
      error.status = response.status;
      error.retryAfter = response.headers?.get("retry-after");
      if (response.status === 429) error.providerMessage = (await response.json().catch(() => null))?.message;
      throw error;
    }
    return response.json();
  });
  const fetchJson = async (url, init = {}) => {
    const provider = init.adapter === "lifi-token" ? "lifi" : init.adapter;
    let failure = null;
    const attempt = await executeProviderCall(provider, async () => {
      const controller = new AbortController();
      const signal = init.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal;
      const configuredTimeout = Math.max(250, Number(options.providerTimeoutMs || options.timeoutMs ||
        process.env.ACTIVE_EVIDENCE_PROVIDER_TIMEOUT_MS || process.env.ACTIVE_EVIDENCE_RECOVERY_PROVIDER_TIMEOUT_MS || 8_000));
      const timeoutMs = Math.max(1, Math.min(configuredTimeout, Number(init.timeoutMs) || configuredTimeout,
        (state.deadlineAt ?? Infinity) - clock()));
      let timer;
      let onAbort;
      try {
        if (signal.aborted) throw new Error("Execution provider request aborted before start.");
        if (clock() >= (state.deadlineAt ?? Infinity)) {
          state.timeBudgetExceeded = true;
          throw new Error("Execution provider deadline exhausted before start.");
        }
        const aborted = new Promise((_, reject) => {
          onAbort = () => reject(new Error("Execution provider request aborted or timed out."));
          signal.addEventListener("abort", onAbort, { once: true });
        });
        timer = setTimeout(() => controller.abort(), timeoutMs);
        const value = await Promise.race([transport(url, { ...init, timeoutMs, signal }), aborted]);
        if (signal.aborted || clock() >= (state.deadlineAt ?? Infinity)) {
          state.timeBudgetExceeded ||= clock() >= (state.deadlineAt ?? Infinity);
          throw new Error("Execution provider response arrived after its deadline.");
        }
        responses.push({ provider, adapter: init.adapter, url, value });
        return value;
      } catch (error) {
        failure = error;
        state.timeBudgetExceeded ||= clock() >= (state.deadlineAt ?? Infinity);
        if ([400, 404, 422].includes(error?.status)) {
          return { candidateEvidenceUnavailable: true, reason: redact(error.message) };
        }
        throw new Error(redact(error?.message || "Execution provider request failed."));
      } finally {
        clearTimeout(timer);
        if (onAbort) signal.removeEventListener("abort", onAbort);
      }
    }, options, state, 1, market ? "cex" : identity.chain);
    calls.push({ attempt, failure });
    if (attempt.status !== "SUCCESS") {
      const error = failure || new Error(attempt.reason);
      error.code ||= attempt.status;
      throw error;
    }
    return attempt.value;
  };
  const candidate = market ? { ...project, provider: market.provider, marketPair: market.marketPair }
    : { ...project, chain: identity.chain, tokenAddress: identity.tokenAddress, poolAddress: identity.poolAddress };
  const [recovered] = await analyzeExecutionProofRecoveryBatch([candidate], {
    ...recovery, auditMode: options.auditMode === true || recovery.auditMode === true,
    deferToActiveEvidence: false, maxCandidates: 1, concurrency: 1, now, fetchJson, signal: options.signal || recovery.signal,
  });
  executionAdapterResults = (recovered?.executionProofRecovery?.adapterResults || []).map((result) => ({
    adapter: result.adapter, status: result.status,
    missingKey: result.missingKey || null,
    reason: result.reason ? redact(result.reason) : null,
    failures: (result.failures || []).map(redact),
    providerFailureCode: result.providerFailureCode ? redact(result.providerFailureCode) : null,
    retryAt: result.retryAt ? redact(result.retryAt) : null,
  }));
  const attempts = calls.map(({ attempt, failure }) => ({ ...attempt, value: undefined,
    family: "EXECUTION",
    reason: attempt.reason ? redact(attempt.reason) : null,
    ...(failure ? { httpStatus: failure.status ?? null, code: failure.code ? redact(failure.code) : null,
      retryAfter: failure.retryAfter == null ? null : redact(failure.retryAfter),
      retryAt: failure.retryAt == null ? null : redact(failure.retryAt) } : {}),
  }));
  const route = recovered?.executionProofRecovery?.status === "ROUTE_RECOVERED"
    ? recovered.executionProofRecoveryRoute : null;
  const exactMarket = market && route?.routeType === "CEX" && lower(route.source) === market.provider &&
    text(route.marketPair).replace(/[-_/]/g, "").toUpperCase() === market.marketPair &&
    responses.some((item) => item.provider === market.provider);
  if (!route || route.buyQuoteVerified !== true || route.sellQuoteVerified !== true ||
      !Number.isFinite(Date.parse(route.quoteTimestamp)) ||
      !(exactMarket || (!market && exactExecutionQuotes(route, identity, responses)))) {
    executionAdapterResults = executionAdapterResults.map((result) => result.status === "ROUTE_RECOVERED"
      ? { ...result, providerStatus: result.status, status: "IDENTITY_OR_POOL_UNATTESTED",
        reason: "Provider quote did not attest the required exact route identity on both legs." }
      : result);
    return empty([...attempts, { provider: "execution-proof-recovery", status: route ? "IDENTITY_OR_POOL_UNATTESTED" : "NO_VERIFIED_ROUTE",
      durationMs: 0, reason: "No new exact two-way execution proof was recovered; missing evidence remains unresolved." }]);
  }

  const rawRoute = Object.fromEntries(EXECUTION_ROUTE_FIELDS.filter((field) => valueKnown(route[field])).map((field) => [field, route[field]]));
  // Canonical route recomputation recognizes venue names, including LI.FI's observed underlying venue.
  if (route.underlyingVenue) rawRoute.name = route.underlyingVenue;
  // Jupiter/0x may default an absent price impact to zero. Missing measurements stay unknown.
  if (["jupiter", "0x"].includes(route.source) && !responses.filter((item) => item.provider === route.source)
    .every(({ value }) => {
      const measured = value.priceImpactPct ?? value.estimatedPriceImpact;
      if (typeof measured !== "number" && (typeof measured !== "string" || !measured.trim())) return false;
      const impact = numberOrNull(measured);
      return impact !== null && impact >= 0;
    })) {
    for (const field of ["priceImpactPct", "slippagePct", "estimatedRoundTripSlippagePct", "slippageIsHeuristic"]) delete rawRoute[field];
  }
  const details = { chain: market ? null : identity.chain, tokenAddress: market ? null : identity.tokenAddress,
    poolAddress: market ? null : identity.poolAddress, routeType: route.routeType,
    ...(market ? { marketPair: route.marketPair, venue: market.provider } : {}),
    identityMatchMode: market ? "exact-venue-market" : "exact-chain-contract-pool" };
  const observations = [...EXECUTION_RAW_FIELDS].map((field) => observation(field,
    field === "purchaseRouteConfirmed" ? true : rawRoute[field], route.source, route.quoteTimestamp, 0.9, details))
    .filter((item) => valueKnown(item.value));
  return { observations, attempts, executionAdapterResults, projectPatch: { executionProofRecoveryRoute: {
    ...rawRoute, exactIdentityVerified: !market, marketIdentityVerified: Boolean(market),
    sourceTimestamp: route.quoteTimestamp, confidence: 0.9,
    verificationStatus: "VERIFIED_PROVIDER_OBSERVATION", recoveryRun: true,
  } } };
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
  let executionAdapterResults = [];
  const observations = securityHolderObservations(project, [
    ...(Array.isArray(project.securityEvidence) ? project.securityEvidence : []),
    ...(Array.isArray(project.freeSecurityEvidence?.evidence) ? project.freeSecurityEvidence.evidence : []),
    project.goplusDeployerEvidence,
  ], options);
  let projectPatch = {};

  const dexFields = fields.filter((field) => DEX_FIELDS.has(field));
  const dexRequested = sourceRequested(sources, ["dexscreener", "native rpc"]);
  const geckoRequested = sourceRequested(sources, ["geckoterminal"]);
  if (dexFields.length && dexRequested) {
    const result = await recoverDex(project, dexFields, providers, options, executionState);
    observations.push(...result.observations);
    attempts.push(...result.attempts);
  }

  // GeckoTerminal is a strict market-data fallback. It is only attempted for
  // fields DexScreener did not recover, and never supplies execution evidence.
  const recoveredDexFields = new Set(observations.map((item) => item.field));
  const geckoFields = dexFields.filter(
    (field) => GECKO_FIELDS.has(field) && !recoveredDexFields.has(field)
  );
  if (geckoFields.length && geckoRequested) {
    const result = await recoverGeckoPool(project, geckoFields, providers, options, executionState);
    observations.push(...result.observations);
    attempts.push(...result.attempts);
  }

  const recoveredMarketFields = new Set(observations.map((item) => item.field));
  const defiLlamaExactFields = fields.filter(
    (field) => DEFILLAMA_EXACT_PRICE_FIELDS.has(field) && !recoveredMarketFields.has(field)
  );
  if (
    defiLlamaExactFields.length &&
    sourceRequested(sources, ["defillama exact", "defillama-exact-price"])
  ) {
    const result = await recoverDefiLlamaExactPrice(
      project,
      defiLlamaExactFields,
      providers,
      options,
      executionState,
    );
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
  const executionFields = fields.filter((field) => EXECUTION_RAW_FIELDS.has(field));
  const parallel = [];
  if (executionFields.length && sourceRequested(sources, ["li.fi", "lifi", "jupiter", "0x", "cex", "order book", "dex aggregators"])) {
    const result = await recoverExecutionEvidence(project, executionFields, providers, options, executionState);
    observations.push(...result.observations);
    attempts.push(...result.attempts);
    executionAdapterResults = result.executionAdapterResults || [];
    projectPatch = { ...projectPatch, ...result.projectPatch };
  }
  if (
    deployerFields.length &&
    sourceRequested(sources, ["sourcify", "blockscout", "block explorers", "explorer", "native rpc", "security providers"])
  ) {
    const result = await recoverDeployerEvidence(project, deployerFields, providers, options, executionState);
    observations.push(...result.observations);
    attempts.push(...result.attempts);
    projectPatch = { ...projectPatch, ...result.projectPatch };
    const companion = projectPatch.goplusDeployerEvidence;
    if (companion?.responseIdentityVerified === true && companion.status !== "UNKNOWN") {
      const identity = { chain: chainOf(project), tokenAddress: tokenAddressOf(project, chainOf(project)) };
      const existing = knownSecurityItems({ evidence: project.securityEvidence || [] }).filter((item) =>
        normalizeChainId(item.chain) === identity.chain &&
        normalizeTokenAddress(item.address || item.tokenAddress, identity.chain) === identity.tokenAddress
      );
      const items = [...existing, companion];
      observations.push(...securityObservations(items, [...SECURITY_FIELDS], identity));
      observations.push(...securityHolderObservations(project, items, options));
      projectPatch = { ...projectPatch, ...securityEvidencePatch(items) };
    }
  }
  if (
    walletFields.some((field) => !observations.some((item) => item.field === field)) &&
    sourceRequested(sources, ["blockscout", "block explorers", "explorer", "chain rpc", "wallet history", "wallet-history", "supabase", "rugcheck"])
  ) {
    parallel.push(
      recoverWalletEvidenceWithHistory(project, walletFields.filter((field) => !observations.some((item) => item.field === field)), providers, options, executionState).then((result) => ({
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
      recoverSecurity({ ...project, ...projectPatch }, securityFields, providers, options, executionState).then((result) => ({
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
    executionAdapterResults,
    projectPatch,
  };
}

export function summarizeActiveEvidenceExecutionState(state = {}) {
  return {
    maxRequests: state.maxRequests || 0,
    requestsUsed: state.requestsUsed || 0,
    timeBudgetExceeded: state.timeBudgetExceeded === true,
    timeBudgetSkippedCalls: state.timeBudgetSkippedCalls || 0,
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
