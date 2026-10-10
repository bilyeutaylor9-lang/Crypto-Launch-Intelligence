import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSmartWalletNovelty } from "../src/engines/smartWalletNoveltyEngine.js";

const complete = { address: "a", walletHistoricalHitRate: 60, walletResolvedSampleSize: 20,
  walletMedianEntryLeadTime: 0, walletRugExposureRate: 0, walletFundingCluster: "measured-cluster" };

test("missing risk or cluster cannot qualify a wallet or inherit bullish scores", () => {
  for (const field of ["walletRugExposureRate", "walletFundingCluster"]) {
    const wallet = { ...complete };
    delete wallet[field];
    const result = analyzeSmartWalletNovelty({ smartWallets: [wallet], smartMoneyAccumulationScore: 100, walletEntryNovelty: 100 });
    assert.equal(result.smartWalletNoveltyScore, null);
    assert.equal(result.smartWalletNovelty.qualifiedWalletCount, 0);
    assert.equal(result.smartWalletNovelty.walletIndependence, null);
    assert.equal(result.smartWalletNoveltyCoverage.coveragePct, 80);
    assert.ok(result.smartWalletNoveltyCoverage.missingValues.includes(field));
  }
});

test("address-only wallet rows have zero history coverage", () => {
  const result = analyzeSmartWalletNovelty({ smartWallets: [{ address: "a" }] });
  assert.equal(result.smartWalletNoveltyScore, null);
  assert.equal(result.smartWalletNoveltyCoverage.coveragePct, 0);
  assert.deepEqual(result.smartWalletNoveltyCoverage.sourceFamilies, []);
});

test("measured zero risk and zero lead remain observations and shared clusters remain linked", () => {
  const result = analyzeSmartWalletNovelty({ smartWallets: [complete, { ...complete, address: "b" }] });
  assert.equal(result.smartWalletNoveltyCoverage.coveragePct, 100);
  assert.equal(result.smartWalletNovelty.walletMedianEntryLeadTime, 0);
  assert.equal(result.smartWalletNovelty.walletIndependence, 50);
  assert.notEqual(result.smartWalletNoveltyScore, null);
});

test("invalid percentages, fractional samples and non-string clusters stay missing", () => {
  for (const [field, value] of [["walletHistoricalHitRate", 101], ["walletRugExposureRate", -1],
    ["walletResolvedSampleSize", 8.5], ["walletFundingCluster", true]]) {
    const result = analyzeSmartWalletNovelty({ smartWallets: [{ ...complete, [field]: value }] });
    assert.equal(result.smartWalletNoveltyScore, null);
    assert.ok(result.smartWalletNoveltyCoverage.missingValues.includes(field));
  }
});
