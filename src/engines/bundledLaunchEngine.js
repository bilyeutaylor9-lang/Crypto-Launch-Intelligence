function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

export function analyzeBundledLaunch(project = {}) {
  const sameBlockBuys = num(project.sameBlockBuys || project.launchBundle?.sameBlockBuys);
  const bundledTxCount = num(project.bundledTxCount || project.launchBundle?.bundledTxCount);
  const sniperBuyers = num(project.sniperBuyers24h || project.walletCluster?.sniperBuyers || project.organicBuyerClassifier?.sniperBuyers);
  const totalBuyers = Math.max(num(project.uniqueBuyers24h), num(project.walletCluster?.totalBuyers), num(project.organicBuyerClassifier?.uniqueBuyers));
  const bundleShare = totalBuyers > 0 ? (sameBlockBuys + bundledTxCount + sniperBuyers) / totalBuyers : 0;
  const bundledLaunchRiskScore = Math.round(clamp(bundleShare * 100 + sameBlockBuys * 0.7 + bundledTxCount * 1.2));
  const bundledLaunchScore = Math.round(clamp(76 - bundledLaunchRiskScore * 0.72 + Math.min(12, totalBuyers * 0.08)));

  return {
    ...project,
    bundledLaunchRiskScore,
    bundledLaunchScore,
    bundledLaunchVerdict:
      bundledLaunchRiskScore >= 75 ? "Bundled Launch Risk" : bundledLaunchRiskScore >= 45 ? "Bundle Watch" : "No Dominant Bundle",
    bundledLaunch: {
      sameBlockBuys,
      bundledTxCount,
      sniperBuyers,
      totalBuyers,
      bundleSharePct: Number((bundleShare * 100).toFixed(2)),
    },
  };
}

export function analyzeBundledLaunchBatch(projects = []) {
  return projects.map((project) => analyzeBundledLaunch(project));
}
