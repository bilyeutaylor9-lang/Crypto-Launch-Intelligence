import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const moduleUrl = new URL("../src/data/security/securityEvidenceUtils.js", import.meta.url).href;

function fixture(script) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "security-cache-freshness-"));
  try {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import fs from "node:fs";
      import assert from "node:assert/strict";
      import { cacheKey, getCachedSecurityEvidence, setCachedSecurityEvidence } from ${JSON.stringify(moduleUrl)};
      const address = "0x1111111111111111111111111111111111111111";
      const key = cacheKey("blockscout", "base", address);
      const now = 1791650000000;
      Date.now = () => now;
      const observedAt = new Date(now).toISOString();
      fs.mkdirSync("data");
      const write = (entry) => fs.writeFileSync("data/security-evidence-cache.json", JSON.stringify({[key]:entry}));
      const read = (ttl) => getCachedSecurityEvidence("blockscout", "base", address, ttl);
      ${script}
    `], { cwd: dir, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("security cache rejects malformed and future freshness timestamps", () => fixture(`
  for (const cachedAtMs of [null, "not-a-time", "1791650000000", false, [], {}, 0, -1, now+1]) {
    write({cachedAtMs, value:{status:"EVIDENCE_AVAILABLE", observedAt}});
    assert.equal(read(), null, JSON.stringify(cachedAtMs));
  }
  write({cachedAt:"2026-10-10T00:00:00Z", value:{status:"EVIDENCE_AVAILABLE", observedAt}});
  assert.equal(read(), null);
`));

test("security cache expires evidence without extending its default lifetime", () => fixture(`
  write({cachedAtMs:now-6*60*60*1000-1, value:{status:"EVIDENCE_AVAILABLE", observedAt}});
  assert.equal(read(), null);
  write({cachedAtMs:now-1000, value:{status:"EVIDENCE_AVAILABLE", observedAt}});
  assert.equal(read(999), null);
  assert.equal(read(1000).status, "EVIDENCE_AVAILABLE");
  for(const ttl of [NaN, Infinity, -1, 0, null, false, "1000", {}]) assert.equal(read(ttl), null);
`));

test("security cache preserves original observations, UNKNOWN status and exact cache identity", () => fixture(`
  const value = {status:"UNKNOWN", confidence:0, observedAt:new Date(now-1000).toISOString(), creatorAddress:null};
  setCachedSecurityEvidence("blockscout", "base", address, value);
  const before = fs.readFileSync("data/security-evidence-cache.json", "utf8");
  assert.deepEqual(read(), value);
  assert.equal(getCachedSecurityEvidence("blockscout", "bsc", address), null);
  assert.equal(getCachedSecurityEvidence("goplus", "base", address), null);
  assert.equal(getCachedSecurityEvidence("blockscout", "base", "0x2222222222222222222222222222222222222222"), null);
  assert.equal(fs.readFileSync("data/security-evidence-cache.json", "utf8"), before);
`));

test("recent cache writes cannot refresh stale or unproven provider observations", () => fixture(`
  for(const observedAt of [undefined, null, "not-a-time", now, new Date(now+1).toISOString(),
    new Date(now-6*60*60*1000-1).toISOString()]) {
    write({cachedAtMs:now, value:{status:"EVIDENCE_AVAILABLE", observedAt}});
    assert.equal(read(), null);
  }
  write({cachedAtMs:now, value:{status:"EVIDENCE_AVAILABLE", observedAt:new Date(now-1001).toISOString()}});
  assert.equal(read(1000), null);
`));

test("malformed cache roots and records fail closed without breaking recovery", () => fixture(`
  for(const value of [null, [], false, "cache", 12]) {
    fs.writeFileSync("data/security-evidence-cache.json", JSON.stringify(value));
    assert.equal(read(), null);
  }
  for(const value of [null, [], false, "record", 12]) {write(value);assert.equal(read(), null);}
  for(const value of [null, [], false, "evidence", 12]) {write({cachedAtMs:now,value});assert.equal(read(), null);}
  fs.writeFileSync("data/security-evidence-cache.json", "{broken");
  assert.equal(read(), null);
`));
