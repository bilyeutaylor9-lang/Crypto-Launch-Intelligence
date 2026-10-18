import { createHash } from "node:crypto";

export function baseMarketFixtureIdentity(id) {
  const value = String(id).replace(/^base:/, "");
  const tokenAddress = /^0x[0-9a-f]{40}$/i.test(value) ? value.toLowerCase()
    : `0x${createHash("sha256").update(`base-market-fixture:${value}`).digest("hex").slice(0, 40)}`;
  return { tokenAddress, identityKey: `base:${tokenAddress}` };
}
