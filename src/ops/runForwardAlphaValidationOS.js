import fs from "node:fs";

import { loadCanaryPolicy } from "../canary/canaryPolicyStore.js";
import { loadCanaryReplayQuotes } from "../canary/canaryReplayStore.js";
import { loadCanaryTickets } from "../canary/canaryTicketStore.js";
import { buildExecutableEdgeCanaryLab } from "../canary/executableEdgeCanaryLab.js";
import { buildForwardAlphaValidationOS } from "../production/forwardAlphaValidationOS.js";
import { loadExactMarketObservations } from "../production/exactMarketObservationLedger.js";
import { loadProspectiveEdgeCohorts } from "../production/prospectiveEdgeCohortLedger.js";
import { writeAtomicJson } from "../production/atomicArtifactStore.js";

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}

function loadExecutableCanary(options = {}) {
  if (options.canary) return options.canary;
  const envelope = options.canaryPolicy || loadCanaryPolicy({ file: options.canaryPolicyFile });
  if (!envelope) {
    return {
      state: "PAPER_CANARY_POLICY_NOT_ARMED",
      metrics: {},
      maturityBlockers: ["CANARY_POLICY_NOT_FROZEN"],
      evidenceBlockers: [],
      paperOnly: true,
      realMoneyOrders: 0,
    };
  }
  const tickets = options.canaryTickets || loadCanaryTickets({ file: options.canaryTicketFile });
  const replays = options.canaryReplays || loadCanaryReplayQuotes({ file: options.canaryReplayFile });
  return buildExecutableEdgeCanaryLab(tickets, replays, envelope, {
    writeReport: false,
  });
}

export function runForwardAlphaValidationOS(options = {}) {
  const now = options.now || new Date().toISOString();
  const episodes = options.episodes || loadProspectiveEdgeCohorts({
    file: options.prospectiveCohortFile,
  });
  const observations = options.observations || loadExactMarketObservations({
    file: options.marketObservationFile,
  });
  const sourceReadiness = options.sourceReadiness || readJson(
    options.sourceReadinessFile || "reports/data-source-readiness.json",
    { state: "SOURCE_READINESS_REPORT_NOT_AVAILABLE", liveReady: false, blockers: ["SOURCE_READINESS_REPORT_NOT_AVAILABLE"] },
  );
  const baseline = options.championMetrics || readJson(
    options.championBaselineFile || "reports/champion-baseline.json",
    null,
  );
  const canary = loadExecutableCanary(options);
  const report = buildForwardAlphaValidationOS({
    episodes,
    observations,
    canary,
    sourceReadiness,
    championMetrics: baseline?.champion || baseline,
  }, {
    asOf: now,
    requireObservationLedgerIntegrity: options.requireObservationLedgerIntegrity !== false,
    policy: options.policy,
  });

  if (options.writeReports !== false) {
    writeAtomicJson("reports/forward-alpha-validation-os.json", report);
    writeAtomicJson("reports/cli15-promotion-gate.json", report.promotionGate);
    writeAtomicJson("reports/cli15-multi-horizon-evidence.json", {
      schemaVersion: 1,
      cliVersion: "15.0",
      generatedAt: report.generatedAt,
      state: report.state,
      edgeVerdict: report.edgeVerdict,
      multiHorizon: report.multiHorizon,
      segments: report.segments,
      benchmarkComparison: report.benchmarkComparison,
    });
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = runForwardAlphaValidationOS();
    console.log(JSON.stringify({
      cliVersion: report.cliVersion,
      state: report.state,
      edgeVerdict: report.edgeVerdict,
      frozenPredictionContracts: report.predictionContracts.currentContracts,
      validPredictionContracts: report.predictionContracts.validContracts,
      forwardCertificate: report.forwardCertificate.edgeState,
      primaryHorizon: report.multiHorizon["24"]?.state || null,
      primaryCalibration: report.primaryCalibration?.state || null,
      paperCanary: report.executableCanary.state,
      promotionBlockers: report.promotionGate.blockers,
      automaticTrading: false,
      automaticPromotion: false,
    }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
