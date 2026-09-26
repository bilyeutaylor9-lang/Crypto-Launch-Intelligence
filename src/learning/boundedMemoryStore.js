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

export function memorySidecarMaxBytes(env = process.env) {
  const mb = num(env.MEMORY_SIDECAR_MAX_MB || 64);
  return Math.max(1, mb) * 1024 * 1024;
}

function trimMemorySidecar(filePath = "", env = process.env) {
  const maxBytes = memorySidecarMaxBytes(env);
  const size = memoryFileSizeBytes(filePath);
  if (size <= maxBytes) return { trimmed: false, bytes: size };

  const retainedBytes = Math.max(1, Math.floor(maxBytes * 0.9));
  const start = Math.max(0, size - retainedBytes);
  const fd = fs.openSync(filePath, "r");
  let buffer;
  try {
    buffer = Buffer.allocUnsafe(size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
  } finally {
    fs.closeSync(fd);
  }

  let content = buffer.toString("utf8");
  if (start > 0) {
    const firstNewline = content.indexOf("\n");
    content = firstNewline >= 0 ? content.slice(firstNewline + 1) : "";
  }
  const temporary = `${filePath}.${process.pid}.${Date.now()}.trim.tmp`;
  fs.writeFileSync(temporary, content.endsWith("\n") ? content : `${content}\n`);
  fs.renameSync(temporary, filePath);
  return { trimmed: true, bytes: memoryFileSizeBytes(filePath) };
}

export function shouldUseAppendOnlyMemory(filePath = "", options = {}) {
  const env = options.env || process.env;
  if (boolEnv(env.MEMORY_FORCE_JSON_REWRITE, false)) return false;
  if (boolEnv(env.MEMORY_APPEND_ONLY, false)) return true;
  return memoryFileSizeBytes(filePath) > memoryRewriteLimitBytes(env);
}

export function memorySidecarPath(filePath = "") {
  return /\.json$/i.test(filePath)
    ? filePath.replace(/\.json$/i, ".jsonl")
    : `${filePath}.jsonl`;
}

export function appendMemorySidecar(filePath = "", records = [], metadata = {}) {
  const safeRecords = Array.isArray(records) ? records : [];
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  const defaultSidecarPath = memorySidecarPath(filePath);

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
  const retention = trimMemorySidecar(sidecarPath, metadata.env || process.env);

  return {
    mode: "append-only-sidecar",
    appended: safeRecords.length,
    file: sidecarPath,
    legacyFilePreserved: filePath,
    legacyFileBytes: memoryFileSizeBytes(filePath),
    sidecarBytes: retention.bytes,
    sidecarTrimmed: retention.trimmed,
  };
}

export function readMemorySidecarTail(filePath = "", options = {}) {
  const sidecarPath = options.sidecarPath || memorySidecarPath(filePath);
  const limit = Math.max(0, Math.floor(num(options.limit || 5000)));
  const maxBytes = Math.max(1024, Math.floor(num(options.maxBytes || 16 * 1024 * 1024)));
  const size = memoryFileSizeBytes(sidecarPath);
  if (!size || !limit) return [];

  const readBytes = Math.min(size, maxBytes);
  const offset = Math.max(0, size - readBytes);
  const fd = fs.openSync(sidecarPath, "r");
  const buffer = Buffer.allocUnsafe(readBytes);

  try {
    fs.readSync(fd, buffer, 0, readBytes, offset);
  } finally {
    fs.closeSync(fd);
  }

  let text = buffer.toString("utf8");
  if (offset > 0) {
    const firstNewline = text.indexOf("\n");
    text = firstNewline >= 0 ? text.slice(firstNewline + 1) : "";
  }

  const records = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      records.push(parsed?.record && typeof parsed.record === "object" ? parsed.record : parsed);
      if (records.length > limit) records.shift();
    } catch {
      // Ignore partial or corrupt JSONL lines; the next scan can append clean records.
    }
  }

  return records.slice(-limit);
}
