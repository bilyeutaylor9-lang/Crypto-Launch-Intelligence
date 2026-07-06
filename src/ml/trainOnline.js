// src/ml/trainOnline.js
import { fetchTrainingRows } from "../storage/db.js";
import fs from "fs";
import mlLogReg from "ml-logistic-regression";
import { Matrix } from "ml-matrix";

const { LogisticRegression } = mlLogReg;

const MODEL_PATH = "models/priceUp.json";
const STATS_PATH = "models/trainingStats.json";
const HISTORY_PATH = "models/learningHistory.json";

fs.mkdirSync("models", { recursive: true });

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalize(value, max = 1) {
  const number = safeNumber(value);
  if (!max || max <= 0) return 0;
  return Math.max(0, Math.min(number / max, 1));
}

function buildFeatures(row = {}) {
  return [
    normalize(row.priceUsd, 10),
    normalize(row.liquidityUsd, 10_000_000),
    normalize(row.volume24h, 10_000_000),
    normalize(row.priceChange24h + 100, 200),

    normalize(row.buyPressure24h || 0, 1),
    normalize(row.totalTransactions24h || 0, 100_000),

    normalize(row.smartMoneyScore || 0, 100),
    normalize(row.communityScore || 0, 100),
    normalize(row.developerScore || 0, 100),
    normalize(row.githubScore || 0, 100),
    normalize(row.narrativeScore || 0, 100),
    normalize(row.whaleScore || 0, 100),
    normalize(row.holderGrowthScore || 0, 100),
    normalize(row.liquidityScore || 0, 100),
    normalize(row.overallScore || 0, 100),
  ];
}

function label(row = {}) {
  return safeNumber(row.priceChange24h) >= 5 ? 1 : 0;
}

function calculateAccuracy(model, X, Y) {
  let correct = 0;

  for (let i = 0; i < X.length; i++) {
    const prediction = model.predict(Matrix.rowVector(X[i])).to1DArray()[0];
    const predictedLabel = prediction >= 0.5 ? 1 : 0;

    if (predictedLabel === Y[i]) {
      correct++;
    }
  }

  return X.length ? correct / X.length : 0;
}

function readJsonArray(path) {
  if (!fs.existsSync(path)) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(path, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function trainOnline() {
  const rows = fetchTrainingRows(5000);

  if (!rows.length) {
    console.warn("No data to train on yet — run ingest first.");
    return;
  }

  const X = rows.map(buildFeatures);
  const Y = rows.map(label);

  const model = new LogisticRegression({
    numSteps: 750,
    learningRate: 0.01,
  });

  model.train(new Matrix(X), Matrix.columnVector(Y));

  const accuracy = calculateAccuracy(model, X, Y);
  const trainedAt = new Date().toISOString();

  fs.writeFileSync(MODEL_PATH, JSON.stringify(model.toJSON(), null, 2));

  const stats = {
    model: "logistic-regression",
    trainedAt,
    samples: rows.length,
    features: X[0]?.length || 0,
    accuracy: Number(accuracy.toFixed(4)),
    label: "priceChange24h >= 5",
    modelPath: MODEL_PATH,
  };

  fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2));

  const history = readJsonArray(HISTORY_PATH);
  history.push(stats);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history.slice(-250), null, 2));

  console.log(
    `✅ Model trained on ${rows.length} samples | accuracy ${stats.accuracy} → ${MODEL_PATH}`
  );
}
