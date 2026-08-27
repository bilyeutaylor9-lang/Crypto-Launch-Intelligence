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
      /SUPABASE_ENABLED:\s*\$\{\{ vars\.SUPABASE_ENABLED \|\| secrets\.SUPABASE_ENABLED \|\| '(?:false|true)' \}\}/,
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

test("shadow universe refresh produces a fresh exact handoff before Alpha OS consumes it", () => {
  const refresh = fs.readFileSync(".github/workflows/shadow-universe-refresh.yml", "utf8");
  const alpha = fs.readFileSync(".github/workflows/autonomous-alpha-os.yml", "utf8");

  assert.match(refresh, /schedule:/);
  assert.match(refresh, /run:\s*npm run scan:debug100/);
  assert.match(refresh, /run:\s*npm run operations:truth -- --scope shadow-universe/);
  assert.match(refresh, /run:\s*npm run state:pack -- --require-exact-universe/);
  assert.match(refresh, /cron:\s*"5 \* \* \* \*"/);
  assert.match(alpha, /cron:\s*"12,42 \* \* \* \*"/);
  assert.match(
    fs.readFileSync(".github/workflows/future-intelligence-stack.yml", "utf8"),
    /cron:\s*"11,41 \* \* \* \*"/,
  );
  assert.ok(
    alpha.indexOf("Enforce Fresh Exact Shadow Universe") < alpha.indexOf("Run Production Shadow"),
  );
  assert.match(alpha, /data\/edge-candidate-universe\.json/);
});

test("live dashboard runs shadow capture from the fresh scan and defers final health verdict until deployment", () => {
  const workflow = fs.readFileSync(".github/workflows/pages-dashboard.yml", "utf8");

  assert.match(workflow, /actions\/cache\/restore@v5/);
  assert.match(workflow, /actions\/cache\/save@v5/);
  assert.match(workflow, /path: \.state\/scanner-learning-bundle\.json\.gz/);
  assert.match(workflow, /run: npm run state:restore/);
  assert.match(workflow, /run: npm run state:pack -- --require-exact-universe/);
  const scan = workflow.indexOf("Run Intelligence Scanner");
  const shadow = workflow.indexOf("Run Production Shadow From Fresh Scan");
  const truth = workflow.indexOf("Enforce Fresh Exact Shadow Handoff");
  assert.ok(shadow > scan);
  assert.ok(truth > shadow);
  assert.match(workflow, /run: npm run production:shadow/);
  assert.match(workflow, /run: npm run operations:truth -- --scope dashboard-shadow/);
  const shadowStep = workflow.slice(shadow, truth);
  const truthStep = workflow.slice(truth, workflow.indexOf("Sync Durable Forward Evidence"));
  assert.doesNotMatch(shadowStep, /continue-on-error:\s*true/);
  assert.doesNotMatch(truthStep, /continue-on-error:\s*true/);
  assert.match(workflow, /DASHBOARD_REQUIRE_LIVE:\s*["']true["']/);
  assert.match(workflow, /IGNITION_EXECUTABLE_QUOTE_ENDPOINT: \$\{\{ secrets\.IGNITION_EXECUTABLE_QUOTE_ENDPOINT \}\}/);
  assert.match(workflow, /run: npm run forward:evidence:sync/);
  assert.match(workflow, /id:\s*semantic_health/);
  assert.match(workflow, /id:\s*report_contracts/);
  assert.match(workflow, /health:\s*\n\s*name: Verify Scan And Deployment Health/);
  assert.match(workflow, /needs: \[build, deploy\]/);
  assert.match(workflow, /DEPLOY:\s*\$\{\{ needs\.deploy\.result \}\}/);
  assert.match(workflow, /PRODUCTION_SHADOW:\s*\$\{\{ needs\.build\.outputs\.production_shadow \}\}/);
  assert.match(workflow, /OPERATIONAL_TRUTH:\s*\$\{\{ needs\.build\.outputs\.operational_truth \}\}/);
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
  assert.match(workflow, /path: \.state\/scanner-learning-bundle\.json\.gz/);
  assert.match(workflow, /run: npm run state:restore/);
  assert.match(workflow, /run: npm run state:pack -- --require-exact-universe/);
});

test("every scanner-learning cache uses one validated canonical artifact", () => {
  const workflowPaths = [
    ".github/workflows/pages-dashboard.yml",
    ".github/workflows/outcome-probe.yml",
    ".github/workflows/edge-evidence-truth.yml",
    ".github/workflows/edge-lab.yml",
    ".github/workflows/edge-fast-evidence.yml",
    ".github/workflows/edge-verification-program.yml",
    ".github/workflows/production-shadow.yml",
    ".github/workflows/autonomous-alpha-os.yml",
    ".github/workflows/pages-dashboard.yml",
    ".github/workflows/future-intelligence-stack.yml",
    ".github/workflows/market-discovery-os.yml",
    ".github/workflows/future-intelligence-stack.yml",
  ];

  for (const workflowPath of workflowPaths) {
    const workflow = fs.readFileSync(workflowPath, "utf8");
    const scannerBlocks = [...workflow.matchAll(
      /uses: actions\/cache\/(?:restore|save)@v5[\s\S]*?(?=\n\s{6}- name:|$)/g,
    )]
      .map((match) => match[0])
      .filter((block) => /key: scanner-learning-/.test(block));
    assert.ok(scannerBlocks.length >= 1, `${workflowPath} must restore canonical scanner state`);
    for (const block of scannerBlocks) {
      assert.match(block, /path: \.state\/scanner-learning-bundle\.json\.gz/, `${workflowPath} cache version drifted`);
    }
    assert.match(workflow, /run: npm run state:restore/);
  }
});

test("fast evidence runs after a successful dashboard instead of every five minutes", () => {
  const workflow = fs.readFileSync(".github/workflows/edge-fast-evidence.yml", "utf8");
  assert.doesNotMatch(workflow, /\*\/5 \* \* \* \*/);
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows: \["Live Dashboard"\]/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
});

test("edge evidence truth cannot mask acquisition infrastructure failure", () => {
  const workflow = fs.readFileSync(".github/workflows/edge-evidence-truth.yml", "utf8");
  assert.match(workflow, /id: acquisition_health/);
  assert.match(workflow, /run: npm run operations:truth -- --scope edge-truth/);
  assert.match(workflow, /ACQUISITION_HEALTH: \$\{\{ steps\.acquisition_health\.outcome \}\}/);
  assert.match(workflow, /OPERATIONAL_TRUTH: \$\{\{ steps\.operational_truth\.outcome \}\}/);
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
    "data/market-context-observations.jsonl",
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
  assert.match(workflow, /data\/market-context-observations\.jsonl/);
  assert.match(workflow, /data\/prospective-edge-cohorts\.jsonl/);
  assert.match(workflow, /data\/edge-candidate-universe\.json/);
  assert.match(workflow, /run:\s*npm run alpha:os/);
  assert.match(workflow, /run:\s*npm run market:discover/);
  assert.match(workflow, /run:\s*npm run market:context/);
  assert.match(workflow, /run:\s*npm run future:intelligence/);
  assert.match(workflow, /run:\s*npm run test:future-intelligence/);
  assert.match(
    workflow,
    /if: \$\{\{ always\(\) && hashFiles\('data\/edge-candidate-universe\.json'\) != '' \}\}\n\s+continue-on-error: true\n\s+uses: actions\/cache\/save@v5/,
  );
});

test("CLI 15 workflow consumes exact evidence without launching or mutating a full scan", () => {
  const workflow = fs.readFileSync(".github/workflows/cli15-forward-alpha-validation.yml", "utf8");

  assert.match(workflow, /schedule:/);
  assert.match(workflow, /group:\s*cli15-forward-alpha-validation-\$\{\{ github\.ref \}\}/);
  assert.match(workflow, /data\/production-market-observations\.jsonl/);
  assert.match(workflow, /data\/prospective-edge-cohorts\.jsonl/);
  assert.match(workflow, /data\/ignition-executable-edge-canary-tickets\.jsonl/);
  assert.match(workflow, /run:\s*npm run test:cli15/);
  assert.match(workflow, /run:\s*npm run cli15:validate/);
  assert.match(workflow, /reports\/forward-alpha-validation-os\.json/);
  assert.match(workflow, /reports\/cli15-promotion-gate\.json/);
  assert.doesNotMatch(workflow, /npm run scan/);
  assert.doesNotMatch(workflow, /git push|contents:\s*write/);
});

test("production verification exercises CLI 3-15 and treats security failure as blocking", () => {
  const workflow = fs.readFileSync(".github/workflows/production-verification.yml", "utf8");

  assert.match(workflow, /npm run test:alpha-os/);
  assert.match(workflow, /npm run test:market-discovery/);
  assert.match(workflow, /npm run test:future-intelligence/);
  assert.match(workflow, /npm run future:intelligence/);
  assert.match(workflow, /npm run test:cli15/);
  assert.match(workflow, /npm run cli15:validate/);
  assert.match(workflow, /Verify Production Shadow Fails Closed Without Live Universe/);
  assert.match(workflow, /if \[ "\$status" -ne 2 \]/);
  assert.match(workflow, /PRODUCTION_SHADOW_BLOCKED_UNIVERSE_PRECONDITION/);
  assert.match(workflow, /- name: Security Audit\n\s+run: npm run production:security/);
  assert.doesNotMatch(workflow, /- name: Security Audit\n\s+continue-on-error: true/);
});
