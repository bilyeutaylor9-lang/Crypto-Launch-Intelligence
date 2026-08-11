import fs from "fs";
import path from "path";
import { summarizeNativeDiscoveryMesh } from "../data/native/nativeDiscoveryMesh.js";
import { summarizeNativeEventStore } from "../data/native/nativeEventStore.js";
import { summarizeNativeProtocolCoverage } from "../data/native/nativePoolConfig.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function buildNativeDiscoveryMeshReport(projects = [], meta = {}) {
  const discoverySourceReport = meta.discovery?.sourceReports?.nativeDiscoveryMesh || null;
  const eventStore = summarizeNativeEventStore();
  const nativeProjects = projects.filter(
    (project) => project.nativeDiscoveryScore > 0 || project.nativeLifecycle || (project.discoverySources || []).includes("native-discovery-mesh")
  );
  const meshSummary = summarizeNativeDiscoveryMesh({
    candidates: nativeProjects,
    lifecycles: nativeProjects.map((project) => project.nativeLifecycle).filter(Boolean),
    eventCount: num(
      discoverySourceReport?.report?.eventCount ??
      discoverySourceReport?.eventCount ??
      eventStore.confirmedEvents + eventStore.rawEvents
    ),
  });
  const topCandidates = nativeProjects
    .sort((a, b) => num(b.nativeDiscoveryScore) - num(a.nativeDiscoveryScore))
    .slice(0, 25)
    .map((project, index) => ({
      rank: index + 1,
      symbol: project.symbol,
      name: project.name,
      chain: project.chain,
      protocol: project.nativeLifecycle?.protocol || project.source,
      score: project.nativeDiscoveryScore || 0,
      stage: project.nativeLifecycleStage || project.nativeLifecycle?.currentStage || "unknown",
      activeLiquidityTruthScore: project.activeLiquidityTruthScore || 0,
      organicBuyerScore: project.organicBuyerScore || 0,
      deployerReputationScore: project.deployerReputationScore || 0,
      liquidityControlRisk: project.liquidityControlRisk || 0,
      deployerRiskScore: project.deployerRiskScore || 0,
      independentBuyers: project.independentBuyers24h || project.nativeLifecycle?.buyerState?.independentBuyers || 0,
      stableExitLiquidityUsd: project.stableExitLiquidityUsd || project.nativeLifecycle?.liquidityState?.stableExitLiquidityUsd || 0,
      verdicts: {
        liquidity: project.activeLiquidityTruthVerdict,
        buyers: project.organicBuyerVerdict,
        deployer: project.deployerReputationVerdict,
      },
    }));

  return {
    generatedAt: new Date().toISOString(),
    status: meshSummary.status,
    collectionStatus: meshSummary.collectionStatus,
    summary: meshSummary,
    discoverySourceReport,
    eventStore,
    protocolCoverage: summarizeNativeProtocolCoverage(),
    topCandidates,
    missedOpportunityLab: {
      purpose: "Compare native lifecycle candidates that failed later stages against candidates the scanner eventually ranked highly.",
      trackedCandidates: nativeProjects.length,
      watchFor: [
        "pool created but no real external buyers",
        "first buyer cluster came from same funding source",
        "liquidity expanded before smart-wallet arrival",
        "developer sold before buyer milestone",
        "high score rejected by usable-liquidity simulation",
      ],
    },
  };
}

export function writeNativeDiscoveryMeshReport(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = buildNativeDiscoveryMeshReport(projects, meta);
  const filePath = path.join(reportsDir, "native-discovery-mesh.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return { filePath, report };
}
