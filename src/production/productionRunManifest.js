import fs from "node:fs";
import path from "node:path";
import { stableHash } from "./productionMath.js";
import { writeAtomicJson } from "./atomicArtifactStore.js";

export function buildProductionRunManifest(options = {}) {
  const config = options.config || {};
  const runId = options.runId || `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    schemaVersion: 1,
    runId,
    generatedAt: options.now || new Date().toISOString(),
    codeCommitSha: options.codeCommitSha || process.env.GITHUB_SHA || null,
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
