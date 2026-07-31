// src/engines/smartWalletEngine.js

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function measured(value) {
  return value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));
}

function ratio(a = 0, b = 0) {
  const x = num(a);
  const y = num(b);
  return y > 0 ? x / y : x;
}

export function calculateSmartWalletSignal(project = {}) {
  const smartWalletBuys24h = num(project.smartWalletBuys24h);
  const smartWalletSells24h = num(project.smartWalletSells24h);
  const smartWalletBuyVolumeUsd = num(project.smartWalletBuyVolumeUsd);
  const smartWalletSellVolumeUsd = num(project.smartWalletSellVolumeUsd);

  const smartWalletNetFlowUsd =
    smartWalletBuyVolumeUsd - smartWalletSellVolumeUsd;

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

export function scoreSmartWalletSignal(project = {}) {
  const signal = calculateSmartWalletSignal(project);

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

export function analyzeSmartWallets(project = {}) {
  const expectedFields = [
    "smartWalletBuys24h",
    "smartWalletSells24h",
    "smartWalletBuyVolumeUsd",
    "smartWalletSellVolumeUsd",
  ];
  const observedFields = expectedFields.filter((field) => measured(project[field]));
  const smartWalletCoverage = {
    observedComponentCount: observedFields.length,
    expectedComponentCount: expectedFields.length,
    coveragePct: Math.round((observedFields.length / expectedFields.length) * 100),
    observedValues: Object.fromEntries(observedFields.map((field) => [field, Number(project[field])])),
    missingValues: expectedFields.filter((field) => !observedFields.includes(field)),
    sourceFamilies: observedFields.length ? ["wallets"] : [],
  };

  if (!observedFields.length) {
    return {
      ...project,
      smartWalletSignal: null,
      smartWalletScore: null,
      smartWalletLevel: "unmeasured",
      smartWalletReasons: ["Smart-wallet flow observations are unavailable."],
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
    };
  }

  const smartWalletSignal = calculateSmartWalletSignal(project);
  const smartWalletScore = scoreSmartWalletSignal(project);
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

  return {
    ...project,

    smartWalletSignal,
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
  };
}

export function analyzeSmartWalletBatch(projects = []) {
  return projects
    .map(analyzeSmartWallets)
    .sort(
      (a, b) => Number(b.smartWalletScore || 0) - Number(a.smartWalletScore || 0)
    );
}
