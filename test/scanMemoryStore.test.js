import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { appendMemorySidecar } from "../src/learning/boundedMemoryStore.js";
import {
  createScanRecord,
  loadScanMemoryFromFile,
} from "../src/learning/scanMemoryStore.js";

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

test("scan memory loader prefers bounded sidecar tail over oversized legacy JSON", () => {
  const previousLimit = process.env.MEMORY_REWRITE_LIMIT_MB;
  const previousLoad = process.env.MAX_SCAN_MEMORY_LOAD_RECORDS;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-memory-sidecar-"));
  const legacyPath = path.join(dir, "scan-history.json");

  process.env.MEMORY_REWRITE_LIMIT_MB = "1";
  process.env.MAX_SCAN_MEMORY_LOAD_RECORDS = "3";

  try {
    fs.writeFileSync(legacyPath, `[${" ".repeat(1_200_000)}]`);
    appendMemorySidecar(
      legacyPath,
      Array.from({ length: 5 }, (_, index) => ({
        id: `project-${index}`,
        symbol: `P${index}`,
        scores: { pipeline: index },
      })),
      { recordType: "scan-history" }
    );

    const loaded = loadScanMemoryFromFile(legacyPath, { useCache: false });

    assert.equal(loaded.length, 3);
    assert.deepEqual(loaded.map((record) => record.id), ["project-2", "project-3", "project-4"]);
  } finally {
    if (previousLimit === undefined) {
      delete process.env.MEMORY_REWRITE_LIMIT_MB;
    } else {
      process.env.MEMORY_REWRITE_LIMIT_MB = previousLimit;
    }
    if (previousLoad === undefined) {
      delete process.env.MAX_SCAN_MEMORY_LOAD_RECORDS;
    } else {
      process.env.MAX_SCAN_MEMORY_LOAD_RECORDS = previousLoad;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
