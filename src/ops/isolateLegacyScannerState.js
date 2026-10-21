import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectScannerStateFiles, SCANNER_STATE_BUNDLE_FILE } from "./scannerStateBundle.js";

export const LEGACY_SCANNER_CACHE_PATTERNS = Object.freeze({
  ALPHA_OS: Object.freeze([
    "data/edge-production-episodes.jsonl", "data/edge-evidence-outcomes.jsonl", "data/edge-fast-outcomes.jsonl",
    "data/edge-candidate-universe.json", "data/ignition-twin-observations.jsonl", "data/ignition-genome-history.json",
    "data/production-shadow-predictions.jsonl", "data/autonomous-alpha-experiments.json", "data/alpha-os-predictions.jsonl",
    "data/alpha-os-candidate-history.json", "data/capital-migration-history.json", "data/project-digital-twins.json", "data/model-factory-challengers.json",
  ]),
  FUTURE_INTELLIGENCE: Object.freeze([
    "data/production-shadow-predictions.jsonl", "data/autonomous-alpha-experiments.json", "data/alpha-os-*.json*",
    "data/ignition-*.json*", "data/edge-candidate-universe.json",
  ]),
  MARKET_DISCOVERY: Object.freeze([
    "data/market-discovery-predictions.jsonl", "data/market-discovery-dependencies.json", "data/market-regime-history.json",
    "data/research-value-accounting.jsonl", "data/alpha-os-predictions.jsonl", "data/alpha-os-candidate-history.json",
    "data/capital-migration-history.json", "data/project-digital-twins.json", "data/model-factory-challengers.json",
    "data/edge-production-episodes.jsonl", "data/edge-evidence-outcomes.jsonl", "data/edge-fast-outcomes.jsonl",
    "data/edge-candidate-universe.json", "data/ignition-twin-observations.jsonl", "data/ignition-genome-history.json", "data/production-shadow-predictions.jsonl",
  ]),
});
const LEGACY_KEY_PREFIXES = { ALPHA_OS: ["alpha-os"], FUTURE_INTELLIGENCE: ["future-intelligence"],
  MARKET_DISCOVERY: ["market-discovery", "alpha-os", "production-shadow"] };
export const LEGACY_STATE_MAX_BYTES = 1024 ** 3;
const MAX_FILES = 4096, CHUNK = 64 * 1024;
const READ = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
const WRITE = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW;
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const failure = code => Object.assign(new Error(code), { code });
const stat = file => { try { return fs.lstatSync(file, { bigint: true }); } catch (error) { if (error.code === "ENOENT") return null; throw error; } };
const identity = value => ({ dev: String(value.dev), ino: String(value.ino), mtimeNs: String(value.mtimeNs), ctimeNs: String(value.ctimeNs) });
const sameInode = (expected, actual) => expected.dev === String(actual.dev) && expected.ino === String(actual.ino);
const sameFile = (expected, actual, renamed = false) => actual?.isFile() && !actual.isSymbolicLink() && sameInode(expected, actual) &&
  expected.bytes === Number(actual.size) && (renamed || (expected.mtimeNs === String(actual.mtimeNs) && expected.ctimeNs === String(actual.ctimeNs)));

function text(value, max = 512) {
  if (typeof value !== "string" || !value || value.length > max || value.trim() !== value || /[\x00-\x1f\x7f]/.test(value)) throw failure("LEGACY_STATE_INVALID_PROVENANCE");
  return value;
}

function relative(value) {
  if (typeof value !== "string" || !value.startsWith("data/") || path.posix.normalize(value) !== value ||
      /[\\\x00-\x1f\x7f*]/.test(value) || value.endsWith("/")) throw failure("LEGACY_STATE_UNSAFE_PATH");
  return value;
}

function matches(file, patterns) {
  return patterns.some(pattern => new RegExp(`^${pattern.split("*").map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")}$`).test(file));
}

function safePath(root, value, parents = null) {
  const absolute = path.join(root, relative(value));
  const parts = value.split("/").slice(0, -1);
  for (let index = 0; index < parts.length; index++) {
    const parent = path.join(root, ...parts.slice(0, index + 1)), current = stat(parent);
    if (current && (!current.isDirectory() || current.isSymbolicLink())) throw failure("LEGACY_STATE_UNSAFE_ANCESTOR");
    if (parents && current) {
      const saved = parents.get(parent);
      if (saved && !sameInode(saved, current)) throw failure("LEGACY_STATE_ANCESTOR_CHANGED");
      parents.set(parent, identity(current));
    }
  }
  if (stat(absolute)?.isSymbolicLink()) throw failure("LEGACY_STATE_UNSAFE_SOURCE");
  return absolute;
}

function safeState(root) {
  const directory = path.join(root, ".state"), current = stat(directory);
  if (!current?.isDirectory() || current.isSymbolicLink()) throw failure("LEGACY_STATE_UNSAFE_STATE_DIRECTORY");
  return directory;
}

function sync(directory) {
  const fd = fs.openSync(directory, READ);
  try { if (!fs.fstatSync(fd).isDirectory()) throw failure("LEGACY_STATE_UNSAFE_DIRECTORY"); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}

function writeAll(fd, bytes, count = bytes.length) {
  for (let offset = 0; offset < count;) {
    const written = fs.writeSync(fd, bytes, offset, count - offset);
    if (written <= 0) throw failure("LEGACY_STATE_SHORT_WRITE");
    offset += written;
  }
}

function scan(fd, expectedBytes, target = null, budget = null) {
  const buffer = Buffer.alloc(CHUNK), hash = crypto.createHash("sha256");
  let bytes = 0, lines = 0, last = null;
  for (;;) {
    const count = fs.readSync(fd, buffer, 0, buffer.length, bytes);
    if (!count) break;
    bytes += count;
    if (budget && (budget.used += count) > budget.max) throw failure("LEGACY_STATE_SIZE_CAP_EXCEEDED");
    if (bytes > expectedBytes) throw failure("LEGACY_STATE_SOURCE_CHANGED");
    hash.update(buffer.subarray(0, count));
    for (let index = 0; index < count; index++) if (buffer[index] === 10) lines++;
    last = buffer[count - 1];
    if (target !== null) writeAll(target, buffer, count);
  }
  if (bytes !== expectedBytes) throw failure("LEGACY_STATE_SOURCE_CHANGED");
  return { bytes, sha256: hash.digest("hex"), lineCount: lines + Number(bytes > 0 && last !== 10) };
}

function readFile(file, expected = null, target = null, budget = null, renamed = false) {
  const before = stat(file);
  if (!before?.isFile() || before.isSymbolicLink()) throw failure("LEGACY_STATE_UNSAFE_SOURCE");
  const wanted = expected || { ...identity(before), bytes: Number(before.size) };
  if (!sameFile(wanted, before, renamed)) throw failure("LEGACY_STATE_SOURCE_CHANGED");
  const fd = fs.openSync(file, READ);
  try {
    if (!sameFile(wanted, fs.fstatSync(fd, { bigint: true }), renamed)) throw failure("LEGACY_STATE_SOURCE_CHANGED");
    const actual = scan(fd, wanted.bytes, target, budget);
    if (!sameFile(wanted, fs.fstatSync(fd, { bigint: true }), renamed) || !sameFile(wanted, stat(file), renamed) ||
        (expected?.sha256 && expected.sha256 !== actual.sha256)) throw failure("LEGACY_STATE_SOURCE_CHANGED");
    return { ...actual, ...identity(before) };
  } finally { fs.closeSync(fd); }
}

function json(file, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`), expectedHash = digest(bytes);
  const temporary = `${file}.${crypto.randomUUID()}.tmp`, directory = path.dirname(file);
  let fd = null;
  try {
    fd = fs.openSync(temporary, WRITE, 0o400);
    writeAll(fd, bytes); fs.fsyncSync(fd); fs.closeSync(fd); fd = null;
    if (readFile(temporary).sha256 !== expectedHash) throw failure("LEGACY_STATE_READBACK_FAILED");
    sync(directory);
    // A short write can only leave a retained temporary file. The final name
    // appears atomically and cannot replace a previously published journal.
    try { fs.linkSync(temporary, file); } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (readFile(file).sha256 !== expectedHash) throw failure("LEGACY_STATE_JSON_CONFLICT");
    }
    sync(directory);
    const result = readFile(file);
    if (result.sha256 !== expectedHash) throw failure("LEGACY_STATE_READBACK_FAILED");
    return result;
  } catch (error) {
    error.partialTemporaryFile = temporary;
    try { if (fd !== null) fs.fsyncSync(fd); } catch (syncError) { error.partialSyncError = syncError; }
    try { sync(directory); } catch (syncError) { error.partialDirectorySyncError = syncError; }
    throw error;
  } finally { if (fd !== null) fs.closeSync(fd); }
}

function validateUnpublishedQuarantine(directory, journal) {
  const expected = Buffer.from(`${JSON.stringify(journal, null, 2)}\n`), names = fs.readdirSync(directory);
  if (names.length > MAX_FILES) throw failure("LEGACY_STATE_UNBOUND_QUARANTINE");
  for (const name of names) {
    // No original may have moved before the complete bound plan is published.
    // Only retained prefixes of this exact plan are valid initialization debris.
    if (!/^plan\.json\.[a-f0-9-]{36}\.tmp$/.test(name)) throw failure("LEGACY_STATE_UNBOUND_QUARANTINE");
    const file = path.join(directory, name), before = stat(file);
    if (!before?.isFile() || before.isSymbolicLink() || before.size > BigInt(expected.length)) throw failure("LEGACY_STATE_UNBOUND_QUARANTINE");
    const checked = readFile(file), bytes = fs.readFileSync(file, { flag: READ });
    if (digest(bytes) !== checked.sha256 || !bytes.equals(expected.subarray(0, bytes.length))) throw failure("LEGACY_STATE_UNBOUND_QUARANTINE");
  }
}

function loadJson(file, expectedHash = null) {
  const result = readFile(file);
  if (result.bytes > 8 * 1024 * 1024 || (expectedHash && result.sha256 !== expectedHash)) throw failure("LEGACY_STATE_PLAN_MISMATCH");
  const value = JSON.parse(fs.readFileSync(file, { flag: READ }));
  if (readFile(file).sha256 !== result.sha256) throw failure("LEGACY_STATE_PLAN_MISMATCH");
  return value;
}

function parents(target, value) {
  let directory = target;
  for (const component of value.split("/").slice(0, -1)) {
    const next = path.join(directory, component), current = stat(next);
    if (!current) { fs.mkdirSync(next, { mode: 0o700 }); sync(directory); }
    else if (!current.isDirectory() || current.isSymbolicLink()) throw failure("LEGACY_STATE_UNSAFE_ANCESTOR");
    directory = next;
  }
  return directory;
}

function provenance(options) {
  if (!Object.hasOwn(LEGACY_SCANNER_CACHE_PATTERNS, options.workflowKind)) throw failure("LEGACY_STATE_UNKNOWN_WORKFLOW");
  const runnerOs = text(options.runnerOs, 64), refName = text(options.refName, 256);
  const legacyCacheKey = text(options.legacyCacheKey), canonicalCacheKey = text(options.canonicalCacheKey);
  if (!LEGACY_KEY_PREFIXES[options.workflowKind].some(prefix => legacyCacheKey.startsWith(`${prefix}-${runnerOs}-${refName}-`) && legacyCacheKey.length > `${prefix}-${runnerOs}-${refName}-`.length)) throw failure("LEGACY_STATE_LEGACY_CACHE_KEY_MISMATCH");
  if (!canonicalCacheKey.startsWith(`scanner-learning-v2-${runnerOs}-`) || canonicalCacheKey.length <= `scanner-learning-v2-${runnerOs}-`.length) throw failure("LEGACY_STATE_CANONICAL_CACHE_KEY_MISMATCH");
  return { workflowKind: options.workflowKind, runnerOs, refName, legacyCacheKey, canonicalCacheKey,
    sourceCommit: options.sourceCommit || null, workflowRun: options.workflowRun || null, workflowAttempt: options.workflowAttempt || null };
}

function canonical(root, expected = null) {
  if (!stat(path.join(root, ".state"))) {
    if (expected) throw failure("LEGACY_STATE_CANONICAL_BODY_CHANGED");
    return null;
  }
  safeState(root);
  const file = path.join(root, SCANNER_STATE_BUNDLE_FILE), before = stat(file);
  if (!before) {
    if (expected) throw failure("LEGACY_STATE_CANONICAL_BODY_CHANGED");
    return null;
  }
  const body = readFile(file, expected), checked = inspectScannerStateFiles({ root });
  if (checked.bundleSha256 !== body.sha256 || readFile(file, body).sha256 !== body.sha256) throw failure("LEGACY_STATE_CANONICAL_BODY_CHANGED");
  return { body, files: checked.files, format: checked.format };
}

function failed(directory, error) {
  if (!directory) return;
  try { json(path.join(directory, `failure-${crypto.randomUUID()}.json`), { status: "FAILED", reason: error.code || "LEGACY_STATE_FAILED", permanentBackup: false }); }
  catch (markerError) { error.failureMarkerError = markerError; }
}

export function prepareLegacyScannerStateIsolation(options = {}) {
  const root = fs.realpathSync(options.root || process.cwd()), checked = canonical(root);
  if (!checked) return { status: "NO_CANONICAL_BUNDLE", needsCommit: false };
  const patterns = LEGACY_SCANNER_CACHE_PATTERNS[options.workflowKind];
  if (!patterns) throw failure("LEGACY_STATE_UNKNOWN_WORKFLOW");
  const maximum = options.maxBytes ?? LEGACY_STATE_MAX_BYTES;
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > LEGACY_STATE_MAX_BYTES) throw failure("LEGACY_STATE_INVALID_SIZE_CAP");
  if (checked.files.length > MAX_FILES) throw failure("LEGACY_STATE_FILE_COUNT_CAP_EXCEEDED");
  const ancestry = new Map(), candidates = [];
  // Complete metadata/size preflight of every potential overlapping local file
  // before reading any legacy payload. Canonical bytes were validated first.
  for (const entry of checked.files) {
    const absolute = safePath(root, entry.path, ancestry), current = stat(absolute);
    if (!current) continue;
    if (!current.isFile() || current.isSymbolicLink()) throw failure("LEGACY_STATE_UNSAFE_SOURCE");
    if (matches(entry.path, patterns)) {
      if (/(?:\.(?:sqlite3?|db)(?:-(?:wal|shm|journal))?|-(?:wal|shm|journal))$/i.test(entry.path)) throw failure("LEGACY_STATE_SQLITE_UNSUPPORTED");
      candidates.push({ path: entry.path, canonicalSha256: entry.sha256, bytes: Number(current.size), ...identity(current) });
    }
  }
  if (candidates.reduce((sum, entry) => sum + BigInt(entry.bytes), 0n) > BigInt(maximum)) throw failure("LEGACY_STATE_SIZE_CAP_EXCEEDED");
  const conflicts = [];
  for (const entry of candidates) {
    const actual = readFile(safePath(root, entry.path, ancestry), entry);
    if (actual.sha256 !== entry.canonicalSha256) conflicts.push({ ...entry, sha256: actual.sha256 });
  }
  if (!conflicts.length) return { status: "NO_CONFLICTS", needsCommit: false };
  const source = provenance(options);
  if (options.legacyRestoreOutcome !== "success" || options.canonicalRestoreOutcome !== "success") throw failure("LEGACY_STATE_CACHE_RESTORE_NOT_SUCCESSFUL");
  if (typeof options.outputDir !== "string" || !path.isAbsolute(options.outputDir)) throw failure("LEGACY_STATE_NEW_OUTPUT_REQUIRED");
  const output = path.join(fs.realpathSync(path.dirname(options.outputDir)), path.basename(options.outputDir));
  if (output === root || output.startsWith(`${root}${path.sep}`)) throw failure("LEGACY_STATE_OUTPUT_MUST_BE_OUTSIDE_WORKSPACE");
  fs.mkdirSync(output, { mode: 0o700 }); sync(path.dirname(output));
  try {
    const budget = { used: 0, max: maximum };
    const files = conflicts.map(entry => {
      const directory = parents(output, entry.path), target = path.join(output, entry.path), fd = fs.openSync(target, WRITE, 0o400);
      let copied;
      try { copied = readFile(safePath(root, entry.path, ancestry), entry, fd, budget); }
      finally { try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
      const copy = readFile(target);
      if (copy.sha256 !== copied.sha256 || copy.bytes !== copied.bytes) throw failure("LEGACY_STATE_READBACK_FAILED");
      sync(directory);
      return { ...entry, lineCount: copied.lineCount };
    });
    canonical(root, checked.body);
    const manifest = { format: "legacy-scanner-state-isolation/v1", auditCreatedAt: new Date().toISOString(), workspaceRoot: root,
      provenance: source, canonical: checked.body, canonicalFormat: checked.format,
      quarantineName: `legacy-cache-quarantine-${crypto.randomUUID()}`, files, rawBytes: budget.used,
      purpose: "TEMPORARY_DIAGNOSTIC_TRANSPORT", claims: { restartable: false, permanentBackup: false, remoteAcknowledged: false, scoring: false, certification: false },
      excludedState: "SQLITE_DATABASES_REQUIRE_CONSISTENT_EXISTING_EXPORT_OR_BACKUP" };
    const manifestFile = path.join(output, "manifest.json"), manifestHash = json(manifestFile, manifest).sha256;
    const archiveFile = path.join(output, "legacy-scanner-state.tar.gz"), fd = fs.openSync(archiveFile, WRITE, 0o400);
    try { execFileSync("tar", ["-czf", "-", "-C", output, ...files.map(entry => entry.path), "manifest.json"], {
      stdio: ["ignore", fd, "pipe"], timeout: 10 * 60 * 1000, maxBuffer: CHUNK, env: { PATH: process.env.PATH, LC_ALL: "C" },
    }); } finally { try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
    const archive = readFile(archiveFile);
    for (const entry of files) {
      readFile(safePath(root, entry.path, ancestry), entry);
      if (readFile(path.join(output, entry.path)).sha256 !== entry.sha256) throw failure("LEGACY_STATE_READBACK_FAILED");
    }
    canonical(root, checked.body);
    const receiptHash = json(path.join(output, "preservation-receipt.json"), { format: "legacy-scanner-state-receipt/v1", status: "PREPARED_NOT_DISPLACED",
      manifestSha256: manifestHash, archive: { path: "legacy-scanner-state.tar.gz", bytes: archive.bytes, sha256: archive.sha256 },
      purpose: "TEMPORARY_DIAGNOSTIC_TRANSPORT", permanentBackup: false, remoteAcknowledged: false }).sha256;
    if (readFile(manifestFile).sha256 !== manifestHash || readFile(archiveFile).sha256 !== archive.sha256) throw failure("LEGACY_STATE_READBACK_FAILED");
    sync(output); sync(path.dirname(output));
    // The externally carried plan hash binds BOTH the manifest and archive via
    // the receipt, so replacing a local receipt cannot authorize a new tar.
    return { status: "PREPARED_NOT_DISPLACED", needsCommit: true, outputDir: output, planHash: receiptHash,
      manifestHash, fileCount: files.length, rawBytes: budget.used };
  } catch (error) { failed(output, error); throw error; }
}

export function commitLegacyScannerStateIsolation(options = {}) {
  if (options.archiveUploadOutcome !== "success") throw failure("LEGACY_STATE_UPLOAD_SUCCESS_REQUIRED");
  const root = fs.realpathSync(options.root || process.cwd()), source = provenance(options);
  const output = path.resolve(options.outputDir || ""), outputStat = stat(output);
  if (!outputStat?.isDirectory() || outputStat.isSymbolicLink()) throw failure("LEGACY_STATE_UNSAFE_OUTPUT");
  const expectedHash = text(options.expectedPlanHash, 64);
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) throw failure("LEGACY_STATE_PLAN_MISMATCH");
  const receipt = loadJson(path.join(output, "preservation-receipt.json"), expectedHash);
  const manifest = loadJson(path.join(output, "manifest.json"), receipt.manifestSha256);
  if (manifest.format !== "legacy-scanner-state-isolation/v1" || manifest.workspaceRoot !== root ||
      JSON.stringify(manifest.provenance) !== JSON.stringify(source) || !/^legacy-cache-quarantine-[a-f0-9-]{36}$/.test(manifest.quarantineName) ||
      !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > MAX_FILES) throw failure("LEGACY_STATE_PLAN_MISMATCH");
  if (receipt.status !== "PREPARED_NOT_DISPLACED" || !/^[a-f0-9]{64}$/.test(receipt.manifestSha256) || receipt.archive?.path !== "legacy-scanner-state.tar.gz" ||
      readFile(path.join(output, receipt.archive.path)).sha256 !== receipt.archive.sha256) throw failure("LEGACY_STATE_PLAN_MISMATCH");
  canonical(root, manifest.canonical);
  const stateDirectory = safeState(root), quarantine = path.join(stateDirectory, manifest.quarantineName), ancestry = new Map();
  const expectedJournal = { format: "legacy-state-isolation-write-ahead/v1", planHash: expectedHash,
    archiveSha256: receipt.archive.sha256, canonicalSha256: manifest.canonical.sha256, provenance: source };
  let existed = false;
  const current = stat(quarantine);
  if (current) {
    if (!current.isDirectory() || current.isSymbolicLink()) throw failure("LEGACY_STATE_UNSAFE_QUARANTINE");
    if (stat(path.join(quarantine, "plan.json"))) {
      if (JSON.stringify(loadJson(path.join(quarantine, "plan.json"))) !== JSON.stringify(expectedJournal)) throw failure("LEGACY_STATE_PLAN_MISMATCH");
      existed = true;
    } else validateUnpublishedQuarantine(quarantine, expectedJournal);
  }
  for (const entry of manifest.files) {
    relative(entry.path);
    if (!matches(entry.path, LEGACY_SCANNER_CACHE_PATTERNS[source.workflowKind]) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw failure("LEGACY_STATE_PLAN_MISMATCH");
    if (readFile(safePath(output, entry.path)).sha256 !== entry.sha256) throw failure("LEGACY_STATE_PLAN_MISMATCH");
    const active = safePath(root, entry.path, ancestry), moved = safePath(quarantine, entry.path);
    if (stat(moved)) {
      if (!existed || stat(active)) throw failure("LEGACY_STATE_QUARANTINE_CONFLICT");
      readFile(moved, entry, null, null, true);
    } else readFile(active, entry);
  }
  if (!existed) {
    if (!current) { fs.mkdirSync(quarantine, { mode: 0o700 }); sync(stateDirectory); }
    json(path.join(quarantine, "plan.json"), expectedJournal);
  }
  // A retry may find a directory created just before the previous process
  // stopped, before its parent entry was durable. Persist both levels first.
  sync(stateDirectory); sync(quarantine);
  try {
    for (const [index, entry] of manifest.files.entries()) {
      const active = safePath(root, entry.path, ancestry), moved = safePath(quarantine, entry.path);
      if (stat(moved)) continue;
      readFile(active, entry);
      const directory = parents(quarantine, entry.path), intent = path.join(quarantine, `intent-${index}.json`);
      if (!stat(intent)) json(intent, { planHash: expectedHash, entry });
      else if (JSON.stringify(loadJson(intent)) !== JSON.stringify({ planHash: expectedHash, entry })) throw failure("LEGACY_STATE_PLAN_MISMATCH");
      sync(quarantine);
      if (stat(moved)) throw failure("LEGACY_STATE_QUARANTINE_CONFLICT");
      // The private exclusive quarantine is on the workspace filesystem. An
      // EXDEV failure is propagated; never unlink/copy/delete a live original.
      fs.renameSync(active, moved);
      sync(path.dirname(active)); sync(directory); sync(root); sync(stateDirectory);
      readFile(moved, entry, null, null, true);
      json(path.join(quarantine, `moved-${index}.json`), { planHash: expectedHash, path: entry.path, sha256: entry.sha256 });
    }
    canonical(root, manifest.canonical);
    const done = path.join(quarantine, "commit-receipt.json");
    if (!stat(done)) json(done, { status: "ISOLATED_NOT_RESTORED", planHash: expectedHash, fileCount: manifest.files.length,
      artifactUploadOutcome: "success", permanentBackup: false, remoteAcknowledged: false });
    sync(quarantine); sync(stateDirectory); sync(root);
    return { status: "ISOLATED_NOT_RESTORED", quarantineDirectory: quarantine, fileCount: manifest.files.length };
  } catch (error) { failed(quarantine, error); error.quarantineDirectory = quarantine; throw error; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = { root: process.cwd(), outputDir: process.env.LEGACY_STATE_ISOLATION_DIR,
      workflowKind: process.env.LEGACY_STATE_WORKFLOW_KIND, runnerOs: process.env.RUNNER_OS, refName: process.env.GITHUB_REF_NAME,
      legacyCacheKey: process.env.LEGACY_STATE_CACHE_KEY, canonicalCacheKey: process.env.CANONICAL_STATE_CACHE_KEY,
      legacyRestoreOutcome: process.env.LEGACY_STATE_RESTORE_OUTCOME, canonicalRestoreOutcome: process.env.CANONICAL_STATE_RESTORE_OUTCOME,
      sourceCommit: process.env.GITHUB_SHA || null, workflowRun: process.env.GITHUB_RUN_ID || null, workflowAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
      expectedPlanHash: process.env.LEGACY_STATE_PLAN_HASH, archiveUploadOutcome: process.env.LEGACY_STATE_UPLOAD_OUTCOME };
    const phase = process.argv[2];
    if (!["prepare", "commit"].includes(phase)) throw failure("LEGACY_STATE_UNKNOWN_PHASE");
    const result = phase === "prepare" ? prepareLegacyScannerStateIsolation(options) : commitLegacyScannerStateIsolation(options);
    if (phase === "prepare" && process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT,
      `needs_commit=${result.needsCommit ? "true" : "false"}\nplan_hash=${result.planHash || ""}\n`);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) { process.stderr.write(`Legacy scanner-state isolation failed: ${error.code || "LEGACY_STATE_FAILED"}\n`); process.exitCode = 1; }
}
