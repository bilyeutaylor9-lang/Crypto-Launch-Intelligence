import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { SCANNER_STATE_PATTERNS, SCANNER_STATE_ARCHIVE_PATTERNS } from "./scannerStateBundle.js";

export const FAILED_SCANNER_STATE_PATTERNS = Object.freeze([...new Set([
  ...SCANNER_STATE_PATTERNS, ...SCANNER_STATE_ARCHIVE_PATTERNS,
])]);
export const FAILED_SCANNER_STATE_MAX_BYTES = 1024 * 1024 * 1024;
const MAX_FILES = 4096;
const MAX_DIRECTORY_ENTRIES = 32768;
const BUFFER_BYTES = 64 * 1024;
const READ_FLAGS = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
const WRITE_FLAGS = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW;
const OUTCOMES = new Set(["success", "failure", "skipped", "cancelled", "not_run"]);

function failure(code, relative = null) {
  const error = new Error(relative ? `${code}:${relative}` : code);
  error.code = code;
  return error;
}

function outcome(value) {
  const result = value === undefined || value === "" ? "not_run" : value;
  if (!OUTCOMES.has(result)) throw failure("FAILED_STATE_INVALID_STEP_OUTCOME");
  return result;
}

export function shouldPreserveFailedScannerState({ packOutcome, cacheSaveOutcome } = {}) {
  return outcome(packOutcome) !== "success" || outcome(cacheSaveOutcome) !== "success";
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameFile(left, right) {
  return right.isFile() && !right.isSymbolicLink() && sameIdentity(left, right) &&
    left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function statOrMissing(file) {
  try { return fs.lstatSync(file, { bigint: true }); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

function safeRelative(value, pattern = false) {
  if (typeof value !== "string" || !value.startsWith("data/") || path.posix.normalize(value) !== value ||
      /[\\\x00-\x1f\x7f]/.test(value) || value.endsWith("/") ||
      (!pattern && value.includes("*")) || value.split("/").some(part => !part || part === "." || part === "..")) {
    throw failure("FAILED_STATE_UNSAFE_SOURCE_PATH");
  }
  return value;
}

function parentsFor(root, relative, parents) {
  const components = ["", ...relative.split("/").slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join("/"))];
  for (const component of components) {
    if (parents.has(component)) {
      if (!parents.get(component)) return false;
      continue;
    }
    const stat = statOrMissing(path.join(root, component));
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw failure("FAILED_STATE_UNSAFE_SOURCE_ANCESTOR", component || ".");
    parents.set(component, stat);
    if (!stat) return false;
  }
  return true;
}

function assertParents(root, parents) {
  for (const [relative, original] of parents) {
    const current = statOrMissing(path.join(root, relative));
    if (!original) {
      if (current) throw failure("FAILED_STATE_SOURCE_MUTATED", relative);
    } else if (!current?.isDirectory() || current.isSymbolicLink() || !sameIdentity(original, current)) {
      throw failure("FAILED_STATE_UNSAFE_SOURCE_ANCESTOR", relative || ".");
    }
  }
}

function namesIn(directory) {
  const result = [], handle = fs.opendirSync(directory);
  try {
    for (;;) {
      const entry = handle.readSync();
      if (!entry) return result;
      result.push(entry.name);
      if (result.length > MAX_DIRECTORY_ENTRIES) throw failure("FAILED_STATE_DIRECTORY_ENTRY_CAP_EXCEEDED");
    }
  } finally { handle.closeSync(); }
}

function selectFiles(root, maxBytes) {
  const parents = new Map(), directories = new Map(), selected = new Set(), missingPatterns = [], excludedSqliteFiles = new Set();
  for (const originalPattern of FAILED_SCANNER_STATE_PATTERNS) {
    const pattern = safeRelative(originalPattern, true), directory = path.posix.dirname(pattern), basename = path.posix.basename(pattern);
    // Code-owned patterns have fixed parent directories and only a '*' filename
    // wildcard. Never recursively follow an untrusted directory or glob.
    if (directory.includes("*") || /[?\[\]{}]/.test(pattern)) throw failure("FAILED_STATE_UNSUPPORTED_ALLOWLIST_PATTERN");
    if (!parentsFor(root, pattern, parents)) { missingPatterns.push(pattern); continue; }
    if (!directories.has(directory)) directories.set(directory, namesIn(path.join(root, directory)));
    const matcher = new RegExp(`^${basename.split("*").map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
    let matched = false;
    for (const name of directories.get(directory)) {
      if (/(?:\.(?:sqlite3?|db)(?:-(?:wal|shm|journal))?|-(?:wal|shm|journal))$/i.test(name)) {
        excludedSqliteFiles.add(safeRelative(`${directory}/${name}`));
        continue;
      }
      if (!matcher.test(name)) continue;
      matched = true;
      selected.add(safeRelative(`${directory}/${name}`));
      if (selected.size > MAX_FILES) throw failure("FAILED_STATE_FILE_COUNT_CAP_EXCEEDED");
    }
    if (!matched) missingPatterns.push(pattern);
  }
  // Complete lstat/aggregate preflight before opening or reading ANY source
  // payload. A size limit never means truncated or partially admitted state.
  const files = [...selected].sort().map(relative => {
    const file = path.join(root, relative), stat = statOrMissing(file);
    if (!stat?.isFile() || stat.isSymbolicLink()) throw failure("FAILED_STATE_UNSAFE_SOURCE", relative);
    return { relative, file, stat };
  });
  if (files.reduce((sum, entry) => sum + entry.stat.size, 0n) > BigInt(maxBytes)) throw failure("FAILED_STATE_RAW_SIZE_CAP_EXCEEDED");
  assertParents(root, parents);
  return { files, parents, missingPatterns, excludedSqliteFiles: [...excludedSqliteFiles].sort() };
}

function assertSource(root, parents, entry, fd = null) {
  assertParents(root, parents);
  const current = statOrMissing(entry.file);
  if (!current || !sameFile(entry.stat, current) || (fd !== null && !sameFile(entry.stat, fs.fstatSync(fd, { bigint: true })))) {
    throw failure("FAILED_STATE_SOURCE_MUTATED", entry.relative);
  }
}

function withSource(root, parents, entry, operation) {
  assertSource(root, parents, entry);
  const fd = fs.openSync(entry.file, READ_FLAGS);
  try {
    assertSource(root, parents, entry, fd);
    const result = operation(fd);
    assertSource(root, parents, entry, fd);
    return result;
  } finally { fs.closeSync(fd); }
}

function writeAll(fd, buffer, count = buffer.length) {
  let offset = 0;
  while (offset < count) {
    const written = fs.writeSync(fd, buffer, offset, count - offset);
    if (!written) throw failure("FAILED_STATE_SHORT_WRITE");
    offset += written;
  }
}

function scan(fd, { sizeLimit, copyFd = null, budget = null } = {}) {
  const buffer = Buffer.alloc(BUFFER_BYTES), hash = crypto.createHash("sha256");
  let bytes = 0, newlines = 0, lastByte = null;
  for (;;) {
    const count = fs.readSync(fd, buffer, 0, buffer.length, bytes);
    if (!count) break;
    bytes += count;
    if (budget) {
      budget.used += count;
      if (budget.used > budget.max) throw failure("FAILED_STATE_RAW_SIZE_CAP_EXCEEDED");
    }
    if (bytes > sizeLimit) throw failure("FAILED_STATE_SOURCE_MUTATED");
    hash.update(buffer.subarray(0, count));
    for (let index = 0; index < count; index++) if (buffer[index] === 10) newlines++;
    lastByte = buffer[count - 1];
    if (copyFd !== null) writeAll(copyFd, buffer, count);
  }
  return { bytes, sha256: hash.digest("hex"), lineCount: newlines + Number(bytes > 0 && lastByte !== 10) };
}

function readBack(file, expected = null) {
  const before = fs.lstatSync(file, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) throw failure("FAILED_STATE_UNSAFE_OUTPUT");
  const fd = fs.openSync(file, READ_FLAGS);
  try {
    if (!sameFile(before, fs.fstatSync(fd, { bigint: true }))) throw failure("FAILED_STATE_READBACK_MISMATCH");
    const actual = scan(fd, { sizeLimit: Number(before.size) });
    if (!sameFile(before, fs.fstatSync(fd, { bigint: true })) || !sameFile(before, fs.lstatSync(file, { bigint: true })) ||
        (expected && (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256))) throw failure("FAILED_STATE_READBACK_MISMATCH");
    return actual;
  } finally { fs.closeSync(fd); }
}

function syncDirectory(directory) {
  const fd = fs.openSync(directory, READ_FLAGS);
  try { if (!fs.fstatSync(fd).isDirectory()) throw failure("FAILED_STATE_UNSAFE_OUTPUT"); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}

function writeJson(file, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  const expected = { bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
  const fd = fs.openSync(file, WRITE_FLAGS, 0o444);
  try { writeAll(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  readBack(file, expected);
  syncDirectory(path.dirname(file));
  return expected;
}

function newDirectory(outputDir, root) {
  if (typeof outputDir !== "string" || !path.isAbsolute(outputDir)) throw failure("FAILED_STATE_OUTPUT_MUST_BE_NEW_ABSOLUTE_DIRECTORY");
  const target = path.join(fs.realpathSync(path.dirname(outputDir)), path.basename(outputDir));
  const relative = path.relative(root, target);
  if (relative === "data" || relative.startsWith(`data${path.sep}`)) throw failure("FAILED_STATE_OUTPUT_MUST_NOT_BE_SOURCE");
  fs.mkdirSync(target, { mode: 0o700 });
  syncDirectory(path.dirname(target));
  return target;
}

function createOutputParents(target, relative, directories) {
  for (const part of relative.split("/").slice(0, -1)) {
    target = path.join(target, part);
    if (directories.has(target)) continue;
    fs.mkdirSync(target, { mode: 0o700 });
    directories.add(target);
    syncDirectory(path.dirname(target));
  }
}

export function preserveFailedScannerState({ root = process.cwd(), outputDir, packOutcome, cacheSaveOutcome,
  sourceCommit = null, workflowRun = null, workflowAttempt = null, workflowJob = null,
  expectedCacheKey = null, matchedRestoreCacheKey = null, restoreOutcome = null,
  maxBytes = FAILED_SCANNER_STATE_MAX_BYTES } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > FAILED_SCANNER_STATE_MAX_BYTES) throw failure("FAILED_STATE_INVALID_RAW_SIZE_CAP");
  const pack = outcome(packOutcome), save = outcome(cacheSaveOutcome);
  if (!shouldPreserveFailedScannerState({ packOutcome: pack, cacheSaveOutcome: save })) return { status: "NOT_NEEDED", preserved: false };
  const sourceRoot = fs.realpathSync(root), target = newDirectory(outputDir, sourceRoot), outputDirectories = new Set();
  try {
    const checked = selectFiles(sourceRoot, maxBytes), { files, parents, missingPatterns, excludedSqliteFiles } = checked;
    const budget = { used: 0, max: maxBytes };
    for (const entry of files) {
      createOutputParents(target, entry.relative, outputDirectories);
      const destination = path.join(target, entry.relative), fd = fs.openSync(destination, WRITE_FLAGS, 0o444);
      try {
        entry.copied = withSource(sourceRoot, parents, entry, sourceFd => scan(sourceFd, { sizeLimit: Number(entry.stat.size), copyFd: fd, budget }));
      } finally { try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
      if (entry.copied.bytes !== Number(entry.stat.size)) throw failure("FAILED_STATE_SOURCE_MUTATED", entry.relative);
      readBack(destination, entry.copied);
    }
    for (const directory of [...outputDirectories].reverse()) syncDirectory(directory);
    const manifest = {
      format: "failed-scanner-state-diagnostic/v1", auditCreatedAt: new Date().toISOString(),
      provenance: { sourceCommit, workflowRun, workflowAttempt, workflowJob, expectedCacheKey,
        matchedRestoreCacheKey: matchedRestoreCacheKey || null, restoreOutcome: restoreOutcome || null,
        canonicalPackOutcome: pack, canonicalCacheSaveOutcome: save,
        originalRecordProvenance: "PRESERVED_IN_RAW_BYTES_NOT_REWRITTEN" },
      selection: { patterns: FAILED_SCANNER_STATE_PATTERNS, missingPatterns, maxFiles: MAX_FILES, rawSizeCapBytes: maxBytes },
      files: files.map(entry => ({ path: entry.relative, ...entry.copied })), rawBytes: budget.used,
      statePresence: files.length ? "SELECTED_RAW_FILES_PRESENT" : "NO_SELECTED_RAW_FILES_PRESENT",
      excludedState: [{ kind: "SQLITE_DATABASES_AND_WAL_FILES", filesSeen: excludedSqliteFiles,
        reason: "LIVE_FILES_ARE_NOT_A_CONSISTENT_BACKUP_USE_EXISTING_EXPORT_ARCHIVE_OR_BACKUP" }],
      purpose: "TEMPORARY_DIAGNOSTIC_TRANSPORT",
      claims: { restartable: false, scoring: false, certification: false, remoteAcknowledged: false, permanentBackup: false },
    };
    const manifestFile = path.join(target, "manifest.json"), manifestDigest = writeJson(manifestFile, manifest);
    const archiveFile = path.join(target, "failed-scanner-state.tar.gz"), archiveFd = fs.openSync(archiveFile, WRITE_FLAGS, 0o444);
    try {
      // Code-owned allowlists plus validated relative names only. No shell,
      // untrusted tar options, TAR_OPTIONS, or payload-sized memory buffers.
      execFileSync("tar", ["-czf", "-", "-C", target, ...files.map(entry => entry.relative), "manifest.json"], {
        stdio: ["ignore", archiveFd, "pipe"], timeout: 10 * 60 * 1000, maxBuffer: 64 * 1024,
        env: { PATH: process.env.PATH, LC_ALL: "C" },
      });
    } finally { try { fs.fsyncSync(archiveFd); } finally { fs.closeSync(archiveFd); } }
    const archiveDigest = readBack(archiveFile);
    const after = selectFiles(sourceRoot, maxBytes);
    if (after.files.map(entry => entry.relative).join("\n") !== files.map(entry => entry.relative).join("\n")) throw failure("FAILED_STATE_SOURCE_MUTATED");
    for (const entry of files) {
      const final = withSource(sourceRoot, parents, entry, fd => scan(fd, { sizeLimit: Number(entry.stat.size) }));
      if (final.bytes !== entry.copied.bytes || final.sha256 !== entry.copied.sha256) throw failure("FAILED_STATE_SOURCE_MUTATED", entry.relative);
      readBack(path.join(target, entry.relative), entry.copied);
    }
    assertParents(sourceRoot, parents);
    readBack(manifestFile, manifestDigest); readBack(archiveFile, archiveDigest);
    const receiptFile = path.join(target, "preservation-receipt.json");
    writeJson(receiptFile, {
      format: "failed-scanner-state-diagnostic-receipt/v1", status: "SUCCESS", auditVerifiedAt: new Date().toISOString(),
      provenance: manifest.provenance, archive: { path: path.basename(archiveFile), ...archiveDigest },
      manifest: { path: "manifest.json", ...manifestDigest }, rawFilesReadbackVerified: true,
      purpose: "TEMPORARY_DIAGNOSTIC_TRANSPORT", restartable: false, permanentBackup: false, remoteAcknowledged: false,
    });
    for (const directory of [...outputDirectories].reverse()) syncDirectory(directory);
    syncDirectory(target); syncDirectory(path.dirname(target));
    return { status: "SUCCESS", preserved: true, outputDir: target, archiveFile, manifestFile, receiptFile,
      fileCount: files.length, rawBytes: budget.used, archiveSha256: archiveDigest.sha256 };
  } catch (error) {
    for (const directory of [...outputDirectories].reverse()) {
      try { syncDirectory(directory); } catch { /* The failure marker still records that this is not a successful export. */ }
    }
    try {
      writeJson(path.join(target, "preservation-failure.json"), {
        format: "failed-scanner-state-diagnostic-failure/v1", status: "FAILED", success: false,
        reason: error.code || "FAILED_STATE_PRESERVATION_FAILED", restartable: false, permanentBackup: false, remoteAcknowledged: false,
      });
      syncDirectory(target); syncDirectory(path.dirname(target));
    } catch (markerError) { error.failureMarkerError = markerError; }
    error.outputDir = target;
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = preserveFailedScannerState({
      root: process.cwd(), outputDir: process.env.FAILED_SCANNER_STATE_DIR,
      packOutcome: process.env.SCANNER_STATE_PACK_OUTCOME, cacheSaveOutcome: process.env.SCANNER_STATE_CACHE_SAVE_OUTCOME,
      sourceCommit: process.env.GITHUB_SHA || null, workflowRun: process.env.GITHUB_RUN_ID || null,
      workflowAttempt: process.env.GITHUB_RUN_ATTEMPT || null, workflowJob: process.env.GITHUB_JOB || null,
      expectedCacheKey: process.env.SCANNER_STATE_EXPECTED_CACHE_KEY || null,
      matchedRestoreCacheKey: process.env.SCANNER_STATE_MATCHED_RESTORE_CACHE_KEY || null,
      restoreOutcome: process.env.SCANNER_STATE_RESTORE_OUTCOME || null,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`Scanner-state diagnostic preservation failed: ${error.code || "FAILED_STATE_PRESERVATION_FAILED"}\n`);
    process.exitCode = 1;
  }
}
