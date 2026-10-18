import { normalizeChainId, normalizePoolAddress, normalizeTokenAddress } from "../identity/strictIdentityValidators.js";

function finite(value) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function time(value) { const t = Date.parse(value || ""); return Number.isFinite(t) ? t : null; }

export function edgeAsOfMs(options = {}) {
  const value = options.now === undefined ? Date.now() : typeof options.now === "function" ? options.now() : options.now;
  const parsed = value === null ? NaN : new Date(value).getTime();
  if (!Number.isFinite(parsed)) throw new Error("Edge evidence requires a valid report as-of timestamp.");
  return parsed;
}

export function canonicalEdgeIdentity(row = {}) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const present = (values) => values.filter((value) => value !== undefined && value !== null && value !== "");
  const chains = present([row.chain, row.chainId, row.network, row.canonicalChain]).map(normalizeChainId);
  if (!chains.length || chains.some((chain) => !chain || chain !== chains[0])) return null;
  const chain = chains[0];
  const tokens = present([row.tokenAddress, row.contractAddress, row.canonicalAddress, row.finalContractAddress, row.address, row.baseToken?.address])
    .map((value) => normalizeTokenAddress(value, chain));
  const pools = present([row.poolAddress, row.pairAddress, row.primaryTradablePool]).map((value) => normalizePoolAddress(value, chain));
  if (!tokens.length || tokens.some((token) => !token || /^0x0{40}$/.test(token) || token !== tokens[0]) ||
      pools.some((pool) => !pool || /^0x0{40}$/.test(pool) || pool !== pools[0])) return null;
  const identityKey = `${chain}:${tokens[0]}`;
  return { chain, tokenAddress: tokens[0], poolAddress: pools[0] || null,
    identityKey, routeKey: `${identityKey}:${pools[0] || "TOKEN_SCOPED"}` };
}

function stableContent(value) {
  if (Array.isArray(value)) return value.map(stableContent);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort()
    .filter((key) => value[key] !== undefined).map((key) => [key, stableContent(value[key])]));
  return value;
}

export function deduplicateEdgeRecords(records = [], keyFor = (row) => row?.episodeId) {
  const rows = new Map(), signatures = new Map(), conflicts = new Set();
  let duplicates = 0, invalid = 0;
  for (const row of Array.isArray(records) ? records : []) {
    const key = keyFor(row);
    if (!key) { invalid += 1; continue; }
    const signature = JSON.stringify(stableContent(row));
    if (signatures.has(key)) {
      if (signature !== signatures.get(key)) { conflicts.add(key); rows.delete(key); }
      else duplicates += 1;
    } else { signatures.set(key, signature); rows.set(key, row); }
  }
  return { rows: [...rows.values()], conflicts: [...conflicts], duplicates, invalid };
}
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
  const treatmentIdentity = canonicalEdgeIdentity(treated), controlIdentity = canonicalEdgeIdentity(candidate);
  if (!treatmentIdentity || !controlIdentity || treatmentIdentity.chain !== controlIdentity.chain ||
      controlIdentity.identityKey === treatmentIdentity.identityKey || candidate.treatment) return false;
  if (treated.codeCommitSha && candidate.codeCommitSha && treated.codeCommitSha !== candidate.codeCommitSha && options.allowCrossCodeVersion !== true) return false;
  if ((treated.signalDefinitionVersion || candidate.signalDefinitionVersion) && treated.signalDefinitionVersion !== candidate.signalDefinitionVersion) return false;
  const t = time(treated.observedAt), c = time(candidate.observedAt);
  const nowMs = edgeAsOfMs(options);
  if (t === null || c === null || c > t || t > nowMs || c > nowMs) return false;
  const maxHours = Math.max(0.25, Number(options.maxControlAgeHours || 2));
  return t - c <= maxHours * 3_600_000;
}

export function selectMatchedControls(treated = {}, candidates = [], options = {}) {
  const now = edgeAsOfMs(options);
  const maxControls = Math.max(1, Number(options.maxControls || 3));
  const deduplicated = deduplicateEdgeRecords(candidates, (row) => {
    const identity = row && canonicalEdgeIdentity(row);
    const at = time(row?.observedAt);
    return identity && at !== null ? `${identity.identityKey}:${at}` : null;
  });
  const latest = new Map();
  for (const candidate of deduplicated.rows.filter((row) => eligibleControl(treated, row, { ...options, now }))) {
    const identity = canonicalEdgeIdentity(candidate);
    const previous = latest.get(identity.identityKey);
    if (!previous || time(candidate.observedAt) > time(previous.observedAt)) latest.set(identity.identityKey, candidate);
  }
  const eligible = [...latest.values()];
  const preferred = eligible.filter((candidate) => candidate.supplyVacuumSupported === true);
  const pool = preferred.length >= Math.min(maxControls, Number(options.minPreferredControls || 1)) ? preferred : eligible;
  return pool
    .map((candidate) => ({ candidate, distance: featureDistance(treated, candidate), preferredVacuumNearMiss: candidate.supplyVacuumSupported === true }))
    .sort((a, b) => a.distance - b.distance || String(a.candidate.identityKey).localeCompare(String(b.candidate.identityKey)))
    .slice(0, maxControls)
    .map((row) => ({ ...row.candidate, ...canonicalEdgeIdentity(row.candidate), matchDistance: row.distance, preferredVacuumNearMiss: row.preferredVacuumNearMiss }));
}

export const __matchedControlHooks = { finite, featureDistance, eligibleControl, logFeature, bounded };
