import fs from "node:fs";
import { loadOutcomeSnapshots } from "../learning/outcomeSnapshotStore.js";
import { loadExactMarketObservations } from "../production/exactMarketObservationLedger.js";
import { loadProspectiveEdgeCohorts } from "../production/prospectiveEdgeCohortLedger.js";
import { gradeProspectiveEdgeCohorts } from "../production/prospectiveEdgeCohortGrader.js";
import { runEdgeVerificationProgram } from "../production/edgeVerificationProgram.js";
import { resolveSnapshotOutcomes } from "../production/snapshotOutcomeResolver.js";
import { writeAtomicJson } from "../production/atomicArtifactStore.js";

function readJson(file, fallback = {}) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } }

export function runEdgeVerificationCycle(options = {}) {
  const now = options.now || new Date().toISOString();
  const resolvedReport = options.resolvedReport || readJson("reports/production-shadow-resolved.json", {});
  const selections = resolvedReport.rows || [];
  const exactObservations = options.marketObservations || (options.snapshots ? [] : loadExactMarketObservations());
  const usingExactObservationLedger = options.requireObservationLedgerIntegrity !== undefined
    ? options.requireObservationLedgerIntegrity === true
    : options.prospectiveObservations === undefined;
  const snapshots = options.snapshots || (exactObservations.length ? exactObservations : loadOutcomeSnapshots());
  const universeOutcomes = resolveSnapshotOutcomes(snapshots, { asOf: now, horizonHours: Number(options.horizonHours || 24), toleranceHours: Number(options.toleranceHours || 8) });
  const diagnostic = runEdgeVerificationProgram(selections, universeOutcomes, {
    now,
    targetReturnPct: Number(options.targetReturnPct || 25),
    minimumSelections: Number(options.minimumSelections || 200),
    minimumUniqueProjects: Number(options.minimumUniqueProjects || 80),
    minimumReturnEdgePct: Number(options.minimumReturnEdgePct || 3),
    minimumHitRateEdge: Number(options.minimumHitRateEdge || 0.03),
    maximumCatastropheDelta: Number(options.maximumCatastropheDelta || 0.02),
    maxControlsPerSelection: Number(options.maxControlsPerSelection || 3),
    iterations: Number(options.iterations || 1200),
  });
  if (options.writeReports !== false) {
    writeAtomicJson("reports/edge-verification-posthoc-diagnostic.json", diagnostic);
  }

  const episodes = options.prospectiveEpisodes || loadProspectiveEdgeCohorts();
  const report = gradeProspectiveEdgeCohorts(
    episodes,
    options.prospectiveObservations !== undefined
      ? options.prospectiveObservations
      : exactObservations,
    {
      asOf: now,
      horizonHours: Number(options.horizonHours || 24),
      toleranceHours: Number(options.toleranceHours || 8),
      targetReturnPct: Number(options.targetReturnPct || 25),
      minimumResolvedPairs: Number(options.minimumProspectiveResolvedPairs || 250),
      minimumUniqueProjects: Number(options.minimumUniqueProjects || 80),
      minimumCohorts: Number(options.minimumCohorts || 30),
      minimumReturnEdgePct: Number(options.minimumReturnEdgePct || 3),
      minimumHitRateEdge: Number(options.minimumHitRateEdge || 0.03),
      maximumCatastropheDelta: Number(options.maximumCatastropheDelta || 0.02),
      minimumReplicationWindows: Number(options.minimumReplicationWindows || 3),
      minimumPairsPerReplicationWindow: Number(options.minimumPairsPerReplicationWindow || 10),
      minimumPairCaptureRate: Number(options.minimumPairCaptureRate || 0.95),
      minimumEpisodeCaptureRate: Number(options.minimumEpisodeCaptureRate || 0.95),
      minimumExplicitExecutionCostCoverage: Number(options.minimumExplicitExecutionCostCoverage || 0.80),
      maximumP90MatchDistance: Number(options.maximumP90MatchDistance || 1.25),
      iterations: Number(options.iterations || 1600),
      requireObservationLedgerIntegrity: usingExactObservationLedger,
    },
  );
  if (options.writeReports !== false) {
    writeAtomicJson("reports/edge-verification-program.json", report);
  }
  const current = report.current;
  const certificate = {
    schemaVersion: 1,
    generatedAt: report.generatedAt,
    edgeState: report.edgeState,
    evidenceDesign: report.evidenceDesign,
    strategyFingerprint: report.latestStrategyFingerprint,
    forwardSelections: current.sample.resolvedMatchedPairs,
    uniqueProjects: current.sample.uniqueTreatmentProjects,
    independentCohorts: current.sample.resolvedCohorts,
    matchedControls: current.sample.resolvedControlOutcomes,
    averageReturnEdgePct: current.performance.averageNetReturnEdgePct.estimate,
    averageReturnEdge95Low: current.performance.averageNetReturnEdgePct.lower,
    averageReturnEdge95High: current.performance.averageNetReturnEdgePct.upper,
    hitRateEdge: current.performance.hitRateEdge.estimate,
    hitRateEdge95Low: current.performance.hitRateEdge.lower,
    hitRateEdge95High: current.performance.hitRateEdge.upper,
    catastrophicDelta: current.performance.catastrophicLossDelta.estimate,
    catastrophicDelta95High: current.performance.catastrophicLossDelta.upper,
    outcomeCapturePass: current.capture.pass,
    executionCostCoveragePass: current.executionCosts.pass,
    matchQualityPass: current.matchQuality.pass,
    timeReplicationPass: current.replication.pass,
    analysisCheckpointPairs: current.sequentialInference.checkpointPairCount,
    nextAnalysisCheckpointPairs: current.sequentialInference.nextCheckpointPairCount,
    strategyTrialOrdinal: current.sequentialInference.strategyTrialOrdinal,
    allocatedSequentialAlpha: current.sequentialInference.allocatedAlpha,
    confidenceLevel: current.sequentialInference.confidenceLevel,
    interimSafetyPass: current.interimSafety.pass,
    missingnessWorstCaseSensitivityPass: current.missingnessSensitivity.pass,
    prospectiveCohortLedgerIntegrityPass: report.inputAudit.prospectiveCohortLedgerIntegrityPass,
    exactMarketObservationLedgerIntegrityRequired: report.inputAudit.exactMarketObservationLedgerIntegrityRequired,
    exactMarketObservationLedgerIntegrityPass: report.inputAudit.exactMarketObservationLedgerIntegrityPass,
    blockers: current.blockers,
    verified: report.certificateEligible === true,
    certificateEligible: report.certificateEligible === true,
    posthocDiagnosticState: diagnostic.edgeState,
    posthocDiagnosticCertificateEligible: false,
    automaticTrading: false,
    automaticPromotion: false,
  };
  if (options.writeReports !== false) {
    writeAtomicJson("reports/edge-verification-certificate.json", certificate);
  }
  return { report, certificate };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { report, certificate } = runEdgeVerificationCycle();
    console.log(JSON.stringify(certificate, null, 2));
    if (report.edgeState !== "VERIFIED_FORWARD_EDGE") process.exitCode = 2;
  } catch (error) { console.error(error); process.exitCode = 1; }
}
