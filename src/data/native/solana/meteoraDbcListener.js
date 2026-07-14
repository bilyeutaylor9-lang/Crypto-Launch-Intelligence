import { SolanaProgramEventAdapter } from "./solanaProgramEventConnector.js";
import { getNativeProtocolConfigs } from "../nativePoolConfig.js";

export function createMeteoraDbcListeners(options = {}) {
  return getNativeProtocolConfigs({ ...options, chains: options.chains || "solana" })
    .filter((config) => /meteora/.test(config.protocol))
    .map((config) => new SolanaProgramEventAdapter(config));
}

export async function backfillMeteoraDbcEvents(options = {}) {
  const listeners = createMeteoraDbcListeners(options);
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

  return { events, report: { source: "meteora-dbc-listener", listeners: reports } };
}
