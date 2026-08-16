import { jsonRpcBatch } from "./rpcJsonClient.js";
import { chainProfileFor } from "./chainProfiles.js";
import { keccak256Hex } from "./keccak256.js";

const V3_SWAP_TOPIC = keccak256Hex("Swap(address,address,int256,int256,uint160,uint128,int24)").toLowerCase();
const V2_SWAP_TOPIC = keccak256Hex("Swap(address,uint256,uint256,uint256,uint256,address)").toLowerCase();

function lower(value = "") {
  return String(value || "").toLowerCase();
}

function validAddress(value = "") {
  return /^0x[0-9a-f]{40}$/i.test(String(value || ""));
}

function isEmptyCode(code = "") {
  return !code || code === "0x" || /^0x0*$/i.test(code);
}

function envRouterRegistry() {
  const raw = process.env.IGNITION_ROUTER_REGISTRY_JSON;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function routerRegistryFor(project = {}, options = {}) {
  const chain = lower(project.chain || project.canonicalChain || project.network || options.chain);
  const raw = options.routerRegistry || project.routerRegistry || envRouterRegistry();
  const fromRegistry = Array.isArray(raw?.[chain]) ? raw[chain] : Array.isArray(raw) ? raw : [];
  const explicit = [
    ...(Array.isArray(options.knownRouterAddresses) ? options.knownRouterAddresses : []),
    ...(Array.isArray(project.knownRouterAddresses) ? project.knownRouterAddresses : []),
    ...(Array.isArray(project.routerAddresses) ? project.routerAddresses : []),
    ...fromRegistry,
  ];
  return new Set(explicit.map(lower).filter(validAddress));
}

function routeSummary(receipt = {}, poolAddress = "") {
  const logs = Array.isArray(receipt?.logs) ? receipt.logs : [];
  const swapLogs = logs.filter((log) => {
    const topic = lower(log?.topics?.[0]);
    return topic === V3_SWAP_TOPIC || topic === V2_SWAP_TOPIC;
  });
  const pools = [...new Set(swapLogs.map((log) => lower(log.address)).filter(validAddress))];
  const targetPool = lower(poolAddress);
  return {
    swapLogCount: swapLogs.length,
    swapPoolCount: pools.length,
    swapPools: pools.slice(0, 24),
    targetPoolSeen: targetPool ? pools.includes(targetPool) : null,
    routeMode: pools.length > 1 ? "MULTI_POOL_ROUTE" : pools.length === 1 ? "SINGLE_POOL_ROUTE" : "NO_SWAP_ROUTE_OBSERVED",
  };
}

function walkTrace(node = {}, depth = 0, out = []) {
  if (!node || typeof node !== "object") return out;
  out.push({
    from: lower(node.from),
    to: lower(node.to),
    type: node.type || node.callType || null,
    depth,
  });
  for (const child of Array.isArray(node.calls) ? node.calls : []) walkTrace(child, depth + 1, out);
  return out;
}

function traceSummary(trace = null, poolAddress = "") {
  if (!trace || typeof trace !== "object") {
    return {
      status: "UNOBSERVED",
      callCount: null,
      maxDepth: null,
      poolCaller: null,
      poolCallDepth: null,
    };
  }
  const calls = walkTrace(trace);
  const pool = lower(poolAddress);
  const poolCall = calls.find((call) => call.to === pool) || null;
  return {
    status: "OBSERVED_CALL_TRACE",
    callCount: calls.length,
    maxDepth: calls.length ? Math.max(...calls.map((call) => call.depth)) : 0,
    poolCaller: poolCall?.from || null,
    poolCallDepth: poolCall?.depth ?? null,
  };
}

function resolveEventActor(event = {}, tx = {}, receipt = {}, code = {}, trace = null, project = {}, options = {}) {
  if (event.eventType !== "SWAP") return event;
  const initiator = lower(tx?.from);
  const entry = lower(tx?.to);
  const pool = lower(event.poolAddress || project.poolAddress || project.pairAddress);
  const sender = lower(event.sender);
  const recipient = lower(event.recipient);
  const poolActor = lower(event.actorAddress);
  const initiatorCode = code.initiatorCode;
  const entryCode = code.entryCode;
  const initiatorType = !validAddress(initiator)
    ? "UNKNOWN"
    : initiatorCode === null
      ? "UNKNOWN"
      : isEmptyCode(initiatorCode)
        ? "EOA_OR_UNDEPLOYED_AT_BLOCK"
        : "CONTRACT";
  const entryType = !validAddress(entry)
    ? "CONTRACT_CREATION_OR_UNKNOWN"
    : entryCode === null
      ? "UNKNOWN"
      : isEmptyCode(entryCode)
        ? "EOA_OR_UNDEPLOYED_AT_BLOCK"
        : "CONTRACT";
  const routers = routerRegistryFor(project, options);
  const route = routeSummary(receipt, pool);
  const traceInfo = traceSummary(trace, pool);
  const knownRouter = routers.has(entry) || routers.has(traceInfo.poolCaller);
  const contractEntrypoint = entryType === "CONTRACT" && entry !== pool;
  const routed = knownRouter || contractEntrypoint || route.swapPoolCount > 1 || (traceInfo.poolCaller && traceInfo.poolCaller !== initiator);

  let economicActorAddress = null;
  let actorResolutionMode = "UNRESOLVED";
  let actorConfidencePct = 0;

  if (validAddress(initiator)) {
    economicActorAddress = initiator;
    if (event.side === "BUY" && recipient === initiator) {
      actorResolutionMode = "INITIATOR_RECIPIENT_MATCH";
      actorConfidencePct = initiatorType === "CONTRACT" ? 65 : 96;
    } else if (event.side === "SELL" && sender === initiator) {
      actorResolutionMode = "INITIATOR_SENDER_MATCH";
      actorConfidencePct = initiatorType === "CONTRACT" ? 65 : 96;
    } else if (entry === pool && initiatorType !== "CONTRACT") {
      actorResolutionMode = "DIRECT_POOL_TRANSACTION_INITIATOR";
      actorConfidencePct = 92;
    } else if (initiatorType === "EOA_OR_UNDEPLOYED_AT_BLOCK") {
      actorResolutionMode = routed ? "EOA_TRANSACTION_INITIATOR_ROUTED" : "EOA_TRANSACTION_INITIATOR";
      actorConfidencePct = routed ? 82 : 76;
    } else if (initiatorType === "CONTRACT") {
      actorResolutionMode = "CONTRACT_TRANSACTION_INITIATOR_UNDERLYING_USER_UNKNOWN";
      actorConfidencePct = 45;
    } else {
      actorResolutionMode = "TRANSACTION_INITIATOR_TYPE_UNKNOWN";
      actorConfidencePct = 58;
    }
  }

  return {
    ...event,
    transactionInitiator: validAddress(initiator) ? initiator : null,
    transactionEntryAddress: validAddress(entry) ? entry : null,
    transactionInitiatorType: initiatorType,
    transactionEntryType: entryType,
    economicActorAddress,
    economicActorRole: event.side === "BUY" ? "BUY_INITIATOR" : event.side === "SELL" ? "SELL_INITIATOR" : "UNKNOWN",
    actorAddress: economicActorAddress || event.actorAddress || null,
    actorConfidencePct: economicActorAddress ? actorConfidencePct : event.actorConfidencePct ?? 0,
    actorResolutionMode,
    participantIdentityMode: economicActorAddress ? actorResolutionMode : event.participantIdentityMode || "UNRESOLVED",
    routerAdjusted: Boolean(economicActorAddress && poolActor && economicActorAddress !== poolActor && routed),
    routeMode: route.routeMode,
    routeHopCountObserved: route.swapPoolCount,
    routeSwapLogCountObserved: route.swapLogCount,
    routePoolsObserved: route.swapPools,
    knownRouterObserved: knownRouter,
    traceStatus: traceInfo.status,
    tracePoolCaller: traceInfo.poolCaller,
    tracePoolCallDepth: traceInfo.poolCallDepth,
    traceCallCount: traceInfo.callCount,
    beneficialOwnerResolved: false,
    participantResolutionCaveat:
      initiatorType === "CONTRACT"
        ? "Transaction initiator is a contract; the underlying user is unresolved."
        : "Economic actor means transaction initiator, not verified beneficial owner.",
  };
}

async function fetchBatch(rpcUrl, hashes = [], options = {}) {
  const txRows = await jsonRpcBatch(rpcUrl, hashes.map((hash) => ({ method: "eth_getTransactionByHash", params: [hash] })), options);
  const receiptRows = await jsonRpcBatch(rpcUrl, hashes.map((hash) => ({ method: "eth_getTransactionReceipt", params: [hash] })), options);
  return hashes.map((hash, index) => ({
    hash,
    tx: txRows[index]?.result || null,
    txError: txRows[index]?.error || null,
    receipt: receiptRows[index]?.result || null,
    receiptError: receiptRows[index]?.error || null,
  }));
}

async function fetchCodeBatch(rpcUrl, rows = [], options = {}) {
  const calls = [];
  const lookup = [];
  for (const row of rows) {
    const blockTag = row.tx?.blockNumber || "latest";
    for (const [kind, address] of [["initiator", row.tx?.from], ["entry", row.tx?.to]]) {
      if (!validAddress(address)) continue;
      calls.push({ method: "eth_getCode", params: [address, blockTag] });
      lookup.push({ hash: row.hash, kind });
    }
  }
  if (!calls.length) return new Map();
  const responses = await jsonRpcBatch(rpcUrl, calls, options);
  const out = new Map();
  responses.forEach((response, index) => {
    const { hash, kind } = lookup[index];
    const previous = out.get(hash) || { initiatorCode: null, entryCode: null };
    previous[`${kind}Code`] = response?.error ? null : response?.result ?? null;
    out.set(hash, previous);
  });
  return out;
}

async function fetchTraceBatch(rpcUrl, hashes = [], options = {}) {
  const enabled = typeof options.enableTrace === "boolean"
    ? options.enableTrace
    : String(process.env.IGNITION_TX_TRACE_ENABLED || "").toLowerCase() === "true";
  if (!enabled || !hashes.length) return new Map();
  const maxTraceTx = Math.max(1, Math.min(24, Number(options.maxTraceTransactions || process.env.IGNITION_TX_TRACE_MAX || 12)));
  const selected = hashes.slice(-maxTraceTx);
  const responses = await jsonRpcBatch(rpcUrl, selected.map((hash) => ({
    method: "debug_traceTransaction",
    params: [hash, { tracer: "callTracer", timeout: `${Math.max(1, Math.ceil(Number(options.traceTimeoutMs || 4_000) / 1000))}s` }],
  })), { ...options, timeoutMs: options.traceTimeoutMs || 6_000, retries: 0 });
  return new Map(selected.map((hash, index) => [hash, responses[index]?.error ? null : responses[index]?.result || null]));
}

export async function resolveEvmTransactionActors(project = {}, events = [], options = {}) {
  const chain = project.chain || project.canonicalChain || project.network || options.chain;
  const profile = options.chainProfile || chainProfileFor(chain);
  const rpcUrl = options.rpcUrl || profile?.rpcUrl;
  const swaps = (Array.isArray(events) ? events : []).filter((event) => event.eventType === "SWAP" && event.txHash);
  if (!rpcUrl) {
    return {
      status: "UNSUPPORTED_CHAIN",
      events,
      resolvedSwaps: 0,
      swapEvents: swaps.length,
      coveragePct: 0,
      shadowOnly: true,
      rankingInfluence: false,
    };
  }
  if (!swaps.length) {
    return {
      status: "NO_SWAP_EVENTS",
      events,
      resolvedSwaps: 0,
      swapEvents: 0,
      coveragePct: 0,
      shadowOnly: true,
      rankingInfluence: false,
    };
  }

  const maxTransactions = Math.max(1, Math.min(250, Number(options.maxTransactions || process.env.IGNITION_ACTOR_MAX_TRANSACTIONS || 96)));
  const hashes = [...new Set(swaps.map((event) => lower(event.txHash)).filter(Boolean))].slice(-maxTransactions);
  const rpcOptions = { timeoutMs: options.timeoutMs || 10_000, retries: options.retries ?? 1, headers: options.headers };

  try {
    const rows = await fetchBatch(rpcUrl, hashes, rpcOptions);
    const codeByHash = await fetchCodeBatch(rpcUrl, rows, rpcOptions);
    let traceByHash = new Map();
    try {
      traceByHash = await fetchTraceBatch(rpcUrl, hashes, { ...rpcOptions, ...options });
    } catch {
      traceByHash = new Map();
    }
    const rowByHash = new Map(rows.map((row) => [lower(row.hash), row]));
    const enriched = (Array.isArray(events) ? events : []).map((event) => {
      if (event.eventType !== "SWAP" || !event.txHash) return event;
      const hash = lower(event.txHash);
      const row = rowByHash.get(hash) || {};
      return resolveEventActor(
        event,
        row.tx || {},
        row.receipt || {},
        codeByHash.get(hash) || { initiatorCode: null, entryCode: null },
        traceByHash.get(hash) || null,
        project,
        options
      );
    });
    const resolved = enriched.filter((event) => event.eventType === "SWAP" && event.economicActorAddress);
    const routed = resolved.filter((event) => event.routerAdjusted);
    const traced = enriched.filter((event) => event.eventType === "SWAP" && event.traceStatus === "OBSERVED_CALL_TRACE");
    const contractInitiators = resolved.filter((event) => event.transactionInitiatorType === "CONTRACT");
    return {
      status: resolved.length ? "ACTORS_RESOLVED_TO_TRANSACTION_INITIATORS" : "ACTOR_RESOLUTION_UNOBSERVED",
      source: "EVM_TRANSACTION_ENVELOPE_AND_OPTIONAL_TRACE",
      observedAt: new Date().toISOString(),
      events: enriched,
      swapEvents: swaps.length,
      transactionsInspected: hashes.length,
      resolvedSwaps: resolved.length,
      routerAdjustedSwaps: routed.length,
      tracedSwaps: traced.length,
      contractInitiatorSwaps: contractInitiators.length,
      coveragePct: swaps.length ? Math.round((resolved.length / swaps.length) * 100) : 0,
      traceCoveragePct: swaps.length ? Math.round((traced.length / swaps.length) * 100) : 0,
      policy: "Resolution identifies the transaction initiator and route structure. It never claims the initiator is the beneficial owner, and contract initiators remain underlying-user unknown.",
      shadowOnly: true,
      rankingInfluence: false,
    };
  } catch (error) {
    return {
      status: "ACTOR_RESOLUTION_FAILED",
      source: "EVM_TRANSACTION_ENVELOPE_AND_OPTIONAL_TRACE",
      error: error.message,
      events,
      swapEvents: swaps.length,
      resolvedSwaps: 0,
      coveragePct: 0,
      shadowOnly: true,
      rankingInfluence: false,
    };
  }
}

export const __evmTransactionActorResolverTestHooks = {
  routeSummary,
  traceSummary,
  resolveEventActor,
  routerRegistryFor,
  isEmptyCode,
};

export default resolveEvmTransactionActors;
