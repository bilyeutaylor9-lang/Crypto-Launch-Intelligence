import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

export const FORWARD_EVIDENCE_FILES = Object.freeze([
  "data/production-market-observations.jsonl",
  "data/market-context-observations.jsonl",
  "data/prospective-edge-cohorts.jsonl",
]);
const REQUIRED = new Set([
  "data/production-market-observations.jsonl",
  "data/prospective-edge-cohorts.jsonl",
]);
const DEFAULT_CAP = 1024 * 1024 * 1024;

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const lines = bytes => bytes.reduce((count, byte) => count + Number(byte === 10), 0) + Number(bytes.length > 0 && bytes.at(-1) !== 10);

function safePath(root, relative) {
  if (!FORWARD_EVIDENCE_FILES.includes(relative) || path.isAbsolute(relative) || relative.split(path.sep).includes("..")) throw new Error("FORWARD_CACHE_UNSAFE_PATH");
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("FORWARD_CACHE_UNSAFE_PATH");
  return target;
}

function snapshot(root, relative) {
  const file = safePath(root, relative);
  let before;
  try { before = fs.lstatSync(file); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (!before.isFile() || before.isSymbolicLink()) throw new Error(`FORWARD_CACHE_UNSAFE_SOURCE:${relative}`);
  const bytes = fs.readFileSync(file);
  const after = fs.lstatSync(file);
  if (!after.isFile() || after.isSymbolicLink() || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== before.size) {
    throw new Error(`FORWARD_CACHE_SOURCE_MUTATED:${relative}`);
  }
  return { relative, file, bytes, hash: sha256(bytes), lineCount: lines(bytes) };
}

function octal(value, width) {
  return `${Number(value).toString(8).padStart(width - 1, "0")}\0`;
}

function tarEntry(name, bytes) {
  if (!FORWARD_EVIDENCE_FILES.includes(name) && name !== "manifest.json") throw new Error("FORWARD_CACHE_UNSAFE_TAR_MEMBER");
  const header = Buffer.alloc(512);
  header.write(name, 0, "utf8");
  header.write(octal(0o444, 8), 100, "ascii");
  header.write(octal(0, 8), 108, "ascii"); header.write(octal(0, 8), 116, "ascii");
  header.write(octal(bytes.length, 12), 124, "ascii"); header.write(octal(0, 12), 136, "ascii");
  header.fill(0x20, 148, 156); header[156] = "0".charCodeAt(0);
  header.write("ustar\0", 257, "ascii"); header.write("00", 263, "ascii");
  const checksum = header.reduce((total, byte) => total + byte, 0);
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
  const padding = Buffer.alloc((512 - (bytes.length % 512)) % 512);
  return Buffer.concat([header, bytes, padding]);
}

function tar(entries) {
  return Buffer.concat([...entries.map(entry => tarEntry(entry.name, entry.bytes)), Buffer.alloc(1024)]);
}

function createNewDirectory(outputDir) {
  if (!path.isAbsolute(outputDir) || fs.existsSync(outputDir)) throw new Error("FORWARD_CACHE_OUTPUT_MUST_BE_NEW_ABSOLUTE_DIRECTORY");
  fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
}

export function exportForwardEvidenceCache({ root = process.cwd(), outputDir, cacheMatchedKey, sourceCommit = null, workflowRun = null, maxBytes = DEFAULT_CAP } = {}) {
  if (typeof cacheMatchedKey !== "string" || !cacheMatchedKey.trim()) throw new Error("FORWARD_CACHE_MATCHED_KEY_REQUIRED");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError("Invalid forward-cache size cap");
  const sourceRoot = path.resolve(root);
  createNewDirectory(outputDir);
  try {
    const sources = FORWARD_EVIDENCE_FILES.map(relative => snapshot(sourceRoot, relative));
    const missingFiles = sources.flatMap((value, index) => value ? [] : [FORWARD_EVIDENCE_FILES[index]]);
    const present = sources.filter(Boolean);
    if (missingFiles.some(relative => REQUIRED.has(relative))) throw new Error("FORWARD_CACHE_REQUIRED_SOURCE_MISSING");
    if (present.some(entry => REQUIRED.has(entry.relative) && entry.bytes.length === 0)) throw new Error("FORWARD_CACHE_REQUIRED_SOURCE_EMPTY");
    if (present.reduce((total, entry) => total + entry.bytes.length, 0) > maxBytes) throw new Error("FORWARD_CACHE_SIZE_CAP_EXCEEDED");
    for (const entry of present) {
      const destination = path.join(outputDir, entry.relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      fs.writeFileSync(destination, entry.bytes, { mode: 0o444, flag: "wx" });
      if (sha256(fs.readFileSync(destination)) !== entry.hash) throw new Error(`FORWARD_CACHE_COPY_HASH_MISMATCH:${entry.relative}`);
      const current = snapshot(sourceRoot, entry.relative);
      if (!current || current.hash !== entry.hash) throw new Error(`FORWARD_CACHE_SOURCE_MUTATED:${entry.relative}`);
    }
    const manifest = {
      format: "forward-evidence-cache-export/v1",
      provenance: { sourceCommit, workflowRun, cacheMatchedKey },
      files: present.map(entry => ({ path: entry.relative, sha256: entry.hash, bytes: entry.bytes.length, lineCount: entry.lineCount })),
      missingFiles,
      rawBytes: present.reduce((total, entry) => total + entry.bytes.length, 0),
      claims: { scoring: false, certification: false, remoteAcknowledged: false },
    };
    const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    fs.writeFileSync(path.join(outputDir, "manifest.json"), manifestBytes, { mode: 0o444, flag: "wx" });
    const archive = zlib.gzipSync(tar([...present.map(entry => ({ name: entry.relative, bytes: entry.bytes })), { name: "manifest.json", bytes: manifestBytes }]), { mtime: 0 });
    const archiveFile = path.join(outputDir, "forward-evidence-cache.tar.gz");
    fs.writeFileSync(archiveFile, archive, { mode: 0o444, flag: "wx" });
    return { outputDir, archiveFile, manifestFile: path.join(outputDir, "manifest.json"), manifest, archiveSha256: sha256(archive) };
  } catch (error) {
    fs.rmSync(outputDir, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = exportForwardEvidenceCache({
    root: process.cwd(), outputDir: process.env.FORWARD_CACHE_EXPORT_DIR,
    cacheMatchedKey: process.env.FORWARD_CACHE_MATCHED_KEY,
    sourceCommit: process.env.GITHUB_SHA || null, workflowRun: process.env.GITHUB_RUN_ID || null,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
