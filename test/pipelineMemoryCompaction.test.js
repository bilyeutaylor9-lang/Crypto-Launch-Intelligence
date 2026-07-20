import test from "node:test";
import assert from "node:assert/strict";
import { runEngine } from "../src/intelligencePipeline.js";

test("pipeline engine metadata keeps a bounded per-project status map while health tracks all engines", async () => {
  const previousLimit = process.env.MAX_PROJECT_ENGINE_RESULTS;
  process.env.MAX_PROJECT_ENGINE_RESULTS = "2";

  try {
    let projects = [{ name: "Memory Token", symbol: "MEM" }];
    projects = await runEngine("Memory Pass One", (rows) => rows, projects);
    const engineResultsMap = projects[0].engineResults;

    projects = await runEngine("Memory Pass Two", (rows) => rows, projects);
    projects = await runEngine("Memory Pass Three", (rows) => rows, projects);

    assert.strictEqual(projects[0].engineResults, engineResultsMap);
    assert.equal(projects[0].engineHealth.enginesAttempted, 3);
    assert.equal(projects[0].engineHealth.enginesSuccessful, 3);
    assert.equal(Object.keys(projects[0].engineResults).length, 2);
    assert.equal(projects[0].engineResults.memoryPassOne, undefined);
    assert.equal(projects[0].engineResults.memoryPassTwo.status, "SUCCESS");
    assert.equal(projects[0].engineResults.memoryPassThree.status, "SUCCESS");
  } finally {
    if (previousLimit === undefined) {
      delete process.env.MAX_PROJECT_ENGINE_RESULTS;
    } else {
      process.env.MAX_PROJECT_ENGINE_RESULTS = previousLimit;
    }
  }
});

test("pipeline stores compact engine records instead of embedding bulky evidence payloads per project", async () => {
  const projects = await runEngine(
    "Verbose Failure",
    () => {
      throw new Error("provider exploded with a large payload");
    },
    [{ name: "Compact Token", symbol: "CMP" }]
  );

  const record = projects[0].engineResults.verboseFailure;
  assert.equal(record.status, "FAILED");
  assert.equal(record.evidence, undefined);
  assert.equal(record.failureReason, "provider exploded with a large payload");
  assert.equal(projects[0].engineHealth.enginesFailed, 1);
});
