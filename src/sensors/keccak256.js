const MASK_64 = (1n << 64n) - 1n;

const ROTATION = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];

const ROUND_CONSTANTS = [
  0x0000000000000001n, 0x0000000000008082n,
  0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n,
  0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn,
  0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n,
  0x0000000080000001n, 0x8000000080008008n,
];

function rotl64(value, shift) {
  const n = BigInt(shift % 64);
  if (n === 0n) return value & MASK_64;
  return ((value << n) | (value >> (64n - n))) & MASK_64;
}

function keccakF1600(state) {
  for (const roundConstant of ROUND_CONSTANTS) {
    const c = new Array(5).fill(0n);
    const d = new Array(5).fill(0n);
    for (let x = 0; x < 5; x += 1) {
      c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x += 1) {
      d[x] = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
    }
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        state[x + 5 * y] = (state[x + 5 * y] ^ d[x]) & MASK_64;
      }
    }

    const b = new Array(25).fill(0n);
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const index = x + 5 * y;
        const newX = y;
        const newY = (2 * x + 3 * y) % 5;
        b[newX + 5 * newY] = rotl64(state[index], ROTATION[index]);
      }
    }

    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const i = x + 5 * y;
        state[i] = (b[i] ^ ((~b[((x + 1) % 5) + 5 * y]) & b[((x + 2) % 5) + 5 * y])) & MASK_64;
      }
    }

    state[0] = (state[0] ^ roundConstant) & MASK_64;
  }
}

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (Array.isArray(input)) return Uint8Array.from(input);
  return new TextEncoder().encode(String(input ?? ""));
}

export function keccak256Bytes(input) {
  const bytes = toBytes(input);
  const rateBytes = 136; // Keccak-256 rate = 1088 bits.
  const state = new Array(25).fill(0n);
  let offset = 0;

  while (offset + rateBytes <= bytes.length) {
    for (let i = 0; i < rateBytes; i += 1) {
      const lane = Math.floor(i / 8);
      const shift = BigInt((i % 8) * 8);
      state[lane] ^= BigInt(bytes[offset + i]) << shift;
    }
    keccakF1600(state);
    offset += rateBytes;
  }

  const block = new Uint8Array(rateBytes);
  block.set(bytes.slice(offset));
  block[bytes.length - offset] ^= 0x01; // Keccak domain separation, not NIST SHA3's 0x06.
  block[rateBytes - 1] ^= 0x80;
  for (let i = 0; i < rateBytes; i += 1) {
    const lane = Math.floor(i / 8);
    const shift = BigInt((i % 8) * 8);
    state[lane] ^= BigInt(block[i]) << shift;
  }
  keccakF1600(state);

  const out = new Uint8Array(32);
  for (let i = 0; i < out.length; i += 1) {
    const lane = Math.floor(i / 8);
    const shift = BigInt((i % 8) * 8);
    out[i] = Number((state[lane] >> shift) & 0xffn);
  }
  return out;
}

export function keccak256Hex(input) {
  return `0x${[...keccak256Bytes(input)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export default keccak256Hex;
