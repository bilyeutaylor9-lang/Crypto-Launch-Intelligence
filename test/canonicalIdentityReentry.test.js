import test from "node:test";
import assert from "node:assert/strict";

import { attachCanonicalIdentityBatch, resolveCanonicalIdentity } from "../src/identity/canonicalIdentityResolver.js";
import { analyzeFinalSelectionIntegrity } from "../src/engines/finalSelectionIntegrityEngine.js";

const identities = [
  { chain: "base", contractAddress: "0x1111111111111111111111111111111111111111", poolAddress: "0x2222222222222222222222222222222222222222" },
  { chain: "solana", contractAddress: "ARMqZ1YB3ieGXeT6kjA7tC4ynoXGb5SBA6yXuTbs9Cgb", poolAddress: "HcX7NPj9sCbcN8A1E9WXZvgzR4A2uUKtrpTiFFUcibM6" },
];

for (const identity of identities) {
  test(`${identity.chain} final-selection aliases cannot verify their own unknown identity on reentry`, () => {
    let project = { name: "Unverified Asset", symbol: "UNKNOWN", ...identity, liquidityUsd: 10000 };
    for (let pass = 0; pass < 3; pass++) {
      const canonicalIdentity = resolveCanonicalIdentity(project);
      assert.equal(canonicalIdentity.identityStatus, "PROBABLE_MATCH");
      assert.ok(canonicalIdentity.sourceIdentities.filter((item) => item.type === "token").every((item) => !item.verified));
      project = analyzeFinalSelectionIntegrity({ ...project, canonicalIdentity });
      assert.equal(project.finalContractAddress, identity.contractAddress);
      assert.equal(project.contractVerified, false);
      assert.equal(project.chainVerified, false);
      assert.equal(project.finalIdentityState, "PROBABLE_MATCH");
      assert.equal(project.finalSelectionQualified, false);
    }
  });

  test(`${identity.chain} independently verified contracts remain verified across final-selection reentry`, () => {
    let project = { name: "Verified Asset", symbol: "PROOF", ...identity, contractVerified: true, liquidityUsd: 10000 };
    for (let pass = 0; pass < 3; pass++) {
      const canonicalIdentity = resolveCanonicalIdentity(project);
      assert.equal(canonicalIdentity.identityStatus, "VERIFIED");
      project = analyzeFinalSelectionIntegrity({ ...project, canonicalIdentity });
      assert.equal(project.contractVerified, true);
      assert.equal(project.chainVerified, true);
      assert.equal(project.finalIdentityState, "VERIFIED_CONTRACT");
      assert.equal(project.finalSelectionQualified, false);
    }
  });

  for (const contractVerified of [undefined, null, false, "false", "UNKNOWN", "0", "true", 1, {}]) {
    const label = `${typeof contractVerified} ${JSON.stringify(contractVerified)}`;
    test(`${identity.chain} a final-only alias with ${label} proof remains unverified`, () => {
      const canonical = resolveCanonicalIdentity({
        name: "Output Alias Only", symbol: "ALIAS", finalChain: identity.chain,
        finalContractAddress: identity.contractAddress, contractVerified,
      });
      assert.equal(canonical.identityStatus, "PROBABLE_MATCH");
      assert.equal(canonical.sourceIdentities[0].verified, false);
    });

    test(`${identity.chain} raw contract proof ${label} cannot become a verified boolean by coercion`, () => {
      assert.equal(resolveCanonicalIdentity({ ...identity, contractVerified }).identityStatus, "PROBABLE_MATCH");
    });
  }
}

test("a symbol peer cannot demote independently verified exact instruments", () => {
  const candidates = [
    { name: "First Instrument", symbol: "SAME", chain: "base", contractAddress: identities[0].contractAddress, contractVerified: true },
    { name: "Unrelated Instrument", symbol: "SAME", chain: "ethereum", contractAddress: "0x3333333333333333333333333333333333333333", contractVerified: true },
  ];
  const attached = attachCanonicalIdentityBatch(candidates);
  for (const candidate of attached) {
    assert.equal(candidate.identityStatus, "VERIFIED");
    assert.equal(candidate.canonicalIdentity.symbolCollisionDetected, true);
    assert.ok(candidate.canonicalIdentity.conflictReasons.some((reason) => reason.includes("Ticker")));
    assert.equal(analyzeFinalSelectionIntegrity(candidate).finalIdentityState, "VERIFIED_CONTRACT");
  }
  assert.notEqual(attached[0].canonicalId, attached[1].canonicalId);
});

test("symbol peers without independent proof remain unverified and exact conflicting anchors still block", () => {
  const [unknown, peer] = attachCanonicalIdentityBatch([
    { name: "Unknown Instrument", symbol: "SAME", chain: "base", contractAddress: identities[0].contractAddress },
    { name: "Unrelated Instrument", symbol: "SAME", chain: "ethereum", contractAddress: "0x3333333333333333333333333333333333333333" },
  ]);
  for (const candidate of [unknown, peer]) {
    assert.notEqual(candidate.identityStatus, "VERIFIED");
    assert.equal(analyzeFinalSelectionIntegrity(candidate).contractVerified, false);
  }
  assert.equal(resolveCanonicalIdentity({ ...identities[0], contractVerified: true, chainMismatch: true }).identityStatus, "CONTRACT_CONFLICT");
  assert.equal(resolveCanonicalIdentity({ ...identities[0], contractVerified: true,
    finalContractAddress: "0x3333333333333333333333333333333333333333", finalChain: "base",
  }).identityStatus, "CONTRACT_CONFLICT");
});
