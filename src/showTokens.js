import { scanLiveMarket } from "./liveMarketScanner.js";

const report = await scanLiveMarket({ maxTokens: 25 });

console.log("\nTOKENS FOUND");
console.log("============");

report.results.slice(0, 25).forEach((token, i) => {
  console.log(
    `${i + 1}. ${token.name} (${token.symbol}) | ${token.chain} | Liquidity $${token.liquidityUsd} | Volume $${token.volume24h} | Momentum ${token.momentumShiftScore}`
  );
});
