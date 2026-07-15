import fs from "fs";
import path from "path";
import { summarizeUniverseLedger } from "../learning/universeLedgerStore.js";

function compactRecord(record = {}) {
  return {
    projectId: record.projectId,
    identityKey: record.identityKey,
    name: record.canonicalIdentity?.name || "Unknown",
    symbol: record.canonicalIdentity?.symbol || "UNKNOWN",
    chain: record.canonicalIdentity?.chain || "unknown",
    finalState: record.finalState || "UNKNOWN",
    finalQualified: Boolean(record.finalQualified),
    finalConfidence: record.finalConfidence || "Unknown",
    lifecycleState: record.lifecycleState || "UNKNOWN",
    funnelStage: record.processing?.stage || "UNKNOWN",
    reason: record.processing?.reason || "",
    dataCoverageScore: record.dataCoverageScore || 0,
    riskClass: record.riskClass || "unknown",
    aggregateRiskScore: record.aggregateRiskScore || 0,
    discoveryPriorityScore: record.baselineScan?.discoveryPriorityScore || 0,
    sourceCount: record.sourceCoverage?.sourceCount || 0,
    sources: record.sourceCoverage?.sources || [],
    blockingReasons: record.finalBlockingReasons || [],
    warningReasons: record.finalWarningReasons || [],
    invalidationConditions: record.finalInvalidationConditions || [],
    evidenceFamilies: Object.fromEntries(
      Object.entries(record.finalEvidenceFamilies || {}).map(([family, value]) => [
        family,
        {
          status: value.status,
          score: value.score,
          evidence: value.evidence || [],
        },
      ])
    ),
  };
}

export function buildUniverseLedgerReport(meta = {}) {
  const ledger = summarizeUniverseLedger();
  const discoveryLedger = meta.discovery?.universeLedger || null;

  return {
    generatedAt: new Date().toISOString(),
    name: "39,000 Project Universe Ledger",
    description:
      "A production accounting layer for the full discovered universe. Every deduped project receives canonical identity, baseline coverage, risk class, lifecycle state, final state, evidence-family status, and an explicit promotion, deferral, or block reason before deep research.",
    operatingModel: [
      "Complete discovery",
      "Canonical identity",
      "Universal baseline",
      "Evidence-family accounting",
      "Competitive analysis",
      "Deep sniper analysis",
      "Autonomous research",
    ],
    authoritativeFinalFields: [
      "finalState",
      "finalQualified",
      "finalConfidence",
      "finalBlockingReasons",
      "finalEvidenceFamilies",
      "finalInvalidationConditions",
    ],
    scanLedger: discoveryLedger,
    persistentLedger: {
      file: ledger.file,
      generatedAt: ledger.generatedAt,
      trackedProjects: ledger.trackedProjects,
      totals: ledger.totals,
      indexes: ledger.indexes,
    },
    topPromoted: (ledger.topPromoted || []).slice(0, 100).map(compactRecord),
    topBlocked: (ledger.topBlocked || []).slice(0, 100).map(compactRecord),
    lowCoverage: (ledger.lowCoverage || []).slice(0, 100).map(compactRecord),
  };
}

export function writeUniverseLedgerReport(meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = buildUniverseLedgerReport(meta);
  const filePath = path.join(reportsDir, "universe-ledger.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}
