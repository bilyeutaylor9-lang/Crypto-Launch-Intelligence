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

export function buildPipelineStageHealth(projects = [], options = {}) {
  const safe = Array.isArray(projects) ? projects : [];
  const engineResults = safe[0]?.engineResults || {};
  const byName = engineDependencyByName();
  const observedRecords = Object.values(engineResults).map((record) => ({
    ...record,
    manifest: byName.get(record.engineName) || null,
  }));
  const manifestRecords = ENGINE_DEPENDENCY_MANIFEST.map((manifest) => {
    const key = engineKey(manifest.name);
    const observed = engineResults[key] || observedRecords.find((record) => record.engineName === manifest.name);
    return {
      engineName: manifest.name,
      engineStatus: observed ? mapStatus(observed.status) : "SKIPPED",
      projectsReceived: safe.length,
      projectsProcessed: observed ? safe.length : 0,
      projectsSucceeded: observed && observed.status === "SUCCESS" ? safe.length : 0,
      projectsFailed: observed && observed.status === "FAILED" ? safe.length : 0,
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
