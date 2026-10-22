import test from "node:test";
import assert from "node:assert/strict";
import { applyCanonicalAliases, collectAliasCandidates, resolveCanonicalAliases } from "../src/data/canonicalAliasResolver.js";
import { normalizeGoPlusTokenSecurity } from "../src/data/security/goplusSecurityConnector.js";
import { summarizeSecurityEvidence } from "../src/data/security/securityEvidenceUtils.js";

const TOKEN = `0x${"1".repeat(40)}`;
const FOREIGN = `0x${"2".repeat(40)}`;
const OPTIONS = { fields: ["honeypotDetected"] };
const TTL = Number(process.env.SECURITY_EVIDENCE_CACHE_TTL_MS || 6 * 60 * 60 * 1000);

test.beforeEach((t) => {
  t.mock.method(globalThis, "fetch", async () => {
    assert.fail("Source-attribution fixtures must never call a provider");
  });
});

function receipt(flag = "0") {
  const evidence = normalizeGoPlusTokenSecurity({ result: { [TOKEN]: {
    is_honeypot: flag, is_open_source: "1",
  } } }, { chain: "base", address: TOKEN });
  evidence.observedAt = new Date(Date.now() - Math.min(1000, TTL / 4)).toISOString();
  return evidence;
}

function project(patch = {}) {
  return { source: "blockscout", chain: "base", tokenAddress: TOKEN,
    sourceTimestamp: new Date().toISOString(), ...patch };
}

function provenance(evidence) {
  return { field: "honeypotDetected", value: false, source: evidence.provider,
    sourceTimestamp: evidence.observedAt, confidence: evidence.confidence / 100,
    verificationStatus: "VERIFIED_PROVIDER_OBSERVATION", recoveryRun: true,
    chain: evidence.chain, tokenAddress: evidence.address };
}

function resolved(input) {
  return resolveCanonicalAliases(input, OPTIONS).resolved.honeypotDetected;
}

test("a nested genuine GoPlus probe overrides discovery attribution, not its source clock", () => {
  const evidence = receipt();
  evidence.honeypotTimestamp = new Date().toISOString();
  const input = project({ normalizedGoPlus: evidence });
  const snapshot = structuredClone(input);
  const result = resolveCanonicalAliases(input, { ...OPTIONS, sourceProvider: "blockscout" });
  assert.equal(result.resolved.honeypotDetected, false);
  assert.equal(result.provenance.honeypotDetected.sourceProvider, "goplus");
  assert.equal(result.provenance.honeypotDetected.sourceTimestamp, evidence.observedAt);
  assert.deepEqual(input, snapshot);
  const repeated = applyCanonicalAliases(applyCanonicalAliases(input, OPTIONS), OPTIONS);
  assert.equal(repeated.honeypotDetected, false);
  assert.equal(repeated.canonicalAliasProvenance.honeypotDetected.sourceProvider, "goplus");
  assert.equal(repeated.canonicalAliasProvenance.honeypotDetected.sourceTimestamp, evidence.observedAt);
});

test("nested discovery wrappers do not become the field observer", () => {
  for (const source of ["blockscout", "sourcify-v2", "etherscan-v2", "rugcheck-solana-full"]) {
    const evidence = receipt();
    const result = resolveCanonicalAliases(project({ source,
      discovery: { source, normalizedGoPlus: evidence } }), OPTIONS);
    assert.equal(result.resolved.honeypotDetected, false, source);
    assert.equal(result.provenance.honeypotDetected.sourceProvider, "goplus", source);
    assert.equal(result.provenance.honeypotDetected.sourceTimestamp, evidence.observedAt, source);
  }
});

test("verified per-field GoPlus provenance must join the original exact receipt", () => {
  for (const location of ["securityEvidence", "freeSecurityEvidence"]) {
    const evidence = receipt();
    const input = project({ honeypotDetected: false,
      fieldProvenance: { honeypotDetected: provenance(evidence) },
      [location]: location === "securityEvidence" ? [evidence] : { evidence: [evidence] } });
    const result = resolveCanonicalAliases(input, { ...OPTIONS, disableSemanticScan: true });
    assert.equal(result.resolved.honeypotDetected, false, location);
    assert.equal(result.provenance.honeypotDetected.sourceProvider, "goplus");
    assert.equal(result.provenance.honeypotDetected.sourceTimestamp, evidence.observedAt);
  }
});

test("a complete field receipt is also independent of discovery", () => {
  const evidence = receipt();
  assert.equal(resolved(project({ honeypotDetected: false, fieldProvenance: {
    honeypotDetected: { ...evidence, ...provenance(evidence) },
  } })), false);
});

test("nested field provenance binds a nested value to its original raw receipt", () => {
  for (const sourceKey of ["source", "sourceProvider", "provider"]) {
    const evidence = receipt();
    const observation = provenance(evidence);
    delete observation.source;
    observation[sourceKey] = "Go Plus";
    const result = resolveCanonicalAliases(project({
      discovered: { source: "blockscout", honeypot: false },
      securityEvidence: [evidence], fieldProvenance: { "discovered.honeypot": observation },
    }), OPTIONS);
    assert.equal(result.resolved.honeypotDetected, false, sourceKey);
    assert.equal(result.provenance.honeypotDetected.sourceProvider, "goplus");
    assert.equal(result.provenance.honeypotDetected.sourceTimestamp, evidence.observedAt);
  }
});

test("a container name cannot replace the genuine GoPlus receipt's observer", () => {
  const evidence = receipt();
  evidence.source = evidence.provider;
  delete evidence.provider;
  const result = resolveCanonicalAliases(project({ blockscoutSecurity: evidence }), OPTIONS);
  assert.equal(result.resolved.honeypotDetected, false);
  assert.equal(result.provenance.honeypotDetected.sourceProvider, "goplus");
});

test("a GoPlus label or verified field label alone cannot clear discovery metadata", () => {
  const evidence = receipt();
  for (const observation of [
    { source: "goplus" },
    { source: "goplus", value: false, verificationStatus: "VERIFIED_PROVIDER_OBSERVATION" },
    provenance(evidence),
  ]) {
    assert.equal(resolved(project({ honeypotDetected: false,
      fieldProvenance: { honeypotDetected: observation } })), null);
  }
  assert.equal(resolved(project({ normalizedGoPlus: { source: "goplus", honeypot: false } })), null);
});

test("unbound, incomplete, foreign, stale and future receipts cannot override discovery", () => {
  const mutations = [
    ["unknown status", item => { item.status = "UNKNOWN"; }],
    ["unverified identity", item => { item.responseIdentityVerified = false; }],
    ["missing chain", item => { delete item.chain; }],
    ["missing address", item => { delete item.address; }],
    ["foreign chain", item => { item.chain = "ethereum"; }],
    ["foreign address", item => { item.address = FOREIGN; }],
    ["missing probe", item => { item.raw = {}; }],
    ["missing normalized negative", item => { delete item.honeypot; }],
    ["invalid normalized negative", item => { item.honeypot = "false"; }],
    ["invalid probe", item => { item.raw.is_honeypot = "false"; }],
    ["adverse raw probe", item => { item.raw.is_honeypot = "1"; }],
    ["zero confidence", item => { item.confidence = 0; }],
    ["missing clock", item => { delete item.observedAt; }],
    ["stale clock", item => { item.observedAt = new Date(Date.now() - TTL - 1000).toISOString(); }],
    ["future clock", item => { item.observedAt = new Date(Date.now() + 60_000).toISOString(); }],
  ];
  for (const [label, mutate] of mutations) {
    const evidence = receipt();
    mutate(evidence);
    const input = project({ normalizedGoPlus: evidence });
    assert.equal(resolved(input), label === "adverse raw probe" ? true : null, label);
    assert.equal(collectAliasCandidates(input, "honeypotDetected").some(item =>
      item.validationStatus === "VALID" && item.canonicalValue === false), false, label);
  }
});

test("field provenance must match raw-receipt identity, time, value and verification", () => {
  const mutations = [
    ["foreign chain", item => { item.chain = "ethereum"; }],
    ["foreign token", item => { item.tokenAddress = FOREIGN; }],
    ["unbound chain", item => { delete item.chain; }],
    ["unbound token", item => { delete item.tokenAddress; }],
    ["different time", item => { item.sourceTimestamp = new Date().toISOString(); }],
    ["missing time", item => { delete item.sourceTimestamp; }],
    ["unverified", item => { item.verificationStatus = "UNVERIFIED"; }],
    ["different value", item => { item.value = true; }],
    ["zero confidence", item => { item.confidence = 0; }],
    ["different provider", item => { item.source = "blockscout"; }],
    ["non-security provider", item => { item.source = "dexscreener"; }],
  ];
  for (const [label, mutate] of mutations) {
    const evidence = receipt();
    const observation = provenance(evidence);
    mutate(observation);
    const input = project({ honeypotDetected: false, securityEvidence: [evidence],
      fieldProvenance: { honeypotDetected: observation } });
    assert.equal(resolveCanonicalAliases(input, { ...OPTIONS, disableSemanticScan: true })
      .resolved.honeypotDetected, null, label);
  }
});

test("all declared project identities must agree with the independent observation", () => {
  for (const patch of [{ chain: "ethereum" }, { tokenAddress: FOREIGN },
    { rawCandidate: { chain: "ethereum", tokenAddress: TOKEN } },
    { marketData: { chain: "base", tokenAddress: FOREIGN } },
    { canonicalExecutionRoute: { chain: "base", tokenAddress: FOREIGN } },
    { chain: undefined }, { tokenAddress: undefined }]) {
    assert.equal(resolved(project({ ...patch, normalizedGoPlus: receipt() })), null);
  }
});

test("an unrelated sibling receipt cannot legitimize metadata-only negatives or a forged summary", () => {
  const evidence = receipt();
  for (const provider of ["blockscout", "sourcify-v2", "etherscan-v2", "rugcheck-solana-full"]) {
    assert.equal(resolved(project({ securityEvidence: [evidence],
      legacy: { provider, honeypot: false } })), null, provider);
  }
  assert.equal(resolved(project({ securityEvidenceSummary: {
    honeypot: false, honeypotNegativeVerified: true,
    honeypotNegativeEvidence: [{ source: "goplus", chain: "base", tokenAddress: TOKEN,
      sourceTimestamp: evidence.observedAt, confidence: 78 }],
  } })), null);
});

test("adverse true observations remain true alongside metadata and independent negatives", () => {
  const adverse = receipt("1");
  assert.equal(resolved(project({ normalizedGoPlus: adverse })), true);
  const negative = receipt();
  const result = resolveCanonicalAliases(project({ normalizedGoPlus: negative,
    securityEvidenceSummary: summarizeSecurityEvidence([negative, adverse]) }), OPTIONS);
  assert.equal(result.resolved.honeypotDetected, true);
  assert.equal(result.provenance.honeypotDetected.conflictStatus, "CONFLICTED");
  assert.ok(result.conflicts.honeypotDetected.some(item => item.canonicalValue === false));
});

test("a retained exact adverse receipt cannot be cleared by a different negative receipt", () => {
  const negative = receipt();
  const adverse = receipt("1");
  for (const location of ["securityEvidence", "freeSecurityEvidence"]) {
    const input = project({ honeypotDetected: false, normalizedGoPlus: negative,
      fieldProvenance: { honeypotDetected: provenance(negative) },
      [location]: location === "securityEvidence" ? [negative, adverse] : { evidence: [negative, adverse] } });
    assert.equal(resolved(input), null, location);
    assert.equal(adverse.honeypot, true);
  }
});

test("negative evidence expires at the original TTL boundary, not discovery refresh time", (t) => {
  const now = Date.now();
  t.mock.method(Date, "now", () => now);
  const evidence = receipt();
  const input = project({ normalizedGoPlus: evidence });
  evidence.observedAt = new Date(now - TTL).toISOString();
  assert.equal(resolved(input), false);
  assert.equal(resolveCanonicalAliases(input, OPTIONS).provenance.honeypotDetected.sourceTimestamp,
    evidence.observedAt);
  evidence.observedAt = new Date(now - TTL - 1).toISOString();
  assert.equal(resolved(input), null);
  evidence.observedAt = new Date(now + 1).toISOString();
  assert.equal(resolved(input), null);
});

test("receipt mutations are revalidated and fresh discovery clocks cannot extend evidence TTL", () => {
  const evidence = receipt();
  const input = project({ normalizedGoPlus: evidence });
  assert.equal(resolved(input), false);
  const originalClock = evidence.observedAt;
  for (const patch of [{ raw: {} }, { provider: "blockscout" },
    { observedAt: new Date(Date.now() - TTL - 1000).toISOString() },
    { address: FOREIGN }]) {
    Object.assign(evidence, receipt(), patch);
    input.sourceTimestamp = new Date().toISOString();
    assert.equal(resolved(input), null);
  }
  Object.assign(evidence, receipt(), { observedAt: originalClock });
  assert.equal(resolved(input), false);
});

test("an applied negative becomes unknown when its original receipt expires", () => {
  const evidence = receipt();
  const applied = applyCanonicalAliases(project({ normalizedGoPlus: evidence }), OPTIONS);
  assert.equal(applied.honeypotDetected, false);
  evidence.observedAt = new Date(Date.now() - TTL - 1000).toISOString();
  applied.sourceTimestamp = new Date().toISOString();
  const replayed = applyCanonicalAliases(applied, OPTIONS);
  assert.equal(replayed.honeypotDetected, null);
  assert.equal(replayed.canonicalAliases.honeypotDetected, null);
});
