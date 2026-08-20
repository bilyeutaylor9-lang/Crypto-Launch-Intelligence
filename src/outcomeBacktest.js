import {
  buildOutcomeCalibrationReport,
  saveOutcomeCalibrationReport,
} from "./learning/outcomeCalibrationEngine.js";
import { runAvoidanceEdgeVerification } from "./learning/avoidanceEdgeVerificationLab.js";

const report = buildOutcomeCalibrationReport();
const { file } = saveOutcomeCalibrationReport(report);
const avoidanceVerification = runAvoidanceEdgeVerification();

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
      avoidanceVerificationState: avoidanceVerification.state,
      verifiedAvoidanceEdges: avoidanceVerification.verifiedEdges,
      topWinners: report.topWinners,
      topLosers: report.topLosers,
    },
    null,
    2
  )
);
