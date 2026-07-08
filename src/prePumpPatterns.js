import {
  buildPrePumpPatternDatabase,
  savePrePumpPatternDatabase,
} from "./learning/prePumpPatternDatabase.js";

const database = buildPrePumpPatternDatabase();
const { file } = savePrePumpPatternDatabase(database);

console.log(
  JSON.stringify(
    {
      file,
      generatedAt: database.generatedAt,
      lookaheadHours: database.lookaheadHours,
      totalExamples: database.totalExamples,
      breakoutExamples: database.breakoutExamples,
      trapExamples: database.trapExamples,
      neutralExamples: database.neutralExamples,
      confidence: database.confidence,
      strongestFeatureEdges: database.featureEdges,
      topBreakouts: database.topBreakouts,
      topTraps: database.topTraps,
    },
    null,
    2
  )
);
