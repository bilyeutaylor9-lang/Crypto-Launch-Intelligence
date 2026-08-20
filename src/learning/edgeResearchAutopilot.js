import fs from "node:fs";
import path from "node:path";

const REPORT_FILE = path.resolve("reports", "edge-research-autopilot.json");

export function buildEdgeResearchAutopilot(inputs = {}, options = {}) {
  const health = inputs.health || {};
  const outcomeLab = inputs.outcomeLab || {};
  const avoidanceVerification = inputs.avoidanceVerification || {};
  const discovery = inputs.discovery || {};
  let state = "AUTOPILOT_EVIDENCE_WARMING";
  if (health.state === "AUTOPILOT_EVIDENCE_COVERAGE_BLOCKED") {
    state = "AUTOPILOT_EVIDENCE_COVERAGE_BLOCKED";
  } else if (outcomeLab.verification?.state === "VERIFIED_MATCHED_NET_EDGE") {
    state = "AUTOPILOT_VERIFIED_EDGE_REVIEW";
  } else if (health.state === "AUTOPILOT_EVIDENCE_HEALTHY") {
    state = "AUTOPILOT_RESEARCH_ACTIVE";
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date(options.now || Date.now()).toISOString(),
    state,
    evidenceHealthState: health.state || "UNKNOWN",
    edgeVerificationState: outcomeLab.verification?.state || "UNKNOWN",
    avoidanceVerificationState: avoidanceVerification.state || "UNKNOWN",
    verifiedAvoidanceEdges: (avoidanceVerification.verifiedEdges || []).map((edge) => ({
      signal: edge.signal,
      horizonHours: edge.horizonHours,
      avoidanceEffectPct: edge.avoidanceEffectPct,
      lower95Pct: edge.projectClusteredBootstrap95?.lower95Pct ?? null,
      scope: "SAME_REGIME_EXCLUSION_ONLY",
    })),
    nextMechanism: discovery.nextExperiment?.mechanism || null,
    currentHypothesis: "COMMITTED_LOADED_VACUUM_SHADOW",
    hypothesisChanged: false,
    verifiedEdge: state === "AUTOPILOT_VERIFIED_EDGE_REVIEW"
      ? {
          kind: "MATCHED_NET_TREATMENT_EDGE",
          horizonHours: 168,
          metrics: outcomeLab.byHorizon?.["168h"] || null,
          humanReviewRequired: true,
        }
      : null,
    missingEvidenceTreatment: "UNKNOWN_NOT_FAILURE_NOT_ZERO_RETURN",
    picksForced: false,
    gatesLowered: false,
    rankingInfluence: false,
    scoringInfluence: false,
    automaticProductionPromotion: false,
    automaticTrading: false,
    policy: "Autopilot may collect evidence and choose the next research mechanism. Same-regime avoidance evidence is exclusion-only, and even verified matched net evidence requires human review. Neither can bypass identity, safety, liquidity, execution, or final-selection gates.",
  };
}

export function runEdgeResearchAutopilot(inputs = {}, options = {}) {
  const report = buildEdgeResearchAutopilot(inputs, options);
  if (options.writeReport !== false) {
    const file = options.reportFile || REPORT_FILE;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

export const EDGE_RESEARCH_AUTOPILOT_REPORT = REPORT_FILE;
