import cron from "node-cron";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runOutcomeProbe } from "../learning/outcomeProbe.js";
import { writeAtomicJson } from "../production/atomicArtifactStore.js";

export const DEFAULT_HOURLY_OUTCOME_HORIZONS = Object.freeze([1, 24, 168, 720]);
export const DEFAULT_HOURLY_OUTCOME_CRON = "7 * * * *";

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveHourlyOutcomeHorizons(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(",");
  const horizons = raw
    .map(Number)
    .filter((horizon) => Number.isFinite(horizon) && horizon > 0);
  return [...new Set([1, ...(horizons.length ? horizons : DEFAULT_HOURLY_OUTCOME_HORIZONS)])]
    .sort((left, right) => left - right);
}

export function resolveHourlyOutcomeCollectionConfig(options = {}) {
  return {
    horizons: resolveHourlyOutcomeHorizons(
      options.horizons || process.env.HOURLY_OUTCOME_HORIZONS,
    ),
    maxRequests: positiveInteger(
      options.maxRequests || process.env.HOURLY_OUTCOME_MAX_REQUESTS,
      60,
    ),
    concurrency: positiveInteger(
      options.concurrency || process.env.HOURLY_OUTCOME_CONCURRENCY,
      4,
    ),
    schedule: String(
      options.schedule || process.env.HOURLY_OUTCOME_CRON || DEFAULT_HOURLY_OUTCOME_CRON,
    ),
  };
}

function compactProbeReport(probe = {}) {
  const resultStatusCounts = (Array.isArray(probe.results) ? probe.results : []).reduce(
    (counts, row) => {
      const status = row?.status || "UNKNOWN";
      counts[status] = Number(counts[status] || 0) + 1;
      return counts;
    },
    {},
  );
  return {
    status: probe.status || "UNKNOWN",
    skipped: probe.skipped === true,
    skipReason: probe.skipReason || null,
    dueCandidates: Number(probe.dueCandidates || 0),
    duePredictions: Number(probe.duePredictions || 0),
    providerRequestsUsed: Number(probe.providerRequestsUsed || 0),
    providerRequestBudget: Number(probe.providerRequestBudget || 0),
    exactLedgerObservationsSaved: Number(probe.exactLedgerObservationsSaved || 0),
    exactLedgerObservationsRejected: Number(probe.exactLedgerObservationsRejected || 0),
    unresolvedCandidates: Number(probe.unresolvedCandidates || 0),
    prospectiveEdgeDueCandidates: Number(probe.prospectiveEdgeDueCandidates || 0),
    prospectiveEntryEdgeDueCandidates: Number(probe.prospectiveEntryEdgeDueCandidates || 0),
    outcomesByHorizon: probe.outcomesByHorizon || {},
    resultStatusCounts,
    marketContextCapture: probe.marketContextCapture || null,
    lockFile: probe.lockFile || null,
  };
}

/**
 * A one-shot, exact-outcome-only job intended for an external hourly
 * scheduler. It deliberately does not discover projects, freeze new cohorts,
 * grade evidence, alter rankings, promote models, or create orders. The
 * legacy snapshot mirror is disabled so the collector appends only the exact
 * observation ledger and its own operational reports.
 */
export async function runHourlyOutcomeCollection(options = {}) {
  const now = new Date(options.now || Date.now()).toISOString();
  const runId = options.runId || `hourly-outcome-collection-${Date.now()}`;
  const config = resolveHourlyOutcomeCollectionConfig(options);
  const probe = options.runOutcomeProbe || runOutcomeProbe;
  const report = {
    schemaVersion: 1,
    generatedAt: now,
    runId,
    status: "PENDING",
    cadence: {
      frequency: "HOURLY",
      schedulerCron: config.schedule,
      horizonHours: config.horizons,
    },
    policy: {
      purpose: "EXACT_SHADOW_OUTCOME_COLLECTION_ONLY",
      discoveryRun: false,
      candidateSelectionRun: false,
      cohortCaptureRun: false,
      gradingRun: false,
      rankingInfluence: false,
      scoringInfluence: false,
      automaticTrading: false,
      automaticPromotion: false,
      realMoneyOrderCreated: false,
      exactChainTokenIdentityRequired: true,
      knownPoolMustMatch: true,
      appendOnlyExactObservationLedger: true,
      legacyOutcomeSnapshotMirror: false,
    },
    probe: null,
    error: null,
  };

  try {
    const probeReport = await probe({
      now,
      runId,
      horizons: config.horizons,
      maxRequests: config.maxRequests,
      concurrency: config.concurrency,
      outcomeProbeLockFile: options.outcomeProbeLockFile,
      outcomeProbeLockStaleMs: options.outcomeProbeLockStaleMs,
      saveLegacySnapshots: false,
      reportFile: options.probeReportFile || path.resolve("reports", "hourly-outcome-probe.json"),
      writeReport: options.writeProbeReport !== false,
      collectMarketContext: options.collectMarketContext,
      providers: options.providers,
      marketContextProvider: options.marketContextProvider,
      marketContextProviders: options.marketContextProviders,
      marketContextTimeoutMs: options.marketContextTimeoutMs,
    });
    report.status = probeReport.status || "UNKNOWN";
    report.probe = compactProbeReport(probeReport);
  } catch (error) {
    report.status = "COLLECTION_FAILED";
    report.error = error?.message || "Unknown hourly outcome collection failure";
  }

  if (options.writeReport !== false) {
    writeAtomicJson(
      options.reportFile || path.resolve("reports", "hourly-outcome-collection.json"),
      report,
    );
  }
  return report;
}

export function hourlyOutcomeCollectionExitCode(report = {}) {
  return ["PASS", "PARTIAL", "NO_OUTCOMES_DUE", "SKIPPED_ALREADY_RUNNING"].includes(report.status)
    ? 0
    : 1;
}

/**
 * Starts a process-local scheduler only. It does not install launchd, cron,
 * or any operating-system service. Use `outcomes:hourly` for a scheduler that
 * invokes a single process per hour, or opt into this daemon explicitly.
 */
export function startHourlyOutcomeCollectionScheduler(options = {}) {
  const config = resolveHourlyOutcomeCollectionConfig(options);
  if (!cron.validate(config.schedule)) {
    throw new Error(`Invalid HOURLY_OUTCOME_CRON expression: ${config.schedule}`);
  }

  let running = false;
  const execute = async () => {
    if (running) {
      return {
        status: "SKIPPED_ALREADY_RUNNING",
        skipped: true,
        skipReason: "HOURLY_COLLECTOR_ALREADY_RUNNING",
      };
    }
    running = true;
    try {
      return await runHourlyOutcomeCollection({ ...options, ...config });
    } finally {
      running = false;
    }
  };
  const task = cron.schedule(config.schedule, () => {
    void execute().then((result) => {
      console.log(JSON.stringify({
        service: "hourly-outcome-collection",
        generatedAt: result.generatedAt || new Date().toISOString(),
        status: result.status,
        exactLedgerObservationsSaved: result.probe?.exactLedgerObservationsSaved || 0,
      }));
    });
  });

  return {
    schedule: config.schedule,
    run: execute,
    stop: () => task.stop(),
  };
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const daemon = process.argv.includes("--daemon") ||
    String(process.env.HOURLY_OUTCOME_DAEMON || "false").toLowerCase() === "true";
  if (daemon) {
    const scheduler = startHourlyOutcomeCollectionScheduler();
    console.log(`Hourly outcome collector scheduled: ${scheduler.schedule}`);
    if (String(process.env.HOURLY_OUTCOME_RUN_IMMEDIATELY || "true").toLowerCase() !== "false") {
      const report = await scheduler.run();
      console.log(JSON.stringify(report, null, 2));
    }
  } else {
    const report = await runHourlyOutcomeCollection();
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = hourlyOutcomeCollectionExitCode(report);
  }
}
