import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const checker = new URL("../src/ops/syntaxCheck.js", import.meta.url).href;

function checkFixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-syntax-"));
  try {
    for (const [name, contents] of Object.entries(files)) {
      const file = path.join(dir, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents);
    }
    const processResult = spawnSync(process.execPath, ["--input-type=module", "-e",
      `import { runSyntaxCheck } from ${JSON.stringify(checker)}; console.log(JSON.stringify(runSyntaxCheck()));`],
    { cwd: dir, encoding: "utf8" });
    assert.equal(processResult.status, 0, processResult.stderr);
    return JSON.parse(processResult.stdout);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("canonical syntax check detects broken provider and report modules", () => {
  const result = checkFixture({
    "src/data/provider.js": "const broken = ;",
    "src/reports/report.js": "function broken( {",
    "src/index.js": "const valid = 1;",
    "test/data/fixture.js": "const valid = 2;",
    "src/docs/example.js": "const valid = 3;",
  });
  assert.equal(result.status, "FAILED");
  assert.equal(result.checkedFiles, 5);
  assert.deepEqual(result.failures.map((failure) => failure.file),
    ["src/data/provider.js", "src/reports/report.js"]);
});

test("syntax check excludes runtime artifacts and vendor metadata, not source folders", () => {
  const result = checkFixture({
    "src/data/provider.js": "const valid = 1;",
    "src/reports/report.js": "const valid = 2;",
    "test/test.js": "const valid = 3;",
    "data/runtime.js": "const broken = ;",
    "reports/runtime.js": "const broken = ;",
    "docs/runtime.js": "const broken = ;",
    "src/node_modules/vendor.js": "const broken = ;",
    "src/.git/metadata.js": "const broken = ;",
  });
  assert.equal(result.status, "OK");
  assert.equal(result.checkedFiles, 3);
  assert.deepEqual(result.failures, []);
});
