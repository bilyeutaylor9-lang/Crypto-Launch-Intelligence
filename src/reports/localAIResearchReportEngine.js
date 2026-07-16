import fs from "fs";
import path from "path";

import {
  loadLocalAIResearchQueue,
  summarizeLocalAIResearchQueue,
} from "../brain/localAIQueueStore.js";
import { summarizeLocalAIPerformance } from "../learning/localAIMemoryStore.js";

export function writeLocalAIResearchReport() {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const queue = loadLocalAIResearchQueue();
  const filePath = path.join(reportsDir, "local-ai-research.json");
  const tasks = queue.tasks
    .slice()
    .sort((left, right) => Number(right.priority || 0) - Number(left.priority || 0))
    .slice(0, 100)
    .map((task) => ({
      id: task.id,
      projectKey: task.projectKey,
      status: task.status,
      depth: task.depth,
      priority: task.priority,
      selectionReason: task.gate?.selectionReason || null,
      coverageBucket: task.gate?.coverageBucket || null,
      agentIds: task.agentIds,
      queuedAt: task.queuedAt,
      startedAt: task.startedAt || null,
      completedAt: task.completedAt || null,
      project: task.project,
      result: task.result
        ? {
            status: task.result.status,
            verdict: task.result.judge?.verdict,
            confidence: task.result.judge?.confidence,
            evidenceCoverage: task.result.evidence?.evidenceCoverage?.score,
            completedAgents: task.result.agents?.completedCount,
            failedAgents: task.result.agents?.failedCount,
            keyRisks: task.result.judge?.keyRisks || [],
            missingEvidence: task.result.judge?.missingEvidence || [],
            nextChecks: task.result.judge?.nextChecks || [],
          }
        : null,
      lastError: task.lastError || null,
    }));
  const report = {
    generatedAt: new Date().toISOString(),
    advisoryOnly: true,
    queue: summarizeLocalAIResearchQueue(queue),
    performance: summarizeLocalAIPerformance(),
    tasks,
    disclaimer: "Local AI research is advisory only. It cannot override deterministic identity, safety, or final selection gates.",
  };

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return { filePath, report };
}
