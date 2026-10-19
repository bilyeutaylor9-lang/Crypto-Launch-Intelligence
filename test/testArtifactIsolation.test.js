import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const runner = path.resolve("src/ops/runTestsIsolated.js");
const lockFor = root => path.join(os.tmpdir(), `scanner-test-isolation-lock-${crypto.createHash("sha256").update(fs.realpathSync(root)).digest("hex")}`);

test("unsupported test filters are rejected before artifacts are moved or tests are run", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-test-filter-"));
  try {
    fs.mkdirSync(path.join(root, "data")); fs.mkdirSync(path.join(root, "reports"));
    const original = Buffer.from("original-unmodified-evidence");
    fs.writeFileSync(path.join(root, "data", "live.json"), original);
    const result = spawnSync(process.execPath, [runner, "--test-name-pattern=focused"], { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 1); assert.match(result.stderr, /does not accept filters/);
    assert.deepEqual(fs.readFileSync(path.join(root, "data", "live.json")), original);
    assert.deepEqual(fs.readdirSync(root).sort(), ["data", "reports"]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

for (const fails of [false, true]) {
  test(`test runner restores live data and reports after ${fails ? "failure" : "success"}`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-test-isolation-"));
    try {
      for (const directory of ["data", "reports", "test"]) fs.mkdirSync(path.join(root, directory));
      fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ type: "module" }));
      for (const directory of ["data", "reports"]) fs.writeFileSync(path.join(root, directory, "live.json"), "original-live-observation\n");
      fs.writeFileSync(path.join(root, "test", "worker.test.js"), `
        import fs from "node:fs";
        import assert from "node:assert/strict";
        for (const directory of ["data", "reports"]) {
          assert.equal(fs.existsSync(directory + "/live.json"), false);
          fs.writeFileSync(directory + "/mock.json", "mock-provider-observation");
        }
        ${fails ? 'assert.fail("intentional fixture failure");' : ''}
      `);
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, [runner], { cwd: root, env, encoding: "utf8", timeout: 15000 });
      assert.equal(result.error, undefined);
      assert.equal(result.status, fails ? 1 : 0, result.stderr);
      assert.match(result.stdout, /worker\.test\.js/);
      for (const directory of ["data", "reports"]) {
        assert.deepEqual(fs.readdirSync(path.join(root, directory)), ["live.json"]);
        assert.equal(fs.readFileSync(path.join(root, directory, "live.json"), "utf8"), "original-live-observation\n");
      }
      assert.equal(fs.existsSync(lockFor(root)), false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}

test("missing backup fails closed, retaining generated output and manual-recovery paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-test-isolation-missing-"));
  try {
    for (const directory of ["data", "reports", "test"]) fs.mkdirSync(path.join(root, directory));
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ type: "module" }));
    for (const directory of ["data", "reports"]) fs.writeFileSync(path.join(root, directory, "live.json"), "original\n");
    fs.writeFileSync(path.join(root, "test", "worker.test.js"), `import test from "node:test"; import fs from "node:fs"; import assert from "node:assert/strict";
      test("tamper backup", () => { fs.writeFileSync("reports/generated.json", "generated"); assert.ok(process.env.TEST_ARTIFACT_BACKUP_ROOT);
        fs.renameSync(process.env.TEST_ARTIFACT_BACKUP_ROOT + "/reports", process.env.TEST_ARTIFACT_BACKUP_ROOT + "/reports-moved"); });`);
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [runner], { cwd: root, env, encoding: "utf8", timeout: 15000 });
    assert.equal(result.status, 1); assert.match(result.stderr, /Manual recovery/);
    assert.equal(fs.readFileSync(path.join(root, "reports", "generated.json"), "utf8"), "generated");
    const lock = lockFor(root); assert.equal(fs.existsSync(lock), true);
    const metadata = JSON.parse(fs.readFileSync(lock, "utf8"));
    assert.equal(fs.existsSync(metadata.backupRoot), true);
    fs.rmSync(metadata.backupRoot, { recursive: true, force: true }); fs.unlinkSync(lock);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("competing wrappers fail before moving an active checkout's artifacts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-test-isolation-lock-"));
  try {
    for (const directory of ["data", "reports", "test"]) fs.mkdirSync(path.join(root, directory));
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ type: "module" }));
    for (const directory of ["data", "reports"]) fs.writeFileSync(path.join(root, directory, "live.json"), "original\n");
    const lock = lockFor(root); fs.writeFileSync(lock, "manual recovery");
    const result = spawnSync(process.execPath, [runner], { cwd: root, encoding: "utf8", timeout: 15000 });
    assert.equal(result.status, 1); assert.match(result.stderr, /TEST_ARTIFACT_ISOLATION_LOCKED/);
    assert.equal(fs.readFileSync(path.join(root, "reports", "live.json"), "utf8"), "original\n");
    fs.unlinkSync(lock);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("tampered backup and replaced generated directory both preserve recovery material", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-test-isolation-tamper-"));
  try {
    for (const directory of ["data", "reports", "test"]) fs.mkdirSync(path.join(root, directory));
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ type: "module" }));
    for (const directory of ["data", "reports"]) fs.writeFileSync(path.join(root, directory, "live.json"), "original\n");
    fs.writeFileSync(path.join(root, "test", "worker.test.js"), `import test from "node:test"; import fs from "node:fs";
      test("tamper", () => { fs.writeFileSync(process.env.TEST_ARTIFACT_BACKUP_ROOT + "/data/live.json", "tampered");
        fs.rmSync("reports", { recursive: true }); fs.mkdirSync("reports"); fs.writeFileSync("reports/generated.json", "generated"); });`);
    const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [runner], { cwd: root, env, encoding: "utf8", timeout: 15000 });
    assert.equal(result.status, 1); assert.match(result.stderr, /Manual recovery/);
    assert.equal(fs.readFileSync(path.join(root, "reports", "generated.json"), "utf8"), "generated");
    const lock = lockFor(root), metadata = JSON.parse(fs.readFileSync(lock, "utf8"));
    assert.equal(fs.existsSync(metadata.backupRoot), true);
    fs.rmSync(metadata.backupRoot, { recursive: true, force: true }); fs.unlinkSync(lock);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
