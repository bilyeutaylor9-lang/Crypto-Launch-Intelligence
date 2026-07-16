import fs from "fs";
import path from "path";

function countItems(value) {
  return Array.isArray(value) ? value.length : 0;
}

function summarizeDiscovery(discovery = {}) {
  if (!discovery || typeof discovery !== "object" || Array.isArray(discovery)) {
    return discovery;
  }

  // A wide discovery run can contain tens of thousands of raw candidates. Those
  // belong in the universe ledger, not inside every final report artifact.
  const coverage = discovery.discoveryCoverage || {};
  const ledger = discovery.universeLedger || {};

  return {
    scannedAt: discovery.scannedAt,
    mode: discovery.mode,
    rawCount: discovery.rawCount,
    dedupedCount: discovery.dedupedCount,
    acceptedCount: discovery.acceptedCount,
    acceptedBeforeLimitCount: discovery.acceptedBeforeLimitCount,
    scanLimit: discovery.scanLimit,
    targetCandidates: discovery.targetCandidates,
    candidateCount: countItems(discovery.candidates),
    shadowRejectedCandidateCount: countItems(discovery.shadowRejectedCandidates),
    rejectedCount: discovery.rejectedCount,
    providerHealth: discovery.providerHealth,
    freeMode: discovery.freeMode,
    wideConfig: discovery.wideConfig,
    targetCoverage: discovery.targetCoverage,
    qualityGate: discovery.qualityGate,
    sourceReports: discovery.sourceReports,
    sourceRouter: discovery.sourceRouter,
    sourceRouterReport: discovery.sourceRouterReport,
    discoveryCoverage: {
      rawCount: coverage.rawCount,
      dedupedCount: coverage.dedupedCount,
      acceptedCount: coverage.acceptedCount,
      rejectedCount: coverage.rejectedCount,
      limitedCount: coverage.limitedCount,
      shadowRejectedCount: countItems(coverage.shadowRejected),
    },
    universeLedger: {
      status: ledger.status,
      savedProjects: ledger.savedProjects,
      totals: ledger.totals,
      collisions: ledger.collisions,
    },
  };
}

function summarizeMeta(meta = {}) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return meta;

  const { discovery, ...rest } = meta;
  return discovery ? { ...rest, discovery: summarizeDiscovery(discovery) } : rest;
}

export function writeJsonReport(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = {
    generatedAt: new Date().toISOString(),
    totalProjects: projects.length,
    meta: summarizeMeta(meta),
    projects,
  };

  const filePath = path.join(reportsDir, "report.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return filePath;
}
