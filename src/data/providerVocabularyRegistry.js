export const PROVIDER_VOCABULARY = Object.freeze({
  dexscreener: {
    aliases: ["dexscreener", "dex screener", "dexscreener-search", "dexscreener-profiles", "dexscreener-boosts"],
    authority: 82,
    family: "dex-market",
    free: true,
  },
  geckoterminal: {
    aliases: ["geckoterminal", "gecko terminal"],
    authority: 82,
    family: "dex-market",
    free: true,
  },
  coingecko: {
    aliases: ["coingecko", "coin gecko", "cg"],
    authority: 74,
    family: "aggregate-market",
    free: true,
  },
  coinpaprika: {
    aliases: ["coinpaprika", "coin paprika"],
    authority: 72,
    family: "aggregate-market",
    free: true,
  },
  coinlore: {
    aliases: ["coinlore", "coin lore"],
    authority: 65,
    family: "aggregate-market",
    free: true,
  },
  defillama: {
    aliases: ["defillama", "defi llama"],
    authority: 70,
    family: "protocol-tvl",
    free: true,
  },
  github: {
    aliases: ["github", "github-project-discovery", "git hub"],
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
    aliases: ["blockscout", "block scout"],
    authority: 78,
    family: "explorer",
    free: true,
  },
  goplus: {
    aliases: ["goplus", "go plus"],
    authority: 80,
    family: "security",
    free: true,
  },
  rugcheck: {
    aliases: ["rugcheck", "rug check"],
    authority: 78,
    family: "security",
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
