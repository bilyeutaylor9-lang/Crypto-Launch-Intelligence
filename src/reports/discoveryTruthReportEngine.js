import fs from "fs";
import path from "path";
import { getSourceManifest } from "../config/sourceManifest.js";

export function writeDiscoveryTruthReport(meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const discovery = meta.discovery || {};
  const coverage = discovery.discoveryCoverage || {};
  const audit = discovery.sourceCapabilityAudit || {};
  const sourceManifest = discovery.sourceManifest || audit.sources || getSourceManifest();
  const report = {
    generatedAt: new Date().toISOString(),
    name: "Discovery Truth Network",
    mode: discovery.mode || meta.mode || "unknown",
    scannedAt: discovery.scannedAt || null,
    rawCount: discovery.rawCount || 0,
    dedupedCount: discovery.dedupedCount || 0,
    acceptedBeforeLimitCount: discovery.acceptedBeforeLimitCount || 0,
    acceptedAfterLimitCount: discovery.acceptedCount || 0,
    rejectedCount: discovery.rejectedCount || 0,
    sourceCapabilityAudit: audit,
    discoveryCoverage: coverage,
    sourceManifest,
    sourceRouter: discovery.sourceRouter || {},
    shadowRejectedCandidates: discovery.shadowRejectedCandidates || coverage.shadowRejected || [],
    operatingRules: [
      "A source counts as active only after returning live candidates.",
      "Discovery priority rewards novelty, formation velocity, independent evidence families, deployer quality, and launch proximity.",
      "Discovery priority does not reward absolute market cap.",
      "Rejected candidates remain visible in the shadow watchlist for recall analysis.",
      "FDV, estimated market cap, and circulating market cap are kept separate.",
    ],
    nextNativeConnectors: [
      "EVM factory PairCreated/PoolCreated listeners",
      "EVM contract deployment and initial-liquidity listeners",
      "Solana Raydium/Meteora/Orca program event listeners",
      "Bridge, locker, vesting, and launchpad event listeners",
    ],
  };
  const filePath = path.join(reportsDir, "discovery-truth.json");

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}
