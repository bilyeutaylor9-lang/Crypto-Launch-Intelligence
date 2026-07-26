import test from "node:test";
import assert from "node:assert/strict";

import {
  attachEngineDataContractAudit,
  findEngineContractForName,
  hasMeasuredValue,
  postflightEngineDataContract,
  preflightEngineDataContract,
  summarizeEngineDataContractHealth,
} from "../src/kernel/engineDataContractGovernor.js";

const CONTRACT = {
  id: "testEngine",
  phase: "test",
  affectsFinalDecision: true,
  canBlockCandidate: true,
  inputContract: {
    requiredAny: [["liquidityUsd"], ["volume24h"]],
    optional: ["priceUsd"],
  },
  outputContract: {
    requiredAny: [["testScore"], ["testVerdict"]],
    scoreFields: ["testScore"],
  },
};

test("engine data contract governor treats explicit zero as measured data", () => {
  const project = {
    liquidityUsd: 0,
    volume24h: 0,
    priceUsd: 0,
    testScore: 0,
    testVerdict: "MEASURED_ZERO",
  };

  assert.equal(hasMeasuredValue(project, "liquidityUsd"), true);

  const preflight = preflightEngineDataContract("Test Engine", [project], {
    contract: CONTRACT,
    criticality: "REQUIRED",
  });
  const postflight = postflightEngineDataContract("Test Engine", [project], {
    contract: CONTRACT,
  });

  assert.equal(preflight.status, "READY");
  assert.equal(preflight.averageCoveragePct, 100);
  assert.equal(postflight.status, "OUTPUT_READY");
});

test("engine data contract governor opens source plans for missing inputs", () => {
  const preflight = preflightEngineDataContract("Test Engine", [{ symbol: "MISS" }], {
    contract: CONTRACT,
    criticality: "REQUIRED",
  });

  assert.equal(preflight.status, "DATA_STARVED");
  assert.equal(preflight.starvedProjects, 1);
  assert.ok(preflight.topMissingInputs.some((item) => item.fields === "liquidityUsd"));
  assert.ok(preflight.topMissingInputs.some((item) => item.fields === "volume24h"));
  assert.ok(preflight.nextSources.some((item) => item.source === "DexScreener"));
});

test("engine data contract governor detects output contract mismatches", () => {
  const postflight = postflightEngineDataContract("Test Engine", [{ liquidityUsd: 1, volume24h: 2 }], {
    contract: CONTRACT,
  });

  assert.equal(postflight.status, "OUTPUT_CONTRACT_MISMATCH");
  assert.equal(postflight.outputMissingProjects, 1);
  assert.ok(postflight.topMissingOutputs.some((item) => item.fields === "testScore"));
});

test("engine data contract health summary rolls engine gaps into project health", () => {
  const project = { symbol: "GAP", liquidityUsd: 1 };
  const preflight = preflightEngineDataContract("Test Engine", [project], {
    contract: CONTRACT,
    criticality: "REQUIRED",
  });
  const postflight = postflightEngineDataContract("Test Engine", [{ ...project, testScore: 50 }], {
    contract: CONTRACT,
  });
  const [audited] = attachEngineDataContractAudit([{ ...project, testScore: 50 }], preflight, postflight);
  const summary = summarizeEngineDataContractHealth([audited]);

  assert.equal(audited.engineDataContractHealth.status, "OUTPUT_CONTRACT_MISMATCH");
  assert.equal(summary.status, "OUTPUT_CONTRACT_GAPS");
  assert.equal(summary.enginesWithOutputGaps, 1);
  assert.equal(summary.enginesWithInputGaps, 0);
});

test("pipeline display names resolve to existing engine contracts", () => {
  assert.equal(findEngineContractForName("Project Identity Graph")?.id, "projectIdentity");
  assert.equal(findEngineContractForName("Execution Proof")?.id, "executionProof");
  assert.equal(findEngineContractForName("High-Upside Scalp Classification")?.id, "highUpsideScalpClassification");
});
