import fs from "node:fs";
import path from "node:path";

import { appendCapitalPathFeatureSnapshots, resolveCapitalPathOutcomes, loadCapitalPathTrainingExamples, summarizeCapitalPathLearningStore } from "../data/capitalPathLearningStore.js";
import { trainCapitalDestinationPathModel, inferCapitalDestinations } from "../learning/capitalDestinationPathModel.js";
import { extractUnassignedCapitalPathFeatures } from "../learning/capitalPathFeatureExtractor.js";
import { attachCapitalPathPredictions } from "../engines/capitalPathPredictionEngine.js";
import { runCapitalPathWalkForwardLab } from "../learning/capitalPathWalkForwardLab.js";

function extractProjects(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["projects", "opportunities", "candidates", "results", "tokens", "data", "rows"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

const projectFile = process.argv[2] || process.env.IGNITION_SENSOR_INPUT || path.resolve("reports", "ignition-raw-sensors.json");
const radarFile = process.argv[3] || process.env.IGNITION_CAPITAL_RADAR_REPORT || path.resolve("reports", "chain-capital-radar.json");
const modelReport = path.resolve("reports", "capital-destination-path-model.json");
const labReport = path.resolve("reports", "capital-path-walk-forward.json");

if (!fs.existsSync(projectFile) || !fs.existsSync(radarFile)) {
  console.error(`Capital Path Learning requires ${projectFile} and ${radarFile}.`);
  process.exitCode = 1;
} else {
  const projects = extractProjects(JSON.parse(fs.readFileSync(projectFile, "utf8")));
  const radar = JSON.parse(fs.readFileSync(radarFile, "utf8"));
  const featuresSaved = appendCapitalPathFeatureSnapshots(radar);
  const outcomesSaved = resolveCapitalPathOutcomes(projects);
  const examples = loadCapitalPathTrainingExamples({ limit: 50_000 });
  const model = trainCapitalDestinationPathModel(examples);
  const currentFeatures = extractUnassignedCapitalPathFeatures(radar);
  const predictionRows = inferCapitalDestinations(currentFeatures, model, projects);
  const enriched = attachCapitalPathPredictions(projects, predictionRows);
  const lab = runCapitalPathWalkForwardLab(examples);
  fs.mkdirSync(path.dirname(modelReport), { recursive: true });
  fs.writeFileSync(modelReport, JSON.stringify({
    generatedAt: new Date().toISOString(),
    store: summarizeCapitalPathLearningStore(),
    model: { ...model, groups: undefined },
    currentFeatureCount: currentFeatures.length,
    emittedPredictions: predictionRows.filter((row) => row.prediction.state === "PREDICTED_DESTINATION_SHADOW").length,
    predictions: predictionRows,
    projects: enriched.map((project) => ({ canonicalProjectId: project.canonicalProjectId || null, symbol: project.symbol || null, capitalPathPrediction: project.capitalPathPrediction || null })),
  }, null, 2));
  fs.writeFileSync(labReport, JSON.stringify(lab, null, 2));
  console.log(JSON.stringify({
    projectFile,
    radarFile,
    projects: projects.length,
    featuresSaved: featuresSaved.saved,
    outcomesSaved: outcomesSaved.saved,
    trainingExamples: examples.length,
    currentFeatures: currentFeatures.length,
    emittedPredictions: predictionRows.filter((row) => row.prediction.state === "PREDICTED_DESTINATION_SHADOW").length,
    promotionState: lab.promotionState,
    modelReport,
    labReport,
  }, null, 2));
}

export { extractProjects };
