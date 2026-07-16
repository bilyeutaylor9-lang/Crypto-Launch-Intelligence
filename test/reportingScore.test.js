import test from "node:test";
import assert from "node:assert/strict";

import { scoreOf } from "../src/index.js";

test("reporting keeps the current pipeline score instead of ratcheting to a higher fallback", () => {
  const project = {
    pipelineScore: 58,
    marketRankScore: 100,
    richTokenScore: 100,
    prePump: { score: 100 },
  };

  assert.equal(scoreOf(project), 58);
});

test("final integrity can lower the reported score for a rejected candidate", () => {
  const project = {
    pipelineScore: 91,
    finalSelectionState: "BLOCKED",
    finalIntegrityScore: 24,
  };

  assert.equal(scoreOf(project), 24);
});

test("final integrity cannot inflate a qualified candidate score", () => {
  const project = {
    pipelineScore: 71,
    finalSelectionState: "QUALIFIED",
    finalIntegrityScore: 98,
  };

  assert.equal(scoreOf(project), 71);
});
