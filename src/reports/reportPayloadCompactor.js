const DEFAULT_REPORT_PROJECT_LIMIT = 0;
const DEFAULT_REPORT_ARRAY_LIMIT = 12;
const DEFAULT_REPORT_OBJECT_KEY_LIMIT = 80;
const DEFAULT_REPORT_STRING_LIMIT = 1_500;
const DEFAULT_REPORT_DEPTH_LIMIT = 4;
const DISCOVERY_SAMPLE_LIMIT = 50;
// These records are the observed recovery receipt, not a derived score. Keep
// them ahead of the broad derived-field catalog while retaining the existing
// finite object, array, string, and depth bounds below.
const RECOVERED_OBSERVATION_FIELDS = Object.freeze([
  "nativeLifecycle",
  "wallets",
  "walletTransactions",
  "walletParticipationHistory",
  "fieldProvenance",
]);

export const REPORT_FINAL_RISK_SCALAR_FIELDS = Object.freeze([
  "riskScore", "smallCapRiskScore", "economicIntegrityRiskScore", "activityAuthenticityRiskScore",
  "supplyIntegrityRiskScore", "deployerRiskScore", "walletClusterRiskScore", "washTradingRiskScore",
  "bundledLaunchRiskScore", "instantSafetyRiskScore", "organicDemandFirewallRisk",
  "trapRiskScore", "outcomeTrapRisk", "falsePositiveSimilarity", "finalRiskScore", "finalTrapRiskScore",
]);

// A finite scalar projection must precede wallet/provenance graphs in every writer.
export const REPORT_DECISION_SCALAR_FIELDS = Object.freeze([
  "name", "symbol", "chain", "chainId", "tokenAddress", "contractAddress", "poolAddress", "pairAddress",
  "tokenName", "dexName", "dex", "venue", "exchange", "routeType", "source", "provider",
  "sourceTimestamp", "observedAt", "scannedAt", "dataCutoffTimestamp",
  "pipelineScore", "score", "opportunityScore", "guardedLiveScore", "liveScore",
  ...REPORT_FINAL_RISK_SCALAR_FIELDS,
  "researchScore", "executionScore", "finalDecisionScore", "finalIdentityState", "identityVerificationScope",
  "finalSelectionState", "finalSelectionQualified", "finalIntegrityScore", "finalIntegrityVerdict",
  "liveActionStatus", "liveExecutionReady", "liveRankingModel", "liveRankingAuthoritative", "scoringPrimaryModel",
  "utilityQualityScore", "realUtilityScore", "realUtilityQualified", "utilityClassification", "memeOnlySpeculative",
  "legacyProductionScore", "legacyPipelineScore", "legacyFinalSelectionState", "legacyFinalSelectionQualified",
  "legacyFinalDecisionScore", "legacyFinalIntegrityScore", "legacyFinalIntegrityVerdict", "legacyFinalAuthorityEngine",
  "legacyFinalIntegritySource", "finalIntegrityPipelineScore", "finalIntegrityScoreSource", "finalAuthorityEngine",
]);

// Preserve the producer's finite state projection before any bulky graphs. This
// discloses missing evidence; it does not infer or upgrade any evidence state.
export const REPORT_EVIDENCE_STATE_FIELDS = Object.freeze([
  "deepEvaluationState", "finalSelectionState", "finalSelectionQualified",
  "coreEvidenceState", "engineDataReadinessStatus", "advisoryEvidenceState", "advisoryDataGaps",
  "coreEvidenceCoveragePct", "advisoryEvidenceCoveragePct", "coreDataStarved",
]);

export const REPORT_REQUIRED_PROJECT_FIELDS = Object.freeze([...new Set([
  ...REPORT_EVIDENCE_STATE_FIELDS,
  ...REPORT_DECISION_SCALAR_FIELDS,
  "signalProfile", "executionProof", "canonicalExecutionRoute",
])]);

const HEAVY_FIELD_PATTERNS = [
  /^raw$/i,
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
  /^engineResults$/i,
  /^evidence$/i,
  /^institutionalDataProvenance$/i,
];

function scalarReportFields(fields = []) {
  return Object.fromEntries(fields.map((field) => [field, true]));
}

const WALLET_EVENT_SCHEMA = scalarReportFields([
  "tokenAddress", "poolAddress", "chain", "signature", "transactionHash", "timestamp",
  "slot", "blockNumber", "logIndex", "accountAddress", "ownerAddress", "address", "from", "to",
  "direction", "role", "accountType", "tradeClassification", "participant", "smartWallet",
  "currentHoldingVerified", "tokenAmountBeforeRaw", "tokenAmountAfterRaw", "tokenDeltaRaw",
  "tokenAmountRaw", "tokenAmount", "decimals", "tokenProgram", "poolMovement", "volumeUsd",
  "estimatedCurrentValueUsd", "balanceRaw", "observedBlockNumber", "observedBlockTimestamp",
  "blockHash", "method", "source", "provider", "sourceTimestamp", "confidence", "verificationStatus",
]);

const WALLET_SAMPLE_SCHEMAS = {
  wallets: [true],
  holderAddresses: [true],
  walletTransactions: [WALLET_EVENT_SCHEMA],
  walletParticipationHistory: [WALLET_EVENT_SCHEMA],
  holderBalanceEvidence: [WALLET_EVENT_SCHEMA],
};
const WALLET_SAMPLE_FIELDS = Object.keys(WALLET_SAMPLE_SCHEMAS);
const WALLET_COVERAGE_SCHEMA = scalarReportFields([
  "sampled", "complete", "complete24h", "available", "status", "semantics", "observedSlot",
  "observedBlockTimestamp", "fromTimestamp", "toTimestamp", "fromBlock", "toBlock",
  "observedTransfers24h", "balanceProbeAttempts", "balanceResponsesReceived",
]);
const WALLET_METADATA_SCHEMA = {
  ...scalarReportFields([
    "chain", "tokenAddress", "poolAddress", "address", "exactTokenIdentity", "exactPoolIdentity",
    "provider", "source", "sourceProvider", "confidence", "verificationStatus", "validationStatus",
    "status", "observedAt", "sourceTimestamp", "timestamp", "sourceTimestampMeaning",
    "holderSampleOnly", "completeHolderCoverage", "buyerClassificationAvailable", "currentHoldingVerified",
    "identityVerifiedOnChain", "snapshotTimestampVerified", "providerReportDetectedAt",
    "holderAddressSemantics", "acquisitionMode", "recoveryRun", "genesisHash", "rpcEndpointId",
    "providerFailure", "providerFailureCode",
  ]),
  transferCoverage: WALLET_COVERAGE_SCHEMA,
  holderCoverage: WALLET_COVERAGE_SCHEMA,
  tradeCoverage: WALLET_COVERAGE_SCHEMA,
  warnings: [true],
  rpcEndpointAttempts: [scalarReportFields(["endpointId", "status", "providerFailure", "providerFailureCode"])],
};
const WALLET_PROOF_SCHEMA = {
  ...WALLET_METADATA_SCHEMA,
  ...WALLET_SAMPLE_SCHEMAS,
  ...scalarReportFields([
    "holderCount", "uniqueBuyers24h", "buyTransactions24h", "sellTransactions24h", "buyVolumeUsd",
    "sellVolumeUsd", "buyerAddresses", "sellerAddresses", "smartWallets", "trackedWallets",
    "smartWalletBuys24h", "smartWalletSells24h", "smartWalletBuyCount", "smartWalletSellCount",
    "smartWalletBuyVolumeUsd", "smartWalletSellVolumeUsd",
  ]),
};
const WALLET_REPORT_SCHEMAS = {
  ...WALLET_SAMPLE_SCHEMAS,
  blockscoutWalletEvidence: WALLET_PROOF_SCHEMA,
  rpcWalletEvidence: WALLET_PROOF_SCHEMA,
  solanaRpcWalletEvidence: WALLET_PROOF_SCHEMA,
};
const WALLET_ALIAS_METADATA_SCHEMA = scalarReportFields([
  "field", "canonicalField", "originalField", "originalPath", "sourceField", "sourcePath",
  "providerFieldName", "detectedAlias", "unitBefore", "unitAfter", "sourceUnit", "canonicalUnit",
  "conversionApplied", "normalizationRule", "validationReason", "conflictStatus", "parsedMarketPair",
]);
const WALLET_PROVENANCE_SCHEMAS = Object.fromEntries(WALLET_SAMPLE_FIELDS.map((field) => [field, {
  ...WALLET_METADATA_SCHEMA,
  ...WALLET_ALIAS_METADATA_SCHEMA,
  value: WALLET_SAMPLE_SCHEMAS[field],
  originalValue: WALLET_SAMPLE_SCHEMAS[field],
  rawValue: WALLET_SAMPLE_SCHEMAS[field],
  canonicalValue: WALLET_SAMPLE_SCHEMAS[field],
  resolvedValue: WALLET_SAMPLE_SCHEMAS[field],
  holderBalanceEvidence: WALLET_SAMPLE_SCHEMAS.holderBalanceEvidence,
  alternativesConsidered: [true],
  rejectedAlternatives: [true],
  conflicts: [{ ...WALLET_METADATA_SCHEMA, ...WALLET_ALIAS_METADATA_SCHEMA }],
}]));

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
  "canonicalId",
  "canonicalChainId",
  "canonicalProjectId",
  "tokenName",
  "dexName",
  "baseTokenAddress",
  "quoteTokenAddress",
  "lastVerifiedAt",
  "routeLastVerifiedAt",
  "provenance",
  "projectId",
  "source",
  "sources",
];

const DECISION_FIELDS = [
  "pipelineScore",
  "score",
  "opportunityScore",
  "guardedLiveScore",
  "explosionReadinessScore",
  "explosionReadinessState",
  "explosionReadinessCoverage",
  "explosionReadinessRankEligible",
  "explosionReadinessComponents",
  "explosionReadinessObservedDeltas",
  "explosionReadinessReasons",
  "explosionReadinessMissingEvidence",
  "explosionReadinessRiskPenalty",
  "explosionReadinessFakeVolumeConcern",
  "explosionReadinessHistoryCount",
  "explosionReadinessEvidenceFamilies",
  "liveScore",
  "liveRank",
  "liveActionStatus",
  "liveRankingModel",
  "liveRankingCoverage",
  "liveExecutionReady",
  "liveRankingAuthoritative",
  "liveRankingUnprovenCanary",
  "liveRankingDisplayEligible",
  "liveRankingUtilityEligible",
  "utilityQualityScore",
  "realUtilityScore",
  "utilityClassification",
  "realUtilityQualified",
  "utilityIdentityEligible",
  "memeOnlySpeculative",
  "memeSpeculationScore",
  "utilityEvidenceFamilies",
  "utilityQualityComponents",
  "utilityResearchWarnings",
  "liveRankingMissingEvidence",
  "liveRankingBlocks",
  "liveRankingGateReasons",
  "legacyProductionScore",
  "legacyPipelineScore",
  "legacyRank",
  "legacyFinalSelectionState",
  "legacyFinalBlockingReasons",
  "legacyFinalWarningReasons",
  "legacyFinalSelectionReasons",
  "scoringPrimaryModel",
  "microTestPlan",
  "riskScore",
  "finalSelectionState",
  "finalSelectionQualified",
  "finalIntegrityScore",
  "finalIntegrityVerdict",
  "finalBlockingReasons",
  "finalWarningReasons",
  "finalSelectionReasons",
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
  "highUpsideScalpScore",
  "highUpsideScalpLane",
  "highUpsideScalpQuarantineReason",
  "highUpsideScalpRouteVerificationStatus",
  "highUpsideScalpComponentScores",
  "highUpsideScalpComponentCoverage",
  "highUpsideScalpDataCoverage",
  "highUpsideScalpMissingFields",
  "highUpsideScalpClassificationReason",
  "highUpsideScalpDiagnostics",
  "preBreakoutRadarScore",
  "preBreakoutRadarState",
  "quantumOpportunityScore",
  "quantumOutcomeField",
  "quantumBrainScore",
  "quantumReasoningBrain",
  "quantumSuiteStatus",
  "quantumSuiteHealth",
  "strictIdentityVerified",
  "strictRouteVerified",
  "strictRankEligible",
  "strictCandidateLane",
  "candidateQuarantineReason",
  "candidateQuarantineReasons",
  "routeVerificationStatus",
  "marketBenchmarkLane",
  "nativeAssetVariant",
  "opportunityRankingTier",
  "progressiveLane",
  "fourLaneStatus",
  "capitalMigrationLane",
  "executionReadinessState",
  "tradabilityState",
  "researchEligibilityState",
  "projectLifecycleState",
  "deepEvaluationState",
  "progressivePipelineIdentityKey",
  "progressivePipelineStages",
  "progressiveStageRanks",
  "progressiveStageLanes",
  "progressiveExecutionState",
  "stageRank",
  "stageLane",
  "routeExecutionReadiness",
  "finalProjectExecutionReadiness",
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
  "sourceTruth",
  "sourceTruthStatus",
  "sourceTruthVerdict",
  "fieldProvenance",
  "canonicalAliasProvenance",
  ...Object.keys(WALLET_REPORT_SCHEMAS),
  "activeEvidenceRecovery",
  "activeEvidenceRecoveryStatus",
  "activeRecoveryStatus",
  "executionProof",
  "executionProofState",
  "executionProofRecovery",
  "executionProofRecoveryRoute",
  "executionProofRecoveryRoutes",
  "canonicalExecutionRoute",
  "executionRoutes",
  "engineDataReadiness",
  "engineDataContractHealth",
  "engineHealthStatus",
  "dataStarvationRootCause",
  "dataStarvationRootCauses",
  "dataStarvationPlan",
  "targetedEnrichmentPlan",
  "valueOfInformation",
  "valueOfInformationPlan",
  "starvationRescuePlan",
  "starvationRescueState",
];

const REPORT_PRIORITY_FIELDS = [...new Set([
  // Derived snapshots can share these objects; retain the authoritative roots first.
  ...REPORT_REQUIRED_PROJECT_FIELDS,
  "solanaMintAccountEvidence",
  ...EVIDENCE_FUNNEL_SNAPSHOT_PROJECT_FIELDS,
  ...RECOVERED_OBSERVATION_FIELDS,
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

function orderedKeys(value = {}, topLevel = false, limits = {}, parentKey = "") {
  const keys = Object.keys(value);
  if (!topLevel) return (parentKey === "signalProfile" && Object.hasOwn(value, "risk")
    ? ["risk", ...keys.filter((key) => key !== "risk")] : keys).slice(0, limits.objectKeyLimit);

  const priority = REPORT_PRIORITY_FIELDS.filter((key) => Object.hasOwn(value, key));
  const remaining = keys.filter((key) => !priority.includes(key));
  return [...priority, ...remaining.slice(0, limits.objectKeyLimit)];
}

// Only normalized wallet fields are admitted. Absolute depth and ordinary report
// limits still apply; copying each schema branch keeps shared samples auditable.
function compactWalletValueForReport(value, limits, depth, schema) {
  const primitive = compactPrimitive(value, limits);
  if (primitive !== undefined) return primitive;
  if (depth >= limits.depthLimit || schema === true) return "[nested data omitted from report]";

  if (Array.isArray(value) && Array.isArray(schema)) {
    const limit = Math.min(value.length, limits.arrayLimit);
    const output = value.slice(0, limit).map((item) => compactWalletValueForReport(item, limits, depth + 1, schema[0]));
    if (value.length > limit) output.push(`[${value.length - limit} additional items omitted from report]`);
    return output;
  }
  if (Array.isArray(value) || Array.isArray(schema)) return "[nested data omitted from report]";

  const output = {};
  const keys = Object.keys(schema).filter((key) => Object.hasOwn(value, key)).slice(0, limits.objectKeyLimit);
  for (const key of keys) output[key] = compactWalletValueForReport(value[key], limits, depth + 1, schema[key]);
  const omittedKeyCount = Object.keys(value).length - keys.length;
  if (omittedKeyCount > 0) output.reportCompactionOmittedKeys = omittedKeyCount;
  return output;
}

function compactWalletProvenanceForReport(value, options, state, depth, key) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      depth >= state.limits.depthLimit) {
    return compactValueForReport(value, options, state, depth, key);
  }
  const keys = Object.keys(value);
  const priority = [
    "nativeLifecycle",
    ...WALLET_SAMPLE_FIELDS,
  ].filter((field) => Object.hasOwn(value, field));
  if (!priority.length) return compactValueForReport(value, options, state, depth, key);
  state.seen.add(value);
  const selected = [...priority, ...keys.filter((field) => !priority.includes(field))].slice(0, state.limits.objectKeyLimit);
  const output = {};
  for (const field of selected) {
    output[field] = Object.hasOwn(WALLET_PROVENANCE_SCHEMAS, field)
      ? compactWalletValueForReport(value[field], state.limits, depth + 1, WALLET_PROVENANCE_SCHEMAS[field])
      : compactValueForReport(value[field], options, state, depth + 1, field);
  }
  if (keys.length > selected.length) output.reportCompactionOmittedKeys = keys.length - selected.length;
  return output;
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
  for (const childKey of orderedKeys(value, topLevel, limits, key)) {
    if (topLevel && Object.hasOwn(WALLET_REPORT_SCHEMAS, childKey)) {
      output[childKey] = compactWalletValueForReport(value[childKey], limits, depth + 1, WALLET_REPORT_SCHEMAS[childKey]);
    } else if (topLevel && ["fieldProvenance", "canonicalAliasProvenance"].includes(childKey)) {
      output[childKey] = compactWalletProvenanceForReport(value[childKey], options, localState, depth + 1, childKey);
    } else {
      output[childKey] = compactValueForReport(value[childKey], options, localState, depth + 1, childKey);
    }
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
      arrayLimit: 20,
      objectKeyLimit: 100,
      stringLimit: 1_000,
      depthLimit: 4,
    }),
    discovery: compactDiscoveryForReports(discovery),
  };
}
import { EVIDENCE_FUNNEL_SNAPSHOT_PROJECT_FIELDS } from "./evidenceFunnelSnapshot.js";
