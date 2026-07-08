import {
  compareToPrePumpPatterns,
  loadPrePumpPatternDatabase,
} from "../learning/prePumpPatternDatabase.js";

function confidenceValue(label = "Low") {
  if (label === "High") return 0.85;
  if (label === "Developing") return 0.65;
  if (label === "Early") return 0.45;
  return 0.25;
}

export function analyzePrePumpPattern(project = {}, context = {}) {
  const database = context.database || loadPrePumpPatternDatabase();
  const analysis = compareToPrePumpPatterns(project, database);
  const confidence = confidenceValue(analysis.prePumpPatternConfidence);

  return {
    ...project,
    ...analysis,
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Pre-Pump Pattern Database",
        signal: "Historical pre-breakout profile match",
        score: analysis.prePumpPatternScore,
        confidence,
        impact:
          analysis.prePumpPatternEdge >= 12
            ? "Positive"
            : analysis.prePumpPatternEdge <= -12
            ? "Negative"
            : "Neutral",
        reasons: [
          analysis.prePumpPattern.summary,
          `${analysis.prePumpPattern.databaseExamples} historical pattern examples available.`,
          `Breakout match ${analysis.prePumpPatternMatchPct}%, trap match ${analysis.trapPatternMatchPct}%.`,
        ],
      },
    ],
  };
}

export function analyzePrePumpPatternBatch(projects = []) {
  const database = loadPrePumpPatternDatabase();

  return (Array.isArray(projects) ? projects : []).map((project) =>
    analyzePrePumpPattern(project, { database })
  );
}
