import { clamp } from "../edge/edgeMath.js";
import { normalizeDownstreamAdoptionEvents } from "../data/edgeSignalNormalizers.js";

export function analyzeDownstreamAdoptionGraph(project = {}) {
  const events = normalizeDownstreamAdoptionEvents(project).filter((event) => event.independent !== false);
  if (!events.length) {
    return {
      ...project,
      downstreamAdoptionGraph: {
        state: "UNOBSERVED",
        reason: "No explicit downstream integration events were supplied; internal GitHub activity is not treated as downstream adoption.",
        independentRepositoryCount: 0,
        independentOrganizationCount: 0,
        productionEvidenceCount: 0,
        score: null,
        shadowOnly: true,
      },
      downstreamAdoptionState: "UNOBSERVED",
      downstreamAdoptionScore: 0,
    };
  }

  const repos = new Set(events.map((event) => event.repository));
  const orgs = new Set(events.map((event) => event.organization).filter(Boolean));
  const production = events.filter((event) => event.productionEvidence).length;
  const types = new Set(events.map((event) => event.type));
  const score = Math.round(clamp(
    Math.min(45, repos.size * 7) +
    Math.min(25, orgs.size * 5) +
    Math.min(20, production * 7) +
    Math.min(10, types.size * 2)
  ));
  const state = score >= 75
    ? "EXTERNAL_ADOPTION_ACCELERATING"
    : score >= 50
      ? "EXTERNAL_ADOPTION_CONFIRMED"
      : "EARLY_EXTERNAL_ADOPTION";

  return {
    ...project,
    downstreamAdoptionGraph: {
      state,
      independentRepositoryCount: repos.size,
      independentOrganizationCount: orgs.size,
      productionEvidenceCount: production,
      integrationTypeCount: types.size,
      score,
      latestEventAt: events.at(-1)?.timestamp || null,
      events: events.slice(-20),
      shadowOnly: true,
    },
    downstreamAdoptionState: state,
    downstreamAdoptionScore: score,
  };
}

export function analyzeDownstreamAdoptionGraphBatch(projects = []) {
  return (Array.isArray(projects) ? projects : []).map(analyzeDownstreamAdoptionGraph);
}
