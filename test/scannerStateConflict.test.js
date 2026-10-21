import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

import { packScannerState, restoreScannerState, SCANNER_STATE_PATTERNS } from "../src/ops/scannerStateBundle.js";

const MAGIC = Buffer.from("CLI_SCANNER_STATE_V2\0");
const UNIVERSE = "data/edge-candidate-universe.json";
const HISTORY = "data/scan-history.jsonl";
const ORIGINAL = '{"scannedAt":"2026-10-20T00:00:00Z","value":1}\n';
const NEWER = '{"scannedAt":"2026-10-20T01:00:00Z","value":2}\n';

function fixture(t, extraFiles = []) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-state-conflict-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const source = path.join(base, "source");
  const root = path.join(base, "target");
  const files = new Map([[UNIVERSE, Buffer.from('{"exactCandidates":1}\n')], [HISTORY, Buffer.from(ORIGINAL)], ...extraFiles]);
  const write = (directory, name, bytes) => {
    const file = path.join(directory, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    return file;
  };
  for (const [name, bytes] of files) write(source, name, bytes);
  const packed = packScannerState({ root: source, writeReport: false, requireExactUniverse: true });
  assert.equal(packed.format, "V2_STREAMED");
  const bundle = write(root, ".state/scanner-learning-bundle.json.gz", fs.readFileSync(path.join(source, ".state/scanner-learning-bundle.json.gz")));
  return { base, source, root, bundle, files, write, restore: () => restoreScannerState({ root, writeReport: false }) };
}

function assertSourceUnchanged(f) {
  for (const [name, bytes] of f.files) assert.deepEqual(fs.readFileSync(path.join(f.source, name)), bytes);
}

function editBundle(f, edit) {
  const raw = zlib.gunzipSync(fs.readFileSync(f.bundle));
  assert.deepEqual(raw.subarray(0, MAGIC.length), MAGIC);
  const length = raw.readUInt32BE(MAGIC.length);
  const manifest = JSON.parse(raw.subarray(MAGIC.length + 4, MAGIC.length + 4 + length));
  const payload = raw.subarray(MAGIC.length + 4 + length);
  const next = edit({ manifest, payload });
  const manifestBytes = next.manifestBytes ?? Buffer.from(JSON.stringify(manifest));
  const header = Buffer.alloc(MAGIC.length + 4);
  MAGIC.copy(header);
  header.writeUInt32BE(manifestBytes.length, MAGIC.length);
  fs.writeFileSync(f.bundle, zlib.gzipSync(Buffer.concat([header, manifestBytes, next.payload ?? payload])));
}

test("V2 restoration preserves newer local history instead of shrinking 94 bytes to 47", t => {
  const f = fixture(t);
  const history = f.write(f.root, HISTORY, ORIGINAL + NEWER);
  assert.equal(fs.statSync(history).size, 94);
  assert.throws(f.restore, /SCANNER_STATE_LOCAL_CONFLICT:data\/scan-history\.jsonl/);
  assert.equal(fs.statSync(history).size, 94);
  assert.equal(fs.readFileSync(history, "utf8"), ORIGINAL + NEWER);
  assertSourceUnchanged(f);
});

test("a later V2 destination conflict prevents publication of every earlier missing file", t => {
  const f = fixture(t, [["data/aaa-memory.json", Buffer.from('{"original":true}\n')]]);
  const history = f.write(f.root, HISTORY, ORIGINAL + NEWER);
  assert.throws(f.restore, /SCANNER_STATE_LOCAL_CONFLICT/);
  assert.equal(fs.existsSync(path.join(f.root, "data/aaa-memory.json")), false);
  assert.equal(fs.existsSync(path.join(f.root, UNIVERSE)), false);
  assert.equal(fs.readFileSync(history, "utf8"), ORIGINAL + NEWER);
  assertSourceUnchanged(f);
});

test("identical V2 destinations remain untouched, including their modification times", t => {
  const f = fixture(t);
  const old = new Date("2020-01-01T00:00:00.000Z");
  for (const [name, bytes] of f.files) {
    const file = f.write(f.root, name, bytes);
    fs.utimesSync(file, old, old);
  }
  const restored = f.restore();
  assert.equal(restored.state, "SCANNER_STATE_RESTORED");
  assert.equal(restored.restored, 0);
  assert.equal(restored.alreadyPresent, f.files.size);
  for (const [name, bytes] of f.files) {
    const file = path.join(f.root, name);
    assert.deepEqual(fs.readFileSync(file), bytes);
    assert.equal(fs.statSync(file).mtime.toISOString(), old.toISOString());
  }
  assertSourceUnchanged(f);
});

test("V2 restoration publishes missing files and safely replays an interrupted partial restoration", t => {
  const f = fixture(t);
  f.write(f.root, UNIVERSE, f.files.get(UNIVERSE));
  const restored = f.restore();
  assert.equal(restored.restored, 1);
  assert.equal(restored.alreadyPresent, 1);
  assert.equal(restored.format, "V2_STREAMED");
  for (const [name, bytes] of f.files) assert.deepEqual(fs.readFileSync(path.join(f.root, name)), bytes);
  assert.equal(f.restore().alreadyPresent, 2);
  assertSourceUnchanged(f);
});

for (const dangling of [false, true]) {
  test(`V2 restore rejects a ${dangling ? "dangling " : ""}symlinked data ancestor before publishing`, t => {
    const f = fixture(t);
    const outside = path.join(f.base, "outside");
    if (!dangling) fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(f.root, "data"));
    assert.throws(f.restore, /symbolic link/);
    assert.equal(fs.existsSync(path.join(outside, UNIVERSE.slice("data/".length))), false);
    assert.equal(fs.existsSync(path.join(outside, HISTORY.slice("data/".length))), false);
    assertSourceUnchanged(f);
  });
}

test("V2 restore validates a nested symlink and nonregular destination before restoring earlier files", t => {
  const f = fixture(t, [["data/native-discovery/raw-events.json", Buffer.from('{"events":[]}\n')]]);
  const outside = path.join(f.base, "outside");
  fs.mkdirSync(outside);
  fs.mkdirSync(path.join(f.root, "data"));
  fs.symlinkSync(outside, path.join(f.root, "data/native-discovery"));
  assert.throws(f.restore, /symbolic link/);
  assert.equal(fs.existsSync(path.join(f.root, UNIVERSE)), false);
  assert.deepEqual(fs.readdirSync(outside), []);
  assertSourceUnchanged(f);

  const other = fixture(t);
  fs.mkdirSync(path.join(other.root, HISTORY), { recursive: true });
  assert.throws(other.restore, /SCANNER_STATE_LOCAL_CONFLICT/);
  assert.equal(fs.existsSync(path.join(other.root, UNIVERSE)), false);
  assert.equal(fs.statSync(path.join(other.root, HISTORY)).isDirectory(), true);
});

test("a symlinked state directory is rejected before opening decompression output", t => {
  const f = fixture(t);
  const root = path.join(f.base, "linked-target");
  fs.mkdirSync(root);
  fs.symlinkSync(path.join(f.source, ".state"), path.join(root, ".state"));
  const open = fs.openSync;
  let temporaryOpened = false;
  t.mock.method(fs, "openSync", function(file, flags, ...args) {
    if (String(file).endsWith(".decompressed.tmp") && flags === "w") temporaryOpened = true;
    return open.call(this, file, flags, ...args);
  });
  assert.throws(() => restoreScannerState({ root, writeReport: false }), /SCANNER_STATE_UNSAFE_STAGING_DIRECTORY/);
  assert.equal(temporaryOpened, false);
  assert.equal(fs.existsSync(path.join(root, "data")), false);
  assertSourceUnchanged(f);
});

test("a final history symlink cannot replace external bytes or restore an earlier file", t => {
  const f = fixture(t);
  const outside = f.write(f.base, "outside-history.jsonl", ORIGINAL + NEWER);
  fs.mkdirSync(path.join(f.root, "data"));
  fs.symlinkSync(outside, path.join(f.root, HISTORY));
  assert.throws(f.restore, /symbolic link/);
  assert.equal(fs.existsSync(path.join(f.root, UNIVERSE)), false);
  assert.equal(fs.readFileSync(outside, "utf8"), ORIGINAL + NEWER);
  assertSourceUnchanged(f);
});

for (const [name, edit] of [
  ["truncated payload", ({ payload }) => ({ payload: payload.subarray(0, payload.length - 1) })],
  ["incorrect later checksum", ({ manifest }) => { manifest.files.at(-1).sha256 = "0".repeat(64); return {}; }],
  ["invalid later byte count", ({ manifest }) => { manifest.files.at(-1).bytes = -1; return {}; }],
  ["unsafe later path", ({ manifest }) => { manifest.files.at(-1).path = "../outside.jsonl"; return {}; }],
  ["malformed manifest", () => ({ manifestBytes: Buffer.from("{malformed") })],
]) {
  test(`V2 ${name} cannot publish a valid earlier entry`, t => {
    const f = fixture(t);
    editBundle(f, edit);
    assert.throws(f.restore);
    assert.equal(fs.existsSync(path.join(f.root, "data")), false);
    assertSourceUnchanged(f);
  });
}

test("truncated compressed V2 bytes cannot publish any destination", t => {
  const f = fixture(t);
  const compressed = fs.readFileSync(f.bundle);
  fs.writeFileSync(f.bundle, compressed.subarray(0, compressed.length - 4));
  assert.throws(f.restore, /decompression failed/);
  assert.equal(fs.existsSync(path.join(f.root, "data")), false);
  assertSourceUnchanged(f);
});

test("a V2 publication race cannot replace newer evidence and retains verified recovery bytes", t => {
  const f = fixture(t);
  const history = path.join(f.root, HISTORY);
  const link = fs.linkSync;
  t.mock.method(fs, "linkSync", function(source, target) {
    if (target === history) fs.writeFileSync(history, ORIGINAL + NEWER);
    return link.call(this, source, target);
  });
  let failure;
  assert.throws(f.restore, error => { failure = error; return /SCANNER_STATE_LOCAL_CONFLICT/.test(error.message); });
  assert.equal(fs.readFileSync(history, "utf8"), ORIGINAL + NEWER);
  assert.deepEqual(fs.readFileSync(path.join(failure.recoveryDirectory, HISTORY)), f.files.get(HISTORY));
  assertSourceUnchanged(f);
});

test("the three normalized-evidence sidecars roundtrip original malformed and CRLF bytes in default V2 state", t => {
  const names = ["alpha-contracts", "alpha-knowledge-graph", "capital-flow-observations"];
  const extra = names.map((name, index) => ["data/" + name + ".jsonl", Buffer.from('{"original":' + index + ',"sourceTimestamp":null}\r\n{malformed original\r\n')]);
  const f = fixture(t, extra);
  for (const [name] of extra) assert.ok(SCANNER_STATE_PATTERNS.includes(name));
  const restored = f.restore();
  assert.equal(restored.restored, f.files.size);
  for (const [name, bytes] of f.files) assert.deepEqual(fs.readFileSync(path.join(f.root, name)), bytes);
  assertSourceUnchanged(f);
});
