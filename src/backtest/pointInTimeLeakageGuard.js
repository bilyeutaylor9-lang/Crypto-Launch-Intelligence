const EVIDENCE_TIMESTAMP_KEYS = new Set([
  "observedat",
  "fetchedat",
  "generatedat",
  "collectedat",
  "retrievedat",
  "sourcetimestamp",
  "datatimestamp",
  "quotetimestamp",
  "blocktimestamp",
  "updatedat",
]);

const FUTURE_LABEL_KEYS = new Set([
  "futureoutcomes",
  "outcome",
  "outcomes",
  "outcomelabel",
  "checkpoints",
  "latestreturnpct",
  "returnat168hpct",
  "maximumreturn168hpct",
  "maximumreturnpct",
  "maximumdrawdownbeforetargetpct",
  "maximumdrawdownpct",
  "maxfavorableexcursionpct",
  "maxadverseexcursionpct",
  "liquiditysurvived",
  "routesurvived",
  "rugged",
]);

function time(value) {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.some(hasMeaningfulValue);
  if (typeof value === "object") return Object.values(value).some(hasMeaningfulValue);
  return true;
}

function decisionTime(record = {}) {
  return time(record.scannedAt || record.decisionAt || record.decidedAt || record.timestamp);
}

function walk(value, visitor, path = "", seen = new WeakSet()) {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((child, index) => {
      const childPath = `${path}[${index}]`;
      visitor(value, index, child, childPath);
      walk(child, visitor, childPath, seen);
    });
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    visitor(value, key, child, childPath);
    walk(child, visitor, childPath, seen);
  }
}

export function auditPointInTimeRecord(record = {}, options = {}) {
  const scannedAt = decisionTime(record);
  const toleranceMs = Number(options.clockSkewToleranceMs ?? 1000);
  const violations = [];
  if (!scannedAt) return { valid: false, decisionAt: null, violations: [{ type: "MISSING_SCAN_TIMESTAMP" }] };

  walk(record, (_parent, key, child, fieldPath) => {
    if (typeof key !== "string") return;
    const normalized = key.toLowerCase();
    if (FUTURE_LABEL_KEYS.has(normalized)) {
      violations.push({ type: "EMBEDDED_FUTURE_LABEL", path: fieldPath });
      return;
    }
    if (!EVIDENCE_TIMESTAMP_KEYS.has(normalized)) return;
    const observedAt = time(child);
    if (observedAt && observedAt > scannedAt + toleranceMs) {
      violations.push({ type: "FUTURE_EVIDENCE", path: fieldPath, value: child });
    }
  });

  return {
    valid: violations.length === 0,
    decisionAt: new Date(scannedAt).toISOString(),
    violations,
  };
}

export function stripFutureEvidence(record = {}, options = {}) {
  const cloned = structuredClone(record);
  const scannedAt = decisionTime(cloned);
  const toleranceMs = Number(options.clockSkewToleranceMs ?? 1000);
  const rejected = [];

  function prune(value, path = "") {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        const child = value[index];
        const childPath = `${path}[${index}]`;
        if (child && typeof child === "object") {
          const observedAt = time(
            child.observedAt ||
              child.fetchedAt ||
              child.sourceTimestamp ||
              child.dataTimestamp ||
              child.quoteTimestamp
          );
          if (observedAt && scannedAt && observedAt > scannedAt + toleranceMs) {
            rejected.push({ type: "FUTURE_EVIDENCE", path: childPath, observedAt: new Date(observedAt).toISOString() });
            value.splice(index, 1);
            continue;
          }
        }
        prune(child, childPath);
      }
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      const normalized = key.toLowerCase();
      if (FUTURE_LABEL_KEYS.has(normalized)) {
        rejected.push({
          type: hasMeaningfulValue(child)
            ? "POPULATED_FUTURE_LABEL_REMOVED"
            : "EMPTY_FUTURE_PLACEHOLDER_REMOVED",
          path: childPath,
        });
        delete value[key];
        continue;
      }
      if (EVIDENCE_TIMESTAMP_KEYS.has(normalized)) {
        const observedAt = time(child);
        if (observedAt && scannedAt && observedAt > scannedAt + toleranceMs) {
          rejected.push({ type: "FUTURE_EVIDENCE", path: childPath, observedAt: new Date(observedAt).toISOString() });
          delete value[key];
          continue;
        }
      }
      if (child && typeof child === "object") {
        const observedAt = time(
          child.observedAt ||
            child.fetchedAt ||
            child.sourceTimestamp ||
            child.dataTimestamp ||
            child.quoteTimestamp
        );
        if (observedAt && scannedAt && observedAt > scannedAt + toleranceMs) {
          rejected.push({ type: "FUTURE_EVIDENCE", path: childPath, observedAt: new Date(observedAt).toISOString() });
          delete value[key];
          continue;
        }
      }
      prune(child, childPath);
    }
  }

  prune(cloned);
  return { record: cloned, rejected };
}

export { EVIDENCE_TIMESTAMP_KEYS, FUTURE_LABEL_KEYS };
