import fs from "fs";
import path from "path";
import { ENGINE_DEPENDENCY_MANIFEST } from "../config/engineDependencyManifest.js";
import { resolveEngineProfile } from "../config/engineProfileConfig.js";
import { getEngineContracts } from "../kernel/engineContractManifest.js";

const ENGINE_DIR = path.resolve("src/engines");
const REPORT_DIR = path.resolve("src/reports");
const PIPELINE_FILE = path.resolve("src/intelligencePipeline.js");
const DEFAULT_REPORTS_DIR = path.resolve("reports");

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function readIfExists(filePath = "") {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function moduleFileFor(contract = {}) {
  return path.basename(String(contract.module || ""));
}

function displayPath(filePath = "") {
  return path.relative(process.cwd(), filePath).replaceAll(path.sep, "/");
}

function normalizeKey(value = "") {
  return String(value || "")
    .replace(/\.js$/i, "")
    .replace(/Engine$/i, "")
    .replace(/^analyze/i, "")
    .replace(/Batch$/i, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

function unique(values = []) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))];
}

function flattenRequiredAny(groups = []) {
  return groups.flatMap((group) => (Array.isArray(group) ? group : [group])).filter(Boolean);
}

function pipelineImports(source = "") {
  const bindings = new Map();
  const importPattern = /import\s*\{\s*([^}]*)\s*\}\s*from\s*["']\.\/engines\/([^"']+Engine\.js)["'];/g;

  for (const match of source.matchAll(importPattern)) {
    const [, names, module] = match;
    for (const item of names.split(",")) {
      const parts = item.trim().split(/\s+as\s+/);
      const exportName = parts[0]?.trim();
      const localName = (parts[1] || parts[0])?.trim();
      if (exportName && localName) {
        bindings.set(localName, { engine: path.basename(module), exportName });
      }
    }
  }

  return bindings;
}

function pipelineEngineUsage(source = readIfExists(PIPELINE_FILE)) {
  const bindings = pipelineImports(source);
  const usage = [];
  const runPattern = /runEngine\(\s*["']([^"']+)["']\s*,\s*([A-Za-z_$][\w$]*)/g;

  for (const match of source.matchAll(runPattern)) {
    const [, stage, localName] = match;
    const binding = bindings.get(localName);
    if (binding) usage.push({ ...binding, stage, localName });
  }

  return usage;
}

function extractExports(source = "") {
  return unique([
    ...[...source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)].map((match) => match[1]),
    ...[...source.matchAll(/export\s+const\s+([A-Za-z_$][\w$]*)\s*=/g)].map((match) => match[1]),
    ...[...source.matchAll(/export\s+\{\s*([^}]+)\s*\}/g)].flatMap((match) =>
      match[1]
        .split(",")
        .map((item) => item.trim().split(/\s+as\s+/)[0]?.trim())
        .filter(Boolean)
    ),
  ]).sort();
}

function sourceHintsForFields(fields = []) {
  const hints = new Set();
  const text = fields.join(" ").toLowerCase();

  if (/identity|address|contract|token|chain|pair|pool|symbol|name/.test(text)) {
    hints.add("DexScreener");
    hints.add("GeckoTerminal");
    hints.add("official project links");
    hints.add("chain explorer");
  }
  if (/route|execution|quote|sell|buy|slippage|order|book|venue|market/.test(text)) {
    hints.add("Jupiter quote API");
    hints.add("0x Swap API");
    hints.add("CEX public order books");
    hints.add("chain-native DEX quote adapters");
  }
  if (/liquidity|volume|marketcap|market cap|price|fdv/.test(text)) {
    hints.add("DexScreener");
    hints.add("GeckoTerminal");
    hints.add("CoinGecko");
    hints.add("CoinPaprika");
  }
  if (/wallet|buyer|holder|deployer|cluster|wash|bundle/.test(text)) {
    hints.add("chain RPC");
    hints.add("explorer holder APIs");
    hints.add("Birdeye");
    hints.add("Solscan");
  }
  if (/safety|risk|honeypot|tax|verified|authority|owner|lp/.test(text)) {
    hints.add("GoPlus");
    hints.add("Honeypot.is");
    hints.add("Sourcify");
    hints.add("Blockscout");
    hints.add("Etherscan V2");
  }
  if (/github|repo|developer|commit|release|contributor/.test(text)) {
    hints.add("GitHub");
    hints.add("official documentation");
    hints.add("package registries");
  }
  if (/roadmap|catalyst|announcement|website|description|docs/.test(text)) {
    hints.add("official website");
    hints.add("official docs");
    hints.add("Google News discovery");
  }
  if (!hints.size) {
    hints.add("canonical field alias registry");
    hints.add("targeted enrichment router");
  }

  return [...hints].sort();
}

function recoveryPlanForContract(contract = null, dependency = null) {
  const requiredFields = flattenRequiredAny(contract?.inputContract?.requiredAny || []);
  const optionalFields = [...(contract?.inputContract?.optional || [])];
  const dependencyRequired = [...(dependency?.requiredInputs || [])];
  const allFields = unique([...requiredFields, ...optionalFields, ...dependencyRequired]);
  const sources = sourceHintsForFields(allFields);

  return {
    requiredInputGroups: contract?.inputContract?.requiredAny || dependency?.requiredInputs || [],
    optionalInputs: optionalFields.length ? optionalFields : dependency?.optionalInputs || [],
    cheapestAuthoritativeSources: sources,
    recoveryQueueTarget: allFields.some((field) => /route|quote|sell|buy|execution/i.test(String(field)))
      ? "execution-proof-recovery"
      : "daily-recovery-queue",
    missingDataRule: "UNKNOWN_STAYS_UNKNOWN",
  };
}

function profileForStage(stage = "", profile = resolveEngineProfile("tenx")) {
  if (profile.requiredEngines.has(stage)) return "DAILY_TENX_REQUIRED";
  if (profile.skipEngines.has(stage)) return "DEEP_RESEARCH_ONLY";
  return "DAILY_ALLOWED";
}

function recommendationFor({ contract = null, dependency = null, pipelineStages = [], health = null, profile = "" } = {}) {
  if (health?.status === "FAIL") return "FIX_RUNTIME_FAILURE";
  if (pipelineStages.length && !contract) return "ADD_ENGINE_CONTRACT";
  if (contract && !contract.inputContract?.requiredAny?.length) return "FIX_INPUT_CONTRACT";
  if (contract && !contract.outputContract?.requiredAny?.length && !contract.outputContract?.scoreFields?.length) {
    return "FIX_OUTPUT_CONTRACT";
  }
  if (dependency?.mandatory && !contract) return "ADD_MANDATORY_CONTRACT";
  if (profile === "DEEP_RESEARCH_ONLY") return "KEEP_DEEP_ONLY";
  if (!pipelineStages.length && !contract) return "CLASSIFY_OR_ARCHIVE";
  if (contract?.affectsFinalDecision || contract?.canBlockCandidate || dependency?.mandatory) return "KEEP_DAILY_REQUIRED";
  return "KEEP_DAILY_OPTIONAL";
}

function scanReportConsumers(fields = []) {
  if (!fields.length || !fs.existsSync(REPORT_DIR)) return [];
  const reportFiles = fs
    .readdirSync(REPORT_DIR)
    .filter((file) => file.endsWith(".js"))
    .sort();
  const consumers = [];

  for (const file of reportFiles) {
    const source = readIfExists(path.join(REPORT_DIR, file));
    const usedFields = fields.filter((field) => field && source.includes(field));
    if (usedFields.length) {
      consumers.push({ report: `src/reports/${file}`, consumedFields: unique(usedFields).slice(0, 15) });
    }
  }

  return consumers;
}

function statusFromRows(rows = [], pipelineStages = [], requiredProfile = resolveEngineProfile("tenx")) {
  const requiredStageNames = new Set(requiredProfile.requiredEngines);
  const missingRequiredContracts = pipelineStages.filter(
    (stage) => requiredStageNames.has(stage.engineName) && stage.contractStatus !== "CONTRACTED"
  );
  const runtimeFailures = rows.filter((row) => row.healthStatus === "FAIL");
  const unmappedLiveStages = pipelineStages.filter((stage) => stage.contractStatus !== "CONTRACTED");

  if (runtimeFailures.length) return "FAIL";
  if (missingRequiredContracts.length || unmappedLiveStages.length) return "DEGRADED";
  return "PASS";
}

export function buildWholeEngineAuditReport(options = {}) {
  const generatedAt = new Date().toISOString();
  const engineDir = path.resolve(options.engineDir || ENGINE_DIR);
  const pipelineSource = options.pipelineSource ?? readIfExists(path.resolve(options.pipelineFile || PIPELINE_FILE));
  const profile = resolveEngineProfile(options.profile || "tenx", options.env || process.env);
  const contracts = getEngineContracts();
  const dependencyManifest = ENGINE_DEPENDENCY_MANIFEST;
  const dependencyByKey = new Map(dependencyManifest.map((entry) => [normalizeKey(entry.name), entry]));
  const contractByModule = new Map(contracts.map((contract) => [moduleFileFor(contract), contract]));
  const contractById = new Map(contracts.map((contract) => [contract.id, contract]));
  const stagesByModule = new Map();
  const healthResults = options.engineHealthReport?.results || options.engineResults || [];
  const healthByEngine = new Map(healthResults.map((result) => [result.engine, result]));
  const usage = pipelineEngineUsage(pipelineSource);

  for (const entry of usage) {
    const list = stagesByModule.get(entry.engine) || [];
    list.push(entry);
    stagesByModule.set(entry.engine, list);
  }

  const files = fs.existsSync(engineDir)
    ? fs.readdirSync(engineDir).filter((file) => file.endsWith("Engine.js")).sort()
    : [];
  const engineTruthTable = files.map((file) => {
    const filePath = path.join(engineDir, file);
    const source = readIfExists(filePath);
    const exports = extractExports(source);
    const contract = contractByModule.get(file) || null;
    const pipelineUsages = stagesByModule.get(file) || [];
    const primaryStage = pipelineUsages[0]?.stage || contract?.id || file.replace(/\.js$/, "");
    const dependency = dependencyByKey.get(normalizeKey(primaryStage)) || dependencyByKey.get(normalizeKey(contract?.id)) || null;
    const outputFields = unique([
      ...flattenRequiredAny(contract?.outputContract?.requiredAny || []),
      ...(contract?.outputContract?.scoreFields || []),
      ...(dependency?.producedFields || []),
    ]);
    const rowProfile = pipelineUsages.some((stage) => profile.skipEngines.has(stage.stage))
      ? "DEEP_RESEARCH_ONLY"
      : pipelineUsages.some((stage) => profile.requiredEngines.has(stage.stage))
        ? "DAILY_TENX_REQUIRED"
        : pipelineUsages.length
          ? "DAILY_ALLOWED"
          : "STANDALONE_OR_DORMANT";
    const health = healthByEngine.get(file) || null;
    const contractStatus = contract ? "CONTRACTED" : pipelineUsages.length ? "UNCONTRACTED_LIVE_STAGE" : "UNCONTRACTED_STANDALONE_OR_DORMANT";
    const inputReadiness = contract
      ? "CONTRACT_DECLARED"
      : pipelineUsages.length
        ? "INPUT_CONTRACT_MISSING"
        : "NOT_APPLICABLE";
    const outputStatus =
      health?.status === "FAIL"
        ? "PIPELINE_OUTPUT_MISSING"
        : contract
          ? "OUTPUT_CONTRACT_DECLARED"
          : pipelineUsages.length
            ? "OUTPUT_CONTRACT_MISSING"
            : "NOT_APPLICABLE";
    const sourceRecoveryPlan = recoveryPlanForContract(contract, dependency);
    const recommendation = recommendationFor({
      contract,
      dependency,
      pipelineStages: pipelineUsages,
      health,
      profile: rowProfile,
    });

    return {
      engineName: primaryStage,
      file: `src/engines/${file}`,
      exports,
      pipelineStages: pipelineUsages.map((stage) => stage.stage),
      pipelineExportNames: pipelineUsages.map((stage) => stage.exportName),
      contractId: contract?.id || null,
      phase: contract?.phase || dependency?.checkpointGroup || "unclassified",
      priority: contract?.priority ?? null,
      profile: rowProfile,
      contractStatus,
      inputReadiness,
      outputStatus,
      requiredOutputs: outputFields,
      downstreamConsumers: contracts
        .filter((candidate) => contract?.id && (candidate.dependsOn || []).includes(contract.id))
        .map((candidate) => candidate.id),
      reportConsumers: scanReportConsumers(outputFields),
      sourceRecoveryPlan,
      healthStatus: health?.status || "NOT_RUN_IN_HEALTH_CHECK",
      executionStatus: health?.executionStatus || "NOT_RUN_IN_HEALTH_CHECK",
      durationMs: num(health?.durationMs),
      timeoutMs: num(contract?.timeoutMs || dependency?.timeout || health?.timeoutMs),
      failurePolicy: contract?.failureMode || dependency?.failurePolicy || "unclassified",
      canBlockCandidate: Boolean(contract?.canBlockCandidate || dependency?.failurePolicy === "fail-closed"),
      affectsFinalDecision: Boolean(contract?.affectsFinalDecision || dependency?.mandatory),
      recommendation,
      issue: health?.issue || null,
    };
  });

  const pipelineStages = usage.map((entry, index) => {
    const contract = contractByModule.get(entry.engine) || null;
    const dependency = dependencyByKey.get(normalizeKey(entry.stage)) || dependencyByKey.get(normalizeKey(contract?.id)) || null;
    const stageProfile = profileForStage(entry.stage, profile);
    const outputFields = unique([
      ...flattenRequiredAny(contract?.outputContract?.requiredAny || []),
      ...(contract?.outputContract?.scoreFields || []),
      ...(dependency?.producedFields || []),
    ]);

    return {
      order: index + 1,
      engineName: entry.stage,
      engineFile: `src/engines/${entry.engine}`,
      exportName: entry.exportName,
      contractId: contract?.id || null,
      phase: contract?.phase || dependency?.checkpointGroup || "unclassified",
      profile: stageProfile,
      contractStatus: contract ? "CONTRACTED" : "UNCONTRACTED",
      requiredInputs: contract?.inputContract?.requiredAny || dependency?.requiredInputs || [],
      requiredOutputs: outputFields,
      recoverySources: recoveryPlanForContract(contract, dependency).cheapestAuthoritativeSources,
      failurePolicy: contract?.failureMode || dependency?.failurePolicy || "unclassified",
      recommendation: recommendationFor({
        contract,
        dependency,
        pipelineStages: [entry],
        health: healthByEngine.get(entry.engine),
        profile: stageProfile,
      }),
    };
  });

  const contractsWithoutFiles = contracts
    .filter((contract) => !files.includes(moduleFileFor(contract)))
    .map((contract) => ({
      contractId: contract.id,
      declaredModule: contract.module,
      issue: "Declared engine contract module file is missing.",
    }));
  const unusedContracts = contracts
    .filter((contract) => !stagesByModule.has(moduleFileFor(contract)))
    .map((contract) => ({
      contractId: contract.id,
      module: contract.module,
      phase: contract.phase,
      recommendation: "VERIFY_STANDALONE_VALUE_OR_WIRE_PIPELINE",
    }));
  const dependencyGaps = contracts.flatMap((contract) =>
    (contract.dependsOn || [])
      .filter((dependencyId) => !contractById.has(dependencyId))
      .map((dependencyId) => ({
        contractId: contract.id,
        missingDependency: dependencyId,
        issue: "Contract depends on an undeclared engine contract.",
      }))
  );
  const recommendationSummary = engineTruthTable.reduce((acc, row) => {
    acc[row.recommendation] = (acc[row.recommendation] || 0) + 1;
    return acc;
  }, {});
  const profileSummary = engineTruthTable.reduce((acc, row) => {
    acc[row.profile] = (acc[row.profile] || 0) + 1;
    return acc;
  }, {});
  const uncontractedLiveStages = pipelineStages.filter((stage) => stage.contractStatus !== "CONTRACTED");
  const outputMissingEngines = engineTruthTable.filter((row) => row.outputStatus === "PIPELINE_OUTPUT_MISSING");
  const miswiredEngineCount =
    uncontractedLiveStages.length + contractsWithoutFiles.length + dependencyGaps.length + outputMissingEngines.length;

  const report = {
    generatedAt,
    status: statusFromRows(engineTruthTable, pipelineStages, profile),
    auditName: "Whole Engine Audit",
    objective:
      "Prove every engine has a contract, a pipeline role, source recovery instructions, output consumers, and a daily/deep-mode value classification.",
    summary: {
      engineFileCount: files.length,
      pipelineStageCount: pipelineStages.length,
      contractedEngineCount: engineTruthTable.filter((row) => row.contractStatus === "CONTRACTED").length,
      uncontractedLiveStageCount: uncontractedLiveStages.length,
      standaloneOrDormantEngineCount: engineTruthTable.filter((row) => row.profile === "STANDALONE_OR_DORMANT").length,
      dailyRequiredEngineCount: profileSummary.DAILY_TENX_REQUIRED || 0,
      dailyAllowedEngineCount: profileSummary.DAILY_ALLOWED || 0,
      deepResearchOnlyEngineCount: profileSummary.DEEP_RESEARCH_ONLY || 0,
      outputMissingEngineCount: outputMissingEngines.length,
      contractsWithoutFilesCount: contractsWithoutFiles.length,
      dependencyGapCount: dependencyGaps.length,
      miswiredEngineCount,
      reportConsumerMappedEngines: engineTruthTable.filter((row) => row.reportConsumers.length).length,
    },
    recommendationSummary,
    profileSummary,
    pipelineStages,
    engineTruthTable,
    contractsWithoutFiles,
    unusedContracts,
    dependencyGaps,
    topRepairQueue: [
      ...engineTruthTable
        .filter((row) =>
          ["FIX_RUNTIME_FAILURE", "ADD_MANDATORY_CONTRACT", "ADD_ENGINE_CONTRACT", "FIX_INPUT_CONTRACT", "FIX_OUTPUT_CONTRACT"].includes(
            row.recommendation
          )
        )
        .map((row) => ({
          engineName: row.engineName,
          file: row.file,
          recommendation: row.recommendation,
          recoverySources: row.sourceRecoveryPlan.cheapestAuthoritativeSources,
          issue: row.issue || row.contractStatus,
        })),
      ...contractsWithoutFiles.map((entry) => ({
        engineName: entry.contractId,
        file: entry.declaredModule,
        recommendation: "RESTORE_CONTRACT_MODULE",
        recoverySources: ["source control"],
        issue: entry.issue,
      })),
    ].slice(0, 50),
    limitations: [
      "This audit verifies engine wiring and contracts; predictive value still requires point-in-time outcome validation.",
      "Source recovery plans identify authoritative routes; live source availability is reported separately by daily-source-gaps.json.",
      "Deep-only engines may be useful for research, but they are intentionally not required for daily under-20-minute scans.",
    ],
  };

  return report;
}

function valueClassFor(row = {}) {
  if (row.recommendation === "FIX_RUNTIME_FAILURE" || row.recommendation === "ADD_MANDATORY_CONTRACT") {
    return "REPAIR_BEFORE_TRUST";
  }
  if (row.profile === "DAILY_TENX_REQUIRED" || row.affectsFinalDecision || row.canBlockCandidate) {
    return "CORE_REQUIRED";
  }
  if (row.profile === "DAILY_ALLOWED") return "DAILY_VALUE";
  if (row.profile === "DEEP_RESEARCH_ONLY") return "DEEP_RESEARCH_ONLY";
  if (row.reportConsumers.length || row.sourceRecoveryPlan.cheapestAuthoritativeSources.length > 1) {
    return "EXPERIMENTAL_OR_SUPPORT";
  }
  return "CANDIDATE_FOR_ARCHIVE";
}

function valueScoreFor(row = {}) {
  let score = 35;
  if (row.affectsFinalDecision) score += 20;
  if (row.canBlockCandidate) score += 18;
  if (row.profile === "DAILY_TENX_REQUIRED") score += 16;
  if (row.profile === "DAILY_ALLOWED") score += 8;
  if (row.profile === "DEEP_RESEARCH_ONLY") score -= 8;
  if (row.contractStatus === "CONTRACTED") score += 10;
  if (row.reportConsumers.length) score += Math.min(10, row.reportConsumers.length * 2);
  if (row.recommendation === "FIX_RUNTIME_FAILURE") score -= 30;
  if (row.recommendation === "CLASSIFY_OR_ARCHIVE") score -= 20;
  if (num(row.durationMs) > 15_000) score -= 8;
  if (num(row.durationMs) > 60_000) score -= 12;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function buildEngineValueLedger(wholeEngineAudit = buildWholeEngineAuditReport()) {
  const engines = (wholeEngineAudit.engineTruthTable || []).map((row) => ({
    engineName: row.engineName,
    file: row.file,
    phase: row.phase,
    profile: row.profile,
    valueClass: valueClassFor(row),
    valueScore: valueScoreFor(row),
    affectsFinalDecision: row.affectsFinalDecision,
    canBlockCandidate: row.canBlockCandidate,
    reportConsumerCount: row.reportConsumers.length,
    recoveryQueueTarget: row.sourceRecoveryPlan.recoveryQueueTarget,
    recommendation: row.recommendation,
  }));
  const valueClasses = engines.reduce((acc, row) => {
    acc[row.valueClass] = (acc[row.valueClass] || 0) + 1;
    return acc;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    status: wholeEngineAudit.status,
    objective:
      "Classify engine value so daily scans keep evidence-producing engines and move decorative or expensive layers behind deep research profiles.",
    engineCount: engines.length,
    valueClasses,
    dailyCoreCount: valueClasses.CORE_REQUIRED || 0,
    repairBeforeTrustCount: valueClasses.REPAIR_BEFORE_TRUST || 0,
    candidateForArchiveCount: valueClasses.CANDIDATE_FOR_ARCHIVE || 0,
    topCoreEngines: engines
      .filter((row) => row.valueClass === "CORE_REQUIRED")
      .sort((a, b) => b.valueScore - a.valueScore)
      .slice(0, 25),
    archiveReviewQueue: engines
      .filter((row) => row.valueClass === "CANDIDATE_FOR_ARCHIVE")
      .sort((a, b) => a.valueScore - b.valueScore)
      .slice(0, 50),
    engines,
  };
}

function renderMarkdownTable(rows = [], columns = []) {
  if (!rows.length) return "_No rows._";
  const header = `| ${columns.map((column) => column.label).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((row) => `| ${columns.map((column) => String(column.value(row) ?? "").replaceAll("|", "/")).join(" | ")} |`)
    .join("\n");
  return [header, divider, body].join("\n");
}

export function renderWholeEngineAuditMarkdown(report = {}) {
  const summary = report.summary || {};
  const repairRows = report.topRepairQueue || [];
  const dailyRows = (report.engineTruthTable || []).filter((row) => row.profile === "DAILY_TENX_REQUIRED").slice(0, 40);

  return [
    "# Whole Engine Audit",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    "",
    "## Summary",
    "",
    `- Engine files: ${summary.engineFileCount ?? 0}`,
    `- Pipeline stages: ${summary.pipelineStageCount ?? 0}`,
    `- Contracted engines: ${summary.contractedEngineCount ?? 0}`,
    `- Uncontracted live stages: ${summary.uncontractedLiveStageCount ?? 0}`,
    `- Daily required engines: ${summary.dailyRequiredEngineCount ?? 0}`,
    `- Deep-only engines: ${summary.deepResearchOnlyEngineCount ?? 0}`,
    `- Miswired engines: ${summary.miswiredEngineCount ?? 0}`,
    "",
    "## Repair Queue",
    "",
    renderMarkdownTable(repairRows, [
      { label: "Engine", value: (row) => row.engineName },
      { label: "File", value: (row) => row.file },
      { label: "Recommendation", value: (row) => row.recommendation },
      { label: "Issue", value: (row) => row.issue },
    ]),
    "",
    "## Daily Required Stack",
    "",
    renderMarkdownTable(dailyRows, [
      { label: "Engine", value: (row) => row.engineName },
      { label: "Phase", value: (row) => row.phase },
      { label: "Contract", value: (row) => row.contractStatus },
      { label: "Outputs", value: (row) => row.requiredOutputs.slice(0, 3).join(", ") },
      { label: "Recommendation", value: (row) => row.recommendation },
    ]),
    "",
    "## Limitations",
    "",
    ...(report.limitations || []).map((item) => `- ${item}`),
    "",
  ].join("\n");
}

export function writeWholeEngineAuditReports(options = {}) {
  const reportsDir = path.resolve(options.reportsDir || DEFAULT_REPORTS_DIR);
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = buildWholeEngineAuditReport(options);
  const ledger = buildEngineValueLedger(report);
  const markdown = renderWholeEngineAuditMarkdown(report);
  const wholeEngineAuditPath = path.join(reportsDir, "whole-engine-audit.json");
  const engineValueLedgerPath = path.join(reportsDir, "engine-value-ledger.json");
  const markdownPath = path.join(reportsDir, "whole-engine-audit.md");

  fs.writeFileSync(wholeEngineAuditPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(engineValueLedgerPath, JSON.stringify(ledger, null, 2));
  fs.writeFileSync(markdownPath, markdown);

  return {
    wholeEngineAuditPath,
    engineValueLedgerPath,
    markdownPath,
    report,
    ledger,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = writeWholeEngineAuditReports();
  console.log(
    JSON.stringify(
      {
        wholeEngineAuditPath: displayPath(result.wholeEngineAuditPath),
        engineValueLedgerPath: displayPath(result.engineValueLedgerPath),
        markdownPath: displayPath(result.markdownPath),
        status: result.report.status,
        summary: result.report.summary,
      },
      null,
      2
    )
  );
  if (result.report.status === "FAIL") process.exitCode = 1;
}
