import test from "node:test";
import assert from "node:assert/strict";

import { chatWithOllama, inspectOllama, parseModelJson } from "../src/brain/localAIClient.js";

test("Ollama inspection reports the configured local model", async () => {
  const result = await inspectOllama({
    baseUrl: "http://local.test",
    model: "qwen3:4b",
    fetchImpl: async (url) => {
      assert.equal(url, "http://local.test/api/tags");
      return {
        ok: true,
        json: async () => ({ models: [{ name: "qwen3:4b" }, { name: "qwen3:1.7b" }] }),
      };
    },
  });

  assert.equal(result.reachable, true);
  assert.equal(result.modelInstalled, true);
  assert.deepEqual(result.models, ["qwen3:4b", "qwen3:1.7b"]);
});

test("Ollama chat sends a bounded JSON request and returns model content", async () => {
  const result = await chatWithOllama(
    [{ role: "user", content: "Research only." }],
    {
      baseUrl: "http://local.test",
      model: "qwen3:4b",
      fetchImpl: async (url, request) => {
        assert.equal(url, "http://local.test/api/chat");
        assert.equal(request.method, "POST");
        const payload = JSON.parse(request.body);
        assert.equal(payload.model, "qwen3:4b");
        assert.equal(payload.stream, false);
        assert.equal(payload.format, "json");
        return {
          ok: true,
          json: async () => ({ model: "qwen3:4b", message: { content: '{"assessment":"ok"}' } }),
        };
      },
    }
  );

  assert.equal(result.model, "qwen3:4b");
  assert.deepEqual(parseModelJson(result.content), { assessment: "ok" });
});

test("model JSON parser accepts fenced JSON and rejects unstructured text", () => {
  assert.deepEqual(parseModelJson("```json\n{\"confidence\": 42}\n```"), { confidence: 42 });
  assert.equal(parseModelJson("this is not JSON"), null);
});
