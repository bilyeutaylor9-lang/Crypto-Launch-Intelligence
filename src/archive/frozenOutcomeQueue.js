import crypto from "node:crypto";
import { __prospectiveEdgeGraderHooks as grader } from "../production/prospectiveEdgeCohortGrader.js";
import { exactMarketObservationIntegrityHash } from "../production/exactMarketObservationLedger.js";
import { finite, stableHash, strictIdentity } from "../production/productionMath.js";
import { outcomeHorizonToleranceHours } from "../learning/outcomeCalibrationEngine.js";

const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const HASH = /^[a-f0-9]{64}$/;
export const OPERATIONAL_COLLECTION_POLICY = "OUTCOME_PROBE_OPERATIONAL_TOLERANCE_V1";
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const time = value => typeof value === "string" && ISO.test(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : NaN;

export function originalJsonlRecords(input) {
  if (!Buffer.isBuffer(input) && !(input instanceof Uint8Array)) throw new TypeError("Original ledger bytes are required");
  const bytes = Buffer.from(input), records = [];
  for (let offset = 0; offset < bytes.length;) {
    const newline = bytes.indexOf(10, offset), end = newline === -1 ? bytes.length : newline + 1;
    const rawBytes = bytes.subarray(offset, end), text = rawBytes.toString("utf8");
    let row = null, error = null;
    if (text.trim()) { try { row = JSON.parse(text); } catch { error = "MALFORMED_JSONL_RECORD"; } }
    records.push({ offset, rawBytes, row, error, blank: !text.trim() }); offset = end;
  }
  return records;
}

function captureSource(archive, family, input, clock, renew) {
  const records = originalJsonlRecords(input), references = [];
  for (const item of records) {
    renew();
    const row = item.row, rawHash = hash(item.rawBytes);
    const episode = row && typeof row.episodeId === "string" && HASH.test(row.freezeIntegrityHash || "");
    const observation = row && typeof row.observationKey === "string" && HASH.test(row.observationIntegrityHash || "");
    const canonicalId = family === "frozen-cohorts" && episode ? "source-frozen:" + row.episodeId + ":" + row.freezeIntegrityHash
      : family === "exact-observations" && observation ? "exact-observation:" + row.observationIntegrityHash : "source-row:" + family + ":" + rawHash;
    let canonical = archive.readEvidence(canonicalId);
    if (!canonical) {
      const identity = row && typeof row === "object" && !Array.isArray(row) ? strictIdentity(row) : null;
      const exact = family === "exact-observations" && observation && row.schemaVersion === 2 && identity &&
        row.observationIntegrityHash === exactMarketObservationIntegrityHash(row);
      archive.admitPrediction({ recordId: canonicalId, rawBytes: item.rawBytes, frozenObligations: [], immutableContract: {
        kind: exact ? "EXACT_MARKET_OBSERVATION_V2_RECORD" : "ORIGINAL_LEDGER_SOURCE_ROW_V1", family,
        firstSeenAt: clock(), observationIntegrityHash: exact ? row.observationIntegrityHash : null,
        scoringOrSelectionAllowed: false, verificationScope: "ORIGINAL_BYTES_AND_DECLARED_ROW_ONLY",
      } });
      canonical = archive.readEvidence(canonicalId);
    }
    let rawRecordId = canonicalId;
    if (canonical.contentHash !== rawHash) {
      rawRecordId = "source-variant:" + family + ":" + rawHash;
      if (!archive.readEvidence(rawRecordId)) archive.admitPrediction({ recordId: rawRecordId, rawBytes: item.rawBytes, frozenObligations: [], immutableContract: {
        kind: "ORIGINAL_LEDGER_BYTE_VARIANT_V1", family, variantOf: canonicalId, scoringOrSelectionAllowed: false,
      } });
    }
    item.canonical = canonical; item.canonicalId = canonicalId;
    references.push({ offset: item.offset, bytes: item.rawBytes.length, sha256: rawHash, recordId: rawRecordId });
  }
  const index = { format: "ORIGINAL_JSONL_BYTES_INDEX_V1", family, sourceSha256: hash(input), bytes: input.length, references };
  const indexId = "source-index:" + family + ":" + index.sourceSha256;
  archive.admitPrediction({ recordId: indexId, rawBytes: Buffer.from(JSON.stringify(index)), frozenObligations: [],
    immutableContract: { kind: "DERIVED_SOURCE_BYTES_INDEX_V1", scoringOrSelectionAllowed: false } });
  return { records, indexId, sourceSha256: index.sourceSha256 };
}

export function restoreOriginalLedgerBytes(archive, indexId) {
  const evidence = archive.readEvidence(indexId);
  if (evidence?.immutableContract?.kind !== "DERIVED_SOURCE_BYTES_INDEX_V1") throw new Error("SOURCE_BYTES_INDEX_MISSING");
  const index = JSON.parse(evidence.rawBytes.toString("utf8"));
  if (index.format !== "ORIGINAL_JSONL_BYTES_INDEX_V1" || !Array.isArray(index.references) || !HASH.test(index.sourceSha256)) throw new Error("SOURCE_BYTES_INDEX_INVALID");
  let offset = 0; const parts = [];
  for (const reference of index.references) {
    const original = archive.readEvidence(reference.recordId);
    if (!original || reference.offset !== offset || original.rawBytes.length !== reference.bytes || original.contentHash !== reference.sha256) throw new Error("SOURCE_BYTES_REFERENCE_INVALID");
    parts.push(original.rawBytes); offset += reference.bytes;
  }
  const bytes = Buffer.concat(parts);
  if (offset !== index.bytes || hash(bytes) !== index.sourceSha256) throw new Error("SOURCE_BYTES_HASH_MISMATCH");
  return bytes;
}

function horizonContract(row) {
  const horizons = row.outcomeHorizonsHours;
  const decision = time(row.decisionAt);
  return Array.isArray(horizons) && horizons.length && horizons.every(value => Number.isFinite(value) && value > 0 &&
    Number.isFinite(new Date(decision + (value + 24) * 3600000).getTime())) && new Set(horizons).size === horizons.length;
}

function countKeys(records, field) {
  const counts = new Map();
  for (const { row } of records) if (typeof row?.[field] === "string") counts.set(row[field], (counts.get(row[field]) || 0) + 1);
  return counts;
}

function observationFailures(entry, asOfMs) {
  const row = entry.row, identity = row && typeof row === "object" && !Array.isArray(row) ? strictIdentity(row) : null;
  if (!identity || row.schemaVersion !== 2 || row.exactIdentityVerified !== true || row.identityKey !== identity.identityKey || row.routeKey !== identity.routeKey || !row.observationKey) return ["INVALID_EXACT_OBSERVATION_IDENTITY"];
  if (!row.observationIntegrityHash || row.observationIntegrityHash !== exactMarketObservationIntegrityHash(row) || entry.canonical.immutableContract.kind !== "EXACT_MARKET_OBSERVATION_V2_RECORD") return ["INVALID_EXACT_OBSERVATION_HASH"];
  const observedAt = time(row.observedAt), firstSeen = time(entry.canonical.immutableContract.firstSeenAt);
  if (!Number.isFinite(observedAt) || observedAt > Math.min(asOfMs, firstSeen) || finite(row.priceUsd) === null || finite(row.priceUsd) <= 0) return ["INVALID_EXACT_OBSERVATION_TIME_OR_PRICE"];
  const receipt = row.outcomeObservationProvenance?.receiptObservedAt ?? row.receiptObservedAt;
  const source = row.outcomeObservationProvenance?.sourceTimestamp ?? row.sourceObservedAt;
  if ((receipt !== null && receipt !== undefined && (!Number.isFinite(time(receipt)) || time(receipt) > Math.min(asOfMs, firstSeen) || observedAt > time(receipt))) ||
    (source !== null && source !== undefined && (!Number.isFinite(time(source)) || time(source) > Math.min(observedAt, receipt ? time(receipt) : observedAt)))) return ["INVALID_EXACT_OBSERVATION_PROVENANCE_CLOCK"];
  return [];
}

// Original rows and their hashes are never regenerated. New operational window
// labels are explicit and cannot turn non-primary observations into certificates.
export function importFrozenOutcomeLedgers({ archive, cohortBytes, observationBytes, clock = () => new Date().toISOString() } = {}) {
  const startedAt = clock(), asOfMs = time(startedAt);
  if (!Number.isFinite(asOfMs)) throw new TypeError("Invalid import clock");
  archive.renewWriter({ nowAt: startedAt });
  let renewedAt = asOfMs;
  const renew = () => {
    const nowAt = clock(), ms = time(nowAt);
    if (!Number.isFinite(ms) || ms < renewedAt) throw new TypeError("Invalid or reversed import clock");
    if (ms - renewedAt >= 10000) { archive.renewWriter({ nowAt }); renewedAt = ms; }
  };
  const cohorts = captureSource(archive, "frozen-cohorts", Buffer.from(cohortBytes), clock, renew);
  const observations = captureSource(archive, "exact-observations", Buffer.from(observationBytes), clock, renew);
  const issues = [], addIssue = (entry, reasons, family) => {
    if (reasons.length) issues.push({ family, rawSha256: hash(entry.rawBytes), episodeId: entry.row?.episodeId || null, observationKey: entry.row?.observationKey || null, reasons });
  };
  const episodeCounts = countKeys(cohorts.records, "episodeId"), observationCounts = countKeys(observations.records, "observationKey");
  const objects = cohorts.records.filter(entry => entry.row && typeof entry.row === "object" && !Array.isArray(entry.row));
  const topology = grader.cohortTopologyFailures(objects.map(entry => entry.row));
  const failures = new Map(), badCohorts = new Set();
  const cohortKey = row => JSON.stringify([row?.cohortId, row?.strategyFingerprint]);
  for (const entry of cohorts.records) {
    if (entry.blank) continue;
    const row = entry.row, policy = row?.strategyDefinition?.evaluationPolicy;
    let found = entry.error ? [entry.error] : grader.episodeIntegrityFailures(row, Math.min(asOfMs, Date.parse(entry.canonical.immutableContract.firstSeenAt)), { horizonHours: policy?.primaryHorizonHours || 24 });
    if (row && !horizonContract(row)) found.push("INVALID_FROZEN_HORIZONS");
    if (row && !Number.isFinite(time(row.decisionAt))) found.push("INVALID_FROZEN_DECISION_CLOCK");
    if (row && episodeCounts.get(row.episodeId) > 1) found.push("DUPLICATE_FROZEN_EPISODE_ID");
    if (!policy || policy.version !== "PROSPECTIVE_EDGE_CERTIFICATE_V1" || !Number.isFinite(policy.primaryHorizonHours) || policy.primaryHorizonHours <= 0 || !Number.isFinite(policy.outcomeToleranceHours) || policy.outcomeToleranceHours < 1 || policy.outcomeToleranceHours > 8) found.push("INVALID_FROZEN_PRIMARY_WINDOW");
    if (policy && !row?.outcomeHorizonsHours?.includes?.(policy.primaryHorizonHours)) found.push("FROZEN_PRIMARY_HORIZON_NOT_DECLARED");
    found = [...new Set([...found, ...(topology.get(row?.episodeId) || [])])];
    failures.set(entry, found); if (found.length && row?.cohortId) badCohorts.add(cohortKey(row));
  }
  const admitted = [];
  for (const entry of cohorts.records) {
    if (entry.blank) continue;
    const row = entry.row, found = failures.get(entry);
    if (!found.length && badCohorts.has(cohortKey(row))) found.push("FROZEN_COHORT_MEMBER_INTEGRITY_BLOCKED");
    if (found.length) { addIssue(entry, found, "frozen-cohorts"); continue; }
    renew();
    const policy = row.strategyDefinition.evaluationPolicy;
    const tasks = row.outcomeHorizonsHours.map(horizonHours => {
      const primary = horizonHours === policy.primaryHorizonHours;
      const toleranceHours = primary ? policy.outcomeToleranceHours : outcomeHorizonToleranceHours(horizonHours);
      const due = Date.parse(row.decisionAt) + horizonHours * 3600000;
      return { obligationId: row.episodeId + ":" + horizonHours + "h", horizonHours, dueAt: new Date(due).toISOString(),
        expiresAt: new Date(due + toleranceHours * 3600000).toISOString(), observationClockPolicy: "COLLECTION_RECEIPT_V1",
        episodeId: row.episodeId, role: row.role, strategyFingerprint: row.strategyFingerprint,
        windowAuthority: primary ? "FROZEN_EVALUATION_POLICY_PRIMARY_HORIZON" : OPERATIONAL_COLLECTION_POLICY,
        certificateHorizon: primary, originalFreezeIntegrityHash: row.freezeIntegrityHash };
    });
    const recordId = "frozen-episode:" + row.episodeId;
    const existing = archive.readEvidence(recordId);
    if (existing) {
      if (existing.immutableContract?.kind !== "FROZEN_EPISODE_OUTCOME_OBLIGATIONS_V1" || stableHash(existing.immutableContract.frozenEpisode) !== stableHash(row)) {
        addIssue(entry, ["IMMUTABLE_FROZEN_EPISODE_CONFLICT"], "frozen-cohorts"); continue;
      }
      const withoutId = ({ taskId: _taskId, ...frozen }) => frozen;
      const previous = archive.listTasks({ recordId }).map(task => withoutId(task.frozen)).sort((a, b) => a.obligationId.localeCompare(b.obligationId));
      if (stableHash(previous) !== stableHash([...tasks].sort((a, b) => a.obligationId.localeCompare(b.obligationId)))) {
        addIssue(entry, ["IMMUTABLE_COLLECTION_POLICY_CONFLICT"], "frozen-cohorts"); continue;
      }
    } else archive.admitPrediction({ recordId, rawBytes: entry.rawBytes, frozenObligations: tasks,
      cohortMetadata: { cohortId: row.cohortId, role: row.role, parentTreatmentEpisodeId: row.parentTreatmentEpisodeId },
      immutableContract: { kind: "FROZEN_EPISODE_OUTCOME_OBLIGATIONS_V1", chain: row.chain, tokenAddress: row.tokenAddress,
        poolAddress: row.poolAddress ?? null, outcomeHorizonsHours: row.outcomeHorizonsHours, frozenEpisode: row, scoringOrSelectionAllowed: false } });
    admitted.push(recordId);
  }
  const byRoute = new Map(), byIdentity = new Map();
  for (const entry of observations.records) {
    if (entry.blank) continue;
    const found = entry.error ? [entry.error] : observationFailures(entry, asOfMs);
    if (entry.row && observationCounts.get(entry.row.observationKey) > 1) found.push("DUPLICATE_EXACT_OBSERVATION_KEY");
    if (found.length) { addIssue(entry, found, "exact-observations"); continue; }
    const row = entry.row, item = { recordId: entry.canonicalId, at: time(row.observedAt), key: row.observationKey,
      receiptAt: row.outcomeObservationProvenance?.receiptObservedAt ?? row.receiptObservedAt ?? null,
      sourceAt: row.outcomeObservationProvenance?.sourceTimestamp ?? row.sourceObservedAt ?? null };
    for (const [map, key] of [[byRoute, row.routeKey], [byIdentity, row.identityKey]]) map.set(key, [...(map.get(key) || []), item]);
  }
  for (const map of [byRoute, byIdentity]) for (const values of map.values()) values.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
  let reconciled = 0, taskCount = 0, primaryTasks = 0;
  for (const recordId of admitted) {
    const parent = archive.readEvidence(recordId).immutableContract, identity = strictIdentity(parent);
    const candidates = (parent.poolAddress ? byRoute.get(identity.routeKey) : byIdentity.get(identity.identityKey)) || [];
    for (const task of archive.listTasks({ recordId })) {
      taskCount++; primaryTasks += Number(task.frozen.certificateHorizon);
      // The source is still fully registered and counted, but historical
      // reconciliation is immutable. Avoid a writer renewal/fsync merely to
      // rediscover an existing historical link on every unchanged poll.
      if (task.state === "completed" || task.historicallyReconciled) continue;
      const inWindow = value => value >= time(task.due_at) && value <= time(task.expires_at);
      const match = candidates.find(item => inWindow(item.at) && (item.receiptAt === null || inWindow(time(item.receiptAt))) && (item.sourceAt === null || inWindow(time(item.sourceAt))));
      if (!match) continue;
      renew();
      const result = archive.reconcileHistoricalObservation({ taskId: task.task_id, evidenceRecordId: match.recordId, nowAt: clock() });
      if (result.status === "reconciled") reconciled++;
    }
  }
  return { status: issues.length ? "SOURCE_EVIDENCE_DEGRADED" : !admitted.length ? "NO_FROZEN_EPISODES" : "FROZEN_OBLIGATIONS_IMPORTED",
    startedAt, finishedAt: clock(), sourceIntegrityHealthy: issues.length === 0, episodes: admitted.length, tasks: taskCount,
    primaryTasks, operationalOnlyTasks: taskCount - primaryTasks, historicalReconciled: reconciled, issues,
    sourceIndexes: { cohorts: cohorts.indexId, observations: observations.indexId },
    sourceHashes: { cohorts: cohorts.sourceSha256, observations: observations.sourceSha256 }, providerRequests: 0, edgeEstablished: false };
}
