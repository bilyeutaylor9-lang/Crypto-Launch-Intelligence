// src/engines/sourceReliabilityEngine.js

import { loadScanMemory } from "../learning/scanMemoryStore.js";

const BASE_SOURCE_SCORES = {
  dexscreener: 76,
  geckoterminal: 74,
  coingecko: 68,
  "coingecko-trending": 70,
  coinpaprika: 62,
  coinlore: 58,
  coincap: 58,
  defillama: 72,
  "defillama-yields": 70,
  "defillama-stablecoins": 66,
  "dexscreener-search": 63,
  "google-news": 52,
  birdeye: 78,
  binance: 55,
  kucoin: 57,
  coinbase: 60,
  kraken: 60,
  okx: 56,
  bybit: 56,
  gate: 54,
  mexc: 52,
  bitget: 54,
  htx: 52,
  bitfinex: 55,
  bitstamp: 58,
  gemini: 58,
  "research-seed": 35,
};

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function sourceStats() {
  const stats = new Map();

  for (const record of loadScanMemory().slice(-5000)) {
    const sources = record.discoverySources?.length
      ? record.discoverySources
      : [record.source].filter(Boolean);
    const score = num(record.scores?.pipeline);
    const risk = num(record.scores?.risk);
    const useful = score >= 55 || record.labels?.allocationBucket === "Priority Research";
    const trap = risk >= 70 || (record.signals?.riskFlags || []).length >= 3;

    for (const source of sources) {
      const key = String(source || "unknown").toLowerCase();
      const current = stats.get(key) || { samples: 0, useful: 0, traps: 0 };
      current.samples += 1;
      current.useful += useful ? 1 : 0;
      current.traps += trap ? 1 : 0;
      stats.set(key, current);
    }
  }

  return stats;
}

function reliabilityForSource(source = "", stats = new Map()) {
  const key = String(source || "unknown").toLowerCase();
  const base = BASE_SOURCE_SCORES[key] ?? 45;
  const stat = stats.get(key);

  if (!stat || stat.samples < 10) {
    return {
      source: key,
      score: base,
      samples: stat?.samples || 0,
      usefulRate: null,
      trapRate: null,
    };
  }

  const usefulRate = stat.useful / Math.max(1, stat.samples);
  const trapRate = stat.traps / Math.max(1, stat.samples);
  const score = Math.round(Math.max(15, Math.min(95, base * 0.55 + usefulRate * 55 - trapRate * 35)));

  return {
    source: key,
    score,
    samples: stat.samples,
    usefulRate: Number((usefulRate * 100).toFixed(1)),
    trapRate: Number((trapRate * 100).toFixed(1)),
  };
}

export function analyzeSourceReliabilityBatch(projects = []) {
  const stats = sourceStats();

  return projects.map((project) => {
    const sources = [
      ...(project.discoverySources || []),
      project.source,
    ]
      .filter(Boolean)
      .map((source) => String(source).toLowerCase());
    const uniqueSources = [...new Set(sources)];
    const reliabilities = uniqueSources.map((source) => reliabilityForSource(source, stats));
    const score = Math.round(
      reliabilities.length
        ? reliabilities.reduce((sum, item) => sum + item.score, 0) / reliabilities.length
        : 45
    );

    return {
      ...project,
      sourceReliabilityScore: score,
      sourceReliability: {
        score,
        sources: reliabilities,
        summary: reliabilities.length
          ? `Average source reliability ${score} across ${reliabilities.length} source(s).`
          : "No discovery source reliability available.",
      },
    };
  });
}
