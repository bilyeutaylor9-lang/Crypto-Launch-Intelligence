import { normalizeChainId, normalizePoolAddress, normalizeTokenAddress } from "./strictIdentityValidators.js";

const present = (value) => value !== undefined && value !== null && String(value).trim() !== "";

function exactKey(value) {
  const match = String(value ?? "").trim().match(/^([^:]+):(?:token:)?(.+)$/i);
  if (!match) return null;
  const chain = normalizeChainId(match[1]);
  const tokenAddress = chain && normalizeTokenAddress(match[2], chain);
  return tokenAddress ? { chain, tokenAddress } : null;
}

// A bare legacy id or symbol cannot establish token identity. Structured aliases
// and any address-bearing id must agree; old stored ids are never rewritten.
export function exactScanHistoryIdentity(value = {}) {
  if (typeof value === "string") {
    const parsed = exactKey(value);
    return parsed ? { ...parsed, key: `${parsed.chain}:${parsed.tokenAddress}`, poolAddress: null } : null;
  }
  if (!value || typeof value !== "object" || value.historyIdentityStatus === "UNRESOLVED_OR_CONFLICTING_V1") return null;

  const asserted = [];
  for (const key of [value.identityKey, value.projectKey, value.permanentProjectKey].filter(present)) {
    const parsed = exactKey(key);
    if (!parsed) return null;
    asserted.push(parsed);
  }
  const rawId = present(value.id) ? String(value.id).trim() : "";
  if (rawId.includes(":")) {
    const parsed = exactKey(rawId);
    if (!parsed) return null;
    asserted.push(parsed);
  }
  const chains = [
    value.chain, value.network, value.chainId, value.baseToken?.chain,
    value.marketData?.chain, value.pointInTime?.identity?.chain,
  ].filter((item) => present(item) && String(item).trim().toLowerCase() !== "unknown").map(normalizeChainId);
  if (chains.some((chain) => !chain)) return null;
  chains.push(...asserted.map((item) => item.chain));
  if (!chains.length || new Set(chains).size !== 1) return null;
  const chain = chains[0];
  const addresses = [
    value.tokenAddress, value.contractAddress, value.canonicalAddress, value.address,
    value.baseToken?.address, value.marketData?.tokenAddress, value.pointInTime?.identity?.tokenAddress,
  ].filter(present).map((address) => normalizeTokenAddress(address, chain));
  if (addresses.some((address) => !address)) return null;
  addresses.push(...asserted.map((item) => item.tokenAddress));
  if (!addresses.length || new Set(addresses).size !== 1) return null;
  const tokenAddress = addresses[0];
  // Generic provider ids are metadata, not joins. A syntactically valid address
  // id, however, is an identity assertion and must not name another token.
  if (rawId && !rawId.includes(":") && (normalizeTokenAddress(rawId) || /^0x/i.test(rawId) || /^[A-Za-z0-9]{32,44}$/.test(rawId))) {
    if (normalizeTokenAddress(rawId, chain) !== tokenAddress) return null;
  }
  const pools = [
    value.poolAddress, value.pairAddress, value.primaryTradablePool,
    value.marketData?.poolAddress, value.pointInTime?.identity?.poolAddress,
  ].filter(present).map((pool) => normalizePoolAddress(pool, chain));
  if (pools.some((pool) => !pool) || new Set(pools).size > 1) return null;
  return { chain, tokenAddress, key: `${chain}:${tokenAddress}`, poolAddress: pools[0] || null };
}

// Pure receipt/cutoff validation is shared by historical queries and remote
// annotations. No storage/learning imports or live clock substitution is needed.
export function historyTimestamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "number") return value >= 0 && Number.isFinite(new Date(value).getTime()) ? value : null;
  if (typeof value !== "string") return null;
  const fields = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/);
  if (!fields) return null;
  const [, year, month, day, hour, minute, second, zone] = fields;
  const monthDays = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > monthDays || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  if (zone !== "Z" && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function resolveScanHistoryAsOf(options = {}) {
  if (Object.hasOwn(options, "clock") && typeof options.clock !== "function") throw new TypeError("History clock must be a function.");
  const now = historyTimestamp(Object.hasOwn(options, "clock") ? options.clock() : Date.now());
  if (now === null) throw new TypeError("History clock returned an invalid timestamp.");
  const asOf = Object.hasOwn(options, "asOf") ? historyTimestamp(options.asOf) : now;
  if (asOf === null || asOf > now) throw new TypeError("History asOf must be a valid timestamp no later than the clock.");
  return asOf;
}

export function sourceClocksValid(record, receivedAt) {
  const clocks = [
    record.marketObservedAt, record.observedAt, record.sourceTimestamp, record.dataTimestamp,
    record.pointInTime?.sourceTimestamp, record.pointInTime?.market?.observedAt,
  ];
  return clocks.every((value) => value === undefined || value === null ||
    (historyTimestamp(value) !== null && historyTimestamp(value) <= receivedAt));
}

export function scanHistoryProjectCutoff(project = {}, asOf) {
  if (project.historyClockStatus === "INVALID_CAPTURE_V1") return null;
  const clocks = [project.scanTimestamp, project.scannedAt, project.receivedAt, project.pointInTime?.capturedAt]
    .filter((value) => value !== undefined && value !== null);
  const times = clocks.map(historyTimestamp);
  if (times.some((time) => time === null || time > asOf)) return null;
  const cutoff = Math.min(asOf, ...times);
  return sourceClocksValid(project, cutoff) ? cutoff : null;
}
