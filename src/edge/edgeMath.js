export function num(value = null) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function clamp(value = 0, min = 0, max = 100) {
  const parsed = num(value);
  return Math.max(min, Math.min(max, parsed === null ? 0 : parsed));
}

export function mean(values = []) {
  const active = values.map(num).filter((value) => value !== null);
  if (!active.length) return null;
  return active.reduce((sum, value) => sum + value, 0) / active.length;
}

export function weightedMean(items = []) {
  const active = items
    .map((item) => ({ value: num(item?.value), weight: num(item?.weight) }))
    .filter((item) => item.value !== null && item.weight !== null && item.weight > 0);
  if (!active.length) return null;
  const totalWeight = active.reduce((sum, item) => sum + item.weight, 0);
  return active.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

export function median(values = []) {
  const active = values.map(num).filter((value) => value !== null).sort((a, b) => a - b);
  if (!active.length) return null;
  const middle = Math.floor(active.length / 2);
  return active.length % 2 ? active[middle] : (active[middle - 1] + active[middle]) / 2;
}

export function quantile(values = [], q = 0.5) {
  const active = values.map(num).filter((value) => value !== null).sort((a, b) => a - b);
  if (!active.length) return null;
  const bounded = Math.max(0, Math.min(1, Number(q)));
  const position = (active.length - 1) * bounded;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return active[lower];
  const weight = position - lower;
  return active[lower] * (1 - weight) + active[upper] * weight;
}

export function robustZ(value, history = []) {
  const current = num(value);
  const active = history.map(num).filter((item) => item !== null);
  if (current === null || active.length < 5) return null;
  const center = median(active);
  const mad = median(active.map((item) => Math.abs(item - center)));
  if (center === null || mad === null) return null;
  const scale = Math.max(1e-9, mad * 1.4826);
  return (current - center) / scale;
}

export function percentileRank(value, values = []) {
  const current = num(value);
  const active = values.map(num).filter((item) => item !== null);
  if (current === null || !active.length) return null;
  const less = active.filter((item) => item < current).length;
  const equal = active.filter((item) => item === current).length;
  return (less + 0.5 * equal) / active.length;
}

export function pctChange(start, end) {
  const left = num(start);
  const right = num(end);
  if (left === null || right === null || left <= 0 || right <= 0) return null;
  return ((right - left) / left) * 100;
}

export function hoursBetween(left, right) {
  const a = new Date(left || 0).getTime();
  const b = new Date(right || 0).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || !a || !b) return null;
  return (b - a) / 3_600_000;
}

export function cosineSimilarity(left = [], right = []) {
  const size = Math.min(left.length, right.length);
  if (!size) return null;
  let dot = 0;
  let l2 = 0;
  let r2 = 0;
  for (let index = 0; index < size; index += 1) {
    const l = num(left[index]) ?? 0;
    const r = num(right[index]) ?? 0;
    dot += l * r;
    l2 += l * l;
    r2 += r * r;
  }
  const denominator = Math.sqrt(l2) * Math.sqrt(r2);
  return denominator ? dot / denominator : null;
}

export function wilsonInterval(successes = 0, total = 0, z = 1.96) {
  const n = Math.max(0, Number(total) || 0);
  const k = Math.max(0, Math.min(n, Number(successes) || 0));
  if (!n) return { low: null, high: null, center: null };
  const p = k / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const margin = (z / denominator) * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return {
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
    center,
  };
}

export function canonicalIdentityKey(item = {}) {
  const chain = String(item.chain || item.network || item.pointInTime?.identity?.chain || "unknown").toLowerCase();
  const token = String(
    item.tokenAddress ||
      item.contractAddress ||
      item.pointInTime?.identity?.tokenAddress ||
      ""
  ).trim();
  const pool = String(
    item.poolAddress ||
      item.pairAddress ||
      item.pointInTime?.identity?.poolAddress ||
      ""
  ).trim();
  if (token) return `${chain}:${/^0x/i.test(token) ? token.toLowerCase() : token}`;
  if (pool) return `${chain}:pool:${/^0x/i.test(pool) ? pool.toLowerCase() : pool}`;
  return `${chain}:${String(item.symbol || item.name || "unknown").toLowerCase()}`;
}

export function timestampOf(item = {}) {
  return item.observedAt || item.timestamp || item.scannedAt || item.capturedAt || null;
}

export function compactNumber(value, digits = 4) {
  const parsed = num(value);
  return parsed === null ? null : Number(parsed.toFixed(digits));
}
