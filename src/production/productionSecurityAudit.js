import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { writeAtomicJson } from "./atomicArtifactStore.js";

const SECRET_PATTERNS = Object.freeze([
  { name: "OPENAI_KEY", re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "GITHUB_PAT", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { name: "PRIVATE_KEY", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: "SUPABASE_JWTISH", re: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g },
]);

function scanTextFile(file) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch { return []; }
  const findings = [];
  for (const pattern of SECRET_PATTERNS) {
    pattern.re.lastIndex = 0;
    if (pattern.re.test(text)) {
      findings.push({ file, pattern: pattern.name });
    }
  }
  return findings;
}

function walkFiles(root, maxFiles = 5000) {
  const files = [];
  function walk(dir) {
    if (files.length >= maxFiles || !fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (files.length >= maxFiles) break;
      if (["node_modules", ".git", "coverage"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(?:json|jsonl|md|txt|log|html|yml|yaml|js|mjs|env)$/i.test(entry.name)) files.push(full);
    }
  }
  walk(root);
  return files;
}

export function runProductionSecurityAudit(options = {}) {
  const root = path.resolve(options.root || ".");
  const scanRoots = (options.scanRoots || ["reports", "data", "src", ".github"])
    .map((value) => path.join(root, value));
  const files = scanRoots.flatMap((dir) => walkFiles(dir));
  const secretFindings = files.flatMap(scanTextFile);

  const runDependencyAudit = options.runDependencyAudit || (() => spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["audit", "--json", "--audit-level=high"],
    { cwd: root, encoding: "utf8", timeout: Number(options.auditTimeoutMs || 120000) }
  ));
  const npm = runDependencyAudit();

  let npmAudit = null;
  try { npmAudit = JSON.parse(npm.stdout || "{}"); } catch {}
  const auditParseAvailable = Boolean(
    npmAudit &&
    typeof npmAudit === "object" &&
    npmAudit.metadata &&
    typeof npmAudit.metadata.vulnerabilities === "object"
  );
  const high =
    Number(npmAudit?.metadata?.vulnerabilities?.high || 0) +
    Number(npmAudit?.metadata?.vulnerabilities?.critical || 0);
  const dependencyAuditComplete =
    npm.error === undefined &&
    npm.status === 0 &&
    auditParseAvailable;
  const pass = secretFindings.length === 0 && high === 0 && dependencyAuditComplete;

  const report = {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    state: secretFindings.length || high > 0
      ? "SECURITY_AUDIT_FAILED"
      : dependencyAuditComplete
        ? "SECURITY_AUDIT_PASS"
        : "SECURITY_AUDIT_INCOMPLETE",
    pass,
    scannedFiles: files.length,
    secretFindings,
    dependencyAudit: {
      commandAvailable: npm.error === undefined,
      exitCode: npm.status,
      highOrCriticalVulnerabilities: high,
      auditParseAvailable,
      complete: dependencyAuditComplete,
    },
  };

  if (options.writeReport !== false) {
    writeAtomicJson(
      options.reportFile || "reports/production-security-audit.json",
      report
    );
  }
  return report;
}
