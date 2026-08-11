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

    const audit = workflow.indexOf("Run Full Engine Health Audit");
    const refresh = workflow.indexOf("Refresh Master System Readiness");
    const semantic = workflow.indexOf("Validate Scanner Semantic Health");
    const validate = workflow.indexOf("Validate Required Report Contracts");
    const dashboard = workflow.indexOf("Build Public Dashboard");
    const upload = workflow.indexOf(workflowPath.includes("manual") ? "Upload Reports" : "Upload Scan Reports And Diagnostics");
    assert.ok(audit >= 0);
    assert.ok(refresh > audit);
    assert.ok(semantic > refresh);
    assert.ok(validate > semantic);
    assert.ok(dashboard > validate);
    assert.ok(upload > dashboard);
    assert.match(workflow, /run:\s*npm run system:readiness:refresh/);
    assert.match(workflow, /run:\s*npm run smoke:scanner/);
    assert.match(
      workflow,
      /SUPABASE_ENABLED:\s*\$\{\{ vars\.SUPABASE_ENABLED \|\| secrets\.SUPABASE_ENABLED \|\| 'false' \}\}/,
    );
    assert.match(
      workflow,
      /SUPABASE_SYNC_ALPHA_RECEIPTS:\s*\$\{\{ vars\.SUPABASE_SYNC_ALPHA_RECEIPTS \|\| secrets\.SUPABASE_SYNC_ALPHA_RECEIPTS \|\| 'true' \}\}/,
    );
    assert.match(
      workflow,
      /SUPABASE_SYNC_PROJECT_LIMIT:\s*\$\{\{ vars\.SUPABASE_SYNC_PROJECT_LIMIT \|\| secrets\.SUPABASE_SYNC_PROJECT_LIMIT \|\| '2500' \}\}/,
    );
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

test("only the live dashboard workflow schedules or runs full scans on main pushes", () => {
  const manual = fs.readFileSync(".github/workflows/manual.yml", "utf8");
  const live = fs.readFileSync(".github/workflows/pages-dashboard.yml", "utf8");

  assert.doesNotMatch(manual, /\bpush:/);
  assert.doesNotMatch(manual, /\bschedule:/);
  assert.match(manual, /workflow_dispatch:/);
  assert.match(live, /\bpush:/);
  assert.match(live, /\bschedule:/);
  assert.match(manual, /group:\s*live-dashboard-scan-\$\{\{ github\.ref \}\}/);
  assert.match(live, /group:\s*live-dashboard-scan-\$\{\{ github\.ref \}\}/);
});

test("live dashboard restores bounded learning and defers final health verdict until deployment", () => {
  const workflow = fs.readFileSync(".github/workflows/pages-dashboard.yml", "utf8");

  assert.match(workflow, /actions\/cache\/restore@v5/);
  assert.match(workflow, /actions\/cache\/save@v5/);
  assert.match(workflow, /data\/scan-history\.json\*/);
  assert.match(workflow, /data\/native-discovery\/checkpoints\.json/);
  assert.match(workflow, /id:\s*semantic_health/);
  assert.match(workflow, /id:\s*report_contracts/);
  assert.match(workflow, /health:\s*\n\s*name: Verify Scan And Deployment Health/);
  assert.match(workflow, /needs: \[build, deploy\]/);
  assert.match(workflow, /DEPLOY:\s*\$\{\{ needs\.deploy\.result \}\}/);
});
