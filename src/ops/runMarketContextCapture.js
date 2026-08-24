import { loadExactMarketObservations } from "../production/exactMarketObservationLedger.js";
import {
  appendMarketContextObservations,
  buildMarketContextObservation,
  loadMarketContextObservations,
} from "../production/marketContextObservationLedger.js";
import { collectMarketContextSnapshot } from "../production/marketContextSnapshotProvider.js";
import { writeAtomicJson } from "../production/atomicArtifactStore.js";
import { strictIdentity, timestamp } from "../production/productionMath.js";

function latestExactRows(rows = [], now, maximumAgeHours = 6) {
  const nowMs = timestamp(now);
  const maximumAgeMs = Math.max(1, Number(maximumAgeHours || 6)) * 60 * 60 * 1000;
  const latest = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const identity = strictIdentity(row);
    const observedMs = timestamp(row.observedAt || row.timestamp);
    if (
      !identity ||
      observedMs === null ||
      nowMs === null ||
      observedMs > nowMs ||
      nowMs - observedMs > maximumAgeMs
    ) continue;
    const current = latest.get(identity.routeKey);
    if (!current || observedMs > current.observedMs) latest.set(identity.routeKey, { row, observedMs });
  }
  return [...latest.values()].map((entry) => entry.row);
}

export async function runMarketContextCapture(options = {}) {
  const now = new Date(options.now || Date.now()).toISOString();
  const exact = options.exactObservations || loadExactMarketObservations();
  const previousContext = options.previousContext || loadMarketContextObservations();
  const raw = await (options.provider || collectMarketContextSnapshot)({
    now,
    providers: options.providers,
    previousContext,
    previousExactObservations: exact,
    currentExactObservations: latestExactRows(
      exact,
      now,
      options.maximumExactObservationAgeHours || process.env.MARKET_CONTEXT_EXACT_SAMPLE_MAX_AGE_HOURS || 6
    ),
    timeoutMs: options.timeoutMs || process.env.MARKET_CONTEXT_PROVIDER_TIMEOUT_MS,
  });
  const context = buildMarketContextObservation(raw, { now, asOf: now });
  const save = context
    ? (options.save || appendMarketContextObservations)([context], {
        ...(options.store || {}),
        now,
        asOf: now,
      })
    : { saved: 0, rejected: 1 };
  const report = {
    schemaVersion: 1,
    generatedAt: now,
    state: context?.state || "CONTEXT_REJECTED",
    observationKey: context?.observationKey || null,
    observationsSaved: Number(save.saved || 0),
    observationsRejected: Number(save.rejected || 0),
    providerHealth: context?.providerHealth || {},
    unavailableFields: context?.unavailableFields || [],
    pointInTimeVerified: context?.pointInTimeVerified === true,
    scoringOrSelectionAllowed: false,
    automaticTrading: false,
  };
  if (options.writeReport !== false) writeAtomicJson("reports/market-context-capture.json", report);
  return { report, context };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = await runMarketContextCapture();
    console.log(JSON.stringify(result.report, null, 2));
    const observedProviders = Object.values(result.report.providerHealth)
      .filter((row) => row?.status === "OBSERVED").length;
    if (!result.report.pointInTimeVerified || observedProviders < 2) process.exitCode = 2;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

export const __marketContextCaptureHooks = { latestExactRows };
