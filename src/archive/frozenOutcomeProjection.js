import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { originalJsonlRecords } from "./frozenOutcomeQueue.js";
import { exactMarketObservationIntegrityHash } from "../production/exactMarketObservationLedger.js";
import { finite, strictIdentity } from "../production/productionMath.js";

const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function readDescriptor(fd) {
  const bytes = Buffer.alloc(fs.fstatSync(fd).size);
  for (let offset = 0; offset < bytes.length;) {
    const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
    if (!count) throw new Error("OUTCOME_PROJECTION_SHORT_READ");
    offset += count;
  }
  return bytes;
}

function checkedRow(row) {
  const identity = row && typeof row === "object" && !Array.isArray(row) ? strictIdentity(row) : null;
  if (!identity || row.schemaVersion !== 2 || row.exactIdentityVerified !== true || !row.observationKey ||
    identity.identityKey !== row.identityKey || identity.routeKey !== row.routeKey || finite(row.priceUsd) === null || finite(row.priceUsd) <= 0 ||
    row.observationIntegrityHash !== exactMarketObservationIntegrityHash(row)) throw new Error("OUTCOME_PROJECTION_INVALID_OBSERVATION");
  return row;
}

function ledgerRows(bytes) {
  const byKey = new Map();
  for (const entry of originalJsonlRecords(bytes)) {
    if (entry.blank) continue;
    if (entry.error) throw new Error("OUTCOME_PROJECTION_LEDGER_MALFORMED_PRESERVE_ORIGINAL");
    let row;
    try { row = checkedRow(entry.row); } catch { throw new Error("OUTCOME_PROJECTION_LEDGER_INVALID_ROW_PRESERVE_ORIGINAL"); }
    if (byKey.has(row.observationKey)) throw new Error("OUTCOME_PROJECTION_LEDGER_DUPLICATE_KEY");
    byKey.set(row.observationKey, row.observationIntegrityHash);
  }
  return byKey;
}

// This is an append-only compatibility projection, not a remote durability ack.
// Archive admission precedes it, so a crash can be retried without another HTTP.
export function projectFrozenOutcomeObservations({ archive, file, clock = () => new Date().toISOString() } = {}) {
  if (!archive || typeof file !== "string" || !path.isAbsolute(file)) throw new TypeError("An absolute exact-ledger destination is required");
  archive.renewWriter({ nowAt: clock() });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && !fs.lstatSync(file).isFile()) throw new Error("OUTCOME_PROJECTION_LEDGER_NOT_REGULAR");
  const original = fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0), existing = ledgerRows(original);
  const pending = [], receipts = [];
  for (const evidence of archive.listOutcomeCaptures()) {
    const row = checkedRow(evidence.immutableContract.exactObservation);
    const previous = existing.get(row.observationKey);
    if (previous && previous !== row.observationIntegrityHash) throw new Error("OUTCOME_PROJECTION_IMMUTABLE_KEY_CONFLICT");
    if (!previous) { pending.push(row); existing.set(row.observationKey, row.observationIntegrityHash); }
    receipts.push({ recordId: evidence.recordId, rawContentHash: evidence.contentHash, observationKey: row.observationKey, observationIntegrityHash: row.observationIntegrityHash });
  }
  if (!receipts.length) return { status: "NO_CAPTURED_OBSERVATIONS", appended: 0, verified: 0, remoteAcknowledged: false };
  const suffix = pending.length ? Buffer.from((original.length && original.at(-1) !== 10 ? "\n" : "") + pending.map(row => JSON.stringify(row)).join("\n") + "\n") : Buffer.alloc(0);
  const fd = fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_APPEND | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW, 0o600);
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.size !== original.length || !readDescriptor(fd).equals(original)) throw new Error("OUTCOME_PROJECTION_LEDGER_CHANGED");
    if (suffix.length) fs.writeFileSync(fd, suffix);
    fs.fsyncSync(fd);
    const directory = fs.openSync(path.dirname(file), "r");
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
    const readBack = readDescriptor(fd);
    if (!readBack.equals(Buffer.concat([original, suffix]))) throw new Error("OUTCOME_PROJECTION_READBACK_MISMATCH");
    const checked = ledgerRows(readBack);
    if (receipts.some(row => checked.get(row.observationKey) !== row.observationIntegrityHash)) throw new Error("OUTCOME_PROJECTION_HASH_ACK_MISSING");
    const receipt = { format: "LOCAL_EXACT_LEDGER_PROJECTION_V1", file, originalBytes: original.length, projectedBytes: readBack.length,
      projectedSha256: hash(readBack), observations: receipts, remoteAcknowledged: false };
    archive.renewWriter({ nowAt: clock() });
    const receiptBytes = Buffer.from(JSON.stringify(receipt));
    archive.admitPrediction({ recordId: "local-outcome-projection:" + hash(receiptBytes),
      rawBytes: receiptBytes, frozenObligations: [], immutableContract: {
        kind: "LOCAL_EXACT_LEDGER_PROJECTION_RECEIPT_V1", scoringOrSelectionAllowed: false, remoteAcknowledged: false,
      } });
    return { status: "LOCAL_PROJECTION_VERIFIED", appended: pending.length, verified: receipts.length, ledgerSha256: receipt.projectedSha256, remoteAcknowledged: false };
  } finally { fs.closeSync(fd); }
}
