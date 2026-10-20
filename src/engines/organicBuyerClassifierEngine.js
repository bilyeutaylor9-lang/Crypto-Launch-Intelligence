import { readBuyerEvidence } from "../data/buyerEvidence.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function firstNumber(project = {}, paths = []) {
  for (const path of paths) {
    const value = path.split(".").reduce((acc, part) => (acc ? acc[part] : undefined), project);
    if ((typeof value === "number" || (typeof value === "string" && value.trim())) &&
      Number.isFinite(Number(value)) && Number(value) >= 0) return Number(value);
  }
  return null;
}

export function analyzeOrganicBuyerClassifier(project = {}) {
  const evidence = readBuyerEvidence(project);
  const { totalBuyers: uniqueBuyers, independentBuyers, sameFunderBuyers, sniperBuyers } = evidence;
  const buyVolumeUsd = firstNumber(project, ["buyVolumeUsd", "nativeLifecycle.buyerState.buyVolumeUsd"]);
  const sellVolumeUsd = firstNumber(project, ["sellVolumeUsd", "nativeLifecycle.buyerState.sellVolumeUsd"]);
  const organicShare = uniqueBuyers > 0 && independentBuyers !== null ? independentBuyers / uniqueBuyers : null;
  const sniperShare = uniqueBuyers > 0 && sniperBuyers !== null ? sniperBuyers / uniqueBuyers : null;
  const sameFunderShare = uniqueBuyers > 0 && sameFunderBuyers !== null ? sameFunderBuyers / uniqueBuyers : null;
  const flowScore = buyVolumeUsd === null || sellVolumeUsd === null ? 0
    : sellVolumeUsd > 0 ? clamp((buyVolumeUsd / sellVolumeUsd) * 24) : buyVolumeUsd > 0 ? 24 : 0;
  const buyerDepthScore = Math.min(28, Math.log10(Math.max(1, independentBuyers)) * 14);
  const score = !evidence.classifierEvidenceAvailable ? null : uniqueBuyers === 0 ? 0 : Math.round(
    clamp(30 + organicShare * 38 + buyerDepthScore + flowScore - sniperShare * 24 - sameFunderShare * 20)
  );
  const classifications = [];

  if (evidence.classifierEvidenceAvailable && independentBuyers >= 50) classifications.push("distributed buyer base");
  if (evidence.classifierEvidenceAvailable && independentBuyers >= 10 && independentBuyers < 50) classifications.push("early independent buyer cluster");
  if (sameFunderShare >= 0.35) classifications.push("same-funder buyer cluster");
  if (sniperShare >= 0.25) classifications.push("sniper-heavy launch");
  if (buyVolumeUsd !== null && sellVolumeUsd !== null && buyVolumeUsd > sellVolumeUsd * 1.5) classifications.push("net buyer pressure");
  if (!classifications.length) classifications.push("thin buyer evidence");

  return {
    ...project,
    organicBuyerScore: score,
    firstRealBuyerScore: score,
    organicBuyerVerdict:
      score !== null && score >= 76 ? "First Real Buyers Confirmed" : score !== null && score >= 56 ? "Developing Organic Buyers" : "Buyer Quality Unproven",
    organicBuyerClassifier: {
      dataStatus: evidence.classifierEvidenceAvailable ? "OBSERVED" : evidence.dataStatus,
      classificationEvidenceAvailable: evidence.classifierEvidenceAvailable,
      uniqueBuyers,
      independentBuyers,
      sameFunderBuyers,
      sniperBuyers,
      organicSharePct: organicShare === null ? null : Number((organicShare * 100).toFixed(2)),
      sameFunderSharePct: sameFunderShare === null ? null : Number((sameFunderShare * 100).toFixed(2)),
      sniperSharePct: sniperShare === null ? null : Number((sniperShare * 100).toFixed(2)),
      buyVolumeUsd,
      sellVolumeUsd,
      classifications,
    },
  };
}

export function analyzeOrganicBuyerClassifierBatch(projects = []) {
  return projects.map((project) => analyzeOrganicBuyerClassifier(project));
}
