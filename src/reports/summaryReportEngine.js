import fs from "fs";
import path from "path";

export function writeSummaryReport(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const total = projects.length;

  const ranked = [...projects].sort((a, b) => {
    const aScore = Number(a.opportunityScore ?? a.score ?? 0);
    const bScore = Number(b.opportunityScore ?? b.score ?? 0);
    return bScore - aScore;
  });

  const topProject = ranked[0];

  const avgScore =
    total === 0
      ? 0
      : ranked.reduce(
          (sum, p) => sum + Number(p.opportunityScore ?? p.score ?? 0),
          0
        ) / total;

  const strongBuy = ranked.filter(
    (p) => Number(p.opportunityScore ?? p.score ?? 0) >= 80
  );

  const summary = `
CRYPTO LAUNCH INTELLIGENCE REPORT
Generated: ${new Date().toLocaleString()}

Projects scanned: ${total}
Average opportunity score: ${avgScore.toFixed(2)}
Strong buy candidates: ${strongBuy.length}

Top project:
${topProject ? `${topProject.name || "Unknown"} (${topProject.symbol || "N/A"})` : "None"}

Top score:
${topProject ? Number(topProject.opportunityScore ?? topProject.score ?? 0).toFixed(2) : "N/A"}

Files generated:
- reports/report.html
- reports/report.json
- reports/opportunities.csv
- reports/watchlist.json
- reports/summary.txt
`.trim();

  const filePath = path.join(reportsDir, "summary.txt");
  fs.writeFileSync(filePath, summary);

  return filePath;
}
