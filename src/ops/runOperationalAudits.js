import fs from "node:fs";

import { runLiveEnvironmentAudit } from "../production/liveEnvironmentAudit.js";
import { runBackupRestoreAudit } from "../production/backupRestoreAudit.js";
import { runFaultInjectionAudit } from "../production/faultInjectionAudit.js";
import { buildExactIdentityHealth } from "../production/exactIdentityHealth.js";
import { buildOutcomeCaptureHealth } from "../production/outcomeCaptureHealth.js";
import { runRemotePersistenceAudit } from "../production/remotePersistenceAudit.js";
import { buildRemoteBackupAttestation } from "../production/remoteBackupAttestation.js";
import { runProductionSecurityAudit } from "../production/productionSecurityAudit.js";
import { runReproducibilityAudit } from "./runReproducibilityAudit.js";
import { loadEdgeCandidateUniverse } from "../data/edgeCandidateUniverseStore.js";
import { loadEdgeProductionEpisodes } from "../learning/edgeProductionEpisodeStore.js";
import { loadEdgeEvidenceOutcomes } from "../learning/edgeEvidenceOutcomeStore.js";

export async function runOperationalAudits(options = {}) {
  const environment = await runLiveEnvironmentAudit({
    env: options.env || process.env,
    writeReport: true,
  });
  const remotePersistence = await runRemotePersistenceAudit({
    env: options.env || process.env,
    writeReport: true,
  });
  const remoteBackup = buildRemoteBackupAttestation({
    env: options.env || process.env,
    writeReport: true,
  });
  const backupRestore = runBackupRestoreAudit({ writeReport: true });
  const faultInjection = runFaultInjectionAudit({ writeReport: true });
  const security = runProductionSecurityAudit({
    root: ".",
    writeReport: true,
  });

  const universe = loadEdgeCandidateUniverse();
  const identityHealth = buildExactIdentityHealth(universe.candidates || [], {
    writeReport: true,
  });

  const episodes = loadEdgeProductionEpisodes();
  const outcomes = loadEdgeEvidenceOutcomes();
  const outcomeHealth = buildOutcomeCaptureHealth(episodes, outcomes, {
    horizonHours: 24,
    writeReport: true,
  });

  const reproducibility = runReproducibilityAudit();

  return {
    environment,
    remotePersistence,
    remoteBackup,
    backupRestore,
    faultInjection,
    security,
    identityHealth,
    outcomeHealth,
    reproducibility,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = await runOperationalAudits();
    console.log(JSON.stringify({
      environment: report.environment.state,
      remotePersistence: report.remotePersistence.state,
      remoteBackup: report.remoteBackup.state,
      backupRestore: report.backupRestore.state,
      faultInjection: report.faultInjection.state,
      security: report.security.state,
      identity: report.identityHealth.state,
      outcomes: report.outcomeHealth.state,
      reproducibility: report.reproducibility.state,
    }, null, 2));
    if (
      report.environment.state !== "ENVIRONMENT_READY" ||
      report.remotePersistence.state !== "REMOTE_READ_HEALTHY" ||
      report.remotePersistence.serverWriteCapable !== true ||
      report.remoteBackup.pass !== true ||
      report.backupRestore.pass !== true ||
      report.faultInjection.pass !== true ||
      report.security.pass !== true ||
      report.reproducibility.pass !== true
    ) {
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
