function clockTime(clock) {
  const value = clock();
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new TypeError("Invalid outcome coordinator clock");
  return new Date(value).toISOString();
}

export class OutcomeRequestDeferred extends Error {
  constructor(reservation) {
    super(reservation.reason);
    this.name = "OutcomeRequestDeferred";
    this.retryAt = reservation.retryAt;
  }
}

// A cycle is bounded work, not a daemon. Scheduling it more often never resets
// the persistent request windows, task retry dates, or evidence writer fence.
export async function runDurableOutcomeCycle({ archive, owner, collect, providerPolicies, globalBudget,
  clock = () => new Date().toISOString(), limit = 60, leaseMs = 120000, retryDelayMs = 60000 } = {}) {
  if (!archive || typeof collect !== "function" || !providerPolicies || !globalBudget) throw new TypeError("Outcome cycle requires an archive, collector, and explicit provider budgets");
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 1000 || !Number.isSafeInteger(leaseMs) || leaseMs < 1000 || !Number.isSafeInteger(retryDelayMs) || retryDelayMs < 1) throw new TypeError("Invalid outcome cycle limits");
  const startedAt = clockTime(clock);
  const before = archive.dueDenominators(startedAt);
  const claimed = archive.claimWriter({ owner, nowAt: startedAt, leaseMs });
  if (!claimed) return { status: "WRITER_BUSY", startedAt, before, attempted: 0, results: [] };
  const results = [];
  const visited = [];
  let currentTask = null, taskCancellation = null, heartbeatError = null;
  const heartbeat = setInterval(() => {
    try {
      const nowAt = clockTime(clock);
      archive.renewWriter({ nowAt, leaseMs });
      if (currentTask && !archive.renewTaskLease({ owner, leaseToken: currentTask.leaseToken, nowAt, leaseMs })) taskCancellation?.abort(new Error("OUTCOME_TASK_LEASE_EXPIRED"));
    } catch (error) { heartbeatError = error; taskCancellation?.abort(error); }
  }, Math.max(100, Math.floor(leaseMs / 3)));
  heartbeat.unref();

  try {
    for (let index = 0; index < limit; index++) {
      if (heartbeatError) throw heartbeatError;
      archive.renewWriter({ nowAt: clockTime(clock), leaseMs });
      const [task] = archive.leaseDue({ owner, nowAt: clockTime(clock), limit: 1, leaseMs, excludeTaskIds: visited });
      if (!task) break;
      currentTask = task; taskCancellation = new AbortController(); visited.push(task.taskId);
      const request = async (provider, operation) => {
        if (heartbeatError) throw heartbeatError;
        const policy = providerPolicies[provider];
        if (!policy || typeof operation !== "function" || !Number.isSafeInteger(policy.timeoutMs) || policy.timeoutMs < 1) throw new TypeError("Unconfigured outcome provider");
        const nowAt = clockTime(clock);
        if (nowAt > task.frozen.expiresAt) throw new OutcomeRequestDeferred({ reason: "OUTCOME_WINDOW_EXPIRED", retryAt: nowAt });
        archive.renewWriter({ nowAt, leaseMs });
        const reservation = archive.reserveProviderRequest({ provider, windowMs: policy.windowMs, requestLimit: policy.requestLimit, taskId: task.taskId, globalBudget, nowAt });
        if (!reservation.reserved) throw new OutcomeRequestDeferred(reservation);
        const controller = new AbortController();
        const taskSignal = taskCancellation.signal;
        const cancel = () => controller.abort(taskSignal.reason);
        taskSignal.addEventListener("abort", cancel, { once: true });
        if (taskSignal.aborted) cancel();
        const timeout = setTimeout(() => controller.abort(new Error("OUTCOME_PROVIDER_TIMEOUT")), policy.timeoutMs);
        try {
          if (controller.signal.aborted) throw controller.signal.reason;
          const requestedAt = clockTime(clock);
          if (!archive.markProviderDispatched({ requestId: reservation.requestId, nowAt: requestedAt })) throw new Error("OUTCOME_DISPATCH_NOT_OWNED");
          const value = await operation({ signal: controller.signal, requestedAt, requestId: reservation.requestId });
          const receivedAt = clockTime(clock);
          if (!archive.finishProviderRequest({ requestId: reservation.requestId, success: true, nowAt: receivedAt })) throw new Error("OUTCOME_RECEIPT_NOT_OWNED");
          return { value, requestedAt, receivedAt, requestId: reservation.requestId };
        } catch (error) {
          const code = Number(error.statusCode ?? error.status);
          const statusCode = Number.isSafeInteger(code) && code >= 100 && code <= 599 ? code : null;
          archive.finishProviderRequest({ requestId: reservation.requestId, success: false, statusCode,
            retryAfterMs: Number.isSafeInteger(error.retryAfterMs) && error.retryAfterMs >= 0 ? error.retryAfterMs : null, nowAt: clockTime(clock) });
          throw error;
        } finally {
          clearTimeout(timeout); taskSignal.removeEventListener("abort", cancel);
        }
      };
      let evidence = null;
      try {
        const prediction = archive.readEvidence(task.recordId);
        if (!prediction) throw new Error("OUTCOME_PARENT_EVIDENCE_MISSING");
        evidence = await collect({ task, prediction, request, signal: taskCancellation.signal });
        if (heartbeatError) throw heartbeatError;
        const completed = evidence ? archive.completeWithEvidence({ obligationId: task.obligationId, owner, leaseToken: task.leaseToken, evidence, nowAt: clockTime(clock) }) : false;
        if (evidence && !completed) archive.admitPrediction(evidence);
        if (completed) results.push({ taskId: task.taskId, state: "completed", evidenceRecordId: evidence.recordId });
        else {
          const nowAt = clockTime(clock), retryAt = new Date(Date.parse(nowAt) + retryDelayMs).toISOString();
          archive.transitionTask({ obligationId: task.obligationId, owner, leaseToken: task.leaseToken, state: "retryable", retryAt, nowAt });
          results.push({ taskId: task.taskId, state: nowAt > task.frozen.expiresAt ? "expired" : "retryable" });
        }
      } catch (error) {
        if (heartbeatError) throw heartbeatError;
        if (evidence) archive.admitPrediction(evidence);
        const nowAt = clockTime(clock);
        const desiredRetryAt = error instanceof OutcomeRequestDeferred ? error.retryAt : new Date(Date.parse(nowAt) + retryDelayMs).toISOString();
        const retryAt = new Date(Math.max(Date.parse(nowAt) + 1, Date.parse(desiredRetryAt))).toISOString();
        const state = error instanceof OutcomeRequestDeferred ? "budget-deferred" : "retryable";
        archive.transitionTask({ obligationId: task.obligationId, owner, leaseToken: task.leaseToken, state, retryAt, nowAt });
        results.push({ taskId: task.taskId, state: nowAt > task.frozen.expiresAt ? "expired" : state, error: error.message });
      } finally { currentTask = null; taskCancellation = null; }
    }
    const finishedAt = clockTime(clock), after = archive.dueDenominators(finishedAt);
    const count = state => after.find(row => row.state === state)?.count || 0;
    return { status: before.reduce((sum, row) => sum + row.count, 0) === 0 ? "NO_OUTCOMES_DUE" : after.some(row => row.state !== "completed" && row.count > 0) ? "COLLECTION_INCOMPLETE" : results.length ? "CAPTURE_COMPLETE" : "NO_PENDING_OUTCOMES",
      startedAt, finishedAt, before, after, attempted: results.length, completed: results.filter(row => row.state === "completed").length,
      expiredMissing: count("expired"), results, providers: archive.coordinationStatus(finishedAt), edgeEstablished: false };
  } finally {
    clearInterval(heartbeat);
    archive.releaseWriter({ nowAt: clockTime(clock) });
  }
}
