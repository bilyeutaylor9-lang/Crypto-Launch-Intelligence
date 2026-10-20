export function observedBuyerCount(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function firstCount(values) {
  for (const value of values) {
    const count = observedBuyerCount(value);
    if (count !== null) return count;
  }
  return null;
}

export function readBuyerEvidence(project = {}, options = {}) {
  const native = project.nativeLifecycle?.buyerState || {};
  const graph = options.includeDerived && ["OBSERVED", "PARTIAL"].includes(project.projectIdentityGraph?.walletGraph?.dataStatus)
    ? project.projectIdentityGraph.walletGraph.buyerBreakdown || {} : {};
  const classifier = options.includeDerived && ["OBSERVED", "PARTIAL"].includes(project.organicBuyerClassifier?.dataStatus)
    ? project.organicBuyerClassifier : {};
  const totalBuyers = firstCount([project.uniqueBuyers24h, project.buyers24h, native.uniqueBuyers, graph.totalBuyers, classifier.uniqueBuyers]);
  const independentBuyers = firstCount([project.independentBuyers24h, native.independentBuyers, graph.independentBuyers, classifier.independentBuyers]);
  const sameFunderBuyers = firstCount([project.sameFunderBuyers24h, native.sameFunderBuyers, graph.sameFunderBuyers, classifier.sameFunderBuyers]);
  const sniperBuyers = firstCount([project.sniperBuyers24h, native.sniperBuyers, graph.sniperBuyers, classifier.sniperBuyers]);
  const deployerConnectedBuyers = firstCount([project.deployerConnectedBuyers, native.deployerConnectedBuyers, graph.deployerConnectedBuyers]);
  const classifierEvidenceAvailable = [totalBuyers, independentBuyers, sameFunderBuyers, sniperBuyers].every((value) => value !== null);
  const clusterEvidenceAvailable = classifierEvidenceAvailable && deployerConnectedBuyers !== null;
  const contradictoryCounts = totalBuyers !== null &&
    [independentBuyers, sameFunderBuyers, sniperBuyers, deployerConnectedBuyers]
      .some((value) => value !== null && value > totalBuyers);
  const knownClusteredBuyers = [sameFunderBuyers, sniperBuyers, deployerConnectedBuyers]
    .filter((value) => value !== null).reduce((sum, value) => sum + value, 0);
  return {
    totalBuyers, independentBuyers, sameFunderBuyers, sniperBuyers, deployerConnectedBuyers,
    knownClusteredBuyers,
    unclassifiedBuyers: clusterEvidenceAvailable && !contradictoryCounts
      ? Math.max(0, totalBuyers - independentBuyers - knownClusteredBuyers) : null,
    classifierEvidenceAvailable: classifierEvidenceAvailable && !contradictoryCounts,
    clusterEvidenceAvailable: clusterEvidenceAvailable && !contradictoryCounts,
    dataStatus: contradictoryCounts ? "CONFLICTED_DATA" : clusterEvidenceAvailable ? "OBSERVED"
      : [totalBuyers, independentBuyers, sameFunderBuyers, sniperBuyers, deployerConnectedBuyers].some((value) => value !== null)
        ? "PARTIAL" : "UNKNOWN",
  };
}
