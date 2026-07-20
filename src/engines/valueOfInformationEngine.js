import { estimateValueOfInformation, buildTargetedEnrichmentPlan } from "../data/targetedEnrichmentRouter.js";

export function analyzeValueOfInformation(project = {}, options = {}) {
  const missing = project.dataStarvationMissingEvidence || [];
  const items = missing
    .filter((item) => item.rootCause !== "NOT_APPLICABLE")
    .map((item) => ({
      ...item,
      valueOfInformationScore: estimateValueOfInformation(item),
    }))
    .sort((a, b) => b.valueOfInformationScore - a.valueOfInformationScore);
  const plan = buildTargetedEnrichmentPlan(items, options);

  return {
    ...project,
    valueOfInformationScore: Number((items.slice(0, 5).reduce((sum, item) => sum + item.valueOfInformationScore, 0) * 20).toFixed(2)),
    valueOfInformationItems: items,
    targetedEnrichmentPlan: plan,
    valueOfInformationPolicy:
      "Safety-critical and decision-changing missing evidence is routed first; this score schedules research and is not a buy signal.",
  };
}

export function analyzeValueOfInformationBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => analyzeValueOfInformation(project, options));
}
