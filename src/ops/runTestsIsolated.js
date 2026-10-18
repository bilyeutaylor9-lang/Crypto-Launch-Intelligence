import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const testDir = path.join(rootDir, "test");
const backupRoot = fs.mkdtempSync(path.join(rootDir, ".test-artifact-backup-"));
const artifacts = ["reports", "data"].map((name) => ({ name,
  directory: path.join(rootDir, name), backup: path.join(backupRoot, name),
  existed: fs.existsSync(path.join(rootDir, name)), mode: "EMPTY", isolated: false,
}));

function isolateArtifact(item) {
  if (!item.existed) {
    item.isolated = true;
    fs.mkdirSync(item.directory, { recursive: true });
    return;
  }
  try {
    fs.renameSync(item.directory, item.backup);
    item.mode = "ATOMIC_DIRECTORY_SWAP";
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    fs.cpSync(item.directory, item.backup, { recursive: true });
    item.mode = "COPY_FALLBACK";
  }
  item.isolated = true;
  fs.rmSync(item.directory, { recursive: true, force: true });
  fs.mkdirSync(item.directory, { recursive: true });
}

function restoreArtifact(item) {
  if (!item.isolated) return;
  fs.rmSync(item.directory, { recursive: true, force: true });
  if (item.existed) {
    if (item.mode === "ATOMIC_DIRECTORY_SWAP") fs.renameSync(item.backup, item.directory);
    else fs.cpSync(item.backup, item.directory, { recursive: true });
  }
}

const testFiles = fs
  .readdirSync(testDir)
  .filter((fileName) => fileName.endsWith(".test.js"))
  .sort()
  .map((fileName) => path.join("test", fileName));

let result;
try {
  for (const item of artifacts) isolateArtifact(item);
  console.log(`Test artifact isolation: ${artifacts.map((item) => `${item.name}=${item.mode}`).join(", ")}`);
  // Test modules share generated data/ and reports/ paths. Running them in a
  // single worker prevents cross-test artifact races from masquerading as an
  // engine-health regression.
  result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", ...testFiles], {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
  });
} finally {
  const restoreErrors = [];
  for (const item of [...artifacts].reverse()) {
    try { restoreArtifact(item); } catch (error) { restoreErrors.push(error); }
  }
  if (restoreErrors.length) throw new AggregateError(restoreErrors, `Test artifacts could not be restored; backups retained at ${backupRoot}`);
  fs.rmSync(backupRoot, { recursive: true, force: true });
}

if (result.error) {
  throw result.error;
}

process.exitCode = Number.isInteger(result.status) ? result.status : 1;
