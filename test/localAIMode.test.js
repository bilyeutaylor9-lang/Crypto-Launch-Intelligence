import test from "node:test";
import assert from "node:assert/strict";

import { resolveLocalAIOptions } from "../src/index.js";

test("normal Mac scanner mode runs one inline local-AI review and queues remaining research", () => {
  assert.deepEqual(resolveLocalAIOptions({}), {
    mode: "AUTO",
    queue: true,
    inline: true,
    inlineLimit: 1,
    topProjectLimit: 100,
  });
});

test("local AI modes retain explicit queue and off controls", () => {
  assert.deepEqual(resolveLocalAIOptions({ LOCAL_AI_MODE: "QUEUE" }), {
    mode: "QUEUE",
    queue: true,
    inline: false,
    inlineLimit: 1,
    topProjectLimit: 100,
  });
  assert.deepEqual(resolveLocalAIOptions({ LOCAL_AI_MODE: "OFF", LOCAL_AI_INLINE_LIMIT: "9" }), {
    mode: "OFF",
    queue: false,
    inline: false,
    inlineLimit: 0,
    topProjectLimit: 0,
  });
  assert.equal(resolveLocalAIOptions({ LOCAL_AI_TOP_PROJECT_LIMIT: "500" }).topProjectLimit, 100);
});
