import {
  CALIBRATED_SIGNALS,
  loadOutcomeCalibrationReport,
} from "../learning/outcomeCalibrationEngine.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function scoreForSignal(project = {}, key = "") {
  const scores = {
    marketRank: project.marketRankScore,
    richToken: project.richTokenScore,
    prePump: project.prePump?.score,
    narrative: project.narrativeScore,
    narrativeForecast: project.narrativeForecastScore,
    narrativeLaunchStaking: project.narrativeLaunchStakingScore,
    liquidity: project.liquidityScore,
    liquidityExpansion: project.liquidityExpansionScore,
    momentumShift: project.momentumShiftScore,
    capitalFlow: project.capitalFlowScore,
    buyPressure: project.buyPressureScore,
    relativeStrength: project.relativeStrengthScore,
    smartWalletPerformance: project.smartWalletPerformanceScore,
    smartMoneyAccumulation: project.smartMoneyAccumulationScore,
    catalyst: project.catalystScore,
    catalystCalendar: project.catalystCalendarScore,
    xSocial: project.xSocialScore,
    institutionalWatch: project.institutionalWatchScore,
    learningEdge: project.learningEdgeScore,
    outcomeLearning: project.outcomeLearningScore,
    signalCombination: project.signalCombinationScore,
    quantumOpportunity: project.quantumOpportunityScore,
    sellPressure: project.sellPressureScore,
    stakingRisk: project.stakingRiskScore,
    risk: project.riskScore,
  };

  return num(scores[key]);
}

function calibrationMap(report = {}) {
  return new Map((report.signalCalibration || []).map((signal) => [signal.key, signal]));
}

export function analyzeOutcomeCalibration(project = {}, context = {}) {
  const report = context.report || loadOutcomeCalibrationReport();
  const byKey = context.byKey || calibrationMap(report);

  if (!report.totalExamples) {
    return {
      ...project,
      calibrationAdjustment: 0,
      calibrationScore: 50,
      calibrationConfidence: "Cold Start",
      calibrationSignals: [],
      calibrationRiskSignals: [],
      outcomeCalibration: {
        totalExamples: 0,
        summary: "Calibration is waiting for enough saved outcomes.",
      },
    };
  }

  const active = CALIBRATED_SIGNALS.map((signal) => {
    const currentScore = scoreForSignal(project, signal.key);
    const stat = byKey.get(signal.key);

    if (currentScore < 60 || !stat || num(stat.samples) < 3) return null;

    const direction = signal.positive ? 1 : -1;
    const reliabilityEdge = (num(stat.reliability) - 50) / 50;
    const strength = clamp((currentScore - 55) / 45, 0, 1);
    const adjustment = Number((direction * reliabilityEdge * strength * 5).toFixed(2));

    return {
      key: signal.key,
      label: signal.label,
      score: Math.round(currentScore),
      reliability: stat.reliability,
      samples: stat.samples,
      hitRate: stat.hitRate,
      falsePositiveRate: stat.falsePositiveRate,
      weightMultiplier: stat.weightMultiplier,
      adjustment,
      positive: signal.positive,
    };
  }).filter(Boolean);

  const totalAdjustment = Math.round(
    clamp(
      active.reduce((sum, signal) => sum + signal.adjustment, 0),
      -12,
      12
    )
  );
  const supportSignals = active
    .filter((signal) => signal.adjustment > 0)
    .sort((a, b) => b.adjustment - a.adjustment);
  const riskSignals = active
    .filter((signal) => signal.adjustment < 0)
    .sort((a, b) => a.adjustment - b.adjustment);
  const calibrationScore = Math.round(clamp(50 + totalAdjustment * 3));
  const confidence =
    report.totalExamples >= 100
      ? "High"
      : report.totalExamples >= 30
      ? "Developing"
      : "Early";
  const summary =
    totalAdjustment >= 5
      ? "Historical calibration supports this setup."
      : totalAdjustment <= -5
      ? "Historical calibration warns against this setup."
      : "Historical calibration is neutral or mixed.";

  return {
    ...project,
    calibrationAdjustment: totalAdjustment,
    calibrationScore,
    calibrationConfidence: confidence,
    calibrationSignals: supportSignals,
    calibrationRiskSignals: riskSignals,
    outcomeCalibration: {
      totalExamples: report.totalExamples,
      hitRate: report.hitRate,
      missRate: report.missRate,
      avgOutcomePct: report.avgOutcomePct,
      adjustment: totalAdjustment,
      summary,
      supportSignals: supportSignals.slice(0, 5),
      riskSignals: riskSignals.slice(0, 5),
    },
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Outcome Calibration Engine",
        signal: "Prediction accuracy calibration",
        score: calibrationScore,
        confidence: confidence === "High" ? 0.85 : confidence === "Developing" ? 0.65 : 0.4,
        impact: totalAdjustment > 0 ? "Positive" : totalAdjustment < 0 ? "Negative" : "Neutral",
        reasons: [
          `${report.totalExamples} historical outcome examples calibrated.`,
          `${supportSignals.length} supportive calibrated signals and ${riskSignals.length} warning signals active.`,
          summary,
        ],
      },
    ],
  };
}

export function analyzeOutcomeCalibrationBatch(projects = []) {
  const report = loadOutcomeCalibrationReport();
  const byKey = calibrationMap(report);

  return projects.map((project) => analyzeOutcomeCalibration(project, { report, byKey }));
}
