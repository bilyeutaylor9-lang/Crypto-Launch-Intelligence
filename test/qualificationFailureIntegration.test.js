import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildEdgeResearchAutopilot } from "../src/learning/edgeResearchAutopilot.js";
import { runQualificationFailureMicroscope } from "../src/diagnostics/qualificationFailureMicroscope.js";

test("autopilot acquisition-health block takes precedence over a nominal verified edge", () => {
  const report = buildEdgeResearchAutopilot({
    acquisitionHealth: {
      state: "ACQUISITION_FAILED",
      blockResearchAdvancement: true,
      blockers: ["CHAIN_CONTINUITY_GAP"],
    },
    health: { state: "AUTOPILOT_EVIDENCE_HEALTHY" },
    outcomeLab: { verification: { state: "VERIFIED_MATCHED_NET_EDGE" } },
    avoidanceVerification: {},
    prospectiveEntryEdge: {},
    discovery: {},
  });
  assert.equal(report.state, "AUTOPILOT_ACQUISITION_HEALTH_BLOCKED");
  assert.equal(report.automaticTrading, false);
  assert.equal(report.automaticProductionPromotion, false);
});

test("healthy no-event acquisition does not suppress independently verified research review", () => {
  const report = buildEdgeResearchAutopilot({
    acquisitionHealth: {
      state: "ACQUISITION_HEALTHY_NO_EVENT",
      blockResearchAdvancement: false,
      blockers: [],
    },
    health: { state: "AUTOPILOT_EVIDENCE_HEALTHY" },
    outcomeLab: { verification: { state: "VERIFIED_MATCHED_NET_EDGE" }, byHorizon: {} },
    avoidanceVerification: {},
    prospectiveEntryEdge: {},
    discovery: {},
  });
  assert.equal(report.state, "AUTOPILOT_VERIFIED_EDGE_REVIEW");
});

test("qualification CLI writes a machine-readable death map", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "micro-run-"));
  const inputFile = path.join(dir, "report.json");
  const reportFile = path.join(dir, "micro.json");
  const project = {
    symbol: "X",
    chain: "base",
    tokenAddress: "0x0000000000000000000000000000000000000001",
    poolAddress: "0x0000000000000000000000000000000000000101",
    coreEvidenceState: "CORE_EVIDENCE_READY",
    candidateProofState: {
      identity: {
        status: "VERIFIED",
        exactIdentityVerified: true,
        chain: "base",
        tokenAddress: "0x0000000000000000000000000000000000000001",
        poolAddress: "0x0000000000000000000000000000000000000101",
      },
      safety: { status: "VERIFIED_SAFE", deterministicBlocks: [] },
      globalRoute: {
        status: "ROUTE_VERIFIED",
        buyQuoteVerified: true,
        sellQuoteVerified: true,
        depthVerified: true,
        slippageVerified: true,
        quoteFresh: true,
      },
      userAccess: { status: "UNKNOWN" },
    },
    finalSelectionState: "INSUFFICIENT_DATA",
    finalSelectionQualified: false,
    canonicalThreeClockEdge: {
      qualifying: true,
      sequence: { state: "THREE_CLOCK_PRE_CONSENSUS" },
      priceMateriallyExtended: false,
    },
    capitalArrivalIntelligence: {
      state: "COMMITTED_LOADED_VACUUM_SHADOW",
      supplyVacuumSupported: true,
    },
    sellerInventoryState: "THINNING",
    sellerExhaustionScore: 70,
  };
  fs.writeFileSync(inputFile, JSON.stringify({ projects: [project] }));
  const report = runQualificationFailureMicroscope({ inputFile, reportFile });
  assert.equal(report.verifiedRouteDeathMap["UNKNOWN:USER_ACCESS"], 1);
  assert.equal(JSON.parse(fs.readFileSync(reportFile, "utf8")).invariants.automaticTrading, false);
  fs.rmSync(dir, { recursive: true, force: true });
});
