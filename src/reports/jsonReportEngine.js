import fs from "fs";
import path from "path";

const MAX_TOTAL_PROJECT_PAYLOAD_CHARS = 96_000_000;
const MAX_PROJECT_PAYLOAD_CHARS = 64_000;
const MIN_PROJECT_PAYLOAD_CHARS = 2_048;

const REPORT_PRIORITY_FIELDS = [
  "name",
  "symbol",
  "chain",
  "chainId",
  "contractAddress",
  "tokenAddress",
  "pairAddress",
  "poolAddress",
  "permanentProjectKey",
  "finalSelectionState",
  "finalSelectionQualified",
  "finalIntegrityScore",
  "finalIntegrityVerdict",
  "finalBlockingReasons",
  "finalWarningReasons",
  "finalIdentityState",
  "identityVerified",
  "contractVerified",
  "chainVerified",
  "liquidityVerified",
  "purchaseRouteConfirmed",
  "executionRouteAvailable",
  "pipelineScore",
  "opportunityScore",
  "score",
  "confidenceAdjustedScore",
  "confidence",
  "tier",
  "riskScore",
  "sourceTruthScore",
  "sourceReliabilityScore",
  "dataConfidenceScore",
  "evidenceQualityScore",
  "localAIStatus",
  "localAIVerdict",
  "localAIResearchDecision",
  "localAIPromotionBlocked",
  "localAIDecisionReason",
  "localAIConfidence",
  "localAICoverage",
  "localAIAdjustment",
  "localAIInfluenceStatus",
  "localAIInfluenceReason",
  "sniperScore",
  "confidenceAdjustedSniperScore",
  "sniperState",
  "sniperQualified",
  "smallCapHunterScore",
  "smallCapHunterSelected",
];

function countItems(value) {
  return Array.isArray(value) ? value.length : 0;
}

function boundedNumber(value) {
  return Number.isFinite(value) ? value : String(value);
}

function prioritizedKeys(value, maxKeys, topLevel = false) {
  const keys = Object.keys(value);
  if (!topLevel) return keys.slice(0, maxKeys);

  const priority = REPORT_PRIORITY_FIELDS.filter((key) => Object.hasOwn(value, key));
  const remaining = keys.filter((key) => !priority.includes(key));
  return [...priority, ...remaining].slice(0, maxKeys);
}

function compactValue(value, state, depth = 0, topLevel = false) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") {
    const available = Math.max(0, state.remainingChars);
    if (value.length <= available) {
      state.remainingChars -= value.length;
      return value;
    }

    state.truncated = true;
    state.remainingChars = 0;
    return `${value.slice(0, Math.max(0, available - 22))}[truncated for report]`;
  }
  if (typeof value === "number") return boundedNumber(value);
  if (typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return String(value);
  if (value instanceof Date) return value.toISOString();

  if (state.remainingNodes <= 0 || depth >= state.maxDepth) {
    state.truncated = true;
    return "[nested data omitted from report]";
  }
  if (state.seen.has(value)) {
    state.truncated = true;
    return "[repeated data omitted from report]";
  }

  state.remainingNodes -= 1;
  state.seen.add(value);

  if (Array.isArray(value)) {
    const output = [];
    const maxItems = Math.min(state.maxArrayItems, value.length);
    for (let index = 0; index < maxItems; index += 1) {
      output.push(compactValue(value[index], state, depth + 1));
      if (state.remainingChars <= 0 || state.remainingNodes <= 0) break;
    }
    if (value.length > output.length) {
      state.truncated = true;
      output.push(`[${value.length - output.length} additional items omitted]`);
    }
    return output;
  }

  const output = {};
  const maxKeys = topLevel ? state.maxTopLevelKeys : state.maxObjectKeys;
  const keys = prioritizedKeys(value, maxKeys, topLevel);
  for (const key of keys) {
    output[key] = compactValue(value[key], state, depth + 1);
    if (state.remainingChars <= 0 || state.remainingNodes <= 0) break;
  }
  if (Object.keys(value).length > keys.length) state.truncated = true;
  return output;
}

function compactProject(project, budgetChars) {
  const state = {
    remainingChars: budgetChars,
    remainingNodes: Math.max(80, Math.floor(budgetChars / 50)),
    maxDepth: 5,
    maxArrayItems: budgetChars < 8_000 ? 12 : 40,
    maxObjectKeys: budgetChars < 8_000 ? 20 : 80,
    maxTopLevelKeys: Math.max(40, Math.min(600, Math.floor(budgetChars / 100))),
    seen: new WeakSet(),
    truncated: false,
  };
  const value = compactValue(project, state, 0, true);
  return { value, truncated: state.truncated };
}

function compactProjects(projects = []) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const budgetChars = Math.max(
    MIN_PROJECT_PAYLOAD_CHARS,
    Math.min(MAX_PROJECT_PAYLOAD_CHARS, Math.floor(MAX_TOTAL_PROJECT_PAYLOAD_CHARS / Math.max(1, safeProjects.length)))
  );
  let truncatedProjects = 0;

  const values = safeProjects.map((project) => {
    const compacted = compactProject(project, budgetChars);
    if (compacted.truncated) truncatedProjects += 1;
    return compacted.value;
  });

  return {
    projects: values,
    serialization: {
      rawProjectCount: safeProjects.length,
      projectPayloadCharacterLimit: budgetChars,
      truncatedProjects,
    },
  };
}

function summarizeDiscovery(discovery = {}) {
  if (!discovery || typeof discovery !== "object" || Array.isArray(discovery)) {
    return discovery;
  }

  // A wide discovery run can contain tens of thousands of raw candidates. Those
  // belong in the universe ledger, not inside every final report artifact.
  const coverage = discovery.discoveryCoverage || {};
  const ledger = discovery.universeLedger || {};

  return {
    scannedAt: discovery.scannedAt,
    mode: discovery.mode,
    rawCount: discovery.rawCount,
    dedupedCount: discovery.dedupedCount,
    acceptedCount: discovery.acceptedCount,
    acceptedBeforeLimitCount: discovery.acceptedBeforeLimitCount,
    scanLimit: discovery.scanLimit,
    targetCandidates: discovery.targetCandidates,
    candidateCount: countItems(discovery.candidates),
    shadowRejectedCandidateCount: countItems(discovery.shadowRejectedCandidates),
    rejectedCount: discovery.rejectedCount,
    providerHealth: discovery.providerHealth,
    freeMode: discovery.freeMode,
    wideConfig: discovery.wideConfig,
    targetCoverage: discovery.targetCoverage,
    candidateSelection: discovery.candidateSelection,
    qualityGate: discovery.qualityGate,
    sourceReports: discovery.sourceReports,
    sourceRouter: discovery.sourceRouter,
    sourceRouterReport: discovery.sourceRouterReport,
    discoveryCoverage: {
      rawCount: coverage.rawCount,
      dedupedCount: coverage.dedupedCount,
      acceptedCount: coverage.acceptedCount,
      rejectedCount: coverage.rejectedCount,
      limitedCount: coverage.limitedCount,
      shadowRejectedCount: countItems(coverage.shadowRejected),
    },
    universeLedger: {
      status: ledger.status,
      savedProjects: ledger.savedProjects,
      totals: ledger.totals,
      collisions: ledger.collisions,
    },
  };
}

function summarizeMeta(meta = {}) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return meta;

  const { discovery, ...rest } = meta;
  return discovery ? { ...rest, discovery: summarizeDiscovery(discovery) } : rest;
}

export function writeJsonReport(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const compactedProjects = compactProjects(projects);

  const report = {
    generatedAt: new Date().toISOString(),
    totalProjects: compactedProjects.projects.length,
    meta: {
      ...summarizeMeta(meta),
      reportSerialization: compactedProjects.serialization,
    },
    projects: compactedProjects.projects,
  };

  const filePath = path.join(reportsDir, "report.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return filePath;
}
