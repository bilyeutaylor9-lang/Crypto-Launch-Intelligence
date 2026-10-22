import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { exportForwardEvidenceCache, FORWARD_EVIDENCE_FILES, validateForwardCacheSelection } from "../src/ops/exportForwardEvidenceCache.js";

const KEY = "forward-evidence-Linux-main-39344534021";
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const relativeExporter = "src/ops/exportForwardEvidenceCache.js";
const exporterFile = fileURLToPath(new URL("../" + relativeExporter, import.meta.url));
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "forward-cache-export-")));
  fs.mkdirSync(path.join(root, "data"));
  const bytes = new Map([
    [FORWARD_EVIDENCE_FILES[0], Buffer.from('{"badHash":"original"}\r\n{malformed\r\nlast')],
    [FORWARD_EVIDENCE_FILES[1], Buffer.from([0xff, 0xfe, 0x0d, 0x0a])],
    [FORWARD_EVIDENCE_FILES[2], Buffer.from('{"unchanged":true}\r\n')],
  ]);
  for (const [relative, raw] of bytes) fs.writeFileSync(path.join(root, relative), raw);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, bytes, outputDir: path.join(root, "export"), cacheMatchedKey: KEY, cacheHit: "false" };
}

function assertFailed(outputDir, reason) {
  const marker = readJson(path.join(outputDir, "export-failure.json"));
  assert.equal(marker.status, "FAILED");
  assert.equal(marker.success, false);
  assert.match(marker.reason, reason);
  assert.equal(fs.existsSync(path.join(outputDir, "export-receipt.json")), false);
}

function countSourceReads(t, fixture) {
  const inodes = new Set(FORWARD_EVIDENCE_FILES.filter(relative => fs.existsSync(path.join(fixture.root, relative)))
    .map(relative => fs.statSync(path.join(fixture.root, relative)).ino));
  const original = fs.readSync;
  let reads = 0;
  t.mock.method(fs, "readSync", (fd, ...args) => {
    if (inodes.has(fs.fstatSync(fd).ino)) reads++;
    return original(fd, ...args);
  });
  return () => reads;
}

test("cache selection accepts exact hits and main-prefix partial hits without identity fallback", () => {
  assert.deepEqual(validateForwardCacheSelection({ sourceCacheKey: KEY, cacheMatchedKey: KEY, cacheHit: "true" }), {
    mode: "EXACT_KEY", expectedKey: KEY, expectedPrefix: null, matchedKey: KEY, cacheHit: true,
  });
  assert.deepEqual(validateForwardCacheSelection({ cacheMatchedKey: KEY, cacheHit: "false" }), {
    mode: "MAIN_PREFIX", expectedKey: null, expectedPrefix: "forward-evidence-Linux-main-", matchedKey: KEY, cacheHit: false,
  });
  assert.throws(() => validateForwardCacheSelection({ sourceCacheKey: KEY, cacheMatchedKey: KEY, cacheHit: "false" }), /EXACT_MATCH_REQUIRED/);
  assert.throws(() => validateForwardCacheSelection({ sourceCacheKey: KEY, cacheMatchedKey: KEY + "-other", cacheHit: "true" }), /EXACT_MATCH_REQUIRED/);
  assert.throws(() => validateForwardCacheSelection({ cacheMatchedKey: "forward-evidence-Linux-feature-123", cacheHit: "false" }), /MAIN_PREFIX_REQUIRED/);
  assert.throws(() => validateForwardCacheSelection({ cacheMatchedKey: "forward-evidence-macOS-main-123", cacheHit: "false" }), /MAIN_PREFIX_REQUIRED/);
  assert.throws(() => validateForwardCacheSelection({ cacheMatchedKey: "", cacheHit: "false" }), /MATCHED_KEY_REQUIRED/);
});

test("system tar round trip preserves malformed/CRLF bytes and hashes with a verified export receipt", t => {
  const fixtureData = fixture(t);
  const result = exportForwardEvidenceCache({ ...fixtureData, sourceCommit: "a".repeat(40), workflowRun: "15" });
  assert.equal(result.status, "SUCCESS");
  const listed = execFileSync("tar", ["-tzf", result.archiveFile], { encoding: "utf8" }).trimEnd().split("\n");
  assert.deepEqual(listed, [...FORWARD_EVIDENCE_FILES, "manifest.json"]);
  const manifest = readJson(result.manifestFile), receipt = readJson(result.receiptFile);
  assert.deepEqual(manifest.provenance.cacheSelection, validateForwardCacheSelection(fixtureData));
  assert.equal(manifest.provenance.exporterCodeCommit, "a".repeat(40));
  assert.equal(manifest.provenance.exporterWorkflowRun, "15");
  assert.equal(manifest.provenance.originalProducerCommitInferred, false);
  assert.deepEqual(manifest.missingFiles, []);
  for (const entry of manifest.files) {
    const original = fixtureData.bytes.get(entry.path);
    const extracted = execFileSync("tar", ["-xOf", result.archiveFile, entry.path]);
    assert.deepEqual(extracted, original);
    assert.deepEqual(fs.readFileSync(path.join(fixtureData.root, entry.path)), original);
    assert.deepEqual(fs.readFileSync(path.join(result.outputDir, entry.path)), original);
    assert.equal(entry.sha256, sha256(original));
    assert.equal(entry.bytes, original.length);
  }
  assert.equal(manifest.files[0].lineCount, 3);
  assert.equal(manifest.files[1].lineCount, 1);
  assert.equal(manifest.files[2].lineCount, 1);
  assert.equal(manifest.rawBytes, [...fixtureData.bytes.values()].reduce((sum, raw) => sum + raw.length, 0));
  assert.equal(receipt.status, "SUCCESS");
  assert.equal(receipt.archive.sha256, sha256(fs.readFileSync(result.archiveFile)));
  assert.equal(receipt.archive.bytes, fs.statSync(result.archiveFile).size);
  assert.equal(receipt.manifest.sha256, sha256(fs.readFileSync(result.manifestFile)));
  assert.equal(receipt.rawFilesReadbackVerified, true);
  assert.equal(receipt.permanentBackup, false);
  assert.equal(receipt.remoteAcknowledged, false);
  assert.deepEqual(execFileSync("tar", ["-xOf", result.archiveFile, "manifest.json"]), fs.readFileSync(result.manifestFile));
});

test("CLI accepts a main partial-hit output and an explicitly selected exact-hit output", t => {
  const fixtureData = fixture(t);
  for (const [mode, expectedKey, cacheHit] of [["prefix", "", "false"], ["exact", KEY, "true"]]) {
    const outputDir = path.join(fixtureData.root, mode);
    const run = spawnSync(process.execPath, [exporterFile], {
      cwd: fixtureData.root, encoding: "utf8",
      env: { PATH: process.env.PATH, FORWARD_CACHE_EXPORT_DIR: outputDir, FORWARD_CACHE_SOURCE_KEY: expectedKey,
        FORWARD_CACHE_MATCHED_KEY: KEY, FORWARD_CACHE_HIT: cacheHit, GITHUB_SHA: "abc", GITHUB_RUN_ID: "123" },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(JSON.parse(run.stdout).status, "SUCCESS");
    assert.equal(readJson(path.join(outputDir, "manifest.json")).provenance.cacheSelection.cacheHit, cacheHit === "true");
    assert.doesNotMatch(run.stdout, /malformed|badHash/);
  }
});

test("missing optional context is recorded; required missing/empty files fail", t => {
  const fixtureData = fixture(t);
  fs.unlinkSync(path.join(fixtureData.root, FORWARD_EVIDENCE_FILES[1]));
  const result = exportForwardEvidenceCache(fixtureData);
  assert.deepEqual(readJson(result.manifestFile).missingFiles, [FORWARD_EVIDENCE_FILES[1]]);
  assert.deepEqual(execFileSync("tar", ["-tzf", result.archiveFile], { encoding: "utf8" }).trimEnd().split("\n"),
    [FORWARD_EVIDENCE_FILES[0], FORWARD_EVIDENCE_FILES[2], "manifest.json"]);
  fs.writeFileSync(path.join(fixtureData.root, FORWARD_EVIDENCE_FILES[0]), "");
  const emptyOutput = path.join(fixtureData.root, "empty");
  assert.throws(() => exportForwardEvidenceCache({ ...fixtureData, outputDir: emptyOutput }), /REQUIRED_SOURCE_EMPTY/);
  assertFailed(emptyOutput, /REQUIRED_SOURCE_EMPTY/);
  fs.unlinkSync(path.join(fixtureData.root, FORWARD_EVIDENCE_FILES[0]));
  assert.throws(() => exportForwardEvidenceCache({ ...fixtureData, outputDir: path.join(fixtureData.root, "missing") }), /REQUIRED_SOURCE_MISSING/);
});

test("all source sizes are checked before any source payload read or copy", t => {
  const fixtureData = fixture(t);
  // A sparse oversized last member must be rejected before reading the first.
  fs.truncateSync(path.join(fixtureData.root, FORWARD_EVIDENCE_FILES[2]), 1024 * 1024 * 1024 + 1);
  const reads = countSourceReads(t, fixtureData);
  assert.throws(() => exportForwardEvidenceCache(fixtureData), /SIZE_CAP_EXCEEDED/);
  assert.equal(reads(), 0);
  assert.equal(fs.existsSync(path.join(fixtureData.outputDir, "data")), false);
  assertFailed(fixtureData.outputDir, /SIZE_CAP_EXCEEDED/);
});

test("streaming uses at most 64 KiB buffers and enforces the cap if a source grows", t => {
  const fixtureData = fixture(t);
  const first = path.join(fixtureData.root, FORWARD_EVIDENCE_FILES[0]), inode = fs.statSync(first).ino;
  const maxBytes = [...fixtureData.bytes.values()].reduce((sum, raw) => sum + raw.length, 0);
  const original = fs.readSync;
  let grew = false;
  t.mock.method(fs, "readSync", (fd, buffer, ...args) => {
    assert.ok(buffer.length <= 64 * 1024);
    const count = original(fd, buffer, ...args);
    if (!grew && count && fs.fstatSync(fd).ino === inode) {
      grew = true;
      fs.appendFileSync(first, Buffer.alloc(64 * 1024, 65));
    }
    return count;
  });
  assert.throws(() => exportForwardEvidenceCache({ ...fixtureData, maxBytes }), /SIZE_CAP_EXCEEDED/);
  assert.equal(grew, true);
  assertFailed(fixtureData.outputDir, /SIZE_CAP_EXCEEDED/);
  assert.ok(fs.existsSync(path.join(fixtureData.outputDir, FORWARD_EVIDENCE_FILES[0])));
});

test("symlinked data ancestors are rejected before payload reads", t => {
  const fixtureData = fixture(t), original = path.join(fixtureData.root, "original-data");
  fs.renameSync(path.join(fixtureData.root, "data"), original);
  fs.symlinkSync(original, path.join(fixtureData.root, "data"), "dir");
  const reads = countSourceReads(t, fixtureData);
  assert.throws(() => exportForwardEvidenceCache(fixtureData), /UNSAFE_SOURCE_ANCESTOR/);
  assert.equal(reads(), 0);
  assertFailed(fixtureData.outputDir, /UNSAFE_SOURCE_ANCESTOR/);
  for (const [relative, bytes] of fixtureData.bytes) assert.deepEqual(fs.readFileSync(path.join(fixtureData.root, relative)), bytes);
});

test("source symlinks, dangling symlinks and nonregular members are rejected", t => {
  const fixtureData = fixture(t), file = path.join(fixtureData.root, FORWARD_EVIDENCE_FILES[0]);
  fs.unlinkSync(file);
  fs.symlinkSync(path.join(fixtureData.root, FORWARD_EVIDENCE_FILES[2]), file);
  assert.throws(() => exportForwardEvidenceCache(fixtureData), /UNSAFE_SOURCE/);
  fs.unlinkSync(file);
  fs.symlinkSync(path.join(fixtureData.root, "absent"), file);
  assert.throws(() => exportForwardEvidenceCache({ ...fixtureData, outputDir: path.join(fixtureData.root, "dangling") }), /UNSAFE_SOURCE/);
  fs.unlinkSync(file); fs.mkdirSync(file);
  assert.throws(() => exportForwardEvidenceCache({ ...fixtureData, outputDir: path.join(fixtureData.root, "directory") }), /UNSAFE_SOURCE/);
});

test("inode replacement between lstat and open is rejected before reading", t => {
  const fixtureData = fixture(t), file = path.join(fixtureData.root, FORWARD_EVIDENCE_FILES[0]);
  const originalOpen = fs.openSync;
  let replaced = false;
  const reads = countSourceReads(t, fixtureData);
  t.mock.method(fs, "openSync", (target, flags, ...args) => {
    if (!replaced && target === file && flags === (fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)) {
      replaced = true;
      fs.renameSync(file, file + ".original");
      fs.writeFileSync(file, fixtureData.bytes.get(FORWARD_EVIDENCE_FILES[0]));
    }
    return originalOpen(target, flags, ...args);
  });
  assert.throws(() => exportForwardEvidenceCache(fixtureData), /SOURCE_MUTATED/);
  assert.equal(replaced, true);
  assert.equal(reads(), 0);
  assertFailed(fixtureData.outputDir, /SOURCE_MUTATED/);
});

test("same-size source mutation retains partial output and fails closed", t => {
  const fixtureData = fixture(t), file = path.join(fixtureData.root, FORWARD_EVIDENCE_FILES[0]);
  const inode = fs.statSync(file).ino, originalRead = fs.readSync;
  let mutated = false;
  t.mock.method(fs, "readSync", (fd, ...args) => {
    const count = originalRead(fd, ...args);
    if (!mutated && count && fs.fstatSync(fd).ino === inode) {
      mutated = true;
      fs.writeFileSync(file, Buffer.alloc(fixtureData.bytes.get(FORWARD_EVIDENCE_FILES[0]).length, 65));
    }
    return count;
  });
  assert.throws(() => exportForwardEvidenceCache(fixtureData), /SOURCE_MUTATED/);
  assert.equal(mutated, true);
  assertFailed(fixtureData.outputDir, /SOURCE_MUTATED/);
  assert.deepEqual(fs.readFileSync(path.join(fixtureData.outputDir, FORWARD_EVIDENCE_FILES[0])), fixtureData.bytes.get(FORWARD_EVIDENCE_FILES[0]));
});

test("final source hash verification catches changes after copying", t => {
  const fixtureData = fixture(t), file = path.join(fixtureData.root, FORWARD_EVIDENCE_FILES[0]);
  const originalOpen = fs.openSync;
  let changed = false;
  t.mock.method(fs, "openSync", (target, ...args) => {
    if (!changed && target === path.join(fixtureData.outputDir, "forward-evidence-cache.tar.gz")) {
      changed = true;
      fs.appendFileSync(file, "late");
    }
    return originalOpen(target, ...args);
  });
  assert.throws(() => exportForwardEvidenceCache(fixtureData), /SOURCE_MUTATED/);
  assert.equal(changed, true);
  assertFailed(fixtureData.outputDir, /SOURCE_MUTATED/);
  assert.ok(fs.existsSync(path.join(fixtureData.outputDir, "forward-evidence-cache.tar.gz")));
});

test("existing output is never reused or removed and rejected keys cannot export", t => {
  const fixtureData = fixture(t);
  fs.mkdirSync(fixtureData.outputDir);
  fs.writeFileSync(path.join(fixtureData.outputDir, "sentinel"), "retained");
  assert.throws(() => exportForwardEvidenceCache(fixtureData), /EEXIST/);
  assert.equal(fs.readFileSync(path.join(fixtureData.outputDir, "sentinel"), "utf8"), "retained");
  const rejected = path.join(fixtureData.root, "rejected");
  assert.throws(() => exportForwardEvidenceCache({ ...fixtureData, outputDir: rejected, sourceCacheKey: KEY, cacheHit: "false" }), /EXACT_MATCH_REQUIRED/);
  assertFailed(rejected, /EXACT_MATCH_REQUIRED/);
  assert.equal(fs.existsSync(path.join(rejected, "forward-evidence-cache.tar.gz")), false);
});

test("tar failure retains original copies, manifest and partial archive with a failure marker", t => {
  const fixtureData = fixture(t), previousPath = process.env.PATH;
  // An empty search path simulates an unavailable system tar without invoking
  // any replacement executable or changing the source files.
  process.env.PATH = fixtureData.root;
  try { assert.throws(() => exportForwardEvidenceCache(fixtureData), /ENOENT/); }
  finally { process.env.PATH = previousPath; }
  assertFailed(fixtureData.outputDir, /ENOENT/);
  assert.ok(fs.existsSync(path.join(fixtureData.outputDir, "manifest.json")));
  assert.ok(fs.existsSync(path.join(fixtureData.outputDir, "forward-evidence-cache.tar.gz")));
  for (const [relative, bytes] of fixtureData.bytes) {
    assert.deepEqual(fs.readFileSync(path.join(fixtureData.root, relative)), bytes);
    assert.deepEqual(fs.readFileSync(path.join(fixtureData.outputDir, relative)), bytes);
  }
});

test("exporter imports only Node builtins and workflow uploads only successful transport files for one day", () => {
  const source = fs.readFileSync(exporterFile, "utf8");
  const imports = [...source.matchAll(/from "([^"]+)"/g)].map(match => match[1]);
  assert.ok(imports.length > 0);
  assert.ok(imports.every(specifier => specifier.startsWith("node:")));
  assert.doesNotMatch(source, /\bfetch\s*\(|https?:|rmSync|gunzip|tarEntry/);
  const workflow = fs.readFileSync(".github/workflows/outcome-probe.yml", "utf8");
  assert.match(workflow, /export_forward_cache:\n[\s\S]*default: false/);
  assert.match(workflow, /probe:\n    if: \$\{\{ github\.event_name != 'workflow_dispatch' \|\| inputs\.export_forward_cache != true \}\}/);
  const exportJob = workflow.match(/  export-forward-cache:[\s\S]*/)?.[0] || "";
  assert.match(exportJob, /if: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.export_forward_cache == true \}\}/);
  assert.doesNotMatch(exportJob, /cache\/save|npm ci|SUPABASE|secrets\.|outcomes:probe|scanner-learning|remote-operational/);
  assert.match(exportJob, /FORWARD_CACHE_SOURCE_KEY: \$\{\{ inputs\.exact_source_cache_key \}\}/);
  assert.match(exportJob, /FORWARD_CACHE_MATCHED_KEY: .*cache-matched-key/);
  assert.doesNotMatch(exportJob, /test "\$FORWARD_CACHE_HIT"/);
  const upload = exportJob.slice(exportJob.indexOf("      - name: Upload"));
  assert.match(upload, /if: \$\{\{ success\(\) && steps\.export_cache\.outcome == 'success' \}\}/);
  assert.match(upload, /retention-days: 1\b/);
  const uploaded = [...upload.matchAll(/^\s+\$\{\{ runner\.temp \}\}\/forward-evidence-cache-export\/(.+)$/gm)].map(match => match[1]);
  assert.deepEqual(uploaded, ["forward-evidence-cache.tar.gz", "manifest.json", "export-receipt.json"]);
});
