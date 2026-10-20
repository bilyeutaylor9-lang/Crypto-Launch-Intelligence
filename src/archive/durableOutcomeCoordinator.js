function clockTime(clock) {
  const value = clock();
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new TypeError("Invalid outcome coordinator clock");
  return new Date(value).toISOString();
}

async function withAbort(operation, signal) {
  if (signal.aborted) throw signal.reason;
  let cancel;
  const aborted = new Promise((_, reject) => { cancel = () => reject(signal.reason || new Error("OUTCOME_CANCELLED")); signal.addEventListener("abort", cancel, { once: true }); });
  try { return await Promise.race([Promise.resolve().then(operation), aborted]); }
  finally { signal.removeEventListener("abort", cancel); }
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
  clock = () => new Date().toISOString(), limit = 60, leaseMs = 120000, retryDelayMs = 60000, cycleTimeoutMs = 45000 } = {}) {
  if (!archive || typeof collect !== "function" || !providerPolicies || !globalBudget) throw new TypeError("Outcome cycle requires an archive, collector, and explicit provider budgets");
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 1000 || !Number.isSafeInteger(leaseMs) || leaseMs < 1000 || !Number.isSafeInteger(retryDelayMs) || retryDelayMs < 1 || !Number.isSafeInteger(cycleTimeoutMs) || cycleTimeoutMs < 1 || cycleTimeoutMs > 600000) throw new TypeError("Invalid outcome cycle limits");
  const startedAt = clockTime(clock);
  const before = archive.dueDenominators(startedAt);
  const claimed = archive.claimWriter({ owner, nowAt: startedAt, leaseMs });
  if (!claimed) return { status: "WRITER_BUSY", startedAt, before, attempted: 0, results: [] };
  const results = [];
  const visited = [];
  let currentTask = null, taskCancellation = null, heartbeatError = null, deadlineReached = false;
  const deadline = setTimeout(() => { deadlineReached = true; taskCancellation?.abort(new Error("OUTCOME_CYCLE_DEADLINE")); }, cycleTimeoutMs);
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
      if (deadlineReached) break;
      if (heartbeatError) throw heartbeatError;
      archive.renewWriter({ nowAt: clockTime(clock), leaseMs });
      const [task] = archive.leaseDue({ owner, nowAt: clockTime(clock), limit: 1, leaseMs, excludeTaskIds: visited });
      if (!task) break;
      currentTask = task; taskCancellation = new AbortController(); visited.push(task.taskId);
      const request = async (provider, operation) => {
        if (heartbeatError) throw heartbeatError;
        if (taskCancellation.signal.aborted) throw taskCancellation.signal.reason;
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
        let transport = null;
        try {
          if (controller.signal.aborted) throw controller.signal.reason;
          const requestedAt = clockTime(clock);
          if (!archive.markProviderDispatched({ requestId: reservation.requestId, nowAt: requestedAt })) throw new Error("OUTCOME_DISPATCH_NOT_OWNED");
          const observeTransport = receipt => {
            if (controller.signal.aborted) throw controller.signal.reason;
            if (transport) throw new Error("MULTIPLE_HTTP_RESPONSES_FOR_ONE_RESERVATION");
            if (receipt.provider !== undefined && receipt.provider !== (policy.receiptProvider || provider)) throw new Error("OUTCOME_RECEIPT_PROVIDER_MISMATCH");
            const receivedAt = clockTime(() => receipt.receivedAt), actualRequest = clockTime(() => receipt.requestedAt);
            if (actualRequest < requestedAt || receivedAt < actualRequest || receivedAt > clockTime(clock) || !Number.isSafeInteger(receipt.status) || receipt.status < 100 || receipt.status > 599) throw new Error("INVALID_OUTCOME_TRANSPORT_RECEIPT");
            transport = { receivedAt, statusCode: receipt.status };
          };
          const value = await withAbort(() => operation({ signal: controller.signal, requestedAt, requestId: reservation.requestId, observeTransport }), controller.signal);
          const finishedAt = clockTime(clock), receivedAt = transport?.receivedAt || finishedAt;
          if (!archive.finishProviderRequest({ requestId: reservation.requestId, success: transport ? transport.statusCode < 400 : true,
            statusCode: transport?.statusCode ?? null, receivedAt, minimumIntervalMs: policy.minimumIntervalMs || 0, nowAt: finishedAt })) throw new Error("OUTCOME_RECEIPT_NOT_OWNED");
          return { value, requestedAt, receivedAt, requestId: reservation.requestId };
        } catch (error) {
          const code = Number(error.statusCode ?? error.status);
          const statusCode = Number.isSafeInteger(code) && code >= 100 && code <= 599 ? code : null;
          archive.finishProviderRequest({ requestId: reservation.requestId, success: transport ? transport.statusCode < 400 : false, statusCode: transport?.statusCode ?? statusCode,
            receivedAt: transport?.receivedAt ?? null, minimumIntervalMs: policy.minimumIntervalMs || 0,
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
        evidence = await withAbort(() => collect({ task, prediction, request, signal: taskCancellation.signal }), taskCancellation.signal);
        if (heartbeatError) throw heartbeatError;
        const completion = evidence ? archive.completeWithEvidence({ obligationId: task.obligationId, owner, leaseToken: task.leaseToken, evidence, returnReceipt: true, nowAt: clockTime(clock) }) : false;
        const completed = completion === true || completion?.completed === true;
        if (evidence && !completed) archive.admitPrediction(evidence);
        if (completed) {
          results.push({ taskId: task.taskId, state: "completed", evidenceRecordId: evidence.recordId, sharedReconciled: completion.sharedReconciled || 0 });
        }
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
        if (error.fatalCollectionStorageFailure || error.responseReceiptCaptureFailure) throw error;
      } finally { currentTask = null; taskCancellation = null; }
    }
    const finishedAt = clockTime(clock), after = archive.dueDenominators(finishedAt);
    const count = state => after.find(row => row.state === state)?.count || 0;
    const capturedObservations = results.filter(row => row.state === "completed").length;
    const sharedReconciledDuties = results.reduce((sum, row) => sum + (row.sharedReconciled || 0), 0);
    return { status: before.reduce((sum, row) => sum + row.count, 0) === 0 ? "NO_OUTCOMES_DUE" : after.some(row => !["completed", "reconciled"].includes(row.state) && row.count > 0) ? "COLLECTION_INCOMPLETE" : results.length ? "CAPTURE_COMPLETE" : "NO_PENDING_OUTCOMES",
      startedAt, finishedAt, before, after, deadlineReached, attempted: results.length, completed: results.filter(row => row.state === "completed").length,
      capturedObservations, sharedReconciledDuties, resolvedDuties: capturedObservations + sharedReconciledDuties,
      expiredMissing: count("expired"), results, providers: archive.coordinationStatus(finishedAt), edgeEstablished: false };
  } finally {
    clearInterval(heartbeat);
    clearTimeout(deadline);
    archive.releaseWriter({ nowAt: clockTime(clock) });
  }
}
