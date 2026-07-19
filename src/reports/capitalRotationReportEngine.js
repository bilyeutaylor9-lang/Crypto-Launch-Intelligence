import fs from "fs";
import path from "path";

import { buildCapitalRotationMap } from "../engines/capitalRotationMapEngine.js";

function writeJson(fileName = "", value = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const filePath = path.join(reportsDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
  return filePath;
}

export function writeCapitalRotationReports(projects = []) {
  const rotation = buildCapitalRotationMap(projects);
  return {
    chainCapitalRotationPath: writeJson("chain-capital-rotation.json", {
      generatedAt: rotation.generatedAt,
      projectsAnalyzed: rotation.projectsAnalyzed,
      topChainReceivingCapital: rotation.topChainReceivingCapital,
      chainRotation: rotation.chainRotation,
    }),
    narrativeCapitalRotationPath: writeJson("narrative-capital-rotation.json", {
      generatedAt: rotation.generatedAt,
      projectsAnalyzed: rotation.projectsAnalyzed,
      topNarrativeReceivingCapital: rotation.topNarrativeReceivingCapital,
      narrativeRotation: rotation.narrativeRotation,
      researchOnlyBeforeSocialAttention: rotation.researchOnlyBeforeSocialAttention,
    }),
    marketCapRotationPath: writeJson("market-cap-rotation.json", {
      generatedAt: rotation.generatedAt,
      projectsAnalyzed: rotation.projectsAnalyzed,
      fastestImprovingMarketCapBucket: rotation.fastestImprovingMarketCapBucket,
      marketCapRotation: rotation.marketCapRotation,
    }),
    capitalOutflowWatchPath: writeJson("capital-outflow-watch.json", {
      generatedAt: rotation.generatedAt,
      projectsAnalyzed: rotation.projectsAnalyzed,
      outflowWatch: rotation.outflowWatch,
      reason:
        rotation.outflowWatch.length
          ? "Projects with observed negative flow or capital-outflow lane."
          : "NO_CAPITAL_OUTFLOW_DETECTED",
    }),
    report: rotation,
  };
}
