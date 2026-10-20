import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runOfflineScannerSmoke } from "../src/ops/runOfflineScannerSmoke.js";

function artifactDigest(root) {
  const hash = crypto.createHash("sha256");
  function visit(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isSymbolicLink()) hash.update(file + fs.readlinkSync(file));
      else {
        hash.update(file);
        const fd = fs.openSync(file, "r"), buffer = Buffer.alloc(1024 * 1024);
        try {
          let size;
          while ((size = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, size));
        } finally { fs.closeSync(fd); }
      }
    }
  }
  for (const directory of ["data", "reports", "docs", ".state"]) visit(path.join(root, directory));
  return hash.digest("hex");
}

function run(t, scenario = "baseline") {
  const result = runOfflineScannerSmoke({ scenario, keepArtifacts: true });
  t.after(() => fs.rmSync(result.directory, { recursive: true, force: true }));
  return result;
}

function semanticProjection(summary) {
  return {
    semantic: summary.semantic, artifactClass: summary.artifactClass, evidenceMode: summary.evidenceMode,
    livePublishable: summary.livePublishable, contractStatus: summary.contractStatus, smokeStatus: summary.smokeStatus,
    requiredFiles: summary.requiredFiles, manifestFiles: summary.manifestFiles, fixtureCalls: summary.fixtureCalls,
    candidates: summary.candidates.map(candidate => ({ symbol: candidate.symbol, finalSelectionState: candidate.finalSelectionState,
      coreEvidenceCoveragePct: candidate.coreEvidenceCoveragePct, executionProof: candidate.executionProof,
      decision: candidate.decision, engineStages: candidate.engineStages })),
  };
}

test("offline smoke preserves isolated caller artifacts across success and failure", { timeout: 1_200_000 }, async t => {
  const caller = fs.mkdtempSync(path.join(os.tmpdir(), "offline-smoke-caller-"));
  const originalCwd = process.cwd();
  for (const directory of ["data", "reports", "docs", ".state"]) {
    fs.mkdirSync(path.join(caller, directory));
    fs.writeFileSync(path.join(caller, directory, "captured-live-sentinel.json"), '{"evidence":"original-live-only"}\n');
  }
  const before = artifactDigest(caller);
  process.chdir(caller);
  t.after(() => {
    try { assert.equal(artifactDigest(caller), before, "Caller artifacts changed"); }
    finally { process.chdir(originalCwd); fs.rmSync(caller, { recursive: true, force: true }); }
  });

  await t.test("full production pipeline, audit and default readiness pass repeatably with no edge", t => {
    const first = run(t), second = run(t);
    for (const result of [first, second]) {
      assert.equal(result.status, "PASS", result.stderr || result.error);
      assert.deepEqual(result.networkAttempts, []);
      assert.equal(result.summary.semantic.status, "NO_EDGE_FOUND");
      assert.equal(result.summary.refresh.systemReadinessStatus, "PASS");
      assert.equal(result.summary.refresh.manifestStatus, "COMPLETE");
      assert.equal(result.summary.livePublishable, false);
      assert.ok(result.summary.requiredFiles.length > 50);
      assert.ok(result.summary.candidates[0].engineStages.length > 100);
      assert.equal(result.summary.candidates[0].decision.conclusivelyRejected, false);
      assert.deepEqual(result.summary.candidates[0].decision.missingFields, []);
      assert.equal(result.summary.candidates[0].recoveryRequestCount, 2);
      assert.ok(result.summary.candidates[0].recoveredFields.length > 0);
      assert.ok(result.summary.fixtureCalls.includes("getAccountInfo"));
      assert.ok(result.summary.fixtureCalls.includes("buy-quote"));
      assert.ok(result.summary.fixtureCalls.includes("sell-quote"));
    }
    assert.deepEqual(semanticProjection(first.summary), semanticProjection(second.summary));
  });

  for (const scenario of ["missing-proof", "expired-proof"]) {
    await t.test(`${scenario} cannot pass decision readiness or create a qualified pick`, t => {
      const result = run(t, scenario);
      assert.equal(result.status, "FAIL");
      assert.deepEqual(result.networkAttempts, []);
      assert.ok(result.summary, result.stderr || result.error);
      assert.equal(result.summary.semantic.status, "DATA_DEGRADED");
      assert.equal(result.summary.semantic.qualifiedCandidates, 0);
      assert.ok(result.summary.candidates[0].decision.missingFields.length > 0);
      if (scenario === "expired-proof") assert.ok(result.summary.candidates[0].decision.missingFields.includes("QUOTE_FRESHNESS"));
      assert.equal(result.summary.phase, "readiness", result.stderr);
      assert.equal(result.summary.refresh.systemReadinessStatus, "FAIL");
      assert.equal(result.summary.smokeStatus, "FAIL");
    });
  }

  await t.test("unsafe raw security evidence stays blocked and cannot masquerade as the healthy baseline", t => {
    const result = run(t, "unsafe-proof");
    assert.equal(result.status, "FAIL");
    assert.deepEqual(result.networkAttempts, []);
    assert.ok(result.summary, result.stderr || result.error);
    assert.equal(result.summary.semantic.qualifiedCandidates, 0);
    assert.equal(result.summary.candidates[0].finalSelectionState, "BLOCKED");
    assert.equal(result.summary.candidates[0].executionProof.safetyVerified, false);
    assert.equal(result.summary.candidates[0].decision.conclusivelyRejected, true);
  });

  await t.test("malformed real pipeline output fails full report contracts and manifest", t => {
    const result = run(t, "malformed-artifact");
    assert.equal(result.status, "FAIL");
    assert.deepEqual(result.networkAttempts, []);
    assert.ok(result.summary, result.stderr || result.error);
    assert.equal(result.summary.phase, "readiness", result.stderr);
    assert.equal(result.summary.contractStatus, "FAIL");
    assert.equal(result.summary.refresh.reportContractStatus, "FAIL");
    assert.equal(result.summary.refresh.manifestStatus, "INCOMPLETE");
  });

  await t.test("swallowing a forbidden fetch still fails the harness", t => {
    const result = run(t, "network-denial");
    assert.equal(result.status, "FAIL");
    assert.ok(result.networkAttempts.length > 0);
    assert.match(result.stderr, /OFFLINE_NETWORK_FORBIDDEN/);
  });
});

test("offline bootstrap blocks native transports and inherits denial into Node descendants", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "offline-network-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, "offline-smoke-marker"), "TEST\n");
  const bootstrap = fileURLToPath(new URL("../src/ops/offlineScannerSmokeBootstrap.js", import.meta.url));
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import http from 'node:http'; import https from 'node:https'; import http2 from 'node:http2';
    import net from 'node:net'; import tls from 'node:tls'; import dns from 'node:dns';
    import dgram from 'node:dgram'; import { spawnSync } from 'node:child_process';
    for (const call of [() => http.get('http://offline.invalid'), () => https.get('https://offline.invalid'),
      () => http2.connect('https://offline.invalid'), () => net.connect(443, 'offline.invalid'),
      () => new net.Socket().connect(443, 'offline.invalid'), () => tls.connect(443, 'offline.invalid'),
      () => dns.lookup('offline.invalid', () => {}), () => new WebSocket('wss://offline.invalid')]) {
      try { call(); } catch {}
    }
    const socket = dgram.createSocket('udp4');
    try { socket.send('forbidden', 53, 'offline.invalid'); } catch {} finally { socket.close(); }
    try { await dns.promises.lookup('offline.invalid'); } catch {}
    const nested = spawnSync(process.execPath, ['--input-type=module', '-e',
      "try { await fetch('https://offline.invalid'); } catch {} process.exit(0);"], { env: process.env });
    if (nested.status !== 1) throw new Error('Nested worker escaped network denial');
  `], { cwd: directory, env: { NODE_OPTIONS: `--import=${JSON.stringify(bootstrap)}`,
    OFFLINE_SCANNER_SMOKE_ROOT: directory, TMPDIR: os.tmpdir() }, encoding: "utf8", timeout: 15_000 });
  assert.equal(child.status, 1, child.stderr);
  assert.ok(fs.existsSync(path.join(directory, "network-attempts.jsonl")), child.stderr);
  const attempts = fs.readFileSync(path.join(directory, "network-attempts.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  assert.ok(attempts.some(item => item.api === "fetch"));
  assert.ok(attempts.some(item => item.api === "Socket.connect"));
  assert.ok(new Set(attempts.map(item => item.pid)).size === 2);
});
