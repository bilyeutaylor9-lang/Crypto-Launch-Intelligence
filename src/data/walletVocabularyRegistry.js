export const WALLET_REGISTRY = Object.freeze({
  metamask: { aliases: ["metamask", "meta mask", "metamask wallet", "mm", "ethereum browser wallet", "evm browser wallet"], families: ["evm"] },
  rabby: { aliases: ["rabby", "rabby wallet", "debank rabby"], families: ["evm"] },
  coinbase_wallet: { aliases: ["coinbase wallet", "coinbase web3 wallet", "cb wallet", "coinbase self-custody wallet"], families: ["evm", "solana"] },
  phantom: { aliases: ["phantom", "phantom wallet", "phantom app"], families: ["solana", "ethereum", "sui"] },
  solflare: { aliases: ["solflare", "solflare wallet"], families: ["solana"] },
  backpack: { aliases: ["backpack", "backpack wallet", "xnft backpack"], families: ["solana", "ethereum"] },
  trust_wallet: { aliases: ["trust wallet", "trustwallet", "tw"], families: ["evm", "solana", "ton"] },
  keplr: { aliases: ["keplr", "keplr wallet", "cosmos keplr"], families: ["cosmos"] },
  leap: { aliases: ["leap", "leap wallet", "cosmos leap"], families: ["cosmos"] },
  sui_wallet: { aliases: ["sui wallet"], families: ["sui"] },
  slush: { aliases: ["slush", "slush wallet", "former sui wallet"], families: ["sui"] },
  tonkeeper: { aliases: ["tonkeeper", "ton keeper", "tonkeeper wallet"], families: ["ton"] },
  okx_wallet: { aliases: ["okx wallet", "okx web3 wallet", "okex wallet"], families: ["evm", "solana", "sui"] },
  safe: { aliases: ["safe", "safe wallet", "gnosis safe", "safe multisig"], families: ["evm"] },
  ledger: { aliases: ["ledger", "ledger live", "ledger hardware wallet"], families: ["evm", "solana", "cosmos", "sui", "ton"] },
  trezor: { aliases: ["trezor", "trezor suite", "trezor hardware wallet"], families: ["evm"] },
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
