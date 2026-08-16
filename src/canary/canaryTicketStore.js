
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve("data", "ignition-executable-edge-canary-tickets.jsonl");
const MAX_BYTES = 96 * 1024 * 1024;

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function isoMs(value) {
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? ms : null;
}
function lower(value) { return String(value || "").toLowerCase(); }

function readTail(file = FILE, maxBytes = MAX_BYTES) {
  if (!fs.existsSync(file)) return [];
  const stat = fs.statSync(file);
  const bytes = Math.min(stat.size, Math.max(1024, Number(maxBytes) || MAX_BYTES));
  const start = Math.max(0, stat.size - bytes);
  const buffer = Buffer.alloc(bytes);
  const fd = fs.openSync(file, "r");
  try { fs.readSync(fd, buffer, 0, bytes, start); } finally { fs.closeSync(fd); }
  const lines = buffer.toString("utf8").split("\n");
  if (start > 0) lines.shift();
  return lines.filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function ticketIdOf(project = {}, signalObservedAt, policyHash) {
  const chain = lower(project.chain || project.network || project.canonicalChain);
  const token = lower(project.tokenAddress || project.contractAddress || project.address || project.symbol);
  return crypto.createHash("sha256").update(`${chain}|${token}|${signalObservedAt}|${policyHash}`).digest("hex").slice(0, 32);
}

export function evaluateCanaryDecision(project = {}, quoteCurve = {}, policyEnvelope = {}, governance = {}, options = {}) {
  const policy = policyEnvelope?.policy || {};
  const blockers = [];
  const role = options.role || "TREATMENT";
  const isControl = String(role).startsWith("CONTROL_");
  const chain = lower(project.chain || project.network || project.canonicalChain);
  const signalState = project.capitalArrivalIntelligence?.state || project.capitalArrivalState || null;
  const liquidityUsd = finite(project.stableExitLiquidityUsd ?? project.activeLiquidityUsd ?? project.liquidityUsd ?? project.marketData?.liquidityUsd);
  const primary = (quoteCurve.quotes || []).find((quote) =>
    Number(quote.requestedNotionalUsd) === Number(policy.primaryNotionalUsd)
  ) || null;

  if (governance?.state !== "SHADOW_EDGE_SUPPORTED_FOR_CANARY_DESIGN_REVIEW") blockers.push("V13_GOVERNOR_NOT_ELIGIBLE");
  if (!policyEnvelope?.frozen || policyEnvelope.state !== "CANARY_POLICY_FROZEN") blockers.push("CANARY_POLICY_NOT_FROZEN");
  if (!(policy.allowedChains || []).includes(chain)) blockers.push("CHAIN_NOT_CANARY_ELIGIBLE");
  if (!isControl && signalState !== policy.signalState) blockers.push("SIGNAL_STATE_NOT_ELIGIBLE");
  if (liquidityUsd === null || liquidityUsd < Number(policy.minLiquidityUsd || 0)) blockers.push("LIQUIDITY_BELOW_POLICY_MINIMUM");
  if (!primary || primary.status !== "EXECUTABLE_QUOTE_OBSERVED" || primary.executable === false) blockers.push("PRIMARY_EXECUTABLE_QUOTE_MISSING");
  if (primary) {
    const signalMs = isoMs(project.observedAt || project.scannedAt || quoteCurve.signalObservedAt);
    const quoteMs = isoMs(primary.capturedAt);
    if (!signalMs || !quoteMs || quoteMs < signalMs || quoteMs - signalMs > Number(policy.maxQuoteAgeMs || 5000)) blockers.push("PRIMARY_QUOTE_STALE");
    if (finite(primary.priceImpactBps) === null || Math.abs(primary.priceImpactBps) > Number(policy.maxEntryImpactBps || Infinity)) blockers.push("ENTRY_IMPACT_EXCEEDS_POLICY");
    if (finite(primary.allInCostBps) === null || primary.allInCostBps > Number(policy.maxAllInEntryCostBps || Infinity)) blockers.push("ENTRY_COST_EXCEEDS_POLICY");
  }
  return {
    state: blockers.length ? "NO_TRADE" : (isControl ? "PAPER_CONTROL_EXECUTE" : "PAPER_EXECUTE"),
    blockers,
    primaryEntryQuote: primary,
    chain,
    liquidityUsd,
    role,
    paperOnly: true,
    realMoneyOrderCreated: false,
  };
}

export function buildCanaryTicket(project = {}, quoteCurve = {}, policyEnvelope = {}, governance = {}, options = {}) {
  const signalObservedAt = options.signalObservedAt || project.observedAt || project.scannedAt || quoteCurve.signalObservedAt || new Date().toISOString();
  const role = options.role || "TREATMENT";
  const decision = evaluateCanaryDecision(project, quoteCurve, policyEnvelope, governance, { role });
  const chain = decision.chain;
  const tokenAddress = lower(project.tokenAddress || project.contractAddress || project.address);
  const identityKey = project.identityKey || project.candidateKey || `${chain}:${tokenAddress || String(project.symbol || "unknown").toLowerCase()}`;
  return {
    schemaVersion: 1,
    canaryVersion: "V14_EXECUTABLE_EDGE_CANARY_V1",
    ticketId: ticketIdOf(project, signalObservedAt, policyEnvelope.specificationHash),
    policyHash: policyEnvelope.specificationHash || null,
    policyVersion: policyEnvelope.policy?.version || null,
    signalDefinitionVersion: project.signalDefinitionVersion || "V10_COMMITTED_LOADED_VACUUM_V1",
    signalObservedAt,
    capturedAt: options.capturedAt || new Date().toISOString(),
    identityKey,
    role,
    parentTreatmentTicketId: options.parentTreatmentTicketId || null,
    chain,
    tokenAddress: tokenAddress || null,
    poolAddress: lower(project.poolAddress || project.pairAddress || project.primaryTradablePool) || null,
    symbol: project.symbol || null,
    name: project.name || null,
    signalPriceUsd: finite(project.priceUsd ?? project.price ?? project.marketData?.priceUsd),
    liquidityUsd: decision.liquidityUsd,
    marketCapUsd: finite(project.marketCapUsd ?? project.marketCap ?? project.marketData?.marketCap),
    capitalArrivalState: project.capitalArrivalIntelligence?.state || project.capitalArrivalState || null,
    ignitionState: project.ignitionTwin?.state || project.ignitionState || null,
    supplyVacuumSupported: project.capitalArrivalIntelligence?.supplyVacuumSupported ?? project.supplyVacuumSupported ?? null,
    governanceState: governance?.state || "UNKNOWN",
    quoteCurve,
    capacityFrontier: quoteCurve.capacity || null,
    decisionState: decision.state,
    decisionBlockers: decision.blockers,
    primaryEntryQuote: decision.primaryEntryQuote,
    paperExecution: ["PAPER_EXECUTE", "PAPER_CONTROL_EXECUTE"].includes(decision.state) ? {
      state: "PAPER_ENTRY_FROZEN",
      notionalUsd: finite(decision.primaryEntryQuote?.requestedNotionalUsd),
      tokenAmount: finite(decision.primaryEntryQuote?.outputTokenAmount),
      executablePriceUsd: finite(decision.primaryEntryQuote?.executablePriceUsd),
      allInEntryCostBps: finite(decision.primaryEntryQuote?.allInCostBps),
      quoteCapturedAt: decision.primaryEntryQuote?.capturedAt || null,
    } : null,
    shadowOnly: true,
    rankingInfluence: false,
    paperOnly: true,
    realMoneyOrderCreated: false,
  };
}

export function appendCanaryTickets(tickets = [], options = {}) {
  const file = options.file || FILE;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = readTail(file, options.maxBytes);
  const ids = new Set(existing.map((row) => row.ticketId));
  const fresh = (Array.isArray(tickets) ? tickets : []).filter((row) => row?.ticketId && !ids.has(row.ticketId));
  if (fresh.length) fs.appendFileSync(file, fresh.map((row) => JSON.stringify(row)).join("\n") + "\n");
  if (fs.existsSync(file) && fs.statSync(file).size > Number(options.maxBytes || MAX_BYTES)) {
    const retained = readTail(file, Math.floor(Number(options.maxBytes || MAX_BYTES) * 0.75));
    fs.writeFileSync(file, retained.map((row) => JSON.stringify(row)).join("\n") + (retained.length ? "\n" : ""));
  }
  return { file, saved: fresh.length, duplicates: (tickets || []).length - fresh.length, tickets: fresh };
}

export function loadCanaryTickets(options = {}) {
  return readTail(options.file || FILE, options.maxBytes).slice(-Math.max(1, Number(options.limit || 100000)));
}

export const CANARY_TICKET_FILE = FILE;
export const __canaryTicketHooks = { finite, isoMs, lower, ticketIdOf, readTail };
