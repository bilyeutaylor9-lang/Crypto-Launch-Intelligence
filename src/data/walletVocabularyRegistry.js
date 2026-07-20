export const WALLET_REGISTRY = Object.freeze({
  metamask: { aliases: ["metamask", "meta mask"], families: ["evm"] },
  rabby: { aliases: ["rabby"], families: ["evm"] },
  coinbase_wallet: { aliases: ["coinbase wallet"], families: ["evm", "solana"] },
  phantom: { aliases: ["phantom"], families: ["solana", "ethereum", "sui"] },
  solflare: { aliases: ["solflare"], families: ["solana"] },
  backpack: { aliases: ["backpack"], families: ["solana", "ethereum"] },
  trust_wallet: { aliases: ["trust wallet", "trustwallet"], families: ["evm", "solana", "ton"] },
  keplr: { aliases: ["keplr"], families: ["cosmos"] },
  leap: { aliases: ["leap"], families: ["cosmos"] },
  sui_wallet: { aliases: ["sui wallet"], families: ["sui"] },
  slush: { aliases: ["slush"], families: ["sui"] },
  tonkeeper: { aliases: ["tonkeeper"], families: ["ton"] },
});

function norm(value = "") {
  return String(value ?? "").trim().toLowerCase().replace(/[_\s]+/g, "-");
}

export function normalizeWallet(value = "") {
  const key = norm(value);
  if (!key) return null;
  for (const [wallet, profile] of Object.entries(WALLET_REGISTRY)) {
    if (norm(wallet) === key || profile.aliases.some((alias) => norm(alias) === key)) return wallet;
  }
  return key;
}

export function walletFamilies(value = "") {
  const wallet = normalizeWallet(value);
  return WALLET_REGISTRY[wallet]?.families || [];
}
