export function createGoPlusRequestLimiter(options = {}) {
  const now = options.now || Date.now;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const configuredInterval = Number(options.intervalMs || 2100);
  const intervalMs = Number.isFinite(configuredInterval) && configuredInterval > 0 ? configuredInterval : 2100;
  let nextRequestAt = 0;
  let blockedUntil = 0;
  let queue = Promise.resolve();
  async function waitForSlot(options = {}) {
    const deadlineAt = options.deadlineAt ?? Number.POSITIVE_INFINITY;
    if (options.waitForCooldown === false && blockedUntil > now()) return false;
    const slot = queue.then(async () => {
      let delay;
      while ((delay = Math.max(nextRequestAt, blockedUntil) - now()) > 0) {
        if (options.waitForCooldown === false && blockedUntil > now()) return false;
        const remaining = deadlineAt - now();
        if (remaining <= 0) return false;
        await sleep(Math.min(delay, remaining));
      }
      if (now() >= deadlineAt) return false;
      nextRequestAt = now() + intervalMs;
      return true;
    });
    queue = slot.catch(() => {});
    return slot;
  }
  waitForSlot.defer = (ms = 61000) => {
    blockedUntil = Math.max(blockedUntil, now() + ms);
  };
  waitForSlot.cooldownUntil = () => blockedUntil;
  return waitForSlot;
}

// GoPlus's free quota is shared across chains and security/creator callers.
export const waitForGoPlusRequestSlot = createGoPlusRequestLimiter({
  intervalMs: process.env.GOPLUS_REQUEST_INTERVAL_MS || 2100,
});
