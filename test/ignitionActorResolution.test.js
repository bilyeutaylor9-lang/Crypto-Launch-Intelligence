import test from "node:test";
import assert from "node:assert/strict";

import { resolveEvmTransactionActors, __evmTransactionActorResolverTestHooks } from "../src/sensors/evmTransactionActorResolver.js";
import { analyzeEconomicParticipantFlow, __economicParticipantFlowTestHooks } from "../src/engines/economicParticipantFlowEngine.js";
import { analyzeMarketPressure } from "../src/engines/marketPressureEngine.js";
import { keccak256Hex } from "../src/sensors/keccak256.js";

const USER = "0x1111111111111111111111111111111111111111";
const USER2 = "0x2222222222222222222222222222222222222222";
const USER3 = "0x3333333333333333333333333333333333333333";
const ROUTER = "0x4444444444444444444444444444444444444444";
const POOL = "0x5555555555555555555555555555555555555555";
const POOL2 = "0x6666666666666666666666666666666666666666";
const V3_SWAP = keccak256Hex("Swap(address,address,int256,int256,uint160,uint128,int24)");

function event(overrides = {}) {
  return {
    eventKey: overrides.eventKey || `${overrides.txHash || "0xabc"}:${overrides.logIndex ?? 0}`,
    eventType: "SWAP",
    side: "BUY",
    sender: ROUTER,
    recipient: ROUTER,
    actorAddress: ROUTER,
    actorConfidencePct: 35,
    poolAddress: POOL,
    txHash: overrides.txHash || "0x" + "a".repeat(64),
    logIndex: overrides.logIndex ?? 0,
    eventTime: overrides.eventTime || "2026-08-13T12:00:00.000Z",
    usdNotional: overrides.usdNotional ?? 100,
    executionPriceUsd: overrides.executionPriceUsd ?? 1,
    ...overrides,
  };
}

function receipt(poolAddresses = [POOL]) {
  return {
    logs: poolAddresses.map((address, index) => ({
      address,
      topics: [V3_SWAP],
      logIndex: `0x${index.toString(16)}`,
    })),
  };
}

test("direct pool buy resolves the transaction initiator without claiming beneficial ownership", () => {
  const e = event({ recipient: USER, actorAddress: USER });
  const resolved = __evmTransactionActorResolverTestHooks.resolveEventActor(
    e,
    { from: USER, to: POOL, blockNumber: "0x10" },
    receipt([POOL]),
    { initiatorCode: "0x", entryCode: "0x1234" },
    null,
    { chain: "base", poolAddress: POOL },
    {}
  );
  assert.equal(resolved.economicActorAddress, USER);
  assert.equal(resolved.actorResolutionMode, "INITIATOR_RECIPIENT_MATCH");
  assert.equal(resolved.actorConfidencePct, 96);
  assert.equal(resolved.beneficialOwnerResolved, false);
});

test("routed EOA transaction replaces the pool router actor with the transaction initiator", () => {
  const resolved = __evmTransactionActorResolverTestHooks.resolveEventActor(
    event(),
    { from: USER, to: ROUTER, blockNumber: "0x10" },
    receipt([POOL]),
    { initiatorCode: "0x", entryCode: "0x1234" },
    null,
    { chain: "base", poolAddress: POOL },
    {}
  );
  assert.equal(resolved.economicActorAddress, USER);
  assert.equal(resolved.routerAdjusted, true);
  assert.equal(resolved.actorResolutionMode, "EOA_TRANSACTION_INITIATOR_ROUTED");
  assert.equal(resolved.beneficialOwnerResolved, false);
});

test("contract transaction initiators remain underlying-user unknown", () => {
  const resolved = __evmTransactionActorResolverTestHooks.resolveEventActor(
    event(),
    { from: USER, to: ROUTER, blockNumber: "0x10" },
    receipt([POOL]),
    { initiatorCode: "0x60016001", entryCode: "0x6002" },
    null,
    { chain: "base", poolAddress: POOL },
    {}
  );
  assert.equal(resolved.transactionInitiatorType, "CONTRACT");
  assert.equal(resolved.actorResolutionMode, "CONTRACT_TRANSACTION_INITIATOR_UNDERLYING_USER_UNKNOWN");
  assert.equal(resolved.actorConfidencePct, 45);
  assert.match(resolved.participantResolutionCaveat, /underlying user is unresolved/i);
});

test("receipt route summary detects multi-pool routes", () => {
  const route = __evmTransactionActorResolverTestHooks.routeSummary(receipt([POOL, POOL2]), POOL);
  assert.equal(route.routeMode, "MULTI_POOL_ROUTE");
  assert.equal(route.swapPoolCount, 2);
  assert.equal(route.targetPoolSeen, true);
});

test("optional call trace identifies the immediate caller into the target pool", () => {
  const trace = {
    from: USER,
    to: ROUTER,
    calls: [{ from: ROUTER, to: POOL, calls: [] }],
  };
  const summary = __evmTransactionActorResolverTestHooks.traceSummary(trace, POOL);
  assert.equal(summary.status, "OBSERVED_CALL_TRACE");
  assert.equal(summary.poolCaller, ROUTER);
  assert.equal(summary.poolCallDepth, 1);
});

test("live actor resolver uses batched tx, receipt, and point-in-time code calls", async () => {
  const previousFetch = global.fetch;
  const hash = "0x" + "b".repeat(64);
  const swap = event({ txHash: hash });
  let batchNumber = 0;
  global.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.ok(Array.isArray(body));
    batchNumber += 1;
    let rows;
    if (batchNumber === 1) {
      rows = body.map((req) => ({ jsonrpc: "2.0", id: req.id, result: { hash, from: USER, to: ROUTER, blockNumber: "0x20" } }));
    } else if (batchNumber === 2) {
      rows = body.map((req) => ({ jsonrpc: "2.0", id: req.id, result: receipt([POOL, POOL2]) }));
    } else {
      rows = body.map((req, index) => ({ jsonrpc: "2.0", id: req.id, result: index % 2 === 0 ? "0x" : "0x60016001" }));
    }
    return new Response(JSON.stringify(rows), { status: 200 });
  };
  try {
    const result = await resolveEvmTransactionActors(
      { chain: "base", poolAddress: POOL },
      [swap],
      { rpcUrl: "https://example.invalid", enableTrace: false }
    );
    assert.equal(result.status, "ACTORS_RESOLVED_TO_TRANSACTION_INITIATORS");
    assert.equal(result.coveragePct, 100);
    assert.equal(result.events[0].economicActorAddress, USER);
    assert.equal(result.events[0].routeMode, "MULTI_POOL_ROUTE");
    assert.equal(result.events[0].routerAdjusted, true);
  } finally {
    global.fetch = previousFetch;
  }
});

test("economic participant flow measures buyers new to observed history rather than claiming first-ever buyers", () => {
  const now = new Date("2026-08-13T12:00:00.000Z").getTime();
  const history = [
    event({ eventKey: "old:1", txHash: "old1", economicActorAddress: USER, actorAddress: USER, actorConfidencePct: 90, routerAdjusted: true, eventTime: new Date(now - 3 * 3600_000).toISOString() }),
  ];
  const live = [
    event({ eventKey: "new:1", txHash: "new1", economicActorAddress: USER, actorAddress: USER, actorConfidencePct: 90, routerAdjusted: true, eventTime: new Date(now - 20 * 60_000).toISOString() }),
    event({ eventKey: "new:2", txHash: "new2", economicActorAddress: USER2, actorAddress: USER2, actorConfidencePct: 90, routerAdjusted: true, eventTime: new Date(now - 10 * 60_000).toISOString() }),
  ];
  const analyzed = analyzeEconomicParticipantFlow({}, { events: live, history, nowMs: now });
  const oneHour = analyzed.economicParticipantFlow.windows["1h"];
  assert.equal(oneHour.uniqueEconomicBuyers, 2);
  assert.equal(oneHour.newToObservedHistoryBuyers, 1);
  assert.equal(oneHour.repeatObservedBuyers, 1);
  assert.equal(oneHour.newToObservedHistoryBuyerSharePct, 50);
  assert.match(analyzed.economicParticipantFlow.policy, /new to the locally observed event history/i);
});

test("seller exhaustion proxy fires only when resolved sellers and sell flow contract", () => {
  const now = new Date("2026-08-13T12:00:00.000Z").getTime();
  const priorTime = (minutes) => new Date(now - (60 + minutes) * 60_000).toISOString();
  const currentTime = (minutes) => new Date(now - minutes * 60_000).toISOString();
  const sell = (actor, time, usd, key) => event({ eventKey: key, side: "SELL", sender: actor, recipient: ROUTER, economicActorAddress: actor, actorAddress: actor, actorConfidencePct: 90, routerAdjusted: true, eventTime: time, usdNotional: usd });
  const events = [
    sell(USER, priorTime(40), 500, "p1"), sell(USER2, priorTime(30), 500, "p2"), sell(USER3, priorTime(20), 500, "p3"), sell(ROUTER, priorTime(10), 500, "p4"),
    sell(USER, currentTime(20), 200, "c1"),
    event({ eventKey: "b1", economicActorAddress: USER2, actorAddress: USER2, actorConfidencePct: 90, routerAdjusted: true, eventTime: currentTime(10), usdNotional: 1000, executionPriceUsd: 1.01 }),
    event({ eventKey: "b2", economicActorAddress: USER3, actorAddress: USER3, actorConfidencePct: 90, routerAdjusted: true, eventTime: currentTime(5), usdNotional: 1000, executionPriceUsd: 1.02 }),
  ];
  const oneHour = __economicParticipantFlowTestHooks.windowMetrics(events, "1h", 3600, now, 60);
  assert.equal(oneHour.uniqueEconomicSellers, 1);
  assert.equal(oneHour.priorUniqueEconomicSellers, 4);
  assert.ok(oneHour.sellerExhaustionScore >= 75);
  assert.equal(oneHour.sellerExhaustionState, "OBSERVED_SELLER_EXHAUSTION");
});

test("buy-side absorption requires positive flow, quiet price, and seller thinning", () => {
  const now = new Date("2026-08-13T12:00:00.000Z").getTime();
  const resolved = (side, actor, minutesAgo, usd, price, key) => event({
    eventKey: key,
    side,
    sender: side === "SELL" ? actor : ROUTER,
    recipient: side === "BUY" ? actor : ROUTER,
    economicActorAddress: actor,
    actorAddress: actor,
    actorConfidencePct: 90,
    routerAdjusted: true,
    eventTime: new Date(now - minutesAgo * 60_000).toISOString(),
    usdNotional: usd,
    executionPriceUsd: price,
  });
  const events = [
    resolved("SELL", USER, 110, 600, 1, "p1"),
    resolved("SELL", USER2, 100, 600, 1, "p2"),
    resolved("SELL", USER3, 90, 600, 1, "p3"),
    resolved("BUY", USER, 50, 900, 1.00, "c1"),
    resolved("SELL", USER2, 40, 150, 1.01, "c2"),
    resolved("BUY", USER3, 20, 900, 1.02, "c3"),
  ];
  const oneHour = __economicParticipantFlowTestHooks.windowMetrics(events, "1h", 3600, now, 60);
  assert.equal(oneHour.absorptionState, "BUY_SIDE_ABSORPTION_WITH_SELLER_THINNING");
});

test("low-confidence routed actors are excluded from economic wallet counts", () => {
  const now = new Date("2026-08-13T12:00:00.000Z").getTime();
  const rows = [
    event({ economicActorAddress: USER, actorAddress: USER, actorConfidencePct: 45, routerAdjusted: true, eventTime: new Date(now - 5 * 60_000).toISOString() }),
    event({ economicActorAddress: USER2, actorAddress: USER2, actorConfidencePct: 85, routerAdjusted: true, eventTime: new Date(now - 4 * 60_000).toISOString(), eventKey: "x2" }),
  ];
  const oneHour = __economicParticipantFlowTestHooks.windowMetrics(rows, "1h", 3600, now, 60);
  assert.equal(oneHour.uniqueEconomicBuyers, 1);
  assert.equal(oneHour.resolvedSwaps, 1);
  assert.equal(oneHour.participantResolutionCoveragePct, 50);
});

test("market pressure labels transaction-initiator replacement conservatively", () => {
  const project = {
    priceUsd: 1,
    liquidityUsd: 100000,
    effectiveFreeFloatUsd: 1000000,
    marketMicrostructure: { windows: { "1h": { buyVolumeUsd: 20000, sellVolumeUsd: 5000, netFlowUsd: 15000, uniqueBuyers: 5, uniqueSellers: 1, priceDeltaPct: 2 } } },
    economicParticipantFlow: { windows: { "1h": { newToObservedHistoryBuyers: 4, repeatObservedBuyers: 1, participantResolutionCoveragePct: 90, identityMode: "EVM_TRANSACTION_INITIATOR_NOT_BENEFICIAL_OWNER", uniqueEconomicSellers: 1, priorUniqueEconomicSellers: 4 } } },
    observedNewBuyerInitiators1h: 4,
    observedRepeatBuyerInitiators1h: 1,
    resolvedUniqueSellers1h: 1,
    priorResolvedUniqueSellers1h: 4,
  };
  const analyzed = analyzeMarketPressure(project);
  assert.equal(analyzed.marketPressure.buyerReplacement.buyerIdentityMode, "EVM_TRANSACTION_INITIATOR_NOT_BENEFICIAL_OWNER");
  assert.match(analyzed.marketPressure.buyerReplacement.state, /OBSERVED|HISTORY/);
});
