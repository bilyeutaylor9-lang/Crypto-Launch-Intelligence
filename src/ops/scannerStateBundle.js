import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { writeAtomicJson } from "../production/atomicArtifactStore.js";

export const SCANNER_STATE_BUNDLE_FILE = ".state/scanner-learning-bundle.json.gz";
const BUNDLE_V2_MAGIC = Buffer.from("CLI_SCANNER_STATE_V2\0", "utf8");
const COPY_CHUNK_BYTES = 1024 * 1024;
export const SCANNER_STATE_PATTERNS = Object.freeze([
  "data/*memory*.json*",
  "data/scan-history.json*",
  "data/market-opportunity-learning.json*",
  "data/outcome-snapshots.json*",
  "data/point-in-time-observations.json*",
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

function readV2Bundle(rawFile) {
  const fd = fs.openSync(rawFile, "r");
  try {
    const header = Buffer.alloc(BUNDLE_V2_MAGIC.length + 4);
    const bytesRead = fs.readSync(fd, header, 0, header.length, 0);
    if (bytesRead !== header.length || !header.subarray(0, BUNDLE_V2_MAGIC.length).equals(BUNDLE_V2_MAGIC)) {
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
    if (manifest?.schemaVersion !== 2 || !Array.isArray(manifest.files)) {
      throw new Error("Unsupported or malformed scanner-state V2 bundle.");
    }
    return {
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
    const v2 = readV2Bundle(rawFile);
    if (v2) {
      return {
        format: "V2_STREAMED",
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

function validateV2Bundle(bundle, root, rawFile, contentOffset) {
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
    validated.push({ relative, absolute: resolveInsideRoot(root, relative), bytes, offset });
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

function createV2Bundle(bundleFile, bundle, entries) {
  const manifestPayload = Buffer.from(`${JSON.stringify(bundle)}\n`, "utf8");
  if (manifestPayload.length > 0xffff_ffff) throw new Error("Scanner-state manifest exceeds V2 size limit.");

  const rawFile = temporaryFile(bundleFile, "raw");
  const compressedFile = temporaryFile(bundleFile, "compressed");
  let rawFd = null;
  try {
    rawFd = fs.openSync(rawFile, "w", 0o600);
    const header = Buffer.alloc(BUNDLE_V2_MAGIC.length + 4);
    BUNDLE_V2_MAGIC.copy(header);
    header.writeUInt32BE(manifestPayload.length, BUNDLE_V2_MAGIC.length);
    let position = writeBuffer(rawFd, header, 0);
    position = writeBuffer(rawFd, manifestPayload, position);
    for (const entry of entries) position = copyFileToFd(entry.absolute, rawFd, position);
    fs.fsyncSync(rawFd);
    closeQuietly(rawFd);
    rawFd = null;
    requireSuccessfulGzip(["-1", "-n", "-c", rawFile], compressedFile, "Scanner-state compression");
    fs.renameSync(compressedFile, bundleFile);
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
  const files = expandFiles(root, options.patterns || SCANNER_STATE_PATTERNS);
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
  if (options.requireExactUniverse && !candidateUniverse) {
    throw new Error("Refusing to publish scanner state without data/edge-candidate-universe.json.");
  }
  const bundle = {
    schemaVersion: 2,
    generatedAt: options.now || new Date().toISOString(),
    codeCommitSha: options.codeCommitSha ?? process.env.GITHUB_SHA ?? null,
    scanRunId: options.scanRunId ?? process.env.GITHUB_RUN_ID ?? null,
    fileCount: entries.length,
    files: entries.map(({ absolute, ...entry }) => entry),
  };
  fs.mkdirSync(path.dirname(bundleFile), { recursive: true });
  const archive = createV2Bundle(bundleFile, bundle, entries);
  const report = {
    schemaVersion: 2,
    generatedAt: bundle.generatedAt,
    state: "SCANNER_STATE_PACKED",
    format: "V2_STREAMED",
    bundleFile: path.relative(root, bundleFile),
    fileCount: entries.length,
    uncompressedBytes: archive.uncompressedBytes,
    compressedBytes: archive.compressedBytes,
    sha256: archive.sha256,
    exactUniverseIncluded: Boolean(candidateUniverse),
  };
  if (options.writeReport !== false) writeAtomicJson("reports/scanner-state-bundle.json", report);
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
    const entries = opened.format === "V2_STREAMED"
      ? validateV2Bundle(opened.bundle, root, opened.rawFile, opened.contentOffset)
      : validateBundle(opened.bundle, root);
    for (const entry of entries) {
      fs.mkdirSync(path.dirname(entry.absolute), { recursive: true });
      const temp = temporaryFile(entry.absolute, "restore");
      if (opened.format === "V2_STREAMED") copyFileRange(opened.rawFile, entry.offset, entry.bytes, temp);
      else fs.writeFileSync(temp, entry.content);
      fs.renameSync(temp, entry.absolute);
    }
    const report = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      state: "SCANNER_STATE_RESTORED",
      format: opened.format,
      restored: entries.length,
      sourceGeneratedAt: opened.bundle.generatedAt || null,
      sourceCodeCommitSha: opened.bundle.codeCommitSha || null,
      exactUniverseIncluded: entries.some((entry) => entry.relative === "data/edge-candidate-universe.json"),
    };
    if (options.writeReport !== false) writeAtomicJson("reports/scanner-state-restore.json", report);
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
    const entries = opened.format === "V2_STREAMED"
      ? validateV2Bundle(opened.bundle, root, opened.rawFile, opened.contentOffset)
      : validateBundle(opened.bundle, root);
    return {
      state: "SCANNER_STATE_VALID",
      valid: true,
      format: opened.format,
      generatedAt: opened.bundle.generatedAt || null,
      codeCommitSha: opened.bundle.codeCommitSha || null,
      fileCount: entries.length,
      exactUniverseIncluded: entries.some((entry) => entry.relative === "data/edge-candidate-universe.json"),
    };
  } finally {
    closeBundle(opened);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2] || "inspect";
  try {
    const result = command === "pack"
      ? packScannerState({ requireExactUniverse: process.argv.includes("--require-exact-universe") })
      : command === "restore"
        ? restoreScannerState()
        : inspectScannerState();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 2;
  }
}

export const __scannerStateBundleHooks = { sha256, safeRelativeFile, resolveInsideRoot, validateBundle };
