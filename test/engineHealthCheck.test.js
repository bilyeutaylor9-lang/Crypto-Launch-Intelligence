import test from "node:test";
import assert from "node:assert/strict";

import { runEngineHealthCheck } from "../src/engineHealthCheck.js";
import { getEngineContracts } from "../src/kernel/engineContractManifest.js";

test("engine health check executes every declared core contract engine", async () => {
  const results = await runEngineHealthCheck({}, { timeoutMs: 12_000 });
  const executed = results.filter((result) => result.executionStatus === "EXECUTED");
  const failed = results.filter((result) => result.status === "FAIL");

  assert.equal(failed.length, 0);
  assert.equal(executed.length, getEngineContracts().length);
  assert.ok(results.some((result) => result.status === "IMPORT_ONLY"));
});
