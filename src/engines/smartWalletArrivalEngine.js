function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function measured(value) {
  return value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));
}

export function analyzeSmartWalletArrival(project = {}) {
  const expectedFields = [
    "smartWalletBuyers",
    "profitableWalletBuyers",
    "smartWalletCount",
    "smartWalletArrivalMinutes",
    "smartWalletScore",
    "smartMoneyAccumulationScore",
    "smartMoneyConvictionScore",
  ];
  const observedFields = expectedFields.filter((field) => measured(project[field]));
  const nativeArrivalMeasured = measured(project.nativeLifecycle?.smartWalletArrivalMinutes);
  const smartWalletArrivalCoverage = {
    observedComponentCount: observedFields.length + (nativeArrivalMeasured ? 1 : 0),
    expectedComponentCount: expectedFields.length + 1,
    coveragePct: Math.round(
      ((observedFields.length + (nativeArrivalMeasured ? 1 : 0)) /
        (expectedFields.length + 1)) *
        100
    ),
    observedValues: {
      ...Object.fromEntries(observedFields.map((field) => [field, Number(project[field])])),
      ...(nativeArrivalMeasured
        ? { "nativeLifecycle.smartWalletArrivalMinutes": Number(project.nativeLifecycle.smartWalletArrivalMinutes) }
        : {}),
    },
    missingValues: [
      ...expectedFields.filter((field) => !observedFields.includes(field)),
      ...(nativeArrivalMeasured ? [] : ["nativeLifecycle.smartWalletArrivalMinutes"]),
    ],
    sourceFamilies: observedFields.length || nativeArrivalMeasured ? ["wallet-arrival"] : [],
  };

  if (!observedFields.length && !nativeArrivalMeasured) {
    return {
      ...project,
      smartWalletArrivalScore: null,
      smartWalletArrivalVerdict: "SMART_WALLET_ARRIVAL_UNMEASURED",
      smartWalletArrival: null,
      smartWalletArrivalCoverage,
    };
  }

  const smartWallets = Math.max(num(project.smartWalletBuyers), num(project.profitableWalletBuyers), num(project.smartWalletCount));
  const arrivalMinutes = num(project.smartWalletArrivalMinutes || project.nativeLifecycle?.smartWalletArrivalMinutes);
  const conviction = Math.max(num(project.smartWalletScore), num(project.smartMoneyAccumulationScore), num(project.smartMoneyConvictionScore));
  const earlyBonus = arrivalMinutes > 0 && arrivalMinutes <= 60 ? 14 : arrivalMinutes <= 240 && arrivalMinutes > 0 ? 8 : 0;
  const score = Math.round(clamp(Math.min(60, smartWallets * 12) + conviction * 0.62 + earlyBonus));

  return {
    ...project,
    smartWalletArrivalScore: score,
    smartWalletArrivalVerdict:
      score >= 75 ? "Smart Wallet Arrival Confirmed" : score >= 55 ? "Smart Wallet Watch" : "No Smart Wallet Proof",
    smartWalletArrival: {
      smartWallets,
      arrivalMinutes: arrivalMinutes || null,
      conviction,
      earlyBonus,
    },
    smartWalletArrivalCoverage,
  };
}

export function analyzeSmartWalletArrivalBatch(projects = []) {
  return projects.map((project) => analyzeSmartWalletArrival(project));
}
