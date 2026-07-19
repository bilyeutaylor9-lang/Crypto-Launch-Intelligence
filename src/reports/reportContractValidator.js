import fs from "fs";
import path from "path";

export const REQUIRED_REPORT_FILES = [
  "small-cap-hunter.json",
  "proof-of-alpha-execution-twin.json",
  "organic-demand-integrity.json",
  "quantum-field.json",
  "quantum-reasoning-brain.json",
  "quantum-suite-health.json",
  "debug-execution-proof.json",
  "debug-stage-health.json",
  "engine-data-readiness.json",
];

function invalidValueIssues(value, location = "root", issues = []) {
  if (value === undefined) {
    issues.push(`${location}: undefined`);
    return issues;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    issues.push(`${location}: non-finite number`);
    return issues;
  }
  if (typeof value === "string" && /^(nan|infinity|-infinity)$/i.test(value.trim())) {
    issues.push(`${location}: non-finite string`);
    return issues;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => invalidValueIssues(item, `${location}[${index}]`, issues));
    return issues;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, nested]) => invalidValueIssues(nested, `${location}.${key}`, issues));
  }
  return issues;
}

export function validateReportContracts(options = {}) {
  const reportsDir = path.resolve(options.reportsDir || "reports");
  const requiredFiles = options.requiredFiles || REQUIRED_REPORT_FILES;
  const files = [];
  const errors = [];

  for (const fileName of requiredFiles) {
    const filePath = path.join(reportsDir, fileName);
    if (!fs.existsSync(filePath)) {
      errors.push(`${fileName}: missing required report`);
      files.push({ fileName, status: "MISSING" });
      continue;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const valueIssues = invalidValueIssues(parsed, fileName).slice(0, 25);
      if (valueIssues.length) {
        errors.push(...valueIssues);
        files.push({ fileName, status: "INVALID", issues: valueIssues });
      } else {
        files.push({ fileName, status: "PASS" });
      }
    } catch (error) {
      errors.push(`${fileName}: malformed JSON (${error.message})`);
      files.push({ fileName, status: "MALFORMED", error: error.message });
    }
  }

  return {
    status: errors.length ? "FAIL" : "PASS",
    reportsDir,
    requiredFiles,
    checkedFiles: requiredFiles.length,
    files,
    errors,
  };
}

export function assertReportContracts(options = {}) {
  const result = validateReportContracts(options);
  if (result.status !== "PASS") {
    const message = [
      "Required report contract validation failed.",
      ...result.errors.slice(0, 20).map((error) => `- ${error}`),
    ].join("\n");
    const error = new Error(message);
    error.reportContractValidation = result;
    throw error;
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = validateReportContracts();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "PASS") process.exitCode = 1;
}
