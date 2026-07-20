import fs from "fs";
import path from "path";

function ensureReportsDir() {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  return reportsDir;
}

function writeJson(fileName = "", payload = {}) {
  const filePath = path.join(ensureReportsDir(), fileName);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
  return filePath;
}

function meta(projects = [], extra = {}) {
  return {
    generatedAt: new Date().toISOString(),
    scanRunId: extra.scanRunId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: extra.codeCommitSha || process.env.GITHUB_SHA || null,
    dataCutoffTimestamp: extra.dataCutoffTimestamp || new Date().toISOString(),
    projectsAnalyzed: projects.length,
    status: projects.length ? "PASS" : "NO_PROJECTS",
    warnings: [],
    limitations: [
      "Root-cause reports diagnose evidence availability and pipeline health; they do not qualify projects as buys.",
      "Provider outages and rate limits may be environmental and should be rechecked before changing scoring policy.",
    ],
    sampleSize: projects.length,
  };
}

function compactProject(project = {}) {
  return {
    symbol: project.symbol || "UNKNOWN",
    name: project.name || "Unknown",
    chain: project.chain || project.canonicalAliases?.chain || null,
    marketCap: project.circulatingMarketCapUsd ?? project.marketCap ?? null,
    liquidity: project.liquidityUsd ?? project.dexLiquidityUsd ?? null,
    status: project.dataStarvationStatus || "UNKNOWN",
    rootCauses: project.dataStarvationRootCauses || {},
    blockingResearch: project.dataStarvationBlockingResearchCount || 0,
    blockingExecution: project.dataStarvationBlockingExecutionCount || 0,
    topMissingEvidence: (project.dataStarvationMissingEvidence || []).slice(0, 10),
  };
}

function countBy(projects = [], getter = () => "unknown") {
  return projects.reduce((acc, project) => {
    const key = getter(project) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function countMissingBy(projects = [], getter = () => "unknown") {
  const counts = {};
  for (const project of projects) {
    for (const item of project.dataStarvationMissingEvidence || []) {
      const key = getter(item, project) || "unknown";
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

export function summarizeDataStarvation(projects = []) {
  const byRootCause = countMissingBy(projects, (item) => item.rootCause);
  return {
    ...meta(projects, {
      status: byRootCause.length ? "GAPS_FOUND" : "PASS",
    }),
    status: byRootCause.length ? "GAPS_FOUND" : "PASS",
    totalsByRootCause: Object.fromEntries(byRootCause.map((item) => [item.key, item.count])),
    externalDataMissing: byRootCause.filter((item) => ["RAW_SOURCE_MISSING", "PROVIDER_UNAVAILABLE", "PROVIDER_RATE_LIMITED", "REGION_RESTRICTED"].includes(item.key)).reduce((sum, item) => sum + item.count, 0),
    enrichmentDeferred: byRootCause.find((item) => item.key === "ENRICHMENT_DEFERRED")?.count || 0,
    pipelineOutputMissing: byRootCause.find((item) => item.key === "PIPELINE_OUTPUT_MISSING")?.count || 0,
    notApplicable: byRootCause.find((item) => item.key === "NOT_APPLICABLE")?.count || 0,
    aliasFailures: byRootCause.find((item) => item.key === "ALIAS_MAPPING_FAILURE")?.count || 0,
    conflictedData: byRootCause.find((item) => item.key === "CONFLICTED_DATA")?.count || 0,
    topProjects: projects
      .slice()
      .sort((a, b) => (b.dataStarvationBlockingResearchCount || 0) - (a.dataStarvationBlockingResearchCount || 0))
      .slice(0, 100)
      .map(compactProject),
  };
}

export function writeDataStarvationRootCauseReports(projects = [], extra = {}) {
  const root = summarizeDataStarvation(projects);
  const rootPath = writeJson("data-starvation-root-cause.json", { ...root, ...extra });
  const byChainPath = writeJson("data-starvation-by-chain.json", {
    ...meta(projects, extra),
    byChain: countBy(projects, (project) => project.chain || project.canonicalAliases?.chain || "unknown"),
    missingByChainAndRootCause: countMissingBy(projects, (item, project) => `${project.chain || project.canonicalAliases?.chain || "unknown"}:${item.rootCause}`),
  });
  const byProviderPath = writeJson("data-starvation-by-provider.json", {
    ...meta(projects, extra),
    missingByProvider: countMissingBy(projects, (item) => item.providerStatus || item.expectedSource || "unknown"),
  });
  const byEnginePath = writeJson("data-starvation-by-engine.json", {
    ...meta(projects, extra),
    missingByEngine: countMissingBy(projects, (item) => item.producingEngine || "unknown"),
  });
  const byFieldPath = writeJson("data-starvation-by-field.json", {
    ...meta(projects, extra),
    missingByField: countMissingBy(projects, (item) => item.canonicalField || item.field || "unknown"),
  });

  return {
    dataStarvationRootCausePath: rootPath,
    dataStarvationByChainPath: byChainPath,
    dataStarvationByProviderPath: byProviderPath,
    dataStarvationByEnginePath: byEnginePath,
    dataStarvationByFieldPath: byFieldPath,
    report: root,
  };
}
