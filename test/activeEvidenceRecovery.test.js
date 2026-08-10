import test from "node:test";
import assert from "node:assert/strict";

import { analyzeActiveEvidenceRecoveryBatch } from "../src/engines/activeEvidenceRecoveryEngine.js";

const EVM = "0x1111111111111111111111111111111111111111";
const POOL = "0x2222222222222222222222222222222222222222";

test("active evidence recovery promotes observed raw evidence without weakening gates", () => {
  const [project] = analyzeActiveEvidenceRecoveryBatch([
    {
      name: "Recovered Utility",
      symbol: "RUTL",
      chain: "base",
      rawCandidate: {
        tokenAddress: EVM,
        pairAddress: POOL,
      },
      marketData: {
        liquidityUsd: 125000,
      },
      targetedEnrichmentPlan: {
        items: [
          { canonicalField: "tokenAddress", recoverable: true, valueOfInformationScore: 0.9, targetSources: [{ source: "DexScreener" }] },
          { canonicalField: "poolAddress", recoverable: true, valueOfInformationScore: 0.8, targetSources: [{ source: "DexScreener" }] },
          { canonicalField: "liquidityUsd", recoverable: true, valueOfInformationScore: 0.7, targetSources: [{ source: "DexScreener" }] },
        ],
      },
    },
  ]);

  assert.equal(project.activeEvidenceRecoveryStatus, "RECOVERED");
  assert.equal(project.tokenAddress, EVM);
  assert.equal(project.poolAddress, POOL);
  assert.equal(project.liquidityUsd, 125000);
  assert.deepEqual(project.activeEvidenceRecovery.recoveredFields, ["tokenAddress", "poolAddress", "liquidityUsd"]);
});

test("active evidence recovery leaves missing or zero-valued market evidence unrecovered", () => {
  const [project] = analyzeActiveEvidenceRecoveryBatch([
    {
      name: "Still Missing",
      symbol: "MISS",
      chain: "base",
      liquidityUsd: 0,
      targetedEnrichmentPlan: {
        items: [
          { canonicalField: "liquidityUsd", recoverable: true, valueOfInformationScore: 0.9, targetSources: [{ source: "DexScreener" }] },
          { canonicalField: "priceUsd", recoverable: true, valueOfInformationScore: 0.8, targetSources: [{ source: "CoinGecko" }] },
        ],
      },
    },
  ]);

  assert.equal(project.activeEvidenceRecoveryStatus, "NO_RECOVERY");
  assert.equal(project.liquidityUsd, 0);
  assert.deepEqual(project.activeEvidenceRecovery.recoveredFields, []);
  assert.deepEqual(project.activeEvidenceRecovery.unrecoveredFields, ["liquidityUsd", "priceUsd"]);
});
