import fs from "node:fs";
import path from "node:path";

const REPORT_FILE = path.resolve("reports", "edge-evidence-discovery-loop.json");

const RESEARCH_TARGETS = Object.freeze({
  CAPITAL_ARRIVAL: {
    mechanism: "CAPITAL_ARRIVAL",
    question: "Does exact, destination-specific prepared capital arrive before the supply window closes?",
    rawEvidenceNeeded: ["wallet", "funding transaction", "target-specific approval", "arrival timestamp", "executed target buy"],
  },
  SELLER_REPLENISHMENT: {
    mechanism: "SELLER_REPLENISHMENT",
    question: "Does observed near-price inventory replenish faster than arriving demand can absorb it?",
    rawEvidenceNeeded: ["holder inventory", "pool transfer", "confirmed sell", "LP mint", "LP burn", "transaction timestamp"],
  },
  BUYER_REPLACEMENT: {
    mechanism: "BUYER_REPLACEMENT",
    question: "Do new resolved transaction initiators replace exhausted buyers before ignition?",
    rawEvidenceNeeded: ["resolved buyer address", "buy transaction", "buy notional", "buyer history", "transaction timestamp"],
  },
  EXECUTION_FRICTION: {
    mechanism: "EXECUTION_FRICTION",
    question: "Does the matched edge survive executable entry and exit costs at the frozen notional?",
    rawEvidenceNeeded: ["fresh buy quote", "fresh sell quote", "route", "price impact", "protocol fee", "gas cost"],
  },
  MARKET_REGIME: {
    mechanism: "MARKET_REGIME",
    question: "Is the treatment effect stable across predeclared market regimes?",
    rawEvidenceNeeded: ["market breadth", "market volatility", "risk regime timestamp"],
  },
  EVIDENCE_COVERAGE: {
    mechanism: "EVIDENCE_COVERAGE",
    question: "Can the hourly exact outcome collector restore terminal treatment and control coverage?",
    rawEvidenceNeeded: ["exact Base token", "frozen pool", "6h price", "24h price", "72h price", "168h price", "provider provenance"],
  },
});

function targetFor(health = {}, autopsy = {}, contrast = {}) {
  if (health.state === "AUTOPILOT_EVIDENCE_COVERAGE_BLOCKED") return RESEARCH_TARGETS.EVIDENCE_COVERAGE;
  const leading = autopsy.leadingObservedFailureMechanism;
  if (leading && RESEARCH_TARGETS[leading]) return RESEARCH_TARGETS[leading];
  const contrastKey = contrast.strongestObservedContrast?.key;
  if (contrastKey === "capitalArrival") return RESEARCH_TARGETS.CAPITAL_ARRIVAL;
  if (contrastKey === "sellerExhaustion" || contrastKey === "supplyVacuum") return RESEARCH_TARGETS.SELLER_REPLENISHMENT;
  if (contrastKey === "buyerReplacement") return RESEARCH_TARGETS.BUYER_REPLACEMENT;
  return RESEARCH_TARGETS.CAPITAL_ARRIVAL;
}

export function buildEdgeDiscoveryLoop(inputs = {}, options = {}) {
  const health = inputs.health || {};
  const outcomeLab = inputs.outcomeLab || {};
  const autopsy = inputs.autopsy || {};
  const contrast = inputs.contrast || {};
  const target = targetFor(health, autopsy, contrast);
  return {
    schemaVersion: 1,
    generatedAt: new Date(options.now || Date.now()).toISOString(),
    state: outcomeLab.verification?.state === "VERIFIED_MATCHED_NET_EDGE"
      ? "EDGE_VERIFIED_NO_HYPOTHESIS_MUTATION"
      : "NEXT_MECHANISM_EXPERIMENT_DEFINED",
    currentHypothesis: "COMMITTED_LOADED_VACUUM_SHADOW",
    hypothesisChanged: false,
    nextExperiment: {
      ...target,
      treatmentDefinitionChanged: false,
      outcomeHorizonsHours: [6, 24, 72, 168],
      exactIdentityRequired: true,
      matchedControlsRequired: true,
      unknownEvidencePolicy: "REMAIN_UNKNOWN",
    },
    evidence: {
      healthState: health.state || "UNKNOWN",
      edgeVerificationState: outcomeLab.verification?.state || "UNKNOWN",
      leadingFailureMechanism: autopsy.leadingObservedFailureMechanism || null,
      strongestObservedContrast: contrast.strongestObservedContrast || null,
    },
    policy: "The discovery loop chooses which raw mechanism evidence to improve next. It cannot retune the treatment from observed outcomes, lower gates, score candidates, or force picks.",
    rankingInfluence: false,
    scoringInfluence: false,
    automaticProductionPromotion: false,
  };
}

export function runEdgeDiscoveryLoop(inputs = {}, options = {}) {
  const report = buildEdgeDiscoveryLoop(inputs, options);
  if (options.writeReport !== false) {
    const file = options.reportFile || REPORT_FILE;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

export const EDGE_DISCOVERY_LOOP_REPORT = REPORT_FILE;
export const __edgeDiscoveryLoopHooks = { targetFor, RESEARCH_TARGETS };
