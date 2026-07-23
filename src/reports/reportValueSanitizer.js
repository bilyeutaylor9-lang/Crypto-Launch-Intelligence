import fs from "fs";
import path from "path";

const INVALID_PUBLIC_STRING_RE = /^(?:n\/a|nan|infinity|-infinity)$/i;

function replacementForLocation(location = "") {
  const key = String(location || "").split(".").pop() || "";
  if (/symbol/i.test(key)) return "UNKNOWN";
  return "Unknown";
}

export function sanitizeReportValue(value, location = "root") {
  if (value === undefined) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (INVALID_PUBLIC_STRING_RE.test(trimmed)) {
      return replacementForLocation(location);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeReportValue(item, `${location}[${index}]`));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        sanitizeReportValue(nested, location ? `${location}.${key}` : key),
      ])
    );
  }

  return value;
}

export function sanitizeReportJsonFile(filePath = "") {
  if (!filePath || !fs.existsSync(filePath) || path.extname(filePath) !== ".json") {
    return { filePath, status: "SKIPPED" };
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const sanitized = sanitizeReportValue(parsed, path.basename(filePath));
  fs.writeFileSync(filePath, JSON.stringify(sanitized, null, 2));

  return { filePath, status: "SANITIZED" };
}

export function sanitizeReportJsonFiles(fileNames = [], reportsDir = "reports") {
  const root = path.resolve(reportsDir);
  return (Array.isArray(fileNames) ? fileNames : [])
    .filter(Boolean)
    .map((fileName) => sanitizeReportJsonFile(path.join(root, fileName)));
}
