import fs from "fs";
import path from "path";
import { canonicalFieldForAlias } from "../data/canonicalFieldAliasRegistry.js";
import { resolveCanonicalAliases } from "../data/canonicalAliasResolver.js";
import { canonicalProviderId } from "../data/providerVocabularyRegistry.js";
import { fuzzyAliasMatch } from "../data/semanticAliasNormalizer.js";

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

function reportMeta(projects = [], extra = {}) {
  return {
    generatedAt: new Date().toISOString(),
    scanRunId: extra.scanRunId || process.env.GITHUB_RUN_ID || null,
    codeCommitSha: extra.codeCommitSha || process.env.GITHUB_SHA || null,
    dataCutoffTimestamp: extra.dataCutoffTimestamp || new Date().toISOString(),
    projectsAnalyzed: projects.length,
    status: "PASS",
    warnings: [],
    limitations: [
      "Alias reports explain schema normalization and evidence provenance; they do not qualify projects as investment recommendations.",
      "Semantic and fuzzy aliases are conservative and cannot override identity, chain, address, or execution validation.",
    ],
    sampleSize: projects.length,
  };
}

function flatten(object = {}, prefix = "", output = []) {
  if (!object || typeof object !== "object" || Array.isArray(object)) return output;
  for (const [key, value] of Object.entries(object)) {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, nextPath, output);
    else output.push({ path: nextPath, field: key, value });
  }
  return output;
}

function countBy(items = [], getter = () => "unknown") {
  return items.reduce((acc, item) => {
    const key = getter(item) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function entries(map = {}) {
  return Object.entries(map)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

function aliasType(record = {}) {
  return String(record.normalizationRule || "").split(":")[0] || "UNKNOWN";
}

function projectLabel(project = {}) {
  return `${project.symbol || project.name || project.projectId || "UNKNOWN"}:${project.chain || project.canonicalAliases?.chain || "unknown"}`;
}

export function summarizeAliasResolution(projects = []) {
  const resolvedRuns = projects.map((project) => ({
    project,
    resolution: project.aliasResolutionAudit ? { audits: project.aliasResolutionAudit, conflicts: project.canonicalAliasConflicts || {} } : resolveCanonicalAliases(project),
  }));
  const audits = resolvedRuns.flatMap((item) => item.resolution.audits || []);
  const valid = audits.filter((record) => record.validationStatus === "VALID" || record.validationStatus === "PARTIAL");
  const rejected = audits.filter((record) => record.validationStatus === "REJECTED_ALIAS" || record.validationStatus === "INVALID");
  const conflicts = resolvedRuns.flatMap(({ project, resolution }) =>
    Object.entries(resolution.conflicts || {}).flatMap(([field, fieldConflicts]) =>
      (fieldConflicts || []).map((conflict) => ({
        project: projectLabel(project),
        canonicalField: field,
        conflict,
      }))
    )
  );

  const unknownFields = [];
  for (const project of projects) {
    for (const raw of flatten(project)) {
      const canonical = canonicalFieldForAlias(raw.path) || canonicalFieldForAlias(raw.field);
      if (canonical) continue;
      const potential = ["liquidityUsd", "circulatingMarketCapUsd", "volume24hUsd", "uniqueBuyers24h", "holderCount"]
        .map((field) => ({ field, match: fuzzyAliasMatch(raw.field, field) }))
        .filter((item) => item.match.matched);
      unknownFields.push({
        project: projectLabel(project),
        path: raw.path,
        field: raw.field,
        sampleValue: typeof raw.value === "string" ? raw.value.slice(0, 120) : raw.value,
        potentialCanonicalFields: potential.map((item) => item.field),
      });
    }
  }

  const typeCounts = countBy(valid, aliasType);
  const providerCounts = countBy(audits, (record) => canonicalProviderId(record.sourceProvider || record.provider || "unknown"));
  const fieldCounts = countBy(valid, (record) => record.canonicalField);
  const rejectedByReason = countBy(rejected, (record) => record.validationReason || record.normalizationRule || "unknown");
  const recoveredProjects = projects.filter((project) =>
    (project.dataStarvationMissingEvidence || []).some((item) => item.rootCause === "ALIAS_MAPPING_FAILURE") &&
    (project.aliasResolutionSummary?.resolvedFields || 0) > 0
  );

  return {
    audits,
    valid,
    rejected,
    conflicts,
    unknownFields,
    typeCounts,
    providerCounts,
    fieldCounts,
    rejectedByReason,
    recoveredProjects,
  };
}

export function writeAliasResolutionReports(projects = [], extra = {}) {
  const meta = reportMeta(projects, extra);
  const summary = summarizeAliasResolution(projects);
  const summaryPath = writeJson("alias-resolution-summary.json", {
    ...meta,
    fieldsResolvedByExactAlias: summary.typeCounts.EXACT_ALIAS || 0,
    fieldsResolvedByProviderAlias: summary.typeCounts.PROVIDER_ALIAS || 0,
    fieldsResolvedByStructuralAlias: summary.typeCounts.STRUCTURAL_ALIAS || 0,
    fieldsResolvedBySemanticAlias: summary.typeCounts.SEMANTIC_ALIAS || 0,
    fieldsResolvedByFuzzyAlias: summary.typeCounts.FUZZY_ALIAS || 0,
    fieldsRejected: summary.rejected.length,
    conflictsDetected: summary.conflicts.length,
    projectsRecoveredFromAliasStarvation: summary.recoveredProjects.length,
    resolvedByField: entries(summary.fieldCounts).slice(0, 100),
    resolvedByProvider: entries(summary.providerCounts).slice(0, 100),
  });
  const conflictsPath = writeJson("alias-resolution-conflicts.json", {
    ...meta,
    status: summary.conflicts.length ? "CONFLICTS_FOUND" : "PASS",
    conflictsDetected: summary.conflicts.length,
    conflicts: summary.conflicts.slice(0, 500),
  });
  const providerCoveragePath = writeJson("provider-vocabulary-coverage.json", {
    ...meta,
    providerCoverage: entries(summary.providerCounts),
    topProviderSpecificFields: entries(countBy(summary.audits, (record) => `${record.sourceProvider || "unknown"}:${record.providerFieldName || record.sourceField || "unknown"}`)).slice(0, 200),
  });
  const unresolvedPath = writeJson("unresolved-field-verbiage.json", {
    ...meta,
    topUnknownFieldNames: entries(countBy(summary.unknownFields, (item) => item.field)).slice(0, 200),
    potentialNewAliases: summary.unknownFields.filter((item) => item.potentialCanonicalFields.length).slice(0, 200),
    examples: summary.unknownFields.slice(0, 200),
  });
  const rejectedPath = writeJson("rejected-alias-candidates.json", {
    ...meta,
    fieldsRejected: summary.rejected.length,
    rejectedByReason: entries(summary.rejectedByReason),
    rejected: summary.rejected.slice(0, 500),
  });
  const recoveriesPath = writeJson("alias-starvation-recoveries.json", {
    ...meta,
    projectsRecoveredFromAliasStarvation: summary.recoveredProjects.length,
    recoveredProjects: summary.recoveredProjects.slice(0, 200).map((project) => ({
      symbol: project.symbol || "UNKNOWN",
      chain: project.chain || project.canonicalAliases?.chain || null,
      resolvedFields: project.aliasResolutionSummary?.resolvedFields || 0,
      aliasFailures: (project.dataStarvationMissingEvidence || []).filter((item) => item.rootCause === "ALIAS_MAPPING_FAILURE").length,
      resolvedAliases: Object.keys(project.canonicalAliases || {}).filter((field) => project.canonicalAliases[field] !== null),
    })),
  });

  return {
    aliasResolutionSummaryPath: summaryPath,
    aliasResolutionConflictsPath: conflictsPath,
    providerVocabularyCoveragePath: providerCoveragePath,
    unresolvedFieldVerbiagePath: unresolvedPath,
    rejectedAliasCandidatesPath: rejectedPath,
    aliasStarvationRecoveriesPath: recoveriesPath,
    report: summary,
  };
}
