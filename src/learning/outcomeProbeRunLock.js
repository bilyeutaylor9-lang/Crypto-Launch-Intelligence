import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_OUTCOME_PROBE_LOCK_FILE = path.resolve(
  "data",
  "outcome-probe-run.lock",
);

const DEFAULT_STALE_AFTER_MS = 6 * 60 * 60 * 1_000;

function readLock(lockFile) {
  try {
    return JSON.parse(fs.readFileSync(lockFile, "utf8"));
  } catch {
    return null;
  }
}

function lockAgeMs(lockFile) {
  try {
    return Math.max(0, Date.now() - fs.statSync(lockFile).mtimeMs);
  } catch {
    return null;
  }
}

function processIsAlive(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return null;
  try {
    process.kill(numericPid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    // EPERM means the PID exists but cannot be signalled by this user, which
    // is still safer to treat as active than to disrupt its evidence write.
    return error?.code === "EPERM" ? true : null;
  }
}

/**
 * Serializes exact-outcome collection across the scanner and an external
 * hourly job. A caller that finds a healthy active lock should skip rather
 * than race an append-only evidence write or overwrite legacy snapshots.
 */
export function acquireOutcomeProbeRunLock(options = {}) {
  const lockFile = path.resolve(
    options.outcomeProbeLockFile || options.lockFile || DEFAULT_OUTCOME_PROBE_LOCK_FILE,
  );
  const staleAfterMs = Math.max(
    1_000,
    Number(options.outcomeProbeLockStaleMs || DEFAULT_STALE_AFTER_MS),
  );
  const ownerToken = crypto.randomUUID();
  const metadata = {
    schemaVersion: 1,
    ownerToken,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    purpose: "EXACT_SHADOW_OUTCOME_COLLECTION",
  };

  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let descriptor = null;
    try {
      descriptor = fs.openSync(lockFile, "wx");
      fs.writeFileSync(descriptor, `${JSON.stringify(metadata)}\n`, "utf8");
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = null;
      return {
        acquired: true,
        lockFile,
        ownerToken,
        metadata,
        release() {
          const current = readLock(lockFile);
          if (current?.ownerToken !== ownerToken) return false;
          try {
            fs.unlinkSync(lockFile);
            return true;
          } catch (error) {
            if (error?.code === "ENOENT") return false;
            throw error;
          }
        },
      };
    } catch (error) {
      if (descriptor !== null) {
        try { fs.closeSync(descriptor); } catch { /* no-op */ }
      }
      if (error?.code !== "EEXIST") throw error;

      const activeRun = readLock(lockFile);
      const ageMs = lockAgeMs(lockFile);
      const ownerAlive = processIsAlive(activeRun?.pid);
      // A crashed collector can recover immediately when its recorded PID is
      // gone. A live owner remains authoritative even after the ordinary
      // stale interval, preventing a slow/wide run from being interrupted.
      const safelyAbandoned = ownerAlive === false ||
        (ownerAlive === null && ageMs !== null && ageMs > staleAfterMs);
      if (safelyAbandoned) {
        try {
          fs.unlinkSync(lockFile);
          continue;
        } catch (unlinkError) {
          if (unlinkError?.code === "ENOENT") continue;
        }
      }
      return {
        acquired: false,
        lockFile,
        activeRun,
        ageMs,
        ownerAlive,
      };
    }
  }

  return {
    acquired: false,
    lockFile,
    activeRun: readLock(lockFile),
    ageMs: lockAgeMs(lockFile),
    ownerAlive: processIsAlive(readLock(lockFile)?.pid),
  };
}

export const __outcomeProbeRunLockHooks = { readLock, lockAgeMs, processIsAlive };
