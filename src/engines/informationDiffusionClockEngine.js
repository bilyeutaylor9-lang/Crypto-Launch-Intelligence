import { hoursBetween, median, num } from "../edge/edgeMath.js";

function firstTrigger(history = [], predicate) {
  return history.find((row) => predicate(row))?.observedAt || null;
}

function projectTrigger(row = {}) {
  return num(row.projectClockScore) >= 60;
}
function capitalTrigger(row = {}) {
  return num(row.capitalClockScore) >= 55;
}
function attentionTrigger(row = {}) {
  return num(row.attentionClockScore) >= 55;
}

export function buildDiffusionExamples(observations = []) {
  const byProject = new Map();
  for (const row of Array.isArray(observations) ? observations : []) {
    if (!row.identityKey || !row.observedAt) continue;
    byProject.set(row.identityKey, [...(byProject.get(row.identityKey) || []), row]);
  }

  const examples = [];
  for (const [identityKey, rows] of byProject) {
    rows.sort((a, b) => String(a.observedAt).localeCompare(String(b.observedAt)));
    const projectAt = firstTrigger(rows, projectTrigger);
    const capitalAt = firstTrigger(rows, capitalTrigger);
    const attentionAt = firstTrigger(rows, attentionTrigger);
    if (!attentionAt) continue;
    const projectToAttention = projectAt ? hoursBetween(projectAt, attentionAt) : null;
    const capitalToAttention = capitalAt ? hoursBetween(capitalAt, attentionAt) : null;
    if ((projectToAttention === null || projectToAttention < 0) && (capitalToAttention === null || capitalToAttention < 0)) continue;
    examples.push({ identityKey, projectAt, capitalAt, attentionAt, projectToAttention, capitalToAttention });
  }
  return examples;
}

export function analyzeInformationDiffusionClock(project = {}, options = {}) {
  const history = Array.isArray(options.history) ? options.history : [];
  const examples = Array.isArray(options.examples) ? options.examples : [];
  const projectAt = firstTrigger(history, projectTrigger);
  const capitalAt = firstTrigger(history, capitalTrigger);
  const attentionAt = firstTrigger(history, attentionTrigger);
  const projectLeadDistribution = examples.map((item) => item.projectToAttention).filter((value) => value !== null && value >= 0);
  const capitalLeadDistribution = examples.map((item) => item.capitalToAttention).filter((value) => value !== null && value >= 0);

  let estimated = null;
  let basis = null;
  if (capitalAt && !attentionAt && capitalLeadDistribution.length >= 8) {
    estimated = median(capitalLeadDistribution);
    basis = "CAPITAL_TO_ATTENTION";
  } else if (projectAt && !attentionAt && projectLeadDistribution.length >= 8) {
    estimated = median(projectLeadDistribution);
    basis = "PROJECT_TO_ATTENTION";
  }

  const state = attentionAt
    ? "ATTENTION_ALREADY_TRIGGERED"
    : estimated !== null
      ? "ESTIMATED_INFORMATION_LEAD"
      : "INSUFFICIENT_CROSS_PROJECT_HISTORY";

  return {
    ...project,
    informationDiffusionClock: {
      state,
      projectTriggeredAt: projectAt,
      capitalTriggeredAt: capitalAt,
      attentionTriggeredAt: attentionAt,
      estimatedAttentionLeadHours: estimated === null ? null : Number(estimated.toFixed(2)),
      basis,
      crossProjectExamples: basis === "CAPITAL_TO_ATTENTION" ? capitalLeadDistribution.length : projectLeadDistribution.length,
      shadowOnly: true,
    },
    informationLeadHours: estimated === null ? null : Number(estimated.toFixed(2)),
  };
}
