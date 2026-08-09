const GENERIC_MARKET_NAMES = new Set([
  "ai",
  "artificial intelligence",
  "avalanche",
  "arbitrum",
  "base",
  "binance smart chain",
  "bnb chain",
  "bsc",
  "defi",
  "depin",
  "ethereum",
  "gaming",
  "hyperliquid",
  "hyperliquid l1",
  "market",
  "meme",
  "polygon",
  "real world assets",
  "rwa",
  "robinhood chain",
  "solana",
  "sonic",
  "stablecoin",
  "stablecoins",
  "top volume",
  "trending",
]);

const AGGREGATE_SOURCE_PATTERN = /defillama|yield|category|ecosystem|top-volume|trending|market-list|coin-list/i;
const MEME_IDENTITY_SYMBOLS = new Set([
  "APU", "BONK", "CAPOO", "CAT", "DOG", "DOGE", "DOGGO", "DOGSHIT",
  "FLOKI", "FROG", "INU", "KITTY", "MEME", "MOG", "MONKEY", "PEPE",
  "PONKE", "POPCAT", "PUMP", "RACCOON", "RACCOOS", "SHIB", "TOAD",
  "TROLL", "WIF", "WOJAK",
]);
const MEME_IDENTITY_NAME_PATTERN =
  /\b(apu|bonk|bugcat|capoo|cat|dog|doge|dogecoin|doggo|dogshit|floki|frog|inu|kitty|kitten|meme|memecoin|meme coin|mog|monkey|pepe|ponke|popcat|pump|raccoon|raccoos|shib|toad|troll|wif|wojak)\b/i;

function text(value = "") {
  return String(value || "").trim();
}

function first(values = []) {
  return values.find((value) => value !== undefined && value !== null && text(value) !== "") ?? null;
}

function hasTradableIdentity(project = {}) {
  return Boolean(
    first([
      project.tokenAddress,
      project.contractAddress,
      project.canonicalAddress,
      project.finalContractAddress,
      project.poolAddress,
      project.pairAddress,
      project.primaryTradablePool,
      project.marketPair,
      project.marketData?.tokenAddress,
      project.marketData?.poolAddress,
      project.rawCandidate?.tokenAddress,
      project.rawCandidate?.contractAddress,
    ])
  );
}

function hasContractOrPoolIdentity(project = {}) {
  return Boolean(
    first([
      project.tokenAddress,
      project.contractAddress,
      project.canonicalAddress,
      project.finalContractAddress,
      project.poolAddress,
      project.pairAddress,
      project.primaryTradablePool,
      project.marketData?.tokenAddress,
      project.marketData?.poolAddress,
      project.rawCandidate?.tokenAddress,
      project.rawCandidate?.contractAddress,
    ])
  );
}

function sourceText(project = {}) {
  return [
    project.source,
    project.discoverySource,
    project.provider,
    project.category,
    project.discoveryCategory,
    ...(project.discoverySources || []),
  ]
    .filter(Boolean)
    .join(" ");
}

function compactMarketName(value = "") {
  return text(value)
    .toLowerCase()
    .replace(/^\$+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}\s.]/gu, " ")
    .replace(/\s+/g, " ");
}

export function isGenericMarketIdentity(project = {}) {
  const symbol = text(project.symbol || project.rawCandidate?.symbol);
  const name = text(project.name || project.projectName || project.rawCandidate?.name);
  const normalizedSymbol = compactMarketName(symbol);
  const normalizedName = compactMarketName(name);
  return GENERIC_MARKET_NAMES.has(normalizedSymbol) || GENERIC_MARKET_NAMES.has(normalizedName);
}

export function isLikelyMemeIdentity(project = {}) {
  return memeIdentitySignals(project).length > 0;
}

export function memeIdentitySignals(project = {}) {
  const symbol = text(project.symbol || project.rawCandidate?.symbol)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const name = text(project.name || project.projectName || project.rawCandidate?.name);
  const signals = [];

  if (MEME_IDENTITY_SYMBOLS.has(symbol)) signals.push(`symbol:${symbol}`);
  const nameHit = name.match(MEME_IDENTITY_NAME_PATTERN)?.[0];
  if (nameHit) signals.push(`name:${nameHit.toLowerCase().replace(/\s+/g, "-")}`);

  return [...new Set(signals)];
}

export function hasCleanDisplayIdentity(project = {}, options = {}) {
  const requireName = options.requireName !== false;
  const symbol = text(project.symbol || project.rawCandidate?.symbol);
  const name = text(project.name || project.projectName || project.rawCandidate?.name);

  if (!symbol) return false;
  if (requireName && !name) return false;
  if (symbol.length > 32 || name.length > 180) return false;
  if (/\s{2,}/.test(symbol) || symbol.split(/\s+/).length > 4) return false;
  if (name && name.split(/\s+/).length > 24) return false;
  if (/https?:\/\//i.test(symbol) || /https?:\/\//i.test(name)) return false;
  return true;
}

export function isLikelyAggregateCandidate(project = {}) {
  const symbol = text(project.symbol || project.rawCandidate?.symbol);
  const name = text(project.name || project.projectName || project.rawCandidate?.name);
  const normalizedSymbol = compactMarketName(symbol);
  const normalizedName = compactMarketName(name);
  const source = sourceText(project);
  const tradable = hasTradableIdentity(project);
  const contractOrPool = hasContractOrPoolIdentity(project);

  if (!hasCleanDisplayIdentity(project, { requireName: false })) return true;
  if (symbol.length > 24 && /^[A-Z0-9.$_-]+$/.test(symbol) && !tradable) return true;
  if (AGGREGATE_SOURCE_PATTERN.test(source) && !contractOrPool) return true;
  if (
    AGGREGATE_SOURCE_PATTERN.test(source) &&
    (GENERIC_MARKET_NAMES.has(normalizedSymbol) || GENERIC_MARKET_NAMES.has(normalizedName))
  ) {
    return true;
  }
  return false;
}

export function aggregateIdentityReason(project = {}) {
  if (!hasCleanDisplayIdentity(project, { requireName: false })) {
    return "Malformed or aggregate display identity.";
  }
  if (isLikelyAggregateCandidate(project)) {
    return "Provider row appears to describe a chain, category, protocol TVL, or aggregate market instead of a tradable token.";
  }
  return "";
}
