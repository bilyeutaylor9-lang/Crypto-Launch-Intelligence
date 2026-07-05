import fs from "fs";
import path from "path";

export function buildWatchlist(projects = []) {
  return projects
    .filter((p) => {
      const score = Number(p.opportunityScore ?? p.score ?? 0);
      const risk = Number(p.riskScore ?? 0);

      return score >= 70 && risk < 70;
    })
    .sort((a, b) => {
      const aScore = Number(a.opportunityScore ?? a.score ?? 0);
      const bScore = Number(b.opportunityScore ?? b.score ?? 0);
      return bScore - aScore;
    })
    .slice(0, 25);
}

export function writeWatchlist(projects = []) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const watchlist = buildWatchlist(projects);

  const filePath = path.join(reportsDir, "watchlist.json");
  fs.writeFileSync(filePath, JSON.stringify(watchlist, null, 2));

  return {
    filePath,
    watchlist,
  };
}
