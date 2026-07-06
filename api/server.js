// api/server.js
//
// Fastify prediction API that serves the online-learning model
// and exposes Prometheus metrics.
//

import Fastify from "fastify";
import fs from "fs";
import prom from "prom-client";

// ml-logistic-regression is CommonJS, so import default then pull the class
import mlLogReg from "ml-logistic-regression";
const { LogisticRegression } = mlLogReg;

import { Matrix } from "ml-matrix";

const PORT = process.env.PORT || 3000;
const MODEL_PATH = "models/priceUp.json";

// -----------------------------------------------------------------------------
// Load the trained model (exit early if it isn't there yet)
// -----------------------------------------------------------------------------
if (!fs.existsSync(MODEL_PATH)) {
  console.error(
    `Model file ${MODEL_PATH} missing. Run "node src/cli.js train" locally first.`
  );
  process.exit(1);
}
const model = LogisticRegression.load(
  JSON.parse(fs.readFileSync(MODEL_PATH))
);

// -----------------------------------------------------------------------------
// Fastify instance + Prometheus histogram
// -----------------------------------------------------------------------------
const app = Fastify();
const reqHistogram = new prom.Histogram({
  name: "cli_predict_duration_seconds",
  help: "Latency of /predict endpoint",
});

// -----------------------------------------------------------------------------
// /predict?p=<priceUsd>&l=<liquidityUsd>&v=<volume24h>
// -----------------------------------------------------------------------------
app.get("/predict", async (req, reply) => {
  const end = reqHistogram.startTimer();

  const p = Number(req.query.p);
  const l = Number(req.query.l);
  const v = Number(req.query.v);

  if (![p, l, v].every(Number.isFinite)) {
    end();
    reply.code(400).send({ error: "need numeric query params p, l, v" });
    return;
  }

  const prob = model.predict(Matrix.rowVector([p, l, v])).to1DArray()[0];
  end();
  return { prob };
});

// -----------------------------------------------------------------------------
// /metrics — Prometheus scrape endpoint
// -----------------------------------------------------------------------------
app.get("/metrics", async (_, reply) => {
  reply.type("text/plain");
  return prom.register.metrics();
});

// -----------------------------------------------------------------------------
// Start server
// -----------------------------------------------------------------------------
app.listen({ port: PORT }, () =>
  console.log(
    `🖥  Prediction API ready → http://localhost:${PORT}/predict?p=0.05&l=10000&v=7000`
  )
);
