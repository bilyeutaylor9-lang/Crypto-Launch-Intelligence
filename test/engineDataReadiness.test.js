import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeEngineDataReadiness,
  evaluateEngineDataReadiness,
  summarizeEngineDataReadiness,
} from "../src/engines/engineDataReadinessEngine.js";
import {
  getCoinLoreAssetsCandidates,
  getCoinLoreMoversCandidates,
  getDexScreenerBoostCandidates,
  getDexScreenerCommunityTakeoverCandidates,
} from "../src/data/expandedMarketDataConnector.js";
import { normalizeDexPair } from "../src/data/dexScreenerConnector.js";

const TEST_CONTRACT = {
  id: "testLiquidityInputs",
  phase: "test",
  affectsFinalDecision: true,
  canBlockCandidate: true,
  inputContract: {
    requiredAny: [["liquidityUsd"], ["volume24h"]],
    optional: ["priceUsd"],
  },
};

test("engine data readiness treats explicit zero metrics as present measured inputs", () => {
  const readiness = evaluateEngineDataReadiness(
    {
      liquidityUsd: 0,
      volume24h: 0,
      priceUsd: 0,
    },
    TEST_CONTRACT
  );

  assert.equal(readiness.status, "READY");
  assert.equal(readiness.requiredCoveragePct, 100);
  assert.equal(readiness.optionalCoveragePct, 100);
  assert.deepEqual(readiness.missingRequiredGroups, []);
});

test("engine data readiness opens source plans when required inputs are missing", () => {
  const analyzed = analyzeEngineDataReadiness(
    {
      name: "Missing Route Project",
      symbol: "MRP",
      source: "coinlore-assets",
    },
    {
      contracts: [
        {
          id: "routeAndEvidence",
          phase: "execution",
          affectsFinalDecision: true,
          canBlockCandidate: true,
          inputContract: {
            requiredAny: [["contractAddress", "tokenAddress"], ["pairAddress", "poolAddress"]],
            optional: ["volume24h", "roadmap"],
          },
        },
      ],
    }
  );

  assert.equal(analyzed.engineDataReadinessStatus, "CORE_DATA_STARVED");
  assert.ok(analyzed.missingEngineInputs.some((item) => item.fields === "contractAddress or tokenAddress"));
  assert.ok(analyzed.missingEngineInputs.some((item) => item.fields === "pairAddress or poolAddress"));
  assert.ok(analyzed.nextDataSourcesNeeded.includes("DexScreener"));
  assert.ok(analyzed.nextDataSourcesNeeded.includes("official docs"));

  const summary = summarizeEngineDataReadiness([analyzed]);
  assert.equal(summary.coreDataStarved, 1);
  assert.ok(summary.topMissingInputs.some((item) => item.fields === "contractAddress or tokenAddress"));
});

test("engine data readiness stays bounded on enriched project payloads", () => {
  const heavyEngineResults = Object.fromEntries(
    Array.from({ length: 120 }, (_, index) => [
      `engine${index}`,
      {
        engineName: `Engine ${index}`,
        evidence: Array.from({ length: 20 }, (__, evidenceIndex) => ({
          source: `source-${evidenceIndex}`,
          value: evidenceIndex,
        })),
        warnings: Array.from({ length: 20 }, (__, warningIndex) => `warning-${warningIndex}`),
      },
    ])
  );
  const projects = Array.from({ length: 25 }, (_, index) => ({
    name: `Bounded ${index}`,
    symbol: `BND${index}`,
    chain: "base",
    tokenAddress: "0x1111111111111111111111111111111111111111",
    poolAddress: "0x2222222222222222222222222222222222222222",
    priceUsd: 0.005,
    liquidityUsd: 100000,
    volume24h: 50000,
    marketCap: 900000,
    engineResults: heavyEngineResults,
  }));

  const startedAt = Date.now();
  const summary = summarizeEngineDataReadiness(projects);
  const durationMs = Date.now() - startedAt;

  assert.equal(summary.projectsAnalyzed, 25);
  assert.ok(durationMs < 2000, `expected bounded readiness analysis, got ${durationMs}ms`);
});

test("CoinLore assets and movers add no-key discovery rows without fake addresses", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    const text = String(url);
    if (text.includes("/api/assets/")) {
      return {
        ok: true,
        json: async () => [
          { id: "77", name: "Asset Alpha", symbol: "AAA", nameid: "asset-alpha", rank: 1234 },
        ],
      };
    }
    if (text.includes("/api/movers/")) {
      return {
        ok: true,
        json: async () => ({
          data: {
            winners: [
              {
                id: "88",
                name: "Mover Alpha",
                symbol: "MVA",
                nameid: "mover-alpha",
                price_usd: "0.12",
                volume24: "45000",
                percent_change_1h: "12.5",
                percent_change_24h: "30",
                percent_change_7d: "80",
                market_cap_usd: "5000000",
              },
            ],
            losers: [],
          },
        }),
      };
    }
    throw new Error(`Unexpected URL ${text}`);
  };

  try {
    const [asset] = await getCoinLoreAssetsCandidates({ limit: 1 });
    const [mover] = await getCoinLoreMoversCandidates({ sortWindows: ["1h"], limit: 1 });

    assert.equal(asset.source, "coinlore-assets");
    assert.equal(asset.chain, null);
    assert.equal(asset.address, null);
    assert.equal(asset.pairAddress, null);
    assert.equal(asset.providerAssetId, "77");
    assert.equal(asset.marketKey, "coinlore-assets:77");

    assert.equal(mover.source, "coinlore-movers");
    assert.equal(mover.chain, null);
    assert.equal(mover.address, null);
    assert.equal(mover.pairAddress, null);
    assert.equal(mover.providerAssetId, "88");
    assert.equal(mover.priceChange1h, 12.5);
    assert.equal(mover.liquidityUsd, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("DexScreener catalyst feeds normalize identity and avoid fake executable liquidity", async () => {
  const originalFetch = globalThis.fetch;
  const tokenAddress = "0x1111111111111111111111111111111111111111";

  globalThis.fetch = async (url) => {
    const text = String(url);
    if (text.includes("/community-takeovers/")) {
      return {
        ok: true,
        json: async () => [
          {
            chainId: "base",
            tokenAddress,
            header: "Community Alpha",
            description: "community takeover",
            url: "https://dexscreener.com/base/community-alpha",
            claimDate: "2026-07-18",
          },
        ],
      };
    }
    if (text.includes("/token-boosts/latest/")) {
      return {
        ok: true,
        json: async () => [
          {
            chainId: "base",
            tokenAddress,
            header: "Boost Alpha",
            description: "boosted launch",
            url: "https://dexscreener.com/base/boost-alpha",
            amount: "1",
            totalAmount: "3",
          },
        ],
      };
    }
    if (text.includes("/token-boosts/top/")) {
      return { ok: true, json: async () => [] };
    }
    throw new Error(`Unexpected URL ${text}`);
  };

  try {
    const [takeover] = await getDexScreenerCommunityTakeoverCandidates({ limit: 1 });
    const [boost] = await getDexScreenerBoostCandidates({ limit: 1 });

    assert.equal(takeover.source, "dexscreener-community-takeovers");
    assert.equal(takeover.chain, "base");
    assert.equal(takeover.address, tokenAddress);
    assert.equal(takeover.pairAddress, null);
    assert.equal(takeover.claimDate, "2026-07-18");

    assert.equal(boost.source, "dexscreener-boosts");
    assert.equal(boost.chain, "base");
    assert.equal(boost.address, tokenAddress);
    assert.equal(boost.liquidityUsd, null);
    assert.equal(boost.volume24h, null);
    assert.equal(boost.attentionSpendUsd, 3000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("direct DexScreener pair normalization validates chain and preserves missing metrics as null", () => {
  const normalized = normalizeDexPair({
    chainId: "base",
    dexId: "uniswap",
    baseToken: {
      name: "Pair Alpha",
      symbol: "PRA",
      address: "0x2222222222222222222222222222222222222222",
    },
    quoteToken: {
      address: "0x3333333333333333333333333333333333333333",
    },
    pairAddress: "0x4444444444444444444444444444444444444444",
    priceUsd: "",
    liquidity: {},
    volume: {},
    priceChange: {},
    txns: {},
  });

  assert.equal(normalized.chain, "base");
  assert.equal(normalized.declaredChain, "base");
  assert.equal(normalized.address, "0x2222222222222222222222222222222222222222");
  assert.equal(normalized.pairAddress, "0x4444444444444444444444444444444444444444");
  assert.equal(normalized.priceUsd, null);
  assert.equal(normalized.liquidityUsd, null);
  assert.equal(normalized.volume24h, null);
  assert.equal(normalized.buyTransactions24h, null);
});
