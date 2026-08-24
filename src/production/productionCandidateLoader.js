import fs from "node:fs";
import path from "node:path";

import { loadEdgeCandidateUniverse } from "../data/edgeCandidateUniverseStore.js";
import { strictIdentityKey, timestamp } from "./productionMath.js";

function readReport(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch { return null; }
}

export function loadProductionCandidates(options = {}) {
  const universe = options.universe || loadEdgeCandidateUniverse();
  const exactUniverse = (universe.candidates || []).filter((row) => strictIdentityKey(row));
  const reportFile = options.reportFile || "reports/report.json";
  const report = options.report || readReport(reportFile);
  const reportRows = Array.isArray(report?.projects) ? report.projects : [];
  const reportByIdentity = new Map(
    reportRows
      .map((row) => [strictIdentityKey(row), row])
      .filter(([key]) => Boolean(key))
  );

  const candidates = exactUniverse.map((descriptor) => {
    const key = strictIdentityKey(descriptor);
    const richer = reportByIdentity.get(key);
    // The exact universe descriptor owns identity fields. A report may enrich
    // evidence but can never change the frozen chain/token/pool identity.
    return richer
      ? {
          ...descriptor,
          ...richer,
          chain: descriptor.chain,
          tokenAddress: descriptor.tokenAddress,
          poolAddress: descriptor.poolAddress,
          identityKey: key,
          candidateDataMode: "EXACT_UNIVERSE_PLUS_REPORT_EVIDENCE",
        }
      : {
          ...descriptor,
          identityKey: key,
          candidateDataMode: "EXACT_UNIVERSE_DESCRIPTOR_ONLY",
        };
  });

  const reportAt = report?.generatedAt && timestamp(report.generatedAt) !== null ? report.generatedAt : null;
  const universeAt = universe.generatedAt && timestamp(universe.generatedAt) !== null ? universe.generatedAt : null;
  return {
    candidates,
    exactCandidateCount: candidates.length,
    enrichedCandidateCount: candidates.filter((row) => row.candidateDataMode === "EXACT_UNIVERSE_PLUS_REPORT_EVIDENCE").length,
    sourceObservedAt: reportAt || universeAt || null,
    reportAvailable: Boolean(report),
    reportGeneratedAt: reportAt,
    universeGeneratedAt: universeAt,
    policy: "Only exact candidates already admitted to the edge candidate universe are eligible. report.json may enrich evidence but cannot introduce or rewrite identity.",
  };
}
