import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { writeAtomicJson } from "../production/atomicArtifactStore.js";
import { openDurableEvidenceArchive } from "../archive/durableEvidenceArchive.js";

export const SCANNER_STATE_BUNDLE_FILE = ".state/scanner-learning-bundle.json.gz";
const BUNDLE_V2_MAGIC = Buffer.from("CLI_SCANNER_STATE_V2\0", "utf8");
const BUNDLE_V3_MAGIC = Buffer.from("CLI_SCANNER_STATE_V3\0", "utf8");
const COPY_CHUNK_BYTES = 1024 * 1024;
const DEFAULT_RESTART_TARGET_BYTES = 128 * 1024 * 1024;
// Keep the full append-only evidence state available to the next run while
// leaving a bounded guard against an accidentally unbounded cache artifact.
const DEFAULT_MAX_UNCOMPRESSED_BYTES = 768 * 1024 * 1024;
export const SCANNER_STATE_PATTERNS = Object.freeze([
  "data/*memory*.json*",
  "data/scan-history.json*",
  "data/wallet-participation-history.jsonl",
  "data/market-opportunity-learning.json*",
  "data/outcome-snapshots.json*",
  "data/point-in-time-observations.json*",
  "data/security-evidence-cache.json",
  "data/project-observations.jsonl",
  "data/project-watchlist.json*",
  "data/research-coverage-ledger.json*",
  "data/source-router-memory.json*",
  "data/universe-ledger.json*",
  "data/watchtower-*.json*",
  "data/edge-production-episodes.jsonl",
  "data/edge-evidence-outcomes.jsonl",
  "data/edge-fast-outcomes.jsonl",
  "data/committed-loaded-vacuum-observations.jsonl",
  "data/capital-commitment-episodes.jsonl",
  "data/capital-path-learning-observations.jsonl",
  "data/chain-capital-radar-observations.jsonl",
  "data/edge-candidate-universe.json",
  "data/prospective-entry-edge-episodes.jsonl",
  "data/asymmetric-edge-observations.jsonl",
  "data/asymmetric-edge-outcomes.json*",
  "data/asymmetric-edge-quarantine.jsonl",
  "data/three-clock-edge-observations.jsonl",
  "data/wallet-temporal-fingerprints.jsonl",
  "data/ignition-twin-observations.jsonl",
  "data/committed-loaded-vacuum-replication-plan.json",
  "data/ignition-executable-edge-canary-replays.jsonl",
  "data/ignition-executable-edge-canary-tickets.jsonl",
  "data/ignition-executable-edge-canary-policy.json",
  "data/native-discovery/raw-events.json",
  "data/native-discovery/confirmed-events.json",
  "data/native-discovery/checkpoints.json",
]);

export const SCANNER_STATE_ARCHIVE_PATTERNS = Object.freeze([
  "data/*.jsonl",
  "data/scan-history.json*",
  "data/universe-ledger.json*",
  "data/outcome-snapshots.json*",
  "data/point-in-time-observations.json*",
  "data/asymmetric-edge-outcomes.json*",
  "data/native-discovery/raw-events.json",
  "data/native-discovery/confirmed-events.json",
]);

function syncDirectory(directory) {
  const fd = fs.openSync(directory, "r");
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function temporaryFile(target, label) {
  return `${target}.${process.pid}.${Date.now()}.${label}.tmp`;
}

function closeQuietly(fd) {
  if (Number.isInteger(fd)) fs.closeSync(fd);
}

function removeQuietly(file) {
  try { fs.unlinkSync(file); } catch { /* Temporary bundle cleanup is best effort. */ }
}

function requireSuccessfulGzip(args, outputFile, operation) {
  const output = fs.openSync(outputFile, "w", 0o600);
  try {
    const result = spawnSync("gzip", args, {
      stdio: ["ignore", output, "pipe"],
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`${operation} failed: ${String(result.stderr || "gzip exited unsuccessfully").trim()}`);
    }
    fs.fsyncSync(output);
  } finally {
    closeQuietly(output);
  }
}

function writeBuffer(fd, buffer, position) {
  let offset = 0;
  while (offset < buffer.length) {
    const written = fs.writeSync(fd, buffer, offset, buffer.length - offset, position + offset);
    if (written <= 0) throw new Error("Unable to write scanner-state bundle.");
    offset += written;
  }
  return position + buffer.length;
}

function copyFileToFd(source, targetFd, position) {
  const sourceFd = fs.openSync(source, "r");
  const chunk = Buffer.allocUnsafe(COPY_CHUNK_BYTES);
  let sourcePosition = 0;
  let destinationPosition = position;
  try {
    while (true) {
      const bytesRead = fs.readSync(sourceFd, chunk, 0, chunk.length, sourcePosition);
      if (!bytesRead) break;
      destinationPosition = writeBuffer(targetFd, chunk.subarray(0, bytesRead), destinationPosition);
      sourcePosition += bytesRead;
    }
  } finally {
    closeQuietly(sourceFd);
  }
  return destinationPosition;
}

function copyFileRange(source, start, bytes, destination) {
  const sourceFd = fs.openSync(source, "r");
  const destinationFd = fs.openSync(destination, "w", 0o600);
  const chunk = Buffer.allocUnsafe(COPY_CHUNK_BYTES);
  let sourcePosition = start;
  let remaining = bytes;
  try {
    while (remaining > 0) {
      const bytesRead = fs.readSync(sourceFd, chunk, 0, Math.min(chunk.length, remaining), sourcePosition);
      if (!bytesRead) throw new Error("Scanner-state bundle ended before a file was fully restored.");
      writeBuffer(destinationFd, chunk.subarray(0, bytesRead), bytes - remaining);
      sourcePosition += bytesRead;
      remaining -= bytesRead;
    }
    fs.fsyncSync(destinationFd);
  } finally {
    closeQuietly(sourceFd);
    closeQuietly(destinationFd);
  }
}

function hashFileRange(source, start, bytes) {
  const sourceFd = fs.openSync(source, "r");
  const digest = crypto.createHash("sha256");
  const chunk = Buffer.allocUnsafe(COPY_CHUNK_BYTES);
  let sourcePosition = start;
  let remaining = bytes;
  try {
    while (remaining > 0) {
      const bytesRead = fs.readSync(sourceFd, chunk, 0, Math.min(chunk.length, remaining), sourcePosition);
      if (!bytesRead) throw new Error("Scanner-state bundle ended before its declared file length.");
      digest.update(chunk.subarray(0, bytesRead));
      sourcePosition += bytesRead;
      remaining -= bytesRead;
    }
  } finally {
    closeQuietly(sourceFd);
  }
  return digest.digest("hex");
}

function safeRelativeFile(value) {
  const normalized = String(value || "").replaceAll("\\", "/");
  if (!normalized.startsWith("data/") || path.posix.normalize(normalized) !== normalized) {
    throw new Error(`Unsafe scanner-state path: ${value}`);
  }
  if (normalized.includes("\0") || normalized.endsWith("/")) {
    throw new Error(`Invalid scanner-state path: ${value}`);
  }
  return normalized;
}

function resolveInsideRoot(root, relative) {
  const safe = safeRelativeFile(relative);
  const absolute = path.resolve(root, safe);
  const dataRoot = `${path.resolve(root, "data")}${path.sep}`;
  if (!absolute.startsWith(dataRoot)) throw new Error(`Scanner-state path escaped data/: ${relative}`);
  let cursor = path.resolve(root, "data");
  for (const segment of safe.split("/").slice(1)) {
    if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`Scanner-state path crosses a symbolic link: ${relative}`);
    }
    cursor = path.join(cursor, segment);
  }
  if (fs.existsSync(cursor) && fs.lstatSync(cursor).isSymbolicLink()) {
    throw new Error(`Scanner-state path is a symbolic link: ${relative}`);
  }
  return absolute;
}

function expandFiles(root, patterns = SCANNER_STATE_PATTERNS) {
  const files = new Set();
  for (const pattern of patterns) {
    for (const relative of fs.globSync(pattern, { cwd: root, withFileTypes: false })) {
      const safe = safeRelativeFile(relative);
      const absolute = resolveInsideRoot(root, safe);
      if (fs.statSync(absolute).isFile()) files.add(safe);
    }
  }
  return [...files].sort();
}

function readLegacyBundle(file) {
  const decoded = JSON.parse(fs.readFileSync(file, "utf8"));
  if (decoded?.schemaVersion !== 1 || !Array.isArray(decoded.files)) {
    throw new Error("Unsupported or malformed scanner-state bundle.");
  }
  return decoded;
}

function readStreamedBundle(rawFile) {
  const fd = fs.openSync(rawFile, "r");
  try {
    const header = Buffer.alloc(BUNDLE_V2_MAGIC.length + 4);
    const bytesRead = fs.readSync(fd, header, 0, header.length, 0);
    const magic = header.subarray(0, BUNDLE_V2_MAGIC.length);
    const schemaVersion = magic.equals(BUNDLE_V3_MAGIC) ? 3 : magic.equals(BUNDLE_V2_MAGIC) ? 2 : null;
    if (bytesRead !== header.length || schemaVersion === null) {
      return null;
    }
    const manifestBytes = header.readUInt32BE(BUNDLE_V2_MAGIC.length);
    if (!manifestBytes || manifestBytes > 16 * 1024 * 1024) {
      throw new Error("Scanner-state V2 manifest is missing or too large.");
    }
    const manifestPayload = Buffer.alloc(manifestBytes);
    const manifestRead = fs.readSync(fd, manifestPayload, 0, manifestBytes, header.length);
    if (manifestRead !== manifestBytes) throw new Error("Scanner-state V2 manifest was truncated.");
    const manifest = JSON.parse(manifestPayload.toString("utf8"));
    if (manifest?.schemaVersion !== schemaVersion || !Array.isArray(manifest.files)) {
      throw new Error("Unsupported or malformed scanner-state V2 bundle.");
    }
    return {
      schemaVersion,
      manifest,
      contentOffset: header.length + manifestBytes,
    };
  } finally {
    closeQuietly(fd);
  }
}

function openBundle(bundleFile) {
  const rawFile = temporaryFile(bundleFile, "decompressed");
  try {
    requireSuccessfulGzip(["-d", "-c", bundleFile], rawFile, "Scanner-state decompression");
    const rawBytes = fs.statSync(rawFile).size;
    if (rawBytes > DEFAULT_MAX_UNCOMPRESSED_BYTES) throw new Error("Scanner-state decompression exceeds the 768 MiB hard limit.");
    const v2 = readStreamedBundle(rawFile);
    if (v2) {
      if (v2.schemaVersion === 3 && rawBytes > DEFAULT_RESTART_TARGET_BYTES) throw new Error("Archive-backed restart exceeds the 128 MiB target.");
      return {
        format: v2.schemaVersion === 3 ? "V3_ARCHIVE_REFERENCES" : "V2_STREAMED",
        rawFile,
        bundle: v2.manifest,
        contentOffset: v2.contentOffset,
      };
    }
    const legacy = readLegacyBundle(rawFile);
    removeQuietly(rawFile);
    return { format: "V1_JSON", rawFile: null, bundle: legacy, contentOffset: null };
  } catch (error) {
    removeQuietly(rawFile);
    throw error;
  }
}

function closeBundle(opened) {
  if (opened?.rawFile) removeQuietly(opened.rawFile);
}

function validateBundle(bundle, root) {
  const seen = new Set();
  const validated = [];
  for (const entry of bundle.files) {
    const relative = safeRelativeFile(entry?.path);
    if (seen.has(relative)) throw new Error(`Duplicate scanner-state entry: ${relative}`);
    seen.add(relative);
    const content = Buffer.from(String(entry?.contentBase64 || ""), "base64");
    if (content.length !== Number(entry?.bytes) || sha256(content) !== entry?.sha256) {
      throw new Error(`Scanner-state integrity check failed: ${relative}`);
    }
    validated.push({ relative, absolute: resolveInsideRoot(root, relative), content });
  }
  if (bundle.fileCount !== validated.length) throw new Error("Scanner-state manifest file count mismatch.");
  return validated;
}

function validateStreamedBundle(bundle, root, rawFile, contentOffset) {
  const seen = new Set();
  const validated = [];
  const rawSize = fs.statSync(rawFile).size;
  let offset = contentOffset;
  for (const entry of bundle.files) {
    const relative = safeRelativeFile(entry?.path);
    const bytes = Number(entry?.bytes);
    if (seen.has(relative)) throw new Error(`Duplicate scanner-state entry: ${relative}`);
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw new Error(`Invalid scanner-state byte count: ${relative}`);
    }
    if (!/^[a-f0-9]{64}$/i.test(String(entry?.sha256 || ""))) {
      throw new Error(`Invalid scanner-state checksum: ${relative}`);
    }
    if (offset + bytes > rawSize) throw new Error(`Scanner-state V2 file was truncated: ${relative}`);
    if (hashFileRange(rawFile, offset, bytes) !== entry.sha256) {
      throw new Error(`Scanner-state integrity check failed: ${relative}`);
    }
    seen.add(relative);
    validated.push({ relative, absolute: resolveInsideRoot(root, relative), bytes, offset, sha256: entry.sha256 });
    offset += bytes;
  }
  if (bundle.fileCount !== validated.length || offset !== rawSize) {
    throw new Error("Scanner-state V2 manifest file count or content length mismatch.");
  }
  return validated;
}

function hashFile(file) {
  return hashFileRange(file, 0, fs.statSync(file).size);
}

function archiveStateEntries(archiveRoot, entries) {
  const store = openDurableEvidenceArchive({ root: archiveRoot });
  try {
    return entries.map((entry) => {
      const bytes = fs.readFileSync(entry.absolute);
      if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error("Scanner-state source changed during archival: " + entry.path);
      const admitted = store.admitPrediction({
        recordId: "scanner-state-file:" + sha256(entry.path) + ":" + entry.sha256,
        rawBytes: bytes, frozenObligations: [],
        immutableContract: { kind: "SCANNER_STATE_FILE_V1", relativePath: entry.path, sha256: entry.sha256, verificationScope: "FILE_BYTES_ONLY" },
        missingness: { sourceObservedAt: null, providerConfidence: null }, cohortMetadata: null,
      });
      return { path: entry.path, bytes: entry.bytes, sha256: entry.sha256, recordId: admitted.recordId, admissionHash: admitted.admissionHash };
    });
  } finally { store.close(); }
}

function readArchiveReference(store, reference) {
  const evidence = store.readEvidence(reference.recordId);
  if (!evidence || evidence.contentHash !== reference.sha256 || evidence.admissionHash !== reference.admissionHash ||
    evidence.rawBytes.length !== reference.bytes || evidence.immutableContract?.kind !== "SCANNER_STATE_FILE_V1" ||
    evidence.immutableContract?.relativePath !== reference.path || evidence.immutableContract?.sha256 !== reference.sha256) {
    throw new Error("SCANNER_STATE_ARCHIVE_REFERENCE_MISMATCH:" + reference.path);
  }
  return evidence.rawBytes;
}

function withArchiveReferences(bundle, root, archiveRoot, callback) {
  const references = bundle.archiveReferences;
  if (bundle.schemaVersion !== 3) {
    if (references !== undefined) throw new Error("SCANNER_STATE_UNSUPPORTED_ARCHIVE_REFERENCES");
    return callback([], null);
  }
  if (!Array.isArray(references) || bundle.archiveReferenceCount !== references.length) throw new Error("SCANNER_STATE_ARCHIVE_MANIFEST_INVALID");
  if (!bundle.files.some(entry => entry.path === "data/edge-candidate-universe.json")) throw new Error("SCANNER_STATE_EXACT_UNIVERSE_REQUIRED");
  const seen = new Set(bundle.files.map(entry => entry.path));
  const validated = references.map((reference) => {
    const relative = safeRelativeFile(reference?.path);
    if (seen.has(relative) || relative === "data/edge-candidate-universe.json") throw new Error("SCANNER_STATE_ARCHIVE_DUPLICATE_PATH:" + relative);
    seen.add(relative);
    if (!Number.isSafeInteger(reference.bytes) || reference.bytes < 0 || typeof reference.recordId !== "string" || !reference.recordId ||
      !/^[a-f0-9]{64}$/.test(reference.sha256) || !/^[a-f0-9]{64}$/.test(reference.admissionHash)) throw new Error("SCANNER_STATE_ARCHIVE_MANIFEST_INVALID");
    return { ...reference, relative, absolute: resolveInsideRoot(root, relative) };
  });
  if (!validated.length) return callback([], null);
  if (typeof archiveRoot !== "string" || !archiveRoot.trim()) throw new Error("SCANNER_STATE_ARCHIVE_REQUIRED");
  const permanent = path.resolve(archiveRoot);
  const index = path.join(permanent, "archive.sqlite");
  if (!fs.existsSync(index) || !fs.lstatSync(index).isFile()) throw new Error("SCANNER_STATE_ARCHIVE_MISSING:" + permanent);
  const store = openDurableEvidenceArchive({ root: permanent });
  try {
    for (const reference of validated) readArchiveReference(store, reference);
    return callback(validated, store);
  } finally { store.close(); }
}

function restoreArchivedState(opened, hot, references, store, root) {
  const stateDir = path.join(root, ".state");
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const staging = fs.mkdtempSync(path.join(stateDir, "archive-restore-"));
  const entries = [...hot.map(entry => ({ ...entry, archived: false })), ...references.map(entry => ({ ...entry, archived: true }))];
  const sameLocalFile = (entry) => {
    const absolute = resolveInsideRoot(root, entry.relative);
    if (!fs.existsSync(absolute)) return false;
    if (!fs.lstatSync(absolute).isFile() || fs.statSync(absolute).size !== entry.bytes || hashFile(absolute) !== entry.sha256) throw new Error("SCANNER_STATE_LOCAL_CONFLICT:" + entry.relative);
    return true;
  };
  try {
    for (const entry of entries) {
      const staged = resolveInsideRoot(staging, entry.relative);
      fs.mkdirSync(path.dirname(staged), { recursive: true, mode: 0o700 });
      if (entry.archived) {
        const bytes = readArchiveReference(store, entry);
        const fd = fs.openSync(staged, "wx", 0o600);
        try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      } else copyFileRange(opened.rawFile, entry.offset, entry.bytes, staged);
      if (hashFile(staged) !== entry.sha256) throw new Error("SCANNER_STATE_STAGING_INTEGRITY_FAILED:" + entry.relative);
    }
    for (const entry of entries) sameLocalFile(entry);
    let restored = 0, alreadyPresent = 0, archiveReferencesRestored = 0;
    for (const entry of entries) {
      if (sameLocalFile(entry)) { alreadyPresent++; continue; }
      const absolute = resolveInsideRoot(root, entry.relative);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      resolveInsideRoot(root, entry.relative);
      try { fs.linkSync(resolveInsideRoot(staging, entry.relative), absolute); } catch (error) {
        if (error.code !== "EEXIST") throw error;
        if (sameLocalFile(entry)) { alreadyPresent++; continue; }
        throw error;
      }
      syncDirectory(path.dirname(absolute));
      restored++;
      if (entry.archived) archiveReferencesRestored++;
    }
    fs.rmSync(staging, { recursive: true });
    return { restored, alreadyPresent, archiveReferencesRestored };
  } catch (error) {
    error.recoveryDirectory = staging;
    throw error;
  }
}

function createStreamedBundle(bundleFile, bundle, entries, root, maximumUncompressedBytes, validateSources) {
  const manifestPayload = Buffer.from(`${JSON.stringify(bundle)}\n`, "utf8");
  if (manifestPayload.length > 0xffff_ffff) throw new Error("Scanner-state manifest exceeds V2 size limit.");

  const rawFile = temporaryFile(bundleFile, "raw");
  const compressedFile = temporaryFile(bundleFile, "compressed");
  let rawFd = null;
  try {
    rawFd = fs.openSync(rawFile, "w", 0o600);
    const header = Buffer.alloc(BUNDLE_V2_MAGIC.length + 4);
    (bundle.schemaVersion === 3 ? BUNDLE_V3_MAGIC : BUNDLE_V2_MAGIC).copy(header);
    header.writeUInt32BE(manifestPayload.length, BUNDLE_V2_MAGIC.length);
    let position = writeBuffer(rawFd, header, 0);
    position = writeBuffer(rawFd, manifestPayload, position);
    for (const entry of entries) position = copyFileToFd(entry.absolute, rawFd, position);
    fs.fsyncSync(rawFd);
    closeQuietly(rawFd);
    rawFd = null;
    if (position > maximumUncompressedBytes) throw new Error("Refusing to publish scanner state above the " + maximumUncompressedBytes + "-byte limit: " + position + " bytes.");
    validateStreamedBundle(bundle, root, rawFile, header.length + manifestPayload.length);
    validateSources();
    requireSuccessfulGzip(["-1", "-n", "-c", rawFile], compressedFile, "Scanner-state compression");
    validateSources();
    fs.renameSync(compressedFile, bundleFile);
    syncDirectory(path.dirname(bundleFile));
    return {
      uncompressedBytes: position,
      compressedBytes: fs.statSync(bundleFile).size,
      sha256: hashFile(bundleFile),
    };
  } finally {
    closeQuietly(rawFd);
    removeQuietly(rawFile);
    removeQuietly(compressedFile);
  }
}

export function packScannerState(options = {}) {
  const root = path.resolve(options.root || ".");
  const bundleFile = path.resolve(root, options.bundleFile || SCANNER_STATE_BUNDLE_FILE);
  const useArchive = options.archiveRoot !== undefined && options.archiveRoot !== null;
  if (useArchive && (typeof options.archiveRoot !== "string" || !options.archiveRoot.trim())) throw new Error("SCANNER_STATE_ARCHIVE_ROOT_INVALID");
  const permanentFiles = useArchive ? expandFiles(root, SCANNER_STATE_ARCHIVE_PATTERNS) : [];
  const coldFiles = new Set(permanentFiles.filter(file => file !== "data/edge-candidate-universe.json"));
  const files = [...new Set([...expandFiles(root, options.patterns || SCANNER_STATE_PATTERNS), ...permanentFiles])].sort();
  const entries = files.map((relative) => {
    const absolute = resolveInsideRoot(root, relative);
    return {
      path: relative,
      absolute,
      bytes: fs.statSync(absolute).size,
      sha256: hashFile(absolute),
    };
  });
  const candidateUniverse = entries.find((entry) => entry.path === "data/edge-candidate-universe.json");
  if ((useArchive || options.requireExactUniverse) && !candidateUniverse) {
    throw new Error("Refusing to publish scanner state without data/edge-candidate-universe.json; the latest exact universe is required.");
  }
  let maximumUncompressedBytes = Number(
    options.maxUncompressedBytes ??
      process.env.SCANNER_STATE_MAX_UNCOMPRESSED_BYTES ??
      DEFAULT_MAX_UNCOMPRESSED_BYTES
  );
  if (!Number.isSafeInteger(maximumUncompressedBytes) || maximumUncompressedBytes <= 0) {
    throw new Error("SCANNER_STATE_MAX_UNCOMPRESSED_BYTES must be a positive integer.");
  }
  if (maximumUncompressedBytes > DEFAULT_MAX_UNCOMPRESSED_BYTES) throw new Error("SCANNER_STATE_MAX_UNCOMPRESSED_BYTES cannot exceed the 768 MiB hard limit.");
  if (useArchive) {
    const target = options.maxRestartBytes ?? DEFAULT_RESTART_TARGET_BYTES;
    if (!Number.isSafeInteger(target) || target <= 0 || target > DEFAULT_RESTART_TARGET_BYTES) throw new Error("Restart target must be positive and cannot exceed 128 MiB.");
    maximumUncompressedBytes = Math.min(maximumUncompressedBytes, DEFAULT_MAX_UNCOMPRESSED_BYTES, target);
  }
  const archived = entries.filter(entry => coldFiles.has(entry.path));
  const hot = entries.filter(entry => !coldFiles.has(entry.path));
  const uncompressedBytes = hot.reduce((total, entry) => total + entry.bytes, 0);
  if (uncompressedBytes > maximumUncompressedBytes) {
    throw new Error(
      `Refusing to publish scanner state above the ${maximumUncompressedBytes}-byte limit: ${uncompressedBytes} bytes.`
    );
  }
  const bundle = {
    schemaVersion: useArchive ? 3 : 2,
    generatedAt: options.now || new Date().toISOString(),
    codeCommitSha: options.codeCommitSha ?? process.env.GITHUB_SHA ?? null,
    scanRunId: options.scanRunId ?? process.env.GITHUB_RUN_ID ?? null,
    fileCount: hot.length,
    files: hot.map(({ absolute, ...entry }) => entry),
    ...(useArchive ? { archiveReferenceCount: archived.length, archiveReferences: archiveStateEntries(options.archiveRoot, archived) } : {}),
  };
  fs.mkdirSync(path.dirname(bundleFile), { recursive: true });
  const validateSources = () => {
    for (const entry of entries) {
      if (fs.statSync(entry.absolute).size !== entry.bytes || hashFile(entry.absolute) !== entry.sha256) throw new Error("Scanner-state source changed during packing: " + entry.path);
    }
  };
  const archive = createStreamedBundle(bundleFile, bundle, hot, root, maximumUncompressedBytes, validateSources);
  const report = {
    schemaVersion: bundle.schemaVersion,
    generatedAt: bundle.generatedAt,
    state: "SCANNER_STATE_PACKED",
    format: useArchive ? "V3_ARCHIVE_REFERENCES" : "V2_STREAMED",
    bundleFile: path.relative(root, bundleFile),
    fileCount: hot.length,
    uncompressedBytes: archive.uncompressedBytes,
    compressedBytes: archive.compressedBytes,
    sha256: archive.sha256,
    exactUniverseIncluded: Boolean(candidateUniverse),
    ...(useArchive ? { archiveReferenceCount: archived.length, archivedEvidenceBytes: archived.reduce((sum, entry) => sum + entry.bytes, 0),
      requiresPermanentArchive: archived.length > 0, archiveReferencesVerified: true, maximumRestartBytes: maximumUncompressedBytes,
      legacyCollectorReplaced: false, archiveTaskQueueMigrated: false } : {}),
  };
  if (options.writeReport !== false) writeAtomicJson(path.join(root, "reports/scanner-state-bundle.json"), report);
  return report;
}

export function restoreScannerState(options = {}) {
  const root = path.resolve(options.root || ".");
  const bundleFile = path.resolve(root, options.bundleFile || SCANNER_STATE_BUNDLE_FILE);
  if (!fs.existsSync(bundleFile)) {
    return { schemaVersion: 1, state: "SCANNER_STATE_NOT_FOUND", restored: 0, bundleFile: path.relative(root, bundleFile) };
  }
  const opened = openBundle(bundleFile);
  try {
    const entries = opened.format !== "V1_JSON"
      ? validateStreamedBundle(opened.bundle, root, opened.rawFile, opened.contentOffset)
      : validateBundle(opened.bundle, root);
    const archiveRestore = withArchiveReferences(opened.bundle, root, options.archiveRoot, (references, store) => {
      if (opened.bundle.schemaVersion === 3) return restoreArchivedState(opened, entries, references, store, root);
      for (const entry of entries) {
        fs.mkdirSync(path.dirname(entry.absolute), { recursive: true });
        const temp = temporaryFile(entry.absolute, "restore");
        if (opened.format === "V2_STREAMED") copyFileRange(opened.rawFile, entry.offset, entry.bytes, temp);
        else fs.writeFileSync(temp, entry.content);
        fs.renameSync(temp, entry.absolute);
      }
      return null;
    });
    const report = {
      schemaVersion: opened.bundle.schemaVersion === 3 ? 3 : 2,
      generatedAt: new Date().toISOString(),
      state: "SCANNER_STATE_RESTORED",
      format: opened.format,
      restored: archiveRestore?.restored ?? entries.length,
      ...(archiveRestore || {}),
      sourceGeneratedAt: opened.bundle.generatedAt || null,
      sourceCodeCommitSha: opened.bundle.codeCommitSha || null,
      exactUniverseIncluded: entries.some((entry) => entry.relative === "data/edge-candidate-universe.json"),
      ...(opened.bundle.schemaVersion === 3 ? { archiveReferencesVerified: true, archiveTaskQueueMigrated: false } : {}),
    };
    if (options.writeReport !== false) writeAtomicJson(path.join(root, "reports/scanner-state-restore.json"), report);
    return report;
  } finally {
    closeBundle(opened);
  }
}

export function inspectScannerState(options = {}) {
  const root = path.resolve(options.root || ".");
  const bundleFile = path.resolve(root, options.bundleFile || SCANNER_STATE_BUNDLE_FILE);
  if (!fs.existsSync(bundleFile)) return { state: "SCANNER_STATE_NOT_FOUND", valid: false };
  const opened = openBundle(bundleFile);
  try {
    const entries = opened.format !== "V1_JSON"
      ? validateStreamedBundle(opened.bundle, root, opened.rawFile, opened.contentOffset)
      : validateBundle(opened.bundle, root);
    const archiveReferenceCount = withArchiveReferences(opened.bundle, root, options.archiveRoot, references => references.length);
    return {
      state: "SCANNER_STATE_VALID",
      valid: true,
      format: opened.format,
      generatedAt: opened.bundle.generatedAt || null,
      codeCommitSha: opened.bundle.codeCommitSha || null,
      fileCount: entries.length,
      exactUniverseIncluded: entries.some((entry) => entry.relative === "data/edge-candidate-universe.json"),
      ...(opened.bundle.schemaVersion === 3 ? { archiveReferenceCount, archiveReferencesVerified: true } : {}),
    };
  } finally {
    closeBundle(opened);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] || "inspect";
  try {
    const archiveRoot = process.env.SCANNER_STATE_ARCHIVE_ROOT;
    const archiveOptions = archiveRoot ? { archiveRoot } : {};
    const result = command === "pack"
      ? packScannerState({ ...archiveOptions, requireExactUniverse: process.argv.includes("--require-exact-universe") })
      : command === "restore"
        ? restoreScannerState(archiveOptions)
        : inspectScannerState(archiveOptions);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 2;
  }
}

export const __scannerStateBundleHooks = { sha256, safeRelativeFile, resolveInsideRoot, validateBundle };
