import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";
import { exportForwardEvidenceCache, FORWARD_EVIDENCE_FILES } from "../src/ops/exportForwardEvidenceCache.js";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forward-cache-export-"));
  for (const file of FORWARD_EVIDENCE_FILES) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), file.includes("context") ? "" : `good\r\n{bad\r\n`); }
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function members(gzip) { const raw = zlib.gunzipSync(gzip); const values = new Map(); for (let offset = 0; raw.slice(offset, offset + 512).some(Boolean);) { const name = raw.slice(offset, offset + 100).toString().replace(/\0.*$/, ""); const size = Number.parseInt(raw.slice(offset + 124, offset + 136).toString().replace(/\0.*$/, "").trim(), 8); values.set(name, raw.slice(offset + 512, offset + 512 + size)); offset += 512 + Math.ceil(size / 512) * 512; } return values; }

test("exports raw CRLF and malformed rows unchanged with a round-trip manifest", t => {
  const root = fixture(t), output = path.join(root, "export");
  const result = exportForwardEvidenceCache({ root, outputDir: output, cacheMatchedKey: "forward-evidence-Linux-main-123", sourceCommit: "abc", workflowRun: "15" });
  const archive = members(fs.readFileSync(result.archiveFile));
  for (const file of FORWARD_EVIDENCE_FILES) assert.deepEqual(archive.get(file), fs.readFileSync(path.join(root, file)));
  assert.equal(result.manifest.provenance.cacheMatchedKey, "forward-evidence-Linux-main-123");
});

test("fails closed for symlinks, size caps, and source mutation", t => {
  const root = fixture(t);
  fs.unlinkSync(path.join(root, FORWARD_EVIDENCE_FILES[0])); fs.symlinkSync("/tmp/nope", path.join(root, FORWARD_EVIDENCE_FILES[0]));
  assert.throws(() => exportForwardEvidenceCache({ root, outputDir: path.join(root, "symlink"), cacheMatchedKey: "k" }), /UNSAFE_SOURCE/);
  fs.unlinkSync(path.join(root, FORWARD_EVIDENCE_FILES[0])); fs.writeFileSync(path.join(root, FORWARD_EVIDENCE_FILES[0]), "x");
  assert.throws(() => exportForwardEvidenceCache({ root, outputDir: path.join(root, "cap"), cacheMatchedKey: "k", maxBytes: 1 }), /SIZE_CAP/);
  fs.writeFileSync(path.join(root, FORWARD_EVIDENCE_FILES[0]), "stable");
  const originalRead = fs.readFileSync; let changed = false;
  fs.readFileSync = (...args) => {
    const value = originalRead(...args);
    if (!changed && args[0] === path.join(root, FORWARD_EVIDENCE_FILES[0])) { changed = true; originalRead(path.join(root, FORWARD_EVIDENCE_FILES[0])); fs.writeFileSync(path.join(root, FORWARD_EVIDENCE_FILES[0]), "changed"); }
    return value;
  };
  try { assert.throws(() => exportForwardEvidenceCache({ root, outputDir: path.join(root, "mutation"), cacheMatchedKey: "k" }), /SOURCE_MUTATED/); }
  finally { fs.readFileSync = originalRead; }
});

test("workflow keeps export manually isolated from the normal probe", () => {
  const workflow = fs.readFileSync(".github/workflows/outcome-probe.yml", "utf8");
  assert.match(workflow, /export_forward_cache:\n[\s\S]*default: false/);
  assert.match(workflow, /probe:\n    if: \$\{\{ github\.event_name != 'workflow_dispatch' \|\| inputs\.export_forward_cache != true \}\}/);
  assert.match(workflow, /export-forward-cache:\n    if: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.export_forward_cache == true \}\}/);
  assert.doesNotMatch(workflow.match(/export-forward-cache:[\s\S]*/)?.[0] || "", /cache\/save|npm ci|SUPABASE|outcomes:probe/);
});
