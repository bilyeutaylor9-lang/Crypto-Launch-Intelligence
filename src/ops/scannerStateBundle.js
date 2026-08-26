import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { writeAtomicJson } from "../production/atomicArtifactStore.js";

export const SCANNER_STATE_BUNDLE_FILE = ".state/scanner-learning-bundle.json.gz";
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

function readBundle(bundleFile) {
  const compressed = fs.readFileSync(bundleFile);
  const decoded = JSON.parse(zlib.gunzipSync(compressed).toString("utf8"));
  if (decoded?.schemaVersion !== 1 || !Array.isArray(decoded.files)) {
    throw new Error("Unsupported or malformed scanner-state bundle.");
  }
  return decoded;
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

export function packScannerState(options = {}) {
  const root = path.resolve(options.root || ".");
  const bundleFile = path.resolve(root, options.bundleFile || SCANNER_STATE_BUNDLE_FILE);
  const files = expandFiles(root, options.patterns || SCANNER_STATE_PATTERNS);
  const entries = files.map((relative) => {
    const content = fs.readFileSync(resolveInsideRoot(root, relative));
    return {
      path: relative,
      bytes: content.length,
      sha256: sha256(content),
      contentBase64: content.toString("base64"),
    };
  });
  const candidateUniverse = entries.find((entry) => entry.path === "data/edge-candidate-universe.json");
  if (options.requireExactUniverse && !candidateUniverse) {
    throw new Error("Refusing to publish scanner state without data/edge-candidate-universe.json.");
  }
  const bundle = {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    codeCommitSha: options.codeCommitSha ?? process.env.GITHUB_SHA ?? null,
    scanRunId: options.scanRunId ?? process.env.GITHUB_RUN_ID ?? null,
    fileCount: entries.length,
    files: entries,
  };
  const payload = Buffer.from(`${JSON.stringify(bundle)}\n`);
  const compressed = zlib.gzipSync(payload, { level: zlib.constants.Z_BEST_SPEED });
  fs.mkdirSync(path.dirname(bundleFile), { recursive: true });
  const temp = `${bundleFile}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, compressed);
  fs.renameSync(temp, bundleFile);
  const report = {
    schemaVersion: 1,
    generatedAt: bundle.generatedAt,
    state: "SCANNER_STATE_PACKED",
    bundleFile: path.relative(root, bundleFile),
    fileCount: entries.length,
    uncompressedBytes: payload.length,
    compressedBytes: compressed.length,
    sha256: sha256(compressed),
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
  const bundle = readBundle(bundleFile);
  const entries = validateBundle(bundle, root);
  for (const entry of entries) {
    fs.mkdirSync(path.dirname(entry.absolute), { recursive: true });
    const temp = `${entry.absolute}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temp, entry.content);
    fs.renameSync(temp, entry.absolute);
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    state: "SCANNER_STATE_RESTORED",
    restored: entries.length,
    sourceGeneratedAt: bundle.generatedAt || null,
    sourceCodeCommitSha: bundle.codeCommitSha || null,
    exactUniverseIncluded: entries.some((entry) => entry.relative === "data/edge-candidate-universe.json"),
  };
  if (options.writeReport !== false) writeAtomicJson("reports/scanner-state-restore.json", report);
  return report;
}

export function inspectScannerState(options = {}) {
  const root = path.resolve(options.root || ".");
  const bundleFile = path.resolve(root, options.bundleFile || SCANNER_STATE_BUNDLE_FILE);
  if (!fs.existsSync(bundleFile)) return { state: "SCANNER_STATE_NOT_FOUND", valid: false };
  const bundle = readBundle(bundleFile);
  const entries = validateBundle(bundle, root);
  return {
    state: "SCANNER_STATE_VALID",
    valid: true,
    generatedAt: bundle.generatedAt || null,
    codeCommitSha: bundle.codeCommitSha || null,
    fileCount: entries.length,
    exactUniverseIncluded: entries.some((entry) => entry.relative === "data/edge-candidate-universe.json"),
  };
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
