import "../config/loadEnv.js";

import { processQueuedLocalAIResearch } from "./localBrainBatchEngine.js";

function positiveInteger(value, fallback, maximum = 3_600_000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(maximum, Math.floor(parsed));
}

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function runLocalBrainWorker(options = {}) {
  const once = options.once ?? process.argv.includes("--once");
  const intervalMs = positiveInteger(options.intervalMs || process.env.LOCAL_AI_WORKER_INTERVAL_MS, 15_000);
  const batchSize = positiveInteger(options.limit || process.env.LOCAL_AI_WORKER_BATCH_SIZE, 1, 100);

  do {
    const result = await processQueuedLocalAIResearch({ ...options, limit: batchSize });
    console.log(
      `Local AI worker: ${result.status.toLowerCase()} | queued ${result.queue.queued} | running ${result.queue.running} | complete ${result.queue.complete}`
    );

    if (once) {
      if (result.status === "UNAVAILABLE") process.exitCode = 1;
      return result;
    }

    await pause(intervalMs);
  } while (true);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runLocalBrainWorker().catch((error) => {
    console.error(`Local AI worker failed: ${error.message}`);
    process.exitCode = 1;
  });
}
