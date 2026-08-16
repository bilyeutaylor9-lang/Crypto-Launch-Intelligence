import fs from "fs";
import path from "path";
import { loadCanonicalThreeClockObservations } from "../data/canonicalThreeClockObservationStore.js";

export const THREE_CLOCK_HORIZONS_HOURS = Object.freeze([1, 6, 24, 72, 168, 720]);

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function median(values = []) {
  const sorted = values.map(num).filter((value) => value !== null).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function returnPct(entry, exit) {
  const start = num(entry), finish = num(exit);
  return start !== null && start > 0 && finish !== null ? ((finish - start) / start) * 100 : null;
}

function rowsForIdentity(observations, identityKey) {
  return observations.filter((row) => row.identityKey === identityKey).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
}

function laterWindow(observations, signal, hours) {
  const start = Date.parse(signal.observedAt);
  const target = start + hours * 3_600_000;
  // A point later than the exact target is allowed only within one half-horizon.
  const maximum = target + Math.max(3_600_000, hours * 1_800_000);
  return rowsForIdentity(observations, signal.identityKey).filter((row) => {
    const time = Date.parse(row.observedAt);
    return Number.isFinite(time) && time > start && time <= maximum;
  });
}

function pathOutcome(observations, signal, hours) {
  const window = laterWindow(observations, signal, hours);
  const entry = num(signal.priceUsd);
  if (entry === null || entry <= 0 || !window.length) return null;
  const prices = window.map((row) => num(row.priceUsd)).filter((price) => price !== null && price > 0);
  if (!prices.length) return null;
  const target = Date.parse(signal.observedAt) + hours * 3_600_000;
  const closest = [...window].sort((a, b) => Math.abs(Date.parse(a.observedAt) - target) - Math.abs(Date.parse(b.observedAt) - target))[0];
  const plus25 = prices.findIndex((price) => returnPct(entry, price) >= 25);
  const minus15 = prices.findIndex((price) => returnPct(entry, price) <= -15);
  const plus50 = prices.findIndex((price) => returnPct(entry, price) >= 50);
  const minus20 = prices.findIndex((price) => returnPct(entry, price) <= -20);
  return {
    returnPct: returnPct(entry, closest.priceUsd),
    mfePct: Math.max(...prices.map((price) => returnPct(entry, price))),
    maePct: Math.min(...prices.map((price) => returnPct(entry, price))),
    plus25BeforeMinus15: plus25 !== -1 && (minus15 === -1 || plus25 < minus15),
    plus50BeforeMinus20: plus50 !== -1 && (minus20 === -1 || plus50 < minus20),
    observedAt: closest.observedAt,
  };
}

function sameScanControls(observations, signal) {
  const signalTime = Date.parse(signal.observedAt);
  const cap = num(signal.marketCapUsd), liquidity = num(signal.liquidityUsd), priceChange = num(signal.priceChange24hPct);
  return observations.filter((row) => {
    if (row.identityKey === signal.identityKey || row.qualifying) return false;
    if (String(row.chain || "").toLowerCase() !== String(signal.chain || "").toLowerCase()) return false;
    if (Math.abs(Date.parse(row.observedAt) - signalTime) > 5 * 60_000) return false;
    const rowCap = num(row.marketCapUsd), rowLiquidity = num(row.liquidityUsd), rowPriceChange = num(row.priceChange24hPct);
    if (cap !== null && rowCap !== null && Math.abs(Math.log((rowCap + 1) / (cap + 1))) > Math.log(3)) return false;
    if (liquidity !== null && rowLiquidity !== null && Math.abs(Math.log((rowLiquidity + 1) / (liquidity + 1))) > Math.log(3)) return false;
    if (priceChange !== null && rowPriceChange !== null && Math.abs(rowPriceChange - priceChange) > 20) return false;
    return true;
  }).slice(0, 20);
}

function observationAblations(signal) {
  const project = num(signal.projectClock?.score), capital = num(signal.capitalClock?.score), attention = num(signal.attentionClock?.score);
  return {
    projectOnly: project !== null && project >= 65,
    capitalOnly: capital !== null && capital >= 58,
    attentionQuietOnly: attention !== null && attention <= 42,
    projectCapital: project !== null && project >= 65 && capital !== null && capital >= 58,
    projectAttention: project !== null && project >= 65 && attention !== null && attention <= 42,
    capitalAttention: capital !== null && capital >= 58 && attention !== null && attention <= 42,
    threeClock: signal.qualifying === true,
    ignitionContextPresent: signal.ignitionContext?.capitalMigrationScore !== null && signal.ignitionContext?.capitalMigrationScore !== undefined,
  };
}

export function evaluateThreeClockObservations(observations = [], options = {}) {
  const signals = observations.filter((row) => row.qualifying && num(row.priceUsd) !== null);
  const episodes = signals.map((signal) => {
    const outcomes = Object.fromEntries(THREE_CLOCK_HORIZONS_HOURS.map((hours) => [hours, pathOutcome(observations, signal, hours)]));
    const controls = sameScanControls(observations, signal);
    const matched = Object.fromEntries(THREE_CLOCK_HORIZONS_HOURS.map((hours) => {
      const treated = outcomes[hours];
      const returns = controls.map((control) => pathOutcome(observations, control, hours)?.returnPct).filter((value) => value !== null);
      const controlMedianReturnPct = median(returns);
      return [hours, { controls: returns.length, controlMedianReturnPct, treatedMinusControlPct: treated?.returnPct !== null && controlMedianReturnPct !== null ? treated.returnPct - controlMedianReturnPct : null }];
    }));
    return { identityKey: signal.identityKey, observedAt: signal.observedAt, chain: signal.chain, priceUsd: signal.priceUsd, outcomes, matched, ablations: observationAblations(signal) };
  });

  const horizonSummary = Object.fromEntries(THREE_CLOCK_HORIZONS_HOURS.map((hours) => {
    const rows = episodes.map((episode) => episode.outcomes[hours]).filter(Boolean);
    const matched = episodes.map((episode) => episode.matched[hours]?.treatedMinusControlPct).filter((value) => value !== null);
    return [hours, {
      resolvedEpisodes: rows.length,
      medianReturnPct: median(rows.map((row) => row.returnPct)), medianMfePct: median(rows.map((row) => row.mfePct)), medianMaePct: median(rows.map((row) => row.maePct)),
      plus25BeforeMinus15Rate: rows.length ? rows.filter((row) => row.plus25BeforeMinus15).length / rows.length : null,
      plus50BeforeMinus20Rate: rows.length ? rows.filter((row) => row.plus50BeforeMinus20).length / rows.length : null,
      matchedMedianLiftPct: median(matched), matchedEpisodes: matched.length,
    }];
  }));
  const ablationNames = ["projectOnly", "capitalOnly", "attentionQuietOnly", "projectCapital", "projectAttention", "capitalAttention", "threeClock", "ignitionContextPresent"];
  const ablations = Object.fromEntries(ablationNames.map((name) => {
    const group = episodes.filter((episode) => episode.ablations[name]);
    const returns = group.map((episode) => episode.outcomes[24]?.returnPct).filter((value) => value !== null);
    return [name, { episodes: group.length, resolved24h: returns.length, median24hReturnPct: median(returns) }];
  }));
  const resolved168h = horizonSummary[168].resolvedEpisodes;
  return {
    generatedAt: new Date().toISOString(), status: resolved168h < Number(options.minimumResolvedEpisodes || 30) ? "COLLECTING" : "DESCRIPTIVE_ONLY_NOT_PROMOTED",
    note: "All outcomes use only observations after the frozen signal. Missing future observations remain unresolved; no zero return is imputed.",
    observations: observations.length, qualifyingSignals: signals.length, episodes, horizonSummary, ablations,
    promotionEligible: false,
  };
}

export function runThreeClockOutcomeLab(options = {}) {
  const observations = loadCanonicalThreeClockObservations(options.store || {});
  const report = evaluateThreeClockObservations(observations, options);
  const output = options.filePath || path.resolve("reports", "three-clock-outcomes.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  return { filePath: output, report };
}

if (process.argv[1]?.endsWith("threeClockOutcomeLab.js")) {
  console.log(JSON.stringify(runThreeClockOutcomeLab(), null, 2));
}
