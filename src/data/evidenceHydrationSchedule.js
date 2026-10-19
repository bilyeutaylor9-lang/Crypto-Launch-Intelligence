function nonnegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function createEvidenceHydrationSchedule(state, options = {}, work = {}) {
  const now = (state.now || Date.now)();
  const rawDeadlineAt = Math.min(state.deadlineAt ?? Infinity,
    Number.isFinite(options.phaseDeadlineAt) ? options.phaseDeadlineAt : Infinity);
  const remaining = Math.max(0, rawDeadlineAt - now);
  if (!Number.isFinite(remaining)) return { rawDeadlineAt, wave1DeadlineAt: rawDeadlineAt,
    cheapMetadataDeadlineAt: rawDeadlineAt, wave2ReserveMs: 0 };
  const requestedReserve = nonnegative(options.wave2ReserveMs ??
    process.env.ACTIVE_EVIDENCE_WAVE2_RESERVE_MS ?? 240000, 240000);
  const wave2ReserveMs = work.wave1 && work.wave2 ? Math.min(requestedReserve, remaining / 3) : 0;
  const wave1DeadlineAt = rawDeadlineAt - wave2ReserveMs;
  const requestedCheapLimit = nonnegative(options.cheapMetadataTimeBudgetMs ??
    process.env.ACTIVE_EVIDENCE_CHEAP_METADATA_TIME_BUDGET_MS ?? 600000, 600000);
  // Deadlines partition the existing allowance. They never reset provider
  // circuits, spend extra requests, or extend the absolute execution window.
  const cheapMetadataDeadlineAt = work.cheapMetadata && work.otherWave1
    ? Math.min(wave1DeadlineAt, now + Math.min(requestedCheapLimit, Math.max(0, wave1DeadlineAt - now) / 2))
    : wave1DeadlineAt;
  return { rawDeadlineAt, wave1DeadlineAt, cheapMetadataDeadlineAt, wave2ReserveMs };
}
