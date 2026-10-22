import { normalizeGeckoPool, resolveGeckoTerminalNetworkId } from "./geckoTerminalConnector.js";
import { providerReceiptTimestamp, readProviderJson } from "./providerResponseReceipt.js";
import { normalizeChainId, normalizePoolAddress, normalizeTokenAddress } from "../identity/strictIdentityValidators.js";

const BASE_URL = "https://api.geckoterminal.com/api/v2";
// Official endpoint and page bound: https://api.geckoterminal.com/docs/v2/swagger.json
// https://docs.coingecko.com/reference/top-pools-contract-address
const PAGE_SIZE = 20;
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const supplied = value => value !== undefined && value !== null && value !== "";

function exactAddress(value, chain, normalize) {
  if (typeof value !== "string") return null;
  const address = normalize(value, chain);
  if (!address || /^0x0{40}$/.test(address)) return null;
  if (chain === "solana") {
    let decoded = 0n;
    for (const char of address) decoded = decoded * 58n + BigInt(BASE58.indexOf(char));
    const bytes = decoded === 0n ? 0 : Math.ceil(decoded.toString(16).length / 2);
    if (address.match(/^1*/)[0].length + bytes !== 32) return null;
  }
  return address;
}

function consistent(values, normalize) {
  const normalized = values.filter(supplied).map(normalize);
  return normalized.length && normalized[0] && normalized.every(value => value === normalized[0])
    ? normalized[0] : null;
}

export function geckoPoolRequestIdentity(project = {}) {
  if (project.identityConflict === true || project.canonicalIdentityHardBlock === true ||
      project.chainMismatch === true || project.contractChainMismatch === true) return null;
  const records = [project, project.rawCandidate, project.marketData, project.canonicalAliases, project.canonicalExecutionRoute,
    project.executionProofRecoveryRoute, project.executionProof].filter(record => record && typeof record === "object");
  const chain = consistent(records.flatMap(record => [record.chain, record.chainId, record.network,
    record.canonicalChain, record.canonicalChainId, record.finalChain, record.finalChainId,
    record.normalizedChain, record.baseToken?.chain]), normalizeChainId);
  if (!chain || !resolveGeckoTerminalNetworkId(chain)) return null;
  const tokenAddress = consistent(records.flatMap(record => [record.tokenAddress, record.contractAddress,
    record.address, record.canonicalAddress, record.finalContractAddress, record.verifiedContractAddress,
    record.baseTokenAddress, record.baseToken?.address]), value => exactAddress(value, chain, normalizeTokenAddress));
  const poolClaims = records.flatMap(record => [record.poolAddress, record.pairAddress, record.primaryPool,
    record.primaryTradablePool, record.finalPairAddress, record.verifiedPairAddress, record.pair?.address]).filter(supplied);
  const poolAddress = consistent(poolClaims, value => exactAddress(value, chain, normalizePoolAddress));
  if (!tokenAddress || (poolClaims.length && !poolAddress)) return null;
  return { chain, tokenAddress, poolAddress };
}

function resourceAddress(id, network, chain, normalize) {
  if (typeof id !== "string" || !id.startsWith(`${network}_`)) return null;
  return exactAddress(id.slice(network.length + 1), chain, normalize);
}

function measured(value, count = false) {
  if (typeof value !== "number" && (typeof value !== "string" ||
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && (!count || Number.isSafeInteger(number)) ? number : null;
}

export function normalizeExactGeckoPool(raw, identity, { requireResourceTypes = true } = {}) {
  if (!raw || (raw.type !== "pool" && (requireResourceTypes || supplied(raw.type))) || !raw.attributes) return null;
  const { chain, tokenAddress } = identity;
  const network = resolveGeckoTerminalNetworkId(chain);
  const poolAddress = resourceAddress(raw.id, network, chain, normalizePoolAddress);
  const base = raw.relationships?.base_token?.data;
  const quote = raw.relationships?.quote_token?.data;
  const baseAddress = resourceAddress(base?.id, network, chain, normalizeTokenAddress);
  const quoteAddress = resourceAddress(quote?.id, network, chain, normalizeTokenAddress);
  const networkClaim = raw.relationships?.network?.data?.id;
  const tokenResource = value => value?.type === "token" || (!requireResourceTypes && !supplied(value?.type));
  if (!poolAddress || exactAddress(raw.attributes.address, chain, normalizePoolAddress) !== poolAddress ||
      (supplied(networkClaim) && networkClaim !== network) || !tokenResource(base) || !tokenResource(quote) ||
      baseAddress !== tokenAddress || !quoteAddress || quoteAddress === baseAddress ||
      (identity.poolAddress && identity.poolAddress !== poolAddress)) return null;
  // The existing normalizer's price/volume semantics are base-token oriented.
  return { ...normalizeGeckoPool(raw), chain, tokenAddress, poolAddress, quoteTokenAddress: quoteAddress,
    priceUsd: measured(raw.attributes.base_token_price_usd),
    liquidityUsd: measured(raw.attributes.reserve_in_usd), volume24h: measured(raw.attributes.volume_usd?.h24),
    buyTransactions24h: measured(raw.attributes.transactions?.h24?.buys, true),
    sellTransactions24h: measured(raw.attributes.transactions?.h24?.sells, true) };
}

export function selectExactGeckoTokenPool(payload, identity) {
  const noMatch = { status: "NO_EXACT_POOL_MATCH", pool: null,
    reason: "Token-pool discovery requires exact chain, base-token side, and consistent valid pool identity." };
  if (!Array.isArray(payload?.data) || !payload.data.length) return noMatch;
  // A full page or continuation cannot establish uniqueness within this one-request allowance.
  if (payload.data.length >= PAGE_SIZE || payload.links?.next || payload.meta?.next_page || payload.meta?.has_more) {
    return { status: "POOL_DISCOVERY_INCOMPLETE", pool: null,
      reason: "A full or continued token-pools page cannot establish a unique pool within the bounded lookup." };
  }
  const pools = payload.data.map(raw => normalizeExactGeckoPool(raw, identity));
  if (pools.some(pool => !pool)) return noMatch;
  if (pools.length !== 1) return { status: "AMBIGUOUS_POOL_MATCH", pool: null,
    reason: "Multiple token pools were returned; no first-result or liquidity-ranked adoption is permitted." };
  return { status: "SUCCESS", pool: pools[0], reason: null };
}

export async function getGeckoTokenPools(chain, tokenAddress, options = {}) {
  const identity = geckoPoolRequestIdentity({ chain, tokenAddress });
  if (!identity) return null;
  const network = resolveGeckoTerminalNetworkId(identity.chain);
  const url = `${BASE_URL}/networks/${encodeURIComponent(network)}/tokens/${encodeURIComponent(identity.tokenAddress)}/pools?page=1`;
  const controller = options.signal ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), Number(options.timeoutMs || 8000)) : null;
  try {
    const requestedAt = providerReceiptTimestamp(options);
    const response = await (options.fetchImpl || fetch)(url, {
      signal: options.signal || controller.signal, redirect: "error",
      headers: { accept: "application/json;version=20230203" },
    });
    return await readProviderJson(response, { provider: "geckoterminal", url, requestedAt }, options);
  } catch (error) {
    if (error?.responseReceiptCaptureFailure) throw error;
    if (error?.statusCode === 404) return null;
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
