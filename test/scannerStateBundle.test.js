import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  __scannerStateBundleHooks,
  inspectScannerState,
  packScannerState,
  restoreScannerState,
} from "../src/ops/scannerStateBundle.js";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "scanner-state-test-"));
}

test("scanner state bundle restores exact bytes from one canonical cache artifact", () => {
  const root = tempRoot();
  try {
    fs.mkdirSync(path.join(root, "data", "native-discovery"), { recursive: true });
    fs.writeFileSync(path.join(root, "data", "edge-candidate-universe.json"), "{\"exactCandidates\":1}\n");
    fs.writeFileSync(path.join(root, "data", "native-discovery", "checkpoints.json"), "{\"base\":10}\n");
    const packed = packScannerState({ root, writeReport: false, requireExactUniverse: true, now: "2026-08-26T00:00:00.000Z" });
    assert.equal(packed.state, "SCANNER_STATE_PACKED");
    assert.equal(packed.exactUniverseIncluded, true);

    fs.rmSync(path.join(root, "data"), { recursive: true });
    const restored = restoreScannerState({ root, writeReport: false });
    assert.equal(restored.state, "SCANNER_STATE_RESTORED");
    assert.equal(fs.readFileSync(path.join(root, "data", "edge-candidate-universe.json"), "utf8"), "{\"exactCandidates\":1}\n");
    assert.equal(inspectScannerState({ root }).valid, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("scanner state bundle refuses to publish without the exact universe", () => {
  const root = tempRoot();
  try {
    fs.mkdirSync(path.join(root, "data"), { recursive: true });
    fs.writeFileSync(path.join(root, "data", "outcome-snapshots.json"), "[]\n");
    assert.throws(
      () => packScannerState({ root, writeReport: false, requireExactUniverse: true }),
      /Refusing to publish scanner state/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("scanner state restore rejects a corrupted bundle before writing files", () => {
  const root = tempRoot();
  try {
    fs.mkdirSync(path.join(root, "data"), { recursive: true });
    fs.writeFileSync(path.join(root, "data", "edge-candidate-universe.json"), "{}\n");
    packScannerState({ root, writeReport: false, requireExactUniverse: true });
    const bundle = path.join(root, ".state", "scanner-learning-bundle.json.gz");
    const bytes = fs.readFileSync(bundle);
    bytes[bytes.length - 4] ^= 0xff;
    fs.writeFileSync(bundle, bytes);
    fs.rmSync(path.join(root, "data"), { recursive: true });
    assert.throws(() => restoreScannerState({ root, writeReport: false }));
    assert.equal(fs.existsSync(path.join(root, "data", "edge-candidate-universe.json")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("scanner state bundle rejects traversal and symbolic-link paths", () => {
  const root = tempRoot();
  try {
    fs.mkdirSync(path.join(root, "data"), { recursive: true });
    assert.throws(
      () => __scannerStateBundleHooks.safeRelativeFile("../outside.json"),
      /Unsafe scanner-state path/,
    );
    fs.symlinkSync(os.tmpdir(), path.join(root, "data", "native-discovery"));
    assert.throws(
      () => __scannerStateBundleHooks.resolveInsideRoot(root, "data/native-discovery/x.json"),
      /symbolic link/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
