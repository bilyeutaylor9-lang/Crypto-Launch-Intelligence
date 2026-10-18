import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const entry = fileURLToPath(new URL("../src/engineHealthCheck.js", import.meta.url));
const intended = new Set(["engine-health-report.json", "whole-engine-audit.json", "whole-engine-audit.md", "engine-value-ledger.json"]);

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "audit-artifact-isolation-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.symlinkSync(path.join(root, "src"), path.join(directory, "src"), "dir");
  fs.mkdirSync(path.join(directory, "data"));
  fs.mkdirSync(path.join(directory, "reports"));
  fs.writeFileSync(path.join(directory, "data", "real-observations.jsonl"), '{"identity":"real-only"}\n');
  for (const file of ["ignition-twin.json", "asymmetric-edge-suite.json", "live-sentinel.json"]) {
    fs.writeFileSync(path.join(directory, "reports", file), JSON.stringify({ marker: "GENUINE_LIVE_REPORT", analyzed: 500 }));
  }
  return directory;
}

function snapshot(directory, relative = "", output = {}) {
  for (const entry of fs.readdirSync(path.join(directory, relative), { withFileTypes: true })) {
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) snapshot(directory, name, output);
    else if (entry.isSymbolicLink()) output[name] = `symlink:${fs.readlinkSync(path.join(directory, name))}`;
    else output[name] = crypto.createHash("sha256").update(fs.readFileSync(path.join(directory, name))).digest("hex");
  }
  return output;
}

test("canonical full engine audit cannot replace live reports or append fixture evidence to live memory", (t) => {
  const directory = fixture(t);
  const beforeData = snapshot(path.join(directory, "data"));
  const beforeReports = snapshot(path.join(directory, "reports"));
  const result = spawnSync(process.execPath, [entry, "--full"], {
    cwd: directory, encoding: "utf8", timeout: 60_000, maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(snapshot(path.join(directory, "data")), beforeData);
  const afterReports = snapshot(path.join(directory, "reports"));
  for (const [file, hash] of Object.entries(beforeReports)) assert.equal(afterReports[file], hash, file);
  assert.deepEqual(Object.keys(afterReports).filter((file) => !Object.hasOwn(beforeReports, file)).sort(), [...intended].sort());
  const health = JSON.parse(fs.readFileSync(path.join(directory, "reports", "engine-health-report.json"), "utf8"));
  assert.equal(health.status, "OK");
  assert.equal(health.failures.length, 0);
  assert.ok(health.runtime.standaloneEngines >= 20);
});

test("low-level fixture execution cannot run in a live caller directory", async () => {
  const { runEngineFixtureAudit } = await import("../src/engineHealthCheck.js");
  await assert.rejects(runEngineFixtureAudit(), /isolated audit worker/);
});

test("exported engine audit API is isolated and cannot write fixture reports into the caller", (t) => {
  const directory = fixture(t);
  const before = snapshot(directory);
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    const { runEngineHealthCheck } = await import(${JSON.stringify(new URL("../src/engineHealthCheck.js", import.meta.url).href)});
    const results = await runEngineHealthCheck({}, { executePipelineActive: true });
    assert.ok(results.length >= 100);
    assert.equal(results.some(row => row.status === 'FAIL'), false);
  `], { cwd: directory, encoding: "utf8", timeout: 60_000, maxBuffer: 10 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(snapshot(directory), before);
});

test("worker launch failure preserves live artifacts and retains isolated diagnostics", (t) => {
  const directory = fixture(t);
  const before = snapshot(directory);
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import path from 'node:path';
    import { createRequire, syncBuiltinESMExports } from 'node:module';
    const { runEngineHealthCheck } = await import(${JSON.stringify(new URL("../src/engineHealthCheck.js", import.meta.url).href)});
    createRequire(import.meta.url)('node:child_process').spawnSync = () => { throw new Error('simulated worker launch fault'); };
    syncBuiltinESMExports();
    await assert.rejects(runEngineHealthCheck(), error => {
      const match = /diagnostics retained at (.+): simulated worker launch fault/.exec(error.message);
      assert.ok(match);
      assert.ok(path.basename(match[1]).startsWith('cli-engine-audit-worker-'));
      assert.ok(fs.existsSync(match[1]));
      fs.rmSync(match[1], { recursive: true, force: true });
      return true;
    });
  `], { cwd: directory, encoding: "utf8", timeout: 60_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(snapshot(directory), before);
});
