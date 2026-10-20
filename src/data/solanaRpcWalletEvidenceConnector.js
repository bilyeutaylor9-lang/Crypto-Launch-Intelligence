import { normalizeChainId, normalizeTokenAddress, normalizeWalletAddress } from "../identity/strictIdentityValidators.js";
import { jsonRpc } from "../sensors/rpcJsonClient.js";
import { resolveNativeRpcUrl } from "./native/nativePoolConfig.js";
import { walletRpcEndpointId } from "./rpcWalletEvidenceConnector.js";

const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const PROGRAMS = new Set(["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"]);
const SYSTEM = "11111111111111111111111111111111";
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const DAY_SECONDS = 86400;

function exactIdentity(project) {
  const chains = [project.chain, project.canonicalChain, project.network].filter((value) => value !== undefined && value !== null && value !== "");
  const tokens = [project.tokenAddress, project.contractAddress, project.address].filter((value) => value !== undefined && value !== null && value !== "");
  const pools = [project.poolAddress, project.pairAddress].filter((value) => value !== undefined && value !== null && value !== "");
  if (!chains.length || chains.some((value) => normalizeChainId(value) !== "solana")) return null;
  const tokenAddress = normalizeTokenAddress(tokens[0], "solana");
  const poolAddress = normalizeTokenAddress(pools[0], "solana");
  if (!tokenAddress || !poolAddress || poolAddress === tokenAddress || poolAddress === SYSTEM || PROGRAMS.has(poolAddress) ||
      tokens.some((value) => normalizeTokenAddress(value, "solana") !== tokenAddress) ||
      pools.some((value) => normalizeTokenAddress(value, "solana") !== poolAddress)) return null;
  return { chain: "solana", tokenAddress, poolAddress };
}

function rawAmount(value) {
  if (typeof value !== "string" || !/^\d{1,20}$/.test(value)) return null;
  const amount = BigInt(value);
  return amount <= 2n ** 64n - 1n ? amount : null;
}

function targetBalances(rows, keys, mint) {
  if (!Array.isArray(rows)) return null;
  const allIndices = new Set();
  const balances = new Map();
  for (const row of rows) {
    if (!Number.isSafeInteger(row?.accountIndex) || row.accountIndex < 0 || row.accountIndex >= keys.length || allIndices.has(row.accountIndex)) return null;
    allIndices.add(row.accountIndex);
    if (row.mint !== mint) continue;
    const owner = normalizeWalletAddress(row.owner, "solana");
    const amount = rawAmount(row.uiTokenAmount?.amount);
    const decimals = row.uiTokenAmount?.decimals;
    if (!owner || !PROGRAMS.has(row.programId) || amount === null || !Number.isSafeInteger(decimals) || decimals < 0 || decimals > 255) return null;
    balances.set(row.accountIndex, { owner, amount, decimals, programId: row.programId });
  }
  return balances;
}

export function normalizeSolanaWalletTransaction(transaction, signatureInfo, project, context = {}) {
  const identity = exactIdentity(project);
  const headSlot = context.headSlot;
  const headTimestamp = context.headTimestamp;
  if (!identity || !transaction || !SIGNATURE.test(signatureInfo?.signature || "") || signatureInfo.err !== null ||
      !["confirmed", "finalized"].includes(signatureInfo.confirmationStatus) ||
      !Number.isSafeInteger(headSlot) || headSlot <= 0 || !Number.isSafeInteger(headTimestamp) || headTimestamp <= 0 ||
      !["legacy", 0, 1].includes(transaction.version) || transaction.meta?.err !== null ||
      !Number.isSafeInteger(transaction.slot) || transaction.slot <= 0 || transaction.slot !== signatureInfo.slot || transaction.slot > headSlot ||
      !Number.isSafeInteger(transaction.blockTime) || transaction.blockTime <= 0 || transaction.blockTime !== signatureInfo.blockTime ||
      transaction.blockTime > headTimestamp || headTimestamp - transaction.blockTime > DAY_SECONDS ||
      transaction.transaction?.signatures?.[0] !== signatureInfo.signature) return [];
  const message = transaction.transaction?.message;
  if (!Array.isArray(message?.accountKeys) || !message.accountKeys.length ||
      (transaction.version === 1 && (!message.transactionConfig || typeof message.transactionConfig !== "object" || Array.isArray(message.transactionConfig)))) return [];
  const keys = message.accountKeys.map((key) => normalizeWalletAddress(typeof key === "string" ? key : key?.pubkey, "solana"));
  if (keys.some((key) => !key) || new Set(keys).size !== keys.length || !keys.includes(identity.poolAddress)) return [];
  const before = targetBalances(transaction.meta.preTokenBalances, keys, identity.tokenAddress);
  const after = targetBalances(transaction.meta.postTokenBalances, keys, identity.tokenAddress);
  if (!before || !after) return [];
  const changes = [];
  for (const [accountIndex, pre] of before) {
    const post = after.get(accountIndex);
    // Missing balances are not assumed zero, and ownership changes are ambiguous.
    if (!post || pre.owner !== post.owner || pre.decimals !== post.decimals || pre.programId !== post.programId || pre.amount === post.amount) continue;
    changes.push({ accountIndex, ...pre, afterAmount: post.amount, delta: post.amount - pre.amount });
  }
  if (!changes.some((row) => row.owner === identity.poolAddress)) return [];
  const excluded = new Set([identity.tokenAddress, identity.poolAddress, SYSTEM, ...PROGRAMS]);
  return changes.filter((row) => !excluded.has(row.owner) && row.owner !== keys[row.accountIndex]).map((row) => ({
    signature: signatureInfo.signature, transactionHash: signatureInfo.signature, slot: transaction.slot,
    timestamp: new Date(transaction.blockTime * 1000).toISOString(),
    tokenAddress: identity.tokenAddress, poolAddress: identity.poolAddress,
    accountAddress: keys[row.accountIndex], ownerAddress: row.owner,
    tokenAmountBeforeRaw: row.amount.toString(), tokenAmountAfterRaw: row.afterAmount.toString(),
    tokenDeltaRaw: row.delta.toString(), decimals: row.decimals, tokenProgram: row.programId,
    direction: "BALANCE_CHANGE", role: "TOKEN_ACCOUNT_OWNER_AT_TRANSACTION",
    tradeClassification: "UNKNOWN", smartWallet: null, currentHoldingVerified: false,
  }));
}

async function fromEndpoint(project, identity, url, options) {
  const rpc = options.jsonRpc || jsonRpc;
  const rpcOptions = { timeoutMs: options.timeoutMs || 5000, retries: 0 };
  const unknown = (reason, providerFailure = false, providerFailureCode = null) => ({ provider: "solana-rpc-wallets",
    status: "UNKNOWN", ...identity, exactTokenIdentity: false, observedAt: new Date().toISOString(),
    providerFailure, providerFailureCode, wallets: [], walletTransactions: [], walletParticipationHistory: [], warnings: [reason] });
  const now = new Date(typeof options.now === "function" ? options.now() : options.now ?? Date.now()).getTime();
  const configuredLimit = Number(options.solanaWalletSignatureLimit ?? 4);
  const maxHeadAge = Number(options.walletRpcMaxHeadAgeSeconds ?? 300);
  if (!Number.isFinite(now) || !Number.isSafeInteger(configuredLimit) || configuredLimit < 1 ||
      !Number.isSafeInteger(maxHeadAge) || maxHeadAge < 1) return unknown("Invalid Solana observation clock or bounded query configuration.");
  try {
    if (await rpc(url, "getGenesisHash", [], rpcOptions) !== MAINNET_GENESIS) return unknown("Solana mainnet genesis mismatch.");
    const headSlot = await rpc(url, "getSlot", [{ commitment: "confirmed" }], rpcOptions);
    if (!Number.isSafeInteger(headSlot) || headSlot <= 0) return unknown("Missing exact confirmed head slot.");
    const headTimestamp = await rpc(url, "getBlockTime", [headSlot], rpcOptions);
    if (!Number.isSafeInteger(headTimestamp) || headTimestamp <= 0 || headTimestamp > Math.floor(now / 1000)) return unknown("Invalid confirmed head timestamp.");
    if (now / 1000 - headTimestamp > maxHeadAge) return unknown("Solana RPC head is stale.", true, "STALE_RPC_HEAD");
    const limit = Math.min(6, configuredLimit);
    const signatures = await rpc(url, "getSignaturesForAddress", [identity.poolAddress,
      { commitment: "confirmed", minContextSlot: headSlot, limit }], rpcOptions);
    if (!Array.isArray(signatures) || signatures.length > limit) return unknown("Missing or oversized bounded signature response.");
    const rows = [];
    const seen = new Set();
    const warnings = [];
    let lastError = null;
    for (const info of signatures) {
      if (!SIGNATURE.test(info?.signature || "") || seen.has(info.signature) || info.err !== null ||
          !["confirmed", "finalized"].includes(info.confirmationStatus) ||
          !Number.isSafeInteger(info.slot) || info.slot <= 0 || info.slot > headSlot ||
          !Number.isSafeInteger(info.blockTime) || info.blockTime <= 0 || info.blockTime > headTimestamp ||
          headTimestamp - info.blockTime > DAY_SECONDS) continue;
      seen.add(info.signature);
      try {
        const transaction = await rpc(url, "getTransaction", [info.signature,
          { commitment: "confirmed", encoding: "jsonParsed", maxSupportedTransactionVersion: 1 }], rpcOptions);
        rows.push(...normalizeSolanaWalletTransaction(transaction, info, project, { headSlot, headTimestamp }));
      } catch (error) {
        lastError = error;
        warnings.push(`A bounded transaction read failed: ${error.code || "RPC_ERROR"}.`);
        if (["REQUEST_BUDGET_EXHAUSTED", "TIME_BUDGET_EXHAUSTED", "CIRCUIT_OPEN", "RATE_LIMITED"].includes(error.code)) break;
      }
    }
    const wallets = [...new Set(rows.map((row) => row.ownerAddress))];
    const evidence = { provider: "solana-rpc-wallets", status: wallets.length ? "EVIDENCE_AVAILABLE" : "UNKNOWN",
      ...identity, exactTokenIdentity: true, exactPoolIdentity: true, genesisHash: MAINNET_GENESIS,
      observedAt: new Date().toISOString(), sourceTimestamp: new Date(headTimestamp * 1000).toISOString(),
      confidence: 0.85, verificationStatus: "VERIFIED_PROVIDER_OBSERVATION",
      wallets, walletTransactions: rows, walletParticipationHistory: rows,
      transferCoverage: { sampled: true, complete24h: false, observedSlot: headSlot,
        observedBlockTimestamp: headTimestamp, fromTimestamp: new Date((headTimestamp - DAY_SECONDS) * 1000).toISOString(),
        toTimestamp: new Date(headTimestamp * 1000).toISOString(),
        semantics: "CONFIRMED_OWNER_BALANCE_CHANGE_SAMPLE_NOT_TRADES_OR_CURRENT_HOLDINGS" },
      providerFailure: !wallets.length && Boolean(lastError), providerFailureCode: lastError?.code || null,
      warnings: [...warnings, "Exact pool/mint transaction-owner participation only; no current holders, daily buyer totals, swaps, smart labels, deployer roles or execution proof are inferred."] };
    return evidence;
  } catch (error) {
    return unknown(error.message || "Solana wallet RPC failed.", true, error.code || null);
  }
}

export async function getSolanaRpcWalletEvidence(project = {}, options = {}) {
  const identity = exactIdentity(project);
  if (!identity) return { provider: "solana-rpc-wallets", status: "UNKNOWN", providerFailure: false,
    warnings: ["Exact nonconflicting Solana mint and pool identity are required."] };
  const explicit = [options.solanaRpcUrl, options.rpcUrl, ...(Array.isArray(options.solanaRpcUrls) ? options.solanaRpcUrls : [])]
    .filter((url) => typeof url === "string" && url.trim()).map((url) => url.trim());
  const urls = [...new Set(explicit.length ? explicit : resolveNativeRpcUrl({ chain: "solana" }, options).rpcUrls)].slice(0, 2);
  if (!urls.length) return { provider: "solana-rpc-wallets", status: "UNKNOWN", ...identity, warnings: ["No configured Solana RPC."] };
  const attempts = [];
  let result;
  for (const url of urls) {
    result = await fromEndpoint(project, identity, url, options);
    attempts.push({ endpointId: walletRpcEndpointId(url), status: result.status, providerFailure: result.providerFailure === true });
    if (!result.providerFailure || ["REQUEST_BUDGET_EXHAUSTED", "TIME_BUDGET_EXHAUSTED", "CIRCUIT_OPEN", "RATE_LIMITED"].includes(result.providerFailureCode)) break;
  }
  return { ...result, rpcEndpointId: attempts.at(-1).endpointId, rpcEndpointAttempts: attempts };
}
