import { clamp, num } from "../edge/edgeMath.js";
import { normalizeIgnitionSignals } from "../ignition/ignitionSignalNormalizer.js";

function pct(value) {
  const parsed = num(value);
  return parsed === null ? null : clamp(parsed, 0, 100);
}

function compressionPct(previous, current) {
  const left = num(previous);
  const right = num(current);
  if (left === null || right === null || left <= 0 || right < 0) return null;
  return ((left - right) / left) * 100;
}

export function analyzeEffectiveFloat(project = {}, options = {}) {
  const signals = options.signals || normalizeIgnitionSignals(project);
  const supply = signals.supply || {};
  const marketCapUsd = num(signals.market?.marketCapUsd);
  const explicit = num(supply.explicitEffectiveFreeFloatUsd);

  if (explicit !== null && explicit >= 0) {
    const ratioPct = marketCapUsd && marketCapUsd > 0 ? clamp((explicit / marketCapUsd) * 100) : null;
    const compression = compressionPct(
      project.previousEffectiveFreeFloatUsd ?? project.ignitionTwinPrevious?.effectiveFreeFloatUsd,
      explicit
    );
    return {
      ...project,
      effectiveFloat: {
        mode: "DIRECT_EFFECTIVE_FLOAT",
        effectiveFreeFloatUsd: explicit,
        effectiveFreeFloatRatioPct: ratioPct,
        compressionPct: compression,
        confidencePct: 90,
        exclusions: [],
        dormantSupplyNotSubtracted: true,
        shadowOnly: true,
        rankingInfluence: false,
      },
      effectiveFreeFloatUsd: explicit,
      effectiveFreeFloatRatioPct: ratioPct,
      effectiveFloatCompressionPct: compression,
    };
  }

  const components = [
    ["staked", pct(supply.stakedPct)],
    ["locked", pct(supply.lockedPct)],
    ["treasuryNonTrading", pct(supply.treasuryNonTradingPct)],
    ["bridgeLocked", pct(supply.bridgeLockedPct)],
  ].filter(([, value]) => value !== null);

  if (!marketCapUsd || marketCapUsd <= 0 || !components.length) {
    return {
      ...project,
      effectiveFloat: {
        mode: "UNOBSERVED",
        effectiveFreeFloatUsd: null,
        effectiveFreeFloatRatioPct: null,
        compressionPct: null,
        confidencePct: components.length ? 25 : 0,
        exclusions: components.map(([name, value]) => ({ name, pct: value })),
        dormantSupplyNotSubtracted: true,
        reason: !marketCapUsd ? "Circulating market capitalization is unavailable." : "No verified or explicitly estimated locked/non-trading supply components are available.",
        shadowOnly: true,
        rankingInfluence: false,
      },
      effectiveFreeFloatUsd: null,
      effectiveFreeFloatRatioPct: null,
      effectiveFloatCompressionPct: null,
    };
  }

  const rawExcludedPct = components.reduce((sum, [, value]) => sum + value, 0);
  const excludedPct = Math.min(95, rawExcludedPct);
  const estimated = marketCapUsd * (1 - excludedPct / 100);
  const ratioPct = clamp((estimated / marketCapUsd) * 100);
  const confidencePct = Math.round(clamp(30 + components.length * 11 - Math.max(0, rawExcludedPct - 95) * 0.5, 0, 78));
  const compression = compressionPct(
    project.previousEffectiveFreeFloatUsd ?? project.ignitionTwinPrevious?.effectiveFreeFloatUsd,
    estimated
  );

  return {
    ...project,
    effectiveFloat: {
      mode: "COMPONENT_ESTIMATE",
      effectiveFreeFloatUsd: estimated,
      effectiveFreeFloatRatioPct: ratioPct,
      excludedPct,
      rawExcludedPct,
      compressionPct: compression,
      confidencePct,
      exclusions: components.map(([name, value]) => ({ name, pct: value })),
      dormantSupplyNotSubtracted: true,
      caution: "Dormant wallets are not treated as locked supply. Component estimates can overlap and must not be treated as audited float.",
      shadowOnly: true,
      rankingInfluence: false,
    },
    effectiveFreeFloatUsd: estimated,
    effectiveFreeFloatRatioPct: ratioPct,
    effectiveFloatCompressionPct: compression,
  };
}

export function analyzeEffectiveFloatBatch(projects = [], options = {}) {
  return (Array.isArray(projects) ? projects : []).map((project) => analyzeEffectiveFloat(project, options));
}

export default analyzeEffectiveFloat;
