import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOutcomeCollectionWatchdog,
  runOutcomeCollectionWatchdog,
} from "../src/ops/runOutcomeCollectionWatchdog.js";

const NOW = "2026-08-28T05:00:00.000Z";

test("outcome collection watchdog accepts a recent successful main probe", () => {
  const report = buildOutcomeCollectionWatchdog({
    now: NOW,
    branch: "main",
    maximumAgeMinutes: 180,
    runs: [{
      id: 17,
      head_sha: "abc123",
      head_branch: "main",
      conclusion: "success",
      updated_at: "2026-08-28T04:50:00.000Z",
    }],
  });

  assert.equal(report.state, "OUTCOME_COLLECTION_HEALTHY");
  assert.equal(report.latestSuccessfulProbe.runId, 17);
  assert.equal(report.latestSuccessfulProbe.ageMinutes, 10);
});

test("outcome collection watchdog flags missing or stale successful probes", () => {
  const stale = buildOutcomeCollectionWatchdog({
    now: NOW,
    maximumAgeMinutes: 180,
    runs: [{
      id: 17,
      head_branch: "main",
      conclusion: "success",
      updated_at: "2026-08-28T00:00:00.000Z",
    }],
  });
  const missing = buildOutcomeCollectionWatchdog({ now: NOW, runs: [] });

  assert.equal(stale.state, "OUTCOME_COLLECTION_STALE");
  assert.equal(missing.state, "OUTCOME_COLLECTION_STALE");
});

test("outcome collection watchdog reports GitHub API failure as invalid", async () => {
  const report = await runOutcomeCollectionWatchdog({
    now: NOW,
    repository: "owner/repo",
    token: "test-token",
    fetch: async () => ({ ok: false, status: 503 }),
    writeReport: false,
  });

  assert.equal(report.state, "OUTCOME_COLLECTION_INVALID");
  assert.match(report.error, /HTTP 503/);
});

test("outcome collection watchdog consumes the success-only GitHub workflow history", async () => {
  let requestedUrl = null;
  const report = await runOutcomeCollectionWatchdog({
    now: NOW,
    repository: "owner/repo",
    token: "test-token",
    fetch: async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => ({ workflow_runs: [{
          id: 18,
          head_sha: "def456",
          head_branch: "main",
          conclusion: "success",
          updated_at: "2026-08-28T04:40:00.000Z",
        }] }),
      };
    },
    writeReport: false,
  });

  assert.match(requestedUrl, /outcome-probe\.yml\/runs\?status=success/);
  assert.equal(report.state, "OUTCOME_COLLECTION_HEALTHY");
});
