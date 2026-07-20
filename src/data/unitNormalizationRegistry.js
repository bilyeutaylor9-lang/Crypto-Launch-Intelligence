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
]);

export function canonicalUnitForField(field = "") {
  if (USD_FIELDS.has(field)) return "usd";
  if (PCT_FIELDS.has(field)) return "pct";
  return "native";
}

export function normalizeUnitValue(value, canonicalField = "", sourceUnit = null) {
  if (value === null || value === undefined || value === "") {
    return { value: null, sourceUnit, canonicalUnit: canonicalUnitForField(canonicalField), conversionApplied: "none" };
  }
  const canonicalUnit = canonicalUnitForField(canonicalField);
  if (canonicalUnit === "usd" || canonicalUnit === "pct") {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return { value: null, sourceUnit, canonicalUnit, conversionApplied: "invalid-number" };
    }
    if (canonicalUnit === "pct" && sourceUnit === "decimal") {
      return { value: number * 100, sourceUnit, canonicalUnit, conversionApplied: "decimal-to-pct" };
    }
    return { value: number, sourceUnit, canonicalUnit, conversionApplied: "numeric" };
  }
  return { value, sourceUnit, canonicalUnit, conversionApplied: "none" };
}
