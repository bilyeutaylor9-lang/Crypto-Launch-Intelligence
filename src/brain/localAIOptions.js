function positiveInteger(value, fallback = 1, maximum = 25) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(maximum, Math.floor(parsed));
}

/**
 * Keeps every live scanner entry point on the same local-model policy.
 * AUTO is intentionally bounded for a Mac: one inline case is completed now
 * and the remaining eligible top-100 cases are persisted for the worker.
 */
export function resolveLocalAIOptions(env = process.env) {
  const requestedMode = String(env.LOCAL_AI_MODE || "AUTO").trim().toUpperCase();
  const inlineLimit = positiveInteger(env.LOCAL_AI_INLINE_LIMIT, 1, 25);
  const topProjectLimit = positiveInteger(env.LOCAL_AI_TOP_PROJECT_LIMIT, 100, 100);

  if (requestedMode === "OFF") {
    return { mode: "OFF", queue: false, inline: false, inlineLimit: 0, topProjectLimit: 0 };
  }

  if (requestedMode === "QUEUE") {
    return { mode: "QUEUE", queue: true, inline: false, inlineLimit, topProjectLimit };
  }

  if (requestedMode === "INLINE" || env.LOCAL_AI_INLINE === "true") {
    return { mode: "INLINE", queue: true, inline: true, inlineLimit, topProjectLimit };
  }

  return { mode: "AUTO", queue: true, inline: true, inlineLimit, topProjectLimit };
}
