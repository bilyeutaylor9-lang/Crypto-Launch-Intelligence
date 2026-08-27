import fs from "node:fs";
import path from "node:path";

import { loadIgnitionTwinObservations } from "../learning/ignitionTwinObservationStore.js";
import { runIgnitionOutcomeLab } from "../learning/ignitionOutcomeLab.js";
import { loadOutcomeSnapshots } from "../learning/outcomeSnapshotStore.js";
import { loadEdgeCandidateUniverse } from "../data/edgeCandidateUniverseStore.js";
import { buildMultiscaleIgnitionGenome } from "../production/multiscaleIgnitionGenome.js";
import { rankGenomeConvergence } from "../production/genomeConvergenceEngine.js";
import { runEdgeAdaptiveLearningCycle } from "./runEdgeAdaptiveLearningCycle.js";
import { runEdgeOpportunitySynthesis } from "./runEdgeOpportunitySynthesis.js";
import { routeResearchBudget } from "../production/informationGainRouter.js";
import { diversifyResearchQueue } from "../production/portfolioExposureEngine.js";
import { simulateForwardDistribution } from "../production/forwardScenarioSimulator.js";
import { combineExpertPredictions } from "../production/expertPortfolioEngine.js";
import { buildProductionRunManifest, writeProductionRunManifest } from "../production/productionRunManifest.js";
import { buildProductionObservability } from "../production/productionObservability.js";
import { writeAtomicJson, appendJsonlDurable } from "../production/atomicArtifactStore.js";
import { appendExactMarketObservations, loadExactMarketObservations, toOutcomeSnapshots } from "../production/exactMarketObservationLedger.js";
import {
  captureProspectiveEdgeCohort,
  buildProspectiveMatchabilityIndex,
  selectMatchableProspectiveTreatments,
} from "../production/prospectiveEdgeCohortLedger.js";
import { strictIdentity } from "../production/productionMath.js";
import { evaluateOperationalTruth } from "./operationalTruthGate.js";

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
  catch { return fallback; }
}

export function mergeProductionShadowSourceCandidates(synthesisRows = [], universeRows = []) {
  const sourceByRoute = new Map();
  const sourceByIdentity = new Map();
  for (const candidate of Array.isArray(universeRows) ? universeRows : []) {
    const identity = strictIdentity(candidate);
    if (!identity) continue;
    sourceByRoute.set(identity.routeKey, candidate);
    if (!sourceByIdentity.has(identity.identityKey)) {
      sourceByIdentity.set(identity.identityKey, candidate);
    }
  }
  return (Array.isArray(synthesisRows) ? synthesisRows : []).map((row) => {
    const identity = strictIdentity(row);
    const sourceCandidate = identity
      ? sourceByRoute.get(identity.routeKey) ||
        (!identity.poolAddress ? sourceByIdentity.get(identity.identityKey) : null) ||
        {}
      : {};
    const merged = { ...sourceCandidate, ...row };
    if (!strictIdentity(sourceCandidate)) return merged;
    return {
      ...merged,
      chain: sourceCandidate.chain,
      tokenAddress: sourceCandidate.tokenAddress,
      poolAddress: sourceCandidate.poolAddress,
      sourceObservedAt: sourceCandidate.sourceObservedAt || null,
      priceUsd: sourceCandidate.priceUsd,
      liquidityUsd: sourceCandidate.liquidityUsd,
      marketCap: sourceCandidate.marketCap,
      marketCapUsd: sourceCandidate.marketCapUsd ?? sourceCandidate.marketCap,
      volume24h: sourceCandidate.volume24h,
      volume24hUsd: sourceCandidate.volume24hUsd ?? sourceCandidate.volume24h,
      roundTripExecutionCostBps: sourceCandidate.roundTripExecutionCostBps,
      executionReferenceSizeUsd: sourceCandidate.executionReferenceSizeUsd,
      executionCostProvenance: sourceCandidate.executionCostProvenance,
      executionProofEligibility: sourceCandidate.executionProofEligibility || null,
      buyPriceImpactPct: sourceCandidate.buyPriceImpactPct,
      sellPriceImpactPct: sourceCandidate.sellPriceImpactPct,
      routeQualityScore: sourceCandidate.routeQualityScore,
    };
  });
}

export function runProductionShadowCycle(options = {}) {
  const now = options.now || new Date().toISOString();
  const manifest = buildProductionRunManifest({
    now,
    codeCommitSha: options.codeCommitSha,
    modelVersion: options.modelVersion,
    featureSchemaVersion: options.featureSchemaVersion,
    config: {
      genomeWindowsMinutes: options.genomeWindowsMinutes || [15, 60, 360, 1440, 4320],
      researchBudgetUnits: Number(options.researchBudgetUnits || 100),
      matchabilityCandidateLimit: Number(options.matchabilityCandidateLimit || 250),
      shadowOnly: true,
    },
  });
  writeProductionRunManifest(manifest);

  const observations = options.observations || loadIgnitionTwinObservations({ limit: 20000 });
  const universe = options.universe || loadEdgeCandidateUniverse();
  const universePreflight = evaluateOperationalTruth(
    { universe },
    {
      now,
      scope: "shadow-universe",
      maximumUniverseAgeMinutes: Number(options.maximumSourceAgeMinutes || 90),
    },
  );
  if (!universePreflight.pass) {
    const blockedState = "PRODUCTION_SHADOW_BLOCKED_UNIVERSE_PRECONDITION";
    const shadowReport = {
      schemaVersion: 1,
      generatedAt: now,
      runId: manifest.runId,
      state: blockedState,
      candidates: [],
      universePreflight,
      policy: {
        shadowOnly: true,
        productionRankingInfluence: false,
        automaticTrading: false,
        missingOrStalePointInTimeEvidenceFailsClosed: true,
      },
    };
    const prospectiveCohort = {
      state: "PROSPECTIVE_COHORT_NOT_CAPTURED_UNIVERSE_PRECONDITION_FAILED",
      episodes: [],
      audit: { blockers: universePreflight.blockers },
      persistence: { file: null, attempted: 0, saved: 0, duplicates: 0, rejectedIntegrity: 0 },
    };
    const observability = {
      schemaVersion: 1,
      generatedAt: now,
      state: "BLOCKED",
      blockers: universePreflight.blockers,
    };
    writeAtomicJson("reports/production-shadow-ranking.json", shadowReport);
    writeAtomicJson("reports/prospective-edge-cohort-capture.json", {
      schemaVersion: 1,
      generatedAt: now,
      state: prospectiveCohort.state,
      cohortId: null,
      strategy: null,
      audit: prospectiveCohort.audit,
      persistence: prospectiveCohort.persistence,
      policy: {
        freshPointInTimeSourceRequired: true,
        automaticTrading: false,
        automaticPromotion: false,
      },
    });
    writeAtomicJson("reports/production-observability.json", observability);
    return {
      manifest,
      multiscale: { candidates: [] },
      convergence: [],
      shadowReport,
      observability,
      marketObservationAudit: { state: "NOT_ATTEMPTED_UNIVERSE_PRECONDITION_FAILED", saved: 0 },
      prospectiveCohort,
      universePreflight,
    };
  }
  const marketObservationAudit = appendExactMarketObservations(universe.candidates || [], {
    observedAt: universe.generatedAt || null,
    asOf: now,
    maximumObservationAgeMinutes: Number(options.maximumSourceAgeMinutes || 90),
    source: "edge-candidate-universe",
  });
  const exactMarketHistory = loadExactMarketObservations();
  const legacyExactSnapshots = toOutcomeSnapshots(loadOutcomeSnapshots());
  const outcomeSnapshots = toOutcomeSnapshots([...legacyExactSnapshots, ...exactMarketHistory]);
  const outcomeLab = options.outcomeLab || runIgnitionOutcomeLab({
    observations,
    snapshots: outcomeSnapshots,
    writeReport: true,
  });
  const adaptive = options.adaptive || runEdgeAdaptiveLearningCycle({ writeReports: true });

  const multiscale = buildMultiscaleIgnitionGenome(
    observations,
    outcomeLab,
    universe.candidates || [],
    { asOf: now, windowsMinutes: manifest.config.genomeWindowsMinutes }
  );
  writeAtomicJson("reports/ignition-genome-multiscale.json", multiscale);

  const priorSnapshots = readJson("data/ignition-genome-history.json", []) || [];
  const convergence = rankGenomeConvergence(multiscale.candidates, priorSnapshots, { now });
  writeAtomicJson("reports/ignition-genome-convergence.json", {
    schemaVersion: 1, generatedAt: now, candidates: convergence
  });

  const synthesis = options.synthesis || runEdgeOpportunitySynthesis({ writeReport: true });
  const merged = mergeProductionShadowSourceCandidates(
    synthesis.candidates || [],
    universe.candidates || [],
  ).map((row) => {
    const multi = multiscale.candidates.find((m) => m.identityKey === row.identityKey);
    const conv = convergence.find((m) => m.identityKey === row.identityKey)?.convergence;
    return {
      ...row,
      multiscaleGenome: multi || null,
      convergence: conv || null,
      confidencePct: multi?.averageConfidencePct ?? row.ignitionGenome?.confidencePct ?? 0,
      evidenceCoveragePct: row.research?.diagnostic?.coverage
        ? row.research.diagnostic.coverage * 100
        : null,
    };
  });

  const researchBudget = routeResearchBudget(merged, {
    budgetUnits: manifest.config.researchBudgetUnits,
  });
  const matchability = buildProspectiveMatchabilityIndex(
    researchBudget.ranked,
    {
      now,
      sourceObservedAt: universe.generatedAt || null,
      codeCommitSha: manifest.codeCommitSha,
      modelVersion: manifest.modelVersion,
      featureSchemaVersion: manifest.featureSchemaVersion,
      configFingerprint: manifest.configFingerprint,
      requireRowSourceObservedAt: true,
      maximumCandidates: manifest.config.matchabilityCandidateLimit,
      maximumSelections: 25,
      maxControls: Number(options.maxProspectiveControls || 3),
      maximumSourceAgeMinutes: Number(options.maximumSourceAgeMinutes || 90),
      existingEpisodes: options.prospectiveCohortEpisodes,
    },
  );
  const diverseMatchableCandidates = diversifyResearchQueue(
    matchability.entries
      .filter((entry) => entry.diagnostics.treatmentState === "ELIGIBLE" && entry.eligibleControls.length)
      .map((entry) => entry.candidate),
    { maxItems: Math.min(100, manifest.config.matchabilityCandidateLimit) },
  );
  const matchableSelection = selectMatchableProspectiveTreatments(matchability, {
    preferredCandidates: diverseMatchableCandidates,
    maximumSelections: 25,
    maxControls: Number(options.maxProspectiveControls || 3),
  });
  const reservedControlsByTreatment = matchableSelection.reservations.reduce((result, reservation) => {
    const controls = result[reservation.treatmentRouteKey] || [];
    controls.push(reservation.controlRouteKey);
    result[reservation.treatmentRouteKey] = controls;
    return result;
  }, {});
  const shadow = matchableSelection.selected.map((row) => {
    const multi = row.multiscaleGenome || {};
    const convergence = row.convergence || {};
    const forwardScenario = simulateForwardDistribution(row, { paths: 2048 });
    const adaptiveProbability = Math.max(
      0,
      Math.min(1, Number(row.adaptiveResearchScore || row.combinedResearchScore || 0) / 100)
    );
    const genomeProbability = Math.max(
      0,
      Math.min(1, Number(multi.probability50Pct || row.ignitionGenome?.probability50Pct || 0) / 100)
    );
    const scenarioProbability = Math.max(
      0,
      Math.min(1, Number(forwardScenario.probability50Pct || 0) / 100)
    );
    const convergenceProbability = Math.max(
      0,
      Math.min(1, 0.35 + Number(convergence.convergenceStrength || 0) * 0.45)
    );

    const ensemble = combineExpertPredictions([
      {
        name: "ADAPTIVE_SIGNAL",
        probability: adaptiveProbability,
        hitRate: 0.5,
        calibrationError: 0.25,
        samples: 20,
      },
      {
        name: "MULTISCALE_GENOME",
        probability: genomeProbability,
        hitRate: 0.5,
        calibrationError: 0.20,
        samples: Math.max(10, Number(multi.availableScales || 0) * 10),
      },
      {
        name: "GENOME_CONVERGENCE",
        probability: convergenceProbability,
        hitRate: 0.5,
        calibrationError: 0.25,
        samples: Number(convergence.observations || 0),
      },
      {
        name: "FORWARD_SCENARIO",
        probability: scenarioProbability,
        hitRate: 0.5,
        calibrationError: 0.30,
        samples: 20,
      },
    ]);

    return {
      ...row,
      expertEnsemble: ensemble,
      forwardScenario,
      productionInfluence: false,
      shadowOnly: true,
      proofEligibility: row.executionProofEligibility?.state === "NET_PROOF_ELIGIBLE"
        ? "NET_PROOF_ELIGIBLE"
        : "RESEARCH_ONLY_EXECUTION_EVIDENCE_UNAVAILABLE",
    };
  });

  const shadowReport = {
    schemaVersion: 1,
    generatedAt: now,
    runId: manifest.runId,
    candidates: shadow,
    matchability: {
      audit: matchability.audit,
      selection: matchableSelection.audit,
      reservations: matchableSelection.reservations,
    },
    researchOnlyUnmatchableCandidates: matchability.entries
      .filter((entry) => entry.diagnostics.treatmentState !== "ELIGIBLE" || !entry.eligibleControls.length)
      .sort((left, right) => right.score - left.score || left.routeKey.localeCompare(right.routeKey))
      .slice(0, 25)
      .map((entry) => ({
        identityKey: entry.identityKey,
        routeKey: entry.routeKey,
        chain: entry.candidate.chain,
        tokenAddress: entry.candidate.tokenAddress,
        poolAddress: entry.candidate.poolAddress,
        symbol: entry.candidate.symbol || null,
        score: entry.score,
        proofEligibility: entry.candidate.executionProofEligibility?.state || "RESEARCH_ONLY_EXECUTION_EVIDENCE_UNAVAILABLE",
        matchability: entry.diagnostics,
      })),
    proofEligibility: {
      netProofEligible: shadow.filter((row) => row.proofEligibility === "NET_PROOF_ELIGIBLE").length,
      researchOnlyExecutionEvidenceUnavailable: shadow.filter((row) => row.proofEligibility !== "NET_PROOF_ELIGIBLE").length,
    },
    policy: {
      shadowOnly: true,
      productionRankingInfluence: false,
      automaticTrading: false,
      guardedLiveRankingBypassAllowed: false,
    },
  };
  writeAtomicJson("reports/production-shadow-ranking.json", shadowReport);
  const prospectiveCohort = captureProspectiveEdgeCohort(
    shadow,
    matchability.entries.map((entry) => entry.candidate),
    {
      now,
      sourceObservedAt: universe.generatedAt || null,
      runId: manifest.runId,
      codeCommitSha: manifest.codeCommitSha,
      modelVersion: manifest.modelVersion,
      featureSchemaVersion: manifest.featureSchemaVersion,
      configFingerprint: manifest.configFingerprint,
      controlPoolDefinition: "SAME_SCORING_PIPELINE_UNSELECTED_V1",
      requireRowSourceObservedAt: true,
      maximumSelections: 25,
      maxControls: Number(options.maxProspectiveControls || 3),
      maximumSourceAgeMinutes: Number(options.maximumSourceAgeMinutes || 90),
      existingEpisodes: options.prospectiveCohortEpisodes,
      reservedControlsByTreatment,
      persist: options.persistProspectiveCohorts !== false,
      file: options.prospectiveCohortFile,
    },
  );
  writeAtomicJson("reports/prospective-edge-cohort-capture.json", {
    schemaVersion: 1,
    generatedAt: now,
    state: prospectiveCohort.state,
    cohortId: prospectiveCohort.cohortId || null,
    strategy: prospectiveCohort.strategy,
    audit: prospectiveCohort.audit,
    persistence: {
      file: prospectiveCohort.persistence.file,
      attempted: prospectiveCohort.persistence.attempted,
      saved: prospectiveCohort.persistence.saved,
      duplicates: prospectiveCohort.persistence.duplicates,
      rejectedIntegrity: prospectiveCohort.persistence.rejectedIntegrity || 0,
    },
    policy: {
      exactIdentityRequired: true,
      freshPointInTimeSourceRequired: true,
      immutableCodeVersionRequired: true,
      frozenEpisodeContentHashRequired: true,
      controlsFromSameScoringPipeline: true,
      controlsFrozenBeforeOutcomes: true,
      postOutcomeControlSelectionProhibited: true,
      automaticTrading: false,
      automaticPromotion: false,
    },
  });
  const prospectiveShadowPredictions = prospectiveCohort.episodes
    .filter((episode) => episode.role === "TREATMENT")
    .flatMap((episode) => {
      const exactRoute = shadow.find((candidate) => {
        const identity = strictIdentity(candidate);
        return identity?.routeKey === episode.routeKey;
      });
      const tokenScoped = episode.poolAddress
        ? null
        : shadow.find((candidate) => strictIdentity(candidate)?.identityKey === episode.identityKey);
      const row = exactRoute || tokenScoped;
      if (!row) return [];
      return [{
      schemaVersion: 1,
      runId: manifest.runId,
      generatedAt: now,
      decisionAt: now,
      sourceObservedAt: episode.sourceObservedAt,
      sourceAgeMinutesAtDecision: episode.sourceAgeMinutesAtDecision,
      strategyVersion: episode.strategyVersion,
      strategyFingerprint: episode.strategyFingerprint,
      prospectiveEdgeCohortId: episode.cohortId,
      prospectiveEdgeEpisodeId: episode.episodeId,
      controlsFrozenBeforeOutcomes: true,
      identityKey: episode.identityKey,
      symbol: row.symbol || null,
      chain: episode.chain,
      tokenAddress: episode.tokenAddress,
      poolAddress: episode.poolAddress,
      priceUsd: episode.signalPriceUsd,
      liquidityUsd: row.liquidityUsd ?? row.activeLiquidityUsd ?? row.stableExitLiquidityUsd ?? null,
      marketCapUsd: row.marketCapUsd ?? row.marketCap ?? row.circulatingMarketCapUsd ?? null,
      volume24hUsd: row.volume24hUsd ?? row.volume24h ?? row.dexVolume24hUsd ?? null,
      evidenceCoveragePct: row.evidenceCoveragePct ?? row.ignitionGenome?.confidencePct ?? row.multiscaleGenome?.averageConfidencePct ?? null,
      globalMarketRegimeState: row.globalMarketRegimeState ?? row.marketRegime ?? null,
      portfolioResearchScore: row.portfolioResearchScore ?? null,
      combinedResearchScore: row.combinedResearchScore ?? null,
      verifiedSignals: row.verifiedSignals || [],
      expertEnsembleProbability50Pct: row.expertEnsemble?.probabilityPct ?? null,
      probability25Pct: row.forwardScenario?.probability25Pct ?? null,
      probability50Pct: row.forwardScenario?.probability50Pct ?? null,
      probability100Pct: row.forwardScenario?.probability100Pct ?? null,
      probabilityLoss20Pct: row.forwardScenario?.probabilityLoss20Pct ?? null,
      shadowOnly: true,
      productionInfluence: false,
      automaticTrading: false,
      automaticPromotion: false,
    }];
    });
  appendJsonlDurable(
    "data/production-shadow-predictions.jsonl",
    prospectiveShadowPredictions,
  );

  const observability = buildProductionObservability({
    adaptive: { state: adaptive.registry?.matureTreatmentEpisodes ? "HEALTHY" : "INSUFFICIENT_HISTORY" },
    genome: { state: multiscale.candidates.length ? "HEALTHY" : "INSUFFICIENT_HISTORY" },
    synthesis: { state: shadow.length ? "HEALTHY" : "INSUFFICIENT_HISTORY" },
  }, { now });
  writeAtomicJson("reports/production-observability.json", observability);

  const historyRow = multiscale.candidates.map((row) => ({
    ...row,
    observedAt: now,
  }));
  const nextHistory = [...priorSnapshots, ...historyRow].slice(-5000);
  writeAtomicJson("data/ignition-genome-history.json", nextHistory);

  return {
    manifest,
    multiscale,
    convergence,
    shadowReport,
    observability,
    marketObservationAudit,
    prospectiveCohort,
    universePreflight,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = runProductionShadowCycle();
    console.log(JSON.stringify({
      runId: result.manifest.runId,
      candidates: result.shadowReport.candidates.length,
      health: result.observability.state,
      prospectiveCohort: result.prospectiveCohort.state,
      prospectiveTreatments: result.prospectiveCohort.audit?.treatmentsFrozen || 0,
      prospectiveControls: result.prospectiveCohort.audit?.controlsFrozen || 0,
      top: result.shadowReport.candidates.slice(0, 10).map((row) => ({
        symbol: row.symbol,
        score: row.portfolioResearchScore,
        convergence: row.convergence?.state || null,
        p50: row.forwardScenario?.probability50Pct || null,
        p100: row.forwardScenario?.probability100Pct || null,
      })),
    }, null, 2));
    if (result.universePreflight && !result.universePreflight.pass) process.exitCode = 2;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
