import test from "node:test";
import assert from "node:assert/strict";

import {
  getProjectAutonomousResearchHistory,
  loadAutonomousResearchMemory,
} from "../src/learning/autonomousResearchMemoryStore.js";

test("autonomous research memory exposes a stable indexed history lookup", () => {
  const memory = loadAutonomousResearchMemory();
  const history = getProjectAutonomousResearchHistory({ chain: "base", symbol: "MEMORY_CHECK" });

  assert.ok(Array.isArray(memory.records));
  assert.ok(Array.isArray(history));
});
