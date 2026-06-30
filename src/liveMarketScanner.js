// src/liveMarketScanner.js

import {
  discoverLiveMarketProjects,
  filterLiveCandidates
} from "./engines/liveMarketDiscoveryEngine.js";

import {
  runIntelligencePipeline,
  summarizePipelineResults
} from "./intelligencePipeline.js";

const discovered = await discoverLiveMarketProjects({
  maxTokens: Number(process.env.MAX_TOKENS || 50)
});

const candidates = filterLiveCandidates(discovered, {
  minLiquidity: Number(process.env.MIN_LIQUIDITY || 10000),
  minVolume24h: Number(process.env.MIN_VOLUME_24H || 5000)
});

const results = runIntelligencePipeline(candidates);
const summary = summarizePipelineResults(results);

const report = {
  scannedAt: new Date().toISOString(),
  source: "live-market",
  discoveredProjects: discovered.length,
  scannedCandidates: candidates.length,
  summary,
  topResults: results.slice(0, 25)
};

console.log(JSON.stringify(report, null, 2));
