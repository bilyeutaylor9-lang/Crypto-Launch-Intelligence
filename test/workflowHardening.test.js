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

test("hourly outcome probe is bounded, exact-only, and never launches a full scan", () => {
  const workflow = fs.readFileSync(".github/workflows/outcome-probe.yml", "utf8");

  assert.match(workflow, /schedule:/);
  assert.match(workflow, /run:\s*npm run outcomes:probe/);
  assert.doesNotMatch(workflow, /npm run scan/);
  assert.match(workflow, /group:\s*live-dashboard-scan-\$\{\{ github\.ref \}\}/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /OUTCOME_PROBE_MAX_REQUESTS:\s*120/);
  assert.match(workflow, /OUTCOME_PROBE_MAX_CANDIDATES:\s*120/);
  assert.match(workflow, /OUTCOME_PROBE_CONCURRENCY:\s*4/);
  assert.match(workflow, /data\/scan-history\.json\*/);
  assert.match(workflow, /data\/outcome-snapshots\.json\*/);
});

test("learning workflows share one cache signature and never save without an exact universe", () => {
  const workflowPaths = [
    ".github/workflows/pages-dashboard.yml",
    ".github/workflows/outcome-probe.yml",
    ".github/workflows/edge-evidence-truth.yml",
    ".github/workflows/edge-lab.yml",
  ];
  let expectedPaths = null;

  for (const workflowPath of workflowPaths) {
    const workflow = fs.readFileSync(workflowPath, "utf8");
    const allCachePaths = [...workflow.matchAll(
      /uses: actions\/cache\/(?:restore|save)@v5[\s\S]*?path: \|\n((?:\s{12}data\/.*\n)+)/g,
    )].map((match) => match[1].trim().split("\n").map((line) => line.trim()));
    const cachePaths = allCachePaths.filter((paths) =>
      paths.includes("data/edge-candidate-universe.json")
    );

    assert.equal(cachePaths.length, 2, `${workflowPath} must have one restore and one save path set`);
    assert.deepEqual(cachePaths[1], cachePaths[0], `${workflowPath} restore/save cache paths drifted`);
    expectedPaths ??= cachePaths[0];
    assert.deepEqual(cachePaths[0], expectedPaths, `${workflowPath} cannot share scanner-learning caches`);
    assert.ok(cachePaths[0].includes("data/edge-candidate-universe.json"));
    assert.equal(cachePaths[0].includes("data/production-market-observations.jsonl"), false);
    assert.match(
      workflow,
      /if: \$\{\{ always\(\) && hashFiles\('data\/edge-candidate-universe\.json'\) != '' \}\}\n\s+continue-on-error: true\n\s+uses: actions\/cache\/save@v5/,
    );
  }
});

test("forward evidence writers share an isolated exact append-only cache", () => {
  const workflowPaths = [
    ".github/workflows/outcome-probe.yml",
    ".github/workflows/edge-evidence-truth.yml",
    ".github/workflows/production-shadow.yml",
    ".github/workflows/autonomous-alpha-os.yml",
  ];
  const expectedPaths = [
    "data/production-market-observations.jsonl",
    "data/prospective-edge-cohorts.jsonl",
  ];
  for (const workflowPath of workflowPaths) {
    const workflow = fs.readFileSync(workflowPath, "utf8");
    const paths = [...workflow.matchAll(
      /uses: actions\/cache\/(?:restore|save)@v5[\s\S]*?path: \|\n((?:\s{12}data\/.*\n)+)/g,
    )]
      .map((match) => match[1].trim().split("\n").map((line) => line.trim()))
      .filter((rows) => rows.includes("data/prospective-edge-cohorts.jsonl"));
    assert.equal(paths.length, 2, `${workflowPath} must restore and save forward evidence`);
    assert.deepEqual(paths[0], expectedPaths);
    assert.deepEqual(paths[1], expectedPaths);
    assert.match(workflow, /key: forward-evidence-\$\{\{ runner\.os \}\}-\$\{\{ github\.ref_name \}\}-\$\{\{ github\.run_id \}\}/);
    assert.match(workflow, /group:\s*live-dashboard-scan-\$\{\{ github\.ref \}\}/);
  }
});

test("authoritative forward evidence restores after legacy model caches", () => {
  const expectations = [
    [".github/workflows/production-shadow.yml", "Restore Autonomous Alpha Memory"],
    [".github/workflows/autonomous-alpha-os.yml", "Restore Alpha OS Memory"],
    [".github/workflows/edge-verification-program.yml", "Restore Autonomous Alpha Memory"],
    [".github/workflows/market-discovery-os.yml", "Restore Market Discovery And Alpha Memory"],
    [".github/workflows/future-intelligence-stack.yml", "Restore Intelligence Memory"],
  ];
  for (const [workflowPath, legacyRestore] of expectations) {
    const workflow = fs.readFileSync(workflowPath, "utf8");
    assert.ok(
      workflow.indexOf("Restore Append-Only Forward Evidence") > workflow.indexOf(legacyRestore),
      `${workflowPath} must let the authoritative forward cache win restore collisions`,
    );
  }
});

test("future intelligence workflow preserves exact memory and refuses empty cache saves", () => {
  const workflow = fs.readFileSync(".github/workflows/future-intelligence-stack.yml", "utf8");

  assert.match(workflow, /schedule:/);
  assert.match(workflow, /data\/production-market-observations\.jsonl/);
  assert.match(workflow, /data\/prospective-edge-cohorts\.jsonl/);
  assert.match(workflow, /data\/edge-candidate-universe\.json/);
  assert.match(workflow, /run:\s*npm run alpha:os/);
  assert.match(workflow, /run:\s*npm run market:discover/);
  assert.match(workflow, /run:\s*npm run future:intelligence/);
  assert.match(workflow, /run:\s*npm run test:future-intelligence/);
  assert.match(
    workflow,
    /if: \$\{\{ always\(\) && hashFiles\('data\/edge-candidate-universe\.json'\) != '' \}\}\n\s+continue-on-error: true\n\s+uses: actions\/cache\/save@v5/,
  );
});

test("production verification exercises CLI 3-14 and treats security failure as blocking", () => {
  const workflow = fs.readFileSync(".github/workflows/production-verification.yml", "utf8");

  assert.match(workflow, /npm run test:alpha-os/);
  assert.match(workflow, /npm run test:market-discovery/);
  assert.match(workflow, /npm run test:future-intelligence/);
  assert.match(workflow, /npm run future:intelligence/);
  assert.match(workflow, /- name: Security Audit\n\s+run: npm run production:security/);
  assert.doesNotMatch(workflow, /- name: Security Audit\n\s+continue-on-error: true/);
});
