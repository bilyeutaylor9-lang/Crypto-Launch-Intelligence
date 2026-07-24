import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const WORKFLOW_PATHS = [
  ".github/workflows/manual.yml",
  ".github/workflows/pages-dashboard.yml",
];
const REQUIRED_NATIVE_CHAINS = ["base", "solana", "bsc", "polygon", "arbitrum", "ethereum", "optimism", "avalanche"];

for (const workflowPath of WORKFLOW_PATHS) {
  test(`${workflowPath} hardens wide scans against overlap and OOM failures`, () => {
    const workflow = fs.readFileSync(workflowPath, "utf8");

    assert.match(workflow, /concurrency:/);
    assert.match(workflow, /cancel-in-progress:\s*true/);
    assert.match(workflow, /timeout-minutes:\s*180/);
    assert.match(workflow, /NODE_OPTIONS:\s*--max-old-space-size=8192/);
    assert.match(workflow, /run:\s*npm run scan:free-max/);
    assert.match(workflow, /if:\s*always\(\)/);
    assert.match(workflow, /if-no-files-found:\s*ignore/);
    assert.doesNotMatch(workflow, /actions\/upload-artifact@v4/);
    for (const chain of REQUIRED_NATIVE_CHAINS) {
      assert.match(workflow, new RegExp(`NATIVE_DISCOVERY_CHAINS:.*${chain}`));
    }
  });
}

test("all GitHub workflows use Node 24-safe action versions", () => {
  const workflowDir = ".github/workflows";
  for (const fileName of fs.readdirSync(workflowDir).filter((name) => name.endsWith(".yml"))) {
    const workflow = fs.readFileSync(`${workflowDir}/${fileName}`, "utf8");
    assert.doesNotMatch(workflow, /actions\/checkout@v4/);
    assert.doesNotMatch(workflow, /actions\/setup-node@v4/);
    assert.doesNotMatch(workflow, /actions\/upload-artifact@v4/);
  }
});
