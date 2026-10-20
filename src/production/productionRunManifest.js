import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { stableHash } from "./productionMath.js";
import { writeAtomicJson } from "./atomicArtifactStore.js";

export function resolveCodeCommitSha(options = {}) {
  const env = options.env || process.env;
  const configured = String(
    options.codeCommitSha ||
    env.GITHUB_SHA ||
    env.EDGE_CODE_VERSION ||
    ""
  ).trim();
  if (configured) return configured;
  try {
    const worktreeStatus = execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
      cwd: options.cwd || process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2_000,
    }).trim();
    if (worktreeStatus) return null;
    const resolved = execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
      cwd: options.cwd || process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2_000,
    }).trim();
    return /^[0-9a-f]{7,64}$/i.test(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

export function buildScanCodeProvenance(startCommit = null, endCommit = null) {
  const start = typeof startCommit === "string" && startCommit.trim() ? startCommit.trim() : null;
  const end = typeof endCommit === "string" && endCommit.trim() ? endCommit.trim() : null;
  const stable = Boolean(start && end && start === end);
  return {
    codeCommitSha: stable ? start : null,
    codeCommitShaAtStart: start,
    codeCommitShaAtEnd: end,
    codeProvenanceStatus: stable ? "SOURCE_VERSION_STABLE"
      : start !== end ? "SOURCE_STATE_CHANGED_DURING_RUN" : "UNVERIFIED_SOURCE",
  };
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
    artifactClass: options.artifactClass || process.env.ARTIFACT_CLASS || "LIVE_SHADOW",
    evidenceMode: "SHADOW_RESEARCH_ONLY",
    automaticTrading: false,
    automaticModelPromotion: false,
  };
}

export function writeProductionRunManifest(manifest, file = "reports/production-run-manifest.json") {
  return writeAtomicJson(path.resolve(file), manifest);
}
