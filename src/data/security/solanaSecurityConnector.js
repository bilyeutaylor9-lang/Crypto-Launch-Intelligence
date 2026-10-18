import {
  chainKey,
  clean,
  fetchJson as defaultFetchJson,
  getCachedSecurityEvidence,
  setCachedSecurityEvidence,
  tokenAddress,
} from "./securityEvidenceUtils.js";
import { normalizeChainId, normalizeTokenAddress, normalizeWalletAddress } from "../../identity/strictIdentityValidators.js";
import { resolveNativeRpcUrl } from "../native/nativePoolConfig.js";
import { walletRpcEndpointId } from "../rpcWalletEvidenceConnector.js";

const FULL_PROVIDER = "rugcheck-solana-full";
const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);

function exactSolanaMint(project) {
  const chain = normalizeChainId(project.chain || project.canonicalChain || project.network || project.chainId);
  if (chain !== "solana") return null;
  const mint = normalizeTokenAddress(tokenAddress(project), chain);
  const supplied = (value) => value !== undefined && value !== null && value !== "";
  const chains = [project.chain, project.canonicalChain, project.network, project.chainId].filter(supplied).map(normalizeChainId);
  const addresses = [project.tokenAddress, project.contractAddress, project.address]
    .filter(supplied).map((value) => normalizeTokenAddress(value, chain));
  return mint && chains.every((value) => value === chain) && addresses.every((value) => value === mint) ? mint : null;
}

export function normalizeRugCheckFullReport(report = {}, project = {}, options = {}) {
  const mint = exactSolanaMint(project);
  const observedAt = options.observedAt || new Date().toISOString();
  const unknown = { provider: FULL_PROVIDER, status: "UNKNOWN", chain: "solana", address: mint,
    observedAt, responseIdentityVerified: false, warnings: ["Exact Solana mint and token program must match the full report."], raw: null };
  if (!mint || report?.mint !== mint || !TOKEN_PROGRAMS.has(report.tokenProgram)) return unknown;
  const holders = (Array.isArray(report.topHolders) ? report.topHolders : []).slice(0, 100).flatMap((item) => {
    const owner = normalizeWalletAddress(item?.owner, "solana");
    const account = normalizeTokenAddress(item?.address, "solana");
    const amount = item?.amount;
    const positive = typeof amount === "string" && /^\d+$/.test(amount) ? BigInt(amount) > 0n
      : typeof amount === "number" && Number.isFinite(amount) && amount > 0;
    if (!owner || !account || !positive || owner === account || owner === mint || TOKEN_PROGRAMS.has(owner) || owner === "11111111111111111111111111111111") return [];
    return [{ accountAddress: account, ownerAddress: owner, positiveBalanceReported: true,
      tokenAmountRaw: typeof amount === "string" ? amount : Number.isSafeInteger(amount) ? String(amount) : null,
      balancePrecisionVerified: typeof amount === "string" || Number.isSafeInteger(amount) }];
  });
  const authorityKnown = (key) => Object.hasOwn(report, key) &&
    (report[key] === null || Boolean(normalizeWalletAddress(report[key], "solana")));
  return { provider: FULL_PROVIDER, schemaVersion: 1, status: "EVIDENCE_AVAILABLE",
    chain: "solana", address: mint, tokenAddress: mint, observedAt, sourceTimestamp: observedAt,
    responseIdentityVerified: true, confidence: 0.78, verificationStatus: "VERIFIED_PROVIDER_OBSERVATION",
    identityVerifiedOnChain: false, holderSampleOnly: true, completeHolderCoverage: false,
    snapshotTimestampVerified: false, sourceTimestampMeaning: "PROVIDER_RECEIPT_TIME_NOT_CHAIN_SNAPSHOT_TIME",
    providerReportDetectedAt: typeof report.detectedAt === "string" ? report.detectedAt : null,
    wallets: [...new Set(holders.map((item) => item.ownerAddress))],
    holderAddresses: [...new Set(holders.map((item) => item.ownerAddress))], solanaHolderAccounts: holders,
    holderCount: Number.isSafeInteger(report.totalHolders) && report.totalHolders >= 0 ? report.totalHolders : null,
    securityReportComplete: Array.isArray(report.risks) && typeof report.rugged === "boolean" && authorityKnown("mintAuthority") && authorityKnown("freezeAuthority"),
    raw: { mint, tokenProgram: report.tokenProgram, topHolders: holders, risks: array(report.risks),
      rugged: typeof report.rugged === "boolean" ? report.rugged : null,
      score: typeof report.score === "number" && Number.isFinite(report.score) ? report.score : null,
      mintAuthority: report.mintAuthority, freezeAuthority: report.freezeAuthority },
    warnings: ["Holder-owner sample only; no daily buyers, smart labels, complete holder census or fresh chain snapshot is proven."] };
}

export async function getRugCheckFullTokenEvidence(project = {}, options = {}) {
  const mint = exactSolanaMint(project);
  const unknown = (reason, providerFailure = false) => ({ provider: FULL_PROVIDER, status: "UNKNOWN", chain: "solana",
    address: mint, observedAt: new Date().toISOString(), responseIdentityVerified: false, providerFailure, warnings: [reason], raw: null });
  if (!mint) return unknown("Exact, nonconflicting Solana mint identity is required.");
  if (options.useCache !== false) {
    const cached = getCachedSecurityEvidence(FULL_PROVIDER, "solana", mint, options.cacheTtlMs);
    if (cached?.schemaVersion === 1 && cached.responseIdentityVerified === true && cached.chain === "solana" && cached.address === mint && cached.raw?.mint === mint) return cached;
  }
  try {
    const fetchJson = options.fetchJson || defaultFetchJson;
    const baseUrl = options.rugCheckBaseUrl || process.env.RUGCHECK_API_BASE_URL || "https://api.rugcheck.xyz/v1";
    const report = await fetchJson(`${baseUrl}/tokens/${encodeURIComponent(mint)}/report`, {
      timeoutMs: options.timeoutMs, headers: { accept: "application/json" },
    });
    const evidence = normalizeRugCheckFullReport(report, project);
    return options.useCache === false || evidence.status === "UNKNOWN" ? evidence
      : setCachedSecurityEvidence(FULL_PROVIDER, "solana", mint, evidence);
  } catch (error) { return unknown(error.message || "Full RugCheck report failed.", true); }
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function riskText(risk = {}) {
  return clean(risk.name || risk.description || risk.type || risk.level || risk);
}

async function rpcMintEvidence(project = {}, options = {}) {
  const mint = tokenAddress(project);
  const fetchJson = options.fetchJson || defaultFetchJson;
  const explicit = [options.solanaRpcUrl, options.rpcUrl, ...(Array.isArray(options.solanaRpcUrls) ? options.solanaRpcUrls : [])]
    .filter((url) => typeof url === "string" && url.trim()).map((url) => url.trim());
  const urls = [...new Set(explicit.length ? explicit : resolveNativeRpcUrl({ chain: "solana" }, options).rpcUrls)].slice(0, 2);
  const now = new Date(typeof options.now === "function" ? options.now() : options.now ?? Date.now()).getTime();
  const maxAge = Number(options.securityAuthorityMaxAgeSeconds ?? 300);
  if (!Number.isFinite(now) || !Number.isSafeInteger(maxAge) || maxAge < 1 || maxAge > 300) throw new Error("Invalid authority observation clock or freshness limit.");
  const attempts = [];
  for (const rpcUrl of urls) {
    const endpointId = walletRpcEndpointId(rpcUrl);
    try {
      const rpc = async (method, params = []) => {
        const response = await fetchJson(rpcUrl, { method: "POST", timeoutMs: options.timeoutMs,
          signal: options.signal, headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
        if (!response || response.error || !Object.hasOwn(response, "result")) throw new Error("Solana RPC response is unavailable.");
        return response.result;
      };
      const genesisHash = await rpc("getGenesisHash");
      if (genesisHash !== MAINNET_GENESIS) throw new Error("Solana mainnet genesis mismatch.");
      const account = await rpc("getAccountInfo", [mint, { commitment: "confirmed", encoding: "jsonParsed" }]);
      const observedSlot = account?.context?.slot;
      const value = account?.value;
      const info = value?.data?.parsed?.info;
      if (!Number.isSafeInteger(observedSlot) || observedSlot <= 0 || !value || value.executable === true ||
          !info || value.data.parsed.type !== "mint" || !TOKEN_PROGRAMS.has(value.owner) || info.isInitialized !== true ||
          !Object.hasOwn(info, "mintAuthority") || !Object.hasOwn(info, "freezeAuthority") ||
          ![info.mintAuthority, info.freezeAuthority].every((authority) => authority === null || Boolean(normalizeWalletAddress(authority, "solana")))) {
        throw new Error("Solana RPC did not return an initialized, paired SPL mint-authority account.");
      }
      const blockTimestamp = await rpc("getBlockTime", [observedSlot]);
      const responseTime = new Date(typeof options.now === "function" ? options.now() : options.now ?? Date.now()).getTime();
      if (!Number.isFinite(responseTime) || !Number.isSafeInteger(blockTimestamp) || blockTimestamp <= 0 || blockTimestamp * 1000 > responseTime ||
          responseTime - blockTimestamp * 1000 > maxAge * 1000) throw new Error("Authority account context time is missing, future or stale.");
      attempts.push({ endpointId, status: "EVIDENCE_AVAILABLE" });
      return { ownerProgram: value.owner, mintAuthority: info.mintAuthority, freezeAuthority: info.freezeAuthority,
        decimals: info.decimals ?? null, supply: info.supply ?? null,
        mintRisk: Boolean(info.mintAuthority), freezeRisk: Boolean(info.freezeAuthority),
        genesisHash, observedSlot, blockTimestamp, sourceTimestamp: new Date(blockTimestamp * 1000).toISOString(),
        rpcEndpointId: endpointId, rpcEndpointAttempts: attempts };
    } catch (error) {
      attempts.push({ endpointId, status: "UNKNOWN", code: error?.code || "UNAVAILABLE_OR_INVALID" });
      if (["REQUEST_BUDGET_EXHAUSTED", "TIME_BUDGET_EXHAUSTED"].includes(error?.code)) break;
    }
  }
  throw new Error("No configured Solana endpoint proved a fresh mainnet mint-authority snapshot.");
}

async function rugCheckEvidence(project = {}, options = {}) {
  const evidence = await getRugCheckFullTokenEvidence(project, options);
  if (evidence.status === "UNKNOWN" || evidence.securityReportComplete !== true) throw new Error("Full RugCheck security fields or exact mint identity are missing.");
  const report = evidence.raw;
  const risks = array(report?.risks);
  const text = risks.map(riskText).join(" ").toLowerCase();
  return {
    score: typeof report?.score === "number" && Number.isFinite(report.score) ? report.score : null,
    rugged: report?.rugged === true,
    risks,
    mintRisk: Boolean(report.mintAuthority) || /mint authority|mintable|unlimited mint/.test(text),
    freezeRisk: Boolean(report.freezeAuthority) || /freeze authority|freezable/.test(text),
    blacklistRisk: /blacklist|denylist|transfer restriction/.test(text),
    holderEvidence: evidence,
  };
}

export async function getSolanaSecurityEvidence(project = {}, options = {}) {
  const chain = chainKey(project.chain || project.canonicalChain || project.network);
  const mint = exactSolanaMint(project);
  const observedAt = new Date().toISOString();
  if (chain !== "solana") {
    return {
      provider: "solana-rpc-rugcheck",
      status: "UNKNOWN",
      observedAt,
      riskFindings: [],
      warnings: ["Solana safety evidence is not applicable to this chain."],
      confidence: 0,
      raw: null,
    };
  }
  if (!mint) {
    return {
      provider: "solana-rpc-rugcheck",
      status: "UNKNOWN",
      observedAt,
      riskFindings: [],
      warnings: ["Solana mint address is missing."],
      confidence: 0,
      raw: null,
    };
  }

  const [rpcResult, rugCheckResult] = await Promise.allSettled([
    rpcMintEvidence(project, options),
    rugCheckEvidence(project, options),
  ]);
  const rpc = rpcResult.status === "fulfilled" ? rpcResult.value : null;
  const rugCheck = rugCheckResult.status === "fulfilled" ? rugCheckResult.value : null;
  if (!rpc && !rugCheck) {
    return {
      provider: "solana-rpc-rugcheck",
      status: "UNKNOWN",
      observedAt,
      riskFindings: [],
      warnings: [
        `Solana RPC failed: ${rpcResult.reason?.message || "unknown error"}`,
        `RugCheck failed: ${rugCheckResult.reason?.message || "unknown error"}`,
      ],
      confidence: 0,
      raw: null,
    };
  }

  const mintRisk = Boolean(rpc?.mintRisk || rugCheck?.mintRisk);
  const freezeRisk = Boolean(rpc?.freezeRisk || rugCheck?.freezeRisk);
  const blacklistRisk = Boolean(rugCheck?.blacklistRisk);
  const malicious = Boolean(rugCheck?.rugged);
  const riskFindings = [
    ...(mintRisk ? ["Solana mint authority remains active."] : []),
    ...(freezeRisk ? ["Solana freeze authority remains active."] : []),
    ...(blacklistRisk ? ["RugCheck reported blacklist or transfer-control risk."] : []),
    ...(malicious ? ["RugCheck marked the token as rugged."] : []),
    ...array(rugCheck?.risks).map(riskText).filter(Boolean),
  ];
  const warnings = [
    ...(rpc ? [] : [`Solana RPC unavailable: ${rpcResult.reason?.message || "unknown error"}`]),
    ...(rugCheck ? [] : [`RugCheck unavailable: ${rugCheckResult.reason?.message || "unknown error"}`]),
  ];

  return {
    provider: "solana-rpc-rugcheck",
    status: riskFindings.length ? "RISK_REVIEW" : "EVIDENCE_AVAILABLE",
    chain: "solana",
    address: mint,
    responseIdentityVerified: Boolean(rpc || rugCheck?.holderEvidence.responseIdentityVerified),
    observedAt,
    verifiedSource: Boolean(rpc),
    identityVerifiedOnChain: Boolean(rpc),
    snapshotTimestampVerified: Boolean(rpc),
    sourceTimestamp: rpc?.sourceTimestamp || null,
    sourceTimestampMeaning: rpc ? "CONFIRMED_MAINNET_MINT_ACCOUNT_CONTEXT_TIME" : "UNKNOWN_CHAIN_SNAPSHOT_TIME",
    malicious,
    honeypot: malicious,
    mintRisk,
    freezeRisk,
    blacklistRisk,
    ownerRisk: false,
    highTaxRisk: false,
    riskFindings: [...new Set(riskFindings)],
    warnings,
    confidence: rpc && rugCheck ? 90 : rpc ? 82 : 68,
    testedChecks: [
      ...(rpc ? ["mint-account identity", "mint authority", "freeze authority"] : []),
      ...(rugCheck ? ["RugCheck risk report"] : []),
    ],
    raw: {
      rpc,
      rugCheck: rugCheck
        ? { score: rugCheck.score, rugged: rugCheck.rugged, riskCount: rugCheck.risks.length, holderEvidence: rugCheck.holderEvidence }
        : null,
    },
  };
}
