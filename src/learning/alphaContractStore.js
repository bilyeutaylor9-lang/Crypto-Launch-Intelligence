import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve("data");
const CONTRACT_FILE = path.join(DATA_DIR, "alpha-contracts.json");
const MAX_CONTRACTS = Number(process.env.MAX_ALPHA_CONTRACTS || 5000);

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readContracts() {
  ensureDataDir();

  if (!fs.existsSync(CONTRACT_FILE)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(CONTRACT_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeContracts(contracts = []) {
  ensureDataDir();
  fs.writeFileSync(CONTRACT_FILE, JSON.stringify(contracts.slice(-MAX_CONTRACTS), null, 2));
}

export function alphaContractProjectKey(project = {}) {
  return String(
    project.address ||
      project.tokenAddress ||
      project.pairAddress ||
      project.selfEvolvingAlphaOS?.identityGraph?.id ||
      project.githubIntelligencePro?.repository ||
      `${project.chain || "unknown"}:${project.symbol || project.name || "unknown"}`
  ).toLowerCase();
}

export function loadAlphaContracts() {
  return readContracts();
}

export function getProjectAlphaContracts(project = {}, limit = 25) {
  const key = alphaContractProjectKey(project);

  return readContracts()
    .filter((contract) => contract.projectKey === key)
    .slice(-Number(limit || 25));
}

export function saveAlphaContracts(projects = []) {
  const existing = readContracts();
  const byId = new Map(existing.map((contract) => [contract.contractId, contract]));
  const generatedAt = new Date().toISOString();

  for (const project of Array.isArray(projects) ? projects : []) {
    const contract = project.proofCarryingAlphaContract;
    if (!contract?.contractId) continue;

    if (contract.latestGrade?.contractId && byId.has(contract.latestGrade.contractId)) {
      const priorContract = byId.get(contract.latestGrade.contractId);
      byId.set(contract.latestGrade.contractId, {
        ...priorContract,
        status: contract.latestGrade.resolved ? "resolved" : priorContract.status || "open",
        finalGrade: contract.latestGrade.resolved
          ? contract.latestGrade.grade
          : priorContract.finalGrade || null,
        latestGrade: contract.latestGrade,
        lastJudgedAt: generatedAt,
      });
    }

    byId.set(contract.contractId, {
      ...contract,
      lastSeenAt: generatedAt,
      latestScore: project.proofCarryingAlphaContractScore || contract.scoreNow || 0,
      latestVerdict: project.proofCarryingAlphaContractVerdict || contract.verdict || "Unknown",
      latestProjectSnapshot: {
        name: project.name || "Unknown",
        symbol: project.symbol || "UNKNOWN",
        chain: project.chain || "unknown",
        priceUsd: Number(project.priceUsd || project.price || 0),
        liquidityUsd: Number(project.liquidityUsd || project.liquidity || 0),
        volume24h: Number(project.volume24h || project.volume || 0),
        pipelineScore: Number(project.pipelineScore || project.opportunityScore || 0),
        riskScore: Math.max(
          Number(project.trapRiskScore || 0),
          Number(project.riskScore || 0),
          Number(project.sellPressureScore || 0),
          Number(project.externalRiskScore || 0)
        ),
      },
    });
  }

  const contracts = [...byId.values()].sort(
    (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
  );
  writeContracts(contracts);

  return {
    saved: projects.filter((project) => project.proofCarryingAlphaContract?.contractId).length,
    totalContracts: contracts.length,
    file: CONTRACT_FILE,
  };
}

export function summarizeAlphaContracts(contracts = readContracts()) {
  const safeContracts = Array.isArray(contracts) ? contracts : [];
  const resolved = safeContracts.filter((contract) => contract.status === "resolved");
  const open = safeContracts.filter((contract) => contract.status !== "resolved");
  const wins = resolved.filter((contract) => contract.finalGrade === "confirmed").length;
  const losses = resolved.filter((contract) => contract.finalGrade === "failed" || contract.finalGrade === "invalidated").length;

  return {
    file: CONTRACT_FILE,
    totalContracts: safeContracts.length,
    openContracts: open.length,
    resolvedContracts: resolved.length,
    wins,
    losses,
    winRate: resolved.length ? Math.round((wins / resolved.length) * 100) : 0,
    latestContracts: safeContracts.slice(-10).map((contract) => ({
      contractId: contract.contractId,
      symbol: contract.symbol,
      thesis: contract.thesis,
      status: contract.status,
      finalGrade: contract.finalGrade || null,
      scoreNow: contract.scoreNow,
      confidenceNow: contract.confidenceNow,
    })),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(summarizeAlphaContracts(), null, 2));
}
