// src/index.js

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
    buyTransactions24h: 920,
    sellTransactions24h: 420,
    buyVolume24h: 210000,
    sellVolume24h: 100000,
    priceChange6h: 8,
    priceChange24h: 18,
    marketChange24h: 2,
    sectorChange24h: 5,
    chainChange24h: 4,
    narrativeChange24h: 7
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
