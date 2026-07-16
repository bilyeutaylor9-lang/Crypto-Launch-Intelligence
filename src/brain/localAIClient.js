const DEFAULT_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "qwen3:4b";
const DEFAULT_TIMEOUT_MS = 90_000;

function normalizedBaseUrl(value = DEFAULT_BASE_URL) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
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

export function getOllamaConfig(overrides = {}) {
  return {
    baseUrl: normalizedBaseUrl(overrides.baseUrl || process.env.OLLAMA_BASE_URL),
    model: String(overrides.model || process.env.OLLAMA_MODEL || DEFAULT_MODEL),
    timeoutMs: boundedInteger(
      overrides.timeoutMs || process.env.OLLAMA_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      1_000,
      300_000
    ),
    temperature: Number.isFinite(Number(overrides.temperature))
      ? Math.min(1, Math.max(0, Number(overrides.temperature)))
      : 0.1,
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

export async function inspectOllama(options = {}) {
  const config = getOllamaConfig(options);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const { controller, timer } = timeoutSignal(config.timeoutMs);

  try {
    const response = await fetchImpl(`${config.baseUrl}/api/tags`, {
      method: "GET",
      signal: controller.signal,
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
      modelInstalled: models.includes(config.model),
      models,
      config,
    };
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

export async function chatWithOllama(messages = [], options = {}) {
  const config = getOllamaConfig(options);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const { controller, timer } = timeoutSignal(config.timeoutMs);

  try {
    const response = await fetchImpl(`${config.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        stream: false,
        format: "json",
        options: { temperature: config.temperature },
        messages,
      }),
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
  } catch (error) {
    throw new Error(errorMessage(error));
  } finally {
    clearTimeout(timer);
  }
}
