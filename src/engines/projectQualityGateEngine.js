// src/engines/projectQualityGateEngine.js

export const DEFAULT_PROJECT_QUALITY_RULES = {
  minLiquidityUsd: 25000,
  minVolume24h: 50000,
  minBuyTransactions24h: 10,
  maxSellPressureRatio: 0.8,
  minRichTokenScore: 25,
  requireChart: false,
  requirePairAddress: false,
  allowMissingTransactionData: true,
};

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function sellPressureRatio(project = {}) {
  const buys = num(project.buyTransactions24h);
  const sells = num(project.sellTransactions24h);
  const total = buys + sells;

  if (total <= 0) return null;
  return sells / total;
}

function hasTransactionData(project = {}) {
  return num(project.buyTransactions24h) > 0 || num(project.sellTransactions24h) > 0;
}

export function evaluateProjectQuality(
  project = {},
  rules = DEFAULT_PROJECT_QUALITY_RULES
) {
  const reasons = [];
  const warnings = [];
  const ratio = sellPressureRatio(project);
  const txDataAvailable = hasTransactionData(project);

  if (num(project.liquidityUsd ?? project.liquidity) < rules.minLiquidityUsd) {
    reasons.push(`Liquidity under $${rules.minLiquidityUsd}`);
  }

  if (num(project.volume24h ?? project.volume) < rules.minVolume24h) {
    reasons.push(`24h volume under $${rules.minVolume24h}`);
  }

  if (!txDataAvailable && rules.allowMissingTransactionData) {
    warnings.push("Transaction data missing; buy/sell checks skipped.");
  } else {
    if (num(project.buyTransactions24h) < rules.minBuyTransactions24h) {
      reasons.push(`Buy transactions under ${rules.minBuyTransactions24h}`);
    }

    if (ratio !== null && ratio > rules.maxSellPressureRatio) {
      reasons.push("Sell pressure too high");
    }
  }

  if (num(project.richTokenScore) > 0 && num(project.richTokenScore) < rules.minRichTokenScore) {
    reasons.push(`Rich token score under ${rules.minRichTokenScore}`);
  }

  if (rules.requireChart && !project.url) {
    reasons.push("Missing chart/source URL");
  }

  if (rules.requirePairAddress && !project.pairAddress) {
    reasons.push("Missing pair address");
  }

  const passed = reasons.length === 0;

  return {
    passed,
    reasons,
    warnings,
    sellPressureRatio: ratio,
    transactionDataAvailable: txDataAvailable,
  };
}

export function applyProjectQualityGate(projects = [], customRules = {}) {
  const rules = {
    ...DEFAULT_PROJECT_QUALITY_RULES,
    ...customRules,
  };

  const accepted = [];
  const rejected = [];

  for (const project of projects) {
    const quality = evaluateProjectQuality(project, rules);

    const enriched = {
      ...project,
      projectQualityPassed: quality.passed,
      projectQualityReasons: quality.reasons,
      projectQualityWarnings: quality.warnings,
      projectSellPressureRatio: quality.sellPressureRatio,
      projectTransactionDataAvailable: quality.transactionDataAvailable,

      intelligenceSignals: {
        ...(project.intelligenceSignals || {}),
        projectQualityGate: {
          passed: quality.passed,
          reasons: quality.reasons,
          warnings: quality.warnings,
          sellPressureRatio: quality.sellPressureRatio,
        },
      },

      evidence: [
        ...(project.evidence || []),
        {
          engine: "Project Quality Gate Engine",
          signal: "Minimum quality filter",
          score: quality.passed ? 100 : 0,
          confidence: 1,
          impact: quality.passed ? "Positive" : "Risk",
          reasons: quality.passed
            ? ["Project passed minimum quality gate."]
            : quality.reasons,
        },
      ],
    };

    if (quality.passed) accepted.push(enriched);
    else rejected.push(enriched);
  }

  return {
    rules,
    accepted,
    rejected,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
  };
}

export function analyzeProjectQualityGateBatch(projects = [], rules = {}) {
  const result = applyProjectQualityGate(projects, rules);
  return result.accepted;
}
