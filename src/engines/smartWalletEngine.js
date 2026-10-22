// src/engines/smartWalletEngine.js
import { measuredWalletNumber, produceMeasuredWalletFlowInputs } from "../data/measuredWalletFlow.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function measured(value) {
  return measuredWalletNumber(value) !== null;
}

function ratio(a = 0, b = 0) {
  if (!measured(a) || !measured(b)) return null;
  const x = num(a);
  const y = num(b);
  return y > 0 ? x / y : x;
}

export function calculateSmartWalletSignal(project = {}, options = {}) {
  const gated = project.smartWalletFlowProvenance !== undefined || project.smartWalletSignal?.provenance !== undefined ||
    project.ignitionRawSensors?.eventTape !== undefined || Object.keys(project.fieldProvenance || {})
      .some((field) => /^smartWallet(?:NetFlowUsd|BuyCount|SellCount|Buys24h|Sells24h|BuyVolumeUsd|SellVolumeUsd)$/.test(field));
  const flow = gated ? produceMeasuredWalletFlowInputs(project, options).measuredWalletFlow : null;
  const normalized = flow?.values;
  const smartWalletBuys24h = measuredWalletNumber(gated ? normalized.smartWalletBuyCount : project.smartWalletBuys24h, { count: true });
  const smartWalletSells24h = measuredWalletNumber(gated ? normalized.smartWalletSellCount : project.smartWalletSells24h, { count: true });
  const smartWalletBuyVolumeUsd = measuredWalletNumber(gated ? normalized.smartWalletBuyVolumeUsd : project.smartWalletBuyVolumeUsd);
  const smartWalletSellVolumeUsd = measuredWalletNumber(gated ? normalized.smartWalletSellVolumeUsd : project.smartWalletSellVolumeUsd);

  const smartWalletNetFlowUsd =
    gated ? normalized.smartWalletNetFlowUsd : smartWalletBuyVolumeUsd !== null && smartWalletSellVolumeUsd !== null
      ? smartWalletBuyVolumeUsd - smartWalletSellVolumeUsd : null;

  const smartWalletBuySellRatio = ratio(
    smartWalletBuys24h,
    smartWalletSells24h
  );

  const smartWalletVolumeRatio = ratio(
    smartWalletBuyVolumeUsd,
    smartWalletSellVolumeUsd
  );

  return {
    smartWalletBuys24h,
    smartWalletSells24h,
    smartWalletBuyVolumeUsd,
    smartWalletSellVolumeUsd,
    smartWalletNetFlowUsd,
    smartWalletBuySellRatio,
    smartWalletVolumeRatio,
    ...(flow?.sampleOnly ? { scope: "OBSERVED_QUALIFIED_SWAPS_ONLY", sampleOnly: true } : {}),
    ...((project.smartWalletFlowProvenance || project.smartWalletSignal?.provenance)
      ? { provenance: project.smartWalletFlowProvenance || project.smartWalletSignal.provenance } : {}),
  };
}

function buildReasons(signal = {}) {
  const reasons = [];

  if (signal.smartWalletBuys24h >= 5) {
    reasons.push("Multiple smart-wallet buys detected.");
  }

  if (signal.smartWalletNetFlowUsd > 25000) {
    reasons.push("Smart-wallet net inflow is materially positive.");
  } else if (signal.smartWalletNetFlowUsd > 5000) {
    reasons.push("Smart-wallet net inflow is positive.");
  }

  if (signal.smartWalletBuySellRatio >= 2) {
    reasons.push("Smart-wallet buys are outpacing sells.");
  }

  if (signal.smartWalletSells24h > signal.smartWalletBuys24h) {
    reasons.push("Smart-wallet sells are currently outpacing buys.");
  }

  if (!reasons.length) {
    reasons.push("No strong smart-wallet accumulation detected yet.");
  }

  return reasons;
}

export function scoreSmartWalletSignal(project = {}, options = {}) {
  const signal = calculateSmartWalletSignal(project, options);
  if (signal.sampleOnly) return null;
  if (![signal.smartWalletBuys24h, signal.smartWalletSells24h,
    signal.smartWalletNetFlowUsd, signal.smartWalletBuyVolumeUsd, signal.smartWalletSellVolumeUsd].some(measured)) return null;

  let score = 0;

  if (signal.smartWalletBuys24h >= 10) score += 35;
  else if (signal.smartWalletBuys24h >= 5) score += 25;
  else if (signal.smartWalletBuys24h >= 2) score += 15;

  if (signal.smartWalletNetFlowUsd > 100000) score += 35;
  else if (signal.smartWalletNetFlowUsd > 25000) score += 25;
  else if (signal.smartWalletNetFlowUsd > 5000) score += 15;

  if (signal.smartWalletBuySellRatio >= 5) score += 18;
  else if (signal.smartWalletBuySellRatio >= 2) score += 10;

  if (signal.smartWalletVolumeRatio >= 3) score += 12;
  else if (signal.smartWalletVolumeRatio >= 1.5) score += 6;

  if (signal.smartWalletSells24h > signal.smartWalletBuys24h) score -= 20;
  if (signal.smartWalletNetFlowUsd < 0) score -= 20;

  return clamp(Math.round(score));
}

export function analyzeSmartWallets(project = {}, options = {}) {
  options = { ...options, now: options.now ?? Date.now() };
  const smartWalletSignal = calculateSmartWalletSignal(project, options);
  const expectedFields = [
    "smartWalletBuys24h",
    "smartWalletSells24h",
    "smartWalletBuyVolumeUsd",
    "smartWalletSellVolumeUsd",
  ];
  const observedFields = expectedFields.filter((field) => measured(smartWalletSignal[field]));
  const smartWalletCoverage = {
    observedComponentCount: observedFields.length,
    expectedComponentCount: expectedFields.length,
    coveragePct: Math.round((observedFields.length / expectedFields.length) * 100),
    observedValues: Object.fromEntries(observedFields.map((field) => [field, Number(smartWalletSignal[field])])),
    missingValues: expectedFields.filter((field) => !observedFields.includes(field)),
    sourceFamilies: observedFields.length ? ["wallets"] : [],
  };

  if (smartWalletSignal.sampleOnly || (!observedFields.length &&
      measuredWalletNumber(smartWalletSignal.smartWalletNetFlowUsd, { signed: true }) === null)) {
    return produceMeasuredWalletFlowInputs({
      ...project,
      smartWalletSignal: project.smartWalletSignal?.provenance ? project.smartWalletSignal :
        smartWalletSignal.sampleOnly ? smartWalletSignal : null,
      smartWalletScore: null,
      smartWalletLevel: "unmeasured",
      smartWalletReasons: [smartWalletSignal.sampleOnly ? "Qualified swap samples do not establish daily wallet totals." :
        "Smart-wallet flow observations are unavailable."],
      smartWalletReason: "Smart-wallet flow remains unknown until wallet observations are recovered.",
      smartWalletCoverage,
      intelligenceSignals: {
        ...(project.intelligenceSignals || {}),
        smartWallet: {
          score: null,
          level: "unmeasured",
          signal: null,
          reasons: ["Smart-wallet flow observations are unavailable."],
          coverage: smartWalletCoverage,
        },
      },
    }, options);
  }

  const smartWalletScore = scoreSmartWalletSignal(project, options);
  const reasons = buildReasons(smartWalletSignal);

  const smartWalletLevel =
    smartWalletScore >= 85
      ? "institutional smart-wallet accumulation"
      : smartWalletScore >= 70
      ? "strong smart-wallet accumulation"
      : smartWalletScore >= 50
      ? "positive smart-wallet interest"
      : smartWalletScore >= 30
      ? "early smart-wallet signal"
      : "weak";

  return produceMeasuredWalletFlowInputs({
    ...project,

    smartWalletSignal: project.smartWalletSignal?.provenance ? project.smartWalletSignal : smartWalletSignal,
    smartWalletScore,
    smartWalletLevel,
    smartWalletReasons: reasons,
    smartWalletCoverage,
    smartWalletReason:
      smartWalletScore >= 50
        ? "High-signal wallets appear to be accumulating."
        : "No strong smart-wallet accumulation detected yet.",

    intelligenceSignals: {
      ...(project.intelligenceSignals || {}),
      smartWallet: {
        score: smartWalletScore,
        level: smartWalletLevel,
        signal: smartWalletSignal,
        reasons,
      },
    },

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Smart Wallet Engine",
        signal: "High-signal wallet accumulation",
        score: smartWalletScore,
        confidence: clamp(smartWalletScore / 100, 0, 1),
        impact:
          smartWalletScore >= 70
            ? "Strong Positive"
            : smartWalletScore >= 50
            ? "Positive"
            : "Neutral",
        reasons,
      },
    ],

    alerts: [
      ...(project.alerts || []),
      ...(smartWalletScore >= 85
        ? ["Institutional smart-wallet accumulation detected."]
        : smartWalletScore >= 70
        ? ["Strong smart-wallet accumulation detected."]
        : []),
    ],
  }, options);
}

export function analyzeSmartWalletBatch(projects = [], options = {}) {
  return projects
    .map((project) => analyzeSmartWallets(project, options))
    .sort(
      (a, b) => Number(b.smartWalletScore || 0) - Number(a.smartWalletScore || 0)
    );
}
