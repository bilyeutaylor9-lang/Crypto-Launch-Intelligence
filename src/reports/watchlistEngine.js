import fs from "fs";
import path from "path";

export function buildWatchlist(projects = []) {
  return projects
    .filter((p) => {
      const score = Number(p.opportunityScore ?? p.score ?? 0);
      const risk = Number(p.signalProfile?.risk ?? p.riskScore ?? 0);
      const priority = Number(p.watchlistPriority ?? 0);
      const bucket = p.allocationBucket || "";

      return (
        risk < 70 &&
        (
          score >= 70 ||
          priority >= 65 ||
          ["Core Watch", "Priority Research", "Starter Watch"].includes(bucket)
        )
      );
    })
    .sort((a, b) => {
      const aScore = Number(a.watchlistPriority ?? a.opportunityScore ?? a.score ?? 0);
      const bScore = Number(b.watchlistPriority ?? b.opportunityScore ?? b.score ?? 0);
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
