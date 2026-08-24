import test from "node:test";
import assert from "node:assert/strict";

import { runForwardEvidenceCapture } from "../src/index.js";

test("scan forward-evidence capture freezes, probes, and grades without influencing production", async () => {
  const now = "2026-08-24T12:00:00.000Z";
  let shadowOptions = null;
  let probeOptions = null;
  let gradeOptions = null;

  const result = await runForwardEvidenceCapture({
    now,
    codeCommitSha: "abc123",
    runProductionShadowCycle: async (options) => {
      shadowOptions = options;
      return {
        marketObservationAudit: { saved: 12 },
        prospectiveCohort: {
          state: "PROSPECTIVE_EDGE_COHORT_FROZEN",
          audit: { treatmentsFrozen: 3, controlsFrozen: 9 },
        },
      };
    },
    runOutcomeProbe: async (options) => {
      probeOptions = options;
      return {
        status: "PASS",
        dueCandidates: 5,
        duePredictions: 7,
        exactLedgerObservationsSaved: 5,
        prospectiveEdgeDueCandidates: 2,
        prospectiveEntryEdgeEpisodesTracked: 4,
        prospectiveEntryEdgeDueCandidates: 1,
      };
    },
    runProductionGradeCycle: async (options) => {
      gradeOptions = options;
      return {
        prospectiveEdge: {
          edgeState: "UNVERIFIED_INSUFFICIENT_FORWARD_EVIDENCE",
          current: { sample: { resolvedMatchedPairs: 0 } },
        },
      };
    },
  });

  assert.equal(shadowOptions.now, now);
  assert.equal(shadowOptions.codeCommitSha, "abc123");
  assert.equal(shadowOptions.persistProspectiveCohorts, true);
  assert.deepEqual(probeOptions, { now });
  assert.deepEqual(gradeOptions, { now });
  assert.equal(result.shadow.treatmentsFrozen, 3);
  assert.equal(result.shadow.controlsFrozen, 9);
  assert.equal(result.shadow.exactMarketObservationsSaved, 12);
  assert.equal(result.outcomeProbe.exactMarketObservationsSaved, 5);
  assert.equal(result.outcomeProbe.prospectiveEntryEdgeEpisodesTracked, 4);
  assert.equal(result.outcomeProbe.prospectiveEntryEdgeDueCandidates, 1);
  assert.equal(result.grade.edgeState, "UNVERIFIED_INSUFFICIENT_FORWARD_EVIDENCE");
  assert.equal(result.rankingInfluence, false);
  assert.equal(result.automaticTrading, false);
  assert.equal(result.automaticPromotion, false);
});

test("scan forward-evidence capture exposes a failure but preserves scanner availability", async () => {
  const result = await runForwardEvidenceCapture({
    now: "2026-08-24T12:00:00.000Z",
    runProductionShadowCycle: () => { throw new Error("source not fresh"); },
    runOutcomeProbe: () => ({ status: "NO_OUTCOMES_DUE" }),
    runProductionGradeCycle: () => ({
      prospectiveEdge: { edgeState: "UNVERIFIED", current: { sample: {} } },
    }),
  });

  assert.equal(result.status, "PARTIAL_FAILURE");
  assert.deepEqual(result.errors, [{ stage: "PRODUCTION_SHADOW_CAPTURE", message: "source not fresh" }]);
  assert.equal(result.rankingInfluence, false);
});

test("scan forward-evidence capture can be explicitly disabled", async () => {
  const result = await runForwardEvidenceCapture({ enabled: false });

  assert.equal(result.status, "DISABLED");
  assert.equal(result.rankingInfluence, false);
  assert.equal(result.automaticTrading, false);
});
