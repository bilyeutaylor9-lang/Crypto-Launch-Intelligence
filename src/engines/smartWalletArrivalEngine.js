function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

export function analyzeSmartWalletArrival(project = {}) {
  const smartWallets = Math.max(num(project.smartWalletBuyers), num(project.profitableWalletBuyers), num(project.smartWalletCount));
  const arrivalMinutes = num(project.smartWalletArrivalMinutes || project.nativeLifecycle?.smartWalletArrivalMinutes);
  const conviction = Math.max(num(project.smartWalletScore), num(project.smartMoneyAccumulationScore), num(project.smartMoneyConvictionScore));
  const earlyBonus = arrivalMinutes > 0 && arrivalMinutes <= 60 ? 14 : arrivalMinutes <= 240 && arrivalMinutes > 0 ? 8 : 0;
  const score = Math.round(clamp(30 + Math.min(32, smartWallets * 6) + conviction * 0.42 + earlyBonus));

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
  };
}

export function analyzeSmartWalletArrivalBatch(projects = []) {
  return projects.map((project) => analyzeSmartWalletArrival(project));
}
