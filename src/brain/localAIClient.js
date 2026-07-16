import "../config/loadEnv.js";

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "qwen3:4b";
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_TOKENS = 450;

function normalizedBaseUrl(value = DEFAULT_BASE_URL) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function inferProvider(baseUrl = "") {
  const value = String(baseUrl || "").toLowerCase();
  if (value.endsWith("/v1") || value.includes(":1234") || value.includes(":8080")) return "openai-compatible";
  return "ollama";
}

function normalizeProvider(value = "", baseUrl = DEFAULT_BASE_URL) {
  const raw = String(value || "").trim().toLowerCase();
  if (["openai", "openai-compatible", "openai_compatible", "lmstudio", "lm-studio", "llama.cpp", "llamacpp", "v1"].includes(raw)) {
    return "openai-compatible";
  }
  if (["ollama", "native-ollama"].includes(raw)) return "ollama";
  return inferProvider(baseUrl);
}

function openAICompatibleBaseUrl(baseUrl = DEFAULT_BASE_URL) {
  const normalized = normalizedBaseUrl(baseUrl);
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
}

function timeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timer };
}

function errorMessage(error) {
  if (error?.name === "AbortError") return "Local model request timed out.";
  return String(error?.message || error || "Local model request failed.");
}

function booleanOption(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
}

export function getOllamaConfig(overrides = {}) {
  const baseUrl = normalizedBaseUrl(
    overrides.baseUrl ||
      process.env.LOCAL_AI_BASE_URL ||
      process.env.LLAMA_BASE_URL ||
      process.env.OLLAMA_BASE_URL
  );
  const provider = normalizeProvider(
    overrides.provider || process.env.LOCAL_AI_PROVIDER || process.env.LLAMA_PROVIDER || process.env.OLLAMA_PROVIDER,
    baseUrl
  );

  return {
    provider,
    baseUrl,
    model: String(
      overrides.model ||
        process.env.LOCAL_AI_MODEL ||
        process.env.LLAMA_MODEL ||
        process.env.OLLAMA_MODEL ||
        DEFAULT_MODEL
    ),
    apiKey: String(overrides.apiKey || process.env.LOCAL_AI_API_KEY || process.env.LLAMA_API_KEY || ""),
    timeoutMs: boundedInteger(
      overrides.timeoutMs || process.env.LOCAL_AI_TIMEOUT_MS || process.env.LLAMA_TIMEOUT_MS || process.env.OLLAMA_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      1_000,
      300_000
    ),
    temperature: Number.isFinite(Number(overrides.temperature))
      ? Math.min(1, Math.max(0, Number(overrides.temperature)))
      : Number.isFinite(Number(process.env.LOCAL_AI_TEMPERATURE))
        ? Math.min(1, Math.max(0, Number(process.env.LOCAL_AI_TEMPERATURE)))
        : 0.1,
    maxTokens: boundedInteger(
      overrides.maxTokens ?? process.env.LOCAL_AI_MAX_TOKENS ?? process.env.LLAMA_MAX_TOKENS ?? process.env.OLLAMA_MAX_TOKENS,
      DEFAULT_MAX_TOKENS,
      64,
      2_048
    ),
    think: booleanOption(overrides.think ?? process.env.LOCAL_AI_THINK ?? process.env.OLLAMA_THINK, false),
    jsonMode: booleanOption(overrides.jsonMode ?? process.env.LOCAL_AI_JSON_MODE ?? process.env.LLAMA_JSON_MODE, true),
  };
}

export function parseModelJson(content = "") {
  if (content && typeof content === "object") return content;

  const text = String(content || "").trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (!fenced) return null;

    try {
      return JSON.parse(fenced);
    } catch {
      return null;
    }
  }
}

function modelMatches(models = [], target = "") {
  const wanted = String(target || "").toLowerCase();
  if (!wanted) return false;
  return models.some((model) => {
    const current = String(model || "").toLowerCase();
    return (
      current === wanted ||
      current === `${wanted}:latest` ||
      current.replace(/:latest$/, "") === wanted ||
      current.startsWith(`${wanted}:`) ||
      wanted.startsWith(`${current}:`)
    );
  });
}

function authHeaders(config = {}) {
  return config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {};
}

async function inspectOllamaNative(config = {}, fetchImpl = globalThis.fetch, signal) {
  const response = await fetchImpl(`${config.baseUrl}/api/tags`, {
    method: "GET",
    signal,
  });

  if (!response.ok) {
    return {
      reachable: false,
      modelInstalled: false,
      config,
      error: `Ollama returned HTTP ${response.status}.`,
    };
  }

  const payload = await response.json();
  const models = Array.isArray(payload?.models)
    ? payload.models.map((entry) => String(entry?.name || entry?.model || "")).filter(Boolean)
    : [];

  return {
    reachable: true,
    modelInstalled: modelMatches(models, config.model),
    models,
    config,
  };
}

async function inspectOpenAICompatible(config = {}, fetchImpl = globalThis.fetch, signal) {
  const response = await fetchImpl(`${openAICompatibleBaseUrl(config.baseUrl)}/models`, {
    method: "GET",
    headers: authHeaders(config),
    signal,
  });

  if (!response.ok) {
    return {
      reachable: false,
      modelInstalled: false,
      config,
      error: `OpenAI-compatible local server returned HTTP ${response.status}.`,
    };
  }

  const payload = await response.json();
  const models = Array.isArray(payload?.data)
    ? payload.data.map((entry) => String(entry?.id || entry?.name || "")).filter(Boolean)
    : [];

  return {
    reachable: true,
    modelInstalled: models.length ? modelMatches(models, config.model) : true,
    models,
    config,
  };
}

export async function inspectOllama(options = {}) {
  const config = getOllamaConfig(options);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const { controller, timer } = timeoutSignal(config.timeoutMs);

  try {
    return config.provider === "openai-compatible"
      ? inspectOpenAICompatible(config, fetchImpl, controller.signal)
      : inspectOllamaNative(config, fetchImpl, controller.signal);
  } catch (error) {
    return {
      reachable: false,
      modelInstalled: false,
      config,
      error: errorMessage(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function ollamaPayload(messages = [], config = {}) {
  return {
    model: config.model,
    stream: false,
    ...(config.jsonMode ? { format: "json" } : {}),
    think: config.think,
    options: {
      temperature: config.temperature,
      num_predict: config.maxTokens,
    },
    messages,
  };
}

function openAICompatiblePayload(messages = [], config = {}) {
  return {
    model: config.model,
    stream: false,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    ...(config.jsonMode ? { response_format: { type: "json_object" } } : {}),
    messages,
  };
}

async function chatWithOpenAICompatible(messages = [], config = {}, fetchImpl = globalThis.fetch, signal) {
  const response = await fetchImpl(`${openAICompatibleBaseUrl(config.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(config) },
    signal,
    body: JSON.stringify(openAICompatiblePayload(messages, config)),
  });

  if (!response.ok) {
    const body = String(await response.text().catch(() => "")).slice(0, 500);
    throw new Error(`OpenAI-compatible local server returned HTTP ${response.status}${body ? `: ${body}` : ""}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI-compatible local server returned no message content.");
  }

  return { content, model: payload?.model || config.model, config };
}

async function chatWithOllamaNative(messages = [], config = {}, fetchImpl = globalThis.fetch, signal) {
  const response = await fetchImpl(`${config.baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify(ollamaPayload(messages, config)),
  });

  if (!response.ok) {
    const body = String(await response.text().catch(() => "")).slice(0, 500);
    throw new Error(`Ollama returned HTTP ${response.status}${body ? `: ${body}` : ""}`);
  }

  const payload = await response.json();
  const content = payload?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Ollama returned no message content.");
  }

  return { content, model: payload?.model || config.model, config };
}

export async function chatWithOllama(messages = [], options = {}) {
  const config = getOllamaConfig(options);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const { controller, timer } = timeoutSignal(config.timeoutMs);

  try {
    return config.provider === "openai-compatible"
      ? await chatWithOpenAICompatible(messages, config, fetchImpl, controller.signal)
      : await chatWithOllamaNative(messages, config, fetchImpl, controller.signal);
  } catch (error) {
    throw new Error(errorMessage(error));
  } finally {
    clearTimeout(timer);
  }
}

export const chatWithLocalAI = chatWithOllama;
export const inspectLocalAI = inspectOllama;
export const getLocalAIConfig = getOllamaConfig;
