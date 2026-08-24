import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runBackupRestoreAudit } from "../src/production/backupRestoreAudit.js";
import { auditReproducibility } from "../src/production/reproducibilityAudit.js";
import { buildExactIdentityHealth } from "../src/production/exactIdentityHealth.js";
import { buildOutcomeCaptureHealth } from "../src/production/outcomeCaptureHealth.js";
import { __liveEnvironmentAuditHooks } from "../src/production/liveEnvironmentAudit.js";

test("local backup restore verifies byte-identical evidence", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "backup-audit-"));
  fs.mkdirSync(path.join(dir, "data"), { recursive: true });
  fs.writeFileSync(path.join(dir, "data/edge-candidate-universe.json"), '{"a":1}\n');
  const report = runBackupRestoreAudit({
    root: dir,
    paths: ["data/edge-candidate-universe.json"],
    writeReport: false,
  });
  assert.equal(report.pass, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("reproducibility ignores volatile run metadata", () => {
  const left = { generatedAt: "a", runId: "1", candidates: [{ score: 70 }] };
  const right = { generatedAt: "b", runId: "2", candidates: [{ score: 70 }] };
  const report = auditReproducibility(left, right, { writeReport: false });
  assert.equal(report.pass, true);
});

test("exact identity health passes valid Base identities", () => {
  const token = "0x" + "1".repeat(40);
  const pool = "0x" + "2".repeat(40);
  const report = buildExactIdentityHealth(
    [{ chain: "base", tokenAddress: token, poolAddress: pool }],
    { writeReport: false }
  );
  assert.equal(report.exactIdentityRate, 1);
});

test("outcome capture measures mature exact horizon coverage", () => {
  const episodes = [
    { episodeId: "a", signalObservedAt: "2026-01-01T00:00:00Z" },
    { episodeId: "b", signalObservedAt: "2026-01-01T00:00:00Z" },
  ];
  const outcomes = [{ episodeId: "a", horizonHours: 24 }];
  const report = buildOutcomeCaptureHealth(episodes, outcomes, {
    now: "2026-01-03T00:00:00Z",
    writeReport: false,
  });
  assert.equal(report.captureRate, 0.5);
});

test("secret audit never returns secret value", () => {
  const row = __liveEnvironmentAuditHooks.secretState(
    { BASE_RPC_URL: "https://secret.example/rpc?key=abc" },
    "BASE_RPC_URL"
  );
  assert.equal(row.configured, true);
  assert.equal("value" in row, false);
  assert.equal(row.valueExposed, false);
});
