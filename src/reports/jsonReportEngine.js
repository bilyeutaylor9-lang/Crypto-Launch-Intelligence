import fs from "fs";
import path from "path";

const DEFAULT_MAX_TOTAL_PROJECT_PAYLOAD_CHARS = 32_000_000;
const DEFAULT_MAX_PROJECT_PAYLOAD_CHARS = 64_000;
const DEFAULT_MIN_PROJECT_PAYLOAD_CHARS = 2_048;
const STREAM_COPY_BUFFER_BYTES = 64 * 1024;

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
  "legacyScore",
  "legacyRank",
  "vNextScore",
  "vNextRank",
  "vNextBuyRank",
  "vNextRecommendation",
  "recommendationDifference",
  "reasonForDifference",
  "vNextProjectCategory",
  "vNextMarketStage",
  "vNextSafetyState",
  "vNextBuyEligible",
  "evidenceCoverageScore",
  "missingEvidenceCount",
  "staleEvidenceCount",
  "failedEngineCount",
  "uncertaintyScore",
  "alphaScore",
  "evidenceConfidenceMultiplier",
  "timingMultiplier",
  "executionMultiplier",
  "explicitRiskPenalty",
  "finalVNextScore",
  "marketOpportunityRank",
  "marketOpportunityRankLevel",
  "marketOpportunityRankDrivers",
  "marketOpportunityLearningScore",
  "marketOpportunityLearningConfidence",
  "marketOpportunityLearningAdjustment",
  "learnedMarketOpportunityRank",
  "marketOpportunityLearningHints",
  "timeHorizonScores",
  "recommendedHorizon",
  "opportunityLane",
  "opportunityEvidenceRecord",
  "progressiveOpportunityScore",
  "trustScore",
  "executionScore",
  "moneyRankScore",
  "moneyRank",
  "moneyRankEligible",
  "executableTradeSizeUsd",
  "executionTradeSizeChecks",
  "opportunityRankingTier",
  "bestAvailableRank",
  "opportunityConfidence",
  "opportunityEvidenceCoverage",
  "missingEvidence",
  "opportunityHardBlockers",
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
  "localAIExecutionStatus",
  "localAISelectionReason",
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
  "sevenDayTenXScore",
  "sevenDayTenXSelected",
  "sevenDayTenXSelectionRank",
  "sevenDayTenXWatchRank",
  "sevenDayTenXVerdict",
  "sevenDayTenXConfidence",
  "sevenDayTenXModeledScenarioPct",
];

function countItems(value) {
  return Array.isArray(value) ? value.length : 0;
}

function configuredPositiveInteger(names = [], fallback = 0) {
  const candidates = Array.isArray(names) ? names : [names];
  for (const name of candidates) {
    const value = Number.parseInt(process.env[name] || "", 10);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
}

function reportPayloadLimits() {
  return {
    maxTotalProjectPayloadChars: configuredPositiveInteger(
      ["REPORT_MAX_TOTAL_PROJECT_PAYLOAD_CHARS", "MAX_TOTAL_PROJECT_PAYLOAD_CHARS"],
      DEFAULT_MAX_TOTAL_PROJECT_PAYLOAD_CHARS
    ),
    maxProjectPayloadChars: configuredPositiveInteger(
      ["REPORT_MAX_PROJECT_PAYLOAD_CHARS", "MAX_PROJECT_PAYLOAD_CHARS"],
      DEFAULT_MAX_PROJECT_PAYLOAD_CHARS
    ),
    minProjectPayloadChars: configuredPositiveInteger(
      ["REPORT_MIN_PROJECT_PAYLOAD_CHARS", "MIN_PROJECT_PAYLOAD_CHARS"],
      DEFAULT_MIN_PROJECT_PAYLOAD_CHARS
    ),
  };
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
  const limits = reportPayloadLimits();
  const budgetChars = Math.max(
    limits.minProjectPayloadChars,
    Math.min(
      limits.maxProjectPayloadChars,
      Math.floor(limits.maxTotalProjectPayloadChars / Math.max(1, safeProjects.length))
    )
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

function temporaryReportPath(filePath = "", suffix = "tmp") {
  const directory = path.dirname(filePath);
  const baseName = path.basename(filePath);
  return path.join(directory, `.${baseName}.${process.pid}.${Date.now()}.${suffix}`);
}

function cleanupTempFile(filePath = "") {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // Best-effort cleanup only; the atomic report write should not fail because
    // a previous diagnostic temp file was already removed by the OS or runner.
  }
}

function copyFileContentsSync(sourcePath = "", destinationFd = null) {
  const sourceFd = fs.openSync(sourcePath, "r");
  const buffer = Buffer.allocUnsafe(STREAM_COPY_BUFFER_BYTES);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(sourceFd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) fs.writeSync(destinationFd, buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(sourceFd);
  }
}

function writeCompactedProjectsTemp(projects = [], filePath = "") {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const limits = reportPayloadLimits();
  const budgetChars = Math.max(
    limits.minProjectPayloadChars,
    Math.min(
      limits.maxProjectPayloadChars,
      Math.floor(limits.maxTotalProjectPayloadChars / Math.max(1, safeProjects.length))
    )
  );
  const tempProjectsPath = temporaryReportPath(filePath, "projects.tmp");
  let truncatedProjects = 0;
  const fd = fs.openSync(tempProjectsPath, "w");

  try {
    fs.writeSync(fd, "[");
    safeProjects.forEach((project, index) => {
      const compacted = compactProject(project, budgetChars);
      if (compacted.truncated) truncatedProjects += 1;
      if (index > 0) fs.writeSync(fd, ",");
      fs.writeSync(fd, "\n");
      fs.writeSync(fd, JSON.stringify(compacted.value));
    });
    if (safeProjects.length) fs.writeSync(fd, "\n");
    fs.writeSync(fd, "]");
  } finally {
    fs.closeSync(fd);
  }

  return {
    tempProjectsPath,
    serialization: {
      rawProjectCount: safeProjects.length,
      projectPayloadCharacterLimit: budgetChars,
      totalProjectPayloadCharacterLimit: limits.maxTotalProjectPayloadChars,
      truncatedProjects,
      streamingMode: "temp-file-atomic-stream",
    },
  };
}

function writeReportEnvelope({ filePath = "", projectsPath = "", reportHeader = {} } = {}) {
  const tempReportPath = temporaryReportPath(filePath, "report.tmp");
  const fd = fs.openSync(tempReportPath, "w");

  try {
    fs.writeSync(fd, "{\n");
    fs.writeSync(fd, `"generatedAt": ${JSON.stringify(reportHeader.generatedAt)},\n`);
    fs.writeSync(fd, `"totalProjects": ${JSON.stringify(reportHeader.totalProjects)},\n`);
    fs.writeSync(fd, `"meta": ${JSON.stringify(reportHeader.meta, null, 2)},\n`);
    fs.writeSync(fd, `"projects": `);
    copyFileContentsSync(projectsPath, fd);
    fs.writeSync(fd, "\n}\n");
  } catch (error) {
    fs.closeSync(fd);
    cleanupTempFile(tempReportPath);
    throw error;
  }

  fs.closeSync(fd);
  fs.renameSync(tempReportPath, filePath);
  return filePath;
}

function summarizeDiscovery(discovery = {}) {
  if (!discovery || typeof discovery !== "object" || Array.isArray(discovery)) {
    return discovery;
  }

  // A wide discovery run can contain tens of thousands of raw candidates. Those
  // belong in the universe ledger, not inside every final report artifact.
  const coverage = discovery.discoveryCoverage || {};
  const ledger = discovery.universeLedger || {};
  const frontier = discovery.discoveryFrontier || {};

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
    discoveryFrontier: {
      targetChainCount: frontier.targetChainCount || 0,
      observedChainCount: frontier.observedChainCount || 0,
      scopeCoveragePct: frontier.scopeCoveragePct || 0,
      nativeProtocolCoverage: frontier.nativeProtocolCoverage || {},
      criticalGapCount: frontier.criticalGapCount || 0,
      criticalGaps: Array.isArray(frontier.criticalGaps) ? frontier.criticalGaps.slice(0, 25) : [],
      chains: Array.isArray(frontier.chains)
        ? frontier.chains.map((chain) => ({
            chain: chain.chain,
            state: chain.state,
            coverageScore: chain.coverageScore,
            candidateCount: chain.candidateCount,
            uniqueIdentityCount: chain.uniqueIdentityCount,
            nativeCandidateCount: chain.nativeCandidateCount,
            observedSources: chain.observedSources || [],
            failedSources: chain.failedSources || [],
            nativeProtocolCoverage: chain.nativeProtocolCoverage || {},
          }))
        : [],
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
  const {
    reportsDir: requestedReportsDir,
    reportFileName = "report.json",
    ...reportMeta
  } = meta || {};
  const reportsDir = path.resolve(requestedReportsDir || "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const filePath = path.join(reportsDir, reportFileName);
  const streamedProjects = writeCompactedProjectsTemp(projects, filePath);

  try {
    writeReportEnvelope({
      filePath,
      projectsPath: streamedProjects.tempProjectsPath,
      reportHeader: {
        generatedAt: new Date().toISOString(),
        totalProjects: Array.isArray(projects) ? projects.length : 0,
        meta: {
          ...summarizeMeta(reportMeta),
          reportSerialization: streamedProjects.serialization,
        },
      },
    });
  } finally {
    cleanupTempFile(streamedProjects.tempProjectsPath);
    cleanupTempFile(temporaryReportPath(filePath, "report.tmp"));
  }

  return filePath;
}
