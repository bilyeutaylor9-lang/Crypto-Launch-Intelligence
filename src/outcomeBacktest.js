import {
  buildOutcomeCalibrationReport,
  saveOutcomeCalibrationReport,
} from "./learning/outcomeCalibrationEngine.js";

const report = buildOutcomeCalibrationReport();
const { file } = saveOutcomeCalibrationReport(report);

console.log(
  JSON.stringify(
    {
      file,
      generatedAt: report.generatedAt,
      totalExamples: report.totalExamples,
      uniqueProjects: report.uniqueProjects,
      horizons: report.horizons,
      hitRate: report.hitRate,
      missRate: report.missRate,
      avgOutcomePct: report.avgOutcomePct,
      confidenceCalibration: report.confidenceCalibration,
      strongestSignals: report.strongestSignals,
      weakestSignals: report.weakestSignals,
      topWinners: report.topWinners,
      topLosers: report.topLosers,
    },
    null,
    2
  )
);
