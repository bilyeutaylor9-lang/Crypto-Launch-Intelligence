import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { appendMemorySidecar } from "../src/learning/boundedMemoryStore.js";
import { loadAlphaContractsFromFile } from "../src/learning/alphaContractStore.js";

test("alpha contract loader prefers bounded sidecar tail over oversized legacy JSON", () => {
  const previousLimit = process.env.MEMORY_REWRITE_LIMIT_MB;
  const previousLoad = process.env.MAX_ALPHA_CONTRACT_LOAD_RECORDS;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alpha-contract-sidecar-"));
  const legacyPath = path.join(dir, "alpha-contracts.json");

  process.env.MEMORY_REWRITE_LIMIT_MB = "1";
  process.env.MAX_ALPHA_CONTRACT_LOAD_RECORDS = "3";

  try {
    fs.writeFileSync(legacyPath, `[${" ".repeat(1_200_000)}]`);
    appendMemorySidecar(
      legacyPath,
      Array.from({ length: 5 }, (_, index) => ({
        contractId: `contract-${index}`,
        projectKey: `base:project-${index}`,
        scoreNow: 50 + index,
      })),
      { recordType: "alpha-contract" }
    );

    const loaded = loadAlphaContractsFromFile(legacyPath);

    assert.equal(loaded.length, 3);
    assert.deepEqual(loaded.map((contract) => contract.contractId), [
      "contract-2",
      "contract-3",
      "contract-4",
    ]);
  } finally {
    if (previousLimit === undefined) {
      delete process.env.MEMORY_REWRITE_LIMIT_MB;
    } else {
      process.env.MEMORY_REWRITE_LIMIT_MB = previousLimit;
    }
    if (previousLoad === undefined) {
      delete process.env.MAX_ALPHA_CONTRACT_LOAD_RECORDS;
    } else {
      process.env.MAX_ALPHA_CONTRACT_LOAD_RECORDS = previousLoad;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
