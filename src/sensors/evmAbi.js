export const SELECTORS = Object.freeze({
  token0: "0x0dfe1681",
  token1: "0xd21220a7",
  fee: "0xddca3f43",
  tickSpacing: "0xd0c93a7c",
  liquidity: "0x1a686502",
  slot0: "0x3850c7bd",
  tickBitmap: "0x5339c296",
  ticks: "0xf30dba93",
  decimals: "0x313ce567",
  balanceOf: "0x70a08231",
  allowance: "0xdd62ed3e",
});

export const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export function strip0x(value = "") {
  return String(value || "").toLowerCase().replace(/^0x/, "");
}

export function wordAt(hex = "0x", index = 0) {
  const raw = strip0x(hex);
  return raw.slice(index * 64, (index + 1) * 64).padEnd(64, "0");
}

export function decodeUint(hex = "0x", index = 0) {
  const word = wordAt(hex, index);
  if (!word) return 0n;
  return BigInt(`0x${word || "0"}`);
}

export function decodeInt(hex = "0x", index = 0, bits = 256) {
  const unsigned = decodeUint(hex, index);
  const width = 1n << BigInt(bits);
  const sign = 1n << BigInt(bits - 1);
  const mask = width - 1n;
  const value = unsigned & mask;
  return value & sign ? value - width : value;
}

export function decodeAddress(hex = "0x", index = 0) {
  const word = wordAt(hex, index);
  return `0x${word.slice(24)}`.toLowerCase();
}

export function encodeSignedWord(value, bits = 256) {
  const parsed = BigInt(value);
  const signedMin = -(1n << BigInt(bits - 1));
  const signedMax = (1n << BigInt(bits - 1)) - 1n;
  if (parsed < signedMin || parsed > signedMax) throw new Error(`Signed integer ${value} does not fit int${bits}.`);
  const encoded = parsed < 0 ? (1n << 256n) + parsed : parsed;
  return encoded.toString(16).padStart(64, parsed < 0 ? "f" : "0").slice(-64);
}

export function encodeAddressWord(address = "") {
  const raw = strip0x(address);
  if (!/^[0-9a-f]{40}$/i.test(raw)) throw new Error(`Invalid EVM address: ${address}`);
  return raw.padStart(64, "0");
}

export function callData(selector, encodedArgs = []) {
  return `${selector}${encodedArgs.join("")}`;
}

export function hexNumber(value) {
  return `0x${BigInt(value).toString(16)}`;
}

export function addressFromTopic(topic = "") {
  const raw = strip0x(topic);
  if (raw.length < 40) return null;
  return `0x${raw.slice(-40)}`.toLowerCase();
}
