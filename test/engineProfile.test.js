import test from "node:test";
import assert from "node:assert/strict";

import { engineProfileReport } from "../src/config/engineProfileConfig.js";
import { runEngine } from "../src/intelligencePipeline.js";

test("tenx engine profile skips non-critical advisory engines with an audit record", async () => {
  const projects = await runEngine(
    "AI Portfolio War Room",
    () => {
      throw new Error("should not run in tenx profile");
    },
    [{ symbol: "LEAN" }],
    { engineProfile: "tenx" }
  );

  const record = Object.values(projects[0].engineResults).find(
    (item) => item.engineName === "AI Portfolio War Room"
  );

  assert.equal(record.status, "SKIPPED");
  assert.match(record.failureReason, /skips/i);
  assert.equal(projects[0].engineHealth.enginesSkipped, 1);
});

test("tenx engine profile still runs deterministic high-upside evidence engines", async () => {
  const projects = await runEngine(
    "7-Day Asymmetric Research",
    (rows) => rows.map((project) => ({ ...project, asymmetricTouched: true })),
    [{ symbol: "ASYM" }],
    { engineProfile: "tenx" }
  );

  assert.equal(projects[0].asymmetricTouched, true);
  assert.equal(projects[0].engineResults["7DayAsymmetricResearch"].status, "SUCCESS");
});

test("engine profile report documents the active high-upside mode", () => {
  const report = engineProfileReport("tenx", {});

  assert.equal(report.id, "tenx");
  assert.equal(report.skipLocalAIResearch, true);
  assert.ok(report.skippedEngines.includes("AI Portfolio War Room"));
  assert.ok(report.requiredEngines.includes("7-Day Asymmetric Research"));
  assert.ok(report.requiredEngines.includes("Scalp Microstructure"));
});
