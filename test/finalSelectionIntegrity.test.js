import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import {
  analyzeFinalSelectionIntegrityBatch,
} from "../src/engines/finalSelectionIntegrityEngine.js";
import { inspectBlockingVerdicts } from "../src/selection/blockingVerdictHelper.js";
import { writeHtmlReport } from "../src/reports/htmlReportEngine.js";
import { writeJsonReport } from "../src/reports/jsonReportEngine.js";

function qualifiedFixture(overrides = {}) {
  return {
    name: "Clean Base Alpha",
    symbol: "CBA",
    chain: "base",
    contractAddress: "0x0000000000000000000000000000000000000cba",
    pairAddress: "0x0000000000000000000000000000000000000cab",
    contractVerified: true,
    chainVerified: true,
    identityState: "VERIFIED_CONTRACT",
    projectIdentityVerdict: "Identity Resolved",
    source: "dexscreener",
    pipelineScore: 82,
    liquidityUsd: 250_000,
    marketCap: 22_000_000,
    riskScore: 18,
    trapRiskScore: 12,
    purchaseRoute: {
      purchasable: true,
      preferredRoute: "MetaMask",
      status: "Available Route Detected",
    },
    smallCapHunterSelected: true,
    smallCapHunterVerdict: "Top-2 Small-Cap Research Candidate",
    smallCapHunterScore: 78,
    smallCapHunter: {
      purchaseRoute: {
        purchasable: true,
        preferredRoute: "MetaMask",
        status: "Available Route Detected",
      },
      execution: {
        liquidityUsd: 250_000,
      },
    },
    proofOfAlphaExecutionTwinVerdict: "Execution-Verified Alpha Candidate",
    proofOfAlphaExecutionTwinScore: 76,
    proofOfAlphaExecutionTwinSelected: true,
    proofOfAlphaExecutionTwin: {
      route: {
        detected: true,
        preferredRoute: "MetaMask",
        status: "Detected",
      },
      quote: {
        liquidityUsd: 250_000,
      },
      safety: {
        blockers: [],
      },
    },
    ...overrides,
  };
}

test("final selection integrity blocks PERP contradiction", () => {
  const [result] = analyzeFinalSelectionIntegrityBatch([
    {
      name: "Perpetual Protocol",
      symbol: "PERP",
      chain: "ethereum",
      contractAddress: "0x0000000000000000000000000000000000000per",
      pipelineScore: 24,
      aiDecision: "Reject",
      allocationBucket: "Defensive Avoid",
      smallCapHunterSelected: true,
      purchaseRoute: { purchasable: false, status: "Unavailable" },
      smallCapHunter: {
        purchaseRoute: { purchasable: false, status: "Unavailable" },
      },
      executionVerdict: "Execution Route Block",
      proofVerdict: "Risk-heavy setup",
      proofOfAlphaExecutionTwinVerdict: "Execution Route Block",
    },
  ]);

  assert.equal(result.smallCapHunterSelected, false);
  assert.equal(result.finalSelectionQualified, false);
  assert.equal(result.finalSelectionState, "BLOCKED");
  assert.ok(result.finalBlockingReasons.some((reason) => reason.includes("Allocation bucket")));
  assert.ok(result.finalBlockingReasons.some((reason) => reason.includes("Risk-heavy")));
  assert.ok(result.deselectedBy, "Final Selection Integrity");
});

test("late risk rejection deselects an early candidate", () => {
  const [result] = analyzeFinalSelectionIntegrityBatch([
    qualifiedFixture({
      riskScore: 88,
      trapRiskScore: 64,
      riskVerdict: "Unsafe risk stack",
    }),
  ]);

  assert.equal(result.smallCapHunterSelected, false);
  assert.equal(result.proofOfAlphaExecutionTwinSelected, false);
  assert.equal(result.finalSelectionQualified, false);
  assert.equal(result.finalSelectionState, "BLOCKED");
  assert.ok(result.selectionAuditTrail.length >= 2);
});

test("organic demand proof block deselects an early candidate", () => {
  const [result] = analyzeFinalSelectionIntegrityBatch([
    qualifiedFixture({
      organicDemandPromotionBlocked: true,
      organicDemandManualReviewLabel: "High market activity, low fundamental confidence - manual investigation required",
      economicIntegrityResearchTasks: [
        {
          id: "verify-activity-authenticity",
          priority: "critical",
          title: "Verify whether transaction activity is organic trading demand.",
        },
      ],
    }),
  ]);

  assert.equal(result.smallCapHunterSelected, false);
  assert.equal(result.proofOfAlphaExecutionTwinSelected, false);
  assert.equal(result.finalSelectionQualified, false);
  assert.equal(result.finalSelectionState, "BLOCKED");
  assert.ok(result.finalBlockingReasons.some((reason) => reason.includes("manual investigation required")));
});

test("high-confidence local AI risk block deselects an otherwise qualified candidate", () => {
  const [result] = analyzeFinalSelectionIntegrityBatch([
    qualifiedFixture({
      localAIPromotionBlocked: true,
      localAIDecisionReason: "Completed high-confidence local AI research identified material risk that requires independent resolution.",
    }),
  ]);

  assert.equal(result.smallCapHunterSelected, false);
  assert.equal(result.proofOfAlphaExecutionTwinSelected, false);
  assert.equal(result.finalSelectionQualified, false);
  assert.equal(result.finalSelectionState, "BLOCKED");
  assert.ok(result.finalBlockingReasons.some((reason) => reason.includes("local AI research identified material risk")));
});

test("duplicate ticker projects keep separate permanent identities", () => {
  const results = analyzeFinalSelectionIntegrityBatch([
    qualifiedFixture({
      name: "Ethereum PERP",
      symbol: "PERP",
      chain: "ethereum",
      contractAddress: "0x0000000000000000000000000000000000000e01",
    }),
    qualifiedFixture({
      name: "Base PERP",
      symbol: "PERP",
      chain: "base",
      contractAddress: "0x0000000000000000000000000000000000000b01",
    }),
  ]);

  assert.notEqual(results[0].permanentProjectKey, results[1].permanentProjectKey);
  assert.ok(results.every((project) => project.finalIdentityState === "VERIFIED_CONTRACT"));
});

test("missing contract cannot become qualified", () => {
  const [result] = analyzeFinalSelectionIntegrityBatch([
    qualifiedFixture({
      contractAddress: "",
      address: "",
      tokenAddress: "",
      identityState: "SYMBOL_ONLY",
      contractVerified: false,
    }),
  ]);

  assert.equal(result.finalSelectionQualified, false);
  assert.notEqual(result.finalSelectionState, "QUALIFIED");
  assert.ok(result.finalWarningReasons.some((reason) => reason.includes("Contract address")));
});

test("fake chain and address strings cannot qualify a high scoring candidate", () => {
  const [result] = analyzeFinalSelectionIntegrityBatch([
    qualifiedFixture({
      chain: "gaming",
      chainId: "coinbase",
      contractAddress: "AKE",
      tokenAddress: "coingecko:ake",
      address: "https://example.com/token",
      pairAddress: "https://dexscreener.com/base/ake",
      poolAddress: "top-volume",
      contractVerified: true,
      chainVerified: true,
      identityConflicts: [
        "Rejected non-chain value in chain field: gaming",
        "Rejected token address: non-address value \"AKE\".",
        "Rejected pool address: non-address value \"top-volume\".",
      ],
    }),
  ]);

  assert.equal(result.finalSelectionQualified, false);
  assert.equal(result.finalSelectionState, "IDENTITY_CONFLICT");
  assert.equal(result.finalCandidateSelected, false);
  assert.equal(result.finalContractAddress, "");
  assert.equal(result.finalPairAddress, "");
  assert.ok(result.finalBlockingReasons.some((reason) => reason.includes("Identity conflict")));
  assert.ok(result.finalWarningReasons.some((reason) => reason.includes("Contract address")));
});

test("missing liquidity cannot become qualified", () => {
  const [result] = analyzeFinalSelectionIntegrityBatch([
    qualifiedFixture({
      liquidityUsd: 0,
      smallCapHunter: {
        purchaseRoute: {
          purchasable: true,
          preferredRoute: "MetaMask",
          status: "Available Route Detected",
        },
        execution: {
          liquidityUsd: 0,
        },
      },
      proofOfAlphaExecutionTwin: {
        route: {
          detected: true,
          preferredRoute: "MetaMask",
          status: "Detected",
        },
        quote: {
          liquidityUsd: 0,
        },
        safety: {
          blockers: [],
        },
      },
    }),
  ]);

  assert.equal(result.finalSelectionQualified, false);
  assert.equal(result.finalSelectionState, "INSUFFICIENT_DATA");
  assert.ok(result.finalWarningReasons.some((reason) => reason.includes("Liquidity data is missing")));
});

test("dashboard shows no qualified candidates instead of promoting rejected projects", () => {
  const results = analyzeFinalSelectionIntegrityBatch([
    {
      name: "Rejected One",
      symbol: "RJ1",
      chain: "base",
      contractAddress: "0x0000000000000000000000000000000000000a11",
      pipelineScore: 90,
      aiDecision: "Reject",
      smallCapHunterSelected: true,
      purchaseRoute: { purchasable: false, status: "Unavailable" },
      proofOfAlphaExecutionTwinVerdict: "Execution Route Block",
    },
    {
      name: "Rejected Two",
      symbol: "RJ2",
      chain: "ethereum",
      contractAddress: "0x0000000000000000000000000000000000000a12",
      pipelineScore: 86,
      allocationBucket: "Defensive Avoid",
      smallCapHunterSelected: true,
      purchaseRoute: { purchasable: false, status: "Unavailable" },
      proofVerdict: "Risk-heavy setup",
    },
  ]);
  const filePath = writeHtmlReport(results);
  const html = fs.readFileSync(filePath, "utf8");

  assert.match(html, /No qualified candidates/);
  assert.doesNotMatch(html, /<p>Small-Cap Research Picks<\/p>/);
});

test("dashboard qualified serialization matches saved JSON final record", () => {
  const [qualified] = analyzeFinalSelectionIntegrityBatch([qualifiedFixture()]);
  const reportsDir = fs.mkdtempSync(path.join(os.tmpdir(), "final-selection-json-"));
  const jsonPath = writeJsonReport([qualified], { test: "final-selection", reportsDir });
  const htmlPath = writeHtmlReport([qualified]);
  const saved = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const html = fs.readFileSync(htmlPath, "utf8");
  const savedProject = saved.projects[0];

  assert.equal(savedProject.finalSelectionQualified, true);
  assert.match(html, new RegExp(savedProject.permanentProjectKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("contradictory reject cannot remain qualified", () => {
  const [result] = analyzeFinalSelectionIntegrityBatch([
    qualifiedFixture({
      aiDecision: "Reject",
    }),
  ]);

  assert.equal(result.finalSelectionQualified, false);
  assert.equal(result.finalSelectionState, "INSUFFICIENT_DATA");
  assert.equal(result.strongBuySelected, false);
  assert.equal(result.finalBlockingReasons.length, 0);
  assert.ok(result.finalWarningReasons.some((reason) => reason.includes("Advisory AI decision")));
});

test("unverified route and identity states stop qualification without becoming hard blocks", () => {
  const [result] = analyzeFinalSelectionIntegrityBatch([
    {
      name: "Incomplete Early Lead",
      symbol: "IEL",
      chain: "base",
      contractAddress: "0x0000000000000000000000000000000000000a33",
      pairAddress: "0x0000000000000000000000000000000000000b33",
      pipelineScore: 78,
      liquidityUsd: 125_000,
      riskScore: 12,
      trapRiskScore: 8,
      projectIdentityVerdict: "Identity Unverified",
      proofOfAlphaExecutionTwinVerdict: "RESEARCH_ONLY_ROUTE_UNVERIFIED",
      executionProof: {
        executionStatus: "UNKNOWN",
        buyRouteAvailable: false,
      },
      adversarialSimulationReview: {
        status: "Block",
      },
    },
  ]);

  assert.equal(result.finalSelectionQualified, false);
  assert.equal(result.finalSelectionState, "INSUFFICIENT_DATA");
  assert.equal(result.finalBlockingReasons.length, 0);
  assert.ok(result.finalWarningReasons.some((reason) => reason.includes("Identity state")));
  assert.ok(result.finalWarningReasons.some((reason) => reason.includes("Advisory signal: adversarialSimulationReview.status: Block")));
});

test("deterministic safety verdicts still hard block candidates", () => {
  const [result] = analyzeFinalSelectionIntegrityBatch([
    qualifiedFixture({
      instantSafetyVerdict: "Honeypot detected",
      riskScore: 10,
      trapRiskScore: 8,
    }),
  ]);

  assert.equal(result.finalSelectionQualified, false);
  assert.equal(result.finalSelectionState, "BLOCKED");
  assert.ok(result.finalBlockingReasons.some((reason) => reason.includes("Honeypot")));
});

test("identity conflict blocks final selection", () => {
  const [result] = analyzeFinalSelectionIntegrityBatch([
    qualifiedFixture({
      identityConflict: true,
      chainIdentityStatus: "mismatched",
    }),
  ]);

  assert.equal(result.finalSelectionState, "IDENTITY_CONFLICT");
  assert.equal(result.finalSelectionQualified, false);
  assert.equal(result.finalCandidateSelected, false);
});

test("symbol-only project remains an unqualified research lead", () => {
  const [result] = analyzeFinalSelectionIntegrityBatch([
    {
      name: "Symbol Only Alpha",
      symbol: "SOA",
      pipelineScore: 76,
      liquidityUsd: 100_000,
      riskScore: 12,
      trapRiskScore: 8,
    },
  ]);

  assert.equal(result.finalSelectionQualified, false);
  assert.notEqual(result.finalSelectionState, "QUALIFIED");
  assert.ok(["SYMBOL_ONLY", "UNRESOLVED_IDENTITY"].includes(result.finalIdentityState));
});

test("blocking verdict helper returns exact blocking fields", () => {
  const inspected = inspectBlockingVerdicts({
    aiDecision: "Reject",
    proofVerdict: "Risk-heavy setup",
    proofOfAlphaExecutionTwinVerdict: "Execution Route Block",
  });

  assert.equal(inspected.hasBlockingVerdict, true);
  assert.ok(inspected.blockingVerdictMatches.some((match) => match.field === "aiDecision"));
  assert.ok(inspected.blockingVerdictReasons.some((reason) => reason.includes("proofVerdict")));
});
