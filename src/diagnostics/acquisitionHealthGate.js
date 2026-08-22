import fs from "node:fs";
import path from "node:path";

const SOURCE_FILE = path.resolve("reports", "edge-acquisition-cycle.json");
const REPORT_FILE = path.resolve("reports", "acquisition-health-gate.json");

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

export function buildAcquisitionHealthGate(report = null, options = {}) {
  const now = new Date(options.now || Date.now()).toISOString();
  const nowMs = timestamp(now);
  const stepOutcome = String(
    options.stepOutcome ||
      process.env.EDGE_ACQUISITION_STEP_OUTCOME ||
      ""
  ).trim().toLowerCase();
  const maxAgeMinutes = Math.max(
    1,
    Number(
      options.maxReportAgeMinutes ||
        process.env.EDGE_ACQUISITION_MAX_REPORT_AGE_MINUTES ||
        30
    )
  );
  const blockers = [];

  if (stepOutcome && stepOutcome !== "success") {
    blockers.push(`ACQUISITION_STEP_${stepOutcome.toUpperCase()}`);
  }

  if (!report || typeof report !== "object" || Array.isArray(report)) {
    blockers.push("ACQUISITION_REPORT_MISSING");
  }

  const generatedAtMs = timestamp(report?.generatedAt);
  const reportAgeMinutes =
    generatedAtMs !== null && nowMs !== null
      ? Math.max(0, (nowMs - generatedAtMs) / 60_000)
      : null;

  if (report && generatedAtMs === null) blockers.push("ACQUISITION_REPORT_TIMESTAMP_INVALID");
  if (reportAgeMinutes !== null && reportAgeMinutes > maxAgeMinutes) {
    blockers.push("ACQUISITION_REPORT_STALE");
  }

  const sourceState = String(report?.state || "").toUpperCase();
  const candidates = finite(report?.candidates) ?? 0;
  const observedChains = finite(report?.observedChains) ?? 0;
  const continuousChains = finite(report?.continuousChains) ?? 0;
  const continuityGaps = finite(report?.continuityGaps) ?? 0;
  const qualifyingTransfers = finite(report?.qualifyingTransfers) ?? 0;
  const fundedRecipients = finite(report?.fundedRecipients) ?? 0;

  if (sourceState === "WAITING_FOR_EXACT_CANDIDATE_UNIVERSE") {
    blockers.push("UPSTREAM_EXACT_CANDIDATE_UNIVERSE_MISSING");
  } else if (sourceState === "EDGE_ACQUISITION_DEGRADED") {
    blockers.push("CHAIN_ACQUISITION_DEGRADED");
  } else if (sourceState && sourceState !== "EDGE_ACQUISITION_OBSERVED") {
    blockers.push(`UNRECOGNIZED_ACQUISITION_STATE:${sourceState}`);
  }

  if (sourceState === "EDGE_ACQUISITION_OBSERVED" && observedChains <= 0) {
    blockers.push("NO_CHAIN_OBSERVATION_CONFIRMED");
  }
  if (continuityGaps > 0) blockers.push("CHAIN_CONTINUITY_GAP");
  if (
    sourceState === "EDGE_ACQUISITION_OBSERVED" &&
    observedChains > 0 &&
    continuousChains < observedChains
  ) {
    blockers.push("CHAIN_COVERAGE_INCOMPLETE");
  }

  const dedupedBlockers = unique(blockers);
  let state = "ACQUISITION_HEALTH_UNKNOWN";
  let observationClass = "UNKNOWN";
  if (dedupedBlockers.length) {
    state = "ACQUISITION_FAILED";
    observationClass = "INFRASTRUCTURE_OR_COVERAGE_FAILURE";
  } else if (qualifyingTransfers > 0 || fundedRecipients > 0) {
    state = "ACQUISITION_HEALTHY_EVENT_OBSERVED";
    observationClass = "HEALTHY_POSITIVE_EVIDENCE";
  } else if (sourceState === "EDGE_ACQUISITION_OBSERVED") {
    state = "ACQUISITION_HEALTHY_NO_EVENT";
    observationClass = "HEALTHY_NEGATIVE_EVIDENCE";
  }

  return {
    schemaVersion: 1,
    generatedAt: now,
    state,
    observationClass,
    sourceState: sourceState || "UNKNOWN",
    stepOutcome: stepOutcome || "UNKNOWN",
    healthy: dedupedBlockers.length === 0 && state.startsWith("ACQUISITION_HEALTHY_"),
    blockResearchAdvancement: dedupedBlockers.length > 0,
    blockers: dedupedBlockers,
    reportAgeMinutes:
      reportAgeMinutes === null ? null : Number(reportAgeMinutes.toFixed(2)),
    thresholds: { maxReportAgeMinutes: maxAgeMinutes },
    metrics: {
      candidates,
      observedChains,
      continuousChains,
      continuityGaps,
      qualifyingTransfers,
      fundedRecipients,
      carriedWallets: finite(report?.carriedWallets) ?? 0,
      preparedWallets: finite(report?.preparedWallets) ?? 0,
      pathTrainingExamples: finite(report?.pathTrainingExamples) ?? 0,
      commitmentTrainingExamples: finite(report?.commitmentTrainingExamples) ?? 0,
      frozenTreatmentEpisodes: finite(report?.frozenTreatmentEpisodes) ?? 0,
      frozenControlEpisodes: finite(report?.frozenControlEpisodes) ?? 0,
    },
    interpretation:
      state === "ACQUISITION_HEALTHY_NO_EVENT"
        ? "No qualifying capital event was observed under complete coverage. This is healthy negative evidence, not a failure."
        : state === "ACQUISITION_HEALTHY_EVENT_OBSERVED"
          ? "A qualifying capital event was observed under complete coverage."
          : dedupedBlockers.length
            ? "Research advancement is blocked because the acquisition cycle itself is not trustworthy."
            : "Acquisition health is unknown.",
    invariants: {
      noEventIsNotFailure: true,
      missingEvidenceRemainsUnknown: true,
      rankingInfluence: false,
      scoringInfluence: false,
      automaticTrading: false,
      automaticProductionPromotion: false,
    },
  };
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function runAcquisitionHealthGate(options = {}) {
  const sourceFile = path.resolve(options.sourceFile || SOURCE_FILE);
  const reportFile = path.resolve(options.reportFile || REPORT_FILE);
  const source = options.report === undefined ? readJson(sourceFile) : options.report;
  const report = buildAcquisitionHealthGate(source, options);
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export function loadAcquisitionHealthGate(options = {}) {
  const reportFile = path.resolve(options.reportFile || REPORT_FILE);
  const parsed = readJson(reportFile);
  if (parsed && typeof parsed === "object") return parsed;
  return {
    schemaVersion: 1,
    generatedAt: null,
    state: "ACQUISITION_HEALTH_UNKNOWN",
    observationClass: "UNKNOWN",
    healthy: false,
    blockResearchAdvancement: false,
    blockers: [],
    interpretation:
      "No acquisition-health report is loaded. Manual evidence analysis remains possible, but the current acquisition cycle is not certified.",
    invariants: {
      noEventIsNotFailure: true,
      missingEvidenceRemainsUnknown: true,
      rankingInfluence: false,
      automaticTrading: false,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = runAcquisitionHealthGate();
  console.log(JSON.stringify({
    state: report.state,
    observationClass: report.observationClass,
    blockers: report.blockers,
    metrics: report.metrics,
  }, null, 2));
  if (report.blockResearchAdvancement) process.exitCode = 2;
}

export const ACQUISITION_HEALTH_GATE_REPORT = REPORT_FILE;
export const __acquisitionHealthGateHooks = { finite, timestamp, readJson };
