import { ENGINE_DEPENDENCY_MANIFEST, engineDependencyByName } from "../config/engineDependencyManifest.js";

function engineKey(name = "") {
  return String(name || "")
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[A-Z]/, (chr) => chr.toLowerCase());
}

function mapStatus(status = "") {
  if (status === "SUCCESS") return "PASS";
  if (status === "NO_DATA") return "SKIPPED";
  if (status === "PARTIAL") return "PARTIAL";
  if (status === "FAILED") return "FAILED";
  if (status === "STALE") return "DEGRADED";
  return status || "SKIPPED";
}

function outputCoverage(projects = [], producedFields = []) {
  if (!projects.length || !producedFields.length) return 0;
  const rowsWithOutput = projects.filter((project) =>
    producedFields.some((field) => project[field] !== undefined && project[field] !== null && project[field] !== "")
  ).length;
  return Math.round((rowsWithOutput / projects.length) * 100);
}

function inputCoverage(projects = [], requiredInputs = []) {
  if (!projects.length || !requiredInputs.length) return 100;
  const rowsWithInput = projects.filter((project) =>
    requiredInputs.some((input) => {
      const fields = String(input)
        .split(/\s+or\s+|,|\s+/)
        .map((field) => field.trim())
        .filter((field) => /^[a-zA-Z0-9_.]+$/.test(field));
      return fields.some((field) => field.split(".").reduce((value, part) => (value ? value[part] : undefined), project) !== undefined);
    })
  ).length;
  return Math.round((rowsWithInput / projects.length) * 100);
}

function collectObservedEngineResults(projects = []) {
  const byKey = new Map();
  for (const project of Array.isArray(projects) ? projects : []) {
    const engineResults = project?.engineResults || {};
    for (const [rawKey, rawRecord] of Object.entries(engineResults)) {
      if (!rawRecord || typeof rawRecord !== "object") continue;
      const normalizedKey = engineKey(rawRecord.engineName || rawKey);
      const current = byKey.get(normalizedKey) || {
        records: [],
        projectsProcessed: 0,
        projectsSucceeded: 0,
        projectsFailed: 0,
        projectsPartial: 0,
        projectsNoData: 0,
        durationMs: 0,
        failureReason: null,
      };
      current.records.push(rawRecord);
      current.projectsProcessed += 1;
      current.projectsSucceeded += rawRecord.status === "SUCCESS" ? 1 : 0;
      current.projectsFailed += rawRecord.status === "FAILED" ? 1 : 0;
      current.projectsPartial += rawRecord.status === "PARTIAL" ? 1 : 0;
      current.projectsNoData += rawRecord.status === "NO_DATA" ? 1 : 0;
      current.durationMs = Math.max(current.durationMs, Number(rawRecord.durationMs || 0));
      current.failureReason = current.failureReason || rawRecord.failureReason || null;
      byKey.set(normalizedKey, current);
    }
  }
  return byKey;
}

function collapsedEngineStatus(observed = null) {
  if (!observed?.records?.length) return "SKIPPED";
  if (observed.projectsFailed > 0) return "FAILED";
  if (observed.projectsPartial > 0) return "PARTIAL";
  if (observed.projectsSucceeded > 0) return "PASS";
  if (observed.projectsNoData > 0) return "SKIPPED";
  return mapStatus(observed.records[0]?.status);
}

export function buildPipelineStageHealth(projects = [], options = {}) {
  const safe = Array.isArray(projects) ? projects : [];
  const observedByKey = collectObservedEngineResults(safe);
  const byName = engineDependencyByName();
  const manifestRecords = ENGINE_DEPENDENCY_MANIFEST.map((manifest) => {
    const key = engineKey(manifest.name);
    const observed =
      observedByKey.get(key) ||
      observedByKey.get(engineKey(byName.get(manifest.name)?.name || ""));
    return {
      engineName: manifest.name,
      engineStatus: collapsedEngineStatus(observed),
      projectsReceived: safe.length,
      projectsProcessed: observed?.projectsProcessed || 0,
      projectsSucceeded: observed?.projectsSucceeded || 0,
      projectsFailed: observed?.projectsFailed || 0,
      inputCoveragePct: inputCoverage(safe, manifest.requiredInputs),
      outputCoveragePct: outputCoverage(safe, manifest.producedFields),
      durationMs: observed?.durationMs || 0,
      failureReason: observed?.failureReason || null,
      missingInputFamilies: [],
      mandatory: manifest.mandatory,
      checkpointGroup: manifest.checkpointGroup,
      requiredUpstreamStages: manifest.requiredUpstreamStages,
      failurePolicy: manifest.failurePolicy,
    };
  });
  const mandatoryFailures = manifestRecords.filter((record) =>
    record.mandatory && ["FAILED"].includes(record.engineStatus)
  );
  const skippedMandatory = manifestRecords.filter((record) =>
    record.mandatory && record.engineStatus === "SKIPPED" && options.allowSkippedMandatory !== true
  );

  return {
    generatedAt: new Date().toISOString(),
    status: mandatoryFailures.length ? "FAILED" : skippedMandatory.length ? "DEGRADED" : "PASS",
    pipelineStatus: mandatoryFailures.length ? "FAILED" : skippedMandatory.length ? "DEGRADED" : "PASS",
    projectsAnalyzed: safe.length,
    stagesDeclared: ENGINE_DEPENDENCY_MANIFEST.length,
    mandatoryStageFailures: mandatoryFailures.length,
    skippedMandatoryStages: skippedMandatory.map((record) => record.engineName),
    stages: manifestRecords,
    checkpointGroups: [...new Set(ENGINE_DEPENDENCY_MANIFEST.map((engine) => engine.checkpointGroup))],
  };
}
