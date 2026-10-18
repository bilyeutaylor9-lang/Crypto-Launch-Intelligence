import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import http2 from "node:http2";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import dgram from "node:dgram";
import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";

export const FIXED_TIME = "2026-10-18T00:00:00.000Z";
const root = process.env.OFFLINE_SCANNER_SMOKE_ROOT;
const temporary = fs.realpathSync(os.tmpdir()) + path.sep;
const cwd = fs.realpathSync(process.cwd());
const auditRoot = process.env.ENGINE_AUDIT_WORKER_ROOT;
if (!root || !cwd.startsWith(temporary) ||
    !fs.existsSync(path.join(root, "offline-smoke-marker")) ||
    (cwd !== fs.realpathSync(root) && (!auditRoot || cwd !== fs.realpathSync(auditRoot)))) {
  throw new Error("Offline smoke bootstrap requires an isolated temporary worker.");
}

const ledger = path.join(root, "network-attempts.jsonl");
function deny(api) {
  return () => {
    fs.appendFileSync(ledger, JSON.stringify({ api, pid: process.pid }) + "\n");
    throw new Error(`OFFLINE_NETWORK_FORBIDDEN: ${api}`);
  };
}

globalThis.fetch = async (...args) => deny("fetch")(...args);
globalThis.WebSocket = class { constructor() { deny("WebSocket")(); } };
for (const [module, names] of [
  [http, ["request", "get"]], [https, ["request", "get"]], [http2, ["connect"]],
  [net, ["connect", "createConnection"]], [tls, ["connect"]],
  [dns, ["lookup", "lookupService", "resolve", "resolve4", "resolve6", "resolveAny", "resolveCname",
    "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse"]],
]) {
  for (const name of names) {
    module[name] = deny(name);
    if (module === dns && typeof dns.promises[name] === "function") dns.promises[name] = async () => deny(name)();
  }
}
net.Socket.prototype.connect = deny("Socket.connect");
net.Server.prototype.listen = deny("Server.listen");
dgram.Socket.prototype.connect = deny("dgram.connect");
dgram.Socket.prototype.send = deny("dgram.send");
for (const Resolver of [dns.Resolver, dns.promises.Resolver]) {
  for (const name of Object.getOwnPropertyNames(Resolver.prototype)) {
    if (/^(resolve|reverse)/.test(name)) Resolver.prototype[name] = deny(`Resolver.${name}`);
  }
}

// Freeze wall time, not timers: timeout watchdogs must continue to work.
const NativeDate = Date;
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [FIXED_TIME])); }
  static now() { return NativeDate.parse(FIXED_TIME); }
};
let sequence = 0;
crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
let seed = 123456789;
Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
syncBuiltinESMExports();

export function assertNoNetworkAttempts() {
  const attempts = fs.existsSync(ledger) ? fs.readFileSync(ledger, "utf8").trim() : "";
  if (attempts) throw new Error(`OFFLINE_NETWORK_FORBIDDEN: attempted network access\n${attempts}`);
}

process.on("exit", () => {
  if (fs.existsSync(ledger) && fs.statSync(ledger).size) process.exitCode = 1;
});
