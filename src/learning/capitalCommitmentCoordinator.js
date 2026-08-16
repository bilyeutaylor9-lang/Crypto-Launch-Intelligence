import { appendCommittedLoadedVacuumObservations } from "./committedLoadedVacuumObservationStore.js";
import fs from "node:fs";
import path from "node:path";

import { appendCapitalCommitmentFeatures, resolveCapitalCommitmentOutcomes, loadCapitalCommitmentExamples, summarizeCapitalCommitmentStore } from "../data/capitalCommitmentEpisodeStore.js";
import { extractCapitalCommitmentFeatures } from "./capitalCommitmentFeatureExtractor.js";
import { trainCapitalCommitmentModel, inferCapitalCommitments } from "./capitalCommitmentModel.js";
import { buildCapitalConservationLedger } from "../engines/capitalConservationLedgerEngine.js";
import { attachCapitalArrivalIntelligence } from "../engines/capitalArrivalCurveEngine.js";
import { runCapitalCommitmentWalkForwardLab } from "./capitalCommitmentWalkForwardLab.js";

const REPORT = path.resolve("reports", "capital-commitment-arrival.json");
const LAB = path.resolve("reports", "capital-commitment-walk-forward.json");
const HORIZONS = [0.25, 1, 3, 6, 12, 24, 72];

export function processCapitalCommitmentLearning(projects = [], radar = {}, pathLearning = {}, options = {}) {
  const featureSave = options.persist === false ? { saved: 0 } : appendCapitalCommitmentFeatures(radar, options);
  const outcomeSave = options.persist === false ? { saved: 0 } : resolveCapitalCommitmentOutcomes(projects, options);
  const examples = Array.isArray(options.examples) ? options.examples : loadCapitalCommitmentExamples({ limit: options.historyLimit || 50_000 });
  const model = trainCapitalCommitmentModel(examples, { asOf: options.asOf || new Date().toISOString(), horizonsHours: options.horizonsHours || HORIZONS });
  const features = extractCapitalCommitmentFeatures(radar, options);
  const commitmentRows = inferCapitalCommitments(features, model, options.modelOptions || options);
  const pathRows = pathLearning?.predictionRows || [];
  const ledgersByHorizon = Object.fromEntries((options.horizonsHours || HORIZONS).map((h) => [h, buildCapitalConservationLedger(commitmentRows, pathRows, { horizonHours: h })]));
  const enriched = attachCapitalArrivalIntelligence(projects, ledgersByHorizon);
  const validationObservationSave = options.persist === false ? { saved: 0 } : appendCommittedLoadedVacuumObservations(enriched, { observedAt: options.observedAt || options.asOf || new Date().toISOString() });
  const lab = options.runLab === false ? null : runCapitalCommitmentWalkForwardLab(examples, options.walkForward || options);
  const result = {
    status: examples.length ? "COMMITMENT_MODEL_EVALUATED_SHADOW" : "INSUFFICIENT_COMMITMENT_HISTORY",
    featureSave, outcomeSave, validationObservationSave,
    store: options.persist === false ? null : summarizeCapitalCommitmentStore(),
    examples, model, features, commitmentRows, ledgersByHorizon, lab,
    projects: enriched,
    shadowOnly: true,
    rankingInfluence: false,
    loadedVacuumInfluence: false,
  };
  if (options.writeReport !== false) {
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify({
      generatedAt: new Date().toISOString(), status: result.status, store: result.store,
      model: { trainingExamples: model.trainingExamples, uniqueWallets: model.uniqueWallets, horizonsHours: model.horizonsHours },
      sixHourLedger: ledgersByHorizon[6] || null,
      projects: enriched.map((project) => ({ canonicalProjectId: project.canonicalProjectId || null, symbol: project.symbol || null, capitalArrivalIntelligence: project.capitalArrivalIntelligence || null })),
      policy: "V10 is shadow-only. Probability-weighted arrival capital cannot alter production ranking, Loaded Vacuum, route, identity, safety, or Ignition phase decisions.",
    }, null, 2));
    fs.writeFileSync(LAB, JSON.stringify(lab || {}, null, 2));
  }
  return result;
}

export { REPORT as CAPITAL_COMMITMENT_REPORT_FILE, LAB as CAPITAL_COMMITMENT_LAB_FILE };
