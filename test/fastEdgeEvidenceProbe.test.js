import test from "node:test";
import assert from "node:assert/strict";

import {
  fastToleranceMinutes,
  selectDueFastEdgeEvidence,
} from "../src/learning/fastEdgeEvidenceProbe.js";

function episode(overrides = {}) {
  return {
    episodeId: "e1",
    role: "TREATMENT",
    chain: "base",
    tokenAddress: "0x" + "1".repeat(40),
    poolAddress: "0x" + "2".repeat(40),
    routeKey: `base:${"0x" + "1".repeat(40)}:${"0x" + "2".repeat(40)}`,
    signalObservedAt: "2026-01-01T00:00:00.000Z",
    signalPriceUsd: 1,
    ...overrides,
  };
}

test("5 minute observation is due only inside tight window", () => {
  const inside = selectDueFastEdgeEvidence(
    [episode()],
    [],
    { now: "2026-01-01T00:07:00.000Z" }
  );
  assert.equal(inside.length, 1);
  assert.ok(inside[0].dueEpisodes.some((row) => row.horizonMinutes === 5));

  const late = selectDueFastEdgeEvidence(
    [episode()],
    [],
    { now: "2026-01-01T00:10:00.000Z" }
  );
  assert.equal(
    late.flatMap((row) => row.dueEpisodes).some((row) => row.horizonMinutes === 5),
    false
  );
});

test("resolved fast observation is never requested again", () => {
  const outcomes = [{ observationId: "fast:e1:5m" }];
  const due = selectDueFastEdgeEvidence(
    [episode()],
    outcomes,
    { now: "2026-01-01T00:06:00.000Z" }
  );
  assert.equal(
    due.flatMap((row) => row.dueEpisodes).some((row) => row.horizonMinutes === 5),
    false
  );
});

test("short horizons use stricter tolerance", () => {
  assert.ok(fastToleranceMinutes(5) < fastToleranceMinutes(180));
});
