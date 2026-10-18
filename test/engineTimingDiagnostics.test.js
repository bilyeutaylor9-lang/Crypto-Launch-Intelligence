import test from "node:test";
import assert from "node:assert/strict";
import { runEngine } from "../src/intelligencePipeline.js";

test("pipeline timing diagnostics are opt-in and preserve engine output", async () => {
  const original = process.env.PIPELINE_ENGINE_TIMINGS;
  const log = console.log;
  const messages = [];
  console.log = (...args) => messages.push(args.join(" "));
  try {
    delete process.env.PIPELINE_ENGINE_TIMINGS;
    assert.deepEqual(await runEngine("Timing Diagnostic", projects => projects, []), []);
    assert.equal(messages.some(message => message.startsWith("[Pipeline Timing]")), false);
    process.env.PIPELINE_ENGINE_TIMINGS = "true";
    assert.deepEqual(await runEngine("Timing Diagnostic", projects => projects, []), []);
    const timings = messages.filter(message => message.startsWith("[Pipeline Timing]"));
    assert.equal(timings.length, 1);
    assert.match(timings[0], /^\[Pipeline Timing\] Timing Diagnostic: \d+ms$/);
  } finally {
    console.log = log;
    if (original === undefined) delete process.env.PIPELINE_ENGINE_TIMINGS;
    else process.env.PIPELINE_ENGINE_TIMINGS = original;
  }
});
