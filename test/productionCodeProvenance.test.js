import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildScanCodeProvenance, resolveCodeCommitSha } from "../src/production/productionRunManifest.js";

function repository(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cli provenance "));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
  const git = (...args) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--quiet");
  fs.writeFileSync(path.join(cwd, "source.js"), "export const version = 1;\n");
  git("add", "source.js");
  git("-c", "user.name=Provenance Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "Test fixture");
  return { cwd, git, sha: git("rev-parse", "HEAD") };
}

test("a clean local checkout resolves its actual commit without GitHub environment", (t) => {
  const { cwd, sha } = repository(t);
  assert.equal(resolveCodeCommitSha({ cwd, env: {} }), sha);
});

test("dirty tracked code cannot masquerade as committed source", (t) => {
  const { cwd } = repository(t);
  fs.appendFileSync(path.join(cwd, "source.js"), "export const dirty = true;\n");
  assert.equal(resolveCodeCommitSha({ cwd, env: {} }), null);
});

test("untracked source or artifact copies still fail closed until safely removed from the checkout", (t) => {
  const { cwd, sha } = repository(t);
  const duplicate = path.join(cwd, "reports 4");
  fs.mkdirSync(duplicate);
  fs.writeFileSync(path.join(duplicate, "proof.json"), "{}\n");
  assert.equal(resolveCodeCommitSha({ cwd, env: {} }), null);
  const preserved = fs.mkdtempSync(path.join(os.tmpdir(), "cli-preserved-proof-"));
  t.after(() => fs.rmSync(preserved, { recursive: true, force: true }));
  fs.renameSync(duplicate, path.join(preserved, "reports 4"));
  assert.equal(fs.readFileSync(path.join(preserved, "reports 4", "proof.json"), "utf8"), "{}\n");
  assert.equal(resolveCodeCommitSha({ cwd, env: {} }), sha);
  fs.writeFileSync(path.join(cwd, "new-source.js"), "export const added = true;\n");
  assert.equal(resolveCodeCommitSha({ cwd, env: {} }), null);
});

test("unavailable Git provenance remains null and explicit versions retain precedence", (t) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cli-no-git-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  assert.equal(resolveCodeCommitSha({ cwd, env: {} }), null);
  assert.equal(resolveCodeCommitSha({ cwd, env: { GITHUB_SHA: "github-fixture", EDGE_CODE_VERSION: "edge-fixture" } }), "github-fixture");
  assert.equal(resolveCodeCommitSha({ cwd, env: { EDGE_CODE_VERSION: "edge-fixture" } }), "edge-fixture");
  assert.equal(resolveCodeCommitSha({ cwd, codeCommitSha: "explicit-fixture", env: { GITHUB_SHA: "github-fixture" } }), "explicit-fixture");
});

test("scan provenance cannot relabel source that changes or becomes dirty during acquisition", (t) => {
  const { cwd, git, sha: start } = repository(t);
  assert.deepEqual(buildScanCodeProvenance(start, resolveCodeCommitSha({ cwd, env: {} })), {
    codeCommitSha: start, codeCommitShaAtStart: start, codeCommitShaAtEnd: start,
    codeProvenanceStatus: "SOURCE_VERSION_STABLE",
  });
  fs.appendFileSync(path.join(cwd, "source.js"), "export const later = true;\n");
  assert.equal(buildScanCodeProvenance(start, resolveCodeCommitSha({ cwd, env: {} })).codeCommitSha, null);
  git("add", "source.js");
  git("-c", "user.name=Provenance Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "Changed during scan");
  const end = resolveCodeCommitSha({ cwd, env: {} });
  assert.notEqual(start, end);
  const changed = buildScanCodeProvenance(start, end);
  assert.equal(changed.codeCommitSha, null);
  assert.equal(changed.codeCommitShaAtStart, start);
  assert.equal(changed.codeCommitShaAtEnd, end);
  assert.equal(changed.codeProvenanceStatus, "SOURCE_STATE_CHANGED_DURING_RUN");
  assert.equal(buildScanCodeProvenance(null, end).codeCommitSha, null);
  assert.equal(buildScanCodeProvenance(null, null).codeProvenanceStatus, "UNVERIFIED_SOURCE");
});
