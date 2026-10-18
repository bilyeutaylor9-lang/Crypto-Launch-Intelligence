import { createHash } from "node:crypto";
import { advisoryEvidenceState, coreEvidenceState } from "../kernel/evidenceFunnelSummary.js";
import { deterministicCandidateBlocks } from "../kernel/candidateTruthState.js";
import { hasVerifiedRouteDepth, hasVerifiedRouteSlippage } from "../execution/routeTruthV2.js";

const COUNT_FIELDS = [
  "standardCandidates", "deepDeferred", "deepEvaluated", "coreEvidenceReady", "coreEvidencePartial",
  "coreDataStarved", "coreEvidenceUnknown", "advisoryDataGaps", "verifiedRoutes", "fullyQualified",
  "deterministicallyBlocked", "decisionEvidenceComplete", "conclusivelyRejected",
  "unresolvedDecisionEvidence", "insufficientEvidenceCandidates",
];
const PERCENT_FIELDS = ["coreEvidenceCoveragePct", "advisoryEvidenceCoveragePct", "coreDataStarvedPct"];
const BOOLEAN_FIELDS = ["healthyCoreEvidence", "healthyDecisionEvidence"];
const TEXT_FIELDS = ["selectionOutcome", "emptyResultLabel", "policy"];
const MISSING_FIELDS = ["IDENTITY", "SAFETY", "BUY_QUOTE", "SELL_QUOTE", "QUOTE_FRESHNESS", "ROUTE_DEPTH",
  "VERIFIED_SLIPPAGE", "TRANSFER_TAX", "TOKEN_AUTHORITY", "USER_ACCESS", "LIVE_EXECUTION_PROOF"];
const SUMMARY_FIELDS = [...COUNT_FIELDS, ...PERCENT_FIELDS, ...BOOLEAN_FIELDS, ...TEXT_FIELDS, "decisionProofMissingFields"];
const IDENTITY_FIELDS = [
  "chain", "chainId", "canonicalChainId", "canonicalChain", "finalChain", "network", "tokenAddress",
  "contractAddress", "canonicalAddress", "finalContractAddress", "poolAddress", "pairAddress",
  "primaryTradablePool", "finalPairAddress", "baseTokenAddress", "quoteTokenAddress", "permanentProjectKey",
  "canonicalId", "canonicalProjectId", "projectId", "venue", "exchange", "marketPair", "exchangeAssetId",
  "routeType", "routeKind",
];
const GATE_FIELDS = [
  "status", "routeTruthStatus", "executionProofState", "executionStatus", "liveExecutionReady",
  "exactIdentityVerified", "buyQuoteVerified", "sellQuoteVerified", "liveBuyQuoteVerified", "liveSellQuoteVerified",
  "quoteVerified", "safetyVerified", "depthVerified", "orderBookDepthVerified", "liquidityVerified",
  "slippageVerified", "slippageIsHeuristic", "transferTaxEvidenceRequired", "transferTaxEvidenceVerified",
  "authorityEvidenceRequired", "authorityEvidenceVerified", "authoritySafetyClean", "userAccessEvidenceRequired",
  "userAccessVerified", "regionStatus", "regionAvailability", "orderBookDepthUsd", "bidDepthUsd", "askDepthUsd",
  "executableDepthUsd", "verifiedTradeSizeUsd", "liquidityUsd", "dexLiquidityUsd", "stableExitLiquidityUsd",
  "estimatedRoundTripSlippagePct", "estimatedSlippagePct", "observedSlippagePct", "slippagePct", "executionSlippagePct",
  "verifiedDepthSource", "depthVerificationSource", "quoteTimestamp", "executionQuoteTimestamp", "quoteExpiresAt",
  "quoteFreshnessSeconds", "quoteAgeSeconds", "executionQuoteAgeSeconds", "authorityEvidenceSourceTimestamp", "verifiedAt",
];
const RAW_BLOCK_FIELDS = ["canonicalIdentityHardBlock", "honeypotDetected", "verifiedScam", "scamDetected",
  "sellRestricted", "blacklistEnabled", "hiddenTransferRestriction", "transferRestricted", "blacklistAuthority",
  "canBlacklist", "chainMismatch", "contractChainMismatch", "liquidityRemovalRiskScore", "manipulationRiskScore"];
const BLOCK_LISTS = ["opportunityHardBlockers", "hardBlockers", "finalBlockingReasons", "sniperBlockingReasons",
  "preConsensusHardBlockers", "economicIntegrityBlockers"];
const QUOTE_FIELDS = ["verified", "quoteVerified", "liveQuoteVerified", "status", "verificationStatus",
  "routeTruthStatus", "timestamp", "expiresAt", "ageSeconds"];
const REJECTED = new Set(["CONTRACT_MISMATCH", "CHAIN_MISMATCH", "HONEYPOT_RISK", "REJECTED"]);

export const EVIDENCE_FUNNEL_SNAPSHOT_PROJECT_FIELDS = Object.freeze([...new Set([
  "executionProof", "canonicalExecutionRoute", ...IDENTITY_FIELDS, ...GATE_FIELDS, ...RAW_BLOCK_FIELDS,
  ...BLOCK_LISTS, "deepEvaluationState", "finalSelectionState", "finalSelectionQualified",
  "coreEvidenceState", "engineDataReadinessStatus", "advisoryEvidenceState", "advisoryDataGaps",
  "coreEvidenceCoveragePct", "advisoryEvidenceCoveragePct", "coreDataStarved",
  "executionProofRecoveryRoute", "purchaseRoute", "executionRoute", "executionRoutes",
  "executionProofRecoveryRoutes", "buyQuote", "sellQuote", "quote", "quotes",
])]);

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function primitive(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value;
  if (typeof value === "string" && value.length <= 1_000) return value;
  throw new TypeError("Unbounded or non-primitive evidence field");
}

function pick(value, fields) {
  return fields.map((key) => primitive(value?.[key]));
}

function upper(value) {
  return String(value ?? "").trim().toUpperCase();
}

function timestamp(value) {
  if (typeof value !== "string") return null;
  const parts = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,3})?(Z|[+-]\d\d:\d\d)$/.exec(value);
  if (!parts) return null;
  const [year, month, day, hour, minute, second] = parts.slice(1, 7).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
    hour > 23 || minute > 59 || second > 59) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time > 0 ? time : null;
}

function frame(meta) {
  if (!record(meta)) return null;
  const cutoff = meta.dataCutoffTimestamp || meta.completedAt;
  const runId = meta.scanRunId || meta.runId;
  const time = timestamp(cutoff);
  if (time === null || time > Date.now() || typeof runId !== "string" || !runId.trim() || runId.length > 1_000) return null;
  return { runId, cutoff: new Date(time).toISOString() };
}

function routeProjection(value) {
  if (value === undefined || value === null) return null;
  if (!record(value)) throw new TypeError("Invalid route evidence");
  return [pick(value, IDENTITY_FIELDS), pick(value, GATE_FIELDS)];
}

// Compaction keeps authoritative roots first and replaces shared quote objects
// elsewhere with repeated-data markers. A primitive set retains their content once.
function quoteInventory(sources) {
  const quotes = new Set();
  for (const source of sources) {
    for (const value of [source?.buyQuote, source?.sellQuote, source?.quote, source?.quotes?.buy,
      source?.quotes?.sell, source?.quote?.buy, source?.quote?.sell]) {
      if (value == null || value === "[repeated data omitted from report]") continue;
      if (!record(value)) throw new TypeError("Invalid quote evidence");
      quotes.add(JSON.stringify(pick(value, QUOTE_FIELDS)));
    }
  }
  return [...quotes].sort();
}

function routeListProjection(value) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > 128) throw new TypeError("Invalid route list");
  return value.map((route) => JSON.stringify(routeProjection(route))).sort();
}

function rowProjection(project) {
  if (!record(project)) throw new TypeError("Invalid candidate");
  for (const field of BLOCK_LISTS) {
    const list = project[field];
    if (list != null && (!Array.isArray(list) || list.length > 256 ||
      list.some((item) => typeof item !== "string" || item.length > 1_000))) throw new TypeError("Invalid blocker list");
  }
  const blocks = deterministicCandidateBlocks(project).sort();
  const readiness = project.engineDataReadiness;
  const routes = [project, project.executionProof, project.canonicalExecutionRoute, project.executionProofRecoveryRoute,
    project.purchaseRoute, project.executionRoute];
  const projection = [
    routeProjection(project),
    pick(project, ["deepEvaluationState", "finalSelectionState", "finalSelectionQualified", ...RAW_BLOCK_FIELDS]),
    coreEvidenceState(project), advisoryEvidenceState(project),
    primitive(project.coreEvidenceCoveragePct ?? readiness?.coreEvidenceCoveragePct),
    primitive(project.advisoryEvidenceCoveragePct ?? readiness?.advisoryEvidenceCoveragePct),
    routeProjection(project.executionProof), routeProjection(project.canonicalExecutionRoute),
    routeProjection(project.executionProofRecoveryRoute), routeProjection(project.purchaseRoute),
    routeProjection(project.executionRoute), routeListProjection(project.executionRoutes),
    routeListProjection(project.executionProofRecoveryRoutes), blocks,
    quoteInventory([project.executionProof]),
    quoteInventory([...routes, ...(project.executionRoutes || []), ...(project.executionProofRecoveryRoutes || [])]),
  ];
  return { project, blocks, projection };
}

function cohort(projects) {
  if (!Array.isArray(projects)) return null;
  const rows = Array.from(projects, rowProjection);
  const serialized = rows.map((row) => JSON.stringify(row.projection)).sort();
  const hash = createHash("sha256").update("evidence-funnel-v1\n");
  for (const row of serialized) hash.update(row).update("\n");
  return { rows, fingerprint: hash.digest("hex") };
}

// This is only an upper bound from stored producer primitives, never a route verdict.
// In particular it neither refreshes quotes nor tests their age against report time.
function positiveProofBound({ project, blocks }, cutoff) {
  const proof = project.executionProof;
  if (!record(proof) || blocks.length) return false;
  const issued = timestamp(proof.quoteTimestamp || proof.executionQuoteTimestamp || project.quoteTimestamp);
  const asOf = timestamp(cutoff);
  if (issued === null || asOf === null || issued > asOf) return false;
  if (Object.hasOwn(proof, "quoteExpiresAt")) {
    const expiry = timestamp(proof.quoteExpiresAt);
    if (expiry === null || expiry <= asOf) return false;
  }
  if (proof.liveExecutionReady !== true ||
    upper(proof.routeTruthStatus || proof.executionProofState || proof.executionStatus) !== "LIVE_EXECUTION_READY") return false;
  for (const field of ["exactIdentityVerified", "buyQuoteVerified", "sellQuoteVerified", "safetyVerified"]) {
    if (proof[field] !== true) return false;
  }
  for (const field of ["quoteVerified", "depthVerified", "orderBookDepthVerified", "slippageVerified"]) {
    if (Object.hasOwn(proof, field) && proof[field] !== true) return false;
  }
  if (proof.slippageIsHeuristic === true || project.safetyVerified === false) return false;
  if (!hasVerifiedRouteDepth(project) || !hasVerifiedRouteSlippage(project)) return false;
  for (const [required, verified] of [["transferTaxEvidenceRequired", "transferTaxEvidenceVerified"],
    ["authorityEvidenceRequired", "authorityEvidenceVerified"], ["userAccessEvidenceRequired", "userAccessVerified"]]) {
    if ((proof[required] ?? project[required]) === true && proof[verified] !== true) return false;
  }
  if (proof.authorityEvidenceRequired === true) {
    const authorityTime = timestamp(proof.authorityEvidenceSourceTimestamp);
    if (proof.authoritySafetyClean !== true || authorityTime === null || authorityTime > asOf ||
      asOf - authorityTime > 300_000) return false;
  }
  return ![project, project.canonicalExecutionRoute].some((route) => route &&
    (REJECTED.has(upper(route.routeTruthStatus || route.executionProofState || route.executionStatus || route.status)) ||
      ["CONFIRMED_RESTRICTED", "REGION_RESTRICTED", "RESTRICTED", "UNAVAILABLE"].includes(upper(route.regionStatus || route.regionAvailability))));
}

function average(rows, field) {
  const values = rows.map(({ project }) => project[field] ?? project.engineDataReadiness?.[field])
    .filter((value) => Number.isFinite(Number(value))).map(Number);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function cloneSummary(summary) {
  if (!record(summary) || Object.keys(summary).length !== SUMMARY_FIELDS.length ||
    SUMMARY_FIELDS.some((field) => !Object.hasOwn(summary, field))) return null;
  const copy = {};
  for (const field of COUNT_FIELDS) {
    if (!Number.isSafeInteger(summary[field]) || summary[field] < 0) return null;
    copy[field] = summary[field];
  }
  for (const field of PERCENT_FIELDS) {
    if (typeof summary[field] !== "number" || !Number.isFinite(summary[field]) || summary[field] < 0 || summary[field] > 100) return null;
    copy[field] = summary[field];
  }
  for (const field of BOOLEAN_FIELDS) {
    if (typeof summary[field] !== "boolean") return null;
    copy[field] = summary[field];
  }
  for (const field of TEXT_FIELDS) {
    if (typeof summary[field] !== "string" || summary[field].length > 1_000) return null;
    copy[field] = summary[field];
  }
  if (!record(summary.decisionProofMissingFields)) return null;
  copy.decisionProofMissingFields = {};
  for (const field of Object.keys(summary.decisionProofMissingFields).sort()) {
    const count = summary.decisionProofMissingFields[field];
    if (!MISSING_FIELDS.includes(field) || !Number.isSafeInteger(count) || count <= 0 || count > copy.unresolvedDecisionEvidence) return null;
    copy.decisionProofMissingFields[field] = count;
  }
  return copy;
}

function validSummary(summary, rows, cutoff) {
  const s = summary;
  const progressive = rows.some(({ project: p }) => ["DEEP_EVALUATED", "DEFERRED_BEFORE_DEEP", "SELECTED_FOR_DEEP"].includes(p.deepEvaluationState));
  const deep = progressive ? rows.filter(({ project: p }) => p.deepEvaluationState === "DEEP_EVALUATED") : rows;
  const n = deep.length;
  if (s.standardCandidates !== rows.length || s.deepEvaluated !== n || s.deepDeferred !==
    (progressive ? rows.filter(({ project: p }) => p.deepEvaluationState === "DEFERRED_BEFORE_DEEP").length : 0)) return false;
  if (COUNT_FIELDS.filter((key) => !["standardCandidates", "deepDeferred"].includes(key)).some((key) => s[key] > n)) return false;
  const states = ["CORE_EVIDENCE_READY", "CORE_EVIDENCE_PARTIAL", "CORE_DATA_STARVED", "CORE_EVIDENCE_UNKNOWN"];
  if (["coreEvidenceReady", "coreEvidencePartial", "coreDataStarved", "coreEvidenceUnknown"].some((key, index) =>
    s[key] !== deep.filter(({ project }) => coreEvidenceState(project) === states[index]).length)) return false;
  if (s.advisoryDataGaps !== deep.filter(({ project }) => advisoryEvidenceState(project) === "ADVISORY_DATA_GAPS").length ||
    s.deterministicallyBlocked !== deep.filter(({ project, blocks }) => project.finalSelectionState === "BLOCKED" || blocks.length).length) return false;
  const rejected = deep.filter(({ project: p, blocks }) => blocks.length || ["BLOCKED", "IDENTITY_CONFLICT"].includes(upper(p.finalSelectionState)) ||
    REJECTED.has(upper(p.executionProof?.executionStatus || p.executionProof?.executionProofState))).length;
  if (s.conclusivelyRejected !== rejected || s.decisionEvidenceComplete + rejected + s.unresolvedDecisionEvidence !== n) return false;
  const proofBound = deep.filter((row) => positiveProofBound(row, cutoff));
  const qualifiedBound = proofBound.filter(({ project: p }) =>
    !["BLOCKED", "IDENTITY_CONFLICT"].includes(upper(p.finalSelectionState)) &&
    (upper(p.finalSelectionState) === "QUALIFIED" || p.finalSelectionQualified === true)).length;
  if (s.verifiedRoutes > proofBound.length || s.decisionEvidenceComplete > s.verifiedRoutes ||
    s.fullyQualified > qualifiedBound || s.fullyQualified > s.verifiedRoutes) return false;
  const nonReady = s.coreEvidencePartial + s.coreDataStarved + s.coreEvidenceUnknown;
  if (s.insufficientEvidenceCandidates < Math.max(nonReady, s.unresolvedDecisionEvidence) ||
    s.insufficientEvidenceCandidates > nonReady + s.unresolvedDecisionEvidence) return false;
  const missingTotal = Object.values(s.decisionProofMissingFields).reduce((sum, value) => sum + value, 0);
  if (missingTotal < s.unresolvedDecisionEvidence) return false;
  if (s.coreEvidenceCoveragePct !== average(deep, "coreEvidenceCoveragePct") ||
    s.advisoryEvidenceCoveragePct !== average(deep, "advisoryEvidenceCoveragePct") ||
    s.coreDataStarvedPct !== (n ? Math.round(s.coreDataStarved / n * 10_000) / 100 : 0)) return false;
  const healthyCore = n > 0 && s.coreEvidenceCoveragePct >= 85 && s.coreDataStarvedPct < 20;
  const healthyDecision = n > 0 && s.unresolvedDecisionEvidence === 0;
  return s.healthyCoreEvidence === healthyCore && s.healthyDecisionEvidence === healthyDecision &&
    s.selectionOutcome === (s.fullyQualified > 0 ? "EDGE_FOUND" : healthyCore && healthyDecision ? "NO_EDGE_FOUND" : "DATA_DEGRADED") &&
    s.emptyResultLabel === (s.fullyQualified > 0 ? "QUALIFIED_MOVE_AVAILABLE" : s.verifiedRoutes > 0 ? "NO_FULLY_QUALIFIED_MOVE" : "NO_VERIFIED_ROUTE");
}

function freezeSummary(summary) {
  Object.freeze(summary.decisionProofMissingFields);
  return Object.freeze(summary);
}

/** Capture an already-computed scan summary. Returns null for an invalid frame. Report-only. */
export function createEvidenceFunnelSnapshot(projects, summary, meta) {
  try {
    const scan = frame(meta);
    const copy = cloneSummary(summary);
    if (!scan || !copy) return null;
    const dataset = cohort(projects);
    if (!dataset || !validSummary(copy, dataset.rows, scan.cutoff)) return null;
    return Object.freeze({ schemaVersion: 1, ...scan, cohortFingerprint: dataset.fingerprint, summary: freezeSummary(copy) });
  } catch {
    return null;
  }
}

/** Historical counters only; null means the caller must use its strict current fallback. */
export function getFrozenEvidenceFunnel(projects, meta) {
  try {
    const snapshot = meta?.evidenceFunnelSnapshot;
    const scan = frame(meta);
    if (!scan || !record(snapshot) || snapshot.schemaVersion !== 1 || snapshot.runId !== scan.runId ||
      snapshot.cutoff !== scan.cutoff || typeof snapshot.cohortFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(snapshot.cohortFingerprint)) return null;
    const copy = cloneSummary(snapshot.summary);
    if (!copy) return null;
    const dataset = cohort(projects);
    if (!dataset || dataset.fingerprint !== snapshot.cohortFingerprint || !validSummary(copy, dataset.rows, scan.cutoff)) return null;
    return freezeSummary({ ...copy, asOfTimestamp: scan.cutoff, evidenceBasis: "FROZEN_SCAN" });
  } catch {
    return null;
  }
}
