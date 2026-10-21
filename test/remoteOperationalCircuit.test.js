import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectSupabaseMemory } from "../src/storage/supabaseMemory.js";
import { isTrustedEgressQuota, loadRemoteEgressCircuit, openRemoteEgressCircuit,
  clearRemoteEgressCircuit, supabaseCircuitScope, DATABASE_SIZE_QUOTA_PROVIDER_CODE,
  trustedRemoteQuotaProviderCode, loadRemoteOperationalCircuit, openRemoteOperationalCircuit,
  clearRemoteOperationalCircuit } from "../src/production/remoteOperationalCircuit.js";

const MESSAGE = "Service for this project is restricted due to the following violations: exceed_egress_quota. " +
  "The project owner must upgrade their plan or remove spend caps to restore service.";
const DATABASE_SIZE_MESSAGE = MESSAGE.replace("exceed_egress_quota", "exceed_db_size_quota");
const ENV = { SUPABASE_ENABLED: "true", SUPABASE_URL: "https://circuit-test.supabase.co", SUPABASE_SECRET_KEY: "fixture-secret" };
const WORKFLOWS = ["autonomous-alpha-os", "edge-evidence-truth", "edge-fast-evidence", "edge-lab",
  "edge-verification-program", "future-intelligence-stack", "market-discovery-os", "outcome-probe",
  "pages-dashboard", "production-shadow", "shadow-universe-refresh", "manual"];

function temporaryRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "remote-circuit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("only the exact quota code or the known platform restriction envelope is trusted", () => {
  assert.equal(isTrustedEgressQuota({ code: "exceed_egress_quota" }), true);
  assert.equal(isTrustedEgressQuota({ message: MESSAGE }), true);
  for (const value of [null, {}, { code: "403", message: "Forbidden" }, { message: "exceed_egress_quota" },
    { message: "Query value was exceed_egress_quota" }, { code: "42501", message: "Unauthorized" },
    { message: MESSAGE.replace("exceed_egress_quota", "exceed_database_size") }]) {
    assert.equal(isTrustedEgressQuota(value), false);
  }
});

test("database-size quota is trusted precisely and never classified as egress", () => {
  for (const error of [
    { code: DATABASE_SIZE_QUOTA_PROVIDER_CODE },
    { providerCode: DATABASE_SIZE_QUOTA_PROVIDER_CODE },
    { message: DATABASE_SIZE_MESSAGE },
  ]) {
    assert.equal(trustedRemoteQuotaProviderCode(error), "exceed_db_size_quota");
    assert.equal(isTrustedEgressQuota(error), false);
  }
  assert.equal(trustedRemoteQuotaProviderCode({ message: MESSAGE }), "exceed_egress_quota");
  for (const error of [
    { code: "exceed_egress_quota", providerCode: "exceed_db_size_quota" },
    { code: "exceed_egress_quota", message: DATABASE_SIZE_MESSAGE },
    { code: "exceed_db_size_quota", message: MESSAGE },
  ]) {
    assert.equal(trustedRemoteQuotaProviderCode(error), null);
    assert.equal(isTrustedEgressQuota(error), false);
  }
});

test("quota hints, malformed errors and non-exact restriction envelopes are not trusted", () => {
  for (const code of ["exceed_egress_quota", "exceed_db_size_quota"]) {
    const message = MESSAGE.replace("exceed_egress_quota", code);
    for (const error of [
      null, message, [{ message }], { message: [message] }, { message: { message } },
      { code: "403", message: "Forbidden" }, { message: code }, { code: `${code}_extra` },
      { providerCode: [code] }, { code: ` ${code}` }, { code: code.toUpperCase() },
      { providerCode: code.toUpperCase() }, { message: `Query value was ${code}` },
      { message: message.toLowerCase() },
      { message: `<html>${message}</html>` }, { message: JSON.stringify({ message }) },
      { message: `prefix ${message}` }, { message: `${message} suffix` },
      { message: message.split(". ")[0] + "." }, { message: message.replace("restore service.", "restore service") },
      { message: message.replace(code, `${code}_extra`) },
      { message: message.replace(code, `unknown_quota, ${code}`) },
      { message: message.replace(code, `${code}, unknown_quota`) },
    ]) {
      assert.equal(trustedRemoteQuotaProviderCode(error), null, JSON.stringify(error));
      assert.equal(isTrustedEgressQuota(error), false, JSON.stringify(error));
    }
  }
});

test("version-one egress snapshots coexist with database-size incidents without relabeling legacy APIs", t => {
  const root = temporaryRoot(t), scope = supabaseCircuitScope({ url: ENV.SUPABASE_URL });
  const file = path.join(root, "data", "remote-operational-circuits.json");
  const oldIncident = { state: "REMOTE_EGRESS_OUTAGE", providerCode: "exceed_egress_quota",
    detectedAt: "2026-10-19T00:00:00.000Z" };
  fs.mkdirSync(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, incidents: { [scope]: oldIncident } }));
  assert.deepEqual(loadRemoteEgressCircuit(scope, { root }), oldIncident);
  assert.deepEqual(loadRemoteOperationalCircuit(scope, { root }), oldIncident);
  const otherScope = supabaseCircuitScope({ url: "https://other-project.supabase.co" });
  const incident = openRemoteOperationalCircuit(otherScope, DATABASE_SIZE_QUOTA_PROVIDER_CODE,
    { root, now: "2026-10-21T18:44:54.161Z" });
  assert.deepEqual(incident, { state: "REMOTE_DATABASE_SIZE_OUTAGE", providerCode: "exceed_db_size_quota",
    detectedAt: "2026-10-21T18:44:54.161Z" });
  assert.deepEqual(loadRemoteOperationalCircuit(otherScope, { root }), incident);
  assert.equal(loadRemoteEgressCircuit(otherScope, { root }), null);
  clearRemoteEgressCircuit(otherScope, { root });
  assert.deepEqual(loadRemoteOperationalCircuit(otherScope, { root }), incident);
  assert.deepEqual(loadRemoteEgressCircuit(scope, { root }), oldIncident);
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).schemaVersion, 1);
  clearRemoteOperationalCircuit(otherScope, { root });
  assert.equal(loadRemoteOperationalCircuit(otherScope, { root }), null);
  clearRemoteEgressCircuit(scope, { root });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).incidents, {});
});

test("unknown or mismatched quota state/code pairs fail closed without changing the snapshot", t => {
  const root = temporaryRoot(t), scope = supabaseCircuitScope({ url: ENV.SUPABASE_URL });
  const file = path.join(root, "data", "remote-operational-circuits.json");
  openRemoteEgressCircuit(scope, { root });
  const before = fs.readFileSync(file);
  assert.throws(() => openRemoteOperationalCircuit(scope, "unknown_quota", { root }), /provider code/);
  assert.deepEqual(fs.readFileSync(file), before);
  for (const [state, providerCode] of [
    ["REMOTE_EGRESS_OUTAGE", DATABASE_SIZE_QUOTA_PROVIDER_CODE],
    ["REMOTE_DATABASE_SIZE_OUTAGE", "exceed_egress_quota"],
    ["REMOTE_DATABASE_SIZE_OUTAGE", "unknown_quota"],
    ["REMOTE_DATABASE_SIZE_OUTAGE", [DATABASE_SIZE_QUOTA_PROVIDER_CODE]],
  ]) {
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, incidents: { [scope]: {
      state, providerCode, detectedAt: "2026-10-21T18:44:54.161Z",
    } } }));
    const invalid = fs.readFileSync(file);
    assert.throws(() => loadRemoteOperationalCircuit(scope, { root }), /invalid/);
    assert.deepEqual(fs.readFileSync(file), invalid);
  }
});

test("legacy history bootstrap carries a trusted outage to the next run without touching evidence", async t => {
  const root = temporaryRoot(t), scope = supabaseCircuitScope({ url: ENV.SUPABASE_URL });
  fs.mkdirSync(path.join(root, "data"));
  const ledger = path.join(root, "data", "production-market-observations.jsonl");
  fs.writeFileSync(ledger, "original-observation-bytes\n");
  let calls = 0;
  const options = { root, env: ENV, writeReport: false, maxRetries: 0, fetchImpl: async () => {
    calls++;
    return { ok: false, status: 402, text: async () => JSON.stringify({ message: MESSAGE }) };
  } };
  const first = await collectSupabaseMemory(options);
  assert.equal(first.status, "FAILED");
  assert.equal(calls, 3);
  assert.ok(loadRemoteEgressCircuit(scope, { root }));
  const second = await collectSupabaseMemory(options);
  assert.equal(second.status, "FAILED");
  assert.equal(second.tableHealth.projects.status, "SKIPPED");
  assert.equal(calls, 3);
  assert.equal(fs.readFileSync(ledger, "utf8"), "original-observation-bytes\n");
});

for (const [name, payload] of [
  ["structured code", { code: "exceed_db_size_quota", message: "quota" }],
  ["exact envelope", { message: DATABASE_SIZE_MESSAGE }],
]) {
  test(`REST ${name} persists database-size restriction without retrying keys or changing evidence`, async t => {
    const root = temporaryRoot(t), scope = supabaseCircuitScope({ url: ENV.SUPABASE_URL });
    const ledger = path.join(root, "data", "production-market-observations.jsonl");
    fs.mkdirSync(path.dirname(ledger));
    fs.writeFileSync(ledger, "original-pending-evidence\n");
    let calls = 0;
    const options = { root, env: { ...ENV, SUPABASE_SERVICE_ROLE_KEY: "fixture-fallback" }, writeReport: false,
      now: "2026-10-21T18:44:54.161Z", maxRetries: 2,
      sleepImpl: async () => assert.fail("A confirmed restriction must not wait for a retry"),
      fetchImpl: async () => {
        calls++;
        return { ok: false, status: 500, text: async () => JSON.stringify(payload) };
      },
    };
    const first = await collectSupabaseMemory(options);
    assert.equal(first.status, "FAILED");
    assert.deepEqual(first.remoteCircuit, { state: "REMOTE_DATABASE_SIZE_OUTAGE", providerCode: "exceed_db_size_quota",
      detectedAt: options.now });
    assert.equal(calls, 3);
    assert.equal(loadRemoteEgressCircuit(scope, { root }), null);
    assert.deepEqual(loadRemoteOperationalCircuit(scope, { root }), first.remoteCircuit);
    const next = await collectSupabaseMemory({ ...options, now: "2028-01-01T00:00:00.000Z" });
    assert.equal(next.status, "FAILED");
    assert.equal(next.tableHealth.projects.status, "SKIPPED");
    assert.deepEqual(next.remoteCircuit, first.remoteCircuit);
    assert.match(next.reason, /database-size/);
    assert.doesNotMatch(next.reason, /egress/);
    assert.equal(calls, 3);
    assert.equal(fs.readFileSync(ledger, "utf8"), "original-pending-evidence\n");
  });
}

test("REST generic 403, malformed JSON, HTML and quota substrings never establish a persistent restriction", async t => {
  for (const body of [
    JSON.stringify({ code: "403", message: "Forbidden" }),
    JSON.stringify({ message: "exceed_db_size_quota" }),
    JSON.stringify({ message: `${DATABASE_SIZE_MESSAGE} suffix` }),
    JSON.stringify({ message: DATABASE_SIZE_MESSAGE.split(". ")[0] + "." }),
    JSON.stringify({ message: DATABASE_SIZE_MESSAGE.replace("exceed_db_size_quota", "exceed_db_size_quota_extra") }),
    JSON.stringify({ message: DATABASE_SIZE_MESSAGE.replace("exceed_db_size_quota", "unknown_quota, exceed_db_size_quota") }),
    `<html>${DATABASE_SIZE_MESSAGE}</html>`,
    `{"message":${JSON.stringify(DATABASE_SIZE_MESSAGE)}`,
    JSON.stringify([{ message: DATABASE_SIZE_MESSAGE }]), JSON.stringify({ message: [DATABASE_SIZE_MESSAGE] }),
  ]) {
    const root = temporaryRoot(t);
    let calls = 0;
    const options = { root, env: ENV, writeReport: false, maxRetries: 0, fetchImpl: async () => {
      calls++;
      return { ok: false, status: 403, text: async () => body };
    } };
    for (let run = 0; run < 2; run++) {
      const result = await collectSupabaseMemory(options);
      assert.equal(result.status, "FAILED", body);
      assert.equal(result.remoteCircuit, undefined, body);
    }
    assert.equal(calls, 6, body);
    assert.equal(fs.existsSync(path.join(root, "data", "remote-operational-circuits.json")), false, body);
  }
});

test("a cleared operational snapshot is retained independently of evidence and old cache paths", t => {
  const root = temporaryRoot(t), scope = supabaseCircuitScope({ url: ENV.SUPABASE_URL });
  openRemoteEgressCircuit(scope, { root });
  clearRemoteEgressCircuit(scope, { root });
  const file = path.join(root, "data", "remote-operational-circuits.json");
  assert.equal(fs.existsSync(file), true);
  assert.equal(loadRemoteEgressCircuit(scope, { root }), null);
  const restoredRoot = temporaryRoot(t);
  fs.mkdirSync(path.join(restoredRoot, "data"));
  fs.copyFileSync(file, path.join(restoredRoot, "data", "remote-operational-circuits.json"));
  assert.equal(loadRemoteEgressCircuit(scope, { root: restoredRoot }), null);
  assert.equal(fs.existsSync(path.join(restoredRoot, "data", "production-market-observations.jsonl")), false);
});

test("circuit bounds reject a new oversized endpoint without replacing the existing incident", t => {
  const root = temporaryRoot(t), scope = supabaseCircuitScope({ url: ENV.SUPABASE_URL });
  openRemoteEgressCircuit(scope, { root });
  const file = path.join(root, "data", "remote-operational-circuits.json"), before = fs.readFileSync(file);
  assert.throws(() => openRemoteEgressCircuit(`supabase:https://example.supabase.co/${"x".repeat(20000)}`, { root }), /limit|large/);
  assert.throws(() => openRemoteOperationalCircuit(`supabase:https://example.supabase.co/${"x".repeat(20000)}`,
    DATABASE_SIZE_QUOTA_PROVIDER_CODE, { root }), /limit|large/);
  assert.deepEqual(fs.readFileSync(file), before);
});

test("database-size incidents retain the version-one 64-incident bound", t => {
  const root = temporaryRoot(t);
  for (let index = 0; index < 64; index++) {
    openRemoteOperationalCircuit(`supabase:https://project-${index}.supabase.co`, DATABASE_SIZE_QUOTA_PROVIDER_CODE,
      { root, now: "2026-10-21T18:44:54.161Z" });
  }
  const file = path.join(root, "data", "remote-operational-circuits.json"), before = fs.readFileSync(file);
  assert.equal(JSON.parse(before).schemaVersion, 1);
  assert.equal(Object.keys(JSON.parse(before).incidents).length, 64);
  assert.ok(before.length <= 16 * 1024);
  assert.throws(() => openRemoteOperationalCircuit("supabase:https://project-65.supabase.co",
    DATABASE_SIZE_QUOTA_PROVIDER_CODE, { root }), /bounded limit/);
  assert.deepEqual(fs.readFileSync(file), before);
});

for (const workflow of WORKFLOWS) {
  test(`${workflow} carries only bounded operational state after remote work even if the evidence bundle fails`, () => {
    const source = fs.readFileSync(`.github/workflows/${workflow}.yml`, "utf8");
    const restore = source.indexOf("name: Restore Remote Operational Circuit");
    const save = source.indexOf("name: Save Remote Operational Circuit");
    assert.ok(restore >= 0);
    assert.ok(save > restore);
    const commands = [...source.matchAll(/run: npm run (?:forward:evidence:(?:restore|sync)|scan:free-max|market:discover)/g)];
    assert.ok(commands.every(command => restore < command.index && save > command.index));
    const restoreStep = source.slice(restore, source.indexOf("      - name:", restore + 10));
    const saveStep = source.slice(save, source.indexOf("      - name:", save + 10) < 0 ? source.length
      : source.indexOf("      - name:", save + 10));
    assert.match(restoreStep, /actions\/cache\/restore@v5/);
    assert.match(saveStep, /actions\/cache\/save@v5/);
    assert.match(saveStep, /always\(\).*hashFiles\('data\/remote-operational-circuits\.json'\)/);
    for (const step of [restoreStep, saveStep]) {
      assert.match(step, /path: data\/remote-operational-circuits\.json/);
      assert.match(step, /remote-operational-circuit-v1-/);
      assert.match(step, /github\.run_attempt/);
      assert.doesNotMatch(step, /path:.*scanner-learning|data\/production-market-observations\.jsonl/);
    }
    assert.doesNotMatch(saveStep, /state_pack\.outcome|hashFiles\('data\/production-market-observations/);
  });
}
