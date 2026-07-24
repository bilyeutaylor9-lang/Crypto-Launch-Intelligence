import test from "node:test";
import assert from "node:assert/strict";

import {
  chatWithLocalAI,
  chatWithOllama,
  getLocalAIConfig,
  getOllamaConfig,
  inspectLocalAI,
  inspectOllama,
  parseModelJson,
} from "../src/brain/localAIClient.js";

test("Ollama configuration keeps local responses bounded and disables extended thinking by default", () => {
  const config = getOllamaConfig({ maxTokens: 9_999, think: "false" });

  assert.equal(config.maxTokens, 2_048);
  assert.equal(config.think, false);
});

test("Ollama inspection reports the configured local model", async () => {
  const result = await inspectOllama({
    baseUrl: "http://local.test",
    model: "qwen3",
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

test("local Llama config supports OpenAI-compatible servers", () => {
  const config = getLocalAIConfig({
    provider: "openai-compatible",
    baseUrl: "http://127.0.0.1:1234/v1/",
    model: "llama-3.1-8b-instruct",
    maxTokens: 99,
  });

  assert.equal(config.provider, "openai-compatible");
  assert.equal(config.baseUrl, "http://127.0.0.1:1234/v1");
  assert.equal(config.model, "llama-3.1-8b-instruct");
  assert.equal(config.maxTokens, 99);
});

test("brain cloud env aliases configure OpenAI-compatible local AI client", () => {
  const previous = {
    BRAIN_CLOUD_BASE_URL: process.env.BRAIN_CLOUD_BASE_URL,
    BRAIN_CLOUD_MODEL: process.env.BRAIN_CLOUD_MODEL,
    BRAIN_CLOUD_API_KEY: process.env.BRAIN_CLOUD_API_KEY,
    BRAIN_CLOUD_PROVIDER: process.env.BRAIN_CLOUD_PROVIDER,
  };

  process.env.BRAIN_CLOUD_BASE_URL = "https://brain.example/v1";
  process.env.BRAIN_CLOUD_MODEL = "llama-3.1-cloud";
  process.env.BRAIN_CLOUD_API_KEY = "brain-key";
  process.env.BRAIN_CLOUD_PROVIDER = "openai-compatible";

  try {
    const config = getLocalAIConfig();
    assert.equal(config.provider, "openai-compatible");
    assert.equal(config.baseUrl, "https://brain.example/v1");
    assert.equal(config.model, "llama-3.1-cloud");
    assert.equal(config.apiKey, "brain-key");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("OpenAI-compatible Llama inspection checks /v1/models", async () => {
  const result = await inspectLocalAI({
    provider: "openai-compatible",
    baseUrl: "http://local.test",
    model: "llama-3.1-8b-instruct",
    fetchImpl: async (url, request) => {
      assert.equal(url, "http://local.test/v1/models");
      assert.equal(request.method, "GET");
      return {
        ok: true,
        json: async () => ({ data: [{ id: "llama-3.1-8b-instruct" }] }),
      };
    },
  });

  assert.equal(result.reachable, true);
  assert.equal(result.modelInstalled, true);
  assert.deepEqual(result.models, ["llama-3.1-8b-instruct"]);
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
        assert.equal(payload.think, false);
        assert.equal(payload.options.num_predict, 450);
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

test("OpenAI-compatible Llama chat sends JSON-mode chat completions request", async () => {
  const result = await chatWithLocalAI(
    [{ role: "user", content: "Research only." }],
    {
      provider: "openai-compatible",
      baseUrl: "http://local.test/v1",
      model: "llama-3.1-8b-instruct",
      apiKey: "local-key",
      fetchImpl: async (url, request) => {
        assert.equal(url, "http://local.test/v1/chat/completions");
        assert.equal(request.method, "POST");
        assert.equal(request.headers.authorization, "Bearer local-key");
        const payload = JSON.parse(request.body);
        assert.equal(payload.model, "llama-3.1-8b-instruct");
        assert.equal(payload.stream, false);
        assert.equal(payload.max_tokens, 450);
        assert.deepEqual(payload.response_format, { type: "json_object" });
        return {
          ok: true,
          json: async () => ({
            model: "llama-3.1-8b-instruct",
            choices: [{ message: { content: '{"assessment":"llama-ok"}' } }],
          }),
        };
      },
    }
  );

  assert.equal(result.model, "llama-3.1-8b-instruct");
  assert.deepEqual(parseModelJson(result.content), { assessment: "llama-ok" });
});

test("model JSON parser accepts fenced JSON and rejects unstructured text", () => {
  assert.deepEqual(parseModelJson("```json\n{\"confidence\": 42}\n```"), { confidence: 42 });
  assert.equal(parseModelJson("this is not JSON"), null);
});
