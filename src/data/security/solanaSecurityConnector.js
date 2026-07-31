import {
  chainKey,
  clean,
  fetchJson as defaultFetchJson,
  tokenAddress,
} from "./securityEvidenceUtils.js";

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
  if (!value || !info) throw new Error("Solana RPC did not return parsed mint-account data.");
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
  const mint = tokenAddress(project);
  const fetchJson = options.fetchJson || defaultFetchJson;
  const baseUrl = options.rugCheckBaseUrl || process.env.RUGCHECK_API_BASE_URL || "https://api.rugcheck.xyz/v1";
  const report = await fetchJson(`${baseUrl}/tokens/${encodeURIComponent(mint)}/report/summary`, {
    timeoutMs: options.timeoutMs,
    headers: { accept: "application/json" },
  });
  const risks = array(report?.risks);
  const text = risks.map(riskText).join(" ").toLowerCase();
  return {
    score: Number.isFinite(Number(report?.score)) ? Number(report.score) : null,
    rugged: report?.rugged === true,
    risks,
    mintRisk: /mint authority|mintable|unlimited mint/.test(text),
    freezeRisk: /freeze authority|freezable/.test(text),
    blacklistRisk: /blacklist|denylist|transfer restriction/.test(text),
  };
}

export async function getSolanaSecurityEvidence(project = {}, options = {}) {
  const chain = chainKey(project.chain || project.canonicalChain || project.network);
  const mint = tokenAddress(project);
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
        ? { score: rugCheck.score, rugged: rugCheck.rugged, riskCount: rugCheck.risks.length }
        : null,
    },
  };
}
