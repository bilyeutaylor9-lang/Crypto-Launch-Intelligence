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

test("unchanged security cache is parsed once and returned evidence is mutation-isolated", () => fixture(`
  const value = {status:"EVIDENCE_AVAILABLE", observedAt, confidence:0.7, raw:{creatorAddress:address}};
  write({cachedAtMs:now, value});
  const original = fs.readFileSync;
  let reads = 0;
  fs.readFileSync = function(file, ...args) {
    if(String(file).endsWith("security-evidence-cache.json")) reads++;
    return original.call(this,file,...args);
  };
  const returned = read();
  returned.raw.creatorAddress = "foreign";
  returned.confidence = 1;
  for(let i=0;i<20;i++) assert.deepEqual(read(), value);
  assert.equal(reads, 1);
`));

test("memoized security evidence still expires when the file is unchanged", () => fixture(`
  write({cachedAtMs:now, value:{status:"EVIDENCE_AVAILABLE", observedAt}});
  assert.equal(read().status, "EVIDENCE_AVAILABLE");
  Date.now = () => now+6*60*60*1000+1;
  assert.equal(read(), null);
`));

test("external overwrite, replacement, deletion and malformed cache invalidate prior evidence", () => fixture(`
  const file = "data/security-evidence-cache.json";
  write({cachedAtMs:now, value:{status:"UNKNOWN", observedAt, marker:"FIRST"}});
  assert.equal(read().marker, "FIRST");
  const stat = fs.statSync(file);
  write({cachedAtMs:now, value:{status:"UNKNOWN", observedAt, marker:"OTHER"}});
  fs.utimesSync(file,stat.atime,stat.mtime);
  assert.equal(read().marker, "OTHER");
  fs.writeFileSync(file+".replacement",JSON.stringify({[key]:{cachedAtMs:now,value:{status:"UNKNOWN",observedAt,marker:"REPLACED"}}}));
  fs.renameSync(file+".replacement",file);
  assert.equal(read().marker, "REPLACED");
  fs.unlinkSync(file);
  assert.equal(read(), null);
  write({cachedAtMs:now, value:{status:"UNKNOWN",observedAt,marker:"RESTORED"}});
  assert.equal(read().marker,"RESTORED");
  fs.writeFileSync(file,"{broken");
  assert.equal(read(),null);
`));

test("cache writes reload persisted values and failed writes cannot alter memoized proof", () => fixture(`
  const old = {status:"UNKNOWN", observedAt, creatorAddress:null};
  write({cachedAtMs:now,value:old});
  assert.deepEqual(read(),old);
  const original = fs.writeFileSync;
  fs.writeFileSync = () => {throw new Error("disk failure");};
  assert.throws(() => setCachedSecurityEvidence("blockscout","base",address,
    {status:"EVIDENCE_AVAILABLE", observedAt, creatorAddress:address}),/disk failure/);
  fs.writeFileSync = original;
  assert.deepEqual(read(),old);
  const next = {status:"EVIDENCE_AVAILABLE", observedAt, creatorAddress:address};
  setCachedSecurityEvidence("blockscout","base",address,next);
  next.creatorAddress = "foreign";
  assert.equal(read().creatorAddress,address);
`));
