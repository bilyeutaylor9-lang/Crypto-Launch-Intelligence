import test from "node:test";
import assert from "node:assert/strict";

import { attachStrictCandidateGate, resolveStrictCandidateGate } from "../src/execution/routeResolver.js";
import { classifyNativeAssetVariant } from "../src/identity/nativeAssetRegistry.js";

// Offline syntax fixtures, not assertions that these assets or pools exist.
const MINT = "HKZDfZnkHZxd9agRDNPyDv4iT6LmAurJnpRtj9wpump";
const OTHER_MINT = `h${MINT.slice(1)}`;
const POOL = "23KXjwkcexVwhHqF7Ys7sKyUzC9Ezw7pwKMvPzTPDwqg";
const OTHER_POOL = "BPM1GwKB5xfjDLY1ftZ4o3M1AMxmMs9BbgfDoLPgGh2K";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const WSOL = "So11111111111111111111111111111111111111112";

function recoveredCandidate(label = "token-profile") {
  const timestamp = new Date(Date.now() - 1000).toISOString();
  const expiresAt = new Date(Date.now() + 29_000).toISOString();
  const route = {
    venue: "Raydium", dexName: "Raydium", routeType: "DEX", chain: "solana", chainId: 101,
    tokenAddress: MINT, contractAddress: MINT, baseTokenAddress: MINT,
    poolAddress: POOL, pairAddress: POOL, quoteTokenAddress: USDC,
    exactIdentityVerified: true, buyQuoteVerified: true, sellQuoteVerified: true,
    quoteTimestamp: timestamp, quoteExpiresAt: expiresAt, quoteAgeSeconds: 1,
    buyQuote: { verified: true, timestamp, expiresAt, inputMint: USDC, outputMint: MINT,
      routePoolAddresses: [POOL] },
    sellQuote: { verified: true, timestamp, expiresAt, inputMint: MINT, outputMint: USDC,
      routePoolAddresses: [POOL] },
    liquidityUsd: 100_000, volume24hUsd: 10_000,
    estimatedRoundTripSlippagePct: 0.5, slippageIsHeuristic: false,
    status: "VERIFIED", supportingSources: ["raydium"],
  };
  return {
    name: "Utility Candidate", symbol: "UTIL", chain: "solana", chainId: 101,
    tokenAddress: MINT, contractAddress: MINT, baseTokenAddress: MINT,
    poolAddress: POOL, pairAddress: POOL, quoteTokenAddress: USDC,
    dexName: label, dex: label, source: "dexscreener", discoverySources: ["dexscreener"],
    liquidityUsd: 100_000, volume24hUsd: 10_000, quoteTimestamp: timestamp, quoteExpiresAt: expiresAt,
    buyQuoteVerified: true, sellQuoteVerified: true, exactIdentityVerified: true,
    estimatedRoundTripSlippagePct: 0.5, slippageIsHeuristic: false,
    executionProof: { ...route, routeTruthStatus: "LIVE_EXECUTION_READY", quoteFreshnessSeconds: 1 },
    canonicalExecutionRoute: { ...route },
    executionProofRecoveryRoute: { ...route, source: "raydium", verificationStatus: "VERIFIED_PROVIDER_OBSERVATION" },
  };
}

test("exact current recovered venue supersedes discovery profile/boost placeholders", () => {
  for (const label of ["token-profile", "token-boost"]) {
    const project = recoveredCandidate(label);
    const gate = resolveStrictCandidateGate(project);
    assert.equal(gate.dexName, "Raydium");
    assert.equal(gate.strictRankEligible, true);
    assert.equal(project.dexName, label);
  }
});

test("compact current proof derives the quote asset from matching retained legs", () => {
  const project = recoveredCandidate();
  delete project.executionProof.quoteTokenAddress;
  project.executionProof.quoteAsset = { address: WSOL };
  assert.equal(resolveStrictCandidateGate(project).dexName, "Raydium");
  assert.equal(resolveStrictCandidateGate(project).strictRankEligible, true);
});

test("stale, foreign, conflicting, or forged recovered venues cannot clear strict gates", () => {
  const cases = [
    (p) => { for (const route of [p.executionProof, p.canonicalExecutionRoute, p.executionProofRecoveryRoute]) {
      route.quoteExpiresAt = new Date(Date.now() - 1).toISOString();
    } },
    (p) => { p.tokenAddress = OTHER_MINT; p.contractAddress = OTHER_MINT; p.baseTokenAddress = OTHER_MINT; },
    (p) => { p.poolAddress = OTHER_POOL; p.pairAddress = OTHER_POOL; },
    (p) => { p.chainId = 8453; },
    (p) => { p.contractAddress = OTHER_MINT; },
    (p) => { p.executionProof.contractAddress = OTHER_MINT; },
    (p) => { p.executionProof.sellQuoteVerified = false; },
    (p) => { for (const route of [p.executionProof, p.canonicalExecutionRoute, p.executionProofRecoveryRoute]) {
      route.venue = "Raydium-impostor"; route.dexName = "Raydium-impostor";
    } },
    (p) => { p.executionProof.venue = "Uniswap"; },
    (p) => { p.executionProof.buyQuote = { ...p.executionProof.buyQuote, outputMint: OTHER_MINT }; },
    (p) => { p.executionProof.buyQuote = { ...p.executionProof.buyQuote, routePoolAddresses: [OTHER_POOL] }; },
    (p) => { delete p.executionProof.buyQuote; delete p.executionProof.sellQuote;
      delete p.canonicalExecutionRoute.buyQuote; delete p.canonicalExecutionRoute.sellQuote;
      delete p.executionProofRecoveryRoute.buyQuote; delete p.executionProofRecoveryRoute.sellQuote; },
  ];
  cases.forEach((change, index) => {
    const project = recoveredCandidate();
    change(project);
    const gate = resolveStrictCandidateGate(project);
    assert.equal(gate.strictRankEligible, false, `case ${index}`);
    assert.notEqual(gate.dexName, "Raydium", `case ${index}`);
  });
});

test("an already identified venue keeps its identity but cannot override expiry or safety", () => {
  const project = recoveredCandidate("Raydium");
  assert.equal(resolveStrictCandidateGate(project).strictRankEligible, true);
  assert.equal(resolveStrictCandidateGate({ ...project, sellRestricted: true }).strictRankEligible, false);
  const stale = structuredClone(project);
  stale.executionProof.quoteExpiresAt = new Date(Date.now() - 1).toISOString();
  assert.equal(resolveStrictCandidateGate(stale).strictRankEligible, false);
});

test("compact recovery attestations require exact identity and cannot conceal contradictory legs", () => {
  const compact = recoveredCandidate();
  delete compact.executionProof;
  for (const route of [compact.canonicalExecutionRoute, compact.executionProofRecoveryRoute]) {
    Object.assign(route, { venue: "Jupiter", dexName: "Jupiter", routeType: "DEX_AGGREGATOR",
      source: "jupiter", executionRecoverySource: "jupiter", quoteVerified: true,
      identityVerificationState: "EXACT_CHAIN_CONTRACT_POOL_ATTESTED", routePoolAddresses: [POOL] });
    route.buyQuote = { verified: true, timestamp: route.quoteTimestamp, outAmount: "100", routePlanCount: 1 };
    route.sellQuote = { verified: true, timestamp: route.quoteTimestamp, outAmount: "99", routePlanCount: 1 };
  }
  assert.equal(resolveStrictCandidateGate(compact).dexName, "Jupiter");
  assert.equal(resolveStrictCandidateGate(compact).strictRankEligible, true);
  for (const change of [
    (route) => { route.identityVerificationState = "EXACT_CHAIN_CONTRACT_ONLY_POOL_UNATTESTED"; },
    (route) => { route.routePoolAddresses = [OTHER_POOL]; },
    (route) => { route.buyQuote.outputMint = OTHER_MINT; },
    (route) => { route.sellQuote.inputMint = OTHER_MINT; },
    (route) => { route.sellQuote.routePoolAddresses = [OTHER_POOL]; },
    (route) => { route.quoteExpiresAt = new Date(Date.now() - 1).toISOString(); },
  ]) {
    const invalid = structuredClone(compact);
    change(invalid.canonicalExecutionRoute);
    change(invalid.executionProofRecoveryRoute);
    assert.equal(resolveStrictCandidateGate(invalid).strictRankEligible, false);
  }
});

test("independently proven EVM and CEX venues retain existing strict-gate semantics", () => {
  const token = "0x1111111111111111111111111111111111111111";
  const pool = "0x2222222222222222222222222222222222222222";
  const quote = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const evm = { ...recoveredCandidate("Uniswap v3"), chain: "base", chainId: 8453,
    tokenAddress: token, contractAddress: token, baseTokenAddress: token,
    poolAddress: pool, pairAddress: pool, quoteTokenAddress: quote };
  delete evm.executionProof;
  delete evm.canonicalExecutionRoute;
  delete evm.executionProofRecoveryRoute;
  assert.equal(resolveStrictCandidateGate(evm).strictRankEligible, true);
  const cex = { ...evm, dexName: "Kraken", dex: "Kraken", exchange: "Kraken", routeType: "CEX",
    marketPair: "UTIL-USDT", listingVerified: true, exchangeAssetId: "UTIL",
    regionStatus: "CONFIRMED_AVAILABLE", orderBookDepthUsd: 100_000 };
  assert.equal(resolveStrictCandidateGate(cex).strictRankEligible, true);
  assert.equal(resolveStrictCandidateGate({ ...cex, regionStatus: "UNKNOWN" }).strictRankEligible, false);
});

test("registered canonical venue aliases survive exact allowlisting without impostor substrings", () => {
  for (const venue of ["Raydium AMM", "Raydium CLMM", "Uniswap V2", "Uniswap V4", "Uni V3",
    "Aerodrome Slipstream", "Pancake V3", "Orca Whirlpool", "0x Protocol", "Gate.io",
    "Coinbase Exchange", "Coinbase Advanced Trade", "GDAX", "Kraken Pro", "OKEx", "Binance.US"]) {
    const project = recoveredCandidate(venue);
    project.regionStatus = "CONFIRMED_AVAILABLE";
    project.marketPair = "UTIL-USDT";
    assert.equal(resolveStrictCandidateGate(project).strictRankEligible, true, venue);
  }
  for (const venue of ["Raydium-impostor", "fake Coinbase Exchange", "Kraken Pro unofficial",
    "evil-uniswap-v3", "not-gate.io", "Binance.US-copy", "Kraken v3", "Coinbase v2"]) {
    assert.equal(resolveStrictCandidateGate(recoveredCandidate(venue)).strictRankEligible, false, venue);
  }
});

test("registered CEX proper names retain CEX routing and cannot skip regional proof", () => {
  for (const venue of ["Coinbase Exchange", "GDAX", "Kraken Pro", "Gate.io", "Binance.US", "OKEx"]) {
    const project = recoveredCandidate(venue);
    delete project.canonicalExecutionRoute;
    delete project.executionProofRecoveryRoute;
    Object.assign(project, { marketPair: "UTIL-USDT", regionStatus: "CONFIRMED_AVAILABLE",
      orderBookDepthVerified: true, orderBookDepthUsd: 100_000 });
    const gate = resolveStrictCandidateGate(project);
    assert.equal(gate.routeType, "CEX", venue);
    assert.equal(gate.strictRankEligible, true, venue);
    assert.equal(resolveStrictCandidateGate({ ...project, regionStatus: "UNKNOWN" }).strictRankEligible, false, venue);
  }
});

test("unknown or conflicting SOL mint never becomes a native benchmark by ticker or wrapper flag", () => {
  for (const overrides of [
    { tokenAddress: MINT },
    { tokenAddress: MINT, wrappedAssetVerified: true, name: "Wrapped Solana" },
    { tokenAddress: WSOL, contractAddress: MINT },
    { tokenAddress: WSOL, baseTokenAddress: MINT },
    { tokenAddress: WSOL.toLowerCase() },
    { tokenAddress: WSOL, chainId: 8453 },
    { tokenAddress: WSOL, normalizedChain: "base" },
    { tokenAddress: WSOL, chain: "base", canonicalChain: "solana" },
    {},
  ]) {
    const project = { name: "Solana", symbol: "SOL", chain: "solana", ...overrides };
    assert.equal(classifyNativeAssetVariant(project).benchmarkLane, null, JSON.stringify(overrides));
    assert.equal(resolveStrictCandidateGate(project).strictRankEligible, false);
    assert.notEqual(resolveStrictCandidateGate(project).strictCandidateLane, "MARKET_BENCHMARK");
  }
});

test("cached symbol-only native labels remain historical diagnostics, not active benchmark proof", () => {
  const cachedVariant = { isEstablishedNativeAsset: true, observedChain: "solana", nativeChain: "solana",
    benchmarkLane: "MARKET_BENCHMARK", variantType: "NATIVE", quarantineReason: null };
  const project = { ...recoveredCandidate(), name: "Solana", symbol: "SOL",
    nativeAssetVariant: cachedVariant, marketBenchmarkLane: "MARKET_BENCHMARK",
    strictCandidateLane: "MARKET_BENCHMARK", routeVerificationStatus: "MARKET_BENCHMARK",
    strictCandidateGate: { nativeAssetVariant: cachedVariant, marketBenchmarkLane: "MARKET_BENCHMARK",
      strictCandidateLane: "MARKET_BENCHMARK" },
    rawCandidate: { nativeAssetVariant: cachedVariant, marketBenchmarkLane: "MARKET_BENCHMARK" } };
  assert.equal(classifyNativeAssetVariant(project).benchmarkLane, null);
  const attached = attachStrictCandidateGate(project);
  for (const active of [attached, attached.strictCandidateGate]) {
    assert.equal(active.marketBenchmarkLane, null);
    assert.equal(active.nativeAssetVariant.benchmarkLane, null);
    assert.equal(active.nativeAssetVariant.isEstablishedNativeAsset, false);
    assert.equal(active.strictCandidateLane, "QUARANTINED_IDENTITY_OR_ROUTE");
    assert.equal(active.strictRankEligible, false);
    assert.ok(active.candidateQuarantineReasons.includes("NATIVE_ASSET_MISMATCH"));
    assert.notEqual(active.routeVerificationStatus, "MARKET_BENCHMARK");
  }
  assert.equal(attached.rawCandidate.marketBenchmarkLane, "MARKET_BENCHMARK");
  assert.equal(project.marketBenchmarkLane, "MARKET_BENCHMARK");
});

test("known exact native wrappers retain benchmark identity and EVM case normalization", () => {
  for (const project of [
    { symbol: "SOL", chain: "solana", tokenAddress: WSOL },
    { symbol: "WSOL", chain: "solana", tokenAddress: WSOL },
    { symbol: "ETH", chain: "ethereum", tokenAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
    { symbol: "BNB", chain: "bsc", tokenAddress: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" },
  ]) {
    assert.equal(classifyNativeAssetVariant(project).benchmarkLane, "MARKET_BENCHMARK", project.symbol);
    assert.equal(resolveStrictCandidateGate(project).strictRankEligible, false);
  }
});

test("native CEX benchmarks require independently verified listing identity, not a ticker", () => {
  const native = { name: "Solana", symbol: "SOL", chain: "solana", routeType: "CEX",
    source: "kraken", exchange: "Kraken Pro", exchangeAssetId: "kraken:SOL", marketPair: "SOL-USD", listingVerified: true };
  assert.equal(classifyNativeAssetVariant(native).benchmarkLane, "MARKET_BENCHMARK");
  for (const overrides of [{ listingVerified: false }, { exchangeAssetId: "OTHER" }, { tokenAddress: MINT }]) {
    assert.equal(classifyNativeAssetVariant({ ...native, ...overrides }).benchmarkLane, null);
  }
});

test("unsupported or conflicting CEX claims cannot establish native identity from listing flags", () => {
  const native = { name: "Solana", symbol: "SOL", chain: "solana", routeType: "CEX",
    source: "kraken", exchange: "Kraken", exchangeAssetId: "kraken:SOL", marketPair: "SOL-USD", listingVerified: true };
  for (const overrides of [
    { exchange: "Arbitrary Exchange", source: "arbitrary", exchangeAssetId: "SOL" },
    { exchange: "Kraken-impostor", source: "kraken-impostor", exchangeAssetId: "kraken-impostor:SOL" },
    { exchange: "Raydium", source: "raydium", exchangeAssetId: "raydium:SOL" },
    { source: "unknown" },
    { provider: "coinbase" },
    { source: undefined },
    { exchangeAssetId: "SOL" },
    { exchangeAssetId: "coinbase:SOL" },
    { verifiedExchangeAssetId: "kraken:OTHER" },
    { marketPair: "OTHER-USD" },
    { venue: "Coinbase" },
    { exchangeListingVerified: false },
  ]) {
    const project = { ...native, ...overrides };
    assert.equal(classifyNativeAssetVariant(project).benchmarkLane, null, JSON.stringify(overrides));
    assert.notEqual(attachStrictCandidateGate(project).marketBenchmarkLane, "MARKET_BENCHMARK");
  }
  for (const [source, exchange] of [["coinbase", "Coinbase Exchange"], ["kraken", "Kraken Pro"],
    ["binance_us", "Binance.US"], ["gate", "Gate.io"]]) {
    assert.equal(classifyNativeAssetVariant({ ...native, source, exchange,
      exchangeAssetId: `${source}:SOL` }).benchmarkLane, "MARKET_BENCHMARK", exchange);
  }
});
