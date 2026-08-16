import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import {
  capitalPathFeatureVector,
  capitalPathSignatureLevels,
  extractUnassignedCapitalPathFeatures,
  __capitalPathFeatureTestHooks,
} from "../src/learning/capitalPathFeatureExtractor.js";
import {
  trainCapitalDestinationPathModel,
  predictCapitalDestination,
  inferCapitalDestinations,
} from "../src/learning/capitalDestinationPathModel.js";
import {
  aggregateCapitalPathPredictions,
  attachCapitalPathPredictions,
} from "../src/engines/capitalPathPredictionEngine.js";
import { runCapitalPathWalkForwardLab } from "../src/learning/capitalPathWalkForwardLab.js";
import { observedTargetBuyEvents } from "../src/data/capitalPathLearningStore.js";
import { processCapitalPathLearning } from "../src/learning/capitalPathLearningCoordinator.js";

const WALLET = "0x1111111111111111111111111111111111111111";
const WALLET2 = "0x2222222222222222222222222222222222222222";
const ROUTER = "0x3333333333333333333333333333333333333333";
const TARGET = "0x4444444444444444444444444444444444444444";
const TOKEN_A = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TOKEN_B = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PROJECT_A = `base:${TOKEN_A}`;
const PROJECT_B = `base:${TOKEN_B}`;

function wallet(overrides = {}) {
  return {
    address: WALLET,
    newlyDiscovered: true,
    observedStablecoinInflowUsd: 40_000,
    freshAvailableCapitalUsd: 40_000,
    executionReadyCapitalUsd: 40_000,
    executionPrepared: true,
    nativeGasReady: true,
    fundingSources: [{ address: "0x5555555555555555555555555555555555555555", amountUsd: 40_000 }],
    fundingEvents: [{ tokenSymbol: "USDC", eventTime: "2026-08-13T12:00:00.000Z", amountUsd: 40_000 }],
    approvalEvents: [{
      spender: ROUTER,
      tokenSymbol: "USDC",
      eventTime: "2026-08-13T12:03:00.000Z",
      genericCandidateKeys: [PROJECT_A, PROJECT_B],
      targetCandidateKeys: [],
    }],
    destination: { state: "CHAIN_LEVEL_ONLY", assignedProjectKey: null, confidencePct: 0 },
    ...overrides,
  };
}

function chainObservation(overrides = {}) {
  return {
    chain: "base",
    observedAt: "2026-08-13T12:05:00.000Z",
    blockNumber: 1000,
    wallets: [wallet()],
    ...overrides,
  };
}

function feature(overrides = {}) {
  return {
    ...capitalPathFeatureVector(wallet(), chainObservation()),
    ...overrides,
  };
}

function example(i, destination = PROJECT_A, overrides = {}) {
  const hour = String((i % 20) + 1).padStart(2, "0");
  const walletAddress = `0x${(1000 + i).toString(16).padStart(40, "0")}`;
  return {
    snapshotId: `s${i}`,
    feature: feature({
      snapshotId: `s${i}`,
      walletAddress,
      featureObservedAt: `2026-08-01T${hour}:00:00.000Z`,
    }),
    destinationProjectKey: destination,
    outcomeObservedAt: `2026-08-02T${hour}:00:00.000Z`,
    episodeKey: `e${i}`,
    ...overrides,
  };
}

test("feature extractor excludes target-specific approvals from route features", () => {
  const f = capitalPathFeatureVector(wallet({
    approvalEvents: [{ spender: TARGET, targetCandidateKeys: [PROJECT_A], genericCandidateKeys: [], eventTime: "2026-08-13T12:02:00Z" }],
  }), chainObservation());
  assert.equal(f.genericRouteKey, "NO_GENERIC_ROUTE");
  assert.equal(f.approvalCount, 0);
  assert.match(f.featurePolicy, /Target-specific approvals/i);
});

test("feature extractor keeps generic route preparation and bucketing only", () => {
  const f = feature();
  assert.equal(f.genericRouteKey, ROUTER);
  assert.equal(f.inflowSizeBucket, "25K_100K");
  assert.equal(f.fundingSourceCountBucket, "ONE");
  assert.equal(f.fundingToApprovalLatencyBucket, "2M_10M");
  assert.equal(f.stablecoinMix, "USDC");
});

test("unassigned extractor ignores already assigned destinations", () => {
  const radar = { chains: [chainObservation({ wallets: [wallet(), wallet({ address: WALLET2, destination: { assignedProjectKey: PROJECT_A } })] })] };
  const rows = extractUnassignedCapitalPathFeatures(radar);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].walletAddress, WALLET);
});

test("signature hierarchy never embeds destination project keys", () => {
  const signatures = capitalPathSignatureLevels(feature());
  assert.equal(signatures.length, 5);
  assert.ok(signatures.every((row) => !row.key.includes(TOKEN_A) && !row.key.includes(TOKEN_B)));
});

test("model ignores outcomes that occur after the requested as-of time", () => {
  const early = example(1, PROJECT_A, { outcomeObservedAt: "2026-08-03T00:00:00Z" });
  const future = example(2, PROJECT_B, { outcomeObservedAt: "2026-08-20T00:00:00Z" });
  const model = trainCapitalDestinationPathModel([early, future], { asOf: "2026-08-10T00:00:00Z" });
  assert.equal(model.trainingExamples, 1);
});

test("model abstains with insufficient historical analogs", () => {
  const model = trainCapitalDestinationPathModel([example(1), example(2)]);
  const result = predictCapitalDestination(feature(), model, [PROJECT_A, PROJECT_B], { minSupport: 6, minUniqueWallets: 4 });
  assert.equal(result.state, "ABSTAIN_INSUFFICIENT_ANALOGS");
});

test("model emits a shadow destination only after sufficient consistent support", () => {
  const rows = Array.from({ length: 8 }, (_, i) => example(i + 1, PROJECT_A));
  const model = trainCapitalDestinationPathModel(rows);
  const result = predictCapitalDestination(feature(), model, [PROJECT_A, PROJECT_B], { minSupport: 6, minUniqueWallets: 4, minWilsonLower: 0.3 });
  assert.equal(result.state, "PREDICTED_DESTINATION_SHADOW");
  assert.equal(result.predictedProjectKey, PROJECT_A);
  assert.equal(result.loadedVacuumInfluence, false);
});

test("ambiguous analog destinations force abstention", () => {
  const rows = Array.from({ length: 10 }, (_, i) => example(i + 1, i % 2 ? PROJECT_A : PROJECT_B));
  const model = trainCapitalDestinationPathModel(rows);
  const result = predictCapitalDestination(feature(), model, [PROJECT_A, PROJECT_B], { minSupport: 6, minUniqueWallets: 4 });
  assert.equal(result.state, "ABSTAIN_AMBIGUOUS");
});

test("novel route does not fall back to a chain popularity guess by default", () => {
  const rows = Array.from({ length: 10 }, (_, i) => example(i + 1, PROJECT_A));
  const model = trainCapitalDestinationPathModel(rows);
  const result = predictCapitalDestination(feature({ genericRouteKey: "0x9999999999999999999999999999999999999999" }), model, [PROJECT_A, PROJECT_B], { minSupport: 6, minUniqueWallets: 4 });
  assert.equal(result.state, "ABSTAIN_INSUFFICIENT_ANALOGS");
});

test("probability-weighted capital remains separate from observed staged capital", () => {
  const predictionRows = [{
    feature: feature({ executionReadyCapitalUsd: 50_000 }),
    prediction: { state: "PREDICTED_DESTINATION_SHADOW", predictedProjectKey: PROJECT_A, empiricalProbabilityPct: 70, support: 20, signatureLevel: "L2_ROUTE_SIZE", confidencePct: 75 },
  }];
  const aggregate = aggregateCapitalPathPredictions(predictionRows, [{ chain: "base", tokenAddress: TOKEN_A }, { chain: "base", tokenAddress: TOKEN_B }]);
  assert.equal(aggregate.get(PROJECT_A).inferredProbabilityWeightedCapitalUsd, 35_000);
  assert.equal(aggregate.get(PROJECT_A).rawCapitalBehindPredictionsUsd, 50_000);
});

test("attached path predictions cannot influence Loaded Vacuum or ranking", () => {
  const predictionRows = [{
    feature: feature({ executionReadyCapitalUsd: 50_000 }),
    prediction: { state: "PREDICTED_DESTINATION_SHADOW", predictedProjectKey: PROJECT_A, empiricalProbabilityPct: 80, support: 30, signatureLevel: "L2_ROUTE_SIZE", confidencePct: 80 },
  }];
  const [project] = attachCapitalPathPredictions([{ chain: "base", tokenAddress: TOKEN_A, candidateAdjustedStagedCapitalUsd: 0 }], predictionRows);
  assert.equal(project.capitalPathPrediction.loadedVacuumInfluence, false);
  assert.equal(project.capitalPathPrediction.rankingInfluence, false);
  assert.equal(project.candidateAdjustedStagedCapitalUsd, 0);
  assert.equal(project.capitalPathInferredUsd, 40_000);
});

test("observed target labels require a resolved buy actor with adequate confidence", () => {
  const good = observedTargetBuyEvents([{
    chain: "base",
    tokenAddress: TOKEN_A,
    ignitionRawSensors: { eventTape: { events: [{ eventType: "SWAP", side: "BUY", economicActorAddress: WALLET, actorResolutionConfidencePct: 88, eventTime: "2026-08-13T13:00:00Z", txHash: "0xabc" }] } },
  }]);
  const weak = observedTargetBuyEvents([{
    chain: "base",
    tokenAddress: TOKEN_A,
    ignitionRawSensors: { eventTape: { events: [{ eventType: "SWAP", side: "BUY", actorAddress: WALLET2, actorResolutionConfidencePct: 20, eventTime: "2026-08-13T13:00:00Z" }] } },
  }]);
  assert.equal(good.length, 1);
  assert.equal(good[0].labelSource, "RESOLVED_TARGET_BUY");
  assert.equal(weak.length, 0);
});

test("walk-forward lab trains only on outcomes known before each test feature", () => {
  const rows = [];
  for (let i = 0; i < 18; i += 1) {
    const day = String(i + 1).padStart(2, "0");
    rows.push({
      ...example(i + 1, PROJECT_A),
      feature: feature({ snapshotId: `wf${i}`, walletAddress: `0x${(5000+i).toString(16).padStart(40,"0")}`, featureObservedAt: `2026-07-${day}T00:00:00Z` }),
      outcomeObservedAt: `2026-07-${day}T12:00:00Z`,
      episodeKey: `wf${i}`,
    });
  }
  const lab = runCapitalPathWalkForwardLab(rows, { minTrainExamples: 6, minSupport: 4, minUniqueWallets: 3, promotionMinExamples: 100 });
  assert.equal(lab.status, "EVALUATED");
  assert.ok(lab.testablePredictions > 0);
  assert.match(lab.leakageRule, /already observed before/i);
  assert.equal(lab.promotionState, "SHADOW_MODE");
});

test("walk-forward promotion gate never auto-promotes a tiny perfect sample", () => {
  const rows = Array.from({ length: 12 }, (_, i) => example(i + 1, PROJECT_A));
  const lab = runCapitalPathWalkForwardLab(rows, { minTrainExamples: 5, minSupport: 4, minUniqueWallets: 3 });
  assert.equal(lab.promotionState, "SHADOW_MODE");
  assert.equal(lab.requirements.resolvedExamples, false);
});

test("learning store resolves only a strictly earlier feature snapshot, not same-time data", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "capital-path-store-"));
  const moduleUrl = pathToFileURL(path.resolve("src/data/capitalPathLearningStore.js")).href;
  const script = `
    import fs from 'node:fs';
    import { appendCapitalPathFeatureSnapshots, resolveCapitalPathOutcomes, loadCapitalPathTrainingExamples } from '${moduleUrl}';
    const wallet='${WALLET}', route='${ROUTER}', project='${PROJECT_A}';
    const makeRadar=(time, block)=>({chains:[{chain:'base',observedAt:time,blockNumber:block,wallets:[{address:wallet,executionPrepared:true,executionReadyCapitalUsd:40000,nativeGasReady:true,fundingSources:[{address:'0x5555555555555555555555555555555555555555',amountUsd:40000}],fundingEvents:[{tokenSymbol:'USDC',eventTime:'2026-08-13T12:00:00Z'}],approvalEvents:[{spender:route,tokenSymbol:'USDC',eventTime:'2026-08-13T12:03:00Z',genericCandidateKeys:[project],targetCandidateKeys:[]}],destination:{assignedProjectKey:null}}]}]});
    appendCapitalPathFeatureSnapshots(makeRadar('2026-08-13T12:05:00Z',1000));
    appendCapitalPathFeatureSnapshots(makeRadar('2026-08-13T13:00:00Z',1001));
    const projects=[{chain:'base',tokenAddress:'${TOKEN_A}',ignitionRawSensors:{eventTape:{events:[{eventType:'SWAP',side:'BUY',economicActorAddress:wallet,actorResolutionConfidencePct:90,eventTime:'2026-08-13T13:00:00Z',txHash:'0xabc'}]}}}];
    const result=resolveCapitalPathOutcomes(projects);
    const examples=loadCapitalPathTrainingExamples();
    console.log(JSON.stringify({saved:result.saved,examples:examples.map(e=>e.feature.featureObservedAt)}));
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: tmp, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout.trim());
  assert.equal(parsed.saved, 1);
  assert.deepEqual(parsed.examples, ["2026-08-13T12:05:00.000Z"]);
});

test("feature helper categorizes concentrated multi-source funding separately", () => {
  assert.equal(__capitalPathFeatureTestHooks.concentrationBucket([{ amountUsd: 80 }, { amountUsd: 20 }]), "CONCENTRATED");
  assert.equal(__capitalPathFeatureTestHooks.concentrationBucket([{ amountUsd: 55 }, { amountUsd: 45 }]), "DISTRIBUTED");
});


test("capital path coordinator attaches only separate shadow inference", () => {
  const radar = { chains: [chainObservation()] };
  const rows = Array.from({ length: 8 }, (_, i) => example(i + 1, PROJECT_A));
  const projects = [{ chain: "base", tokenAddress: TOKEN_A, candidateAdjustedStagedCapitalUsd: 0 }, { chain: "base", tokenAddress: TOKEN_B }];
  const result = processCapitalPathLearning(projects, radar, {
    persist: false,
    writeReport: false,
    runLab: false,
    examples: rows,
    asOf: "2026-08-30T00:00:00Z",
    modelOptions: { minSupport: 6, minUniqueWallets: 4, minWilsonLower: 0.3 },
  });
  assert.equal(result.status, "MODEL_EVALUATED_SHADOW");
  assert.equal(result.projects[0].capitalPathPrediction.state, "PROBABILISTIC_DESTINATION_SHADOW");
  assert.equal(result.projects[0].candidateAdjustedStagedCapitalUsd, 0);
  assert.equal(result.projects[0].capitalPathPrediction.loadedVacuumInfluence, false);
});

test("capital path coordinator fails closed when no resolved history exists", () => {
  const result = processCapitalPathLearning([{ chain: "base", tokenAddress: TOKEN_A }], { chains: [chainObservation()] }, {
    persist: false,
    writeReport: false,
    runLab: false,
    examples: [],
  });
  assert.equal(result.status, "INSUFFICIENT_RESOLVED_HISTORY");
  assert.equal(result.projects[0].capitalPathPrediction.state, "NO_VALIDATED_PATH_PREDICTION");
});
