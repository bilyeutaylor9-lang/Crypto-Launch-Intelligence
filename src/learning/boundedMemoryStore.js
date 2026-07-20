import fs from "fs";
import path from "path";

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return /^(true|1|yes|on)$/i.test(String(value).trim());
}

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function memoryFileSizeBytes(filePath = "") {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

export function memoryRewriteLimitBytes(env = process.env) {
  const mb = num(env.MEMORY_REWRITE_LIMIT_MB || 25);
  return Math.max(1, mb) * 1024 * 1024;
}

export function shouldUseAppendOnlyMemory(filePath = "", options = {}) {
  const env = options.env || process.env;
  if (boolEnv(env.MEMORY_FORCE_JSON_REWRITE, false)) return false;
  if (boolEnv(env.MEMORY_APPEND_ONLY, false)) return true;
  return memoryFileSizeBytes(filePath) > memoryRewriteLimitBytes(env);
}

export function appendMemorySidecar(filePath = "", records = [], metadata = {}) {
  const safeRecords = Array.isArray(records) ? records : [];
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  const defaultSidecarPath = /\.json$/i.test(filePath)
    ? filePath.replace(/\.json$/i, ".jsonl")
    : `${filePath}.jsonl`;

  if (!safeRecords.length) {
    return {
      mode: "append-only-sidecar",
      appended: 0,
      file: metadata.sidecarPath || defaultSidecarPath,
      legacyFilePreserved: filePath,
      legacyFileBytes: memoryFileSizeBytes(filePath),
    };
  }

  const storedAt = new Date().toISOString();
  const sidecarPath = metadata.sidecarPath || defaultSidecarPath;
  const lines = safeRecords.map((record) =>
    JSON.stringify({
      recordType: metadata.recordType || "memory-record",
      storedAt,
      sourceFile: path.basename(filePath),
      record,
    })
  );

  fs.appendFileSync(sidecarPath, `${lines.join("\n")}\n`);

  return {
    mode: "append-only-sidecar",
    appended: safeRecords.length,
    file: sidecarPath,
    legacyFilePreserved: filePath,
    legacyFileBytes: memoryFileSizeBytes(filePath),
  };
}
