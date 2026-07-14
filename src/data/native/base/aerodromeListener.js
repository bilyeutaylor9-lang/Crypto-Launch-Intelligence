import { EvmFactoryEventAdapter } from "../evm/evmFactoryEventConnector.js";
import { getNativeProtocolConfigs } from "../nativePoolConfig.js";

export function createAerodromeListeners(options = {}) {
  return getNativeProtocolConfigs({ ...options, chains: options.chains || "base" })
    .filter((config) => ["aerodrome", "aerodrome-slipstream"].includes(config.protocol))
    .map((config) => new EvmFactoryEventAdapter(config));
}

export async function backfillAerodromeEvents(options = {}) {
  const listeners = createAerodromeListeners(options);
  const events = [];
  const reports = [];

  for (const listener of listeners) {
    const result = await listener.backfill({
      ...options,
      logs: options.logsByProtocol?.[listener.config.id] || options.logs || [],
    });
    events.push(...result.events);
    reports.push({
      source: listener.config.id,
      status: result.status,
      events: result.events.length,
      configured: Boolean(listener.config.configured),
    });
  }

  return { events, report: { source: "base-aerodrome-listener", listeners: reports } };
}
