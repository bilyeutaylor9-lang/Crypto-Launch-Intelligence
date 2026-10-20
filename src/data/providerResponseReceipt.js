export function providerReceiptTimestamp(options = {}) {
  const hasInjectedClock = Object.hasOwn(options, "now");
  const value = hasInjectedClock
    ? (typeof options.now === "function" ? options.now() : options.now)
    : new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError("Provider receipt clock must produce a valid timestamp.");
  }
  return date.toISOString();
}

function canonicalTimestamp(value, label) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError(`${label} must be a valid timestamp.`);
  return date.toISOString();
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
  const headers = safeHeaders(response?.headers);
  const requestedAt = canonicalTimestamp(metadata.requestedAt, "Provider request timestamp");
  let rawBytes = null;
  let receivedAt = null;
  if (typeof options.onResponseBytes === "function") {
    if (!response || typeof response.arrayBuffer !== "function") {
      const error = new Error("Provider response receipt capture requires a raw-capable response.");
      error.responseReceiptCaptureFailure = true;
      throw error;
    }
    // Transport/body failures can use an independent fallback. Only a receipt
    // integrity or storage failure below must stop further collection.
    rawBytes = Buffer.from(await response.arrayBuffer());
    try {
      // This is deliberately after body consumption. HTTP response headers can
      // arrive before a delayed body, so their arrival is not a receipt clock.
      receivedAt = providerReceiptTimestamp(options);
      if (requestedAt && Date.parse(receivedAt) < Date.parse(requestedAt)) {
        throw new RangeError("Provider receipt timestamp precedes its request timestamp.");
      }
      await options.onResponseBytes({
        provider: metadata.provider || "unknown",
        url: metadata.url || null,
        status: Number(response.status),
        requestedAt,
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
  const errorReceiptAt = receivedAt || providerReceiptTimestamp(options);
  if (!response?.ok) {
    const error = new Error(`${metadata.provider || "Provider"} request failed: ${response?.status}`);
    error.statusCode = Number(response?.status) || null;
    error.retryAfterMs = retryAfterMs(headers.retryAfter, errorReceiptAt);
    throw error;
  }
  if (rawBytes !== null) return JSON.parse(rawBytes.toString("utf8"));
  return response.json();
}

export const __providerResponseReceiptHooks = { providerReceiptTimestamp, safeHeaders };
