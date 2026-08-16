function finite(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function projectKey(project = {}, index = 0) {
  if (project.canonicalProjectId) return String(project.canonicalProjectId);
  const chain = String(project.chain || project.canonicalChain || project.network || project.chainId || "unknown").toLowerCase();
  const token = String(project.tokenAddress || project.contractAddress || project.address || "").toLowerCase();
  const pool = String(project.poolAddress || project.pairAddress || "").toLowerCase();
  if (/^0x[0-9a-f]{40}$/.test(token)) return `${chain}:${token}`;
  if (/^0x[0-9a-f]{40}$/.test(pool)) return `${chain}:pool:${pool}`;
  return `${chain}:symbol:${String(project.symbol || project.name || index).toLowerCase()}`;
}

function ignitionCapitalFor(project = {}) {
  return finite(project.ignitionTwin?.ignitionCapitalUsd ?? project.ignitionCapitalUsd);
}

export function attachCapitalArrivalIntelligence(projects = [], ledgersByHorizon = {}) {
  const horizons = Object.keys(ledgersByHorizon).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  return (Array.isArray(projects) ? projects : []).map((project, index) => {
    const key = projectKey(project, index);
    const ignitionCapitalUsd = ignitionCapitalFor(project);
    const arrivalCurve = horizons.map((h) => {
      const expected = finite(ledgersByHorizon[h]?.candidateExpectedArrivalUsd?.[key]) ?? 0;
      return {
        horizonHours: h,
        expectedArrivingCapitalUsd: Number(expected.toFixed(2)),
        expectedArrivalToIgnitionRatio: ignitionCapitalUsd && ignitionCapitalUsd > 0 ? Number((expected / ignitionCapitalUsd).toFixed(4)) : null,
      };
    });
    const six = arrivalCurve.find((row) => row.horizonHours === 6) || arrivalCurve.find((row) => row.horizonHours >= 6) || arrivalCurve.at(-1) || null;
    const ratio = finite(six?.expectedArrivalToIgnitionRatio);
    const supplyVacuumSupported = [
      "VACUUM_INTEGRITY_SUPPORTED", "SUPPLY_VACUUM", "SELLER_EXHAUSTION",
    ].includes(project.ignitionRawSensors?.supplyLineageIntelligence?.vacuumIntegrityState || project.supplyLineageIntelligence?.vacuumIntegrityState || project.ignitionTwin?.vacuumIntegrityState);
    const state = ratio !== null && ratio >= 1 && supplyVacuumSupported
      ? "COMMITTED_LOADED_VACUUM_SHADOW"
      : ratio !== null && ratio >= 0.5
        ? "ARRIVAL_PRESSURE_BUILDING_SHADOW"
        : arrivalCurve.some((row) => row.expectedArrivingCapitalUsd > 0)
          ? "ARRIVAL_EVIDENCE_SHADOW"
          : "NO_CALIBRATED_ARRIVAL_EVIDENCE";
    return {
      ...project,
      capitalArrivalIntelligence: {
        state,
        ignitionCapitalUsd,
        arrivalCurve,
        sixHourExpectedArrivalUsd: six?.expectedArrivingCapitalUsd ?? 0,
        sixHourExpectedArrivalToIgnitionRatio: ratio,
        supplyVacuumSupported,
        evidenceClass: "EXPERIMENTAL_CALIBRATED_SHADOW",
        shadowOnly: true,
        rankingInfluence: false,
        loadedVacuumInfluence: false,
        warning: "Committed Loaded Vacuum is a shadow research state only. Expected arrival is probability-weighted historical evidence, not observed demand, and cannot arm or ignite production decisions in v10.",
      },
    };
  });
}

export const __capitalArrivalCurveHooks = { projectKey, ignitionCapitalFor };
