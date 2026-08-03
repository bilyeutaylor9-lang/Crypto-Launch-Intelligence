import test from "node:test";
import assert from "node:assert/strict";
import { scoreCoreBaseline } from "../src/backtest/coreBaselineModel.js";

test("baseline rejects incomplete projects without manufacturing zero-valued evidence", () => {
  const result = scoreCoreBaseline({
    chain: "solana",
    tokenAddress: "11111111111111111111111111111111",
    identityKey: "solana:11111111111111111111111111111111",
    rawEvidence: { relativeStrengthScore: 90 },
    scores: { smartWallet: 0, liquidity: 0, catalyst: 0 },
  });
  assert.equal(result.eligible, false);
  assert.equal(result.measuredFamilies, 1);
  assert.equal(result.components.qualifiedSmartWalletNetFlow, null);
});

test("baseline scores only measured point-in-time evidence", () => {
  const result = scoreCoreBaseline({
    chain: "solana",
    tokenAddress: "11111111111111111111111111111111",
    identityKey: "solana:11111111111111111111111111111111",
    rawEvidence: {
      independentBuyerAccelerationScore: 80,
      qualifiedSmartWalletFlowScore: 75,
      liquidityFormationScore: 70,
      relativeStrengthScore: 85,
      volumeAccelerationScore: 65,
      verifiedCatalystScore: 70,
      safetyScore: 90,
    },
    buyQuoteVerified: true,
    sellQuoteVerified: true,
  });
  assert.equal(result.eligible, true);
  assert.equal(result.coverage, 1);
  assert.ok(result.evidenceAdjustedBaselineScore > 70);
});

test("known honeypot blocks baseline regardless of score", () => {
  const result = scoreCoreBaseline({
    chain: "base",
    tokenAddress: "0x1111111111111111111111111111111111111111",
    identityKey: "base:0x1111111111111111111111111111111111111111",
    honeypotDetected: true,
    rawEvidence: {
      independentBuyerAccelerationScore: 100,
      qualifiedSmartWalletFlowScore: 100,
      liquidityFormationScore: 100,
      relativeStrengthScore: 100,
      volumeAccelerationScore: 100,
      verifiedCatalystScore: 100,
      safetyScore: 100,
    },
  });
  assert.equal(result.eligible, false);
  assert.equal(result.safetyBlocked, true);
});
