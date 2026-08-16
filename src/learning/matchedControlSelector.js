function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function time(value) { const t = Date.parse(value || ""); return Number.isFinite(t) ? t : null; }
function logFeature(value) { const n = finite(value); return n !== null && n >= 0 ? Math.log1p(n) : null; }
function bounded(value, scale = 100) { const n = finite(value); return n === null ? null : Math.max(-3, Math.min(3, n / scale)); }

const IGNITION_ORDINAL = { DORMANT: 0, FORMING: 1, COMPRESSED: 2, ARMED: 3, IGNITING: 4, EXPANSION: 5, EXHAUSTION: 6 };

function featureDistance(left = {}, right = {}) {
  const pairs = [
    [logFeature(left.marketCapUsd), logFeature(right.marketCapUsd), 1.4],
    [logFeature(left.liquidityUsd), logFeature(right.liquidityUsd), 1.4],
    [logFeature(left.volume24hUsd), logFeature(right.volume24hUsd), 0.8],
    [bounded(left.productionScore), bounded(right.productionScore), 1.2],
    [bounded(left.riskScore), bounded(right.riskScore), 0.6],
    [bounded(left.priceChange24hPct, 50), bounded(right.priceChange24hPct, 50), 0.8],
    [bounded(left.evidenceCoveragePct), bounded(right.evidenceCoveragePct), 0.5],
  ];
  let distance = 0;
  let used = 0;
  let missing = 0;
  for (const [a, b, weight] of pairs) {
    if (a === null || b === null) { missing += weight; continue; }
    distance += weight * Math.abs(a - b);
    used += weight;
  }
  const aState = IGNITION_ORDINAL[left.ignitionState];
  const bState = IGNITION_ORDINAL[right.ignitionState];
  if (Number.isFinite(aState) && Number.isFinite(bState)) {
    distance += Math.abs(aState - bState) * 0.25;
    used += 0.25;
  }
  return Number(((distance + missing * 0.35) / Math.max(0.5, used + missing)).toFixed(6));
}

function eligibleControl(treated = {}, candidate = {}, options = {}) {
  if (!candidate?.identityKey || candidate.identityKey === treated.identityKey || candidate.treatment) return false;
  if (String(candidate.chain || "").toLowerCase() !== String(treated.chain || "").toLowerCase()) return false;
  if (treated.codeCommitSha && candidate.codeCommitSha && treated.codeCommitSha !== candidate.codeCommitSha && options.allowCrossCodeVersion !== true) return false;
  const t = time(treated.observedAt), c = time(candidate.observedAt);
  if (!t || !c || c > t) return false; // never use future control state
  if (treated.scanRunId && candidate.scanRunId && treated.scanRunId === candidate.scanRunId) return true;
  const maxHours = Math.max(0.25, Number(options.maxControlAgeHours || 2));
  return t - c <= maxHours * 3_600_000;
}

export function selectMatchedControls(treated = {}, candidates = [], options = {}) {
  const maxControls = Math.max(1, Number(options.maxControls || 3));
  const eligible = (Array.isArray(candidates) ? candidates : []).filter((candidate) => eligibleControl(treated, candidate, options));
  const preferred = eligible.filter((candidate) => candidate.supplyVacuumSupported === true);
  const pool = preferred.length >= Math.min(maxControls, Number(options.minPreferredControls || 1)) ? preferred : eligible;
  return pool
    .map((candidate) => ({ candidate, distance: featureDistance(treated, candidate), preferredVacuumNearMiss: candidate.supplyVacuumSupported === true }))
    .sort((a, b) => a.distance - b.distance || String(a.candidate.identityKey).localeCompare(String(b.candidate.identityKey)))
    .slice(0, maxControls)
    .map((row) => ({ ...row.candidate, matchDistance: row.distance, preferredVacuumNearMiss: row.preferredVacuumNearMiss }));
}

export const __matchedControlHooks = { featureDistance, eligibleControl, logFeature, bounded };
