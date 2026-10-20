import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGoPlusTokenSecurity } from "../src/data/security/goplusSecurityConnector.js";
import { boolFlag, summarizeSecurityEvidence } from "../src/data/security/securityEvidenceUtils.js";
import { executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";

const TOKEN = "0x1111111111111111111111111111111111111111";
const HOLDER = "0x3333333333333333333333333333333333333333";
const project = { chain: "bsc", tokenAddress: TOKEN };
const make = (raw) => normalizeGoPlusTokenSecurity({ result: { [TOKEN]: raw } }, { chain: "bsc", address: TOKEN });

test("coercible or nonbinary flags cannot establish verified source or complete safety checks", () => {
  for (const value of [[0], [1], [], {}, { toString: () => "verified" }]) assert.equal(boolFlag(value), null);
  const fields = ["is_open_source", "is_honeypot", "is_mintable", "is_proxy", "is_blacklisted", "cannot_sell_all",
    "slippage_modifiable", "transfer_pausable", "trading_cooldown", "personal_slippage_modifiable", "hidden_owner",
    "can_take_back_ownership", "owner_change_balance"];
  for (const values of [{ positive: [1], negative: [0] }, { positive: "verified", negative: "no" }]) {
    const raw = { ...Object.fromEntries(fields.map((field) => [field, values.negative])),
      is_open_source: values.positive, buy_tax: "0", sell_tax: "0" };
    const item = make(raw);
    assert.equal(item.verifiedSource, false);
    const summary = summarizeSecurityEvidence([item]);
    for (const field of fields) assert.ok(summary.unknownChecks.includes(`goplus.${field}`));
  }
});

test("coercible or out-of-contract tax values cannot become measured zero tax", () => {
  for (const value of [undefined, null, false, true, [], [0], {}, "", " ", "0x0", "NaN", NaN, Infinity, -0.01, "-0.01", 2, "2"]) {
    const item = make({ buy_tax: value, sell_tax: value });
    assert.equal(item.buyTaxPct, null, String(value));
    assert.equal(item.sellTaxPct, null, String(value));
    const summary = summarizeSecurityEvidence([item]);
    assert.ok(summary.unknownChecks.includes("goplus.buy_tax"));
    assert.ok(summary.unknownChecks.includes("goplus.sell_tax"));
  }
});

test("valid GoPlus tax fractions retain explicit zero and exact percentage semantics", () => {
  for (const [raw, expected] of [[0, 0], ["0", 0], ["0.01", 1], [0.12, 12], ["1", 100]]) {
    const item = make({ buy_tax: raw, sell_tax: raw });
    assert.equal(item.buyTaxPct, expected);
    assert.equal(item.sellTaxPct, expected);
    assert.equal(summarizeSecurityEvidence([item]).unknownChecks.includes("goplus.buy_tax"), false);
  }
});

test("holder counts require nonnegative safe integers rather than coercible observations", () => {
  for (const value of [undefined, null, false, true, [], [1], {}, "", " ", "0x1", "1.5", 1.5, -1, "-1", Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const item = make({ holder_count: value, lp_holder_count: value });
    assert.equal(item.holderCount, null, String(value));
    assert.equal(item.lpHolderCount, null, String(value));
  }
  assert.equal(make({ holder_count: "0" }).holderCount, 0);
  assert.equal(make({ holder_count: "7269" }).holderCount, 7269);
});

test("wallet companions cannot promote malformed or contradictory normalized tax/count values", async () => {
  for (const patch of [
    { raw: { buy_tax: false, sell_tax: false, holder_count: true }, buyTaxPct: 0, sellTaxPct: 0, holderCount: 1 },
    { raw: { buy_tax: "0.5", sell_tax: "0.5", holder_count: "2" }, buyTaxPct: 0, sellTaxPct: 0, holderCount: 1000 },
  ]) {
    const item = { ...make({}), ...patch, raw: { ...patch.raw, holders: [{ address: HOLDER, balance: "1" }] } };
    const result = await executeActiveEvidenceProviderRequests(project, [{ field: "wallets" }], {
      walletHistory: false, useCache: false, now: Date.now, providers: { getGoPlusWalletEvidence: async () => item },
    });
    assert.deepEqual(result.observations.find((entry) => entry.field === "wallets").value, [HOLDER]);
    for (const field of ["buyTaxPct", "sellTaxPct", "holderCount"]) {
      assert.equal(result.observations.some((entry) => entry.field === field), false);
    }
  }
});
