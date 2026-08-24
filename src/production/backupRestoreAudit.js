import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { writeAtomicJson } from "./atomicArtifactStore.js";

const DEFAULT_PATHS = Object.freeze([
  "data/edge-production-episodes.jsonl",
  "data/edge-evidence-outcomes.jsonl",
  "data/edge-fast-outcomes.jsonl",
  "data/edge-candidate-universe.json",
  "data/production-market-observations.jsonl",
  "data/prospective-edge-cohorts.jsonl",
  "data/ignition-twin-observations.jsonl",
  "data/ignition-genome-history.json",
]);

function digestFile(file) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  const buffer = Buffer.alloc(64 * 1024);
  try {
    let bytes;
    while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

export function runBackupRestoreAudit(options = {}) {
  const root = path.resolve(options.root || ".");
  const paths = options.paths || DEFAULT_PATHS;
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cli-backup-audit-"));
  const backupDir = path.join(tempRoot, "backup");
  const restoreDir = path.join(tempRoot, "restore");
  fs.mkdirSync(backupDir, { recursive: true });
  fs.mkdirSync(restoreDir, { recursive: true });

  const files = [];
  try {
    for (const relative of paths) {
      const source = path.join(root, relative);
      if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
        files.push({ path: relative, present: false, pass: true });
        continue;
      }

      const backup = path.join(backupDir, relative);
      const restored = path.join(restoreDir, relative);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.mkdirSync(path.dirname(restored), { recursive: true });

      const sourceHash = digestFile(source);
      fs.copyFileSync(source, backup);
      fs.copyFileSync(backup, restored);
      const restoredHash = digestFile(restored);

      files.push({
        path: relative,
        present: true,
        bytes: fs.statSync(source).size,
        sourceSha256: sourceHash,
        restoredSha256: restoredHash,
        pass: sourceHash === restoredHash,
      });
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  const present = files.filter((row) => row.present);
  const report = {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    pass: present.length > 0 && present.every((row) => row.pass),
    state:
      present.length === 0
        ? "NO_PERSISTED_EVIDENCE_AVAILABLE"
        : present.every((row) => row.pass)
          ? "LOCAL_BACKUP_RESTORE_PASS"
          : "BACKUP_RESTORE_FAIL",
    files,
    scope: "LOCAL_PERSISTED_EVIDENCE_AND_SQLITE_COMPATIBLE_FILES",
    remoteSupabasePitrVerified: false,
  };

  if (options.writeReport !== false) {
    writeAtomicJson(
      options.reportFile || "reports/backup-restore-audit.json",
      report
    );
  }
  return report;
}

export const __backupRestoreAuditHooks = { digestFile };
