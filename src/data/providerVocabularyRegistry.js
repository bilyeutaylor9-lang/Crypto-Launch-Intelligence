export const PROVIDER_VOCABULARY = Object.freeze({
  dexscreener: {
    aliases: [
      "dexscreener",
      "dex screener",
      "dex-screener",
      "dex_screener",
      "dexscreener.com",
      "dexscreener-search",
      "dexscreener-profiles",
      "dexscreener-boosts",
      "ds",
      "dexscreen",
      "pair screener",
    ],
    authority: 82,
    family: "dex-market",
    free: true,
  },
  geckoterminal: {
    aliases: ["geckoterminal", "gecko terminal", "gecko-terminal", "gecko_terminal", "gt", "coingecko terminal", "terminal.geckoterminal"],
    authority: 82,
    family: "dex-market",
    free: true,
  },
  coingecko: {
    aliases: ["coingecko", "coin gecko", "coin-gecko", "coin_gecko", "cg", "coingecko.com", "coingecko api"],
    authority: 74,
    family: "aggregate-market",
    free: true,
  },
  coinmarketcap: {
    aliases: ["coinmarketcap", "coin market cap", "coin-market-cap", "coin_market_cap", "cmc", "coinmarketcap.com", "cmc api"],
    authority: 72,
    family: "aggregate-market",
    free: true,
  },
  coinpaprika: {
    aliases: ["coinpaprika", "coin paprika", "coin-paprika", "coin_paprika", "paprika"],
    authority: 72,
    family: "aggregate-market",
    free: true,
  },
  coinlore: {
    aliases: ["coinlore", "coin lore", "coin-lore", "coin_lore"],
    authority: 65,
    family: "aggregate-market",
    free: true,
  },
  defillama: {
    aliases: ["defillama", "defi llama", "defi-llama", "defi_llama", "llama", "dl", "defillama api"],
    authority: 70,
    family: "protocol-tvl",
    free: true,
  },
  github: {
    aliases: ["github", "github-project-discovery", "github.com", "git hub", "source repository", "code repository", "official repository"],
    authority: 58,
    family: "development",
    free: true,
  },
  googleNews: {
    aliases: ["google-news", "google news", "google-news-discovery"],
    authority: 46,
    family: "news",
    free: true,
  },
  nativeRpc: {
    aliases: ["native rpc", "chain rpc", "rpc", "native-discovery-mesh"],
    authority: 86,
    family: "chain-rpc",
    free: true,
  },
  blockscout: {
    aliases: ["blockscout", "block scout", "block-scanner", "block explorer", "blockscout api"],
    authority: 78,
    family: "explorer",
    free: true,
  },
  goplus: {
    aliases: ["goplus", "go plus", "goplus labs", "goplus security", "go_plus", "gopluslabs"],
    authority: 80,
    family: "security",
    free: true,
  },
  rugcheck: {
    aliases: ["rugcheck", "rug check", "rug-check", "rug_check", "rugcheck.xyz"],
    authority: 78,
    family: "security",
    free: true,
  },
  birdeye: {
    aliases: ["birdeye", "bird eye", "bird-eye", "bird_eye", "birdeye api"],
    authority: 82,
    family: "dex-market",
    free: false,
  },
  sourcify: {
    aliases: ["sourcify", "sourcify.dev", "source verification registry", "verified source registry"],
    authority: 82,
    family: "security",
    free: true,
  },
  etherscan: {
    aliases: ["etherscan", "ethscan", "ethereum explorer", "ethereum block explorer"],
    authority: 84,
    family: "explorer",
    free: true,
  },
  bscscan: {
    aliases: ["bscscan", "bsc scan", "bnb explorer", "binance smart chain explorer"],
    authority: 82,
    family: "explorer",
    free: true,
  },
  solscan: {
    aliases: ["solscan", "sol scan", "solana explorer"],
    authority: 80,
    family: "explorer",
    free: true,
  },
});

function norm(value = "") {
  return String(value ?? "").trim().toLowerCase().replace(/[_\s]+/g, "-");
}

export function canonicalProviderId(value = "unknown") {
  const key = norm(value);
  if (!key) return "unknown";
  for (const [id, provider] of Object.entries(PROVIDER_VOCABULARY)) {
    if (id.toLowerCase() === key || provider.aliases.some((alias) => norm(alias) === key)) return id;
  }
  return key;
}

export function providerProfile(value = "unknown") {
  const id = canonicalProviderId(value);
  return PROVIDER_VOCABULARY[id] || {
    aliases: [String(value || "unknown")],
    authority: 45,
    family: "unknown",
    free: true,
  };
}
