import test from "node:test";
import assert from "node:assert/strict";
import { observedBuyerCount, readBuyerEvidence } from "../src/data/buyerEvidence.js";
import { analyzeOrganicBuyerClassifier } from "../src/engines/organicBuyerClassifierEngine.js";
import { analyzeWalletCluster } from "../src/engines/walletClusterEngine.js";
import { analyzeOrganicBuyer } from "../src/engines/organicBuyerEngine.js";
import { resolveWalletRelationshipGraph } from "../src/identity/walletRelationshipGraph.js";
import { evaluateEngineDataReadiness } from "../src/engines/engineDataReadinessEngine.js";
import { getEngineContracts } from "../src/kernel/engineContractManifest.js";
import { routeMissingEvidence, buildTargetedEnrichmentPlan } from "../src/data/targetedEnrichmentRouter.js";
import { sourcesForField, recoveryDispositionForField } from "../src/data/enrichmentSourceRegistry.js";
import { createActiveEvidenceExecutionState, executeActiveEvidenceProviderRequests } from "../src/data/activeEvidenceProviderExecutor.js";
import { buildActiveEvidenceRecoveryWaves } from "../src/engines/activeEvidenceRecoveryEngine.js";
import { shouldRerunEngineForEvidenceFamilies } from "../src/intelligencePipeline.js";
import { applyCanonicalAliases, resolveCanonicalAliases } from "../src/data/canonicalAliasResolver.js";

const TOKEN = `0x${"1".repeat(40)}`;
const POOL = `0x${"2".repeat(40)}`;
const classified = { uniqueBuyers24h: 100, independentBuyers24h: 80, sameFunderBuyers24h: 10,
  sniperBuyers24h: 5, deployerConnectedBuyers: 0 };

test("market transactions cannot become unique buyers or sellers through semantic aliases", () => {
  for (const project of [{ txns: { h24: { buys: 217, sells: 99 } } },
    { pair: { txns: { h24: { buys: 217, sells: 99 } } } },
    { buyTransactions24h: 217, sellTransactions24h: 99 }]) {
    const result = resolveCanonicalAliases(project, { fields: ["uniqueBuyers24h", "uniqueSellers24h"] });
    assert.equal(result.resolved.uniqueBuyers24h, null);
    assert.equal(result.resolved.uniqueSellers24h, null);
  }
  assert.equal(resolveCanonicalAliases({ distinctBuyers24h: 12 }, { fields: ["uniqueBuyers24h"] }).resolved.uniqueBuyers24h, 12);
});

test("legacy aliases sourced from transaction counts cannot survive repeated canonicalization", () => {
  let project = { txns: { h24: { buys: 217 } }, uniqueBuyers24h: 217,
    canonicalAliases: { uniqueBuyers24h: 217 },
    canonicalAliasProvenance: { uniqueBuyers24h: { sourcePath: "txns.h24.buys" } } };
  for (let pass = 0; pass < 2; pass++) {
    project = applyCanonicalAliases(project, { fields: ["uniqueBuyers24h"] });
    assert.equal(project.uniqueBuyers24h, null);
    assert.equal(project.canonicalAliases.uniqueBuyers24h, null);
    assert.equal(readBuyerEvidence(project).totalBuyers, null);
  }
});

function analyze(project) {
  const projectIdentityGraph = { walletGraph: resolveWalletRelationshipGraph(project) };
  return analyzeOrganicBuyer(analyzeWalletCluster(analyzeOrganicBuyerClassifier({ ...project, projectIdentityGraph })));
}

test("missing buyer evidence cannot manufacture independence, cluster safety or bullish scores", () => {
  const result = analyze({});
  assert.equal(result.organicBuyerScore, null);
  assert.equal(result.firstRealBuyerScore, null);
  assert.equal(result.organicBuyerClassifier.independentBuyers, null);
  assert.equal(result.walletClusterScore, null);
  assert.equal(result.walletClusterRiskScore, null);
  assert.equal(result.organicDemandFirewallScore, null);
  assert.equal(result.organicDemandFirewallRisk, null);
  assert.equal(result.organicDemandFirewallStatus, "UNVERIFIED");
  assert.equal(result.projectIdentityGraph.walletGraph.walletRelationshipScore, null);
  assert.equal(result.projectIdentityGraph.walletGraph.clusterRiskScore, null);
  assert.equal(result.walletCluster.dataStatus, "UNKNOWN");
});

test("unclassified buyers and raw wallet addresses are not independently funded buyers", () => {
  for (const project of [{ uniqueBuyers24h: 100 }, { wallets: [TOKEN], holderAddresses: [TOKEN] },
    { uniqueBuyers24h: 100, organicBuyerScore: 99, walletClusterScore: 99, smartWalletScore: 100 }]) {
    const result = analyze(project);
    assert.equal(result.organicBuyerClassifier.independentBuyers, null);
    assert.equal(result.organicBuyerClassifier.organicSharePct, null);
    assert.equal(result.organicBuyerScore, null);
    assert.equal(result.walletClusterScore, null);
    assert.equal(result.organicDemandFirewallStatus, "UNVERIFIED");
  }
});

test("zero is observed only when explicit and cannot fall through to native positive counts", () => {
  const result = analyze({ uniqueBuyers24h: 0, independentBuyers24h: 0, sameFunderBuyers24h: 0,
    sniperBuyers24h: 0, deployerConnectedBuyers: 0, nativeLifecycle: { buyerState: { uniqueBuyers: 100,
      independentBuyers: 90, sameFunderBuyers: 5, sniperBuyers: 5 } } });
  assert.equal(result.organicBuyerClassifier.uniqueBuyers, 0);
  assert.equal(result.organicBuyerClassifier.independentBuyers, 0);
  assert.equal(result.organicBuyerScore, 0);
  assert.equal(result.organicDemandFirewallStatus, "UNVERIFIED");
  assert.equal(result.walletClusterRiskScore, null);
});

test("invalid and coerced buyer counts remain unknown", () => {
  for (const value of [null, undefined, "", " ", false, true, [], {}, NaN, Infinity, -1, 1.5, "invalid"]) {
    assert.equal(observedBuyerCount(value), null);
    assert.equal(readBuyerEvidence({ uniqueBuyers24h: value }).totalBuyers, null);
  }
  assert.equal(observedBuyerCount("12"), 12);
  assert.equal(observedBuyerCount(0), 0);
});

test("actual independent buyer classification still produces a supported positive score", () => {
  const result = analyze({ ...classified, buyVolumeUsd: 20000, sellVolumeUsd: 10000,
    buyerRetentionScore: 90, smartWalletArrivalScore: 90, washTradingScore: 90 });
  assert.ok(result.organicBuyerScore >= 76);
  assert.ok(result.walletClusterScore >= 70);
  assert.equal(result.organicBuyerClassifier.independentBuyers, 80);
  assert.equal(result.organicDemandFirewallStatus, "PASS");
  assert.equal(result.walletCluster.classifierEvidenceAvailable, true);
});

test("partial known malicious clustering remains visible without assuming unknown categories are zero", () => {
  const result = analyze({ uniqueBuyers24h: 100, sameFunderBuyers24h: 80 });
  assert.ok(result.walletClusterRiskScore >= 70);
  assert.equal(result.walletClusterVerdict, "Manipulated Wallet Cluster");
  assert.equal(result.walletClusterScore, null);
  assert.equal(result.walletCluster.independentBuyers, null);
  assert.equal(result.organicDemandFirewallStatus, "UNVERIFIED");
});

test("contradictory independent counts cannot create a supported bullish classification", () => {
  const result = analyze({ ...classified, independentBuyers24h: 101 });
  assert.equal(result.organicBuyerClassifier.dataStatus, "CONFLICTED_DATA");
  assert.equal(result.organicBuyerScore, null);
  assert.equal(result.walletClusterScore, null);
  assert.equal(result.organicDemandFirewallStatus, "UNVERIFIED");
  assert.equal(result.organicBuyerClassifier.classifications.includes("distributed buyer base"), false);
});

test("any classification larger than the total buyer population blocks positive classification", () => {
  for (const field of ["sameFunderBuyers24h", "sniperBuyers24h", "deployerConnectedBuyers"]) {
    const result = analyze({ ...classified, [field]: 101 });
    assert.equal(result.organicBuyerClassifier.dataStatus, "CONFLICTED_DATA");
    assert.equal(result.organicBuyerScore, null);
    assert.equal(result.walletClusterScore, null);
    assert.notEqual(result.organicDemandFirewallStatus, "PASS");
  }
});

test("unknown sell volume does not become net buyer pressure", () => {
  const result = analyzeOrganicBuyerClassifier({ ...classified, buyVolumeUsd: 20000 });
  assert.equal(result.organicBuyerClassifier.sellVolumeUsd, null);
  assert.equal(result.organicBuyerClassifier.classifications.includes("net buyer pressure"), false);
});

test("producer outputs cannot satisfy their own missing raw input contract", () => {
  const contracts = getEngineContracts();
  const project = { organicBuyerScore: 99, walletClusterRiskScore: 0, smartWalletScore: 99, holderGrowthScore: 99 };
  for (const id of ["organicBuyerClassifier", "walletCluster"]) {
    const result = evaluateEngineDataReadiness(project, contracts.find((item) => item.id === id));
    assert.equal(result.status, "DATA_STARVED");
  }
});

test("provider routing honors individual raw field capabilities and derived recomputation", () => {
  for (const field of ["uniqueBuyers24h", "buyerAddresses", "sellerAddresses", "smartWallets",
    "trackedWallets", "smartWalletBuyCount", "smartWalletBuyVolumeUsd"]) {
    assert.deepEqual(sourcesForField(field), []);
    const route = routeMissingEvidence({ canonicalField: field });
    assert.equal(route.recoveryDisposition, "UNAVAILABLE_WITH_CURRENT_PROVIDERS");
    assert.equal(route.recoverable, false);
    assert.equal(route.estimatedRequests, 0);
  }
  assert.deepEqual(sourcesForField("buyTransactions24h").map((source) => source.source), ["DexScreener"]);
  assert.equal(routeMissingEvidence({ canonicalField: "buyTransactions24h" }).evidenceFamily, "MARKET");
  assert.ok(sourcesForField("wallets").some((source) => source.source === "chain RPC"));
  assert.deepEqual(sourcesForField("walletParticipationHistory").map((source) => source.source),
    ["chain RPC", "block explorers", "wallet-history database"]);
  for (const field of ["developerActivityScore", "catalystScore", "smartWalletScore"]) {
    assert.equal(recoveryDispositionForField(field), "DERIVED_RECOMPUTE");
  }
  const notApplicable = routeMissingEvidence({ canonicalField: "wallets", applicability: "NOT_APPLICABLE" });
  assert.deepEqual(notApplicable.targetSources, []);
  assert.equal(notApplicable.estimatedRequests, 0);
});

test("stale plans cannot spend provider budget on unavailable wallet outputs", async () => {
  const item = { canonicalField: "smartWalletBuyCount", recoverable: true, recoveryDisposition: "RAW_RECOVERABLE",
    targetSources: [{ source: "block explorers" }] };
  const waves = buildActiveEvidenceRecoveryWaves([{ targetedEnrichmentPlan: { items: [item] } }]);
  assert.ok(Object.values(waves.waves).every((candidates) => candidates.length === 0));
  let calls = 0;
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 20 });
  const result = await executeActiveEvidenceProviderRequests({ chain: "base", tokenAddress: TOKEN }, [item], {
    providers: { getWalletEvidence: async () => { calls++; throw new Error("transfer provider cannot prove smart trades"); } },
  }, state);
  assert.equal(calls, 0);
  assert.equal(state.requestsUsed, 0);
  assert.deepEqual(result.observations, []);
});

test("market transaction counts use exact DexScreener recovery without a wallet RPC", async () => {
  let dexCalls = 0;
  let walletCalls = 0;
  const plan = buildTargetedEnrichmentPlan([{ canonicalField: "buyTransactions24h" }, { canonicalField: "sellTransactions24h" }]);
  const state = createActiveEvidenceExecutionState({ maxProviderRequests: 1 });
  const result = await executeActiveEvidenceProviderRequests({ chain: "base", tokenAddress: TOKEN, poolAddress: POOL }, plan.items, {
    providers: {
      getTokenPairs: async () => { dexCalls++; return [{ chainId: "base", pairAddress: POOL,
        baseToken: { address: TOKEN, symbol: "EXACT" }, quoteToken: { address: `0x${"3".repeat(40)}` },
        priceUsd: "0.5", liquidity: { usd: 100000 }, volume: { h24: 10000 }, txns: { h24: { buys: 12, sells: 7 } } }]; },
      getWalletEvidence: async () => { walletCalls++; return {}; },
    },
  }, state);
  assert.equal(dexCalls, 1);
  assert.equal(walletCalls, 0);
  assert.equal(result.observations.find((item) => item.field === "buyTransactions24h")?.value, 12);
  assert.equal(result.observations.find((item) => item.field === "sellTransactions24h")?.value, 7);
  assert.equal(state.requestsUsed, 1);
});

test("recovered lifecycle and wallet evidence reruns the engines that consume it", () => {
  for (const engine of ["Organic Buyer Classifier", "Wallet Cluster", "Wash Trading", "Organic Buyer Firewall", "Organic Demand Integrity"]) {
    assert.equal(shouldRerunEngineForEvidenceFamilies(engine, ["DEPLOYER"]), true);
    assert.equal(shouldRerunEngineForEvidenceFamilies(engine, ["MARKET"]), true);
    assert.equal(shouldRerunEngineForEvidenceFamilies(engine, ["EXECUTION"]), false);
  }
  assert.equal(shouldRerunEngineForEvidenceFamilies("Project Identity Graph", ["WALLETS"]), true);
  const before = analyze({});
  const after = analyze({ ...before, nativeLifecycle: { buyerState: { uniqueBuyers: 100,
    independentBuyers: 80, sameFunderBuyers: 10, sniperBuyers: 5, deployerConnectedBuyers: 0 } } });
  assert.equal(before.organicBuyerScore, null);
  assert.ok(after.organicBuyerScore >= 76);
  assert.ok(after.walletClusterScore >= 70);
});
