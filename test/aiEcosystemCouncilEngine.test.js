import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeAIEcosystemCouncilBatch,
} from "../src/engines/aiEcosystemCouncilEngine.js";

test("AI council batch reuses one supplied performance snapshot", () => {
  const performance = {
    weights: {
      "Narrative Scout": 1.1,
      "Quant Forecaster": 1.1,
      "Flow Analyst": 1.1,
      "Research Analyst": 1.1,
      "Learning Engine": 1.1,
      "Risk Officer": 1.2,
    },
  };
  const projects = [
    { name: "Council One", symbol: "C1", pipelineScore: 72, dataConfidenceScore: 70, proofScore: 65 },
    { name: "Council Two", symbol: "C2", pipelineScore: 68, dataConfidenceScore: 64, proofScore: 60 },
  ];

  const results = analyzeAIEcosystemCouncilBatch(projects, { performance });

  assert.equal(results.length, 2);
  assert.equal(results[0].aiEcosystemCouncil.performanceWeights, performance.weights);
  assert.equal(results[1].aiEcosystemCouncil.performanceWeights, performance.weights);
});
