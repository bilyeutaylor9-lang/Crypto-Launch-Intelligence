import { num } from "../edge/edgeMath.js";
import { normalizeEvidenceState } from "./featureEvidencePolicy.js";

const RECOVERABLE_STATES = new Set(["MISSING", "STALE", "CONFLICTED"]);

function clamp01(value) {
  const parsed = num(value);
  return parsed === null ? 0 : Math.max(0, Math.min(1, parsed));
}

function hasOutcome(row) {
  return Object.values(row?.outcomes || {}).some((outcome) => num(outcome?.endReturnPct) !== null);
}

export function rankMissingEvidenceValue(rows = [], featureNames = [], options = {}) {
  const rawWeights = {
    missingRate: Math.max(0, Number(options.missingRateWeight ?? 0.45)),
    outcomeCoverage: Math.max(0, Number(options.outcomeCoverageWeight ?? 0.30)),
    strategicPriority: Math.max(0, Number(options.strategicPriorityWeight ?? 0.25)),
  };
  const weightTotal = Object.values(rawWeights).reduce((sum, value) => sum + value, 0) || 1;
  const weights = Object.fromEntries(
    Object.entries(rawWeights).map(([name, value]) => [name, value / weightTotal])
  );
  const strategicPriority = options.strategicPriority || {};

  return featureNames.map((feature) => {
    const applicable = rows.filter((row) =>
      normalizeEvidenceState(row?.evidence?.[feature]?.state) !== "NOT_APPLICABLE"
    );
    const missingRows = applicable.filter((row) =>
      RECOVERABLE_STATES.has(normalizeEvidenceState(row?.evidence?.[feature]?.state))
    );
    const outcomeCoveredMissing = missingRows.filter(hasOutcome).length;
    const missingRate = applicable.length ? missingRows.length / applicable.length : 0;
    const outcomeCoverage = missingRows.length ? outcomeCoveredMissing / missingRows.length : 0;
    const priority = clamp01(strategicPriority[feature] ?? 0.5);
    return {
      feature,
      rows: rows.length,
      applicable: applicable.length,
      missing: missingRows.length,
      outcomeCoveredMissing,
      missingRatePct: missingRate * 100,
      resolvedOutcomeCoveragePct: outcomeCoverage * 100,
      strategicPriority: priority,
      valueOfInformationScore: 100 * (
        weights.missingRate * missingRate +
        weights.outcomeCoverage * outcomeCoverage +
        weights.strategicPriority * priority
      ),
      automaticPromotion: false,
    };
  }).sort((left, right) =>
    right.valueOfInformationScore - left.valueOfInformationScore ||
    String(left.feature).localeCompare(String(right.feature))
  );
}
