import { isDeepStrictEqual } from "node:util";
import {
  getPairByAddress,
  getTokenPairs,
  normalizeDexPair,
  searchDexPairs,
} from "./dexScreenerConnector.js";
import {
  getGeckoPoolByAddress,
} from "./geckoTerminalConnector.js";
import { geckoPoolRequestIdentity, getGeckoTokenPools, normalizeExactGeckoPool, selectExactGeckoTokenPool } from "./geckoTokenPoolDiscovery.js";
import {
  getCoinGeckoMarketsByIds,
  normalizeCoinGeckoMarket,
} from "./coinGeckoConnector.js";
import { getCoinPaprikaTickerById } from "./freeMarketDataConnector.js";
import { getDefiLlamaExactPrice } from "./defiLlamaExactPriceConnector.js";
import { getFreeSecurityEvidence } from "./security/freeSecurityEvidenceConnector.js";
import { getRugCheckFullTokenEvidence } from "./security/solanaSecurityConnector.js";
import { securityHolderObservations } from "./security/securityWalletEvidence.js";
import { evaluateEvidenceFreshness } from "./evidenceFreshnessPolicy.js";
import {
  getBlockscoutDeployerEvidence,
  getBlockscoutSecurityEvidence,
} from "./security/blockscoutConnector.js";
import {
  etherscanV2ApiKey,
  getEtherscanV2SecurityEvidence,
} from "./security/etherscanV2Connector.js";
import { getGoPlusSecurityEvidence } from "./security/goplusSecurityConnector.js";
import { createGoPlusRequestLimiter, waitForGoPlusRequestSlot } from "./security/goplusRequestLimiter.js";
import { getCachedSecurityEvidence, goPlusTaxPct, nonnegativeSafeInteger, sourcifyResponseIdentityMatches, summarizeSecurityEvidence } from "./security/securityEvidenceUtils.js";
import { getSourcifySecurityEvidence } from "./security/sourcifyV2Connector.js";
import { getBlockscoutWalletEvidence, resolveBlockscoutWalletRequest } from "./blockscoutWalletConnector.js";
import { GOPLUS_WALLET_CHAINS } from "./enrichmentSourceRegistry.js";
import { getRpcWalletEvidence, walletRpcEndpointId } from "./rpcWalletEvidenceConnector.js";
import { getSolanaRpcWalletEvidence } from "./solanaRpcWalletEvidenceConnector.js";
import { jsonRpc } from "../sensors/rpcJsonClient.js";
import { appendWalletParticipationHistory, loadWalletParticipationHistory, normalizeWalletParticipationObservation, walletParticipationHistoryFor } from "./walletParticipationHistoryStore.js";
import { getBaseB20LifecycleEvidence, isBaseB20Candidate, isVerifiedBaseB20Evidence } from "./baseB20LifecycleConnector.js";
import { loadNativeEvents } from "./native/nativeEventStore.js";
import { nativeContractDeployerEvidence } from "./native/evm/evmContractDeploymentConnector.js";
import { analyzeExecutionProofRecoveryBatch, verifyDirectQuoteIdentity } from "../engines/executionProofRecoveryEngine.js";
import { extractLiFiRoutePoolAddresses, verifyActionIdentity } from "../execution/lifiExecutableQuoteProvider.js";
import { PROVIDER_REQUEST_ADMISSION } from "../execution/providerRequestAdmission.js";
import { verifyRaydiumQuote } from "../execution/raydiumExecutableQuoteProvider.js";
import { hasKnownTransferRestriction } from "../execution/routeTruthV2.js";
import { resolveCanonicalIdentity } from "../identity/canonicalIdentityResolver.js";
import { decisionProofAssessment } from "../kernel/evidenceFunnelSummary.js";
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
  "buyTransactions24h",
  "sellTransactions24h",
]);

const GECKO_COMPANION_FIELDS = [
  "chain",
  "tokenAddress",
  "poolAddress",
  "priceUsd",
  "liquidityUsd",
  "volume24hUsd",
  "buyTransactions24h",
  "sellTransactions24h",
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

const DEPLOYER_CREATOR_FIELDS = ["creatorAddress", "deployerAddress", "creator", "deployer"];
const DEPLOYER_CREATION_FIELDS = [...DEPLOYER_CREATOR_FIELDS,
  "deploymentTransactionHash", "contractCreationTimestamp", "creationBlockNumber"];

const WALLET_RAW_FIELDS = new Set([
  "wallets",
  "holderAddresses",
  "holderCount",
  "walletTransactions",
  "walletParticipationHistory",
]);

const EXECUTION_RAW_FIELDS = new Set([
  "purchaseRouteConfirmed", "sellRouteAvailable", "quoteTimestamp", "quoteExpiresAt",
  "slippagePct", "priceImpactPct", "executableDepthUsd", "verifiedTradeSizeUsd",
  "orderBookDepthUsd", "bidDepthUsd", "askDepthUsd", "spreadPct",
]);

const EXECUTION_ROUTE_FIELDS = [
  "source", "provider", "venue", "underlyingVenue", "routeType", "chain", "chainId",
  "tokenAddress", "contractAddress", "baseTokenAddress", "poolAddress", "routePoolAddresses",
  "marketPair", "quoteAsset", "quoteTokenAddress", "buyRouteAvailable", "sellRouteAvailable",
  "buyQuoteVerified", "sellQuoteVerified", "quoteVerified", "quoteTimestamp", "quoteExpiresAt",
  "slippagePct", "priceImpactPct", "estimatedRoundTripSlippagePct", "slippageIsHeuristic",
  "executableDepthUsd", "verifiedTradeSizeUsd", "verifiedDepthSource", "orderBookDepthVerified",
  "orderBookDepthUsd", "bidDepthUsd", "askDepthUsd", "spreadPct", "buyQuote", "sellQuote",
  "quoteCostIncludesNetworkFees", "quoteCostScope",
];

// The cheap path issues two reads per admission. Keep its aggregate pace below
// Blockscout's documented anonymous default of 300 requests per minute.
const waitForBlockscoutMetadataPair = createGoPlusRequestLimiter({ intervalMs: 440 });

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
  const customWalletProvider = Boolean(injected.getBlockscoutWalletEvidence || injected.getWalletEvidence ||
    options.getBlockscoutWalletEvidence || injected.getRpcWalletEvidence || options.getRpcWalletEvidence);
  const goPlusWalletProvider = injected.getGoPlusWalletEvidence || options.getGoPlusWalletEvidence ||
    injected.getGoPlusSecurityEvidence || getGoPlusSecurityEvidence;
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
    getGeckoTokenPools: injected.getGeckoTokenPools || options.getGeckoTokenPools || getGeckoTokenPools,
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
    independentDeployerMetadataFirst: !customDeployerProvider && !customSourcifyProvider &&
      !injected.getGoPlusDeployerEvidence && !injected.getGoPlusSecurityEvidence && !options.getGoPlusDeployerEvidence,
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
    getGoPlusWalletEvidence: goPlusWalletProvider,
    defaultGoPlusWalletProvider: goPlusWalletProvider === getGoPlusSecurityEvidence,
    useCheapBlockscoutHolderMetadata: options.useCheapBlockscoutHolderMetadata ??
      !(customWalletProvider || injected.getGoPlusWalletEvidence || options.getGoPlusWalletEvidence || injected.getGoPlusSecurityEvidence),
    useGoPlusWalletFallback: options.useGoPlusWalletFallback ??
      (Boolean(injected.getGoPlusWalletEvidence || options.getGoPlusWalletEvidence || injected.getGoPlusSecurityEvidence) || !customWalletProvider),
    defaultRpcWalletProvider: (injected.getRpcWalletEvidence || options.getRpcWalletEvidence || getRpcWalletEvidence) === getRpcWalletEvidence,
    getSolanaWalletEvidence: injected.getSolanaWalletEvidence || options.getSolanaWalletEvidence || getRugCheckFullTokenEvidence,
    getSolanaRpcWalletEvidence: injected.getSolanaRpcWalletEvidence || options.getSolanaRpcWalletEvidence || getSolanaRpcWalletEvidence,
    defaultSolanaRpcWalletProvider: (injected.getSolanaRpcWalletEvidence || options.getSolanaRpcWalletEvidence || getSolanaRpcWalletEvidence) === getSolanaRpcWalletEvidence,
    useSolanaRpcWalletFallback: options.useSolanaRpcWalletFallback ?? options.useRpcWalletFallback ??
      (Boolean(injected.getSolanaRpcWalletEvidence || options.getSolanaRpcWalletEvidence) || !(injected.getSolanaWalletEvidence || options.getSolanaWalletEvidence)),
    useRpcWalletFallback: options.useRpcWalletFallback ?? (Boolean(injected.getRpcWalletEvidence || options.getRpcWalletEvidence) ||
      !(injected.getBlockscoutWalletEvidence || injected.getWalletEvidence || options.getBlockscoutWalletEvidence)),
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

function recoveryDeadlineAt(state, options) {
  return Math.min(state.deadlineAt ?? Infinity,
    Number.isFinite(options.phaseDeadlineAt) ? options.phaseDeadlineAt : Infinity);
}

function recoveryDeadlineStatus(state, options, expiredByTimer = false) {
  const now = (state.now || Date.now)();
  const absolute = state.deadlineAt ?? Infinity;
  const deadline = recoveryDeadlineAt(state, options);
  const phase = deadline < absolute;
  if (state.timeBudgetExceeded || now >= absolute || (expiredByTimer && !phase)) {
    state.timeBudgetExceeded = true;
    return "TIME_BUDGET_EXHAUSTED";
  }
  if (phase && (now >= deadline || expiredByTimer || (state.phaseDeadlineExceededAt ?? -Infinity) >= deadline)) {
    state.phaseTimeBudgetExceeded = true;
    state.phaseDeadlineExceededAt = Math.max(state.phaseDeadlineExceededAt ?? -Infinity, deadline);
    return "PHASE_TIME_BUDGET_EXHAUSTED";
  }
  return null;
}

function recoveryRequestLimit(state, options) {
  if (options.phaseRequestLimit === undefined) return state.maxRequests;
  const limit = options.phaseRequestLimit;
  return typeof limit === "number" && Number.isSafeInteger(limit) && limit >= 0 ? Math.min(state.maxRequests, limit) : 0;
}

async function executeProviderCall(
  provider,
  operation,
  options = {},
  state = {},
  cost = 1,
  circuitScope = null,
  beforeOperation = null,
  onTimeout = null
) {
  const health = providerState(state, provider, circuitScope);
  const deadlineStatus = recoveryDeadlineStatus(state, options);
  if (deadlineStatus) {
    health.skipped += 1;
    const counter = deadlineStatus === "PHASE_TIME_BUDGET_EXHAUSTED" ? "phaseTimeBudgetSkippedCalls" : "timeBudgetSkippedCalls";
    state[counter] = (state[counter] || 0) + 1;
    return {
      status: deadlineStatus,
      provider,
      value: null,
      reason: deadlineStatus === "PHASE_TIME_BUDGET_EXHAUSTED"
        ? "Raw recovery window exhausted; remaining absolute time is reserved for selected live proof."
        : "Recovery time budget exhausted; missing evidence remains unknown.",
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
  if (health.cooldownUntil > (state.now || Date.now)()) {
    health.skipped += 1;
    return { status: "PROVIDER_COOLDOWN", provider, value: null, durationMs: 0,
      retryAt: new Date(health.cooldownUntil).toISOString(),
      reason: "Provider Retry-After cooldown active; independent recovery fallbacks remain available." };
  }
  const requestLimit = recoveryRequestLimit(state, options);
  if (state.requestsUsed + cost > requestLimit) {
    health.skipped += 1;
    const phase = requestLimit < state.maxRequests;
    if (phase) {
      state.phaseRequestBudgetExceeded = true;
      state.phaseRequestBudgetSkippedCalls = (state.phaseRequestBudgetSkippedCalls || 0) + 1;
    }
    return {
      status: phase ? "PHASE_REQUEST_BUDGET_EXHAUSTED" : "REQUEST_BUDGET_EXHAUSTED",
      provider,
      value: null,
      reason: phase ? "Raw recovery request allowance exhausted; remaining units are reserved for selected live proof."
        : "Active evidence provider request budget exhausted.",
      durationMs: 0,
    };
  }

  if (beforeOperation) {
    const slotReserved = await beforeOperation();
    // Another queued operation may have exhausted the budget or opened the circuit.
    if (recoveryDeadlineStatus(state, options) || health.circuitOpen || state.requestsUsed + cost > recoveryRequestLimit(state, options)) {
      return executeProviderCall(provider, operation, options, state, cost, circuitScope, null, onTimeout);
    }
    if (slotReserved === false) {
      health.skipped += 1;
      const retryAtMs = (options.goPlusRateLimiter || waitForGoPlusRequestSlot).cooldownUntil?.();
      return { status: "PROVIDER_COOLDOWN", provider, value: null, durationMs: 0,
        retryAt: Number.isFinite(retryAtMs) && Math.abs(retryAtMs) <= 8_640_000_000_000_000
          ? new Date(retryAtMs).toISOString() : null,
        reason: "Provider cooldown active; independent recovery fallbacks remain available." };
    }
  }

  state.requestsUsed += cost;
  health.attempts += 1;
  const startedAt = Date.now();
  const providerTimeoutMs = Math.max(
    250,
    Number(
      options.providerTimeoutMs ||
        options.timeoutMs ||
        process.env.ACTIVE_EVIDENCE_PROVIDER_TIMEOUT_MS ||
        process.env.ACTIVE_EVIDENCE_RECOVERY_PROVIDER_TIMEOUT_MS ||
        8_000
    )
  );
  const remainingMs = recoveryDeadlineAt(state, options) - (state.now || Date.now)();
  const deadlineOwnsTimeout = Number.isFinite(remainingMs) && remainingMs <= providerTimeoutMs;
  const timeoutMs = Math.max(1, Math.min(providerTimeoutMs, remainingMs));
  let timer;

  try {
    const value = await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => {
            if (deadlineOwnsTimeout) recoveryDeadlineStatus(state, options, true);
            onTimeout?.();
            reject(new Error(`${provider} recovery timed out after ${timeoutMs}ms`));
          },
          timeoutMs
        );
      }),
    ]);
    const expired = recoveryDeadlineStatus(state, options);
    if (expired) return { provider, status: expired, value: null, durationMs: Date.now() - startedAt,
      reason: "Provider response arrived after its recovery window; evidence was not promoted." };
    if (value?.candidateEvidenceUnavailable === true) {
      health.noDataResponses = (health.noDataResponses || 0) + 1;
      return { status: "NO_CANDIDATE_EVIDENCE", provider, value: null,
        reason: value.reason || "Provider returned no evidence for this candidate.", durationMs: Date.now() - startedAt };
    }
    if (value?.providerFailure === true && value.rateLimited === true) {
      health.rateLimitResponses = (health.rateLimitResponses || 0) + 1;
      if (Number.isFinite(value.retryAfterMs) && value.retryAfterMs > 0) {
        health.cooldownUntil = Math.min(8_640_000_000_000_000,
          Math.max(health.cooldownUntil || 0, Number((state.now || Date.now)()) + value.retryAfterMs));
      }
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
    const expired = recoveryDeadlineStatus(state, options);
    if (expired) return { provider, status: expired, value: null, durationMs: Date.now() - startedAt,
      reason: "Provider recovery window expired; evidence remains unknown and the provider circuit is unchanged." };
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

function exactDeployerResult(result = {}, identity = {}, source = null) {
  if ([source, result.provider, result.source].some(value => lower(value).includes("sourcify")) &&
      !sourcifyResponseIdentityMatches(result.raw, identity.chain, identity.tokenAddress)) return false;
  const resultChain = result.chain ? normalizeChainId(result.chain) : null;
  const resultAddress = lower(result.address || result.tokenAddress);
  if (resultChain && resultChain !== identity.chain) return false;
  if (resultAddress && resultAddress !== lower(identity.tokenAddress)) return false;
  if (deployerValue(result, "creatorAddress") || isVerifiedBaseB20Evidence(result)) return true;
  return resultChain === identity.chain && resultAddress === lower(identity.tokenAddress) &&
    ["deploymentTransactionHash", "contractCreationTimestamp", "creationBlockNumber"]
      .some((field) => valueKnown(deployerValue(result, field)));
}

function existingDeployerEvidence(project = {}, identity = {}) {
  const candidates = [
    ...(Array.isArray(project.securityEvidence) ? project.securityEvidence : []),
    ...(Array.isArray(project.freeSecurityEvidence?.evidence)
      ? project.freeSecurityEvidence.evidence
      : []),
    project.blockscoutDeployerEvidence,
    project.goplusDeployerEvidence,
    ...(project.sourcifyDeployerEvidence && sourcifyResponseIdentityMatches(project.sourcifyDeployerEvidence.raw,
      identity.chain, identity.tokenAddress) ? [project.sourcifyDeployerEvidence] : []),
    project.etherscanDeployerEvidence,
    project.baseB20LifecycleEvidence,
    project.nativeContractDeploymentEvidence,
  ].filter(Boolean);
  return candidates.filter(
    (item) =>
      item.status !== "UNKNOWN" &&
      (!lower(item.provider || item.source).includes("goplus") || item.responseIdentityVerified === true) &&
      normalizeChainId(item.chain) === identity.chain &&
      lower(item.address || item.tokenAddress) === lower(identity.tokenAddress) &&
      exactDeployerResult(item, identity)
  );
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
      { chain: identity.chain, tokenAddress: identity.tokenAddress,
        sourceProvenance: result.provenance, finalityStatus: result.provenance?.finalityStatus }
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
    const observations = new Map();
    const attempts = [];
    const projectPatch = {};
    const localSources = new Set();
    const needs = (supported) => fields.some((field) => supported.includes(field) && !observations.has(field));
    const collect = (result, source, patchKey) => {
      if (!exactDeployerResult(result, evm, source) || result.status === "UNKNOWN") return;
      for (const item of deployerObservations(result, fields, evm, source)) {
        if (!observations.has(item.field)) observations.set(item.field, item);
      }
      if (patchKey && !projectPatch[patchKey]) projectPatch[patchKey] = result;
    };
    const local = (existing) => {
      const source = existing.provider || existing.source || "existing-security-evidence";
      localSources.add(lower(source).replace(/-deployer$/, ""));
      collect(existing, source, lower(source).includes("goplus") ? "goplusDeployerEvidence" : null);
      attempts.push({ status: "LOCAL_EVIDENCE_AVAILABLE", provider: source, reason: null, durationMs: 0 });
    };
    const finish = () => ({ observations: [...observations.values()], attempts, projectPatch });
    // Known partial envelopes must not hide the same provider's unresolved raw fields.
    const providerOptions = (source) => ({ ...options,
      useCache: localSources.has(source) ? false : options.useCache });
    for (const existing of existingDeployerEvidence(project, evm)) local(existing);
    if (needs([...DEPLOYER_CREATION_FIELDS, "nativeLifecycle"]) && providers.preferGoPlusDeployer &&
        providers.defaultGoPlusDeployerProvider && options.useCache !== false) {
      const readCached = options.readCachedSecurityEvidence || getCachedSecurityEvidence;
      for (const source of ["goplus", "sourcify-v2", "blockscout-deployer", "etherscan-v2", "base-b20-native"]) {
        const cached = readCached(source, evm.chain, evm.tokenAddress, options.cacheTtlMs);
        for (const existing of existingDeployerEvidence({ securityEvidence: cached ? [cached] : [] }, evm)) local(existing);
        if (!needs([...DEPLOYER_CREATION_FIELDS, "nativeLifecycle"])) break;
      }
    }

    if (needs(DEPLOYER_CREATION_FIELDS) && (Array.isArray(options.nativeDeploymentEvents) ||
        (options.useCache !== false && options.nativeDeploymentHistory !== false &&
          (providers.preferGoPlusDeployer || typeof options.loadNativeDeploymentEvents === "function")))) {
      if (!state.nativeDeploymentEventsByIdentity) {
        const index = new Map();
        let records = [];
        try {
          records = Array.isArray(options.nativeDeploymentEvents) ? options.nativeDeploymentEvents
            : (options.loadNativeDeploymentEvents || loadNativeEvents)({ includeRaw: true, eventType: "CONTRACT_DEPLOYED", limit: 10000 });
        } catch (error) {
          state.nativeDeploymentMemoryFailure = error?.message || "Native deployment history is unreadable.";
        }
        for (const event of (Array.isArray(records) ? records : []).slice(-10000)) {
          const chain = normalizeChainId(event?.chain);
          const address = normalizeTokenAddress(event?.raw?.contractAddress, chain);
          if (!chain || !address) continue;
          const key = `${chain}:${address}`;
          if (!index.has(key)) index.set(key, []);
          index.get(key).push(event);
        }
        state.nativeDeploymentEventsByIdentity = index;
      }
      const native = nativeContractDeployerEvidence(project,
        state.nativeDeploymentEventsByIdentity.get(`${evm.chain}:${evm.tokenAddress}`) || []);
      if (native) {
        collect(native, native.provider, "nativeContractDeploymentEvidence");
        attempts.push({ provider: native.provider, status: "LOCAL_EVIDENCE_AVAILABLE", durationMs: 0, requestCost: 0,
          reason: "Exact stored top-level creation receipt; token kind, safety, reputation and chain finality remain unverified." });
      }
    }

    if (needs(["nativeLifecycle"]) && providers.useBaseB20Lifecycle &&
        isBaseB20Candidate({ chain: evm.chain, tokenAddress: evm.tokenAddress })) {
      const attempt = await executeProviderCall("base-b20-native",
        () => providers.getBaseB20LifecycleEvidence({ ...project, chain: evm.chain, tokenAddress: evm.tokenAddress }, options),
        options, state, 4, evm.chain);
      const result = attempt.value || {};
      attempts.push({ ...attempt, value: undefined });
      if (attempt.status === "SUCCESS" && isVerifiedBaseB20Evidence(result) && result.address === evm.tokenAddress) {
        collect(result, "base-b20-native", "baseB20LifecycleEvidence");
      } else if (!project.baseB20LifecycleEvidence) {
        projectPatch.baseB20LifecycleEvidence = result;
      }
    }

    const acquire = async (provider, operation, cost, patchKey, beforeOperation = null) => {
      const attempt = await executeProviderCall(provider, operation, options, state, cost, evm.chain, beforeOperation);
      attempts.push({ ...attempt, value: undefined });
      const result = attempt.value || {};
      if (attempt.status === "SUCCESS") collect(result, provider.replace(/-deployer$/, ""), patchKey);
      if (!projectPatch[patchKey] && !project[patchKey]) projectPatch[patchKey] = result;
    };
    const acquireGoPlus = () => acquire(
      "goplus-deployer",
      () => providers.getGoPlusDeployerEvidence(
        { ...project, chain: evm.chain, tokenAddress: evm.tokenAddress },
        { ...providerOptions("goplus"), goPlusRequestSlotReserved: providers.defaultGoPlusDeployerProvider }
      ),
      Math.max(1, Number(options.goplusDeployerProviderRequestCost || 1)),
      "goplusDeployerEvidence",
      providers.defaultGoPlusDeployerProvider ? () => (options.goPlusRateLimiter || waitForGoPlusRequestSlot)({ deadlineAt: recoveryDeadlineAt(state, options), waitForCooldown: options.waitForGoPlusCooldown === true }) : null
    );
    const independentMetadataFirst = providers.independentDeployerMetadataFirst && options.deployerMetadataSourcesAllowed !== false;
    if (providers.preferGoPlusDeployer && !independentMetadataFirst && needs(DEPLOYER_CREATOR_FIELDS)) {
      await acquireGoPlus();
    }

    if (providers.useSourcifyDeployerFallback && needs([...DEPLOYER_CREATOR_FIELDS,
      "deploymentTransactionHash", "creationBlockNumber"])) {
      await acquire(
        "sourcify-v2-deployer",
        () => providers.getSourcifyDeployerEvidence(
          { ...project, chain: evm.chain, tokenAddress: evm.tokenAddress },
          providerOptions("sourcify-v2")
        ),
        Math.max(1, Number(options.sourcifyDeployerProviderRequestCost || 1)),
        "sourcifyDeployerEvidence"
      );
    }

    if (needs(DEPLOYER_CREATION_FIELDS)) {
      await acquire(
        "blockscout-deployer",
        () => providers.getBlockscoutDeployerEvidence(
          { ...project, chain: evm.chain, tokenAddress: evm.tokenAddress },
          providerOptions("blockscout")
        ),
        Math.max(1, Number(options.deployerProviderRequestCost || providers.blockscoutDeployerRequestCost || 2)),
        "blockscoutDeployerEvidence"
      );
    }

    if (providers.useGoPlusDeployerFallback && (!providers.preferGoPlusDeployer || independentMetadataFirst) &&
        needs(DEPLOYER_CREATOR_FIELDS)) {
      await acquireGoPlus();
    }

    if (!needs(DEPLOYER_CREATION_FIELDS)) return finish();
    const etherscanAvailable =
      providers.customEtherscanDeployerProvider ||
      Boolean(etherscanV2ApiKey(evm.chain, options.env || process.env));
    if (etherscanAvailable) {
      await acquire(
        "etherscan-v2-deployer",
        () => providers.getEtherscanV2SecurityEvidence(
          { ...project, chain: evm.chain, tokenAddress: evm.tokenAddress },
          providerOptions("etherscan-v2")
        ),
        Math.max(1, Number(options.etherscanDeployerProviderRequestCost || 3)),
        "etherscanDeployerEvidence"
      );
    } else {
      attempts.push({
        status: "PROVIDER_UNAVAILABLE",
        provider: "etherscan-v2-deployer",
        reason: "Etherscan deployer recovery skipped because no API key is configured.",
        durationMs: 0,
      });
    }
    return finish();
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

function currentHolderObservation(item, options = {}) {
  const now = new Date(typeof options.now === "function" ? options.now() : options.now ?? Date.now());
  return evaluateEvidenceFreshness(item.sourceTimestamp, item.field, now).status === "CURRENT";
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
    const holderFields = ["wallets", "holderAddresses", "holderCount"];
    const rpcFields = ["wallets", "walletTransactions", "walletParticipationHistory"];
    const capableFields = [...holderFields, ...rpcFields];
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
    const attempts = [];
    const observations = [...local];
    const projectPatch = {};
    if (fields.some((field) => holderFields.includes(field) && !observations.some((item) => item.field === field))) {
      const attempt = await executeProviderCall("rugcheck-solana-full",
        () => providers.getSolanaWalletEvidence({ ...project, chain: "solana", tokenAddress }, options), options, state, 1, "solana");
      attempts.push({ ...attempt, value: undefined });
      const result = attempt.value || {};
      const holders = securityHolderObservations(project, [result], options);
      observations.push(...holders);
      if (holders.length && fields.includes("holderCount") && Number.isSafeInteger(result.holderCount) && result.holderCount >= 0) {
        observations.push({ ...holders[0], field: "holderCount", value: result.holderCount, holderSampleOnly: false,
          holderCountSemantics: "PROVIDER_REPORTED_COUNT_NOT_SAMPLE_COUNT" });
      }
      if (result.status === "EVIDENCE_AVAILABLE" && holders.length) projectPatch.solanaWalletEvidence = result;
    }
    if (providers.useSolanaRpcWalletFallback && fields.some((field) => rpcFields.includes(field) &&
        !observations.some((item) => item.field === field))) {
      let result;
      if (state.requestsUsed + 5 > state.maxRequests) attempts.push({ provider: "solana-rpc-wallets", family: "WALLETS",
        status: "REQUEST_BUDGET_EXHAUSTED", durationMs: 0,
        reason: "At least five RPC methods are needed for mainnet identity, a fresh head and exact transaction evidence." });
      else if (providers.defaultSolanaRpcWalletProvider) {
        const transport = options.jsonRpc || jsonRpc;
        const boundedRpc = async (url, method, params, rpcOptions) => {
          const endpointId = walletRpcEndpointId(url);
          const call = await executeProviderCall("solana-rpc-wallets", async () => {
            const remaining = recoveryDeadlineAt(state, options) - (state.now || Date.now)();
            const value = await transport(url, method, params, { ...rpcOptions, retries: 0,
              timeoutMs: Math.max(1, Math.min(rpcOptions.timeoutMs, remaining, Number(options.providerTimeoutMs || 8000))) });
            if (recoveryDeadlineStatus(state, options)) {
              throw new Error("Solana wallet RPC arrived after the recovery deadline.");
            }
            return value;
          }, options, state, 1, `solana:${endpointId}`);
          attempts.push({ ...call, value: undefined, family: "WALLETS", rpcMethod: method, rpcEndpointId: endpointId });
          if (call.status !== "SUCCESS") {
            const error = new Error(call.reason || call.status);
            error.code = call.status;
            throw error;
          }
          return call.value;
        };
        result = await providers.getSolanaRpcWalletEvidence({ ...project, chain: "solana", tokenAddress,
          poolAddress: poolAddressOf(project, "solana") }, { ...options, jsonRpc: boundedRpc });
      } else {
        const attempt = await executeProviderCall("solana-rpc-wallets", () => providers.getSolanaRpcWalletEvidence(
          { ...project, chain: "solana", tokenAddress, poolAddress: poolAddressOf(project, "solana") }, options), options, state, 5, "solana");
        attempts.push({ ...attempt, value: undefined, family: "WALLETS" });
        result = attempt.value;
      }
      if (result) attempts.push({ provider: "solana-rpc-wallets", family: "WALLETS", resultType: "EVIDENCE", requestCost: 0,
        status: result.status === "EVIDENCE_AVAILABLE" ? "RAW_EVIDENCE_AVAILABLE" : "NO_VERIFIED_WALLET_EVIDENCE",
        durationMs: 0, reason: result.warnings?.[0] || null });
      if (result?.status === "EVIDENCE_AVAILABLE" && result.exactTokenIdentity === true && result.exactPoolIdentity === true &&
          result.chain === "solana" && result.tokenAddress === tokenAddress && result.poolAddress === poolAddressOf(project, "solana") &&
          result.genesisHash === "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d") {
        for (const field of rpcFields) if (valueKnown(result[field]) && !observations.some((item) => item.field === field)) observations.push(
          observation(field, result[field], "solana-rpc-wallets", result.sourceTimestamp, confidenceFraction(result.confidence), {
            chain: "solana", tokenAddress, poolAddress: result.poolAddress, exactPoolIdentity: true,
            transferCoverage: result.transferCoverage, rpcEndpointId: result.rpcEndpointId,
            completeHolderCoverage: false, buyerClassificationAvailable: false, currentHoldingVerified: false,
            sourceTimestampMeaning: "PINNED_CONFIRMED_HEAD_FOR_HISTORICAL_OWNER_CHANGE_SAMPLE_NOT_INDIVIDUAL_TRADE_TIME",
          }));
        projectPatch.solanaRpcWalletEvidence = result;
      }
    }
    return { observations, attempts, projectPatch };
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
  const observations = [];
  const attempts = [];
  const cheap = options.cheapHolderMetadataOnly === true;
  const cheapRequest = cheap && providers.useCheapBlockscoutHolderMetadata
    ? resolveBlockscoutWalletRequest(project, options) : null;
  if (cheap && providers.useCheapBlockscoutHolderMetadata && !cheapRequest) return {
    observations, attempts: [{ provider: "blockscout-wallets", status: "NOT_APPLICABLE", durationMs: 0,
      requestCost: 0, reason: "Cheap holder metadata requires a nonconflicting exact EVM chain and token identity." }], projectPatch: {},
  };
  let cheapWalletPatch = {};
  let goPlusWalletPatch = {};
  const goPlusHolderFields = ["wallets", "holderAddresses"];
  const holderSeeds = [];
  const cheapGoPlusCompanions = [];
  const addGoPlusSample = (sample, acquisitionMode) => {
    const holderSample = securityHolderObservations(project, [sample], options);
    const current = holderSample.filter((item) => currentHolderObservation(item, options)).map((item) => ({ ...item,
      acquisitionMode, identityVerifiedOnChain: false, snapshotTimestampVerified: false,
      sourceTimestampMeaning: "PROVIDER_RECEIPT_TIME_NOT_CHAIN_SNAPSHOT_TIME",
    }));
    // Aged provider addresses are query seeds, never current wallet observations.
    holderSeeds.push(...holderSample.filter((item) => item.field === "wallets" && !currentHolderObservation(item, options))
      .flatMap((item) => item.value));
    const stamp = typeof sample?.observedAt === "string" ? Date.parse(sample.observedAt) : NaN;
    const now = new Date(typeof options.now === "function" ? options.now() : options.now ?? Date.now()).getTime();
    const maxAgeMs = Number(options.cacheTtlMs ?? process.env.SECURITY_EVIDENCE_CACHE_TTL_MS ?? 6 * 60 * 60 * 1000);
    const exactCurrentMetadata = sample?.provider === "goplus" && sample.status === "EVIDENCE_AVAILABLE" &&
      sample.responseIdentityVerified === true && securityIdentityMatches(sample, evm) &&
      Number.isFinite(stamp) && stamp > 0 && Number.isFinite(now) && stamp <= now &&
      Number.isFinite(maxAgeMs) && maxAgeMs > 0 && now - stamp <= maxAgeMs &&
      typeof sample.confidence === "number" && Number.isFinite(sample.confidence) && confidenceFraction(sample.confidence) >= 0.5;
    // Empty holder samples must not discard genuine creator or adverse security metadata.
    if (current.length || (options.cheapHolderMetadataOnly === true && exactCurrentMetadata)) {
      observations.push(...current, ...(!cheap ? securityObservations([sample], [...SECURITY_FIELDS], evm) : []));
      if (cheap) cheapGoPlusCompanions.push(sample);
      const existing = knownSecurityItems({ evidence: [
        ...(Array.isArray(project.securityEvidence) ? project.securityEvidence : []),
        ...(Array.isArray(project.freeSecurityEvidence?.evidence) ? project.freeSecurityEvidence.evidence : []),
        ...(cheap ? goPlusWalletPatch.securityEvidence || [] : []),
      ] }).filter((item) => securityIdentityMatches(item, evm));
      goPlusWalletPatch = { goplusWalletEvidence: sample, ...securityEvidencePatch([...existing, sample]) };
    }
    return current.length;
  };
  const needsGoPlusHolders = () => fields.some((field) => goPlusHolderFields.includes(field) &&
    !observations.some((item) => item.field === field));
  if (cheap) {
    const local = [...new Set([
      ...(Array.isArray(project.securityEvidence) ? project.securityEvidence : []),
      ...(Array.isArray(project.freeSecurityEvidence?.evidence) ? project.freeSecurityEvidence.evidence : []),
      project.goplusDeployerEvidence, project.goplusWalletEvidence,
    ].filter(Boolean))];
    const recovered = local.reduce((count, sample) => count + addGoPlusSample(sample, "EXISTING_SECURITY_PAYLOAD"), 0);
    if (recovered || cheapGoPlusCompanions.length) attempts.push({ provider: "goplus-wallets", family: "WALLETS",
      status: "LOCAL_EVIDENCE_AVAILABLE", durationMs: 0, requestCost: 0, holderSampleFieldsRecovered: recovered });
  }
  if (providers.useGoPlusWalletFallback && GOPLUS_WALLET_CHAINS.includes(evm.chain) && needsGoPlusHolders()) {
    if (providers.defaultGoPlusWalletProvider && options.useCache !== false) {
      const cached = (options.readCachedSecurityEvidence || getCachedSecurityEvidence)("goplus", evm.chain, evm.tokenAddress, options.cacheTtlMs);
      const previousCompanions = cheapGoPlusCompanions.length;
      const recovered = addGoPlusSample(cached, "EXISTING_SECURITY_PAYLOAD");
      const metadataRecovered = cheapGoPlusCompanions.length > previousCompanions;
      if (recovered || holderSeeds.length || metadataRecovered) attempts.push({ provider: "goplus-wallets", family: "WALLETS",
        status: recovered || metadataRecovered ? "LOCAL_EVIDENCE_AVAILABLE" : "HOLDER_QUERY_SEEDS_AVAILABLE",
        durationMs: 0, requestCost: 0, holderSampleFieldsRecovered: recovered });
    }
  }
  const localCheapFields = new Set([...observations,
    ...securityObservations(cheapGoPlusCompanions, [...SECURITY_FIELDS], evm)].map((item) => item.field));
  if (cheap && providers.useCheapBlockscoutHolderMetadata && cheapRequest.baseUrl &&
      fields.some((field) => ["wallets", "holderAddresses", "holderCount"].includes(field) && !localCheapFields.has(field))) {
    let requestCost = 0;
    const attempt = await executeProviderCall("blockscout-wallets", () => {
      requestCost = 2;
      const remaining = recoveryDeadlineAt(state, options) - (state.now || Date.now)();
      return providers.getBlockscoutWalletEvidence({ ...project, chain: evm.chain, tokenAddress: evm.tokenAddress,
        poolAddress: poolAddressOf(project, evm.chain) }, { ...options, walletHistory: false,
        timeoutMs: Math.max(1, Math.min(Number(options.timeoutMs || options.providerTimeoutMs || 8000), remaining)) });
    }, options, state, 2, evm.chain,
    options.blockscoutMetadataRateLimiter ||
      (providers.getBlockscoutWalletEvidence === getBlockscoutWalletEvidence && !options.fetchJson
        ? () => waitForBlockscoutMetadataPair({ deadlineAt: recoveryDeadlineAt(state, options) }) : null));
    attempts.push({ ...attempt, value: undefined, family: "WALLETS", requestCost });
    const result = attempt.value;
    if (result) cheapWalletPatch = { blockscoutWalletEvidence: result };
    const resultIdentity = result ? resolveBlockscoutWalletRequest(result, options) : null;
    const stamp = typeof result?.observedAt === "string" ? Date.parse(result.observedAt) : NaN;
    const now = new Date(typeof options.now === "function" ? options.now() : options.now ?? Date.now()).getTime();
    if (attempt.status === "SUCCESS" && result?.status === "EVIDENCE_AVAILABLE" && result.exactTokenIdentity === true &&
        resultIdentity?.chain === evm.chain && resultIdentity.tokenAddress === evm.tokenAddress &&
        Number.isFinite(stamp) && stamp > 0 && Number.isFinite(now) && stamp <= now) {
      for (const field of [...new Set([...fields, "wallets", "holderAddresses"])]) {
        if (!["wallets", "holderAddresses", "holderCount"].includes(field) || !valueKnown(result[field]) || localCheapFields.has(field)) continue;
        const item = observation(field, result[field], "blockscout-wallets", result.observedAt, 0.82, {
          chain: evm.chain, tokenAddress: evm.tokenAddress, exactPoolIdentity: false,
          holderSampleOnly: field !== "holderCount", completeHolderCoverage: false, buyerClassificationAvailable: false,
          ...(field === "holderCount" ? { holderCountSemantics: "PROVIDER_REPORTED_COUNT_NOT_SAMPLE_COUNT" } : {}),
          acquisitionMode: "WALLET_PROVIDER_RECOVERY", identityVerifiedOnChain: false, snapshotTimestampVerified: false,
          sourceTimestampMeaning: "PROVIDER_RECEIPT_TIME_NOT_CHAIN_SNAPSHOT_TIME",
        });
        if (currentHolderObservation(item, options)) observations.push(item);
      }
    }
  }
  if (providers.useGoPlusWalletFallback && GOPLUS_WALLET_CHAINS.includes(evm.chain) && needsGoPlusHolders()) {
    const goPlusAttempt = await executeProviderCall("goplus-wallets",
      () => providers.getGoPlusWalletEvidence({ ...project, chain: evm.chain, tokenAddress: evm.tokenAddress },
        { ...options, useCache: holderSeeds.length ? false : options.useCache,
          goPlusRequestSlotReserved: providers.defaultGoPlusWalletProvider }),
      options, state, 1, evm.chain, providers.defaultGoPlusWalletProvider
        ? () => (options.goPlusRateLimiter || waitForGoPlusRequestSlot)({ deadlineAt: recoveryDeadlineAt(state, options), waitForCooldown: options.waitForGoPlusCooldown === true }) : null);
    const recovered = goPlusAttempt.status === "SUCCESS"
      ? addGoPlusSample(goPlusAttempt.value, "WALLET_PROVIDER_RECOVERY") : 0;
    attempts.push({ ...goPlusAttempt, value: undefined, family: "WALLETS",
      holderSampleFieldsRecovered: recovered });
  }
  if (options.cheapHolderMetadataOnly === true ||
      (fields.length && fields.every((field) => observations.some((item) => item.field === field)))) {
    return { observations: [...observations, ...securityObservations(cheapGoPlusCompanions, [...SECURITY_FIELDS], evm)],
      attempts, projectPatch: { ...cheapWalletPatch, ...goPlusWalletPatch } };
  }
  const attempt = await executeProviderCall("blockscout-wallets",
    () => providers.getBlockscoutWalletEvidence({ ...project, chain: evm.chain, tokenAddress: evm.tokenAddress,
      poolAddress: poolAddressOf(project, evm.chain) }, options),
    options, state, Math.max(1, Number(options.walletProviderRequestCost || 3)), evm.chain);
  const result = attempt.value || {};
  const timestamp = result.observedAt || new Date().toISOString();
  const exactResult = (!result.chain || normalizeChainId(result.chain) === evm.chain) &&
    (!result.tokenAddress || lower(result.tokenAddress) === lower(evm.tokenAddress));
  const companionFields = ["wallets", "holderAddresses", "buyerAddresses", "sellerAddresses", "walletTransactions", "walletParticipationHistory"];
  if (attempt.status === "SUCCESS" && result.status === "EVIDENCE_AVAILABLE" && exactResult) {
    observations.push(...[...new Set([...fields, ...companionFields])].map((field) =>
      observation(field, result[field], "blockscout-wallets", timestamp, 0.82, {
        chain: evm.chain, tokenAddress: evm.tokenAddress, poolAddress: result.poolAddress || null,
        exactPoolIdentity: result.exactPoolIdentity === true,
      })).filter((item) => valueKnown(item.value)));
  }
  attempts.push({ ...attempt, value: undefined });
  let rpcResult = null;
  const rpcFields = ["wallets", "holderAddresses", "walletTransactions", "walletParticipationHistory"];
  const missingRpcField = fields.some((field) => rpcFields.includes(field) &&
    !observations.some((item) => item.field === field));
  const rpcRecoveryOptions = { ...options, walletRpcHolderSeeds: [
    ...(Array.isArray(options.walletRpcHolderSeeds) ? options.walletRpcHolderSeeds : []), ...new Set(holderSeeds),
  ] };
  if (providers.useRpcWalletFallback && (missingRpcField || !observations.some((item) => companionFields.includes(item.field)))) {
    if (providers.defaultRpcWalletProvider) {
      if (state.requestsUsed + 3 > state.maxRequests) {
        attempts.push({ provider: "rpc-wallets", status: "REQUEST_BUDGET_EXHAUSTED", family: "WALLETS",
          durationMs: 0, reason: "At least three RPC requests are required to pin chain, block and transfer evidence." });
      } else {
        const transport = options.jsonRpc || jsonRpc;
        const boundedRpc = async (url, method, params, rpcOptions) => {
          const endpointId = walletRpcEndpointId(url);
          const circuitScope = options.rpcUrl && !options.rpcUrls?.length ? evm.chain : `${evm.chain}:${endpointId}`;
          const call = await executeProviderCall("rpc-wallets", async () => {
            const remaining = recoveryDeadlineAt(state, options) - (state.now || Date.now)();
            const value = await transport(url, method, params, { ...rpcOptions, retries: 0,
              timeoutMs: Math.max(1, Math.min(rpcOptions.timeoutMs, remaining,
                Number(options.providerTimeoutMs || 8000))) });
            if (recoveryDeadlineStatus(state, options)) {
              throw new Error("Wallet RPC response arrived after the recovery deadline.");
            }
            return value;
          }, options, state, 1, circuitScope);
          attempts.push({ ...call, value: undefined, family: "WALLETS", rpcMethod: method, rpcEndpointId: endpointId });
          if (call.status !== "SUCCESS") {
            const error = new Error(call.reason || call.status);
            error.code = call.status;
            throw error;
          }
          return call.value;
        };
        rpcResult = await providers.getRpcWalletEvidence({ ...project, chain: evm.chain, tokenAddress: evm.tokenAddress },
          { ...rpcRecoveryOptions, jsonRpc: boundedRpc });
      }
    } else {
      const rpcAttempt = await executeProviderCall("rpc-wallets",
        () => providers.getRpcWalletEvidence({ ...project, chain: evm.chain, tokenAddress: evm.tokenAddress }, rpcRecoveryOptions),
        options, state, 3, evm.chain);
      attempts.push({ ...rpcAttempt, value: undefined });
      rpcResult = rpcAttempt.value;
    }
    if (rpcResult) attempts.push({ provider: "rpc-wallets", family: "WALLETS", resultType: "EVIDENCE", requestCost: 0,
      status: rpcResult.status === "EVIDENCE_AVAILABLE" ? "RAW_EVIDENCE_AVAILABLE" : "NO_VERIFIED_WALLET_EVIDENCE",
      durationMs: 0, reason: rpcResult.warnings?.[0] || null });
    if (rpcResult?.status === "EVIDENCE_AVAILABLE" &&
      rpcResult.exactTokenIdentity === true && normalizeChainId(rpcResult.chain) === evm.chain &&
      lower(rpcResult.tokenAddress) === lower(evm.tokenAddress)) {
      for (const field of rpcFields) {
        if (valueKnown(rpcResult[field]) && !observations.some((item) => item.field === field)) observations.push(observation(field, rpcResult[field], "rpc-wallets",
          rpcResult.sourceTimestamp || rpcResult.observedAt, confidenceFraction(rpcResult.confidence), { chain: evm.chain,
            tokenAddress: evm.tokenAddress, transferCoverage: rpcResult.transferCoverage,
            holderCoverage: rpcResult.holderCoverage, holderBalanceEvidence: rpcResult.holderBalanceEvidence,
            rpcEndpointId: rpcResult.rpcEndpointId, rpcEndpointAttempts: rpcResult.rpcEndpointAttempts,
            holderSampleOnly: rpcResult.holderBalanceEvidence?.length > 0,
            completeHolderCoverage: false, buyerClassificationAvailable: false,
            sourceTimestampMeaning: "PINNED_BLOCK_OR_TRANSFER_WINDOW_HEAD_NOT_INDIVIDUAL_TRADE_TIME" }));
      }
    }
  }
  return {
    observations,
    attempts,
    projectPatch: { blockscoutWalletEvidence: result, ...goPlusWalletPatch, ...(rpcResult ? { rpcWalletEvidence: rpcResult } : {}) },
  };
}

async function recoverWalletEvidenceWithHistory(project, fields, providers, options, state) {
  // The persistent transfer ledger is EVM-specific; do not discard fresh Solana history through it.
  if (options.cheapHolderMetadataOnly === true || options.walletHistory === false || chainOf(project) === "solana") return recoverWalletEvidence(project, fields, providers, options, state);
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
  return normalizeExactGeckoPool(raw, { chain: expectedChain, tokenAddress: expectedToken,
    poolAddress: expectedPool }, { requireResourceTypes: false });
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
    case "buyTransactions24h":
    case "sellTransactions24h":
      return numberOrNull(pool[field]);
    default:
      return null;
  }
}

function geckoObservations(pool = {}, fields = [], timestamp = new Date().toISOString(), mode = "exact-pool") {
  return fields
    .map((field) => observation(
      field,
      geckoValue(pool, field),
      "geckoterminal",
      timestamp,
      0.9,
      {
        identityMatchMode: mode,
        marketEvidenceOnly: true,
        geckoTerminalPoolId: pool.geckoTerminalPoolId || null,
        endpoint: mode,
        chain: pool.chain,
        tokenAddress: pool.tokenAddress,
        poolAddress: pool.poolAddress,
        tokenSide: "base",
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
  const identity = geckoPoolRequestIdentity(project);
  if (!identity) {
    return {
      observations: [],
      attempts: [{
        status: "NOT_APPLICABLE",
        provider: "geckoterminal",
        reason: "GeckoTerminal fallback requires nonconflicting exact supported chain/token identity and valid supplied pool claims.",
        durationMs: 0,
      }],
    };
  }
  const { chain, tokenAddress, poolAddress } = identity;

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
  const controller = new AbortController();
  const providerOptions = { maxAttempts: 1,
    timeoutMs: Math.max(1, Math.min(timeoutMs, recoveryDeadlineAt(state, options) - (state.now || Date.now)())),
    signal: controller.signal, now: state.now || options.now || Date.now,
    fetchImpl: options.fetchImpl, onResponseBytes: options.onResponseBytes };
  const attempt = await executeProviderCall(
    "geckoterminal",
    () => poolAddress
      ? providers.getGeckoPoolByAddress(chain, poolAddress, providerOptions)
      : providers.getGeckoTokenPools(chain, tokenAddress, providerOptions),
    options,
    state,
    1,
    chain,
    null,
    () => controller.abort()
  );
  if (attempt.status !== "SUCCESS") return { observations: [], attempts: [attempt] };
  const discovery = poolAddress ? null : selectExactGeckoTokenPool(attempt.value, identity);
  const pool = poolAddress ? strictGeckoPool(attempt.value, project, identity) : discovery.pool;
  if (!pool) {
    return {
      observations: [],
      attempts: [{
        ...attempt,
        status: discovery?.status || "NO_EXACT_POOL_MATCH",
        reason: discovery?.reason || "GeckoTerminal did not return the exact requested chain, base token, and pool identity.",
        value: undefined,
      }],
    };
  }

  return {
    observations: geckoObservations(
      pool,
      [...new Set([...fields, ...GECKO_COMPANION_FIELDS])],
      new Date((state.now || options.now || Date.now)()).toISOString(),
      poolAddress ? "exact-pool" : "exact-token-pools",
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
  if (lower(item.provider || item.source).includes("sourcify") &&
      !sourcifyResponseIdentityMatches(item.raw, identity.chain, identity.tokenAddress)) return false;
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
  const booleanField = { contractVerified: "verifiedSource", honeypotDetected: "honeypot",
    mintAuthorityEnabled: "mintRisk", sellRestricted: "blacklistRisk", blacklistEnabled: "blacklistRisk" }[field];
  if (booleanField && typeof item[booleanField] !== "boolean") return false;
  if (provider.includes("goplus") && ["buyTaxPct", "sellTaxPct", "holderCount"].includes(field)) {
    const rawKey = { buyTaxPct: "buy_tax", sellTaxPct: "sell_tax", holderCount: "holder_count" }[field];
    const expected = field === "holderCount" ? nonnegativeSafeInteger(item.raw?.[rawKey]) : goPlusTaxPct(item.raw?.[rawKey]);
    if (expected === null || item[field] !== expected) return false;
  }
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
        sourceItem.sourceTimestamp || sourceItem.observedAt || result.observedAt || new Date().toISOString(),
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

function freshAuthorityPair(item, options) {
  const checks = (Array.isArray(item.testedChecks) ? item.testedChecks : []).join(" ").toLowerCase();
  const stamp = Date.parse(item.sourceTimestamp || item.observedAt || "");
  const now = new Date(typeof options.now === "function" ? options.now() : options.now ?? Date.now()).getTime();
  return item.identityVerifiedOnChain === true && checks.includes("mint authority") && checks.includes("freeze authority") &&
    typeof item.mintRisk === "boolean" && typeof item.freezeRisk === "boolean" &&
    Number.isFinite(stamp) && Number.isFinite(now) && stamp <= now && now - stamp <= 300000;
}

async function collectBudgetedSecurity(project, providers, options, state) {
  const attempts = [];
  const pending = [];
  const solana = chainOf(project) === "solana";
  const transport = options.securityEvidence?.fetchJson || (solana && options.providers?.fetchJson) || (async (url, init) => {
    const response = await (options.providers?.fetch || fetch)(url, {
      ...init, headers: { accept: "application/json", ...init.headers },
    });
    if (!response.ok) {
      const error = new Error(`Security provider HTTP ${response.status}`);
      error.status = response.status;
      const retryAfter = response.headers?.get?.("retry-after");
      const seconds = typeof retryAfter === "string" && /^\d+(?:\.\d+)?$/.test(retryAfter.trim())
        ? Number(retryAfter) : null;
      const milliseconds = seconds !== null ? seconds * 1000 : Date.parse(retryAfter || "") - Number((state.now || Date.now)());
      if (Number.isFinite(milliseconds) && milliseconds > 0) error.retryAfterMs = milliseconds;
      throw error;
    }
    return response.json();
  });
  const request = async (provider, url, init = {}) => {
    const rpc = solana && init.method === "POST";
    const method = rpc ? JSON.parse(init.body).method : null;
    let controller;
    let transportError;
    let admitted = false;
    let dispatched = false;
    const attempt = await executeProviderCall(provider, async () => {
      admitted = true;
      const remaining = recoveryDeadlineAt(state, options) - (state.now || Date.now)();
      if (recoveryDeadlineStatus(state, options) || init.signal?.aborted) {
        throw new Error("Security request deadline expired before HTTP start.");
      }
      const connectorTimeout = Number(init.timeoutMs);
      const timeout = Math.max(1, Math.floor(Math.min(Number(options.providerTimeoutMs || options.timeoutMs || 8000),
        Number.isFinite(connectorTimeout) && connectorTimeout > 0 ? connectorTimeout : Infinity, remaining)));
      controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeout)]);
      let value;
      try {
        dispatched = true;
        value = await transport(url, { ...init, signal: init.signal ? AbortSignal.any([signal, init.signal]) : signal, timeoutMs: timeout });
      } catch (error) {
        transportError = error;
        if (error.status === 404 && ["goplus-security", "sourcify-security", "blockscout-security"].includes(provider)) {
          return { candidateEvidenceUnavailable: true, reason: "Security provider returned no contract metadata." };
        }
        if (error.status === 429) return { providerFailure: true, rateLimited: true,
          retryAfterMs: Math.max(61000, Number(error.retryAfterMs) || 0), warnings: ["Security provider HTTP 429"] };
        throw error;
      }
      if (signal.aborted || init.signal?.aborted || recoveryDeadlineStatus(state, options)) {
        throw new Error("Security response arrived after its deadline.");
      }
      if (rpc && value?.error) throw new Error("Solana security RPC returned a JSON-RPC error.");
      return value;
    }, options, state, 1, solana ? (rpc ? walletRpcEndpointId(url) : "solana") : walletRpcEndpointId(new URL(url).origin),
    provider === "goplus-security" ? () => (options.goPlusRateLimiter || waitForGoPlusRequestSlot)({
      deadlineAt: recoveryDeadlineAt(state, options), waitForCooldown: options.waitForGoPlusCooldown === true,
    }) : null, () => controller?.abort());
    attempts.push({ ...attempt, value: undefined, family: "SECURITY", requestCost: admitted ? 1 : 0,
      httpRequests: dispatched ? 1 : 0, ...(method ? { rpcMethod: method } : {}) });
    if (attempt.status !== "SUCCESS") {
      const error = ["FAILED", "RATE_LIMITED", "NO_CANDIDATE_EVIDENCE"].includes(attempt.status) && transportError
        ? transportError : new Error(attempt.reason);
      error.code = attempt.status;
      throw error;
    }
    return attempt.value;
  };
  const trackedRequest = (...args) => {
    const promise = request(...args);
    pending.push(promise);
    return promise;
  };
  const { providers: providerOverrides, ...securityOptions } = options.securityEvidence || options;
  let value;
  try {
    value = await providers.getFreeSecurityEvidence(project, {
      ...securityOptions, ...(Array.isArray(providerOverrides) ? { providers: providerOverrides } : {}),
      now: state.now || options.now,
      fetchJson: (url, init = {}) => trackedRequest(init.method === "POST" ? "solana-security-rpc" : "rugcheck", url, init),
      ...(!solana ? { fetchJsonForProvider: provider => (url, init) => trackedRequest(provider, url, init),
        goPlusRequestSlotReserved: true, goPlusRateLimiter: options.goPlusRateLimiter || waitForGoPlusRequestSlot } : {}),
    });
  } finally {
    // A connector's Promise.all may reject while already-admitted siblings are still running.
    await Promise.allSettled(pending);
  }
  return { attempt: { status: "SUCCESS", value }, attempts: attempts.length ? attempts : [{
    provider: "free-security", status: "NO_TRANSPORT_REQUIRED", requestCost: 0, httpRequests: 0,
    durationMs: 0, reason: "Native security connectors required no HTTP requests (cache or unavailable configuration).",
  }] };
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
  const eligible = (items) => items.filter((item) =>
    (options.requiresAuthorityPair !== true || freshAuthorityPair(item, options)) &&
    (options.requiresMintAccountEvidence !== true || resolveCanonicalIdentity({
      ...project, solanaMintAccountEvidence: null, securityEvidence: [item],
    }).mintAccountEvidence !== null));
  const localObservations = securityObservations(eligible(existing), fields, identity);
  if (localObservations.length === fields.length) {
    return {
      observations: localObservations,
      attempts: [{ status: "LOCAL_EVIDENCE_AVAILABLE", provider: "existing-security-evidence", durationMs: 0, reason: null }],
      projectPatch: securityEvidencePatch(existing),
    };
  }
  let goPlusCooldownSkipped = false;
  const customSecurityProviders = (options.securityEvidence || options).providers;
  const budgeted = providers.defaultFreeSecurityProvider && !Array.isArray(customSecurityProviders)
    ? await collectBudgetedSecurity({ ...project, chain, tokenAddress }, providers, options, state) : null;
  const attempt = budgeted?.attempt || await executeProviderCall(
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
      goPlusCooldownSkipped = !await (options.goPlusRateLimiter || waitForGoPlusRequestSlot)({ deadlineAt: recoveryDeadlineAt(state, options), waitForCooldown: options.waitForGoPlusCooldown === true });
      return true;
    } : null
  );
  if (attempt.status !== "SUCCESS") {
    return { observations: localObservations, attempts: [attempt], projectPatch: existing.length ? securityEvidencePatch(existing) : {} };
  }

  const result = attempt.value || {};
  const items = knownSecurityItems(result).filter((item) => securityIdentityMatches(item, identity));
  if (budgeted && !items.length && budgeted.attempts.every(item => item.httpRequests === 0)) {
    return { observations: localObservations, attempts: budgeted.attempts, projectPatch: {} };
  }
  const observations = [
    ...securityObservations(eligible([...existing, ...items]), fields, identity, result),
    ...securityHolderObservations(project, [...existing, ...items], options.securityEvidence || options),
  ];

  return {
    observations,
    attempts: budgeted?.attempts || [{ ...attempt, value: undefined, providers: result.summary?.knownProviders || [] }],
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
  if (!["lifi", "jupiter", "raydium", "0x"].includes(source) || !identity.exact ||
      normalizeChainId(route.chain) !== identity.chain ||
      normalizeTokenAddress(route.tokenAddress, identity.chain) !== identity.tokenAddress ||
      normalizeTokenAddress(route.contractAddress, identity.chain) !== identity.tokenAddress ||
      normalizePoolAddress(route.poolAddress, identity.chain) !== identity.poolAddress) return false;
  const quoteToken = normalizeTokenAddress(route.quoteTokenAddress, identity.chain);
  if (!quoteToken || quoteToken === identity.tokenAddress) return false;
  const sides = new Set();
  try {
    // A failed quote-asset attempt is not one of the selected route's two legs.
    const quotes = responses.filter((item) => {
      if (item.provider !== source || item.adapter === "lifi-token") return false;
      const params = new URL(item.url).searchParams;
      const solana = ["jupiter", "raydium"].includes(source);
      const from = normalizeTokenAddress(params.get(solana ? "inputMint" : source === "0x" ? "sellToken" : "fromToken"), identity.chain);
      const to = normalizeTokenAddress(params.get(solana ? "outputMint" : source === "0x" ? "buyToken" : "toToken"), identity.chain);
      return (from === quoteToken && to === identity.tokenAddress) || (from === identity.tokenAddress && to === quoteToken);
    });
    if (quotes.length !== 2) return false;
    for (const { url, value } of quotes) {
      const params = new URL(url).searchParams;
      const solana = ["jupiter", "raydium"].includes(source);
      const from = normalizeTokenAddress(params.get(solana ? "inputMint" : source === "0x" ? "sellToken" : "fromToken"), identity.chain);
      const to = normalizeTokenAddress(params.get(solana ? "outputMint" : source === "0x" ? "buyToken" : "toToken"), identity.chain);
      const side = from === quoteToken && to === identity.tokenAddress ? "BUY"
        : from === identity.tokenAddress && to === quoteToken ? "SELL" : null;
      if (!side || sides.has(side)) return false;
      const amount = params.get(solana ? "amount" : source === "0x" ? "sellAmount" : "fromAmount");
      if (source === "raydium") {
        if (identity.chain !== "solana") return false;
        verifyRaydiumQuote(value, { fromToken: from, toToken: to, fromAmount: amount, poolAddress: identity.poolAddress });
      } else if (source === "lifi") {
        if (normalizeChainId(params.get("fromChain")) !== identity.chain ||
            normalizeChainId(params.get("toChain")) !== identity.chain) return false;
        verifyActionIdentity(value, { chain: identity.chain, side, tokenAddress: identity.tokenAddress,
          quoteTokenAddress: quoteToken, fromAmount: amount });
      } else {
        if (source === "jupiter" ? identity.chain !== "solana"
          : normalizeChainId(params.get("chainId")) !== identity.chain) return false;
        verifyDirectQuoteIdentity(value, { source, chain: identity.chain,
          fromToken: from, toToken: to, fromAmount: amount });
      }
      const pools = source === "raydium" ? value.data.routePlan.map(step => step.poolId) : source === "jupiter"
        ? (value.routePlan || []).map((step) => normalizePoolAddress(step?.swapInfo?.ammKey, identity.chain))
        : [...extractLiFiRoutePoolAddresses(value, identity.chain),
          ...(Array.isArray(value.route?.fills) ? value.route.fills : []).map((fill) => normalizePoolAddress(fill.poolAddress, identity.chain))];
      if (!pools.includes(identity.poolAddress)) return false;
      const selectedOutput = route[side === "BUY" ? "buyQuote" : "sellQuote"]?.outAmount;
      const observedOutput = source === "jupiter" ? value.outAmount : source === "lifi"
        ? first([value.estimate?.toAmount, value.toAmount, value.action?.toAmount]) : null;
      if (selectedOutput !== undefined && observedOutput !== null && String(selectedOutput) !== String(observedOutput)) return false;
      sides.add(side);
    }
    return sides.has("BUY") && sides.has("SELL") ? quotes : false;
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
  if (hasKnownTransferRestriction(project)) return empty([{ provider: "execution-proof-recovery", status: "SAFETY_BLOCKED",
    durationMs: 0, reason: "Observed transfer restrictions block live quote recovery." }]);

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
    const { [PROVIDER_REQUEST_ADMISSION]: admission, ...transportInit } = init;
    const provider = init.adapter === "lifi-token" ? "lifi" : init.adapter;
    let failure = null;
    let requestController;
    const attempt = await executeProviderCall(provider, async () => {
      const controller = new AbortController();
      requestController = controller;
      const signal = init.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal;
      const configuredTimeout = Math.max(250, Number(options.providerTimeoutMs || options.timeoutMs ||
        process.env.ACTIVE_EVIDENCE_PROVIDER_TIMEOUT_MS || process.env.ACTIVE_EVIDENCE_RECOVERY_PROVIDER_TIMEOUT_MS || 8_000));
      const providerTimeoutMs = Math.min(configuredTimeout, Number(init.timeoutMs) || configuredTimeout);
      const remainingMs = recoveryDeadlineAt(state, options) - clock();
      const deadlineOwnsTimeout = Number.isFinite(remainingMs) && remainingMs <= providerTimeoutMs;
      const timeoutMs = Math.max(1, Math.min(providerTimeoutMs, remainingMs));
      let timer;
      let onAbort;
      try {
        if (signal.aborted) throw new Error("Execution provider request aborted before start.");
        if (recoveryDeadlineStatus(state, options)) {
          throw new Error("Execution provider deadline exhausted before start.");
        }
        const aborted = new Promise((_, reject) => {
          onAbort = () => reject(new Error("Execution provider request aborted or timed out."));
          signal.addEventListener("abort", onAbort, { once: true });
        });
        timer = setTimeout(() => {
          // Timer expiry owns this decision; wall-clock rounding must not reopen its budget.
          if (deadlineOwnsTimeout) recoveryDeadlineStatus(state, options, true);
          controller.abort();
        }, timeoutMs);
        // No await separates dispatch admission from the transport invocation.
        admission?.markDispatched();
        const value = await Promise.race([transport(url, { ...transportInit, timeoutMs, signal }), aborted]);
        if (recoveryDeadlineStatus(state, options) || signal.aborted) {
          throw new Error("Execution provider response arrived after its deadline.");
        }
        responses.push({ provider, adapter: init.adapter, url, value });
        return value;
      } catch (error) {
        failure = error;
        recoveryDeadlineStatus(state, options);
        if ([400, 404, 422].includes(error?.status)) {
          return { candidateEvidenceUnavailable: true, reason: redact(error.message) };
        }
        throw new Error(redact(error?.message || "Execution provider request failed."));
      } finally {
        clearTimeout(timer);
        if (onAbort) signal.removeEventListener("abort", onAbort);
      }
    }, options, state, 1, market ? "cex" : identity.chain, null, () => requestController?.abort());
    calls.push({ attempt, failure });
    if (attempt.status !== "SUCCESS") {
      admission?.rejectBeforeDispatch();
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
  const executionQuotes = !market && route ? exactExecutionQuotes(route, identity, responses) : null;
  if (!route || route.buyQuoteVerified !== true || route.sellQuoteVerified !== true ||
      !Number.isFinite(Date.parse(route.quoteTimestamp)) ||
      !(exactMarket || executionQuotes)) {
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
  if (["jupiter", "0x"].includes(route.source) && !executionQuotes
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
  const requiresAuthorityPair = (Array.isArray(requests) ? requests : [])
    .some((request) => request?.item?.requiresAuthorityPair === true || request?.requiresAuthorityPair === true);
  const requiresMintAccountEvidence = (Array.isArray(requests) ? requests : [])
    .some((request) => request?.item?.requiresMintAccountEvidence === true);
  const sources = targetSourceNames(requests);
  const attempts = [];
  const scopedAttempts = (rows, requestedFields) => (rows || []).map(attempt => ({ ...attempt,
    requestedFields: [...requestedFields],
  }));
  let executionAdapterResults = [];
  const requestedWalletFields = fields.filter((field) => WALLET_RAW_FIELDS.has(field));
  const cheapHolderMetadataOnly = requestedWalletFields.length > 0 && requestedWalletFields.every(field => field === "holderAddresses") &&
    requests.some(request => fieldOf(request) === "holderAddresses" && request?.item?.cheapHolderMetadataOnly === true);
  // Cheap recovery owns local holder reuse so its adverse companions are retained as well.
  const observations = (cheapHolderMetadataOnly || options.cheapHolderMetadataOnly === true ? [] : securityHolderObservations(project, [
    ...(Array.isArray(project.securityEvidence) ? project.securityEvidence : []),
    ...(Array.isArray(project.freeSecurityEvidence?.evidence) ? project.freeSecurityEvidence.evidence : []),
    project.goplusDeployerEvidence,
  ], options)).filter((item) =>
    (fields.includes(item.field) || !Array.isArray(project[item.field]) || !project[item.field].length) &&
    (item.source !== "goplus" || currentHolderObservation(item, options)));
  let projectPatch = {};

  const dexFields = fields.filter((field) => DEX_FIELDS.has(field));
  const dexRequested = sourceRequested(sources, ["dexscreener", "native rpc"]);
  const geckoRequested = sourceRequested(sources, ["geckoterminal"]);
  if (dexFields.length && dexRequested) {
    const result = await recoverDex(project, dexFields, providers, options, executionState);
    observations.push(...result.observations);
    attempts.push(...scopedAttempts(result.attempts, dexFields));
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
    attempts.push(...scopedAttempts(result.attempts, geckoFields));
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
    attempts.push(...scopedAttempts(result.attempts, defiLlamaExactFields));
  }

  const recoveredFields = new Set(observations.map((item) => item.field));
  const deployerFields = fields.filter(
    (field) => DEPLOYER_FIELDS.has(field) && !recoveredFields.has(field)
  );
  const walletFields = fields.filter(
    (field) => WALLET_RAW_FIELDS.has(field) && !recoveredFields.has(field)
  );
  let securityFields = fields.filter(
    (field) => SECURITY_FIELDS.has(field) && !recoveredFields.has(field)
  );
  const aggregateFields = fields.filter(
    (field) => AGGREGATE_MARKET_FIELDS.has(field) && !recoveredFields.has(field)
  );
  const executionFields = fields.filter((field) => EXECUTION_RAW_FIELDS.has(field));
  const parallel = [];
  let executionProject = project;
  let safetyReady = true;
  if (requiresMintAccountEvidence && executionFields.length && chainOf(project) === "solana") {
    const adverse = (candidate) => {
      const identity = { chain: chainOf(candidate), tokenAddress: tokenAddressOf(candidate, chainOf(candidate)) };
      const evidence = [
        ...(Array.isArray(candidate.securityEvidence) ? candidate.securityEvidence : []),
        ...(Array.isArray(candidate.freeSecurityEvidence?.evidence) ? candidate.freeSecurityEvidence.evidence : []),
      ].filter(Boolean);
      const scoped = evidence.filter(item => securityIdentityMatches(item, identity));
      // Summaries over mixed identities must be rebuilt from the candidate's raw records.
      const summaries = evidence.length ? [summarizeSecurityEvidence(scoped)]
        : [candidate.securityEvidenceSummary, candidate.freeSecurityEvidence?.summary].filter(item => item &&
          (!item.chain || normalizeChainId(item.chain) === identity.chain) &&
          (!(item.address || item.tokenAddress) || normalizeTokenAddress(item.address || item.tokenAddress, identity.chain) === identity.tokenAddress));
      return decisionProofAssessment(candidate).conclusivelyRejected ||
        hasKnownTransferRestriction(candidate) || candidate.identityConflict === true || candidate.instantSafetyStatus === "CRITICAL" ||
        candidate.mintAuthorityEnabled === true || candidate.freezeAuthorityEnabled === true ||
        [...scoped, ...summaries].some(item =>
          ["malicious", "honeypot", "blacklistRisk", "mintRisk", "freezeRisk"].some(field => item[field] === true));
    };
    safetyReady = !adverse(project);
    if (safetyReady) {
      const result = await recoverSecurity(project, ["mintAuthorityEnabled"], providers, {
        ...options, now: executionState.now || options.now, requiresAuthorityPair: true, requiresMintAccountEvidence: true,
      }, executionState);
      observations.push(...result.observations);
      attempts.push(...scopedAttempts(result.attempts, ["mintAuthorityEnabled"]));
      projectPatch = { ...projectPatch, ...result.projectPatch };
      executionProject = { ...project, ...projectPatch };
      safetyReady = !adverse(executionProject) && resolveCanonicalIdentity({
        ...executionProject, solanaMintAccountEvidence: null,
      }).mintAccountEvidence !== null;
    }
    securityFields = securityFields.filter((field) => field !== "mintAuthorityEnabled");
    if (!safetyReady) attempts.push({ provider: "solana-safety-hydration", family: "SECURITY",
      status: "SAFETY_UNRESOLVED_OR_BLOCKED", durationMs: 0, requestedFields: ["mintAuthorityEnabled"],
      reason: "Fresh exact paired mint-account safety is required before quote acquisition." });
  }
  if (safetyReady && executionFields.length && sourceRequested(sources, ["li.fi", "lifi", "jupiter", "raydium", "0x", "cex", "order book", "dex aggregators"])) {
    const result = await recoverExecutionEvidence(executionProject, executionFields, providers, options, executionState);
    observations.push(...result.observations);
    attempts.push(...scopedAttempts(result.attempts, executionFields));
    executionAdapterResults = result.executionAdapterResults || [];
    projectPatch = { ...projectPatch, ...result.projectPatch };
  }
  if (
    deployerFields.length &&
    sourceRequested(sources, ["sourcify", "blockscout", "block explorers", "explorer", "native rpc", "security providers"])
  ) {
    const result = await recoverDeployerEvidence(project, deployerFields, providers, { ...options,
      deployerMetadataSourcesAllowed: sourceRequested(sources, ["sourcify", "blockscout", "block explorers", "explorer"]),
    }, executionState);
    observations.push(...result.observations);
    attempts.push(...scopedAttempts(result.attempts, deployerFields));
    if (executionState.nativeDeploymentMemoryFailure) attempts.push({ provider: "native-contract-deployment",
      status: "MEMORY_READ_FAILED", durationMs: 0, requestCost: 0, requestedFields: [...deployerFields], reason: executionState.nativeDeploymentMemoryFailure });
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
    sourceRequested(sources, ["blockscout", "block explorers", "explorer", "chain rpc", "wallet history", "wallet-history", "supabase", "rugcheck", "goplus"])
  ) {
    // Newly acquired holder payloads may also carry safety evidence needed by the next pass.
    const remainingWalletFields = walletFields.filter((field) => !observations.some((item) => item.field === field));
    const result = await recoverWalletEvidenceWithHistory({ ...project, ...projectPatch },
      remainingWalletFields, providers,
      cheapHolderMetadataOnly ? { ...options, cheapHolderMetadataOnly: true, walletHistory: false } : options, executionState);
    observations.push(...result.observations);
    attempts.push(...scopedAttempts(result.attempts, remainingWalletFields));
    projectPatch = { ...projectPatch, ...result.projectPatch };
  }
  if (
    securityFields.length &&
    sourceRequested(sources, ["goplus", "sourcify", "blockscout", "rugcheck", "explorer", "chain rpc"])
  ) {
    parallel.push(
      recoverSecurity({ ...project, ...projectPatch }, securityFields, providers,
        { ...options, requiresAuthorityPair }, executionState).then((result) => ({
        kind: "security",
        requestedFields: securityFields,
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
        requestedFields: aggregateFields,
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
        requestedFields: aggregateFields,
        result,
      }))
    );
  }

  for (const { result, requestedFields } of await Promise.all(parallel)) {
    observations.push(...(result.observations || []));
    attempts.push(...scopedAttempts(result.attempts, requestedFields));
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
    changedEvidenceFamilies: Array.isArray(projectPatch.securityEvidence) &&
      !isDeepStrictEqual(project.securityEvidence, projectPatch.securityEvidence) ? ["SECURITY"] : [],
  };
}

export function summarizeActiveEvidenceExecutionState(state = {}) {
  return {
    maxRequests: state.maxRequests || 0,
    requestsUsed: state.requestsUsed || 0,
    timeBudgetExceeded: state.timeBudgetExceeded === true,
    timeBudgetSkippedCalls: state.timeBudgetSkippedCalls || 0,
    phaseTimeBudgetExceeded: state.phaseTimeBudgetExceeded === true,
    phaseTimeBudgetSkippedCalls: state.phaseTimeBudgetSkippedCalls || 0,
    phaseRequestBudgetExceeded: state.phaseRequestBudgetExceeded === true,
    phaseRequestBudgetSkippedCalls: state.phaseRequestBudgetSkippedCalls || 0,
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
