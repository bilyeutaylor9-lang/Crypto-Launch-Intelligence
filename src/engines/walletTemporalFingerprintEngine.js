import { clamp, mean, num } from "../edge/edgeMath.js";
import { normalizeWalletTemporalEvents } from "../data/edgeSignalNormalizers.js";

const TYPE_ALIASES = [
  [/CEX|EXCHANGE.*OUT|WITHDRAW/, "CEX_OUTFLOW"],
  [/BRIDGE/, "BRIDGE"],
  [/STABLE|USDC|USDT|DAI/, "STABLECOIN_TRANSFER"],
  [/APPROV/, "APPROVAL"],
  [/ROUTER|AGGREGATOR/, "ROUTER_INTERACTION"],
  [/LP.*ADD|ADD.*LIQ/, "LP_ADD"],
  [/LP.*REM|REMOVE.*LIQ|WITHDRAW.*LIQ/, "LP_REMOVE"],
  [/BUY|SWAP_IN/, "BUY"],
  [/SELL|SWAP_OUT/, "SELL"],
  [/TRANSFER/, "TRANSFER"],
];

function canonicalType(type = "") {
  const text = String(type || "").toUpperCase();
  return TYPE_ALIASES.find(([pattern]) => pattern.test(text))?.[1] || text || "OTHER";
}

function motifForWallet(events = []) {
  const compact = [];
  for (const event of events) {
    const type = canonicalType(event.type);
    if (compact.at(-1) !== type) compact.push(type);
  }
  return compact.slice(-12);
}

function preparationScore(motif = []) {
  const set = new Set(motif);
  let score = 0;
  if (set.has("CEX_OUTFLOW")) score += 20;
  if (set.has("BRIDGE")) score += 14;
  if (set.has("STABLECOIN_TRANSFER")) score += 15;
  if (set.has("APPROVAL")) score += 14;
  if (set.has("ROUTER_INTERACTION")) score += 12;
  if (set.has("LP_ADD")) score += 10;
  if (set.has("BUY")) score += 15;
  if (set.has("SELL") && !set.has("BUY")) score -= 15;
  if (set.has("LP_REMOVE")) score -= 20;
  return clamp(score);
}

function circularityRisk(events = []) {
  const pairs = new Map();
  for (const event of events) {
    if (!event.wallet || !event.counterparty) continue;
    const forward = `${event.wallet}->${event.counterparty}`;
    const reverse = `${event.counterparty}->${event.wallet}`;
    pairs.set(forward, (pairs.get(forward) || 0) + 1);
    if (pairs.has(reverse)) return 75;
  }
  return 0;
}

export function analyzeWalletTemporalFingerprint(project = {}) {
  const events = normalizeWalletTemporalEvents(project);
  if (!events.length) {
    return {
      ...project,
      walletTemporalFingerprint: {
        state: "UNOBSERVED",
        evidenceMode: "NO_RAW_WALLET_TEMPORAL_EVENTS",
        walletCount: 0,
        preparationScore: null,
        riskScore: null,
        motifs: [],
        shadowOnly: true,
      },
      walletTemporalFingerprintState: "UNOBSERVED",
      walletPreparationScore: 0,
    };
  }

  const byWallet = new Map();
  for (const event of events) {
    byWallet.set(event.wallet, [...(byWallet.get(event.wallet) || []), event]);
  }

  const motifs = [...byWallet.entries()].map(([wallet, rows]) => {
    const motif = motifForWallet(rows);
    return {
      wallet,
      motif,
      preparationScore: preparationScore(motif),
      eventCount: rows.length,
      netObservedUsd: rows.reduce((sum, row) => sum + (num(row.amountUsd) || 0), 0),
    };
  }).sort((a, b) => b.preparationScore - a.preparationScore);

  const prep = mean(motifs.slice(0, Math.min(10, motifs.length)).map((item) => item.preparationScore)) || 0;
  const circularRisk = circularityRisk(events);
  const repeatedMotifShare = motifs.length
    ? Math.max(...Object.values(motifs.reduce((acc, item) => {
        const key = item.motif.join(">");
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}))) / motifs.length
    : 0;
  const repeatedRisk = repeatedMotifShare >= 0.7 && motifs.length >= 4 ? 65 : repeatedMotifShare >= 0.5 ? 35 : 0;
  const riskScore = Math.round(Math.max(circularRisk, repeatedRisk));
  const state = riskScore >= 65
    ? "SYNTHETIC_OR_CIRCULAR_MOTIF_RISK"
    : prep >= 70
      ? "CAPITAL_PREPARATION_STRONG"
      : prep >= 50
        ? "CAPITAL_PREPARATION_DEVELOPING"
        : "NO_STRONG_PREPARATION_MOTIF";

  return {
    ...project,
    walletTemporalFingerprint: {
      state,
      evidenceMode: "RAW_TEMPORAL_EVENTS",
      walletCount: motifs.length,
      eventCount: events.length,
      preparationScore: Math.round(prep),
      riskScore,
      repeatedMotifShare: Number(repeatedMotifShare.toFixed(3)),
      motifs: motifs.slice(0, 12),
      shadowOnly: true,
    },
    walletTemporalFingerprintState: state,
    walletPreparationScore: Math.round(prep),
    walletTemporalRiskScore: riskScore,
  };
}

export function analyzeWalletTemporalFingerprintBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeWalletTemporalFingerprint);
}
