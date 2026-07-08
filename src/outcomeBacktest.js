import { loadOutcomeSnapshots, summarizeOutcomeSnapshots } from "./learning/outcomeSnapshotStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function summarizeByKey(snapshots = []) {
  const grouped = new Map();

  for (const snapshot of snapshots) {
    if (!snapshot.key) continue;
    const list = grouped.get(snapshot.key) || [];
    list.push(snapshot);
    grouped.set(snapshot.key, list);
  }

  const outcomes = [];

  for (const [key, list] of grouped.entries()) {
    const sorted = [...list].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const first = sorted[0];
    const last = sorted.at(-1);

    if (!first || !last || first === last) continue;

    const priceChangePct =
      num(first.priceUsd) > 0 && num(last.priceUsd) > 0
        ? ((num(last.priceUsd) - num(first.priceUsd)) / num(first.priceUsd)) * 100
        : 0;

    outcomes.push({
      key,
      name: last.name || first.name || "Unknown",
      symbol: last.symbol || first.symbol || "Unknown",
      scans: sorted.length,
      firstScore: num(first.score),
      lastScore: num(last.score),
      scoreDelta: Math.round(num(last.score) - num(first.score)),
      priceChangePct: Number(priceChangePct.toFixed(2)),
    });
  }

  return outcomes.sort((a, b) => b.priceChangePct - a.priceChangePct);
}

const summary = summarizeOutcomeSnapshots();
const outcomes = summarizeByKey(loadOutcomeSnapshots());

console.log(JSON.stringify({
  ...summary,
  trackedOutcomes: outcomes.length,
  topWinners: outcomes.slice(0, 10),
  topLosers: outcomes.slice(-10).reverse(),
}, null, 2));
