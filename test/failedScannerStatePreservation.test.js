import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

import { FAILED_SCANNER_STATE_MAX_BYTES, FAILED_SCANNER_STATE_PATTERNS,
  preserveFailedScannerState, shouldPreserveFailedScannerState } from "../src/ops/preserveFailedScannerState.js";
import { SCANNER_STATE_PATTERNS, SCANNER_STATE_ARCHIVE_PATTERNS } from "../src/ops/scannerStateBundle.js";

const WORKFLOWS = ["edge-evidence-truth", "edge-fast-evidence", "edge-lab", "edge-verification-program",
  "outcome-probe", "pages-dashboard", "production-shadow", "shadow-universe-refresh"];
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function workflowSteps(file, jobId = null) {
  let workflow = fs.readFileSync(`.github/workflows/${file}.yml`, "utf8");
  if (jobId) {
    const start = workflow.indexOf(`\n  ${jobId}:\n`);
    assert.ok(start >= 0, `${file} must contain job ${jobId}`);
    workflow = workflow.slice(start + 1).split(/\n(?=  [A-Za-z0-9_-]+:)/)[0];
  }
  return workflow.split(/\n(?=      - name:)/);
}

function shellScript(step) {
  const body = step.split("        run: |\n")[1];
  assert.ok(body, "the actual workflow step must contain an inline shell script");
  return body.split("\n").map(line => line.startsWith("          ") ? line.slice(10) : line).join("\n");
}

function runShell(step, outcomes) {
  return spawnSync("bash", ["-c", shellScript(step)], {
    env: { PATH: process.env.PATH, ...outcomes }, encoding: "utf8",
  });
}

function fixture(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "failed-scanner-state-test-")));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, "source"); fs.mkdirSync(root); fs.mkdirSync(path.join(root, "data"));
  return { directory, root, outputDir: path.join(directory, "diagnostic") };
}

function source(root, relative, bytes) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
  return file;
}

function preserve(options) {
  return preserveFailedScannerState({ packOutcome: "failure", cacheSaveOutcome: "skipped", ...options });
}

function sourceReadFault(t, root, mutate) {
  const open = fs.openSync, close = fs.closeSync, read = fs.readSync, descriptors = new Set();
  const observations = { opens: 0, reads: 0, maxReadSize: 0 };
  fs.openSync = function(file, ...args) {
    const fd = open.call(fs, file, ...args);
    if (typeof file === "string" && file.startsWith(`${root}${path.sep}data${path.sep}`)) {
      descriptors.add(fd); observations.opens++;
    }
    return fd;
  };
  fs.closeSync = function(fd) { descriptors.delete(fd); return close.call(fs, fd); };
  fs.readSync = function(fd, ...args) {
    const count = read.call(fs, fd, ...args);
    if (descriptors.has(fd)) {
      observations.reads++; observations.maxReadSize = Math.max(observations.maxReadSize, args[2]);
      mutate?.({ fd, count, position: args[3], observations });
    }
    return count;
  };
  t.after(() => { fs.openSync = open; fs.closeSync = close; fs.readSync = read; });
  return observations;
}

test("failed-state selection is exactly the fixed canonical/archive allowlist union", () => {
  assert.deepEqual(FAILED_SCANNER_STATE_PATTERNS, [...new Set([...SCANNER_STATE_PATTERNS, ...SCANNER_STATE_ARCHIVE_PATTERNS])]);
  assert.equal(FAILED_SCANNER_STATE_MAX_BYTES, 1024 ** 3);
});

test("failed pack or failed canonical cache save triggers preservation, never all-success", () => {
  assert.equal(shouldPreserveFailedScannerState({ packOutcome: "failure", cacheSaveOutcome: "skipped" }), true);
  assert.equal(shouldPreserveFailedScannerState({ packOutcome: "success", cacheSaveOutcome: "failure" }), true);
  assert.equal(shouldPreserveFailedScannerState({ packOutcome: "success", cacheSaveOutcome: "skipped" }), true);
  assert.equal(shouldPreserveFailedScannerState({ packOutcome: "success", cacheSaveOutcome: "success" }), false);
  assert.equal(preserveFailedScannerState({ packOutcome: "success", cacheSaveOutcome: "success" }).status, "NOT_NEEDED");
  assert.throws(() => shouldPreserveFailedScannerState({ packOutcome: "fake" }), /INVALID_STEP_OUTCOME/);
});

test("raw CRLF/malformed/bad-hash bytes roundtrip through system tar with verified receipt and provenance", t => {
  const options = fixture(t);
  const originals = new Map([
    ["data/production-market-observations.jsonl", Buffer.from('{"integrityHash":"wrong"}\r\nnot json\r\n\x00last')],
    ["data/market-context-observations.jsonl", Buffer.from("context\r\n")],
    ["data/prospective-edge-cohorts.jsonl", Buffer.from("{broken\n")],
    ["data/scan-history.json", Buffer.from('{"unchanged": true}\n')],
    ["data/native-discovery/raw-events.json", Buffer.from("[bad-original]\r\n")],
    ["data/source-router-memory.json", Buffer.alloc(150_000, 65)],
  ]);
  for (const [relative, bytes] of originals) source(options.root, relative, bytes);
  source(options.root, "data/evidence.sqlite", "do not copy live SQLite");
  source(options.root, "data/evidence.sqlite-wal", "do not copy live WAL");
  source(options.root, "data/scanner-memory.json.sqlite", "a wildcard match must not copy SQLite");
  source(options.root, "data/not-selected.txt", "not selected");
  const reads = sourceReadFault(t, options.root);
  const result = preserve({ ...options, sourceCommit: "abc123", workflowRun: "123", workflowAttempt: "2", workflowJob: "build",
    expectedCacheKey: "scanner-learning-v2-Linux-main-123", matchedRestoreCacheKey: "scanner-learning-v2-Linux-main-122", restoreOutcome: "success" });
  assert.equal(result.status, "SUCCESS"); assert.equal(result.fileCount, originals.size);
  assert.ok(reads.maxReadSize <= 64 * 1024);
  const manifest = JSON.parse(fs.readFileSync(result.manifestFile));
  const receipt = JSON.parse(fs.readFileSync(result.receiptFile));
  assert.equal(manifest.provenance.matchedRestoreCacheKey, "scanner-learning-v2-Linux-main-122");
  assert.equal(manifest.provenance.canonicalPackOutcome, "failure");
  assert.equal(manifest.provenance.canonicalCacheSaveOutcome, "skipped");
  assert.equal(manifest.claims.restartable, false); assert.equal(manifest.claims.scoring, false);
  assert.equal(manifest.claims.permanentBackup, false); assert.equal(manifest.claims.remoteAcknowledged, false);
  assert.match(manifest.excludedState[0].reason, /CONSISTENT_BACKUP/);
  assert.deepEqual(manifest.excludedState[0].filesSeen,
    ["data/evidence.sqlite", "data/evidence.sqlite-wal", "data/scanner-memory.json.sqlite"]);
  const members = execFileSync("tar", ["-tzf", result.archiveFile], { encoding: "utf8" }).trim().split("\n").sort();
  assert.deepEqual(members, [...originals.keys(), "manifest.json"].sort());
  for (const entry of manifest.files) {
    const original = originals.get(entry.path);
    assert.deepEqual(fs.readFileSync(path.join(options.root, entry.path)), original);
    assert.deepEqual(execFileSync("tar", ["-xOzf", result.archiveFile, entry.path]), original);
    assert.equal(entry.sha256, hash(original)); assert.equal(entry.bytes, original.length);
  }
  assert.equal(manifest.files.find(entry => entry.path === "data/production-market-observations.jsonl").lineCount, 3);
  assert.equal(receipt.archive.sha256, hash(fs.readFileSync(result.archiveFile)));
  assert.equal(receipt.manifest.sha256, hash(fs.readFileSync(result.manifestFile)));
  assert.equal(receipt.rawFilesReadbackVerified, true);
});

test("missing/empty state is explicit, not proof of a usable backup", t => {
  const options = fixture(t), result = preserve(options);
  const manifest = JSON.parse(fs.readFileSync(result.manifestFile));
  assert.equal(manifest.files.length, 0); assert.equal(manifest.rawBytes, 0);
  assert.equal(manifest.statePresence, "NO_SELECTED_RAW_FILES_PRESENT");
  assert.deepEqual(manifest.selection.missingPatterns, FAILED_SCANNER_STATE_PATTERNS);
  assert.equal(manifest.claims.restartable, false);
  const other = fixture(t); source(other.root, "data/empty-history.jsonl", Buffer.alloc(0));
  const empty = preserve(other), emptyManifest = JSON.parse(fs.readFileSync(empty.manifestFile));
  assert.equal(emptyManifest.files[0].bytes, 0); assert.equal(emptyManifest.files[0].lineCount, 0);
});

test("preflight sums every selected lstat before opening any source payload and retains failure output", t => {
  const options = fixture(t);
  source(options.root, "data/a.jsonl", "1234"); source(options.root, "data/z.jsonl", "5678");
  const reads = sourceReadFault(t, options.root);
  assert.throws(() => preserve({ ...options, maxBytes: 7 }), /RAW_SIZE_CAP_EXCEEDED/);
  assert.equal(reads.opens, 0); assert.equal(reads.reads, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(options.outputDir, "preservation-failure.json"))).status, "FAILED");
  assert.equal(fs.existsSync(path.join(options.outputDir, "preservation-receipt.json")), false);
  assert.throws(() => preserve({ ...fixture(t), maxBytes: FAILED_SCANNER_STATE_MAX_BYTES + 1 }), /INVALID_RAW_SIZE_CAP/);
});

test("a source growth during streaming fails the cap, retains partial copy, and cannot produce a success receipt", t => {
  const options = fixture(t), file = source(options.root, "data/a.jsonl", "1234");
  let mutated = false;
  sourceReadFault(t, options.root, ({ count }) => {
    if (count && !mutated) { mutated = true; fs.appendFileSync(file, "5678"); }
  });
  assert.throws(() => preserve({ ...options, maxBytes: 4 }), /RAW_SIZE_CAP_EXCEEDED/);
  assert.equal(fs.existsSync(path.join(options.outputDir, "data/a.jsonl")), true);
  assert.equal(fs.existsSync(path.join(options.outputDir, "preservation-failure.json")), true);
  assert.equal(fs.existsSync(path.join(options.outputDir, "preservation-receipt.json")), false);
  assert.equal(fs.readFileSync(file, "utf8"), "12345678");
});

test("same-size source mutation is rejected even if copy fits the byte cap", t => {
  const options = fixture(t), file = source(options.root, "data/a.jsonl", "1234");
  let mutated = false;
  sourceReadFault(t, options.root, ({ count }) => {
    if (count && !mutated) { mutated = true; fs.writeFileSync(file, "5678"); }
  });
  assert.throws(() => preserve(options), /SOURCE_MUTATED/);
  assert.equal(fs.existsSync(path.join(options.outputDir, "preservation-failure.json")), true);
});

test("source mutation after tar creation is detected by final source revalidation", t => {
  const options = fixture(t), file = source(options.root, "data/a.jsonl", "1234");
  const open = fs.openSync;
  let mutated = false;
  fs.openSync = function(target, flags, ...args) {
    if (!mutated && target === path.join(options.outputDir, "failed-scanner-state.tar.gz") && !(flags & fs.constants.O_WRONLY)) {
      mutated = true; fs.writeFileSync(file, "5678");
    }
    return open.call(fs, target, flags, ...args);
  };
  t.after(() => { fs.openSync = open; });
  assert.throws(() => preserve(options), /SOURCE_MUTATED/);
  assert.equal(mutated, true);
  assert.equal(fs.existsSync(path.join(options.outputDir, "failed-scanner-state.tar.gz")), true);
  assert.equal(fs.existsSync(path.join(options.outputDir, "preservation-failure.json")), true);
  assert.equal(fs.existsSync(path.join(options.outputDir, "preservation-receipt.json")), false);
});

test("fstat identity mismatch is rejected before reading a substituted source descriptor", t => {
  const options = fixture(t), file = source(options.root, "data/a.jsonl", "1234");
  const substitute = path.join(options.directory, "substitute"); fs.writeFileSync(substitute, "1234");
  const open = fs.openSync, read = fs.readSync;
  let substitutedFd = null, substitutedReads = 0;
  fs.openSync = function(target, ...args) {
    const fd = open.call(fs, target === file ? substitute : target, ...args);
    if (target === file) substitutedFd = fd;
    return fd;
  };
  fs.readSync = function(fd, ...args) {
    if (fd === substitutedFd) substitutedReads++;
    return read.call(fs, fd, ...args);
  };
  t.after(() => { fs.openSync = open; fs.readSync = read; });
  assert.throws(() => preserve(options), /SOURCE_MUTATED/);
  assert.equal(substitutedReads, 0);
});

test("symlinked data ancestor, nested ancestor, final file and nonregular member are rejected before reads", t => {
  for (const kind of ["data", "nested", "file", "directory"]) {
    const options = fixture(t), outside = path.join(options.directory, "outside"); fs.mkdirSync(outside);
    if (kind === "data") {
      fs.rmdirSync(path.join(options.root, "data")); fs.symlinkSync(outside, path.join(options.root, "data"));
    } else if (kind === "nested") {
      fs.symlinkSync(outside, path.join(options.root, "data/native-discovery"));
    } else if (kind === "file") {
      source(options.root, "data/real.txt", "original"); fs.symlinkSync("real.txt", path.join(options.root, "data/a.jsonl"));
    } else fs.mkdirSync(path.join(options.root, "data/a.jsonl"));
    assert.throws(() => preserve(options), /UNSAFE_SOURCE/);
    assert.equal(fs.existsSync(path.join(options.outputDir, "preservation-failure.json")), true);
  }
});

test("exclusive output is never overwritten or removed on failure", t => {
  const options = fixture(t); fs.mkdirSync(options.outputDir); fs.writeFileSync(path.join(options.outputDir, "keep.txt"), "keep");
  assert.throws(() => preserve(options), /EEXIST/);
  assert.equal(fs.readFileSync(path.join(options.outputDir, "keep.txt"), "utf8"), "keep");
  assert.equal(fs.existsSync(path.join(options.outputDir, "preservation-failure.json")), false);
});

test("all eight pack workflows preserve only failed persistence and upload exactly three diagnostic transport files", () => {
  const discovered = fs.readdirSync(".github/workflows").filter(file => file.endsWith(".yml") && fs.readFileSync(`.github/workflows/${file}`, "utf8").includes("npm run state:pack"));
  assert.deepEqual(discovered.sort(), WORKFLOWS.map(file => `${file}.yml`).sort());
  for (const file of WORKFLOWS) {
    const workflow = fs.readFileSync(`.github/workflows/${file}.yml`, "utf8");
    const steps = workflow.split(/\n(?=      - name:)/);
    const pack = steps.find(step => step.includes("npm run state:pack"));
    const save = steps.find(step => step.includes("name: Save Canonical Scanner State Bundle"));
    const capture = steps.find(step => step.includes("name: Preserve Failed Scanner State Diagnostic"));
    const upload = steps.find(step => step.includes("name: Upload Temporary Failed Scanner State Diagnostic"));
    assert.match(pack, /id: state_pack/); assert.match(save, /id: state_cache_save/);
    assert.ok(workflow.indexOf(capture) > workflow.indexOf(save));
    assert.match(capture, /if: \$\{\{ always\(\) && \(steps\.state_pack\.outcome != 'success' \|\| steps\.state_cache_save\.outcome != 'success'\) \}\}/);
    assert.match(capture, /run: node src\/ops\/preserveFailedScannerState\.js/);
    assert.match(capture, /SCANNER_STATE_MATCHED_RESTORE_CACHE_KEY: \$\{\{ steps\.learning_cache_restore\.outputs\.cache-matched-key \}\}/);
    assert.doesNotMatch(capture, /secrets\.|SUPABASE|npm |\brm /);
    assert.match(upload, /id: failed_state_upload/);
    assert.match(upload, /if: \$\{\{ always\(\) && steps\.failed_state_preserve\.outcome == 'success' \}\}/);
    assert.match(upload, /uses: actions\/upload-artifact@v7/); assert.match(upload, /retention-days: 1\n/);
    const paths = upload.split("path: |\n")[1].split("          if-no-files-found:")[0].trim().split("\n").map(line => line.trim());
    assert.equal(paths.length, 3); assert.ok(paths[0].endsWith("/failed-scanner-state.tar.gz"));
    assert.ok(paths[1].endsWith("/manifest.json")); assert.ok(paths[2].endsWith("/preservation-receipt.json"));
    assert.doesNotMatch(paths.join("\n"), /\/data\/|\*|failure\.json/);
  }
});

test("every persistence guard rejects lost diagnostics without allowing temporary transport to excuse failed packing", () => {
  const cases = [
    { name: "normal canonical success", pack: "success", save: "success", preserve: "skipped", upload: "skipped", status: 0 },
    { name: "failed cache and failed upload", pack: "success", save: "failure", preserve: "success", upload: "failure", status: 1 },
    { name: "failed preservation and skipped upload", pack: "success", save: "failure", preserve: "failure", upload: "skipped", status: 1 },
    { name: "skipped transport after preservation", pack: "success", save: "failure", preserve: "success", upload: "skipped", status: 1 },
    { name: "failed cache with uploaded temporary bytes", pack: "success", save: "failure", preserve: "success", upload: "success", status: 0, warning: true },
    { name: "failed pack despite uploaded temporary bytes", pack: "failure", save: "skipped", preserve: "success", upload: "success", status: 1, warning: true },
    { name: "all skipped", pack: "skipped", save: "skipped", preserve: "skipped", upload: "skipped", status: 1 },
    { name: "cancelled diagnostics", pack: "success", save: "cancelled", preserve: "cancelled", upload: "cancelled", status: 1 },
  ];
  for (const file of WORKFLOWS) {
    const steps = workflowSteps(file, file === "outcome-probe" ? "probe" : null);
    const upload = steps.find(step => step.includes("name: Upload Temporary Failed Scanner State Diagnostic"));
    const guard = steps.find(step => step.includes("name: Enforce Scanner State Persistence"));
    assert.ok(steps.indexOf(guard) > steps.indexOf(upload), `${file} must evaluate the actual upload outcome`);
    assert.match(guard, /id: state_persistence/);
    assert.match(guard, /if: always\(\)/);
    for (const [name, id] of [["STATE_PACK", "state_pack"], ["STATE_CACHE_SAVE", "state_cache_save"],
      ["FAILED_STATE_PRESERVE", "failed_state_preserve"], ["FAILED_STATE_UPLOAD", "failed_state_upload"]]) {
      assert.ok(guard.includes(name + ": ${{ steps." + id + ".outcome }}"));
    }
    if (file === "pages-dashboard") assert.match(guard, /continue-on-error: true/);
    else assert.doesNotMatch(guard, /continue-on-error:/, `${file} must keep an unsuccessful persistence guard authoritative`);
    for (const report of steps.filter(step => step.includes("uses: actions/upload-artifact@") && step !== upload)) {
      assert.match(report, /if: always\(\)/, `${file} report uploads must remain reachable after a guard failure`);
    }
    for (const sample of cases) {
      const result = runShell(guard, { STATE_PACK: sample.pack, STATE_CACHE_SAVE: sample.save,
        FAILED_STATE_PRESERVE: sample.preserve, FAILED_STATE_UPLOAD: sample.upload });
      assert.equal(result.status, sample.status, `${file}: ${sample.name}: ${result.stderr}`);
      if (sample.warning) assert.match(result.stdout, /temporary 1-day diagnostic, not a permanent backup or verified restart/);
      if (sample.pack !== "success") assert.match(result.stdout, /temporary diagnostic cannot replace canonical restart state/);
    }
  }
});

test("probe report persistence stays strict without including the success-only cache export job", () => {
  const steps = workflowSteps("outcome-probe", "probe");
  const diagnostic = steps.find(step => step.includes("name: Upload Temporary Failed Scanner State Diagnostic"));
  const guard = steps.find(step => step.includes("name: Enforce Scanner State Persistence"));
  const reports = steps.filter(step => step.includes("uses: actions/upload-artifact@") && step !== diagnostic);
  assert.equal(reports.length, 1, "only the normal probe report belongs to this job");
  assert.match(reports[0], /name: Upload Probe Report/);
  assert.match(reports[0], /if: always\(\)/, "probe reports must remain reachable after persistence failure");
  assert.match(guard, /id: state_persistence/);
  assert.match(guard, /if: always\(\)/);
  assert.doesNotMatch(guard, /continue-on-error:/);
  assert.ok(steps.indexOf(guard) > steps.indexOf(diagnostic));
  assert.ok(steps.indexOf(reports[0]) > steps.indexOf(guard));
  assert.doesNotMatch(steps.join("\n"), /export-forward-cache:|Upload Forward Evidence Cache Export/);

  const exporter = workflowSteps("outcome-probe", "export-forward-cache");
  const uploads = exporter.filter(step => step.includes("uses: actions/upload-artifact@"));
  assert.equal(uploads.length, 1);
  assert.match(uploads[0], /name: Upload Forward Evidence Cache Export/);
  assert.match(uploads[0], /if: \$\{\{ success\(\) && steps\.export_cache\.outcome == 'success' \}\}/);
  assert.doesNotMatch(uploads[0], /always\(\)/, "failed or partial exports must not be uploaded");
});

test("dashboard persistence failure reaches post-deployment final health instead of terminating the build early", () => {
  const workflow = fs.readFileSync(".github/workflows/pages-dashboard.yml", "utf8");
  const steps = workflowSteps("pages-dashboard");
  const guard = steps.find(step => step.includes("name: Enforce Scanner State Persistence"));
  const health = steps.find(step => step.includes("name: Enforce truthful final health"));
  assert.match(guard, /continue-on-error: true/);
  assert.match(workflow, /state_persistence: \$\{\{ steps\.state_persistence\.outcome \}\}/);
  assert.match(health, /STATE_PERSISTENCE: \$\{\{ needs\.build\.outputs\.state_persistence \}\}/);
  assert.match(health, /for check in [^\n]*\bSTATE_PERSISTENCE\b/);
  assert.match(health, /for check in [^\n]*\bSTATE_PACK\b/);
  const healthy = Object.fromEntries([...health.matchAll(/^          ([A-Z_]+):/gm)].map(match => [match[1], "success"]));
  for (const [upload, expected] of [["failure", 1], ["success", 0]]) {
    const diagnostic = runShell(guard, { STATE_PACK: "success", STATE_CACHE_SAVE: "failure",
      FAILED_STATE_PRESERVE: "success", FAILED_STATE_UPLOAD: upload });
    const result = runShell(health, { ...healthy, STATE_PERSISTENCE: diagnostic.status === 0 ? "success" : "failure" });
    assert.equal(result.status, expected);
    if (expected) assert.match(result.stdout, /STATE_PERSISTENCE finished with failure/);
  }
  assert.equal(runShell(health, healthy).status, 0);
  assert.equal(runShell(health, { ...healthy, STATE_PACK: "failure" }).status, 1);
});

test("diagnostic helper has no HTTP/provider calls or deletion and does not alter raw-cache export isolation", () => {
  const helper = fs.readFileSync("src/ops/preserveFailedScannerState.js", "utf8");
  assert.doesNotMatch(helper, /\bfetch\s*\(|https?:|axios|SUPABASE|fs\.(?:rm|unlink|rename|truncate)Sync/);
  const outcomeWorkflow = fs.readFileSync(".github/workflows/outcome-probe.yml", "utf8");
  const exportJob = outcomeWorkflow.indexOf("\n  export-forward-cache:");
  if (exportJob >= 0) {
    const isolated = outcomeWorkflow.slice(exportJob);
    assert.doesNotMatch(isolated, /preserveFailedScannerState|state_cache_save|state_pack|npm run/);
    assert.match(isolated, /github\.event_name == 'workflow_dispatch'.*inputs\.export_forward_cache/);
  }
});
