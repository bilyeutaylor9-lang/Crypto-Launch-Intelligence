export function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function finiteNumber(value, fallback = null) {
  const number = numberOrNull(value);
  return number === null ? fallback : number;
}

export function clamp(value, min = 0, max = 100) {
  const number = numberOrNull(value);
  if (number === null) return null;
  return Math.max(min, Math.min(max, number));
}

export function safeDivide(numerator, denominator, options = {}) {
  const top = numberOrNull(numerator);
  const bottom = numberOrNull(denominator);
  const floor = numberOrNull(options.denominatorFloor) ?? 0;

  if (top === null || bottom === null) return null;
  if (Math.abs(bottom) <= floor || bottom === 0) return null;

  return top / bottom;
}

export function percentRatio(numerator, denominator, options = {}) {
  const ratio = safeDivide(numerator, denominator, options);
  return ratio === null ? null : ratio * 100;
}

export function finiteValues(values = []) {
  return (Array.isArray(values) ? values : [])
    .map(numberOrNull)
    .filter((value) => value !== null);
}

export function isFiniteDeep(value, path = "value", issues = []) {
  if (value === undefined) {
    issues.push(`${path}: undefined`);
    return issues;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    issues.push(`${path}: non-finite number`);
    return issues;
  }
  if (typeof value === "string" && /^(nan|infinity|-infinity)$/i.test(value.trim())) {
    issues.push(`${path}: non-finite string`);
    return issues;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => isFiniteDeep(item, `${path}[${index}]`, issues));
    return issues;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, nested]) => isFiniteDeep(nested, `${path}.${key}`, issues));
  }
  return issues;
}

export function numericStatus(value) {
  if (value === null || value === undefined || value === "") return "MISSING";
  const number = Number(value);
  if (!Number.isFinite(number)) return "INVALID";
  return "OBSERVED";
}

export function requirePositiveDenominator(value, floor = 0) {
  const number = numberOrNull(value);
  if (number === null) return { ok: false, reason: "MISSING_DENOMINATOR" };
  if (number <= floor) return { ok: false, reason: "NON_POSITIVE_DENOMINATOR" };
  return { ok: true, value: number };
}
