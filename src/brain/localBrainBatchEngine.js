import { selectAgents } from "./agentRouter.js";
import { localAIProjectKey, selectAIResearchCandidates } from "./aiResearchGate.js";
import { getOllamaConfig, inspectOllama } from "./localAIClient.js";
import {
  claimNextLocalAIResearchTask,
  completeLocalAIResearchTask,
  enqueueLocalAIResearchTasks,
  loadLocalAIResearchQueue,
  releaseLocalAIResearchTask,
  summarizeLocalAIResearchQueue,
} from "./localAIQueueStore.js";
import { runLocalResearchSwarm } from "./swarmBrain.js";
import { saveLocalAIResearchRun } from "../learning/localAIMemoryStore.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function taskResultFields(task = {}, report = {}) {
  return {
    localAIStatus: report.status || task.status || "QUEUED",
    localAIAdvisoryOnly: true,
    localAIResearchDepth: task.depth || "LIGHT",
    localAIQueueTaskId: task.id || null,
    localAIResearchTimestamp: report.generatedAt || task.completedAt || task.updatedAt || null,
    localAIVerdict: report.judge?.verdict || null,
    localAIConfidence: num(report.judge?.confidence),
    localAICoverage: num(report.evidence?.evidenceCoverage?.score),
    localAICompletedAgents: num(report.agents?.completedCount),
    localAIFailedAgents: num(report.agents?.failedCount),
    localAIKeyRisks: Array.isArray(report.judge?.keyRisks) ? report.judge.keyRisks : [],
    localAIMissingEvidence: Array.isArray(report.judge?.missingEvidence) ? report.judge.missingEvidence : [],
    localAINextChecks: Array.isArray(report.judge?.nextChecks) ? report.judge.nextChecks : [],
  };
}

export function queueLocalAIResearch(projects = [], options = {}) {
  const selectionOptions = { ...options };
  if (Number.isFinite(Number(options.topProjectLimit)) && Number(options.topProjectLimit) > 0) {
    selectionOptions.totalLimit = Number(options.topProjectLimit);
  }
  const selection = selectAIResearchCandidates(projects, selectionOptions);
  const assignments = selection.candidates.map(({ project, decision }) => {
    const agents = selectAgents(project, { depth: decision.depth });
    return {
      project,
      projectKey: decision.projectKey,
      depth: decision.depth,
      priority: decision.priority,
      gate: decision,
      agentIds: agents.map((agent) => agent.id),
    };
  });
  const queued = enqueueLocalAIResearchTasks(assignments, options.queue || options);
  const tasksByProjectKey = new Map(queued.tasks.map((task) => [task.projectKey, task]));

  return {
    projects: (Array.isArray(projects) ? projects : []).map((project) => {
      const task = tasksByProjectKey.get(localAIProjectKey(project));
      if (!task) return project;
      return {
        ...project,
        ...taskResultFields(task, task.result || { status: task.status }),
        localAIAgentIds: task.agentIds || [],
        localAIQueuePriority: task.priority || 0,
        localAIGate: {
          depth: task.depth,
          priority: task.priority,
          reasons: task.gate?.reasons || [],
          metrics: task.gate?.metrics || {},
        },
      };
    }),
    assignments,
    selection,
    queue: queued,
  };
}

export async function processQueuedLocalAIResearch(options = {}) {
  const queueOptions = options.queue || options;
  const config = getOllamaConfig(options.config || {});
  const availability = options.availability || (await inspectOllama(config));

  if (!availability.reachable || !availability.modelInstalled) {
    return {
      status: "UNAVAILABLE",
      availability,
      completed: [],
      queue: summarizeLocalAIResearchQueue(loadLocalAIResearchQueue(queueOptions)),
    };
  }

  const limit = Math.max(1, Math.min(100, Number(options.limit || process.env.LOCAL_AI_WORKER_BATCH_SIZE || 1)));
  const completed = [];

  for (let index = 0; index < limit; index += 1) {
    const task = claimNextLocalAIResearchTask(queueOptions);
    if (!task) break;

    try {
      const agents = selectAgents(task.project, { depth: task.depth }).filter((agent) => task.agentIds.includes(agent.id));
      if (!agents.length) throw new Error("No registered local AI agents were selected for this task.");
      const triageTokenLimit = Math.max(64, Math.min(450, Number(process.env.LOCAL_AI_TRIAGE_MAX_TOKENS || 180)));
      const taskConfig = task.depth === "TRIAGE"
        ? { ...config, maxTokens: Math.min(config.maxTokens, triageTokenLimit) }
        : config;

      const report = await runLocalResearchSwarm(task.project, {
        agents,
        chat: options.chat,
        chatOptions: taskConfig,
      });
      report.localModel = { model: config.model, baseUrl: config.baseUrl };
      const completedTask = completeLocalAIResearchTask(task.id, report, queueOptions);
      const memory = saveLocalAIResearchRun(completedTask, report, {
        ...(options.memory || {}),
        model: config.model,
      });
      completed.push({ task: completedTask, report, memory, fields: taskResultFields(completedTask, report) });
    } catch (error) {
      releaseLocalAIResearchTask(task.id, error, queueOptions);
    }
  }

  return {
    status: completed.length ? "COMPLETE" : "IDLE",
    availability,
    completed,
    queue: summarizeLocalAIResearchQueue(loadLocalAIResearchQueue(queueOptions)),
  };
}

export function mergeLocalAIResearchIntoProjects(projects = [], completed = []) {
  const fieldsByProjectKey = new Map(
    (Array.isArray(completed) ? completed : []).map((item) => [item.task.projectKey, item.fields])
  );
  return (Array.isArray(projects) ? projects : []).map((project) => ({
    ...project,
    ...(fieldsByProjectKey.get(localAIProjectKey(project)) || {}),
  }));
}
