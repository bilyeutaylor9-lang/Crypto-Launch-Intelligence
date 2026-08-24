import { finite, mean, seededRandom } from "./productionMath.js";

export function permutationDifferencePValue(treatmentValues = [], controlValues = [], options = {}) {
  const treatment = treatmentValues.map(finite).filter((v) => v !== null);
  const controls = controlValues.map(finite).filter((v) => v !== null);
  if (treatment.length < 3 || controls.length < 3) return { pValue: null, observedDifference: null, iterations: 0 };
  const observedDifference = (mean(treatment) ?? 0) - (mean(controls) ?? 0);
  const combined = [...treatment, ...controls];
  const treatmentSize = treatment.length;
  const iterations = Math.max(200, Number(options.iterations || 1000));
  const random = seededRandom(Number(options.seed || 99173));
  let extreme = 1;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const shuffled = [...combined];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const left = shuffled.slice(0, treatmentSize);
    const right = shuffled.slice(treatmentSize);
    const diff = (mean(left) ?? 0) - (mean(right) ?? 0);
    if (Math.abs(diff) >= Math.abs(observedDifference)) extreme += 1;
  }
  return { pValue: extreme / (iterations + 1), observedDifference, iterations };
}

export function benjaminiHochberg(rows = [], options = {}) {
  const alpha = Number(options.alpha || 0.05);
  const active = rows.map((row, index) => ({ row, index, pValue: finite(row.pValue) })).filter((item) => item.pValue !== null).sort((a, b) => a.pValue - b.pValue);
  const m = active.length;
  let maxAcceptedRank = 0;
  for (let rank = 1; rank <= m; rank += 1) if (active[rank - 1].pValue <= (rank / m) * alpha) maxAcceptedRank = rank;
  const adjusted = new Array(m).fill(1);
  let running = 1;
  for (let rank = m; rank >= 1; rank -= 1) {
    running = Math.min(running, Math.min(1, active[rank - 1].pValue * m / rank));
    adjusted[rank - 1] = running;
  }
  const map = new Map();
  active.forEach((item, index) => map.set(item.index, { qValue: adjusted[index], fdrAccepted: index + 1 <= maxAcceptedRank }));
  return rows.map((row, index) => ({ ...row, qValue: map.get(index)?.qValue ?? null, fdrAccepted: map.get(index)?.fdrAccepted ?? false, fdrAlpha: alpha }));
}
