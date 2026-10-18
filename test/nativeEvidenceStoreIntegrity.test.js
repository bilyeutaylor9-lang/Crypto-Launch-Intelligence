import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const moduleUrl = new URL("../src/data/native/nativeEventStore.js", import.meta.url).href;

function runIsolated(t, script) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-evidence-integrity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import fs from "node:fs";
    import path from "node:path";
    import assert from "node:assert/strict";
    const store = await import(${JSON.stringify(moduleUrl)});
    const directory = path.resolve("data/native-discovery");
    fs.mkdirSync(directory, { recursive: true });
    const event = { eventId: "retained", eventType: "TOKEN_DEPLOYED", chain: "base",
      transactionHash: "0x" + "a".repeat(64),
      tokenAddress: "0x1111111111111111111111111111111111111111" };
    ${script}
  `], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("corrupt and wrong-shaped raw evidence cannot be silently replaced by an empty ledger", (t) => {
  runIsolated(t, `
    const file = path.join(directory, "raw-events.json");
    for (const bad of ["{broken", "{}", "null"]) {
      fs.writeFileSync(file, bad);
      assert.throws(() => store.recordNativeEvents([event]), /Cannot read native evidence store/);
      assert.throws(() => store.loadNativeEvents({ includeRaw: true }), /Cannot read native evidence store/);
      assert.equal(fs.readFileSync(file, "utf8"), bad);
    }
  `);
});

test("corrupt confirmed evidence and checkpoints are retained instead of reset", (t) => {
  runIsolated(t, `
    const confirmed = path.join(directory, "confirmed-events.json");
    const checkpoints = path.join(directory, "checkpoints.json");
    fs.writeFileSync(confirmed, "not-json");
    fs.writeFileSync(checkpoints, "[");
    assert.throws(() => store.confirmNativeEvents([event]), /Cannot read native evidence store/);
    assert.throws(() => store.updateNativeCheckpoint("lane", { blockNumber: 10 }), /Cannot read native evidence store/);
    assert.equal(fs.readFileSync(confirmed, "utf8"), "not-json");
    assert.equal(fs.readFileSync(checkpoints, "utf8"), "[");
  `);
});

test("successful native evidence writes are atomic and preserve prior records", (t) => {
  runIsolated(t, `
    store.recordNativeEvents([event]);
    store.recordNativeEvents([{ ...event, transactionHash: "0x" + "b".repeat(64) }]);
    assert.equal(store.loadNativeEvents({ includeRaw: true }).length, 2);
    store.updateNativeCheckpoint("lane", { chain: "base", blockNumber: 10 });
    assert.equal(store.getNativeCheckpoints().lane.blockNumber, 10);
    assert.equal(fs.readdirSync(directory).some(name => name.endsWith(".tmp")), false);
  `);
});

test("a failed atomic replacement leaves the original evidence bytes intact", (t) => {
  runIsolated(t, `
    store.recordNativeEvents([event]);
    const file = path.join(directory, "raw-events.json");
    const before = fs.readFileSync(file, "utf8");
    const rename = fs.renameSync;
    fs.renameSync = () => { throw new Error("simulated rename failure"); };
    assert.throws(() => store.recordNativeEvents([{ ...event, transactionHash: "0x" + "b".repeat(64) }]), /simulated rename failure/);
    fs.renameSync = rename;
    assert.equal(fs.readFileSync(file, "utf8"), before);
    assert.equal(store.loadNativeEvents({ includeRaw: true }).length, 1);
  `);
});
