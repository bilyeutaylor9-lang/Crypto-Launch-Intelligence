import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const FORWARD_EVIDENCE_FILES = Object.freeze([
  "data/production-market-observations.jsonl",
  "data/market-context-observations.jsonl",
  "data/prospective-edge-cohorts.jsonl",
]);
const REQUIRED = new Set([FORWARD_EVIDENCE_FILES[0], FORWARD_EVIDENCE_FILES[2]]);
const MAIN_CACHE_PREFIX = "forward-evidence-Linux-main-";
const DEFAULT_CAP = 1024 * 1024 * 1024;
const BUFFER_BYTES = 64 * 1024;
const READ_FLAGS = fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW;
const WRITE_FLAGS = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW;

function failure(code, relative = null) {
  const error = new Error(relative ? `${code}:${relative}` : code);
  error.code = code;
  return error;
}

export function validateForwardCacheSelection({ sourceCacheKey = "", cacheMatchedKey, cacheHit } = {}) {
  const validKey = value => typeof value === "string" && value.length > 0 && value.length <= 512 && value.trim() === value && !/[\x00-\x1f\x7f]/.test(value);
  if (typeof sourceCacheKey !== "string" || (sourceCacheKey !== "" && !validKey(sourceCacheKey))) throw failure("FORWARD_CACHE_INVALID_EXPECTED_KEY");
  if (!validKey(cacheMatchedKey)) throw failure("FORWARD_CACHE_MATCHED_KEY_REQUIRED");
  const exactHit = cacheHit === true || cacheHit === "true";
  if (sourceCacheKey) {
    if (!exactHit || cacheMatchedKey !== sourceCacheKey) throw failure("FORWARD_CACHE_EXACT_MATCH_REQUIRED");
  } else if (!cacheMatchedKey.startsWith(MAIN_CACHE_PREFIX) || cacheMatchedKey.length === MAIN_CACHE_PREFIX.length) {
    throw failure("FORWARD_CACHE_MAIN_PREFIX_REQUIRED");
  }
  return {
    mode: sourceCacheKey ? "EXACT_KEY" : "MAIN_PREFIX",
    expectedKey: sourceCacheKey || null,
    expectedPrefix: sourceCacheKey ? null : MAIN_CACHE_PREFIX,
    matchedKey: cacheMatchedKey,
    cacheHit: exactHit,
  };
}

function sameIdentity(a, b) {
  return a.dev === b.dev && a.ino === b.ino;
}

function sameFile(a, b) {
  return b.isFile() && !b.isSymbolicLink() && sameIdentity(a, b) &&
    a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

function statOrMissing(file) {
  try { return fs.lstatSync(file, { bigint: true }); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

function assertParents(root, parents) {
  for (const [relative, original] of parents) {
    const current = statOrMissing(path.join(root, relative));
    if (!current?.isDirectory() || current.isSymbolicLink() || !sameIdentity(original, current)) {
      throw failure("FORWARD_CACHE_UNSAFE_SOURCE_ANCESTOR", relative || ".");
    }
  }
}

function preflight(root, maxBytes) {
  const parents = new Map();
  for (const relative of ["", "data"]) {
    const stat = statOrMissing(path.join(root, relative));
    if (!stat?.isDirectory() || stat.isSymbolicLink()) throw failure("FORWARD_CACHE_UNSAFE_SOURCE_ANCESTOR", relative || ".");
    parents.set(relative, stat);
  }
  // Inspect every allowlisted file and its aggregate size before opening or
  // reading any payload. Missing context is allowed, but never a special file.
  const sources = FORWARD_EVIDENCE_FILES.map(relative => {
    const file = path.join(root, relative), stat = statOrMissing(file);
    if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw failure("FORWARD_CACHE_UNSAFE_SOURCE", relative);
    return { relative, file, stat, fd: null };
  });
  for (const entry of sources) {
    if (REQUIRED.has(entry.relative) && !entry.stat) throw failure("FORWARD_CACHE_REQUIRED_SOURCE_MISSING", entry.relative);
    if (REQUIRED.has(entry.relative) && entry.stat.size === 0n) throw failure("FORWARD_CACHE_REQUIRED_SOURCE_EMPTY", entry.relative);
  }
  if (sources.reduce((sum, entry) => sum + (entry.stat?.size || 0n), 0n) > BigInt(maxBytes)) throw failure("FORWARD_CACHE_SIZE_CAP_EXCEEDED");
  return { sources, parents };
}

function assertSource(root, parents, entry) {
  assertParents(root, parents);
  const current = statOrMissing(entry.file);
  if (!entry.stat) {
    if (current) throw failure("FORWARD_CACHE_SOURCE_MUTATED", entry.relative);
    return;
  }
  if (!current || !sameFile(entry.stat, current) || (entry.fd !== null && !sameFile(entry.stat, fs.fstatSync(entry.fd, { bigint: true })))) {
    throw failure("FORWARD_CACHE_SOURCE_MUTATED", entry.relative);
  }
}

function writeAll(fd, buffer, length = buffer.length) {
  let offset = 0;
  while (offset < length) {
    const written = fs.writeSync(fd, buffer, offset, length - offset);
    if (!written) throw failure("FORWARD_CACHE_SHORT_WRITE");
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
      if (budget.used > budget.max) throw failure("FORWARD_CACHE_SIZE_CAP_EXCEEDED");
    }
    if (bytes > sizeLimit) throw failure("FORWARD_CACHE_SOURCE_MUTATED");
    hash.update(buffer.subarray(0, count));
    for (let index = 0; index < count; index++) if (buffer[index] === 10) newlines++;
    lastByte = buffer[count - 1];
    if (copyFd !== null) writeAll(copyFd, buffer, count);
  }
  return { bytes, sha256: hash.digest("hex"), lineCount: newlines + Number(bytes > 0 && lastByte !== 10) };
}

function readBack(file, expected) {
  const fd = fs.openSync(file, READ_FLAGS);
  try {
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile() || (expected && before.size !== BigInt(expected.bytes))) throw failure("FORWARD_CACHE_READBACK_MISMATCH");
    const result = scan(fd, { sizeLimit: Number(before.size) });
    if (!sameFile(before, fs.fstatSync(fd, { bigint: true })) || (expected && result.sha256 !== expected.sha256)) throw failure("FORWARD_CACHE_READBACK_MISMATCH");
    return result;
  } finally { fs.closeSync(fd); }
}

function syncDirectory(directory) {
  const fd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try { if (!fs.fstatSync(fd).isDirectory()) throw failure("FORWARD_CACHE_UNSAFE_OUTPUT"); fs.fsyncSync(fd); }
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

function createNewDirectory(outputDir) {
  if (typeof outputDir !== "string" || !path.isAbsolute(outputDir)) throw failure("FORWARD_CACHE_OUTPUT_MUST_BE_NEW_ABSOLUTE_DIRECTORY");
  const target = path.join(fs.realpathSync(path.dirname(outputDir)), path.basename(outputDir));
  fs.mkdirSync(target, { mode: 0o700 }); // Exclusive; never reuse or remove an existing directory.
  return target;
}

export function exportForwardEvidenceCache({ root = process.cwd(), outputDir, sourceCacheKey = "", cacheMatchedKey, cacheHit,
  sourceCommit = null, workflowRun = null, maxBytes = DEFAULT_CAP } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError("Invalid forward-cache size cap");
  const sourceRoot = fs.realpathSync(root), target = createNewDirectory(outputDir);
  let sources = [];
  try {
    syncDirectory(path.dirname(target));
    const cacheSelection = validateForwardCacheSelection({ sourceCacheKey, cacheMatchedKey, cacheHit });
    const checked = preflight(sourceRoot, maxBytes);
    sources = checked.sources;
    const { parents } = checked, present = sources.filter(entry => entry.stat);
    // Open and fstat every source before the first read; O_NOFOLLOW plus inode
    // checks also detect a file/ancestor replacement between lstat and open.
    for (const entry of present) {
      assertSource(sourceRoot, parents, entry);
      entry.fd = fs.openSync(entry.file, READ_FLAGS);
      assertSource(sourceRoot, parents, entry);
    }
    fs.mkdirSync(path.join(target, "data"), { mode: 0o700 });
    syncDirectory(target);
    const budget = { used: 0, max: maxBytes };
    for (const entry of present) {
      assertSource(sourceRoot, parents, entry);
      const destination = path.join(target, entry.relative), fd = fs.openSync(destination, WRITE_FLAGS, 0o444);
      try {
        entry.copied = scan(entry.fd, { sizeLimit: Number(entry.stat.size), copyFd: fd, budget });
      } finally { try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
      assertSource(sourceRoot, parents, entry);
      if (entry.copied.bytes !== Number(entry.stat.size)) throw failure("FORWARD_CACHE_SOURCE_MUTATED", entry.relative);
      readBack(destination, entry.copied);
    }
    syncDirectory(path.join(target, "data"));
    const manifest = {
      format: "forward-evidence-cache-export/v1",
      provenance: { exporterCodeCommit: sourceCommit, exporterWorkflowRun: workflowRun, cacheSelection,
        originalRecordProvenance: "PRESERVED_IN_RAW_BYTES_NOT_REWRITTEN", originalProducerCommitInferred: false },
      files: present.map(entry => ({ path: entry.relative, ...entry.copied })),
      missingFiles: sources.filter(entry => !entry.stat).map(entry => entry.relative),
      rawBytes: budget.used,
      purpose: "TEMPORARY_DIAGNOSTIC_TRANSPORT",
      claims: { scoring: false, certification: false, remoteAcknowledged: false, permanentBackup: false },
    };
    const manifestFile = path.join(target, "manifest.json"), manifestDigest = writeJson(manifestFile, manifest);
    const archiveFile = path.join(target, "forward-evidence-cache.tar.gz"), archiveFd = fs.openSync(archiveFile, WRITE_FLAGS, 0o444);
    try {
      // Only fixed allowlisted member names become arguments. Tar writes gzip
      // directly into an exclusive descriptor, with no shell or payload buffer.
      execFileSync("tar", ["-czf", "-", "-C", target, ...present.map(entry => entry.relative), "manifest.json"], {
        stdio: ["ignore", archiveFd, "pipe"], timeout: 10 * 60 * 1000, maxBuffer: 64 * 1024,
        env: { PATH: process.env.PATH, LC_ALL: "C" },
      });
    } finally { try { fs.fsyncSync(archiveFd); } finally { fs.closeSync(archiveFd); } }
    const archiveDigest = readBack(archiveFile);
    // Recheck ALL source bytes, descriptors, directory identities and missing
    // files after packaging. Preserve partial output if any check fails.
    for (const entry of sources) {
      assertSource(sourceRoot, parents, entry);
      if (entry.stat) {
        const final = scan(entry.fd, { sizeLimit: Number(entry.stat.size) });
        if (final.bytes !== entry.copied.bytes || final.sha256 !== entry.copied.sha256) throw failure("FORWARD_CACHE_SOURCE_MUTATED", entry.relative);
        assertSource(sourceRoot, parents, entry);
        readBack(path.join(target, entry.relative), entry.copied);
      }
    }
    readBack(manifestFile, manifestDigest);
    readBack(archiveFile, archiveDigest);
    const receiptFile = path.join(target, "export-receipt.json");
    writeJson(receiptFile, {
      format: "forward-evidence-cache-export-receipt/v1", status: "SUCCESS",
      provenance: manifest.provenance, archive: { path: path.basename(archiveFile), ...archiveDigest },
      manifest: { path: "manifest.json", ...manifestDigest }, rawFilesReadbackVerified: true,
      purpose: "TEMPORARY_DIAGNOSTIC_TRANSPORT", permanentBackup: false, remoteAcknowledged: false,
    });
    syncDirectory(path.join(target, "data")); syncDirectory(target); syncDirectory(path.dirname(target));
    return { status: "SUCCESS", outputDir: target, archiveFile, manifestFile, receiptFile, archiveSha256: archiveDigest.sha256 };
  } catch (error) {
    // Failed exports are retained for diagnosis, never declared/uploaded as a
    // successful transport. Do not erase evidence of a partial copy or tar.
    try {
      const dataDirectory = statOrMissing(path.join(target, "data"));
      if (dataDirectory?.isDirectory() && !dataDirectory.isSymbolicLink()) syncDirectory(path.join(target, "data"));
    } catch (syncError) { error.partialSyncError = syncError; }
    try {
      writeJson(path.join(target, "export-failure.json"), {
        format: "forward-evidence-cache-export-failure/v1", status: "FAILED", success: false,
        reason: error.code || "FORWARD_CACHE_EXPORT_FAILED", permanentBackup: false, remoteAcknowledged: false,
      });
    } catch (markerError) { error.failureMarkerError = markerError; }
    error.outputDir = target;
    throw error;
  } finally {
    for (const entry of sources) if (entry.fd !== null) fs.closeSync(entry.fd);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = exportForwardEvidenceCache({
      root: process.cwd(), outputDir: process.env.FORWARD_CACHE_EXPORT_DIR,
      sourceCacheKey: process.env.FORWARD_CACHE_SOURCE_KEY || "",
      cacheMatchedKey: process.env.FORWARD_CACHE_MATCHED_KEY, cacheHit: process.env.FORWARD_CACHE_HIT,
      sourceCommit: process.env.GITHUB_SHA || null, workflowRun: process.env.GITHUB_RUN_ID || null,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`Forward cache export failed: ${error.code || "FORWARD_CACHE_EXPORT_FAILED"}\n`);
    process.exitCode = 1;
  }
}
