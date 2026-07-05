import fs from "fs";
import path from "path";

function clean(value = "") {
  return String(value ?? "")
    .replace(/"/g, '""')
    .replace(/\n/g, " ")
    .trim();
}

export function writeCsvReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const headers = [
    "rank",
    "name",
    "symbol",
    "chain",
    "opportunityScore",
    "riskScore",
    "confidence",
    "marketCap",
    "volume24h",
    "liquidity",
    "narrative",
    "tier",
  ];

  const rows = projects.map((p, index) => [
    index + 1,
    p.name,
    p.symbol,
    p.chain,
    p.opportunityScore ?? p.score ?? 0,
    p.riskScore ?? 0,
    p.confidence ?? "",
    p.marketCap ?? "",
    p.volume24h ?? p.volume ?? "",
    p.liquidity ?? "",
    p.narrative ?? "",
    p.tier ?? "",
  ]);

  const csv = [
    headers.join(","),
    ...rows.map((row) => row.map((v) => `"${clean(v)}"`).join(",")),
  ].join("\n");

  const filePath = path.join(reportsDir, "opportunities.csv");
  fs.writeFileSync(filePath, csv);

  return filePath;
}
