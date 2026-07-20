export const VENUE_REGISTRY = Object.freeze({
  coinbase: ["coinbase", "coinbase exchange", "coinbase advanced", "coinbase pro", "gdax"],
  kraken: ["kraken", "kraken pro"],
  binance: ["binance", "binance global"],
  binance_us: ["binance.us", "binance us", "binanceus"],
  gemini: ["gemini"],
  okx: ["okx", "okex"],
  bybit: ["bybit"],
  kucoin: ["kucoin"],
  gate: ["gate", "gate.io", "gateio"],
  mexc: ["mexc"],
  bitget: ["bitget"],
  crypto_com: ["crypto.com", "cryptocom", "crypto com"],
  htx: ["htx", "huobi"],
  upbit: ["upbit"],
  bithumb: ["bithumb"],
  uniswap: ["uniswap", "uniswap v2", "uniswap v3"],
  aerodrome: ["aerodrome"],
  pancakeswap: ["pancakeswap", "pancake swap"],
  sushiswap: ["sushiswap", "sushi"],
  curve: ["curve"],
  balancer: ["balancer"],
  camelot: ["camelot"],
  quickswap: ["quickswap"],
  trader_joe: ["trader joe", "traderjoe"],
  velodrome: ["velodrome"],
  baseswap: ["baseswap", "base swap"],
  jupiter: ["jupiter"],
  raydium: ["raydium"],
  meteora: ["meteora"],
  orca: ["orca"],
  pumpswap: ["pumpswap", "pump swap"],
  cetus: ["cetus"],
  turbos: ["turbos"],
  aftermath: ["aftermath"],
  ston_fi: ["ston.fi", "stonfi"],
  dedust: ["dedust", "dedust.io"],
  osmosis: ["osmosis"],
  astroport: ["astroport"],
});

function norm(value = "") {
  return String(value ?? "").trim().toLowerCase().replace(/[_\s]+/g, "-");
}

export function normalizeVenue(value = "") {
  const key = norm(value);
  if (!key) return null;
  for (const [venue, aliases] of Object.entries(VENUE_REGISTRY)) {
    if (norm(venue) === key || aliases.some((alias) => norm(alias) === key)) return venue;
  }
  return key;
}

export function venueType(value = "") {
  const venue = normalizeVenue(value);
  if (!venue) return "unknown";
  return [
    "coinbase",
    "kraken",
    "binance",
    "binance_us",
    "gemini",
    "okx",
    "bybit",
    "kucoin",
    "gate",
    "mexc",
    "bitget",
    "crypto_com",
    "htx",
    "upbit",
    "bithumb",
  ].includes(venue)
    ? "cex"
    : "dex";
}
