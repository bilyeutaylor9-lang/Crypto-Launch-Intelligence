import test from "node:test";
import assert from "node:assert/strict";

import { summarizeAgentPerformanceMemory } from "../src/learning/agentPerformanceMemoryStore.js";

test("agent performance summary is reused while its store file is unchanged", () => {
  const first = summarizeAgentPerformanceMemory();
  const second = summarizeAgentPerformanceMemory();

  assert.equal(first, second);
  assert.ok(first.weights);
});
