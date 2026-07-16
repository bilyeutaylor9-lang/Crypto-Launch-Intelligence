import test from "node:test";
import assert from "node:assert/strict";

import { createScanRecord } from "../src/learning/scanMemoryStore.js";

test("scan memory records remain serializable when engine payloads are oversized or cyclic", () => {
  const cyclicPayload = { largeText: "x".repeat(250_000) };
  cyclicPayload.self = cyclicPayload;

  const record = createScanRecord({
    name: "Memory Candidate",
    symbol: "MEM",
    chain: "base",
    pipelineScore: 77,
    riskScore: 22,
    alphaTags: ["AI", "Early"],
    riskFlags: ["Needs verification"],
    opportunityThesis: "t".repeat(2_000),
    externalIntelligence: { narrativeHits: ["ai", "infrastructure"], payload: cyclicPayload },
    aiEcosystemCouncil: cyclicPayload,
    autonomousResearchOrchestrator: cyclicPayload,
    finalSelectionState: "RESEARCH_ONLY",
  });

  const serialized = JSON.stringify(record);

  assert.equal(record.signals.snapshotVersion, 2);
  assert.equal(record.signals.externalIntelligence.narrativeHits[0], "ai");
  assert.equal(record.signals.finalSelectionState, "RESEARCH_ONLY");
  assert.ok(serialized.length < 20_000);
});
