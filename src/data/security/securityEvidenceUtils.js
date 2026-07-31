import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const CACHE_FILE = path.join(DATA_DIR, "security-evidence-cache.json");
const DEFAULT_TTL_MS = Number(process.env.SECURITY_EVIDENCE_CACHE_TTL_MS || 6 * 60 * 60 * 1000);

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

export function boolFlag(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const normalized = lower(value);
  if (["1", "true", "yes", "verified", "exact_match", "match"].includes(normalized)) return true;
  if (["0", "false", "no", "none", "null", "undefined"].includes(normalized)) return false;
  return null;
}

export function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readCache() {
  ensureDataDir();
  if (!fs.existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeCache(cache = {}) {
  ensureDataDir();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

export function cacheKey(provider = "", chain = "", address = "") {
  return `${provider}:${chainKey(chain)}:${lower(address)}`;
}

export function getCachedSecurityEvidence(provider = "", chain = "", address = "", ttlMs = DEFAULT_TTL_MS) {
  const cache = readCache();
  const key = cacheKey(provider, chain, address);
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - Number(entry.cachedAtMs || 0) > ttlMs) return null;
  return entry.value || null;
}

export function setCachedSecurityEvidence(provider = "", chain = "", address = "", value = {}) {
  const cache = readCache();
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

export function unknownSecurityEvidence(provider = "unknown", reason = "Security evidence unavailable.") {
  return {
    provider,
    status: "UNKNOWN",
    observedAt: new Date().toISOString(),
    riskFindings: [],
    warnings: [reason],
    confidence: 0,
    raw: null,
  };
}

export function summarizeSecurityEvidence(evidence = []) {
  const items = (Array.isArray(evidence) ? evidence : []).filter(Boolean);
  const known = items.filter((item) => item.status !== "UNKNOWN");
  const riskFindings = [...new Set(items.flatMap((item) => item.riskFindings || []))];
  const warnings = [...new Set(items.flatMap((item) => item.warnings || []))];
  const verifiedSource = items.some((item) => item.verifiedSource === true);
  const malicious = items.some((item) => item.malicious === true);
  const honeypot = items.some((item) => item.honeypot === true);
  const proxy = items.some((item) => item.proxy === true);
  const ownerRisk = items.some((item) => item.ownerRisk === true);
  const mintRisk = items.some((item) => item.mintRisk === true);
  const freezeRisk = items.some((item) => item.freezeRisk === true);
  const blacklistRisk = items.some((item) => item.blacklistRisk === true);
  const highTaxRisk = items.some((item) => item.highTaxRisk === true);
  const confidence = known.length
    ? Math.round(known.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / known.length)
    : 0;

  return {
    status: known.length ? (riskFindings.length ? "RISK_REVIEW" : "EVIDENCE_AVAILABLE") : "UNKNOWN",
    providers: items.map((item) => item.provider),
    knownProviders: known.map((item) => item.provider),
    unknownProviders: items.filter((item) => item.status === "UNKNOWN").map((item) => item.provider),
    verifiedSource,
    malicious,
    honeypot,
    proxy,
    ownerRisk,
    mintRisk,
    freezeRisk,
    blacklistRisk,
    highTaxRisk,
    riskFindings,
    warnings,
    confidence,
    testedChecks: [...new Set(known.flatMap((item) => item.testedChecks || []))],
    sourceTimestamps: Object.fromEntries(
      items
        .filter((item) => item.provider && item.observedAt)
        .map((item) => [item.provider, item.observedAt])
    ),
  };
}
