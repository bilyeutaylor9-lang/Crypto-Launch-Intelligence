import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const reportsDir = path.join(rootDir, "reports");
const testDir = path.join(rootDir, "test");
const backupRoot = path.join(rootDir, `.test-artifact-backup-${process.pid}`);
const backupReportsDir = path.join(backupRoot, "reports");
const reportsExisted = fs.existsSync(reportsDir);
let isolationMode = reportsExisted ? "PENDING" : "EMPTY";
let isolationReady = false;

function isolateReports() {
  if (!reportsExisted) {
    fs.mkdirSync(reportsDir, { recursive: true });
    isolationReady = true;
    return;
  }

  fs.mkdirSync(backupRoot, { recursive: true });
  try {
    fs.renameSync(reportsDir, backupReportsDir);
    fs.mkdirSync(reportsDir, { recursive: true });
    isolationMode = "ATOMIC_DIRECTORY_SWAP";
    isolationReady = true;
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    fs.cpSync(reportsDir, backupReportsDir, { recursive: true });
    isolationMode = "COPY_FALLBACK";
    isolationReady = true;
  }
}

function restoreReports() {
  fs.rmSync(reportsDir, { recursive: true, force: true });
  if (reportsExisted) {
    if (isolationMode === "ATOMIC_DIRECTORY_SWAP") {
      fs.renameSync(backupReportsDir, reportsDir);
    } else {
      fs.cpSync(backupReportsDir, reportsDir, { recursive: true });
    }
  }
  fs.rmSync(backupRoot, { recursive: true, force: true });
}

const testFiles = fs
  .readdirSync(testDir)
  .filter((fileName) => fileName.endsWith(".test.js"))
  .sort()
  .map((fileName) => path.join("test", fileName));

let result;
try {
  isolateReports();
  console.log(`Test report isolation: ${isolationMode}`);
  result = spawnSync(process.execPath, ["--test", ...testFiles], {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
  });
} finally {
  if (isolationReady) restoreReports();
  else fs.rmSync(backupRoot, { recursive: true, force: true });
}

if (result.error) {
  throw result.error;
}

process.exitCode = Number.isInteger(result.status) ? result.status : 1;
