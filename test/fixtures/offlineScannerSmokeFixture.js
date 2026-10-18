import assert from "node:assert/strict";

export const FIXTURE_TIME = "2026-10-18T00:00:00.000Z";
export const FIXTURE_RUN_ID = "test_offline_scanner_smoke_v1";
const TOKEN = "66wLt8u1BmvqWb2Wks7NiVeuvNC9NsmrDUVu777YuHzW";
const POOL = "GJ2uhUVnzBj96uxp5b2hX9oJ9k6jX5DnwxYxPneNHfNe";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export async function buildOfflineScannerFixture(scenario = "baseline") {
  const { getSolanaSecurityEvidence } = await import("../../src/data/security/solanaSecurityConnector.js");
  const { recoverSolanaRaydiumRoute } = await import("../../src/execution/raydiumExecutableQuoteProvider.js");
  const calls = [];
  const project = {
    name: "Offline Utility Fixture", symbol: "OFFLINE", chain: "solana",
    tokenAddress: TOKEN, contractAddress: TOKEN, address: TOKEN, poolAddress: POOL, pairAddress: POOL,
    source: "dexscreener", discoverySources: ["dexscreener", "geckoterminal", "github"],
    artifactClass: "TEST", evidenceMode: "OFFLINE_FIXTURE",
    sourceTimestamp: FIXTURE_TIME, discoveredAt: FIXTURE_TIME,
    description: "Open source infrastructure protocol with API, SDK, developer documentation and a working product.",
    website: "https://offline-fixture.invalid", githubRepo: "https://github.com/offline-fixture/protocol",
    websiteText: "Infrastructure API and SDK documentation for a working open source product.",
    priceUsd: 1, marketCap: 5_000_000, fdv: 6_000_000, liquidityUsd: 250_000,
    dexLiquidityUsd: 250_000, stableExitLiquidityUsd: 250_000,
    volume24hUsd: 100_000, volume24h: 100_000, priceChange24h: 0, priceChange7d: 0,
    holders: 1000, holderCount: 1000, buyers24h: 40, uniqueBuyers24h: 40,
    buyTransactions24h: 50, sellTransactions24h: 50,
    regionStatus: "CONFIRMED_AVAILABLE",
  };
  const security = await getSolanaSecurityEvidence(project, {
    useCache: false, solanaRpcUrl: "https://offline-rpc.invalid", now: () => new Date(FIXTURE_TIME),
    fetchJson: async (url, init = {}) => {
      if (url.includes("rugcheck")) {
        calls.push("rugcheck");
        return { mint: TOKEN, tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", mintAuthority: null, freezeAuthority: null,
          rugged: scenario === "unsafe-proof", score: 0, risks: [], topHolders: [] };
      }
      assert.equal(url, "https://offline-rpc.invalid");
      const { method } = JSON.parse(init.body);
      calls.push(method);
      const results = {
        getGenesisHash: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
        getAccountInfo: { context: { slot: 123456 }, value: {
          executable: false, owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
          data: { parsed: { type: "mint", info: { isInitialized: true,
            mintAuthority: scenario === "unsafe-proof" ? POOL : null, freezeAuthority: null,
            decimals: 9, supply: "5000000000000000" } } },
        } },
        getBlockTime: Date.parse(FIXTURE_TIME) / 1000,
      };
      assert.ok(Object.hasOwn(results, method), `Unexpected fixture RPC method ${method}`);
      return { jsonrpc: "2.0", id: 1, result: results[method] };
    },
  });
  assert.equal(security.snapshotTimestampVerified, true);
  project.securityEvidence = [security];
  const quoteTime = scenario === "expired-proof" ? Date.parse(FIXTURE_TIME) - 7_200_000 : Date.parse(FIXTURE_TIME);
  const executionRecovery = {
    env: {}, jupiterApiKey: "", zeroxApiKey: "", lifiEnabled: false, raydiumEnabled: true,
    now: () => new Date(quoteTime), tradeSizesUsd: [25],
    raydiumRateBudget: { startedAt: null, requests: 0, retryAt: 0 },
    fetchJson: async (url, init) => {
      assert.equal(init.adapter, "raydium");
      const params = new URL(url).searchParams;
      const inputMint = params.get("inputMint"), outputMint = params.get("outputMint");
      calls.push(inputMint === USDC ? "buy-quote" : "sell-quote");
      if (scenario === "missing-proof" && inputMint === TOKEN) return { success: false };
      return { success: true, id: `offline-${calls.length}`, data: {
        swapType: "BaseIn", inputMint, outputMint, inputAmount: params.get("amount"),
        outputAmount: inputMint === USDC ? "1000000000" : "24750000",
        otherAmountThreshold: inputMint === USDC ? "990000000" : "24502500",
        slippageBps: 100, routePlan: [{ poolId: POOL, inputMint, outputMint }],
      } };
    },
  };
  if (scenario === "expired-proof") {
    const recovered = await recoverSolanaRaydiumRoute(project, executionRecovery);
    assert.equal(recovered.status, "ROUTE_RECOVERED");
    project.executionProofRecoveryRoute = recovered.route;
  }
  return { projects: [project], calls, executionRecovery, discovery: {
    targetCandidates: 1, acceptedCount: 1,
    sourceReports: Object.fromEntries(["dexscreener", "geckoterminal", "github", "defillama"].map(source =>
      [source, { status: "SUCCESS", returnedUsefulData: true, usefulRecordCount: 1,
        artifactClass: "TEST", evidenceMode: "OFFLINE_FIXTURE" }])),
  } };
}
