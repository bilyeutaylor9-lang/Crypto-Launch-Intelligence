import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(import.meta.url);
const root = fileURLToPath(new URL("../../", import.meta.url));
const bootstrap = fileURLToPath(new URL("./offlineScannerSmokeBootstrap.js", import.meta.url));
const scenarios = new Set(["baseline", "missing-proof", "expired-proof", "unsafe-proof", "malformed-artifact", "network-denial"]);

export function runOfflineScannerSmoke(options = {}) {
  const scenario = options.scenario || "baseline";
  assert.ok(scenarios.has(scenario), `Unknown offline smoke scenario: ${scenario}`);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cli-offline-scanner-smoke-"));
  fs.writeFileSync(path.join(directory, "offline-smoke-marker"), "TEST/OFFLINE_FIXTURE\n");
  fs.symlinkSync(path.join(root, "src"), path.join(directory, "src"), "dir");
  for (const name of ["data", "reports", "home"]) fs.mkdirSync(path.join(directory, name));
  const env = {
    PATH: process.env.PATH || "", HOME: path.join(directory, "home"), TMPDIR: os.tmpdir(),
    TZ: "UTC", LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8",
    NODE_OPTIONS: `--import=${JSON.stringify(bootstrap)}`,
    OFFLINE_SCANNER_SMOKE_ROOT: directory, ARTIFACT_CLASS: "TEST", SCAN_ARTIFACT_CLASS: "TEST",
    GITHUB_SHA: "0000000000000000000000000000000000000001",
    PIPELINE_ENGINE_PROFILE: "full", LOCAL_AI_MODE: "OFF", SUPABASE_ENABLED: "false",
    SECURITY_EVIDENCE_COLLECT: "false", FREE_PROVIDER_QUOTES_ENABLED: "false",
    FORWARD_EVIDENCE_CAPTURE_ENABLED: "false", X_PROJECT_LIMIT: "0", NEWS_PROJECT_LIMIT: "0",
    WEB_RESEARCH_AGENT_LIMIT: "0", INTERNET_RESEARCH_PROJECT_LIMIT: "0",
  };
  const child = spawnSync(process.execPath, [entry, "--worker", scenario], {
    cwd: directory, env, encoding: "utf8", timeout: options.timeoutMs || 180_000, maxBuffer: 32 * 1024 * 1024,
  });
  const resultPath = path.join(directory, "offline-smoke-result.json");
  const networkPath = path.join(directory, "network-attempts.jsonl");
  const networkAttempts = fs.existsSync(networkPath) ? fs.readFileSync(networkPath, "utf8").trim().split("\n").filter(Boolean) : [];
  const summary = fs.existsSync(resultPath) ? JSON.parse(fs.readFileSync(resultPath, "utf8")) : null;
  const result = { status: child.status === 0 && !child.error && networkAttempts.length === 0 ? "PASS" : "FAIL",
    scenario, directory, summary, networkAttempts, error: child.error?.message || null,
    stdout: child.stdout || "", stderr: child.stderr || "" };
  fs.writeFileSync(path.join(directory, "worker.log"), result.stdout + "\n" + result.stderr);
  if (options.keepArtifacts === false || (result.status === "PASS" && options.keepArtifacts !== true)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  return result;
}

async function runWorker(scenario) {
  const { assertNoNetworkAttempts } = await import("./offlineScannerSmokeBootstrap.js");
  const { buildOfflineScannerFixture, FIXTURE_RUN_ID, FIXTURE_TIME } = await import("../../test/fixtures/offlineScannerSmokeFixture.js");
  const { planResearchQueue, buildScannerSemanticHealth } = await import("../index.js");
  const { runIntelligencePipeline } = await import("../intelligencePipeline.js");
  const { buildGuardedLiveRanking } = await import("../ranking/guardedLiveRankingEngine.js");
  const { revalidateExecutionPublicationBoundary } = await import("../execution/executionPublicationBoundary.js");
  const { decisionProofAssessment } = await import("../kernel/evidenceFunnelSummary.js");
  const { generateReports } = await import("../reports/reportOrchestrator.js");
  const { refreshSystemReadinessReport } = await import("../reports/refreshSystemReadinessReport.js");
  const { REQUIRED_REPORT_FILES, DASHBOARD_CRITICAL_REPORT_FILES, validateReportContracts } = await import("../reports/reportContractValidator.js");
  const { evaluateScannerSmoke } = await import("./scannerSmokeCheck.js");
  const { auditArtifactProvenance } = await import("../reports/artifactProvenanceFirewall.js");
  if (scenario === "network-denial") {
    try { await fetch("https://offline-fixture.invalid/forbidden"); } catch { /* Deliberately swallowed. */ }
    assertNoNetworkAttempts();
  }
  const fixture = await buildOfflineScannerFixture(scenario);
  for (const project of fixture.projects) {
    for (const field of ["finalSelectionState", "finalSelectionQualified", "coreEvidenceState",
      "coreEvidenceCoveragePct", "engineDataReadiness", "engineResults", "executionProof", "liveExecutionReady"]) {
      assert.equal(Object.hasOwn(project, field), false, `Fixture cannot precompute ${field}`);
    }
  }
  const plan = planResearchQueue(fixture.projects, { limit: fixture.projects.length, history: {}, runSequence: 1 });
  let results = await runIntelligencePipeline(plan.selected, {
    scanRunId: FIXTURE_RUN_ID, engineProfile: "full", saveMemory: false, freeOnly: true,
    strictFinalSelectionIntegrity: true, strictSniperIntegrity: true,
    localAI: { mode: "OFF", enabled: false }, webResearchAgent: { limit: 0 },
    externalIntelligence: { x: { limit: 0 }, news: { limit: 0 }, internet: { enabled: false, limit: 0 } },
    contractAuthorityRisk: { collectSecurityEvidence: false },
    activeEvidenceRecovery: { wave1Max: 0, wave2Max: 0, wave3Max: scenario === "expired-proof" ? 0 : 1,
      maxProviderRequests: 2, useCache: false, walletHistory: false, executionRecovery: fixture.executionRecovery },
  });
  results = revalidateExecutionPublicationBoundary(results);
  const ranked = buildGuardedLiveRanking(results, { scanRunId: FIXTURE_RUN_ID, dataCutoffTimestamp: FIXTURE_TIME }).ranked;
  const semantic = buildScannerSemanticHealth(ranked, { discovery: fixture.discovery });
  const meta = { scanRunId: FIXTURE_RUN_ID, runId: FIXTURE_RUN_ID, mode: "offline-smoke",
    artifactClass: "TEST", evidenceMode: "OFFLINE_FIXTURE", codeCommitSha: process.env.GITHUB_SHA,
    startedAt: FIXTURE_TIME, completedAt: FIXTURE_TIME, dataCutoffTimestamp: FIXTURE_TIME,
    scannedProjects: ranked.length, discovery: fixture.discovery, analysisFunnel: plan.report,
    scannerSemanticHealth: semantic, automaticTradingEnabled: false, automaticModelPromotion: false };
  const summary = { scenario, phase: "reports", artifactClass: meta.artifactClass, evidenceMode: meta.evidenceMode,
    livePublishable: null, semantic, fixtureCalls: fixture.calls,
    candidates: ranked.map(project => ({ symbol: project.symbol, finalSelectionState: project.finalSelectionState,
      coreEvidenceCoveragePct: project.coreEvidenceCoveragePct, engineDataReadiness: project.engineDataReadiness,
      executionProof: project.executionProof, decision: decisionProofAssessment(project),
      recoveryRequestCount: project.activeEvidenceRecovery?.batchSummary?.providerRequestsUsed || 0,
      recoveredFields: project.activeEvidenceRecovery?.recoveredFields || [],
      engineStages: Object.keys(project.engineResults || {}) })) };
  fs.writeFileSync("offline-smoke-result.json", JSON.stringify(summary, null, 2));
  generateReports(ranked, meta);
  summary.phase = "audit";
  fs.writeFileSync("offline-smoke-result.json", JSON.stringify(summary, null, 2));
  const audit = spawnSync(process.execPath, [fileURLToPath(new URL("../engineHealthCheck.js", import.meta.url)), "--full"], {
    cwd: process.cwd(), env: process.env, encoding: "utf8", timeout: 140_000, maxBuffer: 16 * 1024 * 1024,
  });
  console.log(audit.stdout || "");
  if (audit.stderr) console.error(audit.stderr);
  assert.equal(audit.status, 0, audit.error?.message || "Full production engine audit failed");
  if (scenario === "malformed-artifact") fs.writeFileSync("reports/route-universe.json", "{invalid-json");
  const refresh = refreshSystemReadinessReport({ meta });
  const contracts = validateReportContracts();
  const smoke = evaluateScannerSmoke();
  const readReport = name => JSON.parse(fs.readFileSync(path.join("reports", name), "utf8"));
  const readiness = readReport("system-readiness.json"), manifest = readReport("scan-artifact-manifest.json");
  const health = readReport("engine-health-report.json");
  Object.assign(summary, { phase: "readiness", artifactClass: manifest.artifactClass, evidenceMode: manifest.evidenceMode,
    livePublishable: manifest.livePublishable, semantic, refresh, contractStatus: contracts.status,
    smokeStatus: smoke.status, requiredFiles: REQUIRED_REPORT_FILES, manifestFiles: manifest.artifacts.map(item => item.fileName),
    readinessFailures: readiness.failures, engineFailures: health.failures });
  fs.writeFileSync("offline-smoke-result.json", JSON.stringify(summary, null, 2));
  assertNoNetworkAttempts();
  assert.equal(manifest.artifactClass, "TEST");
  assert.equal(manifest.evidenceMode, "OFFLINE_FIXTURE");
  assert.equal(manifest.livePublishable, false);
  assert.equal(refresh.systemReadinessStatus, "PASS", JSON.stringify(readiness.failures));
  assert.equal(refresh.reportContractStatus, "PASS");
  assert.equal(refresh.manifestStatus, "COMPLETE", JSON.stringify(manifest.errors));
  assert.equal(contracts.status, "PASS", JSON.stringify(contracts));
  assert.equal(smoke.status, "PASS", JSON.stringify(smoke.findings));
  assert.equal(semantic.status, "NO_EDGE_FOUND");
  assert.equal(semantic.healthyCoreEvidence, true);
  assert.equal(semantic.healthyDecisionEvidence, true);
  assert.ok(semantic.decisionEvidenceComplete > 0, "Baseline must prove a non-rejected candidate's decision evidence");
  assert.equal(semantic.qualifiedCandidates, 0);
  assert.deepEqual(manifest.artifacts.map(item => item.fileName), DASHBOARD_CRITICAL_REPORT_FILES);
  for (const artifact of manifest.artifacts) {
    const bytes = fs.readFileSync(path.join("reports", artifact.fileName));
    assert.equal(artifact.scanRunId, FIXTURE_RUN_ID);
    assert.equal(artifact.sha256, crypto.createHash("sha256").update(bytes).digest("hex"));
  }
  const live = auditArtifactProvenance({ ...meta, artifactClass: "LIVE_SHADOW" }, [
    { fileName: "report.json", parsed: readReport("report.json") },
  ]);
  assert.equal(live.livePublishable, false, "Offline report metadata must not pass live provenance");
}

if (process.argv[1] && path.resolve(process.argv[1]) === entry) {
  if (process.argv[2] === "--worker") {
    runWorker(process.argv[3]).then(() => process.exit(0)).catch(error => {
      if (fs.existsSync("offline-smoke-result.json")) {
        const summary = JSON.parse(fs.readFileSync("offline-smoke-result.json", "utf8"));
        fs.writeFileSync("offline-smoke-result.json", JSON.stringify({ ...summary, failure: error.message }, null, 2));
      }
      console.error(error);
      process.exit(1);
    });
  } else {
    const result = runOfflineScannerSmoke();
    console.log(JSON.stringify({ status: result.status, scenario: result.scenario,
      phase: result.summary?.phase || "initialization", semantic: result.summary?.semantic || null,
      readiness: result.summary?.refresh || null,
      ...(result.status === "FAIL" ? { diagnostics: result.directory, error: result.error, stderr: result.stderr } : {}) }, null, 2));
    if (result.status !== "PASS") process.exitCode = 1;
  }
}
