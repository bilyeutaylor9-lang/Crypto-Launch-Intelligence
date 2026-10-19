import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (process.argv.length !== 2) throw new Error("runTestsIsolated does not accept filters or arguments");
const rootDir = fs.realpathSync(process.cwd());
const lockFile = path.join(os.tmpdir(), `scanner-test-isolation-lock-${crypto.createHash("sha256").update(rootDir).digest("hex")}`);
const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), "scanner-test-artifact-backup-"));
let locked = false;
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function inventory(directory) {
  const output = [];
  const visit = (absolute, relative) => {
    const stat = fs.lstatSync(absolute);
    if (stat.isDirectory()) { output.push({ relative, type: "directory" }); for (const name of fs.readdirSync(absolute).sort()) visit(path.join(absolute, name), path.join(relative, name)); }
    else if (stat.isFile()) output.push({ relative, type: "file", bytes: stat.size, sha256: hash(fs.readFileSync(absolute)) });
    else if (stat.isSymbolicLink()) output.push({ relative, type: "symlink", target: fs.readlinkSync(absolute) });
    else throw new Error(`Unsupported test artifact entry: ${absolute}`);
  };
  visit(directory, "."); return output;
}
function matches(directory, expected) { try { return JSON.stringify(inventory(directory)) === JSON.stringify(expected); } catch { return false; } }
function acquire() {
  try { const fd = fs.openSync(lockFile, "wx", 0o600); fs.writeFileSync(fd, JSON.stringify({ rootDir, pid: process.pid, backupRoot })); fs.fsyncSync(fd); fs.closeSync(fd); locked = true; }
  catch (error) { if (error.code === "EEXIST") throw new Error(`TEST_ARTIFACT_ISOLATION_LOCKED: manual recovery may be required; lock=${lockFile}`); throw error; }
}
const artifacts = ["reports", "data"].map(name => {
  const directory = path.join(rootDir, name), existed = fs.existsSync(directory);
  return { name, directory, backup: path.join(backupRoot, name), existed, snapshot: existed ? inventory(directory) : null, mode: "EMPTY", isolated: false, generated: null };
});
function isolate(item) {
  if (!item.existed) fs.mkdirSync(item.directory, { recursive: true });
  else {
    try { fs.renameSync(item.directory, item.backup); item.mode = "ATOMIC_DIRECTORY_SWAP"; }
    catch (error) {
      if (error.code !== "EXDEV") throw error;
      fs.cpSync(item.directory, item.backup, { recursive: true });
      if (!matches(item.backup, item.snapshot)) throw new Error(`TEST_ARTIFACT_COPY_VERIFICATION_FAILED:${item.name}`);
      fs.rmSync(item.directory, { recursive: true, force: false }); item.mode = "COPY_FALLBACK";
    }
    if (!matches(item.backup, item.snapshot)) throw new Error(`TEST_ARTIFACT_BACKUP_VERIFICATION_FAILED:${item.name}`);
    fs.mkdirSync(item.directory, { recursive: true });
  }
  const stat = fs.lstatSync(item.directory);
  if (!stat.isDirectory()) throw new Error(`TEST_ARTIFACT_GENERATED_DIRECTORY_INVALID:${item.name}`);
  item.generated = { dev: stat.dev, ino: stat.ino }; item.isolated = true;
}
function restore() {
  const errors = [];
  for (const item of artifacts) if (item.isolated) {
    try {
      const generated = fs.lstatSync(item.directory);
      if (!generated.isDirectory() || generated.dev !== item.generated.dev || generated.ino !== item.generated.ino) throw new Error(`TEST_ARTIFACT_GENERATED_DIRECTORY_REPLACED:${item.name}`);
      if (item.existed && !matches(item.backup, item.snapshot)) throw new Error(`TEST_ARTIFACT_BACKUP_TAMPERED_OR_MISSING:${item.name}`);
    } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, `Test artifact recovery blocked; current generated state and originals were preserved. Manual recovery: backup=${backupRoot} lock=${lockFile}`);
  for (const item of [...artifacts].reverse()) if (item.isolated) { fs.rmSync(item.directory, { recursive: true, force: false }); if (item.existed) item.mode === "ATOMIC_DIRECTORY_SWAP" ? fs.renameSync(item.backup, item.directory) : fs.cpSync(item.backup, item.directory, { recursive: true }); }
}

let result, recoveryFailed = false;
try {
  acquire(); for (const item of artifacts) isolate(item);
  console.log(`Test artifact isolation: ${artifacts.map(item => `${item.name}=${item.mode}`).join(", ")}`);
  const tests = fs.readdirSync(path.join(rootDir, "test")).filter(name => name.endsWith(".test.js")).sort().map(name => path.join("test", name));
  result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...tests], { cwd: rootDir, env: { ...process.env, TEST_ARTIFACT_BACKUP_ROOT: backupRoot }, stdio: "inherit" });
} finally {
  try { restore(); } catch (error) { recoveryFailed = true; console.error(error); }
  if (!recoveryFailed) { fs.rmSync(backupRoot, { recursive: true, force: false }); if (locked) fs.unlinkSync(lockFile); }
}
if (recoveryFailed) process.exitCode = 1;
else if (result?.error) throw result.error;
else process.exitCode = Number.isInteger(result?.status) ? result.status : 1;
