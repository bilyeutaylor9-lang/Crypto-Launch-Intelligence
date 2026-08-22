import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { resolveCanonicalAliases } from "../src/data/canonicalAliasResolver.js";
import { evaluateEngineDataReadiness } from "../src/engines/engineDataReadinessEngine.js";
import { analyzeDataStarvationRootCause } from "../src/engines/dataStarvationRootCauseEngine.js";
import { analyzeStarvationRescue } from "../src/engines/starvationRescueEngine.js";
import { analyzeBuyerBreadthAcceleration } from "../src/engines/buyerBreadthAccelerationEngine.js";
import { analyzeSmartWalletNovelty } from "../src/engines/smartWalletNoveltyEngine.js";
import { analyzePreBreakoutSequence } from "../src/engines/preBreakoutSequenceEngine.js";
import { analyzeEarlyAsymmetryTriage } from "../src/engines/earlyAsymmetryTriageEngine.js";
import { recordPointInTimeObservation } from "../src/data/pointInTimeObservationStore.js";
import { labelEarlyOpportunityOutcome } from "../src/learning/earlyOpportunityOutcomeLab.js";
import { replayMissedWinner } from "../src/learning/missedWinnerReplayLab.js";

const EVM = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";

test("canonical aliases satisfy nested market-cap and liquidity requirements", () => {
  const project = {
    source: "dexscreener",
    chain: "base",
    marketData: {
      marketCap: 4_200_000,
      liquidityUsd: 180_000,
    },
    rawCandidate: {
      volume24h: 90_000,
    },
  };
  const aliases = resolveCanonicalAliases(project, {
    fields: ["circulatingMarketCapUsd", "liquidityUsd", "volume24hUsd"],
  });

  assert.equal(aliases.resolved.circulatingMarketCapUsd, 4_200_000);
  assert.equal(aliases.resolved.liquidityUsd, 180_000);
  assert.equal(aliases.resolved.volume24hUsd, 90_000);

  const readiness = evaluateEngineDataReadiness(project, {
    id: "marketInputs",
    affectsFinalDecision: true,
    canBlockCandidate: true,
    inputContract: {
      requiredAny: [["marketCap"], ["liquidityUsd"], ["volume24h"]],
      optional: [],
    },
  });
  assert.equal(readiness.status, "READY");
});

test("applicability prevents false missing data for CEX, Solana, and meme projects", () => {
  const cexReadiness = evaluateEngineDataReadiness(
    { sourceType: "cex", exchange: "kraken", symbol: "CEX" },
    {
      id: "lpLock",
      affectsFinalDecision: true,
      canBlockCandidate: true,
      phase: "liquidity",
      inputContract: { requiredAny: [["lpLockedPct"]], optional: [] },
    }
  );
  assert.equal(cexReadiness.status, "READY");
  assert.equal(cexReadiness.notApplicableGroups.length, 1);

  const solanaReadiness = evaluateEngineDataReadiness(
    { chain: "solana", symbol: "SOLX" },
    {
      id: "evmOwner",
      affectsFinalDecision: true,
      canBlockCandidate: true,
      phase: "safety",
      inputContract: { requiredAny: [["ownerRenounced"]], optional: [] },
    }
  );
  assert.equal(solanaReadiness.status, "READY");

  const memeReadiness = evaluateEngineDataReadiness(
    { category: "meme-token", description: "community meme coin", symbol: "MEME" },
    {
      id: "github",
      affectsFinalDecision: false,
      canBlockCandidate: false,
      phase: "development",
      inputContract: { requiredAny: [["githubRepo"]], optional: [] },
    }
  );
  assert.equal(memeReadiness.status, "READY");
});

test("root-cause engine separates internal output, deferred enrichment, provider outage, and rate limit", () => {
  const internal = analyzeDataStarvationRootCause(
    {
      symbol: "MISSRANK",
      engineResults: {
        marketOpportunityRank: { status: "SUCCESS" },
      },
    },
    {
      contracts: [
        {
          id: "rank",
          phase: "ranking",
          affectsFinalDecision: true,
          canBlockCandidate: false,
          inputContract: { requiredAny: [["marketOpportunityRank"]], optional: [] },
        },
      ],
    }
  );
  assert.equal(internal.dataStarvationMissingEvidence[0].rootCause, "PIPELINE_OUTPUT_MISSING");

  const deferred = analyzeDataStarvationRootCause(
    { symbol: "DEFER", enrichmentDeferredFields: ["liquidityUsd"] },
    {
      contracts: [
        {
          id: "liq",
          phase: "market",
          affectsFinalDecision: true,
          canBlockCandidate: true,
          inputContract: { requiredAny: [["liquidityUsd"]], optional: [] },
        },
      ],
    }
  );
  assert.equal(deferred.dataStarvationMissingEvidence[0].rootCause, "ENRICHMENT_DEFERRED");

  const rateLimited = analyzeDataStarvationRootCause(
    { symbol: "RATE", providerWarnings: ["CoinGecko request failed: 429"] },
    {
      contracts: [
        {
          id: "cap",
          phase: "market",
          affectsFinalDecision: true,
          canBlockCandidate: true,
          inputContract: { requiredAny: [["marketCap"]], optional: [] },
        },
      ],
    }
  );
  assert.equal(rateLimited.dataStarvationMissingEvidence[0].rootCause, "PROVIDER_RATE_LIMITED");

  const attemptedUnknown = analyzeDataStarvationRootCause(
    {
      symbol: "ATTEMPTED",
      activeEvidenceRecovery: {
        attemptedFields: ["liquidityUsd"],
        providerAttempts: [{ provider: "dexscreener", status: "SUCCESS" }],
      },
    },
    {
      contracts: [
        {
          id: "liquidity",
          phase: "market",
          affectsFinalDecision: true,
          canBlockCandidate: true,
          inputContract: { requiredAny: [["liquidityUsd"]], optional: [] },
        },
      ],
    }
  );
  assert.equal(attemptedUnknown.dataStarvationMissingEvidence[0].sourceAttempted, true);
  assert.equal(attemptedUnknown.dataStarvationMissingEvidence[0].rootCause, "PROVIDER_RETURNED_UNKNOWN");
});

test("rescue queue blocks identity conflict, honeypot, and high wash-trading risk", () => {
  const base = {
    chain: "base",
    tokenAddress: EVM,
    preBreakoutTimingState: "PRE_BREAKOUT",
    earlyAsymmetryResearchPriorityScore: 72,
    dataStarvationMissingEvidence: [{ canonicalField: "liquidityUsd", recoverable: true, rootCause: "RAW_SOURCE_MISSING" }],
    observedSignals: [{ family: "BUYER_BREADTH_ACCELERATION", score: 70 }, { family: "ATTENTION_GAP", score: 70 }],
  };

  assert.equal(analyzeStarvationRescue({ ...base, identityConflict: true }).starvationRescueEligible, false);
  assert.equal(analyzeStarvationRescue({ ...base, honeypotDetected: true }).starvationRescueEligible, false);
  assert.equal(analyzeStarvationRescue({ ...base, washTradingRiskScore: 90 }).starvationRescueEligible, false);
});

test("strong early candidate with recoverable missing data enters rescue but is not buy-qualified", () => {
  const rescued = analyzeStarvationRescue({
    symbol: "AKESTYLE",
    chain: "base",
    tokenAddress: EVM,
    preBreakoutTimingState: "PRE_BREAKOUT",
    earlyAsymmetryResearchPriorityScore: 76,
    buyerBreadthAccelerationScore: 74,
    liquidityFormationScore: 68,
    attentionGapV2Score: 70,
    valueOfInformationScore: 52,
    dataStarvationMissingEvidence: [
      { canonicalField: "sellRouteAvailable", recoverable: true, rootCause: "EXECUTION_EVIDENCE_MISSING", targetSources: [{ source: "Uniswap quote adapters" }] },
    ],
  });

  assert.equal(rescued.starvationRescueEligible, true);
  assert.equal(rescued.researchOnly, true);
  assert.equal(rescued.finalSelectionQualified, false);
  assert.equal(rescued.rescueLane, "P1_EARLY_ASYMMETRY_RESCUE");
});

test("unknown values remain unknown and bad aliases are not converted into zero or addresses", () => {
  const aliases = resolveCanonicalAliases(
    {
      chain: "base",
      symbol: "BAD",
      address: "BAD",
      marketData: { marketCap: "" },
    },
    { fields: ["tokenAddress", "circulatingMarketCapUsd"] }
  );

  assert.equal(aliases.resolved.tokenAddress, null);
  assert.equal(aliases.resolved.circulatingMarketCapUsd, null);
});

test("linked wallets reduce independent buyer breadth", () => {
  const broad = analyzeBuyerBreadthAcceleration({
    rawUniqueBuyers: 100,
    buyersPrev24h: 50,
    buyTransactions24h: 140,
    sellTransactions24h: 40,
    walletFlows: Array.from({ length: 20 }, () => ({ buyVolumeUsd: 100 })),
  });
  const clustered = analyzeBuyerBreadthAcceleration({
    rawUniqueBuyers: 100,
    buyersPrev24h: 50,
    buyTransactions24h: 140,
    sellTransactions24h: 40,
    linkedWalletClusterCount: 20,
    largestClusterShare: 70,
    walletFlows: [{ buyVolumeUsd: 1900 }, { buyVolumeUsd: 100 }],
  });

  assert.ok(clustered.clusterAdjustedUniqueBuyers < broad.clusterAdjustedUniqueBuyers);
  assert.ok(clustered.buyerBreadthAccelerationScore < broad.buyerBreadthAccelerationScore);
});

test("smart-wallet novelty requires measured history and unrelated wallets", () => {
  const weak = analyzeSmartWalletNovelty({
    smartWallets: [
      { address: "a", walletHistoricalHitRate: 80, walletResolvedSampleSize: 2 },
      { address: "b", walletHistoricalHitRate: 90, walletResolvedSampleSize: 1 },
    ],
  });
  const strong = analyzeSmartWalletNovelty({
    smartWallets: [
      { address: "a", walletHistoricalHitRate: 60, walletResolvedSampleSize: 20, walletRugExposureRate: 5, walletFundingCluster: "1", walletMedianEntryLeadTime: 24 },
      { address: "b", walletHistoricalHitRate: 58, walletResolvedSampleSize: 18, walletRugExposureRate: 7, walletFundingCluster: "2", walletMedianEntryLeadTime: 18 },
      { address: "c", walletHistoricalHitRate: 62, walletResolvedSampleSize: 30, walletRugExposureRate: 4, walletFundingCluster: "3", walletMedianEntryLeadTime: 30 },
    ],
  });

  assert.equal(weak.smartWalletNoveltyStatus, "UNMEASURED_OR_LINKED_WALLETS");
  assert.equal(strong.smartWalletNoveltyStatus, "MEASURED_UNRELATED_SMART_WALLETS");
});

test("price compression with buyer and liquidity acceleration outranks already-pumped late chase", () => {
  const early = analyzeEarlyAsymmetryTriage(
    analyzePreBreakoutSequence({
      symbol: "EARLY",
      chain: "base",
      tokenAddress: EVM,
      liquidityUsd: 120_000,
      marketCap: 3_000_000,
      volume24h: 210_000,
      priceChange24h: 8,
      priceChange7d: 20,
      buyerBreadthAccelerationScore: 82,
      liquidityFormationScore: 78,
      attentionGapV2Score: 74,
      smartWalletNoveltyScore: 66,
      developerAccelerationV2Score: 55,
      sourceTruthScore: 70,
      identityResolutionScore: 80,
      instantSafetyStatus: "PASS",
    })
  );
  const pumped = analyzeEarlyAsymmetryTriage(
    analyzePreBreakoutSequence({
      symbol: "PUMPED",
      chain: "base",
      tokenAddress: POOL,
      liquidityUsd: 900_000,
      marketCap: 10_000_000,
      volume24h: 4_000_000,
      priceChange24h: 250,
      priceChange7d: 480,
      buyerBreadthAccelerationScore: 75,
      liquidityFormationScore: 80,
      attentionGapV2Score: 20,
      sourceTruthScore: 70,
      identityResolutionScore: 80,
      instantSafetyStatus: "PASS",
    })
  );

  assert.equal(pumped.preBreakoutTimingState, "LATE_CHASE");
  assert.ok(early.earlyAsymmetryResearchPriorityScore > pumped.earlyAsymmetryResearchPriorityScore);
});

test("first-seen snapshots are immutable and outcome labels use only future timestamps", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "first-seen-"));
  const filePath = path.join(dir, "store.json");
  const first = recordPointInTimeObservation(
    { symbol: "FIRST", chain: "base", tokenAddress: EVM, priceUsd: 1, liquidityUsd: 10000 },
    { observedAt: "2026-01-01T00:00:00.000Z" },
    { filePath }
  );
  const second = recordPointInTimeObservation(
    { symbol: "FIRST", chain: "base", tokenAddress: EVM, priceUsd: 9, liquidityUsd: 90000 },
    { observedAt: "2026-01-02T00:00:00.000Z" },
    { filePath }
  );

  assert.equal(first.firstSeen.firstSeenPrice, 1);
  assert.equal(second.firstSeen.firstSeenPrice, 1);

  const unresolved = labelEarlyOpportunityOutcome(
    { predictionTimestamp: "2026-01-02T00:00:00.000Z", priceUsd: 1 },
    [{ observedAt: "2026-01-01T12:00:00.000Z", priceUsd: 2 }]
  );
  assert.equal(unresolved.status, "UNRESOLVED");

  const labeled = labelEarlyOpportunityOutcome(
    { predictionTimestamp: "2026-01-01T00:00:00.000Z", priceUsd: 1 },
    [{ observedAt: "2026-01-02T00:00:00.000Z", priceUsd: 2, liquidityUsd: 10000, sellRouteAvailable: true }]
  );
  assert.equal(labeled.status, "LABELED");
  assert.equal(labeled.labels.return_24h, 100);
});

test("missed-winner replay can count an early-recall success without future leakage", () => {
  const replay = replayMissedWinner({
    symbol: "WIN",
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    firstSeenPrice: 1,
    breakoutStartAt: "2026-01-02T00:00:00.000Z",
    observations: [
      {
        observedAt: "2026-01-01T00:00:00.000Z",
        priceUsd: 1,
        timingState: "PRE_BREAKOUT",
        researchPriority: 62,
        identityState: "VALIDATED_ADDRESS",
      },
      {
        observedAt: "2026-01-02T00:00:00.000Z",
        priceUsd: 2,
        liquidityUsd: 10000,
        sellRouteAvailable: true,
      },
    ],
  });

  assert.equal(replay.earlyRecallSuccess, true);
  assert.equal(replay.leakagePolicy.includes("Future observations"), true);
});
