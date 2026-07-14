import { SolanaProgramEventAdapter } from "./solanaProgramEventConnector.js";
import { getNativeProtocolConfigs } from "../nativePoolConfig.js";

export function createRaydiumLaunchLabListeners(options = {}) {
  return getNativeProtocolConfigs({ ...options, chains: options.chains || "solana" })
    .filter((config) => /raydium/.test(config.protocol))
    .map((config) => new SolanaProgramEventAdapter(config));
}

export async function backfillRaydiumLaunchLabEvents(options = {}) {
  const listeners = createRaydiumLaunchLabListeners(options);
  const events = [];
  const reports = [];

  for (const listener of listeners) {
    const result = await listener.backfill({
      ...options,
      instructions: options.instructionsByProgram?.[listener.config.id] || options.instructions || [],
    });
    events.push(...result.events);
    reports.push({
      source: listener.config.id,
      status: result.status,
      events: result.events.length,
      configured: Boolean(listener.config.configured),
    });
  }

  return { events, report: { source: "raydium-launchlab-listener", listeners: reports } };
}
