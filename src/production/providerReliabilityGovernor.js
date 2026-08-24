import { clamp, finite, timestamp } from "./productionMath.js";

export function evaluateProviderHealth(events = [], options = {}) {
  const now = timestamp(options.now || new Date().toISOString());
  const windowMinutes = Math.max(5, Number(options.windowMinutes || 60));
  const minTime = now - windowMinutes * 60_000;
  const recent = (Array.isArray(events) ? events : []).filter((event) => {
    const at = timestamp(event.at || event.observedAt || event.timestamp);
    return at !== null && at >= minTime && at <= now;
  });

  const total = recent.length;
  const failures = recent.filter((e) => e.ok === false || Number(e.statusCode) >= 400).length;
  const rateLimits = recent.filter((e) => Number(e.statusCode) === 429).length;
  const latencies = recent.map((e) => finite(e.latencyMs)).filter((v) => v !== null);
  const successRate = total ? 1 - failures / total : null;
  const p95 = latencies.length
    ? [...latencies].sort((a, b) => a - b)[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]
    : null;

  let state = "UNKNOWN";
  if (total >= Number(options.minimumSamples || 10)) {
    if ((successRate ?? 0) < 0.6 || rateLimits / total > 0.35) state = "CIRCUIT_OPEN";
    else if ((successRate ?? 0) < 0.85 || (p95 ?? 0) > Number(options.maxP95Ms || 6000)) state = "DEGRADED";
    else state = "HEALTHY";
  }

  return {
    state,
    samples: total,
    successRate,
    failureRate: total ? failures / total : null,
    rateLimitRate: total ? rateLimits / total : null,
    p95LatencyMs: p95,
    routingWeight:
      state === "HEALTHY" ? 1 :
      state === "DEGRADED" ? 0.35 :
      state === "CIRCUIT_OPEN" ? 0 : 0.1,
  };
}
