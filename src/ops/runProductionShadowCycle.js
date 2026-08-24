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
import { strictIdentity } from "../production/productionMath.js";

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
  catch { return fallback; }
}

export function runProductionShadowCycle(options = {}) {
  const now = options.now || new Date().toISOString();
  const manifest = buildProductionRunManifest({
    now,
    config: {
      genomeWindowsMinutes: options.genomeWindowsMinutes || [15, 60, 360, 1440, 4320],
      researchBudgetUnits: Number(options.researchBudgetUnits || 100),
      shadowOnly: true,
    },
  });
  writeProductionRunManifest(manifest);

  const observations = options.observations || loadIgnitionTwinObservations({ limit: 20000 });
  const universe = options.universe || loadEdgeCandidateUniverse();
  const marketObservationAudit = appendExactMarketObservations(universe.candidates || [], {
    observedAt: universe.generatedAt || null,
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
  const merged = (synthesis.candidates || []).map((row) => {
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
  const diversified = diversifyResearchQueue(researchBudget.selected, { maxItems: 25 });
  const shadow = diversified.map((row) => {
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
    };
  });

  const shadowReport = {
    schemaVersion: 1,
    generatedAt: now,
    runId: manifest.runId,
    candidates: shadow,
    policy: {
      shadowOnly: true,
      productionRankingInfluence: false,
      automaticTrading: false,
      guardedLiveRankingBypassAllowed: false,
    },
  };
  writeAtomicJson("reports/production-shadow-ranking.json", shadowReport);
  appendJsonlDurable(
    "data/production-shadow-predictions.jsonl",
    shadow.filter((row) => strictIdentity(row) && Number(row.priceUsd ?? row.marketData?.priceUsd) > 0).map((row) => ({
      schemaVersion: 1,
      runId: manifest.runId,
      generatedAt: now,
      decisionAt: now,
      identityKey: row.identityKey,
      symbol: row.symbol || null,
      chain: row.chain || null,
      tokenAddress: row.tokenAddress || null,
      poolAddress: row.poolAddress || null,
      priceUsd: row.priceUsd ?? row.marketData?.priceUsd ?? null,
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
    }))
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

  return { manifest, multiscale, convergence, shadowReport, observability, marketObservationAudit };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = runProductionShadowCycle();
    console.log(JSON.stringify({
      runId: result.manifest.runId,
      candidates: result.shadowReport.candidates.length,
      health: result.observability.state,
      top: result.shadowReport.candidates.slice(0, 10).map((row) => ({
        symbol: row.symbol,
        score: row.portfolioResearchScore,
        convergence: row.convergence?.state || null,
        p50: row.forwardScenario?.probability50Pct || null,
        p100: row.forwardScenario?.probability100Pct || null,
      })),
    }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
