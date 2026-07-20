export const VENUE_REGISTRY = Object.freeze({
  coinbase: ["coinbase", "coinbase exchange", "coinbase advanced", "coinbase advanced trade", "coinbase pro", "gdax", "coinbase spot", "cb", "cb advanced"],
  kraken: ["kraken", "kraken pro"],
  binance: ["binance", "binance global", "binance.com", "binance spot", "binance international"],
  binance_us: ["binance.us", "binance us", "binanceus", "binance america", "us binance"],
  gemini: ["gemini", "gemini exchange", "gemini activetrader"],
  okx: ["okx", "okex", "ok exchange"],
  bybit: ["bybit", "bybit spot"],
  kucoin: ["kucoin", "ku coin", "kucoin exchange"],
  gate: ["gate", "gate.io", "gateio", "gate exchange"],
  mexc: ["mexc", "mexc global", "mxc", "mexc exchange"],
  bitget: ["bitget", "bit get", "bitget spot"],
  crypto_com: ["crypto.com", "cryptocom", "crypto com", "crypto.com exchange", "cdc exchange"],
  htx: ["htx", "huobi"],
  upbit: ["upbit"],
  bithumb: ["bithumb"],
  bitstamp: ["bitstamp", "bit stamp"],
  bitfinex: ["bitfinex", "bit finex"],
  coinex: ["coinex", "coin ex", "coinex exchange"],
  lbank: ["lbank", "l bank", "lbank exchange"],
  bingx: ["bingx", "bing x"],
  phemex: ["phemex", "phemex exchange"],
  bitrue: ["bitrue", "bit rue"],
  ascendex: ["ascendex", "bitmax", "ascend ex"],
  uniswap: ["uniswap", "unis wap", "uni", "uniswap v2", "uniswap v3", "uniswap v4", "uni v2", "uni v3", "uni v4", "uniswap router", "uniswap pool"],
  aerodrome: ["aerodrome", "aerodrome finance", "aero", "aerodrome slipstream"],
  pancakeswap: ["pancakeswap", "pancake swap", "pcs", "pancake v2", "pancake v3", "pancake infinity", "pancakeswap router"],
  sushiswap: ["sushiswap", "sushi swap", "sushi", "sushi dex"],
  curve: ["curve", "curve finance", "curve.fi", "curve dex", "curve pool"],
  balancer: ["balancer", "balancer v2", "balancer v3", "balancer vault"],
  camelot: ["camelot", "camelot dex", "camelot v2", "camelot v3"],
  quickswap: ["quickswap", "quick swap", "quickswap v2", "quickswap v3"],
  trader_joe: ["trader joe", "traderjoe", "joe dex", "liquidity book", "joe liquidity book"],
  velodrome: ["velodrome", "velodrome finance", "velo dex", "velodrome slipstream"],
  baseswap: ["baseswap", "base swap"],
  jupiter: ["jupiter", "jupiter aggregator", "jupiter swap", "jup aggregator", "jupiter routing"],
  raydium: ["raydium", "raydium amm", "raydium clmm", "raydium cpmm", "raydium launchlab"],
  meteora: ["meteora", "meteora dlmm", "meteora dynamic pool", "meteora damm"],
  orca: ["orca", "orca whirlpool", "whirlpools", "orca dex"],
  pumpswap: ["pumpswap", "pump swap", "pump.fun swap", "pump amm"],
  cetus: ["cetus", "cetus protocol", "cetus clmm"],
  turbos: ["turbos", "turbos finance", "turbos dex"],
  aftermath: ["aftermath", "aftermath finance", "aftermath dex"],
  ston_fi: ["ston.fi", "stonfi", "ston fi", "ston dex"],
  dedust: ["dedust", "de dust", "dedust.io"],
  osmosis: ["osmosis", "osmosis dex", "osmosis zone", "osmosis amm"],
  astroport: ["astroport", "astroport finance", "astro dex"],
  oneinch: ["1inch", "one inch", "1inch aggregator", "1inch router"],
  zero_x: ["0x", "zeroex", "0x protocol", "0x api", "matcha", "matcha xyz"],
  kyberswap: ["kyberswap", "kyber swap", "kyber network", "kyber aggregator"],
  paraswap: ["paraswap", "para swap", "paraswap aggregator"],
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

export function parseVenueProtocolVersion(value = "") {
  const text = String(value ?? "").toLowerCase();
  const match = text.match(/\bv\s*([234])\b|v([234])\b/);
  if (!match) return null;
  return `v${match[1] || match[2]}`;
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
    "bitstamp",
    "bitfinex",
    "coinex",
    "lbank",
    "bingx",
    "phemex",
    "bitrue",
    "ascendex",
  ].includes(venue)
    ? "cex"
    : "dex";
}
