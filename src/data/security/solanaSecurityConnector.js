import {
  chainKey,
  clean,
  fetchJson as defaultFetchJson,
  getCachedSecurityEvidence,
  setCachedSecurityEvidence,
  tokenAddress,
} from "./securityEvidenceUtils.js";
import { normalizeChainId, normalizeTokenAddress, normalizeWalletAddress } from "../../identity/strictIdentityValidators.js";

const FULL_PROVIDER = "rugcheck-solana-full";
const TOKEN_PROGRAMS = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
]);

function exactSolanaMint(project) {
  const chain = normalizeChainId(project.chain || project.canonicalChain || project.network);
  if (chain !== "solana") return null;
  const mint = normalizeTokenAddress(tokenAddress(project), chain);
  const chains = [project.chain, project.canonicalChain, project.network].map(normalizeChainId).filter(Boolean);
  const addresses = [project.tokenAddress, project.contractAddress, project.address]
    .map((value) => normalizeTokenAddress(value, chain)).filter(Boolean);
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
  const rpcUrl = options.solanaRpcUrl || process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const fetchJson = options.fetchJson || defaultFetchJson;
  const response = await fetchJson(rpcUrl, {
    method: "POST",
    timeoutMs: options.timeoutMs,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [mint, { commitment: "confirmed", encoding: "jsonParsed" }],
    }),
  });
  const value = response?.result?.value;
  const info = value?.data?.parsed?.info;
  if (!value || !info || value.data.parsed.type !== "mint" || !TOKEN_PROGRAMS.has(value.owner) ||
    !Object.hasOwn(info, "mintAuthority") || !Object.hasOwn(info, "freezeAuthority") ||
    ![info.mintAuthority, info.freezeAuthority].every((authority) => authority === null || Boolean(normalizeWalletAddress(authority, "solana")))) {
    throw new Error("Solana RPC did not return a verified parsed SPL mint-account shape.");
  }
  const mintAuthority = info.mintAuthority ?? null;
  const freezeAuthority = info.freezeAuthority ?? null;
  return {
    ownerProgram: value.owner || null,
    mintAuthority,
    freezeAuthority,
    decimals: info.decimals ?? null,
    supply: info.supply ?? null,
    mintRisk: Boolean(mintAuthority),
    freezeRisk: Boolean(freezeAuthority),
  };
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
