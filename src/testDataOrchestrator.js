import { getTokenData, getDataCacheStats } from "./data/dataOrchestrator.js";

const token = {
  chain: "solana",
  symbol: "ACT",
  address: "ACT"
};

const result = await getTokenData(token);

console.log(JSON.stringify(result, null, 2));
console.log("CACHE:", getDataCacheStats());
