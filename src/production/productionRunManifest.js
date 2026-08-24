import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { stableHash } from "./productionMath.js";
import { writeAtomicJson } from "./atomicArtifactStore.js";

export function resolveCodeCommitSha(options = {}) {
  const configured = String(
    options.codeCommitSha ||
    process.env.GITHUB_SHA ||
    process.env.EDGE_CODE_VERSION ||
    ""
  ).trim();
  if (configured) return configured;
  try {
    const worktreeStatus = execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2_000,
    }).trim();
    if (worktreeStatus) return null;
    const resolved = execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2_000,
    }).trim();
    return /^[0-9a-f]{7,64}$/i.test(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

export function buildProductionRunManifest(options = {}) {
  const config = options.config || {};
  const runId = options.runId || `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    schemaVersion: 1,
    runId,
    generatedAt: options.now || new Date().toISOString(),
    codeCommitSha: resolveCodeCommitSha(options),
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    modelVersion: options.modelVersion || process.env.EDGE_MODEL_VERSION || "shadow-v1",
    featureSchemaVersion: options.featureSchemaVersion || "production-feature-v1",
    configFingerprint: stableHash(config),
    config,
    environment: options.environment || process.env.NODE_ENV || "development",
    automaticTrading: false,
  };
}

export function writeProductionRunManifest(manifest, file = "reports/production-run-manifest.json") {
  return writeAtomicJson(path.resolve(file), manifest);
}
