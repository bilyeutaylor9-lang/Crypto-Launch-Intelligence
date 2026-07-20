const USD_FIELDS = new Set([
  "circulatingMarketCapUsd",
  "fullyDilutedValuationUsd",
  "estimatedMarketCapUsd",
  "priceUsd",
  "liquidityUsd",
  "stableExitLiquidityUsd",
  "volume24hUsd",
  "buyVolume24hUsd",
  "sellVolume24hUsd",
  "bidDepthUsd",
  "askDepthUsd",
  "orderBookDepthUsd",
  "estimatedGasUsd",
  "estimatedFeesUsd",
]);

const PCT_FIELDS = new Set([
  "priceChange1hPct",
  "priceChange6hPct",
  "priceChange24hPct",
  "priceChange3dPct",
  "priceChange7dPct",
  "priceChange30dPct",
  "newBuyerRatio",
  "buyerRetentionRate",
  "holderGrowth24hPct",
  "largestHolderSharePct",
  "top10HolderSharePct",
  "nextUnlockPct",
  "inflationRateAnnualPct",
  "buyTaxPct",
  "sellTaxPct",
  "lpLockedPct",
  "lpBurnedPct",
  "ownerLpSharePct",
  "spreadPct",
  "priceImpactPct",
  "slippagePct",
]);

const UNIT_ALIASES = Object.freeze({
  usd: ["usd", "us dollar", "us dollars", "dollars", "$", "usd value", "quote value", "notional", "notional usd"],
  pct: ["percent", "percentage", "pct", "%"],
  bps: ["basis points", "bps"],
  decimal: ["decimal ratio", "fraction", "decimal"],
  token: ["tokens", "coins", "units", "raw amount", "base units", "wei", "gwei", "lamports", "atomic units", "smallest denomination"],
  seconds: ["seconds", "secs", "s"],
  minutes: ["minutes", "mins", "m"],
  hours: ["hours", "hrs", "h"],
  days: ["days", "d"],
  weeks: ["weeks", "w"],
  months: ["months", "mo"],
  years: ["years", "y"],
});

function clean(value = "") {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizeUnitLabel(unit = null) {
  if (!unit) return null;
  const normalized = clean(unit);
  for (const [canonical, aliases] of Object.entries(UNIT_ALIASES)) {
    if (canonical === normalized || aliases.some((alias) => clean(alias) === normalized)) return canonical;
  }
  return normalized;
}

export function canonicalUnitForField(field = "") {
  if (USD_FIELDS.has(field)) return "usd";
  if (PCT_FIELDS.has(field)) return "pct";
  return "native";
}

export function normalizeUnitValue(value, canonicalField = "", sourceUnit = null) {
  const normalizedSourceUnit = normalizeUnitLabel(sourceUnit);
  if (value === null || value === undefined || value === "") {
    return { value: null, sourceUnit: normalizedSourceUnit, canonicalUnit: canonicalUnitForField(canonicalField), conversionApplied: "none" };
  }
  const canonicalUnit = canonicalUnitForField(canonicalField);
  if (canonicalUnit === "usd" || canonicalUnit === "pct") {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return { value: null, sourceUnit: normalizedSourceUnit, canonicalUnit, conversionApplied: "invalid-number" };
    }
    if (canonicalUnit === "pct" && normalizedSourceUnit === "decimal") {
      return { value: number * 100, sourceUnit: normalizedSourceUnit, canonicalUnit, conversionApplied: "decimal-to-pct" };
    }
    if (canonicalUnit === "pct" && normalizedSourceUnit === "bps") {
      return { value: number / 100, sourceUnit: normalizedSourceUnit, canonicalUnit, conversionApplied: "bps-to-pct" };
    }
    return { value: number, sourceUnit: normalizedSourceUnit, canonicalUnit, conversionApplied: "numeric" };
  }
  return { value, sourceUnit: normalizedSourceUnit, canonicalUnit, conversionApplied: "none" };
}
