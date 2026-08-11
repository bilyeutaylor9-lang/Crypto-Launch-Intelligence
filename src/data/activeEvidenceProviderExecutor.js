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
  return {
    getTokenPairs: injected.getTokenPairs || options.getTokenPairs || getTokenPairs,
    getPairByAddress: injected.getPairByAddress || options.getPairByAddress || getPairByAddress,
    searchDexPairs: injected.searchDexPairs || options.searchDexPairs || searchDexPairs,
    getFreeSecurityEvidence:
      injected.getFreeSecurityEvidence ||
      options.getFreeSecurityEvidence ||
      getFreeSecurityEvidence,
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
    circuitFailureThreshold,
    providers: new Map(),
  };
}

function providerState(state = {}, provider = "unknown") {
  const current = state.providers.get(provider) || {
    provider,
    attempts: 0,
    successes: 0,
    failures: 0,
    skipped: 0,
    circuitOpen: false,
    lastError: null,
  };
  state.providers.set(provider, current);
  return current;
}

async function executeProviderCall(provider, operation, options = {}, state = {}, cost = 1) {
  const health = providerState(state, provider);
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

  const attempt = await executeProviderCall("dexscreener", call, options, state, 1);
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
    Math.max(1, Number(options.securityProviderRequestCost || 4))
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
  const securityFields = fields.filter(
    (field) => SECURITY_FIELDS.has(field) && !recoveredFields.has(field)
  );
  const aggregateFields = fields.filter(
    (field) => AGGREGATE_MARKET_FIELDS.has(field) && !recoveredFields.has(field)
  );
  const parallel = [];
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
