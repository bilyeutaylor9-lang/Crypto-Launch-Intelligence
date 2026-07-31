import test from "node:test";
import assert from "node:assert/strict";

import { analyzeSmartWallets } from "../src/engines/smartWalletEngine.js";
import { analyzeSmartWalletPerformance } from "../src/engines/smartWalletPerformanceEngine.js";
import { analyzeSmartMoneyAccumulation } from "../src/engines/smartMoneyAccumulationEngine.js";
import { analyzeSmartWalletArrival } from "../src/engines/smartWalletArrivalEngine.js";
import { analyzeSmartWalletNovelty } from "../src/engines/smartWalletNoveltyEngine.js";
import { analyzeSocialAcceleration } from "../src/engines/socialAccelerationEngine.js";

test("missing wallet and social observations remain null instead of weak factual scores", () => {
  const project = { symbol: "UNKNOWN_EVIDENCE" };
  const smartWallet = analyzeSmartWallets(project);
  const performance = analyzeSmartWalletPerformance(project);
  const accumulation = analyzeSmartMoneyAccumulation(project);
  const arrival = analyzeSmartWalletArrival(project);
  const novelty = analyzeSmartWalletNovelty(project);
  const social = analyzeSocialAcceleration(project);

  assert.equal(smartWallet.smartWalletScore, null);
  assert.equal(performance.smartWalletPerformanceScore, null);
  assert.equal(accumulation.smartMoneyAccumulationScore, null);
  assert.equal(arrival.smartWalletArrivalScore, null);
  assert.equal(novelty.smartWalletNoveltyScore, null);
  assert.equal(social.socialAccelerationScore, null);

  assert.equal(smartWallet.smartWalletCoverage.coveragePct, 0);
  assert.equal(performance.smartWalletPerformanceCoverage.coveragePct, 0);
  assert.equal(accumulation.smartMoneyAccumulationCoverage.coveragePct, 0);
  assert.equal(arrival.smartWalletArrivalCoverage.coveragePct, 0);
  assert.equal(novelty.smartWalletNoveltyCoverage.coveragePct, 0);
  assert.equal(social.socialAccelerationCoverage.coveragePct, 0);
});

test("explicit zero wallet and social observations remain measured evidence", () => {
  const smartWallet = analyzeSmartWallets({
    smartWalletBuys24h: 0,
    smartWalletSells24h: 0,
    smartWalletBuyVolumeUsd: 0,
    smartWalletSellVolumeUsd: 0,
  });
  const accumulation = analyzeSmartMoneyAccumulation({
    smartWalletNetFlowUsd: 0,
    smartWalletBuyCount: 0,
    smartWalletSellCount: 0,
    accumulationDays: 0,
  });
  const arrival = analyzeSmartWalletArrival({
    smartWalletBuyers: 0,
    smartWalletArrivalMinutes: 0,
  });
  const social = analyzeSocialAcceleration({
    socialMentionsNow: 0,
    socialMentionsPrevious: 0,
    followersNow: 0,
    followersPrevious: 0,
  });

  assert.equal(smartWallet.smartWalletScore, 0);
  assert.equal(accumulation.smartMoneyAccumulationScore, 0);
  assert.equal(arrival.smartWalletArrivalScore, 0);
  assert.equal(social.socialAccelerationScore, 0);
  assert.equal(smartWallet.smartWalletCoverage.coveragePct, 100);
  assert.equal(accumulation.smartMoneyAccumulationCoverage.coveragePct, 100);
  assert.ok(arrival.smartWalletArrivalCoverage.coveragePct > 0);
  assert.ok(social.socialAccelerationCoverage.coveragePct > 0);
});
