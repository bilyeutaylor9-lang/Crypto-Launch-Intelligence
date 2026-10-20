import { frozenOutcomeEvidenceFromReceipt } from "./frozenOutcomeCollector.js";

// Replays original body bytes, never a later HTTP response or rewritten clock.
// The separate reconciliation receipt records when this recovery actually ran.
export function replayArchivedFrozenOutcomes({ archive, clock = () => new Date().toISOString() } = {}) {
  const tasks = new Map(archive.listTasks().map(task => [task.task_id, task]));
  const results = [];
  for (const diagnostic of archive.listRecoverableProviderResponses()) {
    archive.renewWriter({ nowAt: clock() });
    const header = diagnostic.immutableContract, task = tasks.get(header.taskId);
    if (!task) continue;
    if (header.receivedAt > diagnostic.admittedAt || header.receivedAt > clock()) {
      results.push({ diagnosticRecordId: diagnostic.recordId, status: "RAW_RESPONSE_NOT_ADMISSIBLE", reason: "ORIGINAL_RECEIPT_CLOCK_INVALID" }); continue;
    }
    const prediction = archive.readEvidence(task.record_id);
    let evidence;
    try {
      evidence = frozenOutcomeEvidenceFromReceipt({ task: { taskId: task.task_id, recordId: task.record_id, frozen: task.frozen },
        prediction, requestId: header.requestId, diagnosticRecordId: diagnostic.recordId, receipt: { ...header, rawBytes: diagnostic.rawBytes } });
    } catch (error) {
      results.push({ diagnosticRecordId: diagnostic.recordId, status: "RAW_RESPONSE_NOT_ADMISSIBLE", reason: error.message }); continue;
    }
    if (!evidence) { results.push({ diagnosticRecordId: diagnostic.recordId, status: "NO_EXACT_RAW_OBSERVATION" }); continue; }
    archive.admitPrediction(evidence);
    try {
      const result = archive.reconcileHistoricalObservation({ taskId: task.task_id, evidenceRecordId: evidence.recordId, nowAt: clock() });
      results.push({ diagnosticRecordId: diagnostic.recordId, ...result });
    } catch (error) {
      if (!error.message.startsWith("HISTORICAL_")) throw error;
      results.push({ diagnosticRecordId: diagnostic.recordId, status: "RAW_RESPONSE_NOT_ADMISSIBLE", reason: error.message });
    }
  }
  return { providerRequests: 0, reconciled: results.filter(row => row.status === "reconciled").length,
    sharedReconciledDuties: results.reduce((sum, row) => sum + (row.sharedReconciled || 0), 0), results };
}
