import test from "node:test";
import assert from "node:assert/strict";
import { createLiFiExecutableQuoteProvider, verifyActionIdentity, __lifiExecutableQuoteHooks as hooks } from "../src/execution/lifiExecutableQuoteProvider.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const NOW = new Date("2026-10-18T06:00:00Z");
const badNumbers = [true, false, [], [1], {}, "", " ", "0x10", "1_0", "1e-9999", Infinity, NaN];
const expected = { side: "BUY", chain: "base", tokenAddress: TOKEN, quoteTokenAddress: USDC, fromAmount: "25000000" };

function payload() {
  return { action: { fromChainId: 8453, toChainId: 8453, fromAmount: "25000000",
    fromToken: { chainId: 8453, address: USDC, decimals: 6 },
    toToken: { chainId: 8453, address: TOKEN, decimals: 18 } },
    estimate: { fromAmount: "25000000", toAmount: "1000000000000000000", fromAmountUSD: "25", toAmountUSD: "24.5",
      gasCosts: [], feeCosts: [], data: { poolAddress: POOL } } };
}

async function quote(change) {
  const provider = createLiFiExecutableQuoteProvider({ now: () => NOW,
    rateBudget: { windowStartedAtMs: NOW.getTime(), requests: 0 },
    fetchJson: async () => { const value = payload(); change?.(value); return value; } });
  return provider({ side: "BUY", operation: "QUOTE_ONLY", chain: "base", tokenAddress: TOKEN,
    poolAddress: POOL, requestedNotionalUsd: 25 });
}

test("coercible gas, fees and notional inputs cannot become known money", async () => {
  for (const value of badNumbers) {
    assert.equal(hooks.nonNegativeBps(100, 90, value), null, `gas ${String(value)}`);
    assert.equal(hooks.atomicFromDecimal(value, 6), null, `notional ${String(value)}`);
    for (const field of ["gasCosts", "feeCosts"]) {
      const result = await quote((q) => { q.estimate[field] = [{ amountUSD: value }]; });
      assert.equal(result.allInCostBps, null, `${field} ${String(value)}`);
      if (field === "gasCosts") assert.equal(result.gasUsd, null);
      else assert.equal(result.protocolFeeBps, null);
    }
  }
});

test("malformed provider USD values remain unknown without a proven price fallback", async () => {
  for (const value of badNumbers) {
    const result = await quote((q) => { q.estimate.fromAmountUSD = value; q.estimate.toAmountUSD = value; });
    assert.equal(result.inputUsd, null, String(value));
    assert.equal(result.outputUsd, null, String(value));
    assert.equal(result.allInCostBps, null, String(value));
  }
});

test("invalid decimal metadata cannot coerce to zero or one decimal", async () => {
  for (const decimals of [true, false, [], [6], {}, null, undefined, "", " ", "0x6"]) {
    assert.equal(hooks.decimalFromAtomic("1000000", decimals), null, String(decimals));
    assert.equal(hooks.atomicFromDecimal(1, decimals), null, String(decimals));
    const value = payload(); value.action.toToken.decimals = decimals;
    assert.throws(() => verifyActionIdentity(value, expected), /identity/);
  }
});

test("atomic quote quantities require bounded unsigned decimal strings", () => {
  for (const value of [true, false, [], ["25000000"], {}, null, undefined, 1.5, -1,
    "1.1", "1e6", "0x10", "", " ", "1".repeat(79), (2n ** 256n).toString()]) {
    assert.equal(hooks.decimalFromAtomic(value, 6), null, String(value));
    for (const location of ["action", "estimate"]) {
      const q = payload(); q[location].fromAmount = value;
      if (location === "estimate" && value === undefined) assert.doesNotThrow(() => verifyActionIdentity(q, expected));
      else assert.throws(() => verifyActionIdentity(q, expected), /amount|size/, `${location}: ${String(value)}`);
    }
    const q = payload(); q.estimate.toAmount = value;
    assert.throws(() => verifyActionIdentity(q, expected), /amount|quantity/, String(value));
  }
});

test("explicit zero fees and valid decimal representations retain their measured meaning", async () => {
  for (const value of [0, "0", "0.0", "0e-1000"]) {
    const result = await quote((q) => { q.estimate.gasCosts = [{ amountUSD: value }]; q.estimate.feeCosts = [{ amountUSD: value }]; });
    assert.equal(result.gasUsd, 0);
    assert.equal(result.protocolFeeBps, 0);
    assert.equal(result.allInCostBps, 200);
  }
  assert.equal(hooks.atomicFromDecimal("2.5e1", "6"), "25000000");
  assert.equal(hooks.decimalFromAtomic("25000000", "6"), 25);
  assert.equal(hooks.nonNegativeBps("100", "90", "1.5"), 1150);
});

test("zero atomic outputs remain observed zero, but sub-unit notional cannot initiate a quote", () => {
  assert.equal(hooks.decimalFromAtomic("0", 6), 0);
  assert.equal(hooks.atomicFromDecimal(1e-7, 6), null);
  assert.equal(hooks.nonNegativeBps(100, -1, 0), null);
  assert.equal(hooks.decimalFromAtomic((2n ** 256n - 1n).toString(), 18) > 0, true);
});
