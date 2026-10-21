import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { forwardEvidenceRemoteExitCode } from "../src/production/forwardEvidenceRemoteStore.js";

const CLI = fileURLToPath(new URL("../src/ops/runForwardEvidenceRemote.js", import.meta.url));
const CIRCUIT_FILE = "data/remote-operational-circuits.json";
const DATABASE_REPORT = { state: "REMOTE_FORWARD_EVIDENCE_FAILED", circuitState: "REMOTE_DATABASE_SIZE_OUTAGE",
  providerCode: "exceed_db_size_quota", detectedAt: "2026-10-21T18:44:54.161Z" };
const PRELOAD = `
import fs from "node:fs";
const mode = process.env.FIXTURE_MODE;
const code = mode === "egress" ? "exceed_egress_quota" : "exceed_db_size_quota";
const message = "Service for this project is restricted due to the following violations: " + code + ". " +
  "The project owner must upgrade their plan or remove spend caps to restore service.";
if (mode === "persistence-error") {
  const rename = fs.renameSync;
  fs.renameSync = (source, target) => {
    if (String(target).endsWith("remote-operational-circuits.json")) throw new Error("fixture persistence denied");
    return rename(source, target);
  };
}
globalThis.fetch = async (input, init) => {
  if (new URL(String(input)).origin !== "https://cli-fixture.invalid") throw new Error("Unexpected fixture endpoint");
  fs.appendFileSync(process.env.FIXTURE_REQUESTS, JSON.stringify({ method: init.method, mode }) + "\\n");
  let body = JSON.stringify({ message }), status = 403;
  if (mode === "read-admitted") {
    body = JSON.stringify([{ ledger_name: "production-market-observations", record_id: "existing-record", content_hash: "a".repeat(64) }]);
    status = 200;
  } else if (mode === "generic") body = JSON.stringify({ code: "403", message: "Forbidden" });
  else if (mode === "substring") body = JSON.stringify({ message: code });
  else if (mode === "html") body = "<html>" + message + "</html>";
  else if (mode === "malformed") body = '{"message":' + JSON.stringify(message);
  return new Response(body, { status, headers: { "content-type": "application/json" } });
};
`;
const PRELOAD_URL = `data:text/javascript,${encodeURIComponent(PRELOAD)}`;
const WORKFLOW = `
"$FIXTURE_NODE" --import "$FIXTURE_PRELOAD" "$FIXTURE_CLI" restore
"$FIXTURE_NODE" --input-type=module -e 'import fs from "node:fs"; fs.appendFileSync(process.env.FIXTURE_COLLECTOR, "ran\\n");'
`;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forward-evidence-cli-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "data"));
  const pending = new Map([
    ["production-market-observations.jsonl", '{"observationKey":"pending"}\n'],
    ["prospective-edge-cohorts.jsonl", '{"episodeId":"pending-cohort"}\n'],
    ["outbox-fixture.jsonl", '{"state":"PENDING","receipt":null}\n'],
  ].map(([name, bytes]) => [path.join(root, "data", name), Buffer.from(bytes)]));
  for (const [file, bytes] of pending) fs.writeFileSync(file, bytes);
  const requests = path.join(root, "requests.jsonl"), collector = path.join(root, "local-collector-ran");
  const env = { ...process.env, NODE_OPTIONS: "", SUPABASE_ENABLED: "true", SUPABASE_URL: "https://cli-fixture.invalid",
    SUPABASE_SECRET_KEY: "offline-fixture-secret", SUPABASE_SERVICE_ROLE_KEY: "", SUPABASE_PUBLISHABLE_KEY: "",
    FIXTURE_NODE: process.execPath, FIXTURE_PRELOAD: PRELOAD_URL, FIXTURE_CLI: CLI,
    FIXTURE_REQUESTS: requests, FIXTURE_COLLECTOR: collector };
  const run = (command = "restore", mode = "database", workflow = false, overrides = {}) => {
    const result = spawnSync(workflow ? "/bin/sh" : process.execPath,
      workflow ? ["-e", "-c", WORKFLOW] : ["--import", PRELOAD_URL, CLI, command],
      { cwd: root, env: { ...env, FIXTURE_MODE: mode, ...overrides }, encoding: "utf8", timeout: 15000 });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.signal, null, result.stderr);
    return { ...result, report: JSON.parse(result.stdout) };
  };
  return { root, collector, run, requestCount: () => fs.existsSync(requests) ? fs.readFileSync(requests, "utf8").trim().split("\n").length : 0,
    assertPending: () => { for (const [file, bytes] of pending) assert.deepEqual(fs.readFileSync(file), bytes); } };
}

test("exit policy only exempts confirmed persisted DB-size restore outages, not generic failures", () => {
  assert.equal(forwardEvidenceRemoteExitCode("restore", DATABASE_REPORT), 0);
  assert.equal(forwardEvidenceRemoteExitCode("restore", { ...DATABASE_REPORT,
    providerCode: "exceed_egress_quota", circuitProviderCode: "exceed_db_size_quota" }), 0);
  for (const report of [
    { state: "REMOTE_FORWARD_EVIDENCE_FAILED" },
    { ...DATABASE_REPORT, circuitState: undefined }, { ...DATABASE_REPORT, circuitState: "REMOTE_EGRESS_OUTAGE" },
    { ...DATABASE_REPORT, providerCode: undefined }, { ...DATABASE_REPORT, providerCode: "EXCEED_DB_SIZE_QUOTA" },
    { ...DATABASE_REPORT, providerCode: "exceed_db_size_quota_extra" }, { ...DATABASE_REPORT, detectedAt: undefined },
    { ...DATABASE_REPORT, detectedAt: "invalid" }, { ...DATABASE_REPORT, detectedAt: [DATABASE_REPORT.detectedAt] },
    { ...DATABASE_REPORT, circuitPersistenceError: "denied" }, { ...DATABASE_REPORT, circuitPersistenceError: "" },
  ]) assert.equal(forwardEvidenceRemoteExitCode("restore", report), 2, JSON.stringify(report));
  for (const command of ["sync", "verify"]) {
    assert.equal(forwardEvidenceRemoteExitCode(command, DATABASE_REPORT), 2);
    assert.equal(forwardEvidenceRemoteExitCode(command, { state: "REMOTE_FORWARD_EVIDENCE_EGRESS_OUTAGE" }), 2);
  }
  for (const command of ["restore", "sync", "verify"]) {
    for (const state of ["REMOTE_FORWARD_EVIDENCE_NOT_CONFIGURED", "REMOTE_FORWARD_EVIDENCE_NOT_WRITE_CAPABLE",
      "REMOTE_FORWARD_EVIDENCE_RESTORED", "REMOTE_FORWARD_EVIDENCE_SYNCED", "REMOTE_FORWARD_EVIDENCE_EGRESS_VERIFIED"]) {
      assert.equal(forwardEvidenceRemoteExitCode(command, { state }), 0);
    }
  }
});

test("workflow-style DB-size restore continues local collection twice with no second remote request", t => {
  const f = fixture(t);
  const first = f.run("restore", "database", true);
  assert.equal(first.status, 0);
  assert.equal(first.report.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
  assert.equal(first.report.circuitState, "REMOTE_DATABASE_SIZE_OUTAGE");
  assert.equal(first.report.providerCode, "exceed_db_size_quota");
  assert.equal(first.report.restored, undefined);
  assert.equal(f.requestCount(), 1);
  assert.equal(fs.readFileSync(f.collector, "utf8"), "ran\n");
  const file = path.join(f.root, CIRCUIT_FILE), snapshot = fs.readFileSync(file);
  const second = f.run("restore", "database", true);
  assert.equal(second.status, 0);
  assert.equal(second.report.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
  assert.equal(second.report.skipped, true);
  assert.equal(f.requestCount(), 1);
  assert.equal(fs.readFileSync(f.collector, "utf8"), "ran\nran\n");
  assert.equal(f.run("sync").status, 2);
  assert.equal(f.requestCount(), 1);
  assert.equal(f.run("verify").status, 2);
  const readOnly = f.run("verify", "read-admitted");
  assert.equal(readOnly.status, 2);
  assert.equal(readOnly.report.readAdmissionVerified, true);
  assert.equal(readOnly.report.remoteDataRestored, false);
  assert.equal(readOnly.report.remoteSyncAcknowledged, false);
  assert.equal(readOnly.report.circuitRetained, true);
  assert.equal(f.requestCount(), 3);
  assert.deepEqual(fs.readFileSync(file), snapshot);
  f.assertPending();
});

test("known egress restore remains nonblocking but egress sync and failed verify exit nonzero", t => {
  const f = fixture(t);
  assert.equal(f.run("restore", "egress", true).status, 0);
  assert.equal(f.requestCount(), 1);
  assert.equal(f.run("sync", "egress").status, 2);
  assert.equal(f.requestCount(), 1);
  const verified = f.run("verify", "egress");
  assert.equal(verified.report.state, "REMOTE_FORWARD_EVIDENCE_EGRESS_OUTAGE");
  assert.equal(verified.status, 2);
  assert.equal(f.requestCount(), 2);
  f.assertPending();
});

for (const mode of ["generic", "substring", "html", "malformed", "persistence-error"]) {
  test(`${mode} restore failure prevents the local collector step`, t => {
    const f = fixture(t), result = f.run("restore", mode, true);
    assert.equal(result.status, 2);
    assert.equal(result.report.state, "REMOTE_FORWARD_EVIDENCE_FAILED");
    assert.equal(fs.existsSync(f.collector), false);
    assert.equal(f.requestCount(), 1);
    assert.equal(fs.existsSync(path.join(f.root, CIRCUIT_FILE)), false);
    if (mode === "persistence-error") assert.match(result.report.circuitPersistenceError, /fixture persistence denied/);
    f.assertPending();
  });
}

test("malformed circuit state still fails restore before any request or local collector", t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, CIRCUIT_FILE), "not-json");
  const result = f.run("restore", "database", true);
  assert.equal(result.status, 2);
  assert.match(result.report.error, /circuit state is malformed/);
  assert.equal(f.requestCount(), 0);
  assert.equal(fs.existsSync(f.collector), false);
  f.assertPending();
});

test("unconfigured CLI keeps its existing zero exit policy for every command", t => {
  const f = fixture(t);
  for (const command of ["restore", "sync", "verify"]) {
    const result = f.run(command, "database", false, { SUPABASE_ENABLED: "false" });
    assert.equal(result.status, 0);
    assert.equal(result.report.state, command === "sync" ? "REMOTE_FORWARD_EVIDENCE_NOT_WRITE_CAPABLE" : "REMOTE_FORWARD_EVIDENCE_NOT_CONFIGURED");
  }
  assert.equal(f.requestCount(), 0);
  f.assertPending();
});
