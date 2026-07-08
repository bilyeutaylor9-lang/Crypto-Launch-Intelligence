import { loadScanMemory } from "../learning/scanMemoryStore.js";
import { getWatchedProject, projectWatchId } from "../learning/projectWatchlistStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function average(values = []) {
  const safe = values.map((value) => num(value)).filter((value) => value > 0);
  if (!safe.length) return 0;
  return safe.reduce((sum, value) => sum + value, 0) / safe.length;
}

function tokenId(project = {}) {
  return projectWatchId(project);
}

function memoryForProject(project = {}, memory = []) {
  const id = tokenId(project);
  return memory.filter((record) => String(record.id || "").toLowerCase() === id).slice(-25);
}

function buildLearningFeatures(project = {}, memory = []) {
  const watched = getWatchedProject(project);
  const projectMemory = memoryForProject(project, memory);
  const priorScores = [
    ...projectMemory.map((record) => record.scores?.pipeline),
    ...(watched?.history || []).map((record) => record.score),
  ].map((score) => num(score));
  const lastScore = priorScores.at(-1) || 0;
  const avgPriorScore = Math.round(average(priorScores));
  const currentScore = num(
    project.pipelineScore ||
      project.opportunityScore ||
      project.marketRankScore ||
      project.prePump?.score ||
      project.narrativeLaunchStakingScore
  );
  const scoreDelta = lastScore ? Math.round(currentScore - lastScore) : 0;
  const maxPriorScore = Math.max(0, ...priorScores);
  const scanCount = priorScores.length;
  const previousBuckets = (watched?.history || [])
    .slice(-8)
    .map((record) => record.allocationBucket)
    .filter(Boolean);
  const priorHighConviction = (watched?.history || []).some((record) =>
    ["Institutional", "High"].includes(record.conviction)
  );

  return {
    scanCount,
    lastScore,
    avgPriorScore,
    maxPriorScore,
    scoreDelta,
    priorHighConviction,
    previousBuckets,
    watchedBefore: Boolean(watched || scanCount > 0),
  };
}

function learningEdgeFromFeatures(features = {}, project = {}) {
  let edge = 50;

  if (!features.watchedBefore) edge += 2;
  if (features.scanCount >= 3) edge += 4;
  if (features.scanCount >= 10) edge += 4;
  if (features.scoreDelta >= 12) edge += 12;
  else if (features.scoreDelta >= 6) edge += 7;
  else if (features.scoreDelta <= -12) edge -= 14;
  else if (features.scoreDelta <= -6) edge -= 8;
  if (features.maxPriorScore >= 75 && num(project.pipelineScore) >= 65) edge += 6;
  if (features.priorHighConviction && num(project.pipelineScore) < 55) edge -= 8;
  if (features.previousBuckets.includes("Avoid")) edge -= 5;
  if (num(project.xSocialScore) >= 65 && features.scoreDelta >= 5) edge += 6;
  if (num(project.signalProfile?.risk) >= 70) edge -= 10;

  return Math.round(clamp(edge));
}

function buildLearningSummary(features = {}, edge = 50) {
  if (!features.watchedBefore) {
    return "New project in watch memory; learning confidence starts neutral until more scans accumulate.";
  }
  if (edge >= 70 && features.scoreDelta > 0) {
    return "Learning layer sees improving score behavior versus prior watch history.";
  }
  if (edge <= 40 && features.scoreDelta < 0) {
    return "Learning layer is reducing conviction because the project is fading versus prior scans.";
  }
  if (features.scanCount >= 10) {
    return "Project has enough watch history for more stable score calibration.";
  }
  return "Learning layer is neutral while additional scan history accumulates.";
}

export function analyzeInstitutionalLearning(project = {}, memory = []) {
  const features = buildLearningFeatures(project, memory);
  const learningEdgeScore = learningEdgeFromFeatures(features, project);

  return {
    ...project,
    institutionalLearning: {
      ...features,
      learningEdgeScore,
      summary: buildLearningSummary(features, learningEdgeScore),
    },
    learningEdgeScore,
    evidence: [
      ...(project.evidence || []),
      {
        engine: "Institutional Learning Engine",
        signal: "Persistent watch-memory calibration",
        score: learningEdgeScore,
        confidence: Math.min(0.9, 0.25 + features.scanCount * 0.05),
        impact: learningEdgeScore >= 65 ? "Positive" : learningEdgeScore <= 40 ? "Negative" : "Neutral",
        reasons: [
          buildLearningSummary(features, learningEdgeScore),
          `Prior scans: ${features.scanCount}`,
          `Score delta: ${features.scoreDelta}`,
        ],
      },
    ],
  };
}

export function analyzeInstitutionalLearningBatch(projects = []) {
  const memory = loadScanMemory();
  return projects.map((project) => analyzeInstitutionalLearning(project, memory));
}
