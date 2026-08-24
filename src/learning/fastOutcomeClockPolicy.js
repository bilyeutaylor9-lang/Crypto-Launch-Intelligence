export const FAST_OUTCOME_CLOCK_MINUTES = Object.freeze([
  5,
  15,
  30,
  60,
  180,
  360,
  720,
  1440,
  4320,
  10080,
]);

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

export function dueFastOutcomeHorizons(observedAt, options = {}) {
  const start = timestamp(observedAt);
  const now = timestamp(options.now || new Date().toISOString());
  if (start === null || now === null || now < start) return [];

  const completed = new Set(
    (Array.isArray(options.completedMinutes) ? options.completedMinutes : [])
      .map(Number)
      .filter(Number.isFinite)
  );

  return FAST_OUTCOME_CLOCK_MINUTES.filter((minutes) =>
    !completed.has(minutes) &&
    now >= start + minutes * 60_000
  );
}

export function fastOutcomeTargetAt(observedAt, minutes) {
  const start = timestamp(observedAt);
  const horizon = Number(minutes);
  if (start === null || !Number.isFinite(horizon) || horizon <= 0) return null;
  return new Date(start + horizon * 60_000).toISOString();
}
