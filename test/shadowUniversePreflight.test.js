import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ensureFreshShadowUniverse, refreshBoundedShadowUniverse } from "../src/ops/ensureFreshShadowUniverse.js";

const NOW = "2026-10-20T06:36:26.000Z";
const identity = { chain: "base", tokenAddress: "0x" + "1".repeat(40), poolAddress: "0x" + "2".repeat(40) };
const universe = generatedAt => ({ generatedAt, exactCandidates: 1, candidates: [identity] });
const options = { clock: () => NOW, writeReport: false };

test("fresh exact cached universes spend no refresh requests", async () => {
  let refreshes = 0;
  const report = await ensureFreshShadowUniverse({ ...options, loadUniverse: () => universe(NOW), refresh: () => { refreshes++; } });
  assert.equal(report.status, "PASS");
  assert.equal(report.refreshAttempted, false);
  assert.equal(refreshes, 0);
});

test("the observed 168-minute stale-cache failure gets one refresh and a new 90-minute gate evaluation", async () => {
  let current = universe("2026-10-20T03:47:48.000Z"), refreshes = 0;
  const report = await ensureFreshShadowUniverse({ ...options, loadUniverse: () => current,
    refresh: async () => { refreshes++; current = universe(NOW); } });
  assert.equal(refreshes, 1);
  assert.ok(report.before.blockers.includes("EXACT_CANDIDATE_UNIVERSE_STALE"));
  assert.equal(report.before.metrics.universeAgeMinutes, 168.63);
  assert.equal(report.after.metrics.universeAgeMinutes, 0);
  assert.equal(report.after.metrics.maximumUniverseAgeMinutes, 90);
  assert.equal(report.status, "PASS");
});

test("a missing cache can be replaced by newly acquired exact candidates", async () => {
  let current = { availabilityState: "EDGE_CANDIDATE_UNIVERSE_UNAVAILABLE", candidates: [], exactCandidates: 0 };
  const report = await ensureFreshShadowUniverse({ ...options, loadUniverse: () => current, refresh: () => { current = universe(NOW); } });
  assert.equal(report.status, "PASS");
  assert.equal(report.refreshAttempted, true);
});

test("refresh cannot bless unchanged stale data, future timestamps or count mismatches", async () => {
  for (const refreshed of [universe("2026-10-20T03:47:48.000Z"), universe("2026-10-20T08:00:00.000Z"),
    { ...universe(NOW), exactCandidates: 2 }]) {
    let current = universe("2026-10-20T03:47:48.000Z");
    await assert.rejects(ensureFreshShadowUniverse({ ...options, loadUniverse: () => current, refresh: () => { current = refreshed; } }),
      error => error.report.status === "FAIL" && error.report.after.pass === false);
  }
});

test("identity corruption is an immediate failure and does not trigger acquisition", async () => {
  let refreshes = 0;
  await assert.rejects(ensureFreshShadowUniverse({ ...options,
    loadUniverse: () => ({ ...universe(NOW), exactCandidates: 2 }), refresh: () => { refreshes++; } }),
  error => error.report.after.blockers.includes("CANDIDATE_UNIVERSE_COUNT_MISMATCH"));
  assert.equal(refreshes, 0);
});

test("failed refresh remains a failure even if its partial scan wrote a fresh universe", async () => {
  let current = universe("2026-10-20T03:47:48.000Z");
  await assert.rejects(ensureFreshShadowUniverse({ ...options, loadUniverse: () => current,
    refresh: () => { current = universe(NOW); throw new Error("scan timed out"); } }),
  error => error.report.status === "FAIL" && error.report.after.pass && error.cause.message === "scan timed out");
});

test("clock advances are evaluated after refresh rather than relabeling the old receipt time", async () => {
  let now = NOW, current = universe("2026-10-20T03:47:48.000Z");
  await assert.rejects(ensureFreshShadowUniverse({ ...options, clock: () => now, loadUniverse: () => current,
    refresh: () => { current = universe(NOW); now = "2026-10-20T08:07:26.000Z"; } }),
  error => error.report.after.blockers.includes("EXACT_CANDIDATE_UNIVERSE_STALE"));
  await assert.rejects(ensureFreshShadowUniverse({ ...options, clock: () => "invalid", loadUniverse: () => universe(NOW) }), /Invalid shadow preflight clock/);
});

test("the real adapter runs the existing bounded profile directly with a twelve-minute hard deadline", () => {
  let invocation;
  refreshBoundedShadowUniverse({ run: (...args) => { invocation = args; } });
  assert.equal(invocation[0], process.execPath);
  assert.deepEqual(invocation[1], ["src/index.js"]);
  assert.equal(invocation[2].stdio, "inherit");
  assert.equal(invocation[2].timeout, 12 * 60 * 1000);
  assert.equal(invocation[2].killSignal, "SIGKILL");
  for (const field of ["DISCOVERY_SCAN_LIMIT", "WIDE_SCAN_LIMIT", "DISCOVERY_TARGET_CANDIDATES", "STANDARD_INTELLIGENCE_LIMIT", "INTELLIGENCE_PIPELINE_LIMIT"]) {
    assert.equal(invocation[2].env[field], "100");
  }
  assert.equal(invocation[2].env.LOCAL_AI_MODE, "OFF");
  assert.throws(() => refreshBoundedShadowUniverse({ timeoutMs: 12 * 60 * 1000 + 1 }), /Invalid bounded refresh timeout/);
  const workflow = fs.readFileSync(".github/workflows/autonomous-alpha-os.yml", "utf8");
  assert.match(workflow, /name: Enforce Fresh Exact Shadow Universe\n\s+timeout-minutes: 13\n\s+run: node src\/ops\/ensureFreshShadowUniverse.js/);
  assert.ok(workflow.indexOf("ensureFreshShadowUniverse.js") < workflow.indexOf("name: Run Production Shadow"));
});
