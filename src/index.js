// src/index.js

/**
 * Crypto Launch Intelligence
 * Runnable Entry Point
 */

import {
  runIntelligencePipeline,
  summarizePipelineResults
} from "./intelligencePipeline.js";

const sampleProjects = [
  {
    name: "Example AI Protocol",
    symbol: "XAIP",
    chain: "Base",
    description: "AI agent infrastructure for on-chain automation.",
    website: "https://example.com",
    github: "https://github.com/example/project",

    followers: 12500,
    followersNow: 12500,
    followersPrevious: 9000,
    socialMentionsNow: 420,
    socialMentionsPrevious: 120,

    liquidityUsd: 185000,
    previousLiquidityUsd: 120000,
    liquidityGrowth24h: 35,
    volume24h: 310000,
    previousVolume24h: 150000,
    volumeChange24h: 106,

    holders: 2400,
    holdersNow: 2400,
    holdersPrevious: 1300,
    uniqueBuyers24h: 380,

    buyTransactions24h: 920,
    sellTransactions24h: 420,
    buyVolume24h: 210000,
    sellVolume24h: 100000,

    whaleBuys24h: 7,
    whaleSells24h: 2,
    whaleBuyVolumeUsd: 76000,
    whaleSellVolumeUsd: 18000,

    smartWalletBuys24h: 4,
    smartWalletSells24h: 1,
    smartWalletBuyVolumeUsd: 42000,
    smartWalletSellVolumeUsd: 8000,
    previousSmartWalletBuys24h: 1,
    previousSmartWalletNetFlowUsd: 5000,

    commits30d: 38,
    previousCommits30d: 18,
    contributors: 6,
    releases: 2,

    priceChange6h: 8,
    priceChange24h: 18,
    marketChange24h: 2,
    sectorChange24h: 5,
    chainChange24h: 4,
    narrativeChange24h: 7,

    currentRange24h: 32,
    previousRange24h: 14,
    atrNow: 18,
    atrPrevious: 10,

    tgeDate: "2026-07-15",
    partnerships: ["Base ecosystem integration"],
    integrations: ["wallet", "sdk"],
    fundingRaisedUsd: 2500000,
    backers: ["Coinbase Ventures"],

    circulatingSupply: 250000000,
    totalSupply: 500000000,
    marketCap: 2500000,
    fdv: 5000000,
    teamAllocation: 15,
    vestingMonths: 36
  }
];

const results = runIntelligencePipeline(sampleProjects);
const summary = summarizePipelineResults(results);

console.log("Crypto Launch Intelligence");
console.log("==========================");
console.log(JSON.stringify(summary, null, 2));
console.log("");
console.log("Top Results:");
console.log(JSON.stringify(results.slice(0, 5), null, 2));// src/index.js

/**
 * Crypto Launch Intelligence
 * Runnable Entry Point
 */

import {
  runIntelligencePipeline,
  summarizePipelineResults
} from "./intelligencePipeline.js";

const sampleProjects = [
  {
    name: "Example AI Protocol",
    symbol: "XAIP",
    chain: "Base",
    description: "AI agent infrastructure for on-chain automation.",
    website: "https://example.com",
    github: "https://github.com/example/project",

    followers: 12500,
    followersNow: 12500,
    followersPrevious: 9000,
    socialMentionsNow: 420,
    socialMentionsPrevious: 120,

    liquidityUsd: 185000,
    previousLiquidityUsd: 120000,
    liquidityGrowth24h: 35,
    volume24h: 310000,
    previousVolume24h: 150000,
    volumeChange24h: 106,

    holders: 2400,
    holdersNow: 2400,
    holdersPrevious: 1300,
    uniqueBuyers24h: 380,

    buyTransactions24h: 920,
    sellTransactions24h: 420,
    buyVolume24h: 210000,
    sellVolume24h: 100000,

    whaleBuys24h: 7,
    whaleSells24h: 2,
    whaleBuyVolumeUsd: 76000,
    whaleSellVolumeUsd: 18000,

    smartWalletBuys24h: 4,
    smartWalletSells24h: 1,
    smartWalletBuyVolumeUsd: 42000,
    smartWalletSellVolumeUsd: 8000,
    previousSmartWalletBuys24h: 1,
    previousSmartWalletNetFlowUsd: 5000,

    commits30d: 38,
    previousCommits30d: 18,
    contributors: 6,
    releases: 2,

    priceChange6h: 8,
    priceChange24h: 18,
    marketChange24h: 2,
    sectorChange24h: 5,
    chainChange24h: 4,
    narrativeChange24h: 7,

    currentRange24h: 32,
    previousRange24h: 14,
    atrNow: 18,
    atrPrevious: 10,

    tgeDate: "2026-07-15",
    partnerships: ["Base ecosystem integration"],
    integrations: ["wallet", "sdk"],
    fundingRaisedUsd: 2500000,
    backers: ["Coinbase Ventures"],

    circulatingSupply: 250000000,
    totalSupply: 500000000,
    marketCap: 2500000,
    fdv: 5000000,
    teamAllocation: 15,
    vestingMonths: 36
  }
];

const results = runIntelligencePipeline(sampleProjects);
const summary = summarizePipelineResults(results);

console.log("Crypto Launch Intelligence");
console.log("==========================");
console.log(JSON.stringify(summary, null, 2));
console.log("");
console.log("Top Results:");
console.log(JSON.stringify(results.slice(0, 5), null, 2));
