import fs from "fs";
import path from "path";
import { buildAlphaTruthKernelReport } from "../kernel/alphaTruthKernel.js";

export function writeAlphaTruthKernelReport(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = meta.alphaTruth?.schemaVersion
    ? meta.alphaTruth
    : buildAlphaTruthKernelReport(projects, meta, {
        limit: Number(process.env.ALPHA_TRUTH_REPORT_LIMIT || process.env.ALPHA_TRUTH_RECEIPT_LIMIT || 100),
      });
  const filePath = path.join(reportsDir, "alpha-truth-kernel.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return {
    filePath,
    report,
  };
}
