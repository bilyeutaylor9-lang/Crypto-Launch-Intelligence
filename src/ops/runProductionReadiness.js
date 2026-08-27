import fs from "node:fs";
import { evaluateProductionReadiness } from "../production/productionReadinessGate.js";
import { writeAtomicJson } from "../production/atomicArtifactStore.js";

function read(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

export function runProductionReadiness() {
  const environment = read("reports/live-environment-audit.json");
  const remotePersistence = read("reports/remote-persistence-audit.json");
  const remoteBackup = read("reports/remote-backup-attestation.json");
  const security = read("reports/production-security-audit.json");
  const edgeVerification = read("reports/edge-verification-certificate.json");
  const alphaLab = read("reports/autonomous-alpha-lab.json");
  const backtest = read("reports/core-model-backtest.json");
  const observability = read("reports/production-observability.json");
  const calibration = read("reports/production-calibration.json");
  const challenger = read("reports/champion-challenger.json");
  const outcomeHealth = read("reports/outcome-capture-health.json");
  const identityHealth = read("reports/exact-identity-health.json");
  const reproducibility = read("reports/reproducibility-audit.json");
  const backupRestore = read("reports/backup-restore-audit.json");
  const faultInjection = read("reports/fault-injection-audit.json");
  const sourceReadiness = read("reports/data-source-readiness.json");
  const artifactManifest = read("reports/scan-artifact-manifest.json");

  const report = evaluateProductionReadiness({
    environment,
    remotePersistence,
    remoteBackup,
    security,
    edgeVerification,
    alphaLab,
    backtest,
    leakageAudit: backtest.leakageAudit || {},
    walkForward: backtest.walkForward || {},
    observability,
    calibration,
    challenger,
    outcomeHealth,
    identityHealth,
    reproducibility,
    backupRestore,
    faultInjection,
    sourceReadiness,
    artifactManifest,
  });
  writeAtomicJson("reports/production-readiness.json", report);
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = runProductionReadiness();
  console.log(JSON.stringify(report, null, 2));
  if (report.state !== "PRODUCTION_READY_INTELLIGENCE") process.exitCode = 2;
}
