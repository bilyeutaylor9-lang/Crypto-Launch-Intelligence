import { writeAtomicJson } from "./atomicArtifactStore.js";

export function buildRemoteBackupAttestation(options = {}) {
  const env = options.env || process.env;
  const verified = /^(true|1|yes|on)$/i.test(
    String(env.PRODUCTION_REMOTE_BACKUP_VERIFIED || "")
  );
  const provider = String(env.PRODUCTION_REMOTE_BACKUP_PROVIDER || "").trim() || null;
  const verifiedAt = String(env.PRODUCTION_REMOTE_BACKUP_VERIFIED_AT || "").trim() || null;

  const report = {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    pass: verified && Boolean(provider) && Boolean(verifiedAt),
    state:
      verified && provider && verifiedAt
        ? "REMOTE_BACKUP_ATTESTED"
        : "REMOTE_BACKUP_NOT_ATTESTED",
    provider,
    verifiedAt,
    operatorAttestation: verified,
    automaticVerificationClaimed: false,
    note:
      "This attests an external provider backup/PITR configuration that the application cannot independently provision or inspect.",
  };

  if (options.writeReport !== false) {
    writeAtomicJson(
      options.reportFile || "reports/remote-backup-attestation.json",
      report
    );
  }
  return report;
}
