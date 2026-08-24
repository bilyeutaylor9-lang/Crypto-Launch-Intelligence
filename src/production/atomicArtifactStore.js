import fs from "node:fs";
import path from "node:path";
import { stableHash } from "./productionMath.js";

export function writeAtomicJson(file, value) {
  const target = path.resolve(file);
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, serialized, { encoding: "utf8", flag: "w" });
  fs.renameSync(temp, target);
  return { file: target, sha256: stableHash(serialized), bytes: Buffer.byteLength(serialized) };
}

export function appendJsonlDurable(file, rows = []) {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const values = (Array.isArray(rows) ? rows : []).filter(Boolean);
  if (!values.length) return { file: target, appended: 0 };
  const payload = `${values.map((row) => JSON.stringify(row)).join("\n")}\n`;
  const fd = fs.openSync(target, "a");
  try {
    fs.writeSync(fd, payload);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return { file: target, appended: values.length };
}

export function readJsonSafe(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  } catch {
    return fallback;
  }
}
