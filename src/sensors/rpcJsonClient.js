function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function jsonRpc(url, method, params = [], options = {}) {
  const timeoutMs = Math.max(500, Number(options.timeoutMs || 8_000));
  const retries = Math.max(0, Number(options.retries ?? 1));
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(options.headers || {}) },
        body: JSON.stringify({ jsonrpc: "2.0", id: options.id || 1, method, params }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const payload = await response.json();
      if (payload?.error) throw new Error(`${payload.error.code ?? "RPC"}: ${payload.error.message || "unknown RPC error"}`);
      return payload?.result;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(Math.min(500, 100 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error(`RPC request failed: ${method}`);
}

export async function jsonRpcBatch(url, calls = [], options = {}) {
  const safeCalls = Array.isArray(calls) ? calls : [];
  if (!safeCalls.length) return [];
  const timeoutMs = Math.max(500, Number(options.timeoutMs || 10_000));
  const retries = Math.max(0, Number(options.retries ?? 1));
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const payload = safeCalls.map((call, index) => ({
        jsonrpc: "2.0",
        id: index + 1,
        method: call.method,
        params: Array.isArray(call.params) ? call.params : [],
      }));
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(options.headers || {}) },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error("RPC batch response was not an array.");
      const byId = new Map(rows.map((row) => [Number(row.id), row]));
      return payload.map((request) => {
        const row = byId.get(request.id);
        if (!row) return { result: null, error: { message: "Missing batch response row." } };
        return row.error ? { result: null, error: row.error } : { result: row.result, error: null };
      });
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(Math.min(500, 100 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error("RPC batch request failed");
}

export async function jsonPost(url, body, options = {}) {
  const timeoutMs = Math.max(500, Number(options.timeoutMs || 8_000));
  const retries = Math.max(0, Number(options.retries ?? 1));
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(options.headers || {}) },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(Math.min(500, 100 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error("HTTP JSON request failed");
}

export default jsonRpc;
