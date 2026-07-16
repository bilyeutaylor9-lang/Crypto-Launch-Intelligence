import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { runLocalAIResearchStage } from "../src/intelligencePipeline.js";

test("pipeline local AI stage queues advisory research without changing deterministic selection", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "local-ai-stage-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const project = {
    name: "Pipeline Fixture",
    symbol: "PIPE",
    chain: "base",
    permanentProjectKey: "base:0xpipe",
    contractAddress: "0xpipe",
    identityVerified: true,
    finalSelectionState: "RESEARCH_ONLY",
    finalIntegrityVerdict: "RESEARCH_REQUIRED",
    finalBlockingReasons: [],
    liquidityUsd: 100_000,
    pipelineScore: 90,
    dataConfidenceScore: 82,
    discoverySources: ["dexscreener", "geckoterminal"],
    smartMoneyAccumulationScore: 74,
    catalystScore: 72,
    riskScore: 19,
  };

  const [queued] = await runLocalAIResearchStage([project], {
    localAI: {
      queue: true,
      queueOptions: { filePath: path.join(directory, "queue.json") },
    },
  });

  assert.equal(queued.finalSelectionState, "RESEARCH_ONLY");
  assert.equal(queued.pipelineScore, 90);
  assert.equal(queued.localAIStatus, "QUEUED");
  assert.equal(queued.localAIAdvisoryOnly, true);
});

test("pipeline records an unavailable local model without treating queued research as completed", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "local-ai-unavailable-stage-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const project = {
    name: "Unavailable Fixture",
    symbol: "DOWN",
    chain: "base",
    permanentProjectKey: "base:0xdown",
    contractAddress: "0xdown",
    identityVerified: true,
    finalSelectionState: "RESEARCH_ONLY",
    finalIntegrityVerdict: "RESEARCH_REQUIRED",
    finalBlockingReasons: [],
    liquidityUsd: 100_000,
    pipelineScore: 90,
    dataConfidenceScore: 82,
    discoverySources: ["dexscreener", "geckoterminal"],
    smartMoneyAccumulationScore: 74,
    catalystScore: 72,
    riskScore: 19,
  };

  const [queued] = await runLocalAIResearchStage([project], {
    localAI: {
      queue: true,
      inline: true,
      queueOptions: { filePath: path.join(directory, "queue.json") },
      availability: { reachable: false, modelInstalled: false, config: { model: "fixture" }, error: "offline" },
    },
  });

  assert.equal(queued.localAIStatus, "QUEUED");
  assert.equal(queued.localAIExecutionStatus, "UNAVAILABLE");
  assert.equal(queued.localAIAvailabilityError, "offline");
});
