import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const reportsDir = path.join(rootDir, "reports");
const testDir = path.join(rootDir, "test");
const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crypto-scan-test-artifacts-"));
const backupReportsDir = path.join(backupRoot, "reports");
const reportsExisted = fs.existsSync(reportsDir);

function restoreReports() {
  fs.rmSync(reportsDir, { recursive: true, force: true });
  if (reportsExisted) {
    fs.cpSync(backupReportsDir, reportsDir, { recursive: true });
  }
  fs.rmSync(backupRoot, { recursive: true, force: true });
}

if (reportsExisted) {
  fs.cpSync(reportsDir, backupReportsDir, { recursive: true });
}

const testFiles = fs
  .readdirSync(testDir)
  .filter((fileName) => fileName.endsWith(".test.js"))
  .sort()
  .map((fileName) => path.join("test", fileName));

let result;
try {
  result = spawnSync(process.execPath, ["--test", ...testFiles], {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
  });
} finally {
  restoreReports();
}

if (result.error) {
  throw result.error;
}

process.exitCode = Number.isInteger(result.status) ? result.status : 1;
