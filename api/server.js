// api/server.js
import Fastify from "fastify";
import fs from "fs";
import prom from "prom-client";
import { LogisticRegression } from "ml-logistic-regression";
import { Matrix } from "ml-matrix";

const PORT = process.env.PORT || 3000;
const MODEL_PATH = "models/priceUp.json";

if (!fs.existsSync(MODEL_PATH)) {
  console.error(`Model file ${MODEL_PATH} missing. Run "node src/cli.js train" locally first.`);
  process.exit(1);
}
const model = LogisticRegression.load(JSON.parse(fs.readFileSync(MODEL_PATH)));

const app = Fastify();
const reqHistogram = new prom.Histogram({
  name: "cli_predict_duration_seconds",
  help: "Latency of /predict",
});

app.get("/predict", async (req, reply) => {
  const end = reqHistogram.startTimer();
  const p = Number(req.query.p);
  const l = Number(req.query.l);
  const v = Number(req.query.v);

  if (![p, l, v].every(Number.isFinite)) {
    reply.code(400).send({ error: "need numeric ?p ?l ?v" });
    return;
  }

  const prob = model.predict(Matrix.rowVector([p, l, v])).to1DArray()[0];
  end();
  return { prob };
});

app.get("/metrics", async (_, reply) => {
  reply.type("text/plain");
  return prom.register.metrics();
});

app.listen({ port: PORT }, () =>
  console.log(`🖥  Prediction API ready on http://localhost:${PORT}/predict`)
);
