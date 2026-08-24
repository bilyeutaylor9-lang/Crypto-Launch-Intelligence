import { stableHash } from "./productionMath.js";
import { writeAtomicJson } from "./atomicArtifactStore.js";

function stableView(value) {
  if (Array.isArray(value)) return value.map(stableView);
  if (!value || typeof value !== "object") return value;
  const omit = new Set([
    "generatedAt",
    "observedAt",
    "runId",
    "scanRunId",
    "codeCommitSha",
  ]);
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !omit.has(key))
      .sort()
      .map((key) => [key, stableView(value[key])])
  );
}

export function auditReproducibility(left, right, options = {}) {
  const leftHash = stableHash(stableView(left));
  const rightHash = stableHash(stableView(right));
  const report = {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    pass: leftHash === rightHash,
    state: leftHash === rightHash ? "REPRODUCIBLE" : "NON_DETERMINISTIC_OUTPUT",
    leftHash,
    rightHash,
    ignoredVolatileFields: [
      "generatedAt",
      "observedAt",
      "runId",
      "scanRunId",
      "codeCommitSha",
    ],
  };
  if (options.writeReport !== false) {
    writeAtomicJson(
      options.reportFile || "reports/reproducibility-audit.json",
      report
    );
  }
  return report;
}

export const __reproducibilityAuditHooks = { stableView };
