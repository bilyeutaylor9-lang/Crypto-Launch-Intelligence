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

test("engine data contract audits retain the current scan identity", () => {
  const input = { liquidityUsd: 1, volume24h: 2 };
  const output = { ...input, testScore: 50, testVerdict: "MEASURED" };
  const preflight = preflightEngineDataContract("Test Engine", [input], {
    contract: CONTRACT,
    scanRunId: "scan_contract_current",
  });
  const postflight = postflightEngineDataContract("Test Engine", [output], {
    contract: CONTRACT,
    scanRunId: "scan_contract_current",
  });
  const [audited] = attachEngineDataContractAudit([output], preflight, postflight);

  assert.equal(
    audited.engineDataContractHealth.engines.testEngine.scanRunId,
    "scan_contract_current"
  );
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
  assert.equal(findEngineContractForName("Execution Proof Recovery")?.id, "executionProofRecovery");
  assert.equal(findEngineContractForName("Smart Wallet")?.id, "smartWallet");
  assert.equal(findEngineContractForName("Smart Wallet Performance")?.id, "smartWalletPerformance");
  assert.equal(findEngineContractForName("Smart Money Accumulation")?.id, "smartMoneyAccumulation");
  assert.equal(findEngineContractForName("Smart Wallet Arrival")?.id, "smartWalletArrival");
  assert.equal(findEngineContractForName("Smart Wallet Novelty")?.id, "smartWalletNovelty");
  assert.equal(findEngineContractForName("Social Acceleration")?.id, "socialAcceleration");
  assert.equal(findEngineContractForName("Opportunity Timing Refresh")?.id, "opportunityTiming");
  assert.equal(findEngineContractForName("High-Upside Scalp Classification")?.id, "highUpsideScalpClassification");
});

test("engine contracts never resolve by unsafe substring similarity", () => {
  assert.equal(findEngineContractForName("Smart Wallet Experimental"), null);
  assert.equal(findEngineContractForName("Execution Proof Recovery Preview"), null);
  assert.equal(findEngineContractForName("Acceleration Marketing"), null);
});
