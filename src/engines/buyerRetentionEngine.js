function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

export function analyzeBuyerRetention(project = {}) {
  const totalBuyers = Math.max(num(project.uniqueBuyers24h), num(project.walletCluster?.totalBuyers), num(project.organicBuyerClassifier?.uniqueBuyers));
  const repeatBuyers = Math.max(num(project.repeatBuyers24h), num(project.returningBuyers), num(project.buyerRetention?.repeatBuyers));
  const retention24hPct = num(project.buyerRetention24hPct || project.buyerRetention?.retention24hPct);
  const retention7dPct = num(project.buyerRetention7dPct || project.buyerRetention?.retention7dPct);
  const repeatShare = totalBuyers > 0 ? repeatBuyers / totalBuyers : 0;
  const score = Math.round(clamp(36 + repeatShare * 34 + retention24hPct * 0.28 + retention7dPct * 0.22));

  return {
    ...project,
    buyerRetentionScore: score,
    buyerRetentionVerdict:
      score >= 70 ? "Repeat Buyer Demand" : score >= 50 ? "Retention Developing" : "Retention Unproven",
    buyerRetention: {
      totalBuyers,
      repeatBuyers,
      repeatSharePct: Number((repeatShare * 100).toFixed(2)),
      retention24hPct,
      retention7dPct,
    },
  };
}

export function analyzeBuyerRetentionBatch(projects = []) {
  return projects.map((project) => analyzeBuyerRetention(project));
}
