function valueKey(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number(value).toPrecision(12);
  return String(value).trim().toLowerCase();
}

export function resolveFieldConflict(candidates = []) {
  const valid = candidates.filter((candidate) => candidate.validationStatus === "VALID" && candidate.canonicalValue !== null);
  const pool = valid.length ? valid : candidates.filter((candidate) => candidate.canonicalValue !== null);
  if (!pool.length) {
    return {
      winner: null,
      conflicts: [],
      status: "UNRESOLVED",
    };
  }

  const groups = new Map();
  for (const candidate of pool) {
    const key = valueKey(candidate.canonicalValue);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }

  const ranked = [...groups.values()]
    .map((items) => ({
      items,
      value: items[0].canonicalValue,
      score: items.reduce((sum, item) => sum + Number(item.confidence || 0), 0),
      latest: Math.max(...items.map((item) => Date.parse(item.sourceTimestamp || item.observedAt || 0) || 0)),
    }))
    .sort((a, b) => b.score - a.score || b.latest - a.latest);

  const winner = ranked[0].items.sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))[0];
  const conflicts = ranked.slice(1).flatMap((entry) => entry.items);

  return {
    winner,
    conflicts,
    status: conflicts.length ? "CONFLICTED" : "RESOLVED",
  };
}
