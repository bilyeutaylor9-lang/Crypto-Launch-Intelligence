function numberInRange(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function timeoutError(label, timeoutMs) {
  const error = new Error(`${label} exceeded its ${timeoutMs}ms time budget`);
  error.code = "DISCOVERY_SOURCE_TIMEOUT";
  error.timeoutMs = timeoutMs;
  return error;
}

export function resolveDiscoveryExecutionOptions(options = {}) {
  return {
    concurrency: numberInRange(
      options.sourceConcurrency ?? process.env.DISCOVERY_SOURCE_CONCURRENCY,
      5,
      1,
      12
    ),
    timeoutMs: numberInRange(
      options.sourceTimeoutMs ?? process.env.DISCOVERY_SOURCE_TIMEOUT_MS,
      20_000,
      1_000,
      120_000
    ),
  };
}

export function timeoutMsForDiscoverySource(source = "", options = {}) {
  const normalized = String(source || "unknown")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toUpperCase();
  const configured =
    options.sourceTimeouts?.[source] ??
    options.sourceTimeoutMsBySource?.[source] ??
    process.env[`DISCOVERY_${normalized}_TIMEOUT_MS`];

  return numberInRange(
    configured,
    resolveDiscoveryExecutionOptions(options).timeoutMs,
    1_000,
    120_000
  );
}

export async function runWithTimeBudget(operation, { label = "Discovery source", timeoutMs = 20_000 } = {}) {
  let timer;
  const task = Promise.resolve().then(operation);
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(timeoutError(label, timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([task, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function runConcurrent(items = [], worker, { concurrency = 5 } = {}) {
  const safeItems = Array.isArray(items) ? items : [];
  const limit = numberInRange(concurrency, 5, 1, 64);
  const results = new Array(safeItems.length);
  let nextIndex = 0;

  async function consume() {
    while (nextIndex < safeItems.length) {
      const index = nextIndex++;
      results[index] = await worker(safeItems[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, safeItems.length) }, () => consume())
  );

  return results;
}
