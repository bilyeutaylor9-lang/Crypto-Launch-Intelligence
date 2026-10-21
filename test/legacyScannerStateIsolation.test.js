import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { packScannerState, restoreScannerState, inspectScannerStateFiles } from "../src/ops/scannerStateBundle.js";
import { prepareLegacyScannerStateIsolation as prepare, commitLegacyScannerStateIsolation as commit,
  LEGACY_SCANNER_CACHE_PATTERNS, LEGACY_STATE_MAX_BYTES } from "../src/ops/isolateLegacyScannerState.js";

const UNIVERSE = "data/edge-candidate-universe.json", EPISODES = "data/edge-production-episodes.jsonl";
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const COMMON = { workflowKind: "ALPHA_OS", runnerOs: "Linux", refName: "main", legacyCacheKey: "alpha-os-Linux-main-10",
  canonicalCacheKey: "scanner-learning-v2-Linux-main-11", legacyRestoreOutcome: "success", canonicalRestoreOutcome: "success",
  sourceCommit: "abc123", workflowRun: "12", workflowAttempt: "1" };

function write(root, relative, bytes) {
  const file = path.join(root, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); return file;
}

function fixture(t) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "legacy-state-isolation-")));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const source = path.join(base, "canonical"), root = path.join(base, "workspace"), outputDir = path.join(base, "transport");
  const canonical = new Map([[UNIVERSE, Buffer.from('{"exactCandidates":["canonical"]}\n')],
    [EPISODES, Buffer.from('{"canonical":true}\n')], ["data/ignition-twin-observations.jsonl", Buffer.from("identical\r\n")]]);
  for (const [name, bytes] of canonical) write(source, name, bytes);
  packScannerState({ root: source, writeReport: false, requireExactUniverse: true });
  const bundle = write(root, ".state/scanner-learning-bundle.json.gz", fs.readFileSync(path.join(source, ".state/scanner-learning-bundle.json.gz")));
  const legacy = new Map([[UNIVERSE, Buffer.from('{"legacy":true}\r\n{malformed original\r\n')],
    [EPISODES, Buffer.from('{"integrityHash":"wrong"}\r\n\x00not json')],
    ["data/ignition-twin-observations.jsonl", canonical.get("data/ignition-twin-observations.jsonl")],
    ["data/alpha-os-predictions.jsonl", Buffer.from("nonoverlap original\r\n")]]);
  for (const [name, bytes] of legacy) write(root, name, bytes);
  const options = { ...COMMON, root, outputDir };
  return { base, source, root, outputDir, bundle, canonical, legacy, options,
    prepare: extra => prepare({ ...options, ...extra }),
    commit: (plan, extra) => commit({ ...options, expectedPlanHash: plan.planHash, archiveUploadOutcome: "success", ...extra }) };
}

test("prepare preserves exact malformed legacy bytes; upload-gated commit quarantines originals before strict actual restore", t => {
  const f = fixture(t), identical = path.join(f.root, "data/ignition-twin-observations.jsonl");
  fs.utimesSync(identical, new Date("2020-01-01"), new Date("2020-01-01"));
  const plan = f.prepare(); assert.equal(plan.status, "PREPARED_NOT_DISPLACED"); assert.equal(plan.fileCount, 2);
  for (const [name, bytes] of f.legacy) assert.deepEqual(fs.readFileSync(path.join(f.root, name)), bytes);
  assert.throws(() => restoreScannerState({ root: f.root, writeReport: false }), /LOCAL_CONFLICT/);
  const manifest = JSON.parse(fs.readFileSync(path.join(f.outputDir, "manifest.json")));
  const receipt = JSON.parse(fs.readFileSync(path.join(f.outputDir, "preservation-receipt.json")));
  const archive = path.join(f.outputDir, "legacy-scanner-state.tar.gz");
  assert.equal(hash(fs.readFileSync(archive)), receipt.archive.sha256);
  assert.equal(hash(fs.readFileSync(path.join(f.outputDir, "manifest.json"))), plan.manifestHash);
  assert.equal(hash(fs.readFileSync(path.join(f.outputDir, "preservation-receipt.json"))), plan.planHash);
  assert.equal(manifest.claims.permanentBackup, false); assert.equal(manifest.claims.scoring, false);
  for (const entry of manifest.files) assert.deepEqual(execFileSync("tar", ["-xOzf", archive, entry.path]), f.legacy.get(entry.path));
  assert.throws(() => f.commit(plan, { archiveUploadOutcome: "failure" }), /UPLOAD_SUCCESS_REQUIRED/);
  assert.equal(fs.existsSync(path.join(f.root, UNIVERSE)), true);
  const committed = f.commit(plan); assert.equal(committed.status, "ISOLATED_NOT_RESTORED");
  for (const entry of manifest.files) {
    assert.equal(fs.existsSync(path.join(f.root, entry.path)), false);
    assert.deepEqual(fs.readFileSync(path.join(committed.quarantineDirectory, entry.path)), f.legacy.get(entry.path));
  }
  assert.equal(fs.readFileSync(path.join(f.root, "data/alpha-os-predictions.jsonl"), "utf8"), "nonoverlap original\r\n");
  const restored = restoreScannerState({ root: f.root, writeReport: false }); assert.equal(restored.restored, 2);
  for (const [name, bytes] of f.canonical) assert.deepEqual(fs.readFileSync(path.join(f.root, name)), bytes);
  assert.equal(fs.statSync(identical).mtime.toISOString(), "2020-01-01T00:00:00.000Z");
});

test("no-conflict and no-canonical paths require no transport or displacement; normal strict restore remains usable", t => {
  const f = fixture(t);
  for (const [name, bytes] of f.canonical) write(f.root, name, bytes);
  assert.equal(f.prepare().needsCommit, false); assert.equal(fs.existsSync(f.outputDir), false);
  assert.equal(restoreScannerState({ root: f.root, writeReport: false }).alreadyPresent, 3);
  const empty = path.join(f.base, "empty"); fs.mkdirSync(empty);
  assert.equal(prepare({ ...f.options, root: empty }).status, "NO_CANONICAL_BUNDLE");
});

test("partial rename failure retains raw bytes and only the exact original plan can resume", t => {
  const f = fixture(t), plan = f.prepare(), rename = fs.renameSync;
  let moves = 0;
  t.mock.method(fs, "renameSync", function(from, to) {
    if (++moves === 2) throw Object.assign(new Error("simulated crash"), { code: "EIO" });
    return rename.call(fs, from, to);
  });
  let crash;
  assert.throws(() => f.commit(plan), error => { crash = error; return error.code === "EIO"; });
  t.mock.restoreAll();
  assert.equal(fs.existsSync(path.join(crash.quarantineDirectory, "plan.json")), true);
  assert.equal(fs.existsSync(path.join(crash.quarantineDirectory, "intent-0.json")), true);
  assert.equal(fs.existsSync(path.join(crash.quarantineDirectory, UNIVERSE)), true);
  assert.deepEqual(fs.readFileSync(path.join(crash.quarantineDirectory, UNIVERSE)), f.legacy.get(UNIVERSE));
  assert.throws(() => f.commit(plan, { expectedPlanHash: "0".repeat(64) }), /PLAN_MISMATCH/);
  assert.throws(() => f.commit(plan, { legacyCacheKey: "alpha-os-Linux-main-different" }), /PLAN_MISMATCH/);
  assert.equal(f.commit(plan).status, "ISOLATED_NOT_RESTORED");
  assert.equal(restoreScannerState({ root: f.root, writeReport: false }).restored, 2);
});

test("interruption immediately after atomic rename resumes from physical quarantined bytes", t => {
  const f = fixture(t), plan = f.prepare(), rename = fs.renameSync;
  let moved = false;
  t.mock.method(fs, "renameSync", function(from, to) {
    const result = rename.call(fs, from, to);
    if (!moved) { moved = true; throw Object.assign(new Error("post-rename crash"), { code: "EIO" }); }
    return result;
  });
  assert.throws(() => f.commit(plan), /post-rename crash/); t.mock.restoreAll();
  assert.equal(f.commit(plan).fileCount, 2);
});

for (const journalName of ["plan.json", "intent-0.json", "intent-1.json"]) {
  for (const mode of ["short-write", "EIO"]) {
    test(`${journalName} ${mode} leaves no partial final journal and exact-plan retry succeeds`, t => {
      const f = fixture(t), plan = f.prepare(), open = fs.openSync, writeSync = fs.writeSync, close = fs.closeSync;
      let targetFd = null, attempted = false, partialFile = null, wrotePrefix = false;
      t.mock.method(fs, "openSync", function(file, flags, ...args) {
        const fd = open.call(fs, file, flags, ...args), basename = path.basename(String(file));
        if (!attempted && (flags & fs.constants.O_WRONLY) && (basename === journalName || basename.startsWith(`${journalName}.`))) {
          attempted = true; targetFd = fd; partialFile = String(file);
        }
        return fd;
      });
      t.mock.method(fs, "writeSync", function(fd, bytes, offset, length, ...args) {
        if (fd === targetFd) {
          if (!wrotePrefix) { wrotePrefix = true; return writeSync.call(fs, fd, bytes, offset, Math.min(length, 5), ...args); }
          if (mode === "short-write") return 0;
          throw Object.assign(new Error("journal EIO"), { code: "EIO" });
        }
        return writeSync.call(fs, fd, bytes, offset, length, ...args);
      });
      t.mock.method(fs, "closeSync", function(fd) { if (fd === targetFd) targetFd = null; return close.call(fs, fd); });
      assert.throws(() => f.commit(plan), /SHORT_WRITE|journal EIO/); t.mock.restoreAll();
      assert.equal(attempted, true); assert.equal(fs.statSync(partialFile).size, 5);
      assert.notEqual(path.basename(partialFile), journalName);
      assert.equal(fs.existsSync(path.join(path.dirname(partialFile), journalName)), false);
      const savedPartial = fs.readFileSync(partialFile);
      assert.equal(f.commit(plan).fileCount, 2);
      assert.deepEqual(fs.readFileSync(partialFile), savedPartial);
      assert.equal(restoreScannerState({ root: f.root, writeReport: false }).restored, 2);
    });
  }
}

test("an empty interrupted quarantine resumes only with exact active originals and no unexpected content", t => {
  const f = fixture(t), plan = f.prepare(), manifest = JSON.parse(fs.readFileSync(path.join(f.outputDir, "manifest.json")));
  const quarantine = path.join(f.root, ".state", manifest.quarantineName);
  fs.mkdirSync(quarantine, { mode: 0o700 });
  assert.throws(() => f.commit(plan, { expectedPlanHash: "0".repeat(64) }), /PLAN_MISMATCH/);
  const original = fs.readFileSync(path.join(f.root, UNIVERSE));
  write(f.root, UNIVERSE, "unexpected changed active bytes");
  assert.throws(() => f.commit(plan), /SOURCE_CHANGED/);
  assert.equal(fs.existsSync(path.join(quarantine, "plan.json")), false);
  // A replacement original still has a different ctime/identity: use a fresh
  // prepared plan fixture rather than weakening the original stat binding.
  const other = fixture(t), otherPlan = other.prepare(), otherManifest = JSON.parse(fs.readFileSync(path.join(other.outputDir, "manifest.json")));
  const otherQuarantine = path.join(other.root, ".state", otherManifest.quarantineName);
  fs.mkdirSync(otherQuarantine, { mode: 0o700 }); write(otherQuarantine, "unexpected.bin", original);
  assert.throws(() => other.commit(otherPlan), /UNBOUND_QUARANTINE/);
  assert.deepEqual(fs.readFileSync(path.join(otherQuarantine, "unexpected.bin")), original);
  const empty = fixture(t), emptyPlan = empty.prepare(), emptyManifest = JSON.parse(fs.readFileSync(path.join(empty.outputDir, "manifest.json")));
  fs.mkdirSync(path.join(empty.root, ".state", emptyManifest.quarantineName), { mode: 0o700 });
  assert.equal(empty.commit(emptyPlan).fileCount, 2);
});

test("an unbound quarantine never discards or accepts unrelated partial-plan bytes", t => {
  const f = fixture(t), plan = f.prepare(), manifest = JSON.parse(fs.readFileSync(path.join(f.outputDir, "manifest.json")));
  const quarantine = path.join(f.root, ".state", manifest.quarantineName);
  fs.mkdirSync(quarantine, { mode: 0o700 });
  const partial = write(quarantine, `plan.json.${crypto.randomUUID()}.tmp`, "unrelated interrupted bytes");
  assert.throws(() => f.commit(plan), /UNBOUND_QUARANTINE/);
  assert.equal(fs.readFileSync(partial, "utf8"), "unrelated interrupted bytes");
  assert.equal(fs.existsSync(path.join(quarantine, "plan.json")), false);
  for (const [name, bytes] of f.legacy) assert.deepEqual(fs.readFileSync(path.join(f.root, name)), bytes);
});

for (const kind of ["empty", "partial-plan"]) {
  test(`${kind} quarantine retry fsyncs its .state parent before the first original rename`, t => {
    const f = fixture(t), plan = f.prepare(), manifest = JSON.parse(fs.readFileSync(path.join(f.outputDir, "manifest.json")));
    const stateDirectory = path.join(f.root, ".state"), quarantine = path.join(stateDirectory, manifest.quarantineName);
    fs.mkdirSync(quarantine, { mode: 0o700 });
    if (kind === "partial-plan") write(quarantine, `plan.json.${crypto.randomUUID()}.tmp`, "{\n");
    const open = fs.openSync, close = fs.closeSync, fsync = fs.fsyncSync, rename = fs.renameSync;
    const parentDescriptors = new Set();
    let parentSynced = false, firstRenameAfterParentSync = null;
    t.mock.method(fs, "openSync", function(file, ...args) {
      const fd = open.call(fs, file, ...args); if (file === stateDirectory) parentDescriptors.add(fd); return fd;
    });
    t.mock.method(fs, "closeSync", function(fd) { parentDescriptors.delete(fd); return close.call(fs, fd); });
    t.mock.method(fs, "fsyncSync", function(fd) {
      const result = fsync.call(fs, fd); if (parentDescriptors.has(fd)) parentSynced = true; return result;
    });
    t.mock.method(fs, "renameSync", function(from, to) {
      if (firstRenameAfterParentSync === null) firstRenameAfterParentSync = parentSynced;
      return rename.call(fs, from, to);
    });
    assert.equal(f.commit(plan).fileCount, 2);
    assert.equal(firstRenameAfterParentSync, true);
  });
}

test("EXDEV fails without copy/unlink fallback or losing the active originals", t => {
  const f = fixture(t), plan = f.prepare();
  t.mock.method(fs, "renameSync", () => { throw Object.assign(new Error("cross device"), { code: "EXDEV" }); });
  assert.throws(() => f.commit(plan), error => error.code === "EXDEV");
  for (const [name, bytes] of f.legacy) assert.deepEqual(fs.readFileSync(path.join(f.root, name)), bytes);
});

test("changed canonical body, source bytes or prepared snapshot fail closed before moves", t => {
  for (const kind of ["canonical", "source", "snapshot", "manifest", "receipt", "archive"]) {
    const f = fixture(t), plan = f.prepare();
    if (kind === "canonical") fs.appendFileSync(f.bundle, "changed");
    if (kind === "source") write(f.root, UNIVERSE, "changed original");
    if (kind === "snapshot") { fs.chmodSync(path.join(f.outputDir, UNIVERSE), 0o600); write(f.outputDir, UNIVERSE, "changed snapshot"); }
    if (kind === "manifest") { fs.chmodSync(path.join(f.outputDir, "manifest.json"), 0o600); fs.appendFileSync(path.join(f.outputDir, "manifest.json"), " "); }
    if (kind === "receipt") { fs.chmodSync(path.join(f.outputDir, "preservation-receipt.json"), 0o600); fs.appendFileSync(path.join(f.outputDir, "preservation-receipt.json"), " "); }
    if (kind === "archive") { fs.chmodSync(path.join(f.outputDir, "legacy-scanner-state.tar.gz"), 0o600); fs.appendFileSync(path.join(f.outputDir, "legacy-scanner-state.tar.gz"), " "); }
    assert.throws(() => f.commit(plan));
    assert.equal(fs.existsSync(path.join(f.root, UNIVERSE)), true);
    assert.equal(fs.readdirSync(path.join(f.root, ".state")).some(name => name.startsWith("legacy-cache-quarantine-")), false);
  }
});

test("all canonical contents validate before preparation; V3 references explicitly fail without opening a database or moving bytes", t => {
  for (const kind of ["corrupt", "v3"]) {
    const f = fixture(t);
    if (kind === "corrupt") fs.writeFileSync(f.bundle, Buffer.from("not gzip"));
    else {
      const raw = zlib.gunzipSync(fs.readFileSync(f.bundle));
      Buffer.from("CLI_SCANNER_STATE_V3\0").copy(raw);
      const magicLength = Buffer.byteLength("CLI_SCANNER_STATE_V3\0"), length = raw.readUInt32BE(magicLength);
      const manifest = JSON.parse(raw.subarray(magicLength + 4, magicLength + 4 + length));
      manifest.schemaVersion = 3;
      const bytes = Buffer.from(JSON.stringify(manifest)), header = Buffer.alloc(magicLength + 4);
      Buffer.from("CLI_SCANNER_STATE_V3\0").copy(header); header.writeUInt32BE(bytes.length, magicLength);
      fs.writeFileSync(f.bundle, zlib.gzipSync(Buffer.concat([header, bytes, raw.subarray(magicLength + 4 + length)])));
    }
    assert.throws(f.prepare, kind === "v3" ? /READONLY_ARCHIVE_INSPECTION_UNSUPPORTED/ : /decompression/);
    assert.equal(fs.existsSync(f.outputDir), false);
    for (const [name, bytes] of f.legacy) assert.deepEqual(fs.readFileSync(path.join(f.root, name)), bytes);
  }
});

test("V1 inspection and isolation preserve the original legacy bytes before actual V1 restore", t => {
  const f = fixture(t), bytes = f.canonical.get(UNIVERSE);
  fs.writeFileSync(f.bundle, zlib.gzipSync(Buffer.from(JSON.stringify({ schemaVersion: 1, fileCount: 1,
    files: [{ path: UNIVERSE, bytes: bytes.length, sha256: hash(bytes), contentBase64: bytes.toString("base64") }] }))));
  assert.equal(inspectScannerStateFiles({ root: f.root }).format, "V1_JSON");
  const plan = f.prepare(); f.commit(plan);
  assert.equal(restoreScannerState({ root: f.root, writeReport: false }).format, "V1_JSON");
  assert.deepEqual(fs.readFileSync(path.join(f.root, UNIVERSE)), bytes);
});

test("size cap precedes any legacy source payload read and cannot be raised", t => {
  const f = fixture(t), open = fs.openSync;
  let sourceOpened = false;
  t.mock.method(fs, "openSync", function(file, ...args) {
    if ([UNIVERSE, EPISODES].some(name => file === path.join(f.root, name))) sourceOpened = true;
    return open.call(fs, file, ...args);
  });
  assert.throws(() => f.prepare({ maxBytes: 1 }), /SIZE_CAP_EXCEEDED/);
  assert.equal(sourceOpened, false); assert.equal(fs.existsSync(f.outputDir), false);
  assert.throws(() => f.prepare({ maxBytes: LEGACY_STATE_MAX_BYTES + 1 }), /INVALID_SIZE_CAP/);
});

test("growth during 64 KiB snapshot streaming retains partial failure output and never emits a commit receipt", t => {
  const f = fixture(t), target = path.join(f.root, UNIVERSE), open = fs.openSync, read = fs.readSync, close = fs.closeSync;
  let opens = 0, descriptor = null, mutated = false, largestRead = 0;
  t.mock.method(fs, "openSync", function(file, ...args) {
    const fd = open.call(fs, file, ...args);
    if (file === target && ++opens === 2) descriptor = fd;
    return fd;
  });
  t.mock.method(fs, "closeSync", function(fd) { if (fd === descriptor) descriptor = null; return close.call(fs, fd); });
  t.mock.method(fs, "readSync", function(fd, ...args) {
    const count = read.call(fs, fd, ...args);
    if (fd === descriptor) {
      largestRead = Math.max(largestRead, args[2]);
      if (count && !mutated) { mutated = true; fs.appendFileSync(target, "x".repeat(1024)); }
    }
    return count;
  });
  assert.throws(() => f.prepare({ maxBytes: 200 }), /SIZE_CAP_EXCEEDED/);
  assert.equal(mutated, true); assert.ok(largestRead <= 64 * 1024);
  assert.equal(fs.existsSync(path.join(f.outputDir, UNIVERSE)), true);
  assert.equal(fs.existsSync(path.join(f.outputDir, "preservation-receipt.json")), false);
  assert.ok(fs.readdirSync(f.outputDir).some(name => name.startsWith("failure-")));
  assert.equal(fs.existsSync(target), true);
});

test("symlinked data/state ancestors and symlinked conflict files cannot be displaced", t => {
  for (const kind of ["data", "state", "file"]) {
    const f = fixture(t), outside = path.join(f.base, "outside"); fs.mkdirSync(outside);
    if (kind === "file") { fs.unlinkSync(path.join(f.root, UNIVERSE)); fs.symlinkSync(path.join(f.source, UNIVERSE), path.join(f.root, UNIVERSE)); }
    else {
      const name = kind === "data" ? "data" : ".state";
      fs.renameSync(path.join(f.root, name), path.join(outside, name)); fs.symlinkSync(path.join(outside, name), path.join(f.root, name));
    }
    assert.throws(f.prepare, /symbolic link|UNSAFE/);
    assert.equal(fs.existsSync(f.outputDir), false);
  }
});

test("output and quarantine must be exclusive; unrecognized matched cache identities cannot authorize moves", t => {
  const f = fixture(t); fs.mkdirSync(f.outputDir); write(f.outputDir, "keep.txt", "keep");
  assert.throws(f.prepare, /EEXIST/); assert.equal(fs.readFileSync(path.join(f.outputDir, "keep.txt"), "utf8"), "keep");
  const other = fixture(t);
  assert.throws(() => other.prepare({ legacyCacheKey: "alpha-os-Linux-other-10" }), /CACHE_KEY_MISMATCH/);
  assert.throws(() => other.prepare({ legacyRestoreOutcome: "failure" }), /RESTORE_NOT_SUCCESSFUL/);
  const plan = other.prepare(), manifest = JSON.parse(fs.readFileSync(path.join(other.outputDir, "manifest.json")));
  const quarantine = path.join(other.root, ".state", manifest.quarantineName);
  fs.mkdirSync(quarantine); write(quarantine, "unexpected-original.txt", "preserve unexpected original");
  assert.throws(() => other.commit(plan), /UNBOUND_QUARANTINE/);
  assert.equal(fs.readFileSync(path.join(quarantine, "unexpected-original.txt"), "utf8"), "preserve unexpected original");
  assert.equal(fs.existsSync(path.join(other.root, UNIVERSE)), true);
});

test("three workflows preserve original cache paths and isolate only after upload success, before strict restoration", () => {
  for (const [name, kind] of [["autonomous-alpha-os", "ALPHA_OS"], ["future-intelligence-stack", "FUTURE_INTELLIGENCE"], ["market-discovery-os", "MARKET_DISCOVERY"]]) {
    const workflow = fs.readFileSync(`.github/workflows/${name}.yml`, "utf8"), steps = workflow.split(/\n(?=      - name:)/);
    const legacy = steps.find(step => step.includes("id: legacy_cache_restore"));
    const originals = legacy.split("path: |\n")[1].split("          key:")[0].trim().split("\n").map(value => value.trim());
    assert.deepEqual(originals, LEGACY_SCANNER_CACHE_PATTERNS[kind]);
    const preparation = steps.find(step => step.includes("id: legacy_state_prepare"));
    const upload = steps.find(step => step.includes("id: legacy_state_upload"));
    const committing = steps.find(step => step.includes("id: legacy_state_commit"));
    const restoring = steps.find(step => step.includes("name: Restore Validated Scanner State"));
    assert.ok(workflow.indexOf(preparation) < workflow.indexOf(upload));
    assert.ok(workflow.indexOf(upload) < workflow.indexOf(committing)); assert.ok(workflow.indexOf(committing) < workflow.indexOf(restoring));
    assert.match(upload, /needs_commit == 'true'/); assert.match(upload, /actions\/upload-artifact@v7/); assert.match(upload, /retention-days: 1\n/);
    assert.match(committing, /steps\.legacy_state_upload\.outcome == 'success'/);
    assert.match(committing, /LEGACY_STATE_PLAN_HASH: \$\{\{ steps\.legacy_state_prepare\.outputs\.plan_hash \}\}/);
    assert.match(restoring, /needs_commit == 'false' \|\| steps\.legacy_state_commit\.outcome == 'success'/);
    assert.match(restoring, /run: npm run state:restore/);
    assert.doesNotMatch(preparation + upload + committing, /continue-on-error:|secrets\.|SUPABASE|\brm /);
    const paths = upload.split("path: |\n")[1].split("          if-no-files-found:")[0].trim().split("\n");
    assert.equal(paths.length, 3); assert.doesNotMatch(paths.join("\n"), /\/data\/|\*/);
  }
});
