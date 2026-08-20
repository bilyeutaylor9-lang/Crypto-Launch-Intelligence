import fs from "fs";
import path from "path";

import {
  chainCapitalRadarObservationAvailable,
  observeChainWideCapitalRadar,
} from "../sensors/chainWideCapitalRadarSensor.js";
import {
  appendChainCapitalRadarObservations,
  chainCapitalRadarHistoryFor,
} from "../data/chainCapitalRadarObservationStore.js";

function extractProjects(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["projects", "opportunities", "candidates", "results", "tokens", "data"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

const input = process.argv[2] || process.env.IGNITION_SENSOR_INPUT || path.resolve("reports", "report.json");
const reportFile = path.resolve("reports", "chain-capital-radar.json");
if (!fs.existsSync(input)) {
  console.error(`Chain Capital Radar: input file not found: ${input}`);
  process.exitCode = 1;
} else {
  const payload = JSON.parse(fs.readFileSync(input, "utf8"));
  const projects = extractProjects(payload);
  if (!projects.length) {
    console.error(`Chain Capital Radar: no candidate array found in ${input}.`);
    process.exitCode = 1;
  } else {
    const chains = [...new Set(projects.map((project) => String(project.chain || project.canonicalChain || project.network || project.chainId || "").toLowerCase()).filter(Boolean))];
    const historyByChain = Object.fromEntries(chains.map((chain) => [chain, chainCapitalRadarHistoryFor(chain, { limit: Number(process.env.IGNITION_CAPITAL_RADAR_HISTORY_LIMIT || 120) })]));
    const radar = await observeChainWideCapitalRadar(projects, {
      historyByChain,
      lookbackMinutes: Number(process.env.IGNITION_CAPITAL_RADAR_LOOKBACK_MINUTES || 20),
      maxLookbackBlocks: Number(process.env.IGNITION_CAPITAL_RADAR_MAX_LOOKBACK_BLOCKS || 600),
      maxWallets: Number(process.env.IGNITION_CAPITAL_RADAR_MAX_WALLETS || 80),
      minTransferUsd: Number(process.env.IGNITION_CAPITAL_RADAR_MIN_TRANSFER_USD || 5000),
    });
    appendChainCapitalRadarObservations(radar.chains || []);
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(reportFile, JSON.stringify(radar, null, 2));
    const observed = (radar.chains || []).filter(chainCapitalRadarObservationAvailable);
    console.log(JSON.stringify({
      input,
      candidates: projects.length,
      chains: radar.chains?.length || 0,
      observedChains: observed.length,
      discoveredWallets: observed.reduce((sum, row) => sum + (row.discoveredWalletCount || 0), 0),
      preparedWallets: observed.reduce((sum, row) => sum + (row.preparedWalletCount || 0), 0),
      executionReadyCapitalUsd: observed.reduce((sum, row) => sum + (row.executionReadyCapitalUsd || 0), 0),
      assignedExecutionReadyCapitalUsd: observed.reduce((sum, row) => sum + (row.assignedExecutionReadyCapitalUsd || 0), 0),
      report: reportFile,
    }, null, 2));
  }
}

export { extractProjects };
