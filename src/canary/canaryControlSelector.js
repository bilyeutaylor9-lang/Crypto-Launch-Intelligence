
function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function lower(value) { return String(value || "").toLowerCase(); }
function state(project = {}) { return project.capitalArrivalIntelligence?.state || project.capitalArrivalState || null; }
function vacuum(project = {}) {
  return project.capitalArrivalIntelligence?.supplyVacuumSupported ?? project.supplyVacuumSupported ?? null;
}
function distance(a = {}, b = {}) {
  const la = finite(a.stableExitLiquidityUsd ?? a.activeLiquidityUsd ?? a.liquidityUsd ?? a.marketData?.liquidityUsd);
  const lb = finite(b.stableExitLiquidityUsd ?? b.activeLiquidityUsd ?? b.liquidityUsd ?? b.marketData?.liquidityUsd);
  const ma = finite(a.marketCapUsd ?? a.marketCap ?? a.marketData?.marketCap);
  const mb = finite(b.marketCapUsd ?? b.marketCap ?? b.marketData?.marketCap);
  const logDiff = (x, y) => x !== null && y !== null && x > 0 && y > 0 ? Math.abs(Math.log(x / y)) : 2;
  return logDiff(la, lb) + 0.5 * logDiff(ma, mb);
}
function identity(project = {}) {
  const chain = lower(project.chain || project.network || project.canonicalChain);
  const token = lower(project.tokenAddress || project.contractAddress || project.address || project.symbol || project.name);
  return `${chain}:${token}`;
}

export function selectContemporaneousCanaryControls(treatment = {}, projects = [], options = {}) {
  const chain = lower(treatment.chain || treatment.network || treatment.canonicalChain);
  const treatmentId = identity(treatment);
  const rows = (Array.isArray(projects) ? projects : [])
    .filter((row) => identity(row) !== treatmentId && lower(row.chain || row.network || row.canonicalChain) === chain)
    .map((row) => ({ project: row, distance: distance(treatment, row) }))
    .sort((a, b) => a.distance - b.distance);

  const supplyOnly = rows.find(({ project }) => vacuum(project) === true && state(project) !== "COMMITTED_LOADED_VACUUM_SHADOW");
  const capitalOnly = rows.find(({ project }) => vacuum(project) === false && ["ARRIVAL_PRESSURE_BUILDING_SHADOW", "COMMITTED_LOADED_VACUUM_SHADOW"].includes(state(project)));
  const baseline = rows.find(({ project }) => vacuum(project) !== true && !["ARRIVAL_PRESSURE_BUILDING_SHADOW", "COMMITTED_LOADED_VACUUM_SHADOW"].includes(state(project)));
  const selected = [];
  if (supplyOnly) selected.push({ ...supplyOnly, role: "CONTROL_SUPPLY_ONLY" });
  if (capitalOnly) selected.push({ ...capitalOnly, role: "CONTROL_CAPITAL_ONLY" });
  if (baseline) selected.push({ ...baseline, role: "CONTROL_BASELINE" });
  return selected.slice(0, Math.max(1, Number(options.maxControlsPerTreatment || 3)));
}

export const __canaryControlHooks = { finite, lower, state, vacuum, distance, identity };
