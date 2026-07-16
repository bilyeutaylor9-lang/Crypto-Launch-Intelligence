import fs from "fs";
import path from "path";
import { getEngineContracts } from "./kernel/engineContractManifest.js";

const ENGINE_DIR = path.resolve("src/engines");

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function defaultSampleProject() {
  return {
    projectId: "engine-audit:sample",
    name: "Engine Audit Sample",
    symbol: "AUDIT",
    chain: "base",
    address: "0x1111111111111111111111111111111111111111",
    pairAddress: "0x2222222222222222222222222222222222222222",
    source: "dexscreener",
    discoverySources: ["dexscreener", "github", "coingecko"],
    discoveredAt: new Date().toISOString(),
    liquidityUsd: 300000,
    volume24h: 180000,
    marketCap: 4500000,
    priceUsd: 0.04,
    priceChange24h: 6,
    identityResolutionScore: 82,
    projectIdentityVerdict: "Identity Resolved",
    sourceTruthScore: 80,
    sourceTruthVerdict: "Verified Source Stack",
    activeLiquidityTruthScore: 78,
    activeLiquidityTruthVerdict: "Usable Exit Liquidity Confirmed",
    organicBuyerScore: 76,
    organicBuyerVerdict: "Organic Buyer Signal",
    walletClusterScore: 72,
    walletClusterRiskScore: 10,
    instantSafetyStatus: "PASS",
    instantSafetyScore: 85,
    organicDemandFirewallStatus: "PASS",
    organicEconomicIntegrityScore: 78,
    githubProScore: 74,
    developerActivityScore: 72,
    catalystScore: 70,
    roadmapProfitabilityScore: 70,
    discoveryDecisionScore: 78,
    discoveryDecisionTier: "PASS",
    sniperEvidenceConfidence: 78,
    sniperState: "WATCH",
    sniperIntegrityScore: 76,
    purchaseRouteConfirmed: true,
    executionTwinScore: 75,
    executionTwinVerdict: "Route Verified",
    alphaEvolutionGovernorScore: 76,
    alphaEvolutionGovernorVerdict: "Governor Priority Research",
    pipelineScore: 76,
    institutionalScore: 76,
    riskScore: 12,
    trapRiskScore: 8,
    evidence: [{ engine: "engine-health-check", source: "engine-health-check", score: 80 }],
  };
}

function withTimeout(work, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([Promise.resolve().then(work), timeout]).finally(() => clearTimeout(timer));
}

function moduleFileFor(contract = {}) {
  return path.basename(String(contract.module || ""));
}

function identityPreserved(result = {}, sample = {}) {
  return (
    result.projectId === sample.projectId &&
    result.symbol === sample.symbol &&
    result.chain === sample.chain &&
    result.address === sample.address
  );
}

async function executeContract(contract = {}, module = {}, sample = {}, options = {}) {
  const engine = module[contract.exportName];
  const timeoutMs = Math.max(100, num(options.timeoutMs || contract.timeoutMs || 7000));

  if (typeof engine !== "function") {
    return {
      status: "FAIL",
      issue: `Missing declared export ${contract.exportName}`,
      executionStatus: "NOT_EXECUTED",
      timeoutMs,
    };
  }

  const startedAt = Date.now();
  try {
    const output = await withTimeout(
      () => engine([{ ...sample }], { auditMode: true, saveMemory: false }),
      timeoutMs,
      contract.id
    );
    const result = Array.isArray(output) ? output[0] : null;
    const scoreFields = contract.outputContract?.scoreFields || [];
    const invalidScores = scoreFields.filter((field) => {
      const value = result?.[field];
      return value !== undefined && (!Number.isFinite(Number(value)) || num(value) < 0 || num(value) > 100);
    });
    const missingScores = scoreFields.filter((field) => result?.[field] === undefined);

    if (!Array.isArray(output) || output.length !== 1) {
      return {
        status: "FAIL",
        issue: "Declared batch export did not return one project result.",
        executionStatus: "INVALID_RETURN",
        timeoutMs,
        durationMs: Date.now() - startedAt,
      };
    }
    if (!identityPreserved(result, sample)) {
      return {
        status: "FAIL",
        issue: "Declared batch export did not preserve the project identity.",
        executionStatus: "IDENTITY_CORRUPTED",
        timeoutMs,
        durationMs: Date.now() - startedAt,
      };
    }
    if (missingScores.length || invalidScores.length) {
      return {
        status: "FAIL",
        issue: [
          ...(missingScores.length ? [`Missing score fields: ${missingScores.join(", ")}`] : []),
          ...(invalidScores.length ? [`Invalid score fields: ${invalidScores.join(", ")}`] : []),
        ].join(". "),
        executionStatus: "INVALID_OUTPUT",
        timeoutMs,
        durationMs: Date.now() - startedAt,
      };
    }

    return {
      status: "OK",
      executionStatus: "EXECUTED",
      timeoutMs,
      durationMs: Date.now() - startedAt,
      scoreFields,
    };
  } catch (error) {
    return {
      status: "FAIL",
      issue: error.message,
      executionStatus: "EXECUTION_FAILED",
      timeoutMs,
      durationMs: Date.now() - startedAt,
    };
  }
}

export async function runEngineHealthCheck(sampleProject = {}, options = {}) {
  const files = fs.readdirSync(ENGINE_DIR).filter((file) => file.endsWith("Engine.js")).sort();
  const contractsByModule = new Map(getEngineContracts().map((contract) => [moduleFileFor(contract), contract]));
  const sample = { ...defaultSampleProject(), ...sampleProject };
  const results = [];

  for (const file of files) {
    try {
      const module = await import(`./engines/${file}`);
      const exports = Object.entries(module)
        .filter(([, value]) => typeof value === "function")
        .map(([name]) => name);
      const contract = contractsByModule.get(file);

      if (!exports.length) {
        results.push({ engine: file, status: "FAIL", issue: "No exported function found", executionStatus: "NOT_EXECUTED" });
      } else if (!contract) {
        results.push({
          engine: file,
          status: "IMPORT_ONLY",
          issue: "Not declared in the core engine contract manifest.",
          executionStatus: "NOT_EXECUTED",
          exports,
        });
      } else {
        results.push({
          engine: file,
          contractId: contract.id,
          exports,
          ...(await executeContract(contract, module, sample, options)),
        });
      }
    } catch (error) {
      results.push({ engine: file, status: "FAIL", issue: error.message, executionStatus: "IMPORT_FAILED" });
    }
  }

  return results;
}

if (process.argv[1]?.includes("engineHealthCheck.js")) {
  const results = await runEngineHealthCheck();
  console.table(results.map((result) => ({
    engine: result.engine,
    contract: result.contractId || "",
    status: result.status,
    execution: result.executionStatus,
    durationMs: result.durationMs || "",
    issue: result.issue || "",
  })));

  const failed = results.filter((result) => result.status === "FAIL");
  const executed = results.filter((result) => result.executionStatus === "EXECUTED");
  console.log(`\nExecuted ${executed.length} declared core engines. ${results.length - executed.length} modules are import-only until they have a contract.`);

  if (failed.length > 0) {
    console.log(`\n${failed.length} engine checks failed.`);
    process.exit(1);
  }
}
