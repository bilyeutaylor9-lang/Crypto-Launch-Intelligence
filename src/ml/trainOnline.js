// src/ml/trainOnline.js
import { fetchTrainingRows } from "../storage/db.js";
import fs from "fs";
import { LogisticRegression } from "ml-logistic-regression";
import { Matrix } from "ml-matrix";

const MODEL_PATH = "models/priceUp.json";
fs.mkdirSync("models", { recursive: true });

export async function trainOnline() {
  const rows = fetchTrainingRows(5000);
  if (!rows.length) {
    console.warn("No data to train on yet — run ingest first.");
    return;
  }

  // X matrix (features) and Y vector (labels)
  const X = rows.map((r) => [
    r.priceUsd,
    r.liquidityUsd,
    r.volume24h,
  ]);
  const Y = rows.map((r) => (r.priceChange24h >= 5 ? 1 : 0));

  const logreg = new LogisticRegression({
    numSteps: 500,
    learningRate: 5e-4,
  });
  logreg.train(new Matrix(X), Matrix.columnVector(Y));

  // save model params
  fs.writeFileSync(MODEL_PATH, JSON.stringify(logreg.toJSON(), null, 2));
  console.log(
    `✅ Logistic-regression model trained on ${rows.length} samples → ${MODEL_PATH}`
  );
}
