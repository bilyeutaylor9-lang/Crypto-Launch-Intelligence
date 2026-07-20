export const ALIAS_CONFIDENCE = Object.freeze({
  EXACT_ALIAS: 96,
  PROVIDER_ALIAS: 90,
  STRUCTURAL_ALIAS: 86,
  SEMANTIC_ALIAS: 74,
  FUZZY_ALIAS: 58,
  INFERRED_ALIAS: 48,
  REJECTED_ALIAS: 0,
});

export const IDENTITY_CRITICAL_FIELDS = new Set([
  "symbol",
  "tokenAddress",
  "poolAddress",
  "chain",
  "projectId",
  "marketPair",
]);

const PROTECTED_FUZZY_FIELDS = new Set([
  ...IDENTITY_CRITICAL_FIELDS,
  "transactionHash",
  "chainId",
  "contractId",
]);

const TYPO_ALIAS_MAP = Object.freeze({
  liquidityUsd: [
    "liquidity",
    "liqudity",
    "liquidty",
    "liqudityusd",
    "liqidity",
    "liquidityy",
    "liq",
    "liqd",
    "liquid",
    "pool liquidity",
    "trading liquidity",
  ],
  circulatingMarketCapUsd: [
    "market cap",
    "marketcap",
    "market-cap",
    "market_cap",
    "marketcapp",
    "market capital",
    "market capitalization",
    "market capitalisation",
    "mcap",
    "mc",
    "mkt cap",
    "mktcap",
  ],
  volume24hUsd: [
    "volume",
    "vol",
    "vol.",
    "volum",
    "volme",
    "vlm",
    "trading volume",
    "turnover",
    "trade turnover",
    "market turnover",
  ],
  uniqueBuyers24h: [
    "buyers",
    "buyer",
    "buyors",
    "buers",
    "purchasers",
    "buying wallets",
    "buy-side users",
    "buy participants",
  ],
  holderCount: [
    "holders",
    "holder",
    "hodlers",
    "hodler count",
    "token owners",
    "wallet owners",
    "token accounts",
    "ownership accounts",
  ],
  tokenAddress: [
    "contract",
    "contrct",
    "conract",
    "token contract",
    "smart contract",
    "asset contract",
    "mint",
    "token mint",
  ],
});

export const CONFIDENCE_STATUS_ALIASES = Object.freeze({
  HIGH_CONFIDENCE: [
    "high confidence",
    "strong confidence",
    "highly confident",
    "confirmed confidence",
    "verified confidence",
    "robust evidence",
    "strong evidence",
    "multiple source confirmation",
    "institutional confidence",
    "high certainty",
  ],
  MEDIUM_CONFIDENCE: [
    "medium confidence",
    "moderate confidence",
    "developing confidence",
    "partial confidence",
    "reasonable evidence",
    "some confirmation",
    "provisional confidence",
    "supported but incomplete",
  ],
  LOW_CONFIDENCE: [
    "low confidence",
    "weak confidence",
    "limited confidence",
    "tentative",
    "speculative",
    "early evidence",
    "thin evidence",
    "single source only",
    "unconfirmed",
    "preliminary",
  ],
  INSUFFICIENT_CONFIDENCE: [
    "insufficient confidence",
    "insufficient evidence",
    "not enough data",
    "data starved",
    "evidence starved",
    "unresolved",
    "not measurable",
    "cannot determine",
    "no reliable conclusion",
    "unknown confidence",
  ],
});

export const RESEARCH_PHRASE_TAGS = Object.freeze({
  ORGANIC_DEMAND_POSITIVE: [
    "organic demand",
    "real buyers",
    "authentic demand",
    "genuine users",
    "broad participation",
    "independent buying",
    "natural adoption",
    "non-incentivized demand",
    "retained users",
  ],
  MANIPULATION_RISK: [
    "fake volume",
    "wash trading",
    "circular trading",
    "coordinated wallets",
    "sybil activity",
    "bot activity",
    "manufactured volume",
    "spoofed demand",
    "insider buying",
    "bundled wallets",
  ],
  LIQUIDITY_RISK: [
    "thin liquidity",
    "shallow pool",
    "fragile liquidity",
    "removable liquidity",
    "exit risk",
    "low depth",
    "high slippage",
    "poor exit capacity",
    "liquidity concentration",
  ],
  EARLY_OPPORTUNITY: [
    "under the radar",
    "pre-consensus",
    "undervalued attention",
    "neglected project",
    "early traction",
    "quiet accumulation",
    "information advantage",
    "unrecognized growth",
    "before broad discovery",
  ],
  LATE_RISK: [
    "already pumped",
    "overextended",
    "crowded",
    "late entry",
    "parabolic",
    "priced in",
    "blow-off top",
    "momentum exhaustion",
  ],
});

export const LIFECYCLE_STAGE_ALIASES = Object.freeze({
  PRELAUNCH: ["prelaunch", "pre-launch", "before launch", "coming soon", "token not live", "tge pending", "ido upcoming", "ico upcoming", "launch pending", "mainnet pending"],
  NEWLY_LAUNCHED: ["newly launched", "new launch", "just launched", "fresh launch", "recent launch", "early launch", "new pool", "fresh pool", "recently deployed", "new token", "new listing"],
  EARLY_TRACTION: ["early traction", "initial adoption", "early growth", "first user growth", "emerging activity", "early market validation", "early community formation"],
  QUIET_ACCUMULATION: ["quiet accumulation", "stealth accumulation", "under-the-radar accumulation", "silent buying", "low-attention buying", "price compression with inflows", "subtle accumulation", "smart-wallet accumulation"],
  PRE_BREAKOUT: ["pre-breakout", "before breakout", "breakout setup", "coiled setup", "compression setup", "expansion pending", "early momentum setup", "pre-consensus breakout", "breakout watch"],
  BREAKOUT: ["breakout", "price expansion", "range breakout", "momentum breakout", "volume breakout", "confirmed expansion", "new high breakout"],
  EXTENDED: ["extended", "overextended", "stretched", "overheated", "far above trend", "late-stage momentum", "crowded move", "parabolic extension"],
  LATE_CHASE: ["late chase", "already pumped", "chasing", "too late", "parabolic move", "blow-off move", "post-pump", "price already exploded", "crowded breakout"],
  BREAKDOWN: ["breakdown", "trend failure", "support failure", "liquidity collapse", "price collapse", "distribution", "major selloff", "failed breakout"],
  DEAD: ["dead project", "inactive market", "no volume", "abandoned token", "dead liquidity", "inactive pool", "no market activity", "delisted everywhere"],
});

export const NARRATIVE_ALIASES = Object.freeze({
  AI: ["ai", "artificial intelligence", "machine learning", "ml", "ai agents", "agentic ai", "autonomous agents", "llm", "large language model", "inference", "ai compute", "decentralized ai", "ai infrastructure", "ai marketplace"],
  GAMING: ["gaming", "gamefi", "game fi", "web3 gaming", "blockchain gaming", "play-to-earn", "p2e", "gaming ecosystem", "game token", "metaverse gaming", "player economy", "gaming agents"],
  RWA: ["rwa", "real-world assets", "real world assets", "tokenized assets", "tokenized securities", "tokenized stocks", "tokenized treasuries", "on-chain credit", "real-world credit", "asset tokenization"],
  DEPIN: ["depin", "decentralized physical infrastructure", "physical infrastructure network", "wireless network", "decentralized compute", "decentralized storage", "sensor network", "gpu network", "bandwidth marketplace"],
  DEFI: ["defi", "decentralized finance", "dex", "lending", "borrowing", "yield", "yield farming", "liquidity protocol", "amm", "perpetuals", "derivatives", "restaking", "liquid staking"],
  INFRASTRUCTURE: ["infrastructure", "crypto infrastructure", "web3 infrastructure", "middleware", "developer tooling", "sdk", "oracle", "indexer", "data availability", "sequencer", "interoperability", "modular blockchain", "rollup infrastructure"],
  MEME: ["meme", "memecoin", "meme coin", "community coin", "culture coin", "viral token", "dog coin", "cat coin", "internet culture token"],
  SOCIALFI: ["socialfi", "social finance", "creator economy", "social token", "fan token", "decentralized social", "on-chain social", "creator monetization"],
  PAYMENTS: ["payments", "payment token", "merchant payments", "remittance", "cross-border payments", "settlement token", "stablecoin payments", "payment rail"],
});

export const CATALYST_ALIASES = Object.freeze({
  EXCHANGE_LISTING_CONFIRMED: ["listing confirmed", "official exchange listing", "will list", "trading begins", "spot listing announced", "market launch confirmed", "deposits open", "trading pair announced"],
  EXCHANGE_LISTING_RUMOR: ["listing rumor", "possible listing", "may list", "exchange speculation", "community listing rumor", "unconfirmed listing", "listing expected", "listing prediction"],
  MAINNET_LAUNCH: ["mainnet launch", "mainnet goes live", "production network launch", "network activation", "mainnet release", "genesis launch"],
  PRODUCT_RELEASE: ["product release", "platform launch", "app launch", "dapp launch", "feature release", "protocol release", "public beta", "open beta", "version release", "major upgrade"],
  PARTNERSHIP_CONFIRMED: ["official partnership", "strategic partnership", "integration announced", "collaboration confirmed", "joint initiative", "official integration"],
  TOKEN_BURN: ["token burn", "supply burn", "buyback and burn", "burn event", "tokens destroyed", "deflationary burn", "periodic burn", "revenue-funded burn"],
  STAKING_LAUNCH: ["staking launch", "staking goes live", "staking enabled", "validator staking", "token staking", "yield program launch", "staking pool launch"],
});

export const BRIDGE_ALIASES = Object.freeze({
  layerzero: ["layerzero", "layer zero", "layerzero oft", "oft bridge", "omnichain fungible token bridge"],
  wormhole: ["wormhole", "portal bridge", "wormhole portal", "wormhole connect"],
  stargate: ["stargate", "stargate finance", "stargate bridge"],
  across: ["across", "across protocol", "across bridge"],
  hop: ["hop", "hop protocol", "hop exchange", "hop bridge"],
  synapse: ["synapse", "synapse protocol", "synapse bridge"],
  celer: ["celer", "cbridge", "celer cbridge", "celer network"],
  debridge: ["debridge", "de bridge", "dln", "debridge dln"],
  axelar: ["axelar", "axelar network", "axelar gmp", "satellite bridge"],
  chainlink_ccip: ["chainlink ccip", "ccip", "cross-chain interoperability protocol"],
  official_native_bridge: ["official bridge", "native bridge", "canonical bridge", "chain bridge", "l1 bridge", "l2 bridge", "rollup bridge"],
});

export const SECURITY_RISK_ALIASES = Object.freeze({
  HONEYPOT_CONFIRMED: ["confirmed honeypot", "honeypot detected", "cannot sell", "sell simulation failed", "sell transaction blocked", "exit impossible", "trapped token", "buy-only token", "malicious sell restriction"],
  HONEYPOT_SUSPECTED: ["possible honeypot", "honeypot risk", "suspected honeypot", "sell test inconclusive", "high sell failure rate", "sell behavior suspicious"],
  MINT_AUTHORITY_ACTIVE: ["mint authority active", "mintable", "owner can mint", "additional supply can be minted", "unlimited mint", "mint permission enabled", "supply expansion possible", "token issuance privilege active"],
  FREEZE_AUTHORITY_ACTIVE: ["freeze authority active", "accounts can be frozen", "transfer freeze enabled", "token freeze permission active", "blacklist authority active", "denylist enabled"],
  OWNER_PRIVILEGES_ACTIVE: ["owner privileges", "admin privileges", "owner controls", "administrator controls", "privileged functions", "centralized owner", "contract admin active", "owner can modify", "upgrade authority active"],
  PROXY_UPGRADEABLE: ["proxy contract", "upgradeable proxy", "implementation contract", "delegatecall proxy", "transparent proxy", "uups proxy", "admin upgradeable", "implementation can change"],
  HIGH_TAX: ["high tax", "high transfer fee", "excessive buy tax", "excessive sell tax", "punitive fee", "transfer-tax token", "fee-on-transfer", "reflection fee", "marketing tax", "liquidity tax"],
  BLACKLIST_ENABLED: ["blacklist enabled", "denylist enabled", "address blocking", "wallet blocking", "account restriction", "transfer blacklist", "admin can block wallets"],
});

export const LIQUIDITY_LOCK_ALIASES = Object.freeze({
  LIQUIDITY_LOCKED: ["liquidity locked", "lp locked", "lp tokens locked", "pool locked", "liquidity time-locked", "liquidity locker", "locked lp", "locked pool position", "permanent liquidity lock"],
  LIQUIDITY_BURNED: ["lp burned", "liquidity burned", "lp tokens sent to dead address", "pool ownership burned", "liquidity permanently burned", "lp destroyed"],
  LIQUIDITY_UNLOCKED: ["lp unlocked", "liquidity unlocked", "removable liquidity", "owner-controlled lp", "withdrawable liquidity", "creator controls liquidity", "unlocked pool"],
  LOCK_STATUS_UNKNOWN: ["lock unknown", "lp status unknown", "liquidity lock not verified", "no locker evidence", "burn status unconfirmed", "lock data unavailable"],
});

export const QUOTE_ASSET_REGISTRY = Object.freeze({
  USDT: ["usdt", "tether", "tether usd", "usd₮"],
  USDC: ["usdc", "usd coin", "native usdc"],
  USDC_E: ["usdc.e", "bridged usdc"],
  USD: ["usd", "us dollar", "dollar", "fiat usd"],
  ETH: ["eth", "ether", "ethereum"],
  WETH: ["weth", "wrapped ether", "wrapped eth"],
  BNB: ["bnb", "binance coin"],
  WBNB: ["wbnb", "wrapped bnb"],
  SOL: ["sol", "solana"],
  WSOL: ["wsol", "wrapped sol"],
  BTC: ["btc", "bitcoin"],
  WBTC: ["wbtc", "wrapped bitcoin"],
  CBBTC: ["cbbtc"],
  TBTC: ["tbtc"],
  DAI: ["dai", "maker dai"],
  FRAX: ["frax", "frax dollar"],
  FDUSD: ["fdusd", "first digital usd"],
});

export const WRAPPED_ASSET_RELATIONS = Object.freeze({
  WETH: "ETH",
  WBNB: "BNB",
  WSOL: "SOL",
  WBTC: "BTC",
  CBBTC: "BTC",
  TBTC: "BTC",
  USDC_E: "USDC",
});

export function normalizeAliasText(value = "") {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[._/:-]+/g, " ")
    .replace(/[$,()[\]{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactAliasText(value = "") {
  return normalizeAliasText(value).replace(/[^a-z0-9]+/g, "");
}

export function fieldNameFromPath(path = "") {
  const parts = String(path || "").split(".").filter(Boolean);
  return parts.at(-1) || String(path || "");
}

export function parentPath(path = "") {
  const parts = String(path || "").split(".").filter(Boolean);
  return parts.slice(0, -1).join(".");
}

function levenshtein(a = "", b = "") {
  const left = compactAliasText(a);
  const right = compactAliasText(b);
  if (!left || !right) return Math.max(left.length, right.length);
  if (Math.abs(left.length - right.length) > 3) return 99;
  const previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = left[i - 1] === right[j - 1]
        ? previous[j - 1]
        : Math.min(previous[j - 1] + 1, previous[j] + 1, current[j - 1] + 1);
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

export function normalizeQuoteAsset(value = "") {
  const key = compactAliasText(value);
  if (!key) return null;
  for (const [asset, aliases] of Object.entries(QUOTE_ASSET_REGISTRY)) {
    if (compactAliasText(asset) === key || aliases.some((alias) => compactAliasText(alias) === key)) {
      return {
        asset,
        family: WRAPPED_ASSET_RELATIONS[asset] || asset,
        wrapped: Boolean(WRAPPED_ASSET_RELATIONS[asset]),
      };
    }
  }
  return { asset: String(value || "").toUpperCase(), family: String(value || "").toUpperCase(), wrapped: false };
}

function normalizeFromRegistry(value = "", registry = {}) {
  const normalized = normalizeAliasText(value);
  if (!normalized) return null;
  for (const [canonical, aliases] of Object.entries(registry)) {
    if (normalizeAliasText(canonical) === normalized || aliases.some((alias) => normalizeAliasText(alias) === normalized)) {
      return canonical;
    }
  }
  return null;
}

export function normalizeBridge(value = "") {
  return normalizeFromRegistry(value, BRIDGE_ALIASES);
}

export function normalizeSecurityRiskPhrase(value = "") {
  return normalizeFromRegistry(value, SECURITY_RISK_ALIASES);
}

export function normalizeLiquidityLockPhrase(value = "") {
  return normalizeFromRegistry(value, LIQUIDITY_LOCK_ALIASES);
}

export function parseMarketPair(value = "") {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const derivative = /(\.p|perp|perpetual|futures|swap)$/i.test(raw) || /[-_\s](perp|perpetual|futures)$/i.test(raw);
  const cleaned = raw
    .replace(/[-_\s](spot)$/i, "")
    .replace(/(\.p|[-_\s](perp|perpetual|futures|swap))$/i, "");

  const explicit = cleaned.match(/^([A-Z0-9]{2,15})[\s:_/-]+([A-Z0-9.]{2,15})$/i);
  if (explicit) {
    const quote = normalizeQuoteAsset(explicit[2]);
    return {
      baseAsset: explicit[1].toUpperCase(),
      quoteAsset: quote?.asset || explicit[2].toUpperCase(),
      quoteAssetFamily: quote?.family || explicit[2].toUpperCase(),
      marketType: derivative ? "PERPETUAL" : "SPOT",
      spotOrDerivative: derivative ? "DERIVATIVE" : "SPOT",
    };
  }

  const upper = cleaned.toUpperCase();
  const quoteCandidates = Object.keys(QUOTE_ASSET_REGISTRY).sort((a, b) => b.length - a.length);
  const quote = quoteCandidates.find((asset) => upper.endsWith(asset) && upper.length > asset.length + 1);
  if (!quote) return null;
  const normalizedQuote = normalizeQuoteAsset(quote);
  return {
    baseAsset: upper.slice(0, -quote.length),
    quoteAsset: normalizedQuote?.asset || quote,
    quoteAssetFamily: normalizedQuote?.family || quote,
    marketType: derivative ? "PERPETUAL" : "SPOT",
    spotOrDerivative: derivative ? "DERIVATIVE" : "SPOT",
  };
}

export function semanticAliasTermsForField(canonicalField = "") {
  return TYPO_ALIAS_MAP[canonicalField] || [];
}

export function fuzzyAliasMatch(sourceName = "", canonicalField = "") {
  if (PROTECTED_FUZZY_FIELDS.has(canonicalField)) {
    return { matched: false, reason: "identity-critical-fuzzy-disabled" };
  }
  const terms = semanticAliasTermsForField(canonicalField);
  const source = compactAliasText(sourceName);
  if (!source || !terms.length) return { matched: false, reason: "no-fuzzy-terms" };
  for (const term of terms) {
    const target = compactAliasText(term);
    if (source === target) return { matched: true, confidenceType: "SEMANTIC_ALIAS", matchedTerm: term };
    const distance = levenshtein(source, target);
    const maxDistance = target.length <= 5 ? 1 : 2;
    if (distance > 0 && distance <= maxDistance) {
      return { matched: true, confidenceType: "FUZZY_ALIAS", matchedTerm: term, distance };
    }
  }
  return { matched: false, reason: "no-safe-fuzzy-match" };
}

export function detectResearchPhraseTags(text = "") {
  const normalized = normalizeAliasText(text);
  if (!normalized) return [];
  return Object.entries(RESEARCH_PHRASE_TAGS)
    .filter(([, phrases]) => phrases.some((phrase) => normalized.includes(normalizeAliasText(phrase))))
    .map(([tag]) => tag);
}

export function normalizeConfidenceStatus(value = "") {
  const normalized = normalizeAliasText(value);
  if (!normalized) return "INSUFFICIENT_CONFIDENCE";
  for (const [status, aliases] of Object.entries(CONFIDENCE_STATUS_ALIASES)) {
    if (aliases.some((alias) => normalized === normalizeAliasText(alias) || normalized.includes(normalizeAliasText(alias)))) {
      return status;
    }
  }
  return null;
}

export function aliasConfidenceValue(type = "INFERRED_ALIAS", providerAuthority = 50) {
  const base = ALIAS_CONFIDENCE[type] ?? ALIAS_CONFIDENCE.INFERRED_ALIAS;
  return Math.round(Math.max(0, Math.min(100, base * 0.72 + Number(providerAuthority || 50) * 0.28)));
}
