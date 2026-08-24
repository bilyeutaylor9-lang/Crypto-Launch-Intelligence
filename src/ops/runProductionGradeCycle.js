import fs from "node:fs";

import { loadOutcomeSnapshots } from "../learning/outcomeSnapshotStore.js";
import { loadExactMarketObservations } from "../production/exactMarketObservationLedger.js";
import { loadProspectiveEdgeCohorts } from "../production/prospectiveEdgeCohortLedger.js";
import { gradeProspectiveEdgeCohorts } from "../production/prospectiveEdgeCohortGrader.js";
import { linkShadowPredictionsToOutcomes } from "../production/shadowOutcomeLinker.js";
import { resolveSnapshotOutcomes } from "../production/snapshotOutcomeResolver.js";
import { buildCalibrationReport } from "../production/probabilityCalibrationEngine.js";
import { evaluateEdgeDecay } from "../production/edgeDecayMonitor.js";
import { estimateCounterfactualEdge } from "../production/counterfactualEdgeEngine.js";
import {
  generateFrozenHypotheses,
  evaluateFrozenHypothesis,
} from "../production/researchHypothesisEngine.js";
import { compareChampionChallenger } from "../production/championChallengerGovernor.js";
import { buildMissedWinnerAutopsy } from "../production/missedWinnerAutopsy.js";
import { writeAtomicJson } from "../production/atomicArtifactStore.js";

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try { return [JSON.parse(line)]; } catch { return []; }
    });
}

function metrics(rows = []) {
  const active = (Array.isArray(rows) ? rows : []).filter((row) =>
    Number.isFinite(Number(row.realizedReturnPct))
  );
  const returns = active.map((row) => Number(row.realizedReturnPct));
  const plus25 = active.filter((row) => row.realizedReturnPct >= 25).length;
  const catastrophic = active.filter((row) => row.realizedReturnPct <= -50 || row.failure === true).length;
  return {
    samples: active.length,
    averageReturnPct: active.length
      ? returns.reduce((a, b) => a + b, 0) / active.length
      : null,
    plus25HitRate: active.length ? plus25 / active.length : null,
    catastrophicLossRate: active.length ? catastrophic / active.length : null,
  };
}

export function runProductionGradeCycle(options = {}) {
  const now = options.now || new Date().toISOString();
  const predictions = options.predictions || readJsonl("data/production-shadow-predictions.jsonl");
  const exactObservations = options.marketObservations || (options.snapshots ? [] : loadExactMarketObservations());
  const usingExactObservationLedger = options.requireObservationLedgerIntegrity !== undefined
    ? options.requireObservationLedgerIntegrity === true
    : options.prospectiveObservations === undefined;
  const snapshots = options.snapshots || (exactObservations.length ? exactObservations : loadOutcomeSnapshots());
  const prospectiveEpisodes = options.prospectiveEpisodes || loadProspectiveEdgeCohorts();
  const prospectiveObservations = options.prospectiveObservations !== undefined
    ? options.prospectiveObservations
    : exactObservations;
  const prospectiveEdge = gradeProspectiveEdgeCohorts(
    prospectiveEpisodes,
    prospectiveObservations,
    {
      asOf: now,
      horizonHours: Number(options.prospectiveHorizonHours || 24),
      toleranceHours: Number(options.prospectiveToleranceHours || 8),
      targetReturnPct: Number(options.prospectiveTargetReturnPct || 25),
      minimumResolvedPairs: Number(options.minimumProspectiveResolvedPairs || 250),
      minimumUniqueProjects: Number(options.minimumProspectiveUniqueProjects || 80),
      minimumCohorts: Number(options.minimumProspectiveCohorts || 30),
      minimumReplicationWindows: Number(options.minimumProspectiveReplicationWindows || 3),
      minimumPairsPerReplicationWindow: Number(options.minimumProspectivePairsPerWindow || 10),
      minimumPairCaptureRate: Number(options.minimumProspectivePairCaptureRate || 0.95),
      minimumEpisodeCaptureRate: Number(options.minimumProspectiveEpisodeCaptureRate || 0.95),
      minimumExplicitExecutionCostCoverage: Number(options.minimumExplicitExecutionCostCoverage || 0.80),
      maximumP90MatchDistance: Number(options.maximumP90MatchDistance || 1.25),
      minimumReturnEdgePct: Number(options.minimumProspectiveReturnEdgePct || 3),
      minimumHitRateEdge: Number(options.minimumProspectiveHitRateEdge || 0.03),
      maximumCatastropheDelta: Number(options.maximumProspectiveCatastropheDelta || 0.02),
      iterations: Number(options.prospectiveBootstrapIterations || 1600),
      requireObservationLedgerIntegrity: usingExactObservationLedger,
    },
  );
  writeAtomicJson("reports/prospective-edge-cohort-grade.json", prospectiveEdge);

  const resolved = linkShadowPredictionsToOutcomes(predictions, snapshots, {
    asOf: now,
    horizonHours: 24,
    maxLatenessHours: 8,
    targetReturnPct: 25,
    failureReturnPct: -20,
  });
  writeAtomicJson("reports/production-shadow-resolved.json", {
    schemaVersion: 1,
    generatedAt: now,
    predictions: predictions.length,
    resolved: resolved.length,
    rows: resolved.slice(-5000),
  });

  const calibrationRows = resolved
    .filter((row) => Number.isFinite(Number(row.probability50Pct)))
    .map((row) => ({
      probability: Number(row.probability50Pct) / 100,
      actual: Number(row.realizedReturnPct) >= 50,
    }));
  const calibration = buildCalibrationReport(calibrationRows, {
    minimumSamples: 100,
    maximumEce: 0.06,
  });
  writeAtomicJson("reports/production-calibration.json", calibration);

  const decay = evaluateEdgeDecay(resolved, {
    now,
    minimumRecentSamples: 30,
    minimumPriorSamples: 60,
  });
  writeAtomicJson("reports/production-edge-decay.json", decay);

  const current = readJson("reports/production-shadow-ranking.json", {});
  const counterfactual = (current.candidates || []).slice(0, 25).map((candidate) => ({
    identityKey: candidate.identityKey,
    symbol: candidate.symbol || null,
    analysis: estimateCounterfactualEdge(candidate, resolved, {
      maxControls: 60,
    }),
  }));
  writeAtomicJson("reports/production-counterfactual-edge.json", {
    schemaVersion: 1,
    generatedAt: now,
    candidates: counterfactual,
  });

  const signalRegistry = readJson("reports/edge-signal-darwinism.json", {});
  const existingHypotheses = readJson("data/research-hypotheses.json", []);
  const generated = existingHypotheses.length
    ? existingHypotheses
    : generateFrozenHypotheses(signalRegistry.signals || [], {
        now,
        minimumSamples: 30,
        minimumFutureSamples: 60,
      });
  const evaluatedHypotheses = generated.map((hypothesis) =>
    evaluateFrozenHypothesis(hypothesis, resolved, {
      minimumWilsonLowerBound: 0.50,
    })
  );
  writeAtomicJson("data/research-hypotheses.json", evaluatedHypotheses);
  writeAtomicJson("reports/research-hypothesis-evidence.json", {
    schemaVersion: 1,
    generatedAt: now,
    hypotheses: evaluatedHypotheses,
  });

  const challengerMetrics = metrics(resolved);
  const championMetrics =
    readJson("reports/champion-baseline.json", null) ||
    { samples: 0, averageReturnPct: 0, plus25HitRate: 0, catastrophicLossRate: 0 };
  const challenger = compareChampionChallenger(championMetrics, challengerMetrics, {
    minimumSamples: 200,
    minimumReturnImprovementPct: 3,
    minimumHitRateImprovement: 0.03,
  });
  writeAtomicJson("reports/champion-challenger.json", {
    schemaVersion: 1,
    generatedAt: now,
    champion: championMetrics,
    challenger: challengerMetrics,
    ...challenger,
  });

  const broadOutcomes = resolveSnapshotOutcomes(snapshots, {
    asOf: now,
    horizonHours: 24,
    toleranceHours: 8,
  });
  const missed = buildMissedWinnerAutopsy(predictions, broadOutcomes, {
    winnerReturnPct: 100,
    minimumPriorityScore: 65,
  });
  writeAtomicJson("reports/missed-winner-autopsy-production.json", missed);

  return {
    resolved: resolved.length,
    calibration,
    decay,
    counterfactual,
    hypotheses: evaluatedHypotheses,
    challenger,
    missed,
    prospectiveEdge,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = runProductionGradeCycle();
    console.log(JSON.stringify({
      resolvedPredictions: result.resolved,
      calibration: result.calibration.state,
      edgeDecay: result.decay.state,
      challenger: result.challenger.state,
      missedWinners: result.missed.missedWinners,
      prospectiveEdge: result.prospectiveEdge.edgeState,
      prospectiveMatchedPairs: result.prospectiveEdge.current.sample.resolvedMatchedPairs,
    }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
