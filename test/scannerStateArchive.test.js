import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { packScannerState, restoreScannerState, inspectScannerState } from "../src/ops/scannerStateBundle.js";
import { openDurableEvidenceArchive } from "../src/archive/durableEvidenceArchive.js";

const MAGIC = Buffer.from("CLI_SCANNER_STATE_V3\0");

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-archive-"));
  const root = path.join(base, "source");
  const archiveRoot = path.join(base, "archive");
  fs.mkdirSync(path.join(root, "data"), { recursive: true });
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const files = new Map();
  const write = (name, value) => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
    files.set(name, bytes); return file;
  };
  write("data/edge-candidate-universe.json", '{"sourceObservedAt":null,"exactCandidates":[{"chain":"solana","tokenAddress":"CaseSensitive"}]}\n');
  write("data/scan-history.jsonl", '{"observedAt":null,"confidence":0}\n{malformed original line\n');
  return { base, root, archiveRoot, files, write };
}

function decoded(root) {
  const file = path.join(root, ".state/scanner-learning-bundle.json.gz");
  const raw = zlib.gunzipSync(fs.readFileSync(file));
  assert.deepEqual(raw.subarray(0, MAGIC.length), MAGIC);
  const count = raw.readUInt32BE(MAGIC.length);
  return { file, raw, manifest: JSON.parse(raw.subarray(MAGIC.length + 4, MAGIC.length + 4 + count)), payload: raw.subarray(MAGIC.length + 4 + count) };
}

function editBundle(root, edit) {
  const bundle = decoded(root); edit(bundle.manifest);
  const bytes = Buffer.from(JSON.stringify(bundle.manifest));
  const header = Buffer.alloc(MAGIC.length + 4); MAGIC.copy(header); header.writeUInt32BE(bytes.length, MAGIC.length);
  fs.writeFileSync(bundle.file, zlib.gzipSync(Buffer.concat([header, bytes, bundle.payload])));
}

test("archive restart keeps exact universe hot and preserves raw malformed history separately", t => {
  const f = fixture(t);
  const packed = packScannerState({ root: f.root, archiveRoot: f.archiveRoot, writeReport: false });
  assert.equal(packed.format, "V3_ARCHIVE_REFERENCES");
  assert.equal(packed.archiveReferenceCount, 1);
  assert.equal(packed.exactUniverseIncluded, true);
  const bundle = decoded(f.root);
  assert.equal(bundle.manifest.files.length, 1);
  assert.equal(bundle.manifest.files[0].path, "data/edge-candidate-universe.json");
  assert.equal(bundle.manifest.archiveReferences[0].path, "data/scan-history.jsonl");
  for (const [name, bytes] of f.files) assert.deepEqual(fs.readFileSync(path.join(f.root, name)), bytes);
  fs.rmSync(path.join(f.root, "data"), { recursive: true });
  const restored = restoreScannerState({ root: f.root, archiveRoot: f.archiveRoot, writeReport: false });
  assert.equal(restored.restored, 2);
  assert.equal(restored.archiveReferencesRestored, 1);
  for (const [name, bytes] of f.files) assert.deepEqual(fs.readFileSync(path.join(f.root, name)), bytes);
  assert.equal(inspectScannerState({ root: f.root, archiveRoot: f.archiveRoot }).valid, true);
});

test("all present forward ledgers are retained even outside legacy bundle patterns", t => {
  const f = fixture(t);
  for (const name of ["production-market-observations", "market-context-observations", "prospective-edge-cohorts", "production-shadow-predictions"]) {
    f.write("data/" + name + ".jsonl", '{"original":"frozen","unknown":null}\n');
  }
  const packed = packScannerState({ root: f.root, archiveRoot: f.archiveRoot, writeReport: false });
  assert.equal(packed.archiveReferenceCount, 5);
  fs.rmSync(path.join(f.root, "data"), { recursive: true });
  restoreScannerState({ root: f.root, archiveRoot: f.archiveRoot, writeReport: false });
  for (const [name, bytes] of f.files) assert.deepEqual(fs.readFileSync(path.join(f.root, name)), bytes);
});

test("archive mode requires the latest exact universe and never archives it away", t => {
  const f = fixture(t); fs.unlinkSync(path.join(f.root, "data/edge-candidate-universe.json"));
  assert.throws(() => packScannerState({ root: f.root, archiveRoot: f.archiveRoot, writeReport: false }), /exact universe/i);
});

test("large archived history does not consume the bounded restart payload allowance", t => {
  const f = fixture(t); const bytes = Buffer.alloc(1024 * 1024, 65);
  f.write("data/scan-history.jsonl", bytes);
  const packed = packScannerState({ root: f.root, archiveRoot: f.archiveRoot, maxRestartBytes: 8192, writeReport: false });
  assert.ok(packed.uncompressedBytes <= 8192);
  assert.equal(packed.archivedEvidenceBytes, bytes.length);
  fs.rmSync(path.join(f.root, "data"), { recursive: true });
  restoreScannerState({ root: f.root, archiveRoot: f.archiveRoot, writeReport: false });
  assert.deepEqual(fs.readFileSync(path.join(f.root, "data/scan-history.jsonl")), bytes);
});

test("oversized hot state fails without replacing an already verified bundle", t => {
  const f = fixture(t);
  packScannerState({ root: f.root, archiveRoot: f.archiveRoot, writeReport: false });
  const file = path.join(f.root, ".state/scanner-learning-bundle.json.gz");
  const previous = fs.readFileSync(file);
  f.write("data/security-evidence-cache.json", Buffer.alloc(20000, 66));
  assert.throws(() => packScannerState({ root: f.root, archiveRoot: f.archiveRoot, maxRestartBytes: 8192, writeReport: false }), /limit|target/i);
  assert.deepEqual(fs.readFileSync(file), previous);
});

test("archive references cannot fall back to an empty or missing archive", t => {
  const f = fixture(t);
  packScannerState({ root: f.root, archiveRoot: f.archiveRoot, writeReport: false });
  fs.rmSync(path.join(f.root, "data"), { recursive: true });
  assert.throws(() => restoreScannerState({ root: f.root, writeReport: false }), /ARCHIVE_REQUIRED/);
  const missing = path.join(f.base, "missing-archive");
  assert.throws(() => restoreScannerState({ root: f.root, archiveRoot: missing, writeReport: false }), /ARCHIVE_MISSING/);
  assert.equal(fs.existsSync(missing), false);
  assert.equal(fs.existsSync(path.join(f.root, "data")), false);
});

for (const corruption of ["missing", "corrupt"]) {
  test("a " + corruption + " permanent segment blocks restore before any hot file publication", t => {
    const f = fixture(t);
    packScannerState({ root: f.root, archiveRoot: f.archiveRoot, writeReport: false });
    const ref = decoded(f.root).manifest.archiveReferences[0];
    const segment = path.join(f.archiveRoot, "segments", ref.sha256 + ".gz");
    if (corruption === "missing") fs.unlinkSync(segment); else fs.writeFileSync(segment, "broken raw segment");
    fs.rmSync(path.join(f.root, "data"), { recursive: true });
    assert.throws(() => restoreScannerState({ root: f.root, archiveRoot: f.archiveRoot, writeReport: false }), /SEGMENT_MISSING|SEGMENT_CORRUPT/);
    assert.equal(fs.existsSync(path.join(f.root, "data/edge-candidate-universe.json")), false);
    assert.throws(() => inspectScannerState({ root: f.root, archiveRoot: f.archiveRoot }), /SEGMENT_MISSING|SEGMENT_CORRUPT/);
  });
}

test("newer or different local history is not overwritten by an old restart bundle", t => {
  const f = fixture(t);
  packScannerState({ root: f.root, archiveRoot: f.archiveRoot, writeReport: false });
  const history = path.join(f.root, "data/scan-history.jsonl");
  fs.appendFileSync(history, '{"newer":"must survive"}\n');
  const newer = fs.readFileSync(history);
  const universe = fs.readFileSync(path.join(f.root, "data/edge-candidate-universe.json"));
  assert.throws(() => restoreScannerState({ root: f.root, archiveRoot: f.archiveRoot, writeReport: false }), /LOCAL_CONFLICT/);
  assert.deepEqual(fs.readFileSync(history), newer);
  assert.deepEqual(fs.readFileSync(path.join(f.root, "data/edge-candidate-universe.json")), universe);
});

test("idempotent archive restoration preserves file mtimes and UNKNOWN evidence", t => {
  const f = fixture(t);
  packScannerState({ root: f.root, archiveRoot: f.archiveRoot, writeReport: false });
  const old = new Date("2020-01-01T00:00:00.000Z");
  for (const name of f.files.keys()) fs.utimesSync(path.join(f.root, name), old, old);
  const restored = restoreScannerState({ root: f.root, archiveRoot: f.archiveRoot, writeReport: false });
  assert.equal(restored.alreadyPresent, 2);
  for (const [name, bytes] of f.files) {
    assert.deepEqual(fs.readFileSync(path.join(f.root, name)), bytes);
    assert.equal(fs.statSync(path.join(f.root, name)).mtime.toISOString(), old.toISOString());
  }
});

for (const edit of [
  manifest => { manifest.archiveReferences[0].path = "../outside.jsonl"; },
  manifest => { manifest.archiveReferences.push(manifest.archiveReferences[0]); },
  manifest => { manifest.archiveReferences[0].path = "data/edge-candidate-universe.json"; },
  manifest => { manifest.archiveReferences[0].admissionHash = "0".repeat(64); },
]) {
  test("invalid, duplicated or falsely bound references cannot become valid restart state", t => {
    const f = fixture(t);
    packScannerState({ root: f.root, archiveRoot: f.archiveRoot, writeReport: false });
    editBundle(f.root, edit);
    fs.rmSync(path.join(f.root, "data"), { recursive: true });
    assert.throws(() => restoreScannerState({ root: f.root, archiveRoot: f.archiveRoot, writeReport: false }));
    assert.equal(fs.existsSync(path.join(f.root, "data")), false);
  });
}

test("packing detects a source file changing after hashing and publishes no false receipt", t => {
  const f = fixture(t);
  const file = path.join(f.root, "data/edge-candidate-universe.json");
  const open = fs.openSync; let changed = false; let reads = 0;
  t.mock.method(fs, "openSync", function(name, flags, ...args) {
    if (name === file && flags === "r" && ++reads === 2 && !changed) {
      changed = true; fs.appendFileSync(file, "changed after hashing");
    }
    return open.call(this, name, flags, ...args);
  });
  assert.throws(() => packScannerState({ root: f.root, writeReport: false }), /changed|integrity|length/i);
  assert.equal(fs.existsSync(path.join(f.root, ".state/scanner-learning-bundle.json.gz")), false);
});

test("new archive directories are private and report paths belong to the requested root", t => {
  const f = fixture(t);
  const caller = path.join(f.base, "caller"); fs.mkdirSync(caller);
  const module = new URL("../src/ops/scannerStateBundle.js", import.meta.url).href;
  const code = "const {packScannerState}=await import(" + JSON.stringify(module) + ");packScannerState(" + JSON.stringify({ root: f.root, archiveRoot: f.archiveRoot }) + ");";
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: caller, encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(fs.statSync(f.archiveRoot).mode & 0o077, 0);
  const report = JSON.parse(fs.readFileSync(path.join(f.root, "reports/scanner-state-bundle.json")));
  assert.equal(report.format, "V3_ARCHIVE_REFERENCES");
});

test("a changed history snapshot receives a new immutable reference without losing the old bytes", t => {
  const f = fixture(t);
  packScannerState({ root: f.root, archiveRoot: f.archiveRoot, writeReport: false });
  const before = decoded(f.root).manifest.archiveReferences[0];
  const oldBytes = f.files.get("data/scan-history.jsonl");
  fs.appendFileSync(path.join(f.root, "data/scan-history.jsonl"), '{"new observation":true}\n');
  packScannerState({ root: f.root, archiveRoot: f.archiveRoot, writeReport: false });
  const after = decoded(f.root).manifest.archiveReferences[0];
  assert.notEqual(before.recordId, after.recordId);
  const store = openDurableEvidenceArchive({ root: f.archiveRoot });
  try {
    assert.deepEqual(store.readEvidence(before.recordId).rawBytes, oldBytes);
    assert.deepEqual(store.readEvidence(after.recordId).rawBytes, fs.readFileSync(path.join(f.root, "data/scan-history.jsonl")));
    assert.equal(store.audit().ok, true);
  } finally { store.close(); }
});

test("a publication race cannot replace new local observations and retains staged recovery bytes", t => {
  const f = fixture(t);
  packScannerState({ root: f.root, archiveRoot: f.archiveRoot, writeReport: false });
  fs.rmSync(path.join(f.root, "data"), { recursive: true });
  const history = path.join(f.root, "data/scan-history.jsonl");
  const link = fs.linkSync; let raced = false;
  t.mock.method(fs, "linkSync", function(source, target) {
    if (target === history && !raced) { raced = true; fs.writeFileSync(history, "new concurrent evidence"); }
    return link.call(this, source, target);
  });
  let failure;
  assert.throws(() => restoreScannerState({ root: f.root, archiveRoot: f.archiveRoot, writeReport: false }), error => {
    failure = error; return /LOCAL_CONFLICT/.test(error.message);
  });
  assert.equal(fs.readFileSync(history, "utf8"), "new concurrent evidence");
  assert.deepEqual(fs.readFileSync(path.join(failure.recoveryDirectory, "data/scan-history.jsonl")), f.files.get("data/scan-history.jsonl"));
});

test("CLI archive mode works through the normal state commands and is never implicit", t => {
  const f = fixture(t);
  const script = new URL("../src/ops/scannerStateBundle.js", import.meta.url).pathname;
  const env = { ...process.env, SCANNER_STATE_ARCHIVE_ROOT: f.archiveRoot };
  const packed = spawnSync(process.execPath, [script, "pack", "--require-exact-universe"], { cwd: f.root, env, encoding: "utf8" });
  assert.equal(packed.status, 0, packed.stderr);
  assert.equal(JSON.parse(packed.stdout).format, "V3_ARCHIVE_REFERENCES");
  fs.rmSync(path.join(f.root, "data"), { recursive: true });
  const absent = { ...process.env }; delete absent.SCANNER_STATE_ARCHIVE_ROOT;
  const invalid = spawnSync(process.execPath, [script, "restore"], { cwd: f.root, env: absent, encoding: "utf8" });
  assert.equal(invalid.status, 2); assert.match(invalid.stderr, /ARCHIVE_REQUIRED/);
  const restored = spawnSync(process.execPath, [script, "restore"], { cwd: f.root, env, encoding: "utf8" });
  assert.equal(restored.status, 0, restored.stderr);
  for (const [name, bytes] of f.files) assert.deepEqual(fs.readFileSync(path.join(f.root, name)), bytes);
});
