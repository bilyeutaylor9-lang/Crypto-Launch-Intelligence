function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function firstNumber(project = {}, paths = []) {
  for (const path of paths) {
    const value = path.split(".").reduce((acc, part) => (acc ? acc[part] : undefined), project);
    if (Number.isFinite(Number(value)) && Number(value) > 0) return Number(value);
  }
  return 0;
}

export function analyzeOrganicBuyerClassifier(project = {}) {
  const uniqueBuyers = firstNumber(project, [
    "uniqueBuyers24h",
    "buyers24h",
    "nativeLifecycle.buyerState.uniqueBuyers",
  ]);
  const independentBuyers = firstNumber(project, [
    "independentBuyers24h",
    "nativeLifecycle.buyerState.independentBuyers",
  ]) || Math.max(0, uniqueBuyers - firstNumber(project, ["sameFunderBuyers24h"]) - firstNumber(project, ["sniperBuyers24h"]));
  const sameFunderBuyers = firstNumber(project, [
    "sameFunderBuyers24h",
    "nativeLifecycle.buyerState.sameFunderBuyers",
  ]);
  const sniperBuyers = firstNumber(project, [
    "sniperBuyers24h",
    "nativeLifecycle.buyerState.sniperBuyers",
  ]);
  const buyVolumeUsd = firstNumber(project, ["buyVolumeUsd", "nativeLifecycle.buyerState.buyVolumeUsd"]);
  const sellVolumeUsd = firstNumber(project, ["sellVolumeUsd", "nativeLifecycle.buyerState.sellVolumeUsd"]);
  const organicShare = uniqueBuyers > 0 ? independentBuyers / uniqueBuyers : 0;
  const sniperShare = uniqueBuyers > 0 ? sniperBuyers / uniqueBuyers : 0;
  const sameFunderShare = uniqueBuyers > 0 ? sameFunderBuyers / uniqueBuyers : 0;
  const flowScore = sellVolumeUsd > 0 ? clamp((buyVolumeUsd / sellVolumeUsd) * 24) : buyVolumeUsd > 0 ? 24 : 0;
  const buyerDepthScore = Math.min(28, Math.log10(Math.max(1, independentBuyers)) * 14);
  const score = Math.round(
    clamp(30 + organicShare * 38 + buyerDepthScore + flowScore - sniperShare * 24 - sameFunderShare * 20)
  );
  const classifications = [];

  if (independentBuyers >= 50) classifications.push("distributed buyer base");
  if (independentBuyers >= 10 && independentBuyers < 50) classifications.push("early independent buyer cluster");
  if (sameFunderShare >= 0.35) classifications.push("same-funder buyer cluster");
  if (sniperShare >= 0.25) classifications.push("sniper-heavy launch");
  if (buyVolumeUsd > sellVolumeUsd * 1.5) classifications.push("net buyer pressure");
  if (!classifications.length) classifications.push("thin buyer evidence");

  return {
    ...project,
    organicBuyerScore: score,
    firstRealBuyerScore: score,
    organicBuyerVerdict:
      score >= 76 ? "First Real Buyers Confirmed" : score >= 56 ? "Developing Organic Buyers" : "Buyer Quality Unproven",
    organicBuyerClassifier: {
      uniqueBuyers,
      independentBuyers,
      sameFunderBuyers,
      sniperBuyers,
      organicSharePct: Number((organicShare * 100).toFixed(2)),
      sameFunderSharePct: Number((sameFunderShare * 100).toFixed(2)),
      sniperSharePct: Number((sniperShare * 100).toFixed(2)),
      buyVolumeUsd,
      sellVolumeUsd,
      classifications,
    },
  };
}

export function analyzeOrganicBuyerClassifierBatch(projects = []) {
  return projects.map((project) => analyzeOrganicBuyerClassifier(project));
}
