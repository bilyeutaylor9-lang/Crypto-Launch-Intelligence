const DEFAULT_REPORT_PROJECT_LIMIT = 0;
const DEFAULT_REPORT_ARRAY_LIMIT = 40;
const DEFAULT_REPORT_OBJECT_KEY_LIMIT = 80;
const DEFAULT_REPORT_STRING_LIMIT = 4_000;
const DEFAULT_REPORT_DEPTH_LIMIT = 5;
const DISCOVERY_SAMPLE_LIMIT = 50;

const HEAVY_FIELD_PATTERNS = [
  /^raw/i,
  /rawCandidate/i,
  /rawCandidates/i,
  /rawPayload/i,
  /providerPayload/i,
  /sourcePayload/i,
  /sourceResponse/i,
  /httpResponse/i,
  /html/i,
  /markdown/i,
  /crawlerText/i,
  /scrapedText/i,
  /documentText/i,
  /docsText/i,
  /websiteText/i,
  /pageText/i,
  /fullText/i,
  /transcript/i,
  /embedding/i,
  /vector/i,
  /debugRaw/i,
];

const IDENTITY_FIELDS = [
  "name",
  "symbol",
  "chain",
  "chainId",
  "tokenAddress",
  "contractAddress",
  "poolAddress",
  "pairAddress",
  "permanentProjectKey",
  "canonicalProjectId",
  "projectId",
  "source",
  "sources",
];

const DECISION_FIELDS = [
  "pipelineScore",
  "score",
  "opportunityScore",
  "riskScore",
  "finalSelectionState",
  "finalSelectionQualified",
  "finalIntegrityScore",
  "finalIntegrityVerdict",
  "finalBlockingReasons",
  "finalWarningReasons",
  "vNextScore",
  "vNextRank",
  "vNextSafetyState",
  "vNextRecommendation",
  "marketOpportunityRank",
  "marketOpportunityRankLevel",
  "progressiveOpportunityScore",
  "trustScore",
  "executionScore",
  "sniperScore",
  "sniperState",
  "smallCapHunterScore",
  "smallCapHunterSelected",
  "sevenDayTenXScore",
  "sevenDayTenXSelected",
  "preBreakoutRadarScore",
  "preBreakoutRadarState",
  "quantumOpportunityScore",
  "quantumOutcomeField",
  "quantumBrainScore",
  "quantumReasoningBrain",
  "quantumSuiteStatus",
  "quantumSuiteHealth",
];

const EVIDENCE_FIELDS = [
  "marketCap",
  "marketCapUsd",
  "circulatingMarketCapUsd",
  "liquidity",
  "liquidityUsd",
  "dexLiquidityUsd",
  "stableExitLiquidityUsd",
  "volume24h",
  "volume24hUsd",
  "price",
  "priceUsd",
  "priceChange24hPct",
  "holders",
  "holderCount",
  "uniqueBuyers24h",
  "buyers24h",
  "evidenceCoverageScore",
  "missingEvidenceCount",
  "dataConfidenceScore",
  "sourceTruthScore",
  "sourceReliabilityScore",
  "engineHealth",
  "engineResults",
];

const REPORT_PRIORITY_FIELDS = [...new Set([
  ...IDENTITY_FIELDS,
  ...DECISION_FIELDS,
  ...EVIDENCE_FIELDS,
])];

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function positiveIntegerFromEnv(name = "", fallback = 0) {
  const value = Math.floor(num(process.env[name]));
  return value > 0 ? value : fallback;
}

function reportLimits(options = {}) {
  return {
    projectLimit: options.projectLimit ?? positiveIntegerFromEnv("REPORT_PROJECT_LIMIT", DEFAULT_REPORT_PROJECT_LIMIT),
    arrayLimit: options.arrayLimit ?? positiveIntegerFromEnv("REPORT_ARRAY_LIMIT", DEFAULT_REPORT_ARRAY_LIMIT),
    objectKeyLimit: options.objectKeyLimit ?? positiveIntegerFromEnv("REPORT_OBJECT_KEY_LIMIT", DEFAULT_REPORT_OBJECT_KEY_LIMIT),
    stringLimit: options.stringLimit ?? positiveIntegerFromEnv("REPORT_STRING_LIMIT", DEFAULT_REPORT_STRING_LIMIT),
    depthLimit: options.depthLimit ?? positiveIntegerFromEnv("REPORT_DEPTH_LIMIT", DEFAULT_REPORT_DEPTH_LIMIT),
  };
}

function shouldOmitHeavyField(key = "") {
  return HEAVY_FIELD_PATTERNS.some((pattern) => pattern.test(String(key || "")));
}

function compactPrimitive(value, limits = {}) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length <= limits.stringLimit) return value;
    return `${value.slice(0, Math.max(0, limits.stringLimit - 24))}[truncated for report]`;
  }
  if (typeof value === "function" || typeof value === "symbol") return String(value);
  if (value instanceof Date) return value.toISOString();
  return undefined;
}

function orderedKeys(value = {}, topLevel = false, limits = {}) {
  const keys = Object.keys(value);
  if (!topLevel) return keys.slice(0, limits.objectKeyLimit);

  const priority = REPORT_PRIORITY_FIELDS.filter((key) => Object.hasOwn(value, key));
  const remaining = keys.filter((key) => !priority.includes(key));
  return [...priority, ...remaining].slice(0, limits.objectKeyLimit);
}

export function compactValueForReport(value, options = {}, state = null, depth = 0, key = "", topLevel = false) {
  const limits = state?.limits || reportLimits(options);
  if (shouldOmitHeavyField(key) && value !== null && value !== undefined) {
    if (typeof value === "string") {
      return { omittedFromReport: true, originalStringLength: value.length };
    }
    return Array.isArray(value)
      ? { omittedFromReport: true, originalItemCount: value.length }
      : { omittedFromReport: true, originalType: typeof value };
  }

  const primitive = compactPrimitive(value, limits);
  if (primitive !== undefined) return primitive;

  const localState = state || { limits, seen: new WeakSet() };
  if (depth >= limits.depthLimit) return "[nested data omitted from report]";
  if (localState.seen.has(value)) return "[repeated data omitted from report]";

  localState.seen.add(value);

  if (Array.isArray(value)) {
    const limit = Math.min(value.length, limits.arrayLimit);
    const compacted = value
      .slice(0, limit)
      .map((item) => compactValueForReport(item, options, localState, depth + 1, key));
    if (value.length > limit) {
      compacted.push(`[${value.length - limit} additional items omitted from report]`);
    }
    return compacted;
  }

  const output = {};
  for (const childKey of orderedKeys(value, topLevel, limits)) {
    output[childKey] = compactValueForReport(value[childKey], options, localState, depth + 1, childKey);
  }
  const omittedKeyCount = Object.keys(value).length - Object.keys(output).length;
  if (omittedKeyCount > 0) output.reportCompactionOmittedKeys = omittedKeyCount;
  return output;
}

export function compactProjectForReportWriters(project = {}, options = {}) {
  if (!project || typeof project !== "object") return {};
  if (project.reportCompaction?.mode === "bounded-project") return project;

  const compacted = compactValueForReport(project, options, null, 0, "", true);
  return {
    ...compacted,
    reportCompaction: {
      mode: "bounded-project",
      maxArrayItems: reportLimits(options).arrayLimit,
      maxStringChars: reportLimits(options).stringLimit,
    },
  };
}

export function compactProjectsForReportWriters(projects = [], options = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const limits = reportLimits(options);
  const limitedProjects =
    limits.projectLimit > 0 ? safeProjects.slice(0, limits.projectLimit) : safeProjects;

  return limitedProjects.map((project) => compactProjectForReportWriters(project, options));
}

function compactCandidateSample(candidates = []) {
  return (Array.isArray(candidates) ? candidates : [])
    .slice(0, DISCOVERY_SAMPLE_LIMIT)
    .map((candidate) => compactProjectForReportWriters(candidate, {
      arrayLimit: 12,
      objectKeyLimit: 35,
      stringLimit: 1_000,
      depthLimit: 3,
    }));
}

export function compactDiscoveryForReports(discovery = {}) {
  if (!discovery || typeof discovery !== "object" || Array.isArray(discovery)) return discovery;
  const coverage = discovery.discoveryCoverage || {};
  const frontier = discovery.discoveryFrontier || {};

  return {
    scannedAt: discovery.scannedAt,
    mode: discovery.mode,
    rawCount: discovery.rawCount || 0,
    dedupedCount: discovery.dedupedCount || 0,
    acceptedCount: discovery.acceptedCount || 0,
    acceptedBeforeLimitCount: discovery.acceptedBeforeLimitCount || 0,
    scanLimit: discovery.scanLimit,
    targetCandidates: discovery.targetCandidates,
    rejectedCount: discovery.rejectedCount || 0,
    candidateCount: Array.isArray(discovery.candidates) ? discovery.candidates.length : 0,
    shadowRejectedCandidateCount: Array.isArray(discovery.shadowRejectedCandidates)
      ? discovery.shadowRejectedCandidates.length
      : Array.isArray(coverage.shadowRejected)
        ? coverage.shadowRejected.length
        : 0,
    candidateSamples: compactCandidateSample(discovery.candidates),
    shadowRejectedSamples: compactCandidateSample(discovery.shadowRejectedCandidates || coverage.shadowRejected),
    providerHealth: discovery.providerHealth || {},
    freeMode: discovery.freeMode || {},
    wideConfig: discovery.wideConfig || {},
    targetCoverage: discovery.targetCoverage || {},
    candidateSelection: discovery.candidateSelection || {},
    qualityGate: discovery.qualityGate || {},
    sourceReports: compactValueForReport(discovery.sourceReports || {}, {
      arrayLimit: 40,
      objectKeyLimit: 120,
      stringLimit: 1_500,
      depthLimit: 5,
    }),
    sourceRouter: compactValueForReport(discovery.sourceRouter || {}, {
      arrayLimit: 40,
      objectKeyLimit: 120,
      stringLimit: 1_500,
      depthLimit: 5,
    }),
    sourceRouterReport: compactValueForReport(discovery.sourceRouterReport || {}, {
      arrayLimit: 40,
      objectKeyLimit: 120,
      stringLimit: 1_500,
      depthLimit: 5,
    }),
    sourceCapabilityAudit: compactValueForReport(discovery.sourceCapabilityAudit || {}, {
      arrayLimit: 60,
      objectKeyLimit: 140,
      stringLimit: 1_500,
      depthLimit: 5,
    }),
    sourceManifest: compactValueForReport(discovery.sourceManifest || {}, {
      arrayLimit: 60,
      objectKeyLimit: 140,
      stringLimit: 1_500,
      depthLimit: 5,
    }),
    discoveryCoverage: {
      ...compactValueForReport(coverage, {
        arrayLimit: 25,
        objectKeyLimit: 80,
        stringLimit: 1_000,
        depthLimit: 4,
      }),
      shadowRejected: undefined,
      shadowRejectedCount: Array.isArray(coverage.shadowRejected) ? coverage.shadowRejected.length : 0,
    },
    discoveryFrontier: {
      ...compactValueForReport(frontier, {
        arrayLimit: 80,
        objectKeyLimit: 120,
        stringLimit: 1_500,
        depthLimit: 5,
      }),
      criticalGaps: Array.isArray(frontier.criticalGaps) ? frontier.criticalGaps.slice(0, 50) : [],
      chains: Array.isArray(frontier.chains) ? frontier.chains.slice(0, 80) : [],
    },
    universeLedger: compactValueForReport(discovery.universeLedger || {}, {
      arrayLimit: 50,
      objectKeyLimit: 100,
      stringLimit: 1_500,
      depthLimit: 5,
    }),
    opModeReadiness: compactValueForReport(discovery.opModeReadiness || {}, {
      arrayLimit: 50,
      objectKeyLimit: 100,
      stringLimit: 1_500,
      depthLimit: 5,
    }),
  };
}

export function compactMetaForReportWriters(meta = {}) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return meta;
  const { discovery, ...rest } = meta;
  return {
    ...compactValueForReport(rest, {
      arrayLimit: 60,
      objectKeyLimit: 140,
      stringLimit: 2_000,
      depthLimit: 5,
    }),
    discovery: compactDiscoveryForReports(discovery),
  };
}
