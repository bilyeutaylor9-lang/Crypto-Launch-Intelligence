import fs from "fs";
import path from "path";
import { normalizeChainId, normalizeTokenAddress } from "../../identity/strictIdentityValidators.js";

const DATA_DIR = path.resolve("data");
const CACHE_FILE = path.join(DATA_DIR, "security-evidence-cache.json");
const DEFAULT_TTL_MS = Number(process.env.SECURITY_EVIDENCE_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
let cacheSnapshot = null;

export const EVM_CHAIN_IDS = {
  ethereum: "1",
  eth: "1",
  mainnet: "1",
  optimism: "10",
  op: "10",
  bsc: "56",
  bnb: "56",
  polygon: "137",
  matic: "137",
  arbitrum: "42161",
  avalanche: "43114",
  avax: "43114",
  base: "8453",
};

export const BLOCKSCOUT_DEFAULTS = {
  ethereum: "https://eth.blockscout.com",
  optimism: "https://optimism.blockscout.com",
  bsc: "https://bsc.blockscout.com",
  polygon: "https://polygon.blockscout.com",
  arbitrum: "https://arbitrum.blockscout.com",
  avalanche: "https://avalanche.blockscout.com",
  base: "https://base.blockscout.com",
  "robinhood-chain": "https://robinhoodchain.blockscout.com",
  zksync: "https://zksync.blockscout.com",
};

export function clean(value = "") {
  return String(value ?? "").trim();
}

export function lower(value = "") {
  return clean(value).toLowerCase();
}

export function chainKey(value = "") {
  const raw = lower(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (raw === "1") return "ethereum";
  if (raw === "10") return "optimism";
  if (raw === "56") return "bsc";
  if (raw === "137") return "polygon";
  if (raw === "42161") return "arbitrum";
  if (raw === "43114") return "avalanche";
  if (raw === "8453") return "base";
  return raw;
}

export function evmChainId(value = "") {
  return EVM_CHAIN_IDS[chainKey(value)] || null;
}

export function tokenAddress(project = {}) {
  return clean(
    project.finalContractAddress ||
      project.canonicalAddress ||
      project.contractAddress ||
      project.tokenAddress ||
      project.address ||
      project.baseToken?.address
  );
}

export function isEvmAddress(address = "") {
  return /^0x[a-fA-F0-9]{40}$/.test(clean(address));
}

export function sourcifyResponseIdentityMatches(raw, chain, address) {
  if (raw === null || raw === undefined) return true;
  if (typeof raw !== "object" || Array.isArray(raw)) return false;
  const supplied = value => value !== null && value !== undefined;
  const chains = [raw.chain, raw.chainId, raw.chain_id, raw.network].filter(supplied);
  const addresses = [raw.address, raw.contractAddress, raw.contract_address, raw.tokenAddress].filter(supplied);
  if (!chains.length && !addresses.length) return true;
  const expectedChain = normalizeChainId(chain);
  const expectedAddress = normalizeTokenAddress(address, expectedChain);
  return Boolean(expectedChain && expectedAddress) &&
    chains.every(value => normalizeChainId(value) === expectedChain) &&
    addresses.every(value => normalizeTokenAddress(value, expectedChain) === expectedAddress);
}

function hasSourcifyIdentityConflict(item = {}) {
  return lower(item.provider || item.source).includes("sourcify") &&
    !sourcifyResponseIdentityMatches(item.raw, item.chain, item.address || item.tokenAddress);
}

export function metadataOnlySecurityProvider(provider = "") {
  const value = lower(provider);
  return ["sourcify", "blockscout", "etherscan", "rugcheck", "solana-rpc"].some(source => value.includes(source));
}

export function securityObservationIsCurrent(timestamp, ttlMs = DEFAULT_TTL_MS, now = Date.now()) {
  const observed = typeof timestamp === "string" ? Date.parse(timestamp) : NaN;
  return Number.isFinite(observed) && observed <= now && typeof ttlMs === "number" &&
    Number.isFinite(ttlMs) && ttlMs > 0 && now - observed <= ttlMs;
}

export function hasVerifiedHoneypotNegative(item = {}) {
  const chain = normalizeChainId(item.chain);
  const address = normalizeTokenAddress(item.address || item.tokenAddress, chain);
  return lower(item.provider || item.source).includes("goplus") && item.status === "EVIDENCE_AVAILABLE" &&
    item.responseIdentityVerified === true && item.honeypot !== true &&
    goPlusBoolFlag(item.raw?.is_honeypot) === false && Boolean(chain && address) &&
    securityObservationIsCurrent(item.observedAt) && Number(item.confidence) > 0;
}

export function boolFlag(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value !== "string") return null;
  const normalized = lower(value);
  if (["1", "true", "yes", "verified", "exact_match", "match"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  return null;
}

export function goPlusBoolFlag(value) {
  if ([true, 1, "1"].includes(value)) return true;
  if ([false, 0, "0"].includes(value)) return false;
  return null;
}

export function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function goPlusTaxPct(value) {
  if (typeof value !== "number" &&
      (typeof value !== "string" || !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.trim()))) return null;
  const fraction = Number(value);
  return Number.isFinite(fraction) && fraction >= 0 && fraction <= 1 ? fraction * 100 : null;
}

export function nonnegativeSafeInteger(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value.trim()))) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

export function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readCache() {
  ensureDataDir();
  try {
    const stat = fs.statSync(CACHE_FILE, { bigint: true });
    const signature = [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":");
    if (cacheSnapshot?.signature === signature) return cacheSnapshot.cache;
    const cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    const normalized = cache && typeof cache === "object" && !Array.isArray(cache) ? cache : {};
    cacheSnapshot = { signature, cache: normalized };
    return normalized;
  } catch {
    cacheSnapshot = null;
    return {};
  }
}

function writeCache(cache = {}) {
  ensureDataDir();
  cacheSnapshot = null;
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

export function cacheKey(provider = "", chain = "", address = "") {
  const normalizedChain = chainKey(chain);
  return `${provider}:${normalizedChain}:${normalizedChain === "solana" ? String(address).trim() : lower(address)}`;
}

export function getCachedSecurityEvidence(provider = "", chain = "", address = "", ttlMs = DEFAULT_TTL_MS) {
  const cache = readCache();
  const key = cacheKey(provider, chain, address);
  const entry = cache[key];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const cachedAtMs = entry.cachedAtMs;
  const now = Date.now();
  if (typeof cachedAtMs !== "number" || !Number.isFinite(cachedAtMs) ||
      cachedAtMs <= 0 || cachedAtMs > now || typeof ttlMs !== "number" ||
      !Number.isFinite(ttlMs) || ttlMs <= 0 || now - cachedAtMs > ttlMs) return null;
  const value = entry.value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (lower(provider).includes("sourcify") &&
      (!sourcifyResponseIdentityMatches(value, chain, address) ||
        !sourcifyResponseIdentityMatches(value.raw, chain, address))) return null;
  const observedAtMs = typeof value.observedAt === "string" ? Date.parse(value.observedAt) : NaN;
  if (!Number.isFinite(observedAtMs) || observedAtMs > now || now - observedAtMs > ttlMs) return null;
  const observed = structuredClone(value);
  if (observed.honeypot !== true) {
    if (metadataOnlySecurityProvider(provider) && observed.honeypot === false) observed.honeypot = null;
    if (lower(provider).includes("goplus") && Object.hasOwn(observed, "honeypot")) {
      observed.honeypot = goPlusBoolFlag(observed.raw?.is_honeypot);
    }
  }
  return observed;
}

export function setCachedSecurityEvidence(provider = "", chain = "", address = "", value = {}) {
  const cache = { ...readCache() };
  cache[cacheKey(provider, chain, address)] = {
    cachedAt: new Date().toISOString(),
    cachedAtMs: Date.now(),
    value,
  };
  writeCache(cache);
  return value;
}

export async function fetchJson(url = "", options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || process.env.SECURITY_EVIDENCE_TIMEOUT_MS || 10_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      method: options.method || "GET",
      headers: {
        accept: "application/json",
        ...(options.headers || {}),
      },
      body: options.body,
    });
    if (!response.ok) {
      const error = new Error(`Request failed: ${response.status} ${url}`);
      error.status = response.status;
      error.url = url;
      throw error;
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function unknownSecurityEvidence(provider = "unknown", reason = "Security evidence unavailable.", error = null) {
  return {
    provider,
    status: "UNKNOWN",
    observedAt: new Date().toISOString(),
    riskFindings: [],
    warnings: [reason],
    confidence: 0,
    raw: null,
    ...(error && error.status !== 404 ? { providerFailure: true, httpStatus: error.status || null } : {}),
  };
}

export function summarizeSecurityEvidence(evidence = []) {
  const items = (Array.isArray(evidence) ? evidence : []).filter(Boolean);
  const scopedItems = items.filter(item => !hasSourcifyIdentityConflict(item));
  const known = scopedItems.filter((item) => item.status !== "UNKNOWN" &&
    (item.provider !== "goplus" || item.responseIdentityVerified === true));
  const riskFindings = [...new Set(scopedItems.flatMap((item) => item.riskFindings || []))];
  const warnings = [...new Set([...items.flatMap((item) => item.warnings || []),
    ...(scopedItems.length < items.length ? ["Sourcify response identity conflicts with its bound contract; evidence remains unknown."] : [])])];
  const verifiedSource = known.some((item) => item.verifiedSource === true);
  const goPlusItems = known.filter((item) => item.provider === "goplus");
  const requiredChecks = ["is_open_source", "is_honeypot", "is_mintable", "is_proxy", "is_blacklisted", "cannot_sell_all", "slippage_modifiable", "transfer_pausable", "trading_cooldown", "personal_slippage_modifiable", "hidden_owner", "can_take_back_ownership", "owner_change_balance"];
  const unknownChecks = goPlusItems.length ? requiredChecks
    .filter((field) => !goPlusItems.some((item) => goPlusBoolFlag(item.raw?.[field]) !== null))
    .map((field) => `goplus.${field}`) : [];
  if (goPlusItems.length) {
    for (const field of ["buy_tax", "sell_tax"]) {
      if (!goPlusItems.some((item) => goPlusTaxPct(item.raw?.[field]) !== null)) unknownChecks.push(`goplus.${field}`);
    }
  }
  const malicious = scopedItems.some((item) => item.malicious === true);
  const honeypotNegativeEvidence = known.filter(hasVerifiedHoneypotNegative).map(item => ({
    source: item.provider || item.source, chain: normalizeChainId(item.chain),
    tokenAddress: normalizeTokenAddress(item.address || item.tokenAddress, normalizeChainId(item.chain)),
    sourceTimestamp: item.observedAt, confidence: item.confidence,
  }));
  const honeypot = scopedItems.some((item) => item.honeypot === true) ? true
    : honeypotNegativeEvidence.length ? false : null;
  const proxy = scopedItems.some((item) => item.proxy === true);
  const ownerRisk = scopedItems.some((item) => item.ownerRisk === true);
  const mintRisk = scopedItems.some((item) => item.mintRisk === true);
  const freezeRisk = scopedItems.some((item) => item.freezeRisk === true);
  const blacklistRisk = scopedItems.some((item) => item.blacklistRisk === true);
  const highTaxRisk = scopedItems.some((item) => item.highTaxRisk === true);
  const confidence = known.length
    ? Math.round(known.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / known.length)
    : 0;

  return {
    status: known.length ? (riskFindings.length ? "RISK_REVIEW" : "EVIDENCE_AVAILABLE") : "UNKNOWN",
    providers: items.map((item) => item.provider),
    knownProviders: known.map((item) => item.provider),
    unknownProviders: items.filter((item) => !known.includes(item)).map((item) => item.provider),
    unknownChecks,
    verifiedSource,
    malicious,
    honeypot,
    honeypotNegativeVerified: honeypot === false,
    honeypotNegativeEvidence,
    proxy,
    ownerRisk,
    mintRisk,
    freezeRisk,
    blacklistRisk,
    highTaxRisk,
    riskFindings,
    warnings,
    confidence,
    testedChecks: [...new Set([
      ...known.flatMap((item) => item.testedChecks || []),
      ...requiredChecks.filter((field) => goPlusItems.some((item) => boolFlag(item.raw?.[field]) !== null)).map((field) => `goplus.${field}`),
      ...["buy_tax", "sell_tax"].filter((field) => goPlusItems.some((item) => numeric(item.raw?.[field]) !== null)).map((field) => `goplus.${field}`),
    ])],
    sourceTimestamps: Object.fromEntries(
      items
        .filter((item) => item.provider && item.observedAt)
        .map((item) => [item.provider, item.observedAt])
    ),
  };
}
