function testAdequacy(result, context = {}) {
  const top10 = result?.byK?.[10] || {};
  const checks = {
    leakageAuditPassed: context.leakageAuditStatus === "PASS",
    foldIsolationPassed: context.foldAuditStatus === "PASS",
    resolvedTestObservations: Number(context.testCount || 0) >= Number(context.minimumTestObservations ?? 100),
    distinctTestWindows: Number(top10.windows || 0) >= Number(context.minimumTestWindows ?? 10),
    top10Selections: Number(top10.selections || 0) >= Number(context.minimumTop10Selections ?? 50),
    uniqueTop10Projects: Number(top10.uniqueProjects || 0) >= Number(context.minimumUniqueTop10Projects ?? 30),
  };
  return { adequate: Object.values(checks).every(Boolean), checks };
}

export function compareModels(results = [], options = {}) {
  const models = results.map((result) => {
    const top10 = result.byK?.[10] || {};
    const adequacy = testAdequacy(result, options);
    return {
      model: result.model,
      precisionAt10: top10.precision ?? null,
      precisionAt10ByTarget: top10.precisionByTarget || null,
      catastrophicLossRateAt10: top10.catastrophicLossRate ?? null,
      averageReturnAt10Pct: top10.averageReturnPct ?? null,
      medianReturnAt10Pct: top10.medianReturnPct ?? null,
      averageMaximumDrawdownAt10Pct: top10.averageMaximumDrawdownPct ?? null,
      worstMaximumDrawdownAt10Pct: top10.worstMaximumDrawdownPct ?? null,
      selectionsAt10: top10.selections ?? 0,
      uniqueProjectsAt10: top10.uniqueProjects ?? 0,
      windowsAt10: top10.windows ?? 0,
      adequacy,
    };
  });
  const allAdequate = models.length > 0 && models.every((model) => model.adequacy.adequate);
  const ranked = [...models].sort(
    (left, right) =>
      (right.precisionAt10 ?? -1) - (left.precisionAt10 ?? -1) ||
      (left.catastrophicLossRateAt10 ?? 1) - (right.catastrophicLossRateAt10 ?? 1) ||
      (right.medianReturnAt10Pct ?? -Infinity) - (left.medianReturnAt10Pct ?? -Infinity) ||
      (left.averageMaximumDrawdownAt10Pct ?? Infinity) - (right.averageMaximumDrawdownAt10Pct ?? Infinity)
  );

  return {
    generatedAt: options.generatedAt || new Date().toISOString(),
    status: allAdequate ? "ADEQUATE_FINAL_TEST" : "INSUFFICIENT_FINAL_TEST_SAMPLE",
    models,
    winnerPublished: allAdequate,
    bestModel: allAdequate ? ranked[0] : null,
    provisionalOrdering: ranked
      .filter((model) => model.precisionAt10 !== null && model.selectionsAt10 > 0)
      .map((model) => model.model),
    recommendation: allAdequate
      ? "REVIEW_BEST_MODEL_FOR_SHADOW_ONLY; PRODUCTION_REMAINS_UNCHANGED"
      : "COLLECT_MORE_POINT_IN_TIME_OUTCOMES; DO_NOT_CHANGE_PRODUCTION",
    winnerGate: {
      minimumTestObservations: Number(options.minimumTestObservations ?? 100),
      minimumTestWindows: Number(options.minimumTestWindows ?? 10),
      minimumTop10Selections: Number(options.minimumTop10Selections ?? 50),
      minimumUniqueTop10Projects: Number(options.minimumUniqueTop10Projects ?? 30),
      requiresLeakageAuditPass: true,
      requiresFoldIsolationPass: true,
    },
  };
}

export { testAdequacy };
