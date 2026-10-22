// src/engines/smartMoneyAccumulationEngine.js
import { measuredWalletNumber, produceMeasuredWalletFlowInputs } from "../data/measuredWalletFlow.js";

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function measured(value) {
  return measuredWalletNumber(value, { signed: true }) !== null;
}

export function analyzeSmartMoneyAccumulation(project = {}, options = {}) {
  project = produceMeasuredWalletFlowInputs(project, options);
  const inputs = project.measuredWalletFlow.effectiveValues;
  const expectedFields = [
    "smartWalletNetFlowUsd",
    "smartWalletBuyCount",
    "smartWalletSellCount",
    "accumulationDays",
  ];
  const observedFields = expectedFields.filter((field) => measured(inputs[field]));
  const smartMoneyAccumulationCoverage = {
    observedComponentCount: observedFields.length,
    expectedComponentCount: expectedFields.length,
    coveragePct: Math.round((observedFields.length / expectedFields.length) * 100),
    observedValues: Object.fromEntries(observedFields.map((field) => [field, Number(inputs[field])])),
    missingValues: expectedFields.filter((field) => !observedFields.includes(field)),
    sourceFamilies: observedFields.length ? ["wallet-flow"] : [],
  };

  const measuredCounts = measured(inputs.smartWalletBuyCount) && measured(inputs.smartWalletSellCount);
  if (project.measuredWalletFlow.sampleOnly || !observedFields.length || (!measured(inputs.smartWalletNetFlowUsd) &&
      !measured(inputs.accumulationDays) && !measuredCounts)) {
    return {
      ...project,
      smartMoneyAccumulationScore: null,
      smartMoneyAccumulationLevel: "unmeasured",
      smartMoneyAccumulationCoverage,
    };
  }

  const smartWalletNetFlow = num(inputs.smartWalletNetFlowUsd);
  const smartWalletBuys = num(inputs.smartWalletBuyCount);
  const smartWalletSells = num(inputs.smartWalletSellCount);
  const accumulationDays = num(inputs.accumulationDays);
  const holderGrowth = num(project.holderGrowthScore);
  const whaleRisk = num(project.whaleRiskScore);
  const volume24h = num(project.volume24h);
  const marketCap = num(project.marketCap);

  const buySellRatio =
    smartWalletSells > 0 ? smartWalletBuys / smartWalletSells : smartWalletBuys;

  const components = [
    measured(inputs.smartWalletNetFlowUsd)
      ? {
          score:
            marketCap > 0
              ? clamp((smartWalletNetFlow / marketCap) * 5000)
              : clamp(smartWalletNetFlow / 25_000),
          weight: 0.3,
        }
      : null,
    measuredCounts
      ? { score: clamp(buySellRatio * 20), weight: 0.25 }
      : null,
    measured(inputs.accumulationDays)
      ? { score: clamp(accumulationDays * 10), weight: 0.2 }
      : null,
    measured(project.holderGrowthScore)
      ? { score: clamp(holderGrowth), weight: 0.15 }
      : null,
    measured(project.volume24h) && measured(project.marketCap) && marketCap > 0
      ? { score: clamp((volume24h / marketCap) * 300), weight: 0.1 }
      : null,
  ].filter(Boolean);
  const observedWeight = components.reduce((sum, component) => sum + component.weight, 0);
  const whalePenalty = measured(project.whaleRiskScore) ? clamp(whaleRisk * 0.35) : 0;
  const smartMoneyAccumulationScore = clamp(
    components.reduce(
      (sum, component) => sum + component.score * component.weight,
      0
    ) /
      Math.max(observedWeight, 0.01) -
      whalePenalty
  );

  const smartMoneyAccumulationLevel =
    smartMoneyAccumulationScore >= 85
      ? "heavy smart money accumulation"
      : smartMoneyAccumulationScore >= 70
        ? "clear accumulation"
        : smartMoneyAccumulationScore >= 50
          ? "early accumulation"
          : "no strong accumulation";

  const alerts = [...(project.alerts || [])];

  if (smartMoneyAccumulationScore >= 80) {
    alerts.push("Smart money accumulation is strengthening.");
  }

  return {
    ...project,
    smartMoneyAccumulationScore,
    smartMoneyAccumulationLevel,
    smartMoneyAccumulationCoverage,
    alerts
  };
}

export function analyzeSmartMoneyAccumulationBatch(projects = [], options = {}) {
  return projects.map((project) => analyzeSmartMoneyAccumulation(project, options));
}
