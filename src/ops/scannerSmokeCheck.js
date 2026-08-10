import fs from "node:fs";
import path from "node:path";

function readJson(fileName = "", reportsDir = path.resolve("reports")) {
  const filePath = path.join(reportsDir, fileName);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return { __readError: error.message };
  }
}

function fail(message = "") {
  return { severity: "FAIL", message };
}

function warn(message = "") {
  return { severity: "WARN", message };
}

export function evaluateScannerSmoke(options = {}) {
  const reportsDir = path.resolve(options.reportsDir || "reports");
  const readiness = readJson("system-readiness.json", reportsDir);
  const starvation = readJson("data-starvation-root-cause.json", reportsDir);
  const engineHealth = readJson("engine-health-report.json", reportsDir) || {};
  const contractHealth = readJson("engine-data-contract-health.json", reportsDir) || {};
  const findings = [];

  if (!readiness) {
    findings.push(fail("system-readiness.json was not generated."));
  } else if (readiness.__readError) {
    findings.push(fail(`system-readiness.json is invalid JSON: ${readiness.__readError}`));
  } else {
    const semanticStatus =
      readiness.scannerSemanticHealth?.status ||
      readiness.selectionOutcomeStatus ||
      "UNKNOWN";
    if (semanticStatus === "DATA_DEGRADED") {
      findings.push(fail("Scanner selection outcome is DATA_DEGRADED."));
    }
    if (!readiness.scannerSemanticHealth) {
      findings.push(fail("System readiness does not include scannerSemanticHealth."));
    }
    if (readiness.status === "FAIL") {
      const areas = Array.isArray(readiness.failures)
        ? readiness.failures.map((item) => item.area).filter(Boolean)
        : [];
      findings.push(warn(`Master readiness is FAIL (${areas.join(", ") || "no failure areas reported"}).`));
    }
  }

  if (!starvation) {
    findings.push(fail("data-starvation-root-cause.json was not generated."));
  } else if (starvation.__readError) {
    findings.push(fail(`data-starvation-root-cause.json is invalid JSON: ${starvation.__readError}`));
  }

  if (engineHealth.status === "FAIL" || Number(engineHealth.failedEngines || engineHealth.enginesFailed || 0) > 0) {
    findings.push(fail("Engine health report contains failed engines."));
  }

  if (
    contractHealth.status === "OUTPUT_CONTRACT_GAPS" ||
    Number(contractHealth.outputContractMismatchProjects || 0) > 0
  ) {
    findings.push(fail("Engine data contract health contains output contract gaps."));
  }

  const fatal = findings.filter((item) => item.severity === "FAIL");
  return {
    status: fatal.length ? "FAIL" : "PASS",
    reportsDir,
    findings,
    scannerSemanticHealth: readiness?.scannerSemanticHealth || null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = evaluateScannerSmoke();
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "PASS") process.exitCode = 1;
}
