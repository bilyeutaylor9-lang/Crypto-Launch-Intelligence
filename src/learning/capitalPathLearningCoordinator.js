import fs from "node:fs";
import path from "node:path";

import {
  appendCapitalPathFeatureSnapshots,
  resolveCapitalPathOutcomes,
  loadCapitalPathTrainingExamples,
  summarizeCapitalPathLearningStore,
} from "../data/capitalPathLearningStore.js";
import { extractUnassignedCapitalPathFeatures } from "./capitalPathFeatureExtractor.js";
import { trainCapitalDestinationPathModel, inferCapitalDestinations } from "./capitalDestinationPathModel.js";
import { attachCapitalPathPredictions } from "../engines/capitalPathPredictionEngine.js";
import { runCapitalPathWalkForwardLab } from "./capitalPathWalkForwardLab.js";

const MODEL_REPORT = path.resolve("reports", "capital-destination-path-model.json");
const LAB_REPORT = path.resolve("reports", "capital-path-walk-forward.json");

function modelSummary(model = {}) {
  return {
    schemaVersion: model.schemaVersion || 1,
    trainedAt: model.trainedAt || null,
    asOf: model.asOf || null,
    trainingExamples: model.trainingExamples || 0,
    uniqueWallets: model.uniqueWallets || 0,
    uniqueDestinations: model.uniqueDestinations || 0,
    policy: model.policy || null,
    shadowOnly: true,
    rankingInfluence: false,
  };
}

export function writeCapitalPathReports(result = {}) {
  fs.mkdirSync(path.dirname(MODEL_REPORT), { recursive: true });
  fs.writeFileSync(MODEL_REPORT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    store: result.store || null,
    model: modelSummary(result.model),
    currentFeatureCount: result.features?.length || 0,
    emittedPredictions: (result.predictionRows || []).filter((row) => row.prediction?.state === "PREDICTED_DESTINATION_SHADOW").length,
    predictions: result.predictionRows || [],
    policy: "Path predictions are experimental shadow evidence and cannot trigger Loaded Vacuum, Ignition phase transitions, or production ranking in v9.",
  }, null, 2));
  fs.writeFileSync(LAB_REPORT, JSON.stringify(result.lab || {}, null, 2));
  return { modelReport: MODEL_REPORT, labReport: LAB_REPORT };
}

export function processCapitalPathLearning(projects = [], radar = {}, options = {}) {
  let featureSave = { saved: 0 };
  let outcomeSave = { saved: 0 };
  if (options.persist !== false) {
    featureSave = appendCapitalPathFeatureSnapshots(radar, options);
    outcomeSave = resolveCapitalPathOutcomes(projects, options);
  }
  const examples = Array.isArray(options.examples) ? options.examples : loadCapitalPathTrainingExamples({ limit: options.historyLimit || 50_000 });
  const model = trainCapitalDestinationPathModel(examples, { asOf: options.asOf || new Date().toISOString() });
  const features = extractUnassignedCapitalPathFeatures(radar, options);
  const predictionRows = inferCapitalDestinations(features, model, projects, options.modelOptions || options);
  const enrichedProjects = attachCapitalPathPredictions(projects, predictionRows);
  const lab = options.runLab === false ? null : runCapitalPathWalkForwardLab(examples, options.walkForward || options);
  const result = {
    status: examples.length ? "MODEL_EVALUATED_SHADOW" : "INSUFFICIENT_RESOLVED_HISTORY",
    featureSave,
    outcomeSave,
    store: options.persist === false ? null : summarizeCapitalPathLearningStore(),
    examples,
    model,
    features,
    predictionRows,
    lab,
    projects: enrichedProjects,
    shadowOnly: true,
    rankingInfluence: false,
    loadedVacuumInfluence: false,
  };
  if (options.writeReport !== false) result.reports = writeCapitalPathReports(result);
  return result;
}

export { MODEL_REPORT as CAPITAL_PATH_MODEL_REPORT_FILE, LAB_REPORT as CAPITAL_PATH_WALK_FORWARD_REPORT_FILE };
