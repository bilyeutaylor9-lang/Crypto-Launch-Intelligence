import fs from "node:fs";
import { loadOutcomeSnapshots } from "../learning/outcomeSnapshotStore.js";
import { loadExactMarketObservations } from "../production/exactMarketObservationLedger.js";
import { runEdgeVerificationProgram } from "../production/edgeVerificationProgram.js";
import { resolveSnapshotOutcomes } from "../production/snapshotOutcomeResolver.js";
import { writeAtomicJson } from "../production/atomicArtifactStore.js";

function readJson(file, fallback = {}) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } }

export function runEdgeVerificationCycle(options = {}) {
  const resolvedReport = options.resolvedReport || readJson("reports/production-shadow-resolved.json", {});
  const selections = resolvedReport.rows || [];
  const exactObservations = options.marketObservations || (options.snapshots ? [] : loadExactMarketObservations());
  const snapshots = options.snapshots || (exactObservations.length ? exactObservations : loadOutcomeSnapshots());
  const universeOutcomes = resolveSnapshotOutcomes(snapshots, { horizonHours: Number(options.horizonHours || 24), toleranceHours: Number(options.toleranceHours || 8) });
  const report = runEdgeVerificationProgram(selections, universeOutcomes, {
    now: options.now,
    targetReturnPct: Number(options.targetReturnPct || 25),
    minimumSelections: Number(options.minimumSelections || 200),
    minimumUniqueProjects: Number(options.minimumUniqueProjects || 80),
    minimumReturnEdgePct: Number(options.minimumReturnEdgePct || 3),
    minimumHitRateEdge: Number(options.minimumHitRateEdge || 0.03),
    maximumCatastropheDelta: Number(options.maximumCatastropheDelta || 0.02),
    maxControlsPerSelection: Number(options.maxControlsPerSelection || 3),
    iterations: Number(options.iterations || 1200),
  });
  writeAtomicJson("reports/edge-verification-program.json", report);
  const certificate = {
    schemaVersion: 1,
    generatedAt: report.generatedAt,
    edgeState: report.edgeState,
    forwardSelections: report.selection.samples,
    uniqueProjects: report.selection.uniqueProjects,
    matchedControls: report.matchedControls.samples,
    averageReturnEdgePct: report.incremental.averageReturnPct.estimate,
    averageReturnEdge95Low: report.incremental.averageReturnPct.lower,
    averageReturnEdge95High: report.incremental.averageReturnPct.upper,
    hitRateEdge: report.incremental.hitRate.estimate,
    hitRateEdge95Low: report.incremental.hitRate.lower,
    hitRateEdge95High: report.incremental.hitRate.upper,
    catastrophicDelta: report.incremental.catastrophicLossRate.estimate,
    verified: report.edgeState === "VERIFIED_FORWARD_EDGE",
    automaticTrading: false,
    automaticPromotion: false,
  };
  writeAtomicJson("reports/edge-verification-certificate.json", certificate);
  return { report, certificate };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { report, certificate } = runEdgeVerificationCycle();
    console.log(JSON.stringify(certificate, null, 2));
    if (report.edgeState !== "VERIFIED_FORWARD_EDGE") process.exitCode = 2;
  } catch (error) { console.error(error); process.exitCode = 1; }
}
