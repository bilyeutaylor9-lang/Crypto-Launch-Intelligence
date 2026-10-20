export function providerReceiptTimestamp(options = {}) {
  const value = typeof options.now === "function" ? options.now() : options.now;
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function safeHeaders(headers) {
  const get = (name) => typeof headers?.get === "function" ? headers.get(name) : null;
  return {
    date: get("date"),
    retryAfter: get("retry-after"),
    contentType: get("content-type"),
  };
}

export function retryAfterMs(value, receivedAt = new Date().toISOString()) {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0 && String(value).trim() !== "") return seconds * 1_000;
  const targetMs = Date.parse(value || "");
  const receivedMs = Date.parse(receivedAt);
  return Number.isFinite(targetMs) && Number.isFinite(receivedMs) && targetMs >= receivedMs
    ? targetMs - receivedMs
    : null;
}

export async function readProviderJson(response, metadata = {}, options = {}) {
  const receivedAt = providerReceiptTimestamp(options);
  const headers = safeHeaders(response?.headers);
  let rawBytes = null;
  if (typeof options.onResponseBytes === "function") {
    try {
      if (!response || typeof response.arrayBuffer !== "function") {
        throw new Error("Provider response receipt capture requires a raw-capable response.");
      }
      rawBytes = Buffer.from(await response.arrayBuffer());
      await options.onResponseBytes({
        provider: metadata.provider || "unknown",
        url: metadata.url || null,
        status: Number(response.status),
        requestedAt: metadata.requestedAt || null,
        receivedAt,
        headers,
        rawBytes,
      });
    } catch (error) {
      const captureError = error instanceof Error ? error : new Error(String(error));
      captureError.responseReceiptCaptureFailure = true;
      throw captureError;
    }
  }
  if (!response?.ok) {
    const error = new Error(`${metadata.provider || "Provider"} request failed: ${response?.status}`);
    error.statusCode = Number(response?.status) || null;
    error.retryAfterMs = retryAfterMs(headers.retryAfter, receivedAt);
    throw error;
  }
  if (rawBytes !== null) return JSON.parse(rawBytes.toString("utf8"));
  return response.json();
}

export const __providerResponseReceiptHooks = { providerReceiptTimestamp, safeHeaders };
