// src/ml/trainOnline.js
//
// Incremental trainer – updates the model every time you call “node src/cli.js train”.
// Uses Vowpal Wabbit for online learning.
//
import vowpal from "vowpal-wabbit";
import { fetchTrainingRows } from "../storage/db.js";
import fs from "fs";

const MODEL_PATH = "models/priceUp.model";

// Make sure the models folder exists
fs.mkdirSync("models", { recursive: true });

export async function trainOnline() {
  // Pull the most-recent 5 000 snapshots from SQLite
  const rows = fetchTrainingRows(5000);

  if (!rows.length) {
    console.warn("No data to train on yet -- run the ingest step first.");
    return;
  }

  // Very simple label: 1 if token price rose ≥ 5 % in 24 h, else 0
  function label(r) {
    return r.priceChange24h >= 5 ? 1 : 0;
  }

  // Create a Vowpal-Wabbit instance.
  // If a model file already exists, VW will keep learning from it.
  const vw = vowpal({
    modelFile: fs.existsSync(MODEL_PATH) ? MODEL_PATH : undefined,
    quiet: true,
  });

  // Feed each row into the online learner
  rows.forEach((r) => {
    vw.learnSync(
      `${label(r)} |f p:${r.priceUsd} l:${r.liquidityUsd} v:${r.volume24h}`
    );
  });

  // Persist updated weights for next time
  await vw.saveSync(MODEL_PATH);
  console.log(`✅ Online model updated on ${rows.length} samples → ${MODEL_PATH}`);
}
