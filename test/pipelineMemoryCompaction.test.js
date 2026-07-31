import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProgressivePipelineStageContext,
  prepareProjectsForPipelineRun,
  runEngine,
  runStagedPipelineEngine,
} from "../src/intelligencePipeline.js";

test("new pipeline runs discard persisted engine audits and stamp current scan identity", () => {
  const [project] = prepareProjectsForPipelineRun(
    [
      {
        symbol: "FRESH",
        engineResults: { oldEngine: { status: "FAILED" } },
        engineHealth: { pipelineStatus: "FAILED" },
        engineDataContractHealth: {
          status: "OUTPUT_CONTRACT_MISMATCH",
          engines: { oldEngine: { scanRunId: "scan_old" } },
        },
      },
    ],
    { scanRunId: "scan_current" }
  );

  assert.equal(project.engineResults, undefined);
  assert.equal(project.engineHealth, undefined);
  assert.equal(project.engineDataContractHealth, undefined);
  assert.equal(project.pipelineScanRunId, "scan_current");
});

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

test("progressive pipeline stage runs deep engines only on deep-selected projects and merges them back", async () => {
  const projects = [
    { standardSelectionIdentityKey: "base:a", symbol: "A" },
    { standardSelectionIdentityKey: "base:b", symbol: "B" },
    { standardSelectionIdentityKey: "base:c", symbol: "C" },
  ];
  const context = buildProgressivePipelineStageContext(
    {
      progressiveFunnel: true,
      analysisFunnelSelection: {
        deep: [projects[1]],
      },
    },
    projects
  );

  const output = await runStagedPipelineEngine(
    "Deep Memory Probe",
    (rows) => rows.map((project) => ({ ...project, deepEngineTouched: true })),
    projects,
    {},
    "deep",
    context
  );

  assert.equal(output.length, 3);
  assert.equal(output[0].deepEngineTouched, undefined);
  assert.equal(output[1].deepEngineTouched, true);
  assert.equal(output[2].deepEngineTouched, undefined);
  assert.equal(output[1].engineResults.deepMemoryProbe.status, "SUCCESS");
});

test("engine runner has a default timeout when no global timeout is configured", async () => {
  const previousGlobal = process.env.ENGINE_TIMEOUT_MS;
  const previousDefault = process.env.DEFAULT_ENGINE_TIMEOUT_MS;
  delete process.env.ENGINE_TIMEOUT_MS;
  process.env.DEFAULT_ENGINE_TIMEOUT_MS = "1";

  try {
    const projects = await runEngine(
      "Tiny Timeout",
      () => new Promise(() => {}),
      [{ symbol: "TIMEOUT" }]
    );

    assert.equal(projects[0].engineResults.tinyTimeout.status, "FAILED");
    assert.match(projects[0].engineResults.tinyTimeout.failureReason, /timed out/i);
  } finally {
    if (previousGlobal === undefined) {
      delete process.env.ENGINE_TIMEOUT_MS;
    } else {
      process.env.ENGINE_TIMEOUT_MS = previousGlobal;
    }
    if (previousDefault === undefined) {
      delete process.env.DEFAULT_ENGINE_TIMEOUT_MS;
    } else {
      process.env.DEFAULT_ENGINE_TIMEOUT_MS = previousDefault;
    }
  }
});
