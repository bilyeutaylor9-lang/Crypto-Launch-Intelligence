import fs from "node:fs";

import { synthesizeEdgeResearchQueue } from "./runEdgeOpportunitySynthesis.js";
import { simulateForwardDistribution } from "../production/forwardScenarioSimulator.js";
import { auditReproducibility } from "../production/reproducibilityAudit.js";
import { writeAtomicJson } from "../production/atomicArtifactStore.js";

function read(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

export function runReproducibilityAudit(options = {}) {
  const adaptive = read("reports/edge-research-priority.json", {});
  const genome = read("reports/ignition-genome.json", {});
  const fixedNow = options.now || "2026-01-01T00:00:00.000Z";

  const synthesisA = synthesizeEdgeResearchQueue(adaptive, genome, { now: fixedNow });
  const synthesisB = synthesizeEdgeResearchQueue(adaptive, genome, { now: fixedNow });
  const synthesisAudit = auditReproducibility(synthesisA, synthesisB, {
    writeReport: false,
    now: fixedNow,
  });

  const top = synthesisA.candidates?.[0] || {
    priceUsd: 1,
    liquidityUsd: 100000,
    ignitionGenome: { probability50Pct: 30, failureProbabilityPct: 20 },
  };
  const simulationA = simulateForwardDistribution(top, { paths: 512, seed: 1729 });
  const simulationB = simulateForwardDistribution(top, { paths: 512, seed: 1729 });
  const simulationAudit = auditReproducibility(simulationA, simulationB, {
    writeReport: false,
    now: fixedNow,
  });

  const report = {
    schemaVersion: 1,
    generatedAt: options.generatedAt || new Date().toISOString(),
    pass: synthesisAudit.pass && simulationAudit.pass,
    state:
      synthesisAudit.pass && simulationAudit.pass
        ? "REPRODUCIBILITY_PASS"
        : "REPRODUCIBILITY_FAIL",
    synthesis: synthesisAudit,
    forwardSimulation: simulationAudit,
  };
  writeAtomicJson("reports/reproducibility-audit.json", report);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = runReproducibilityAudit();
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 2;
}
