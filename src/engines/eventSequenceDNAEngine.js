import { canonicalIdentityKey, num } from "../edge/edgeMath.js";

function tokenFor(row = {}) {
  const tokens = [];
  if (num(row.projectClockScore) >= 60) tokens.push("PROJECT_CHANGE");
  if (num(row.capitalClockScore) >= 55) tokens.push("CAPITAL_FORMING");
  if (row.divergenceState === "PRE_CONSENSUS_DIVERGENCE") tokens.push("PRE_CONSENSUS");
  if (row.structuralBreakState === "MULTIVARIATE_STRUCTURAL_BREAK") tokens.push("STRUCTURAL_BREAK");
  if (num(row.leadStage) >= 4) tokens.push("BUYER_ACCELERATION");
  if (num(row.attentionClockScore) >= 55) tokens.push("ATTENTION_EXPANSION");
  if (num(row.leadStage) >= 6) tokens.push("PRICE_BREAKOUT");
  return tokens;
}

function compactSequence(rows = []) {
  const sequence = [];
  for (const row of rows) {
    for (const token of tokenFor(row)) {
      if (sequence.at(-1) !== token && !sequence.includes(token)) sequence.push(token);
    }
  }
  return sequence;
}

function levenshtein(left = [], right = []) {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
    }
  }
  return matrix[left.length][right.length];
}

function similarity(left = [], right = []) {
  const denominator = Math.max(left.length, right.length, 1);
  return 1 - levenshtein(left, right) / denominator;
}

export function buildHistoricalSequences(observations = [], lab = {}) {
  const byProject = new Map();
  for (const row of Array.isArray(observations) ? observations : []) {
    if (!row.identityKey) continue;
    byProject.set(row.identityKey, [...(byProject.get(row.identityKey) || []), row]);
  }
  const latestOutcomeByProject = new Map();
  for (const record of lab.records || []) {
    latestOutcomeByProject.set(record.identityKey, record);
  }

  return [...byProject.entries()].flatMap(([identityKey, rows]) => {
    rows.sort((a, b) => String(a.observedAt || "").localeCompare(String(b.observedAt || "")));
    const sequence = compactSequence(rows);
    if (sequence.length < 2) return [];
    const outcome = latestOutcomeByProject.get(identityKey);
    const outcome168 = outcome?.outcomes?.["168"] || null;
    return [{
      identityKey,
      symbol: rows.at(-1)?.symbol || null,
      sequence,
      success: outcome168?.firstThreshold === "UPSIDE",
      downsideFirst: outcome168?.firstThreshold === "DOWNSIDE",
      outcomeObserved: Boolean(outcome168?.observations),
    }];
  });
}

export function analyzeEventSequenceDNA(project = {}, options = {}) {
  const currentRows = [...(options.history || []), options.currentObservation || {}];
  const current = compactSequence(currentRows);
  const historical = Array.isArray(options.historicalSequences) ? options.historicalSequences : [];
  if (current.length < 2 || historical.length < 5) {
    return {
      ...project,
      eventSequenceDNA: {
        state: "INSUFFICIENT_SEQUENCE_HISTORY",
        currentSequence: current,
        bestSimilarity: null,
        analogCount: 0,
        shadowOnly: true,
      },
      eventSequenceSimilarity: 0,
    };
  }

  const analogs = historical
    .map((item) => ({ ...item, similarity: similarity(current, item.sequence) }))
    .filter((item) => item.similarity >= 0.45)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 20);
  const resolved = analogs.filter((item) => item.outcomeObserved);
  const successRate = resolved.length ? resolved.filter((item) => item.success).length / resolved.length : null;
  const best = analogs[0]?.similarity ?? null;
  const state = analogs.length < 5
    ? "FEW_ANALOGS"
    : best >= 0.85 && successRate !== null && successRate >= 0.6
      ? "HIGH_SIMILARITY_WINNER_SEQUENCE"
      : best >= 0.7
        ? "SEQUENCE_ANALOG_WATCH"
        : "LOW_SEQUENCE_SIMILARITY";

  return {
    ...project,
    eventSequenceDNA: {
      state,
      currentSequence: current,
      bestSimilarity: best === null ? null : Math.round(best * 100),
      analogCount: analogs.length,
      resolvedAnalogCount: resolved.length,
      successRatePct: successRate === null ? null : Math.round(successRate * 100),
      analogs: analogs.slice(0, 8).map((item) => ({
        identityKey: item.identityKey,
        symbol: item.symbol,
        similarityPct: Math.round(item.similarity * 100),
        success: item.success,
        downsideFirst: item.downsideFirst,
        sequence: item.sequence,
      })),
      shadowOnly: true,
      rankingInfluence: false,
    },
    eventSequenceSimilarity: best === null ? 0 : Math.round(best * 100),
  };
}
