import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeXSocialIntelligenceBatch,
} from "../src/engines/xSocialIntelligenceEngine.js";

test("X social batch reuses one supplied watch-store snapshot", () => {
  const watchStore = {
    projects: {
      "base:watch": {
        history: [{ score: 60, conviction: "Watchlist", allocationBucket: "Research" }],
      },
    },
  };

  const [watched, fresh] = analyzeXSocialIntelligenceBatch(
    [
      { name: "Watched", symbol: "WATCH", chain: "base", pipelineScore: 70 },
      { name: "Fresh", symbol: "FRESH", chain: "base", pipelineScore: 70 },
    ],
    { watchStore }
  );

  assert.equal(watched.projectWatchChange.watchedBefore, true);
  assert.equal(watched.projectWatchChange.scoreDelta, 10);
  assert.equal(fresh.projectWatchChange.watchedBefore, false);
});
