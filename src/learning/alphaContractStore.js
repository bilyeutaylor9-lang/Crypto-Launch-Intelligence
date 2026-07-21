import fs from "fs";
import path from "path";
import {
  appendMemorySidecar,
  memoryFileSizeBytes,
  memoryRewriteLimitBytes,
  memorySidecarPath,
  readMemorySidecarTail,
  shouldUseAppendOnlyMemory,
} from "./boundedMemoryStore.js";

const DATA_DIR = path.resolve("data");
const CONTRACT_FILE = path.join(DATA_DIR, "alpha-contracts.json");
const MAX_CONTRACTS = Number(process.env.MAX_ALPHA_CONTRACTS || 5000);
const DEFAULT_MAX_LOAD_CONTRACTS = 5000;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(true|1|yes|on)$/i.test(String(value).trim());
}

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function maxLoadContracts(options = {}) {
  const configured = Math.floor(num(options.limit || process.env.MAX_ALPHA_CONTRACT_LOAD_RECORDS));
  return configured > 0 ? configured : DEFAULT_MAX_LOAD_CONTRACTS;
}

function fileMtimeMs(filePath = CONTRACT_FILE) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function readLegacyContracts(filePath = CONTRACT_FILE, limit = DEFAULT_MAX_LOAD_CONTRACTS) {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(parsed) ? parsed.slice(-limit) : [];
}

export function loadAlphaContractsFromFile(filePath = CONTRACT_FILE, options = {}) {
  ensureDataDir();

  const resolvedPath = path.resolve(filePath);
  const sidecarPath = memorySidecarPath(resolvedPath);
  const mtimeMs = fileMtimeMs(resolvedPath);
  const sidecarMtimeMs = fileMtimeMs(sidecarPath);
  const limit = maxLoadContracts(options);

  if (!mtimeMs && !sidecarMtimeMs) return [];

  const sidecarContracts = sidecarMtimeMs
    ? readMemorySidecarTail(resolvedPath, {
        limit,
        maxBytes: Number(options.sidecarMaxBytes || process.env.ALPHA_CONTRACT_SIDECAR_READ_BYTES || 16 * 1024 * 1024),
      })
    : [];
  const legacyBytes = memoryFileSizeBytes(resolvedPath);
  const largeLegacyJson = legacyBytes > memoryRewriteLimitBytes(process.env);
  const preferSidecar = sidecarContracts.length && boolEnv(process.env.ALPHA_CONTRACT_PREFER_SIDECAR, true);
  const allowLargeLegacyRead =
    options.allowLargeLegacyRead === true ||
    boolEnv(process.env.ALPHA_CONTRACT_ALLOW_LARGE_JSON_READ, false);

  if (preferSidecar || (largeLegacyJson && !allowLargeLegacyRead)) return sidecarContracts;

  try {
    const legacyContracts = mtimeMs ? readLegacyContracts(resolvedPath, limit) : [];
    return sidecarContracts.length
      ? [...legacyContracts, ...sidecarContracts].slice(-limit)
      : legacyContracts;
  } catch {
    return sidecarContracts;
  }
}

function readContracts() {
  try {
    return loadAlphaContractsFromFile(CONTRACT_FILE);
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
  const generatedAt = new Date().toISOString();
  const newContracts = (Array.isArray(projects) ? projects : [])
    .filter((project) => project.proofCarryingAlphaContract?.contractId)
    .map((project) => ({
      ...project.proofCarryingAlphaContract,
      lastSeenAt: generatedAt,
      latestScore: project.proofCarryingAlphaContractScore || project.proofCarryingAlphaContract.scoreNow || 0,
      latestVerdict:
        project.proofCarryingAlphaContractVerdict ||
        project.proofCarryingAlphaContract.verdict ||
        "Unknown",
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
    }));

  if (shouldUseAppendOnlyMemory(CONTRACT_FILE)) {
    const sidecar = appendMemorySidecar(CONTRACT_FILE, newContracts, { recordType: "alpha-contract" });
    return {
      saved: newContracts.length,
      totalContracts: null,
      file: sidecar.file,
      persistenceMode: sidecar.mode,
      legacyFilePreserved: sidecar.legacyFilePreserved,
      legacyFileBytes: sidecar.legacyFileBytes,
    };
  }

  const existing = readContracts();
  const byId = new Map(existing.map((contract) => [contract.contractId, contract]));

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
