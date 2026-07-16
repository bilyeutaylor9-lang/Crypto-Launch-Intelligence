import fs from "fs";
import path from "path";
import { getEngineContracts } from "./kernel/engineContractManifest.js";

const ENGINE_DIR = path.resolve("src/engines");
const PIPELINE_FILE = path.resolve("src/intelligencePipeline.js");

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

function pipelineImports(source = "") {
  const bindings = new Map();
  const importPattern = /import\s*\{\s*([^}]*)\s*\}\s*from\s*["']\.\/engines\/([^"']+Engine\.js)["'];/g;

  for (const match of source.matchAll(importPattern)) {
    const [, names, module] = match;
    for (const item of names.split(",")) {
      const parts = item.trim().split(/\s+as\s+/);
      const exportedName = parts[0]?.trim();
      const localName = (parts[1] || parts[0])?.trim();
      if (exportedName && localName) {
        bindings.set(localName, { engine: path.basename(module), exportName: exportedName });
      }
    }
  }

  return bindings;
}

export function getPipelineEngineUsage(source = fs.readFileSync(PIPELINE_FILE, "utf8")) {
  const bindings = pipelineImports(source);
  const usage = [];
  const runPattern = /runEngine\(\s*["']([^"']+)["']\s*,\s*([A-Za-z_$][\w$]*)/g;

  for (const match of source.matchAll(runPattern)) {
    const [, stage, localName] = match;
    const binding = bindings.get(localName);
    if (binding) usage.push({ ...binding, stage });
  }

  return usage;
}

function projectResultFrom(output) {
  if (Array.isArray(output)) return output[0] || null;
  for (const field of ["results", "projects", "data", "tokens", "candidates"]) {
    if (Array.isArray(output?.[field])) return output[field][0] || null;
  }
  return null;
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

async function executePipelineUsage(usage = {}, module = {}, sample = {}, options = {}) {
  const engine = module[usage.exportName];
  const timeoutMs = Math.max(100, num(options.timeoutMs || 7000));

  if (typeof engine !== "function") {
    return {
      status: "FAIL",
      issue: `Pipeline references missing export ${usage.exportName}`,
      executionStatus: "NOT_EXECUTED",
      timeoutMs,
    };
  }

  const startedAt = Date.now();
  try {
    const output = await withTimeout(
      () => engine([{ ...sample }], { auditMode: true, saveMemory: false }),
      timeoutMs,
      usage.stage
    );
    const result = projectResultFrom(output);

    if (!result) {
      return {
        status: "FAIL",
        issue: "Pipeline export did not return a project batch result.",
        executionStatus: "INVALID_RETURN",
        timeoutMs,
        durationMs: Date.now() - startedAt,
      };
    }
    if (!identityPreserved(result, sample)) {
      return {
        status: "FAIL",
        issue: "Pipeline export did not preserve the project identity.",
        executionStatus: "IDENTITY_CORRUPTED",
        timeoutMs,
        durationMs: Date.now() - startedAt,
      };
    }

    return {
      status: "OK",
      executionStatus: "PIPELINE_EXECUTED",
      timeoutMs,
      durationMs: Date.now() - startedAt,
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
  const pipelineUsageByModule = new Map();
  for (const usage of getPipelineEngineUsage()) {
    const entries = pipelineUsageByModule.get(usage.engine) || [];
    entries.push(usage);
    pipelineUsageByModule.set(usage.engine, entries);
  }
  const sample = { ...defaultSampleProject(), ...sampleProject };
  const results = [];

  for (const file of files) {
    try {
      const module = await import(`./engines/${file}`);
      const exports = Object.entries(module)
        .filter(([, value]) => typeof value === "function")
        .map(([name]) => name);
      const contract = contractsByModule.get(file);
      const pipelineUsage = pipelineUsageByModule.get(file) || [];

      if (!exports.length) {
        results.push({ engine: file, status: "FAIL", issue: "No exported function found", executionStatus: "NOT_EXECUTED" });
      } else if (!contract) {
        if (!pipelineUsage.length) {
          results.push({
            engine: file,
            status: "DORMANT",
            issue: "Not referenced by the live intelligence pipeline.",
            executionStatus: "NOT_EXECUTED",
            exports,
          });
        } else if (options.executePipelineActive === true) {
          const executions = [];
          for (const usage of pipelineUsage) {
            executions.push(await executePipelineUsage(usage, module, sample, options));
          }
          const failedExecution = executions.find((execution) => execution.status === "FAIL");
          results.push({
            engine: file,
            status: failedExecution ? "FAIL" : "OK",
            pipelineStages: pipelineUsage.map((usage) => usage.stage),
            pipelineExports: pipelineUsage.map((usage) => usage.exportName),
            exports,
            ...(failedExecution || executions[0]),
          });
        } else {
          results.push({
            engine: file,
            status: "PIPELINE_ACTIVE_UNCONTRACTED",
            issue: "Referenced by the live pipeline but missing an explicit engine contract.",
            executionStatus: "REFERENCED_BY_PIPELINE",
            pipelineStages: pipelineUsage.map((usage) => usage.stage),
            pipelineExports: pipelineUsage.map((usage) => usage.exportName),
            exports,
          });
        }
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
  const results = await runEngineHealthCheck({}, { executePipelineActive: process.argv.includes("--full") });
  console.table(results.map((result) => ({
    engine: result.engine,
    contract: result.contractId || "",
    status: result.status,
    execution: result.executionStatus,
    durationMs: result.durationMs || "",
    issue: result.issue || "",
  })));

  const failed = results.filter((result) => result.status === "FAIL");
  const executed = results.filter((result) => ["EXECUTED", "PIPELINE_EXECUTED"].includes(result.executionStatus));
  const activeUncontracted = results.filter((result) => result.status === "PIPELINE_ACTIVE_UNCONTRACTED");
  const dormant = results.filter((result) => result.status === "DORMANT");
  console.log(`\nExecuted ${executed.length} engines. ${activeUncontracted.length} active pipeline engines need explicit contracts. ${dormant.length} modules are dormant.`);

  if (failed.length > 0) {
    console.log(`\n${failed.length} engine checks failed.`);
    process.exit(1);
  }
}
