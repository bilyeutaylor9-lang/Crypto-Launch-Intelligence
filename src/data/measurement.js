import { numericStatus, numberOrNull } from "../math/numericSafety.js";

export function measurement({
  value = null,
  source = "unknown",
  sourceTimestamp = null,
  ingestedAt = new Date().toISOString(),
  unit = "unknown",
  confidence = 0,
  status = null,
  provenance = null,
} = {}) {
  const numeric = numberOrNull(value);
  const inferredStatus = status || numericStatus(value);
  return {
    value: numeric,
    status: inferredStatus,
    source,
    sourceTimestamp,
    ingestedAt,
    unit,
    confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
    provenance,
  };
}

export function unwrapMeasurement(value) {
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "value")) {
    return value.value;
  }
  return value;
}
