import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectSupabaseMemory } from "../src/storage/supabaseMemory.js";
import { isTrustedEgressQuota, loadRemoteEgressCircuit, openRemoteEgressCircuit,
  clearRemoteEgressCircuit, supabaseCircuitScope } from "../src/production/remoteOperationalCircuit.js";

const MESSAGE = "Service for this project is restricted due to the following violations: exceed_egress_quota. " +
  "The project owner must upgrade their plan or remove spend caps to restore service.";
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
