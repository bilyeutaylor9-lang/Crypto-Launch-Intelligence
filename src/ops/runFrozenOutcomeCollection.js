import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDurableEvidenceArchive } from "../archive/durableEvidenceArchive.js";
import { importFrozenOutcomeLedgers } from "../archive/frozenOutcomeQueue.js";
import { projectFrozenOutcomeObservations } from "../archive/frozenOutcomeProjection.js";
import { runDurableOutcomeCycle } from "../archive/durableOutcomeCoordinator.js";
import { createFrozenOutcomeCollector } from "../archive/frozenOutcomeCollector.js";
import { replayArchivedFrozenOutcomes } from "../archive/frozenOutcomeReplay.js";
import { acquireOutcomeProbeRunLock } from "../learning/outcomeProbeRunLock.js";
import { writeAtomicJson } from "../production/atomicArtifactStore.js";
import { resolveCodeCommitSha, buildScanCodeProvenance } from "../production/productionRunManifest.js";

export const FROZEN_OUTCOME_PROVIDER_POLICIES = Object.freeze({
  dexscreener: Object.freeze({ windowMs: 3600000, requestLimit: 60, timeoutMs: 8000 }),
  geckoterminal: Object.freeze({ windowMs: 3600000, requestLimit: 60, timeoutMs: 8000, minimumIntervalMs: 6100 }),
});
export const FROZEN_OUTCOME_GLOBAL_BUDGET = Object.freeze({
  provider: "frozen-outcome-total-balanced-v1", windowMs: 3600000, requestLimit: 60, balanceOutcomeAttempts: true,
});

function sourceBytes(file) {
  if (!fs.lstatSync(file).isFile()) throw new Error("FROZEN_SOURCE_NOT_REGULAR:" + file);
  const before = fs.statSync(file), bytes = fs.readFileSync(file), after = fs.statSync(file);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== before.size) throw new Error("FROZEN_SOURCE_CHANGED_DURING_READ:" + file);
  return bytes;
}

export async function runFrozenOutcomeCollection(options = {}) {
  if (typeof options.archiveRoot !== "string" || !path.isAbsolute(options.archiveRoot)) throw new TypeError("Explicit absolute persistent archiveRoot is required");
  if (process.env.GITHUB_ACTIONS === "true" && options.collectLive === true) throw new Error("PERSISTENT_HOST_REQUIRED_NO_EPHEMERAL_LIVE_COLLECTOR");
  const clock = options.clock || (() => new Date().toISOString());
  const startedCommit = resolveCodeCommitSha({ env: {} });
  const cohortFile = path.resolve(options.cohortFile || "data/prospective-edge-cohorts.jsonl");
  const observationFile = path.resolve(options.observationFile || "data/production-market-observations.jsonl");
  const lock = acquireOutcomeProbeRunLock({ outcomeProbeLockFile: options.outcomeProbeLockFile || path.join(path.dirname(observationFile), "outcome-probe-run.lock") });
  if (!lock.acquired) return { status: "LEGACY_COLLECTOR_BUSY", providerRequests: 0, edgeEstablished: false };
  let archive;
  try {
    archive = openDurableEvidenceArchive({ root: options.archiveRoot, clock });
    const checked = archive.audit();
    if (!checked.ok) throw new Error("FROZEN_ARCHIVE_INTEGRITY_BLOCKED:" + checked.errors.join(","));
    const owner = "frozen-outcome:" + process.pid + ":" + crypto.randomUUID();
    if (!archive.claimWriter({ owner, nowAt: clock() })) return { status: "WRITER_BUSY", providerRequests: 0, edgeEstablished: false };
    const project = () => {
      try { return projectFrozenOutcomeObservations({ archive, clock, file: observationFile }); }
      catch (error) {
        if (!error.message.startsWith("OUTCOME_PROJECTION_LEDGER_")) throw error;
        return { status: "LOCAL_PROJECTION_BLOCKED", error: error.message, originalRetained: true, remoteAcknowledged: false };
      }
    };
    let imported, replay, projectionBefore;
    try {
      imported = importFrozenOutcomeLedgers({ archive, clock, cohortBytes: sourceBytes(cohortFile), observationBytes: sourceBytes(observationFile) });
      replay = replayArchivedFrozenOutcomes({ archive, clock });
      projectionBefore = project();
    } finally { archive.releaseWriter({ nowAt: clock() }); }
    let collection = null, projectionAfter = null;
    if (options.collectLive === true) {
      const collect = options.collect || (options.createCollector || createFrozenOutcomeCollector)({ archive, clock });
      collection = await runDurableOutcomeCycle({ archive, owner, collect, clock, limit: 60, cycleTimeoutMs: 45000,
        providerPolicies: FROZEN_OUTCOME_PROVIDER_POLICIES, globalBudget: FROZEN_OUTCOME_GLOBAL_BUDGET });
      if (archive.claimWriter({ owner, nowAt: clock() })) {
        try { projectionAfter = project(); }
        finally { archive.releaseWriter({ nowAt: clock() }); }
      } else projectionAfter = { status: "WRITER_BUSY", remoteAcknowledged: false };
    }
    const audit = archive.audit(), finishedAt = clock();
    const report = { schemaVersion: 1, generatedAt: finishedAt, codeProvenance: buildScanCodeProvenance(startedCommit, resolveCodeCommitSha({ env: {} })),
      status: !audit.ok ? "ARCHIVE_INTEGRITY_BLOCKED" : !imported.sourceIntegrityHealthy ? "SOURCE_EVIDENCE_DEGRADED"
        : !collection ? "IMPORT_ONLY_NOT_LIVE_ACCEPTANCE" : ["WRITER_BUSY", "LOCAL_PROJECTION_BLOCKED"].includes(projectionAfter?.status) ? "LOCAL_PROJECTION_PENDING" : collection.status,
      mode: options.collectLive === true ? "BOUNDED_EXACT_OUTCOME_COLLECTION" : "IMPORT_ONLY",
      sources: { cohortFile, observationFile }, imported, replay, collection, projectionBefore, projectionAfter,
      obligations: archive.dueDenominators(finishedAt), storage: { localIntegrityHealthy: audit.ok, independentBackupVerified: false, remoteSyncVerified: false },
      providerBudget: FROZEN_OUTCOME_GLOBAL_BUDGET, providerState: archive.coordinationStatus(finishedAt),
      automaticTrading: false, automaticPromotion: false, edgeEstablished: false };
    if (options.reportFile) writeAtomicJson(path.resolve(options.reportFile), report);
    return report;
  } finally { archive?.close(); lock.release(); }
}

function argumentsFor(argv) {
  const options = {};
  const names = new Map([["--archive", "archiveRoot"], ["--cohorts", "cohortFile"], ["--observations", "observationFile"], ["--report", "reportFile"]]);
  for (let n = 0; n < argv.length; n++) {
    if (argv[n] === "--collect") { options.collectLive = true; continue; }
    const name = names.get(argv[n]);
    if (!name || !argv[n + 1] || argv[n + 1].startsWith("--") || options[name] !== undefined) throw new Error("Usage: outcomes:frozen -- --archive /absolute/path [--cohorts file --observations file --report file] [--collect]");
    options[name] = argv[++n];
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await runFrozenOutcomeCollection(argumentsFor(process.argv.slice(2)));
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    process.exitCode = ["SOURCE_EVIDENCE_DEGRADED", "ARCHIVE_INTEGRITY_BLOCKED", "COLLECTION_INCOMPLETE", "LOCAL_PROJECTION_PENDING"].includes(report.status) ? 1 : 0;
  } catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
}
