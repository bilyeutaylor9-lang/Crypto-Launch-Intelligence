import { analyzeQuantumOutcomeField, normalizeScenarioCount } from "./quantumOutcomeFieldEngine.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function probability(value) {
  return finite(value) && Number(value) >= 0 && Number(value) <= 100;
}

function finiteIssues(value, path = "value", issues = []) {
  if (value === undefined) {
    issues.push(`${path} is undefined`);
    return issues;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    issues.push(`${path} is not finite`);
    return issues;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => finiteIssues(item, `${path}[${index}]`, issues));
    return issues;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, nested]) => finiteIssues(nested, `${path}.${key}`, issues));
  }
  return issues;
}

function validateOutcomeField(project = {}) {
  const field = project.quantumOutcomeField;
  const errors = [];
  if (!field) return ["missing quantumOutcomeField"];
  if (!Number.isInteger(Number(field.scenarioCount)) || Number(field.scenarioCount) <= 0) errors.push("scenarioCount must be a positive integer");
  for (const key of ["expectedReturnPct", "bestCaseReturnPct", "baseCaseReturnPct", "worstCaseReturnPct"]) {
    if (!finite(field[key])) errors.push(`${key} must be finite`);
  }
  for (const key of ["positiveProbability", "doubleProbability", "collapseProbability"]) {
    if (!probability(field[key])) errors.push(`${key} must be between 0 and 100`);
  }
  errors.push(...finiteIssues(field, "quantumOutcomeField"));
  return [...new Set(errors)];
}

function validateReasoningBrain(project = {}) {
  const brain = project.quantumReasoningBrain;
  const errors = [];
  if (!brain) return ["missing quantumReasoningBrain"];
  const probabilities = brain.probabilities || {};
  const total = Object.values(probabilities).reduce((sum, value) => sum + num(value), 0);
  for (const key of ["bull", "base", "bear", "blackSwan"]) {
    if (!probability(probabilities[key])) errors.push(`${key} probability must be between 0 and 100`);
  }
  if (total !== 100) errors.push(`probabilities total ${total}, expected 100`);
  if (!finite(brain.score)) errors.push("quantum reasoning score must be finite");
  if (!finite(brain.entropyScore)) errors.push("entropyScore must be finite");
  errors.push(...finiteIssues(brain, "quantumReasoningBrain"));
  return [...new Set(errors)];
}

function deterministicOutcomeCheck(project = {}) {
  if (!project.quantumOutcomeField) return { status: "SKIPPED", reason: "missing quantumOutcomeField" };
  const scenarios = normalizeScenarioCount(project.quantumOutcomeField.scenarioCount, 2048);
  const first = analyzeQuantumOutcomeField(project, { scenarios }).quantumOutcomeField;
  const second = analyzeQuantumOutcomeField(project, { scenarios }).quantumOutcomeField;
  const same = JSON.stringify(first) === JSON.stringify(second);
  return {
    status: same ? "PASS" : "FAIL",
    scenarioCount: scenarios,
    reason: same ? "Identical inputs produced identical outcome fields." : "Identical inputs produced different outcome fields.",
  };
}

function compactField(project = {}, index = 0) {
  return {
    rank: index + 1,
    symbol: project.symbol || "UNKNOWN",
    name: project.name || "Unknown",
    chain: project.chain || "unknown",
    score: project.quantumOpportunityScore || 0,
    fieldState: project.quantumOutcomeField?.fieldState || "Unknown",
    expectedReturnPct: project.quantumOutcomeField?.expectedReturnPct || 0,
    bestCaseReturnPct: project.quantumOutcomeField?.bestCaseReturnPct || 0,
    baseCaseReturnPct: project.quantumOutcomeField?.baseCaseReturnPct || 0,
    worstCaseReturnPct: project.quantumOutcomeField?.worstCaseReturnPct || 0,
    positiveProbability: project.quantumOutcomeField?.positiveProbability || 0,
    doubleProbability: project.quantumOutcomeField?.doubleProbability || 0,
    collapseProbability: project.quantumOutcomeField?.collapseProbability || 0,
  };
}

function compactBrain(project = {}, index = 0) {
  return {
    rank: index + 1,
    symbol: project.symbol || "UNKNOWN",
    name: project.name || "Unknown",
    chain: project.chain || "unknown",
    score: project.quantumBrainScore || 0,
    decisionState: project.quantumReasoningBrain?.decisionState || "Unknown",
    probabilities: project.quantumReasoningBrain?.probabilities || {},
    entropyScore: project.quantumReasoningBrain?.entropyScore || 0,
    entropy: project.quantumReasoningBrain?.entropy || "Unknown",
  };
}

export function summarizeQuantumSuiteHealth(projects = []) {
  const safe = Array.isArray(projects) ? projects : [];
  const invalidOutcomeFields = safe
    .map((project) => ({ project, errors: validateOutcomeField(project) }))
    .filter((item) => item.errors.length);
  const invalidReasoningBrains = safe
    .map((project) => ({ project, errors: validateReasoningBrain(project) }))
    .filter((item) => item.errors.length);
  const deterministicChecks = safe.slice(0, 10).map((project) => ({
    symbol: project.symbol || "UNKNOWN",
    ...deterministicOutcomeCheck(project),
  }));
  const deterministicFailures = deterministicChecks.filter((item) => item.status === "FAIL");
  const outcomeFieldsCompleted = safe.filter((project) => project.quantumOutcomeField).length;
  const reasoningBrainsCompleted = safe.filter((project) => project.quantumReasoningBrain).length;
  const averageInputCoverage = Math.round(((outcomeFieldsCompleted + reasoningBrainsCompleted) / Math.max(1, safe.length * 2)) * 100);
  const errors = [
    ...invalidOutcomeFields.flatMap((item) => item.errors.map((error) => `${item.project.symbol || item.project.name || "UNKNOWN"}: ${error}`)),
    ...invalidReasoningBrains.flatMap((item) => item.errors.map((error) => `${item.project.symbol || item.project.name || "UNKNOWN"}: ${error}`)),
    ...deterministicFailures.map((item) => `${item.symbol}: deterministic check failed`),
  ];
  const warnings = [
    ...(outcomeFieldsCompleted < safe.length ? [`${safe.length - outcomeFieldsCompleted} projects are missing quantum outcome fields.`] : []),
    ...(reasoningBrainsCompleted < safe.length ? [`${safe.length - reasoningBrainsCompleted} projects are missing quantum reasoning brains.`] : []),
  ];
  const status = errors.length ? "FAIL" : warnings.length ? "PARTIAL" : "PASS";

  return {
    generatedAt: new Date().toISOString(),
    status,
    projectsExpected: safe.length,
    outcomeFieldsCompleted,
    reasoningBrainsCompleted,
    invalidOutcomeFields: invalidOutcomeFields.map((item) => ({
      symbol: item.project.symbol || "UNKNOWN",
      errors: item.errors,
    })),
    invalidReasoningBrains: invalidReasoningBrains.map((item) => ({
      symbol: item.project.symbol || "UNKNOWN",
      errors: item.errors,
    })),
    averageInputCoverage,
    topQuantumFields: [...safe]
      .filter((project) => project.quantumOutcomeField)
      .sort((a, b) => num(b.quantumOpportunityScore) - num(a.quantumOpportunityScore))
      .slice(0, 25)
      .map(compactField),
    topQuantumReasoningStates: [...safe]
      .filter((project) => project.quantumReasoningBrain)
      .sort((a, b) => num(b.quantumBrainScore) - num(a.quantumBrainScore))
      .slice(0, 25)
      .map(compactBrain),
    deterministicChecks,
    errors,
    warnings,
  };
}

export function analyzeQuantumSuiteHealthBatch(projects = []) {
  const health = summarizeQuantumSuiteHealth(projects);
  return (Array.isArray(projects) ? projects : []).map((project) => ({
    ...project,
    quantumSuiteHealth: health,
    quantumSuiteStatus: health.status,
  }));
}
