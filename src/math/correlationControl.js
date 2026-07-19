import { finiteValues, numberOrNull } from "./numericSafety.js";

export function pearsonCorrelation(left = [], right = []) {
  const pairs = left
    .map((value, index) => [numberOrNull(value), numberOrNull(right[index])])
    .filter(([a, b]) => a !== null && b !== null);
  if (pairs.length < 3) return null;
  const xs = pairs.map(([value]) => value);
  const ys = pairs.map(([, value]) => value);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const numerator = pairs.reduce((sum, [x, y]) => sum + (x - meanX) * (y - meanY), 0);
  const denominatorX = Math.sqrt(xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0));
  const denominatorY = Math.sqrt(ys.reduce((sum, value) => sum + (value - meanY) ** 2, 0));
  if (!denominatorX || !denominatorY) return null;
  return numerator / (denominatorX * denominatorY);
}

export function effectiveSignalCount(weights = []) {
  const values = finiteValues(weights).map(Math.abs);
  if (!values.length) return 0;
  const total = values.reduce((sum, value) => sum + value, 0);
  const squared = values.reduce((sum, value) => sum + value ** 2, 0);
  return squared ? (total ** 2) / squared : 0;
}

export function evidenceLineageSummary(evidence = []) {
  const rows = Array.isArray(evidence) ? evidence : [];
  const rawFamilies = new Set();
  const derivedEngines = new Set();
  let raw = 0;
  let derived = 0;

  for (const item of rows) {
    const type = item.type || item.evidenceType || (item.engine ? "DERIVED_METRIC" : "RAW_OBSERVATION");
    const family = item.family || item.sourceFamily || item.source;
    if (type === "RAW_OBSERVATION") {
      raw += 1;
      if (family) rawFamilies.add(family);
    } else {
      derived += 1;
      if (item.engine) derivedEngines.add(item.engine);
    }
  }

  return {
    rawEvidenceIds: rows.filter((item) => item.id).map((item) => item.id),
    directSourceFamilies: [...rawFamilies],
    derivedFromEngines: [...derivedEngines],
    dependencyDepth: derivedEngines.size ? 1 : 0,
    independentEvidenceCount: rawFamilies.size,
    correlatedEvidenceCount: Math.max(0, rows.length - rawFamilies.size),
    rawObservationCount: raw,
    derivedMetricCount: derived,
  };
}
