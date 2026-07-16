import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
  mergeLocalAIResearchIntoProjects,
  processQueuedLocalAIResearch,
  queueLocalAIResearch,
} from "../src/brain/localBrainBatchEngine.js";
import { loadLocalAIResearchQueue } from "../src/brain/localAIQueueStore.js";
import { summarizeLocalAIPerformance } from "../src/learning/localAIMemoryStore.js";

function project() {
  return {
    name: "Batch Fixture",
    symbol: "BATCH",
    chain: "base",
    permanentProjectKey: "base:0xbatch",
    contractAddress: "0xbatch",
    identityVerified: true,
    finalSelectionState: "RESEARCH_ONLY",
    finalIntegrityVerdict: "RESEARCH_REQUIRED",
    liquidityUsd: 80_000,
    volume24h: 120_000,
    pipelineScore: 89,
    dataConfidenceScore: 84,
    discoverySources: ["dexscreener", "geckoterminal", "github"],
    smartMoneyAccumulationScore: 76,
    catalystScore: 73,
    riskScore: 20,
  };
}

function localChat(messages) {
  if (messages[0].content.includes("Evidence Judge")) {
    return Promise.resolve({
      content: JSON.stringify({
        verdict: "RESEARCH_MORE",
        summary: "The supplied evidence merits additional public-data verification.",
        keyRisks: ["holder data is not supplied"],
        missingEvidence: ["holder distribution"],
        nextChecks: ["Verify holder distribution from a public explorer."],
        confidence: 52,
      }),
    });
  }

  return Promise.resolve({
    content: JSON.stringify({
      assessment: "Research only; do not promote without more proof.",
      evidence: ["sourceProvenance.usableSources"],
      risks: ["holder data is not supplied"],
      missingEvidence: ["holder distribution"],
      nextChecks: ["Verify the contract and holder distribution."],
      confidence: 51,
    }),
  });
}

test("local AI worker completes a queued mission and keeps its result advisory", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "local-ai-batch-"));
  const queue = { filePath: path.join(directory, "queue.json") };
  const memory = { filePath: path.join(directory, "memory.json") };
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const queued = queueLocalAIResearch([project()], { queue, lightLimit: 1, deepLimit: 1 });
  assert.equal(queued.projects[0].localAIStatus, "QUEUED");
  assert.equal(queued.assignments.length, 1);

  const processed = await processQueuedLocalAIResearch({
    queue,
    memory,
    limit: 1,
    availability: { reachable: true, modelInstalled: true, config: { model: "fixture" } },
    config: { model: "fixture" },
    chat: localChat,
  });
  const merged = mergeLocalAIResearchIntoProjects(queued.projects, processed.completed);

  assert.equal(processed.status, "COMPLETE");
  assert.equal(processed.completed.length, 1);
  assert.equal(merged[0].localAIStatus, "COMPLETE");
  assert.equal(merged[0].localAIAdvisoryOnly, true);
  assert.equal(merged[0].localAIVerdict, "RESEARCH_MORE");
  assert.equal(loadLocalAIResearchQueue(queue).tasks[0].status, "COMPLETE");
  assert.equal(summarizeLocalAIPerformance(memory).agents[0].influenceWeight, 1);
});

test("Ollama unavailability leaves queued work intact for a later worker", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "local-ai-unavailable-"));
  const queue = { filePath: path.join(directory, "queue.json") };
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  queueLocalAIResearch([project()], { queue, lightLimit: 1, deepLimit: 1 });
  const result = await processQueuedLocalAIResearch({
    queue,
    availability: { reachable: false, modelInstalled: false, config: { model: "fixture" }, error: "offline" },
  });

  assert.equal(result.status, "UNAVAILABLE");
  assert.equal(result.completed.length, 0);
  assert.equal(loadLocalAIResearchQueue(queue).tasks[0].status, "QUEUED");
});

test("a stale queue lock is recovered before a scanner enqueues new research", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "local-ai-lock-"));
  const queue = { filePath: path.join(directory, "queue.json") };
  const lockPath = `${queue.filePath}.lock`;
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  fs.writeFileSync(lockPath, "stale");
  const staleAt = new Date(Date.now() - 10 * 60_000);
  fs.utimesSync(lockPath, staleAt, staleAt);

  const queued = queueLocalAIResearch([project()], { queue, lightLimit: 1, deepLimit: 1 });

  assert.equal(queued.assignments.length, 1);
  assert.equal(fs.existsSync(lockPath), false);
  assert.equal(loadLocalAIResearchQueue(queue).tasks[0].status, "QUEUED");
});
