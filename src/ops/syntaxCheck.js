import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const ROOTS = ["src", "test"];
const SKIP_DIRS = new Set(["node_modules", "reports", "data", "docs", ".git"]);

function collectJsFiles(dir = "") {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...collectJsFiles(path.join(dir, entry.name)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(path.join(dir, entry.name));
    }
  }

  return files;
}

export function runSyntaxCheck(options = {}) {
  const files = (options.files || ROOTS.flatMap(collectJsFiles)).sort();
  const failures = [];

  for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], {
      encoding: "utf8",
    });

    if (result.status !== 0) {
      failures.push({
        file,
        stderr: result.stderr,
        stdout: result.stdout,
      });
    }
  }

  return {
    status: failures.length ? "FAILED" : "OK",
    checkedFiles: files.length,
    failures,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runSyntaxCheck();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "OK") process.exit(1);
}
