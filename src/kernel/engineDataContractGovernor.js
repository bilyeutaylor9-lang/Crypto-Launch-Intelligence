import { getEngineContracts } from "./engineContractManifest.js";
import { canonicalValue } from "../data/canonicalAliasResolver.js";
import { canonicalFieldForAlias } from "../data/canonicalFieldAliasRegistry.js";
import { evaluateEngineDataReadiness } from "../engines/engineDataReadinessEngine.js";

const CONTRACT_CACHE = new Map();
const CONTRACT_MISSING_FIELDS_LIMIT = 8;
const PROJECT_AUDIT_LIMIT = 80;

function normalizeKey(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function hasOwn(project = {}, field = "") {
  return Object.prototype.hasOwnProperty.call(project, field);
}

function getPath(project = {}, path = "") {
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((value, part) => (value && value[part] !== undefined ? value[part] : undefined), project);
}

export function hasMeasuredValue(project = {}, field = "") {
  const value = field.includes(".") ? getPath(project, field) : project[field];
  if (!field.includes(".") && !hasOwn(project, field)) {
    const canonicalField = canonicalFieldForAlias(field) || field;
    const resolved = canonicalValue(project, canonicalField, { disableSemanticScan: true });
    if (resolved !== undefined && resolved !== null && resolved !== "") return true;
    return false;
  }
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

export function findEngineContractForName(name = "", options = {}) {
  if (options.contract) return options.contract;
  const contracts = options.contracts || getEngineContracts();
  const key = normalizeKey(name);
  if (!key) return null;
  if (CONTRACT_CACHE.has(key)) return CONTRACT_CACHE.get(key);

  const contract =
    contracts.find((item) => normalizeKey(item.displayName || item.name || item.id) === key) ||
    contracts.find((item) => key.includes(normalizeKey(item.id)) || normalizeKey(item.id).includes(key)) ||
    null;

  CONTRACT_CACHE.set(key, contract);
  return contract;
}

function evaluateRequiredAny(project = {}, requiredAny = []) {
  const groups = (requiredAny || []).map((group) => {
    const fields = Array.isArray(group) ? group : [group].filter(Boolean);
    const present = fields.filter((field) => hasMeasuredValue(project, field));
    return {
      fields,
      present,
      missing: fields.filter((field) => !present.includes(field)),
      satisfied: present.length > 0,
    };
  });

  return {
    groups,
    missingGroups: groups.filter((group) => !group.satisfied),
  };
}

export function preflightEngineDataContract(name = "", projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const contract = findEngineContractForName(name, options);
  if (!contract) {
    return {
      engineName: name,
      engineId: null,
      status: "UNCONTRACTED",
      contractFound: false,
      projectsAnalyzed: safeProjects.length,
      readyProjects: 0,
      partialProjects: 0,
      starvedProjects: 0,
      averageCoveragePct: 0,
      topMissingInputs: [],
      nextSources: [],
      projectAudits: [],
    };
  }

  const audits = safeProjects.map((project) => evaluateEngineDataReadiness(project, contract));
  const countStatus = (status) => audits.filter((audit) => audit.status === status).length;
  const missingInputs = new Map();
  const sourceNeeds = new Map();

  for (const audit of audits) {
    for (const group of audit.missingRequiredGroups || []) {
      const key = group.fields.join(" or ");
      missingInputs.set(key, (missingInputs.get(key) || 0) + 1);
    }
    for (const source of audit.nextSources || []) {
      sourceNeeds.set(source, (sourceNeeds.get(source) || 0) + 1);
    }
  }

  const averageCoveragePct = audits.length
    ? Math.round(audits.reduce((sum, audit) => sum + (audit.coveragePct || 0), 0) / audits.length)
    : 0;
  const starvedProjects = countStatus("DATA_STARVED");
  const partialProjects = countStatus("PARTIAL_INPUTS");

  return {
    engineName: name,
    engineId: contract.id,
    scanRunId: options.scanRunId || null,
    phase: contract.phase,
    criticality: options.criticality || (contract.affectsFinalDecision || contract.canBlockCandidate ? "REQUIRED" : "OPTIONAL"),
    status:
      starvedProjects === 0 && partialProjects === 0
        ? "READY"
        : starvedProjects === audits.length
          ? "DATA_STARVED"
          : "PARTIAL_INPUTS",
    contractFound: true,
    projectsAnalyzed: safeProjects.length,
    readyProjects: countStatus("READY"),
    partialProjects,
    starvedProjects,
    averageCoveragePct,
    topMissingInputs: [...missingInputs.entries()]
      .map(([fields, count]) => ({ fields, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, CONTRACT_MISSING_FIELDS_LIMIT),
    nextSources: [...sourceNeeds.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, CONTRACT_MISSING_FIELDS_LIMIT),
    projectAudits: audits.slice(0, PROJECT_AUDIT_LIMIT).map((audit) => ({
      status: audit.status,
      coveragePct: audit.coveragePct,
      missingRequiredGroups: audit.missingRequiredGroups,
      nextSources: audit.nextSources,
    })),
  };
}

export function postflightEngineDataContract(name = "", projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const contract = findEngineContractForName(name, options);
  if (!contract) {
    return {
      engineName: name,
      engineId: null,
      status: "UNCONTRACTED",
      contractFound: false,
      projectsAnalyzed: safeProjects.length,
      outputReadyProjects: 0,
      outputMissingProjects: 0,
      invalidScoreProjects: 0,
      topMissingOutputs: [],
    };
  }

  const outputGroups = contract.outputContract?.requiredAny || [];
  const scoreFields = contract.outputContract?.scoreFields || [];
  const missingOutputCounts = new Map();
  let outputReadyProjects = 0;
  let invalidScoreProjects = 0;

  for (const project of safeProjects) {
    const required = evaluateRequiredAny(project, outputGroups);
    if (required.missingGroups.length === 0) {
      outputReadyProjects += 1;
    } else {
      for (const group of required.missingGroups) {
        const key = group.fields.join(" or ");
        missingOutputCounts.set(key, (missingOutputCounts.get(key) || 0) + 1);
      }
    }

    const invalidScores = scoreFields.filter((field) => {
      if (!hasMeasuredValue(project, field)) return false;
      const value = field.includes(".") ? getPath(project, field) : project[field];
      const parsed = Number(value);
      return !Number.isFinite(parsed) || parsed < 0 || parsed > 100;
    });
    if (invalidScores.length) invalidScoreProjects += 1;
  }

  const outputMissingProjects = Math.max(0, safeProjects.length - outputReadyProjects);
  const status =
    outputMissingProjects === 0 && invalidScoreProjects === 0
      ? "OUTPUT_READY"
      : outputReadyProjects > 0
        ? "OUTPUT_PARTIAL"
        : "OUTPUT_CONTRACT_MISMATCH";

  return {
    engineName: name,
    engineId: contract.id,
    scanRunId: options.scanRunId || null,
    phase: contract.phase,
    status,
    contractFound: true,
    projectsAnalyzed: safeProjects.length,
    outputReadyProjects,
    outputMissingProjects,
    invalidScoreProjects,
    topMissingOutputs: [...missingOutputCounts.entries()]
      .map(([fields, count]) => ({ fields, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, CONTRACT_MISSING_FIELDS_LIMIT),
  };
}

function appendBounded(existing = [], item = {}, limit = PROJECT_AUDIT_LIMIT) {
  return [...(Array.isArray(existing) ? existing : []), item].slice(-limit);
}

export function attachEngineDataContractAudit(projects = [], preflight = {}, postflight = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const auditRecord = {
    engineName: preflight.engineName || postflight.engineName,
    engineId: preflight.engineId || postflight.engineId,
    scanRunId: postflight.scanRunId || preflight.scanRunId || null,
    phase: preflight.phase || postflight.phase || null,
    inputStatus: preflight.status || "UNKNOWN",
    outputStatus: postflight.status || "UNKNOWN",
    inputCoveragePct: preflight.averageCoveragePct || 0,
    inputStarvedProjects: preflight.starvedProjects || 0,
    outputMissingProjects: postflight.outputMissingProjects || 0,
    invalidScoreProjects: postflight.invalidScoreProjects || 0,
    topMissingInputs: preflight.topMissingInputs || [],
    topMissingOutputs: postflight.topMissingOutputs || [],
    nextSources: preflight.nextSources || [],
  };

  return safeProjects.map((project) => {
    const existing = project.engineDataContractHealth || {};
    const engineContracts =
      existing.engines && typeof existing.engines === "object" ? { ...existing.engines } : {};
    const key = auditRecord.engineId || normalizeKey(auditRecord.engineName);
    engineContracts[key] = auditRecord;

    const inputStarved = Object.values(engineContracts).filter((item) => item.inputStatus === "DATA_STARVED").length;
    const outputMismatch = Object.values(engineContracts).filter((item) => item.outputStatus === "OUTPUT_CONTRACT_MISMATCH").length;
    const outputPartial = Object.values(engineContracts).filter((item) => item.outputStatus === "OUTPUT_PARTIAL").length;
    const missingSources = new Map();
    for (const item of Object.values(engineContracts)) {
      for (const source of item.nextSources || []) {
        const name = source.source || source;
        const count = source.count || 1;
        missingSources.set(name, (missingSources.get(name) || 0) + count);
      }
    }

    return {
      ...project,
      engineDataContractHealth: {
        status: outputMismatch ? "OUTPUT_CONTRACT_MISMATCH" : inputStarved ? "INPUT_DATA_STARVED" : outputPartial ? "OUTPUT_PARTIAL" : "PASS",
        enginesChecked: Object.keys(engineContracts).length,
        inputStarvedEngines: inputStarved,
        outputContractMismatchEngines: outputMismatch,
        outputPartialEngines: outputPartial,
        nextSourcesNeeded: [...missingSources.entries()]
          .map(([source, count]) => ({ source, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, CONTRACT_MISSING_FIELDS_LIMIT),
        engines: engineContracts,
        recentAudits: appendBounded(existing.recentAudits, auditRecord),
      },
    };
  });
}

export function summarizeEngineDataContractHealth(projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const engineMap = new Map();
  const sourceMap = new Map();
  const sourceObservations = new Set();
  let pass = 0;
  let inputStarved = 0;
  let outputMismatch = 0;
  let outputPartial = 0;

  for (const [projectIndex, project] of safeProjects.entries()) {
    const health = project.engineDataContractHealth || {};
    if (health.status === "PASS") pass += 1;
    if (health.status === "INPUT_DATA_STARVED") inputStarved += 1;
    if (health.status === "OUTPUT_CONTRACT_MISMATCH") outputMismatch += 1;
    if (health.status === "OUTPUT_PARTIAL") outputPartial += 1;

    for (const record of Object.values(health.engines || {})) {
      const key = record.engineId || record.engineName;
      const summary = engineMap.get(key) || {
        engineId: record.engineId,
        engineName: record.engineName,
        phase: record.phase,
        runs: 0,
        inputDataStarvedRuns: 0,
        outputMismatchRuns: 0,
        outputPartialRuns: 0,
        averageInputCoveragePct: 0,
        topMissingInputs: new Map(),
        topMissingOutputs: new Map(),
      };
      summary.runs += 1;
      summary.averageInputCoveragePct += record.inputCoveragePct || 0;
      if (record.inputStatus === "DATA_STARVED") summary.inputDataStarvedRuns += 1;
      if (record.outputStatus === "OUTPUT_CONTRACT_MISMATCH") summary.outputMismatchRuns += 1;
      if (record.outputStatus === "OUTPUT_PARTIAL") summary.outputPartialRuns += 1;
      for (const item of record.topMissingInputs || []) {
        summary.topMissingInputs.set(
          item.fields,
          Math.max(summary.topMissingInputs.get(item.fields) || 0, item.count || 1)
        );
      }
      for (const item of record.topMissingOutputs || []) {
        summary.topMissingOutputs.set(
          item.fields,
          Math.max(summary.topMissingOutputs.get(item.fields) || 0, item.count || 1)
        );
      }
      for (const source of record.nextSources || []) {
        const sourceName = source.source || source;
        const observationKey = `${project.canonicalProjectId || project.projectId || projectIndex}|${key}|${sourceName}`;
        if (sourceObservations.has(observationKey)) continue;
        sourceObservations.add(observationKey);
        sourceMap.set(sourceName, (sourceMap.get(sourceName) || 0) + 1);
      }
      engineMap.set(key, summary);
    }
  }

  const engines = [...engineMap.values()].map((item) => ({
    ...item,
    averageInputCoveragePct: item.runs ? Math.round(item.averageInputCoveragePct / item.runs) : 0,
    topMissingInputs: [...item.topMissingInputs.entries()]
      .map(([fields, count]) => ({ fields, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, CONTRACT_MISSING_FIELDS_LIMIT),
    topMissingOutputs: [...item.topMissingOutputs.entries()]
      .map(([fields, count]) => ({ fields, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, CONTRACT_MISSING_FIELDS_LIMIT),
  }));

  return {
    generatedAt: new Date().toISOString(),
    status: outputMismatch ? "OUTPUT_CONTRACT_GAPS" : inputStarved ? "INPUT_DATA_GAPS" : "PASS",
    projectsAnalyzed: safeProjects.length,
    projectsWithContractHealth: safeProjects.filter((project) => project.engineDataContractHealth).length,
    passProjects: pass,
    inputDataStarvedProjects: inputStarved,
    outputContractMismatchProjects: outputMismatch,
    outputPartialProjects: outputPartial,
    enginesChecked: engines.length,
    enginesWithInputGaps: engines.filter((item) => item.inputDataStarvedRuns > 0).length,
    enginesWithOutputGaps: engines.filter((item) => item.outputMismatchRuns > 0 || item.outputPartialRuns > 0).length,
    topEngineGaps: engines
      .filter((item) => item.inputDataStarvedRuns || item.outputMismatchRuns || item.outputPartialRuns)
      .sort((a, b) =>
        b.inputDataStarvedRuns + b.outputMismatchRuns + b.outputPartialRuns -
        (a.inputDataStarvedRuns + a.outputMismatchRuns + a.outputPartialRuns)
      )
      .slice(0, options.engineLimit || 30),
    topSourceNeeds: [...sourceMap.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, CONTRACT_MISSING_FIELDS_LIMIT),
    policy:
      "Every engine run is preflighted against declared input contracts and postflighted against declared output contracts. Missing evidence remains unknown, never zero.",
  };
}
