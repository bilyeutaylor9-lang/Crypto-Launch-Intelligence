import fs from "node:fs";
import path from "node:path";

import { loadEdgeCandidateUniverse } from "../data/edgeCandidateUniverseStore.js";
import {
  appendChainCapitalRadarObservations,
  chainCapitalRadarHistoryFor,
} from "../data/chainCapitalRadarObservationStore.js";
import { processCapitalPathLearning } from "../learning/capitalPathLearningCoordinator.js";
import { processCapitalCommitmentLearning } from "../learning/capitalCommitmentCoordinator.js";
import { observeChainWideCapitalRadar } from "../sensors/chainWideCapitalRadarSensor.js";

const REPORT_FILE = path.resolve("reports", "edge-acquisition-cycle.json");

function envNumber(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function runEdgeAcquisitionCycle(options = {}) {
  const universe = options.universe || loadEdgeCandidateUniverse(options.universeStore || {});
  const projects = Array.isArray(universe?.candidates) ? universe.candidates : [];
  if (!projects.length) {
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      state: "WAITING_FOR_EXACT_CANDIDATE_UNIVERSE",
      candidates: 0,
      rankingInfluence: false,
      automaticTrading: false,
    };
    if (options.writeReport !== false) {
      fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
      fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);
    }
    return report;
  }

  const chains = [...new Set(projects.map((project) => project.chain).filter(Boolean))];
  const historyByChain = Object.fromEntries(chains.map((chain) => [
    chain,
    chainCapitalRadarHistoryFor(chain, {
      limit: envNumber("IGNITION_CAPITAL_RADAR_HISTORY_LIMIT", 500),
    }),
  ]));
  const radar = await observeChainWideCapitalRadar(projects, {
    historyByChain,
    lookbackMinutes: envNumber("IGNITION_CAPITAL_RADAR_LOOKBACK_MINUTES", 70),
    maxLookbackBlocks: envNumber("IGNITION_CAPITAL_RADAR_MAX_LOOKBACK_BLOCKS", 2_400),
    continuityMaxLookbackBlocks: envNumber(
      "IGNITION_CAPITAL_RADAR_CONTINUITY_MAX_LOOKBACK_BLOCKS",
      12_000
    ),
    maxLogs: envNumber("IGNITION_CAPITAL_RADAR_MAX_LOGS", 50_000),
    maxWallets: envNumber("IGNITION_CAPITAL_RADAR_MAX_WALLETS", 120),
    maxTrackedWallets: envNumber("IGNITION_CAPITAL_RADAR_MAX_TRACKED_WALLETS", 160),
    minTransferUsd: envNumber("IGNITION_CAPITAL_RADAR_MIN_TRANSFER_USD", 5_000),
  });
  const persisted = options.persist === false
    ? { saved: 0 }
    : appendChainCapitalRadarObservations(radar.chains || []);
  const pathLearning = processCapitalPathLearning(projects, radar, {
    persist: options.persist !== false,
    writeReport: options.writeReport !== false,
  });
  const commitment = processCapitalCommitmentLearning(pathLearning.projects, radar, pathLearning, {
    persist: options.persist !== false,
    writeReport: options.writeReport !== false,
  });
  const observed = (radar.chains || []).filter((row) => [
    "OBSERVED_CHAIN_CAPITAL_RADAR",
    "OBSERVED_WITH_LOG_CAP",
    "NO_QUALIFYING_FUNDING",
  ].includes(row.status));
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    state: observed.length ? "EDGE_ACQUISITION_OBSERVED" : "EDGE_ACQUISITION_DEGRADED",
    candidates: projects.length,
    observedChains: observed.length,
    continuousChains: observed.filter((row) => row.coverageComplete).length,
    continuityGaps: observed.reduce((sum, row) => sum + Number(row.continuityGapBlocks || 0), 0),
    qualifyingTransfers: observed.reduce((sum, row) => sum + Number(row.qualifyingTransferCount || 0), 0),
    fundedRecipients: observed.reduce((sum, row) => sum + Number(row.fundedRecipientCount || 0), 0),
    carriedWallets: observed.reduce((sum, row) => sum + Number(row.carriedWalletCount || 0), 0),
    preparedWallets: observed.reduce((sum, row) => sum + Number(row.preparedWalletCount || 0), 0),
    radarObservationsSaved: persisted.saved || 0,
    pathFeatureSnapshots: pathLearning.store?.featureSnapshots || 0,
    pathTrainingExamples: pathLearning.model?.trainingExamples || 0,
    commitmentFeatureSnapshots: commitment.store?.featureSnapshots || 0,
    commitmentTrainingExamples: commitment.model?.trainingExamples || 0,
    frozenTreatmentEpisodes: commitment.edgeProductionEpisodeCapture?.treatments || 0,
    frozenControlEpisodes: commitment.edgeProductionEpisodeCapture?.controls || 0,
    rankingInfluence: false,
    automaticTrading: false,
    policy: "This cycle closes observation gaps and matures shadow evidence. It cannot change scores, gates, ranking, or create an order.",
  };
  if (options.writeReport !== false) {
    fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
    fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    console.log(JSON.stringify(await runEdgeAcquisitionCycle(), null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

export const EDGE_ACQUISITION_REPORT_FILE = REPORT_FILE;
