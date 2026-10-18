import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const runner = path.resolve("src/ops/runTestsIsolated.js");

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
      assert.equal(fs.readdirSync(root).some((name) => name.startsWith(".test-artifact-backup-")), false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}
