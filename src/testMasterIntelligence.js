import { buildMasterIntelligence } from "./intelligence/masterIntelligenceLayer.js";

const token = {
  chain: "solana",
  symbol: "ACT",
  address: null
};

const result = await buildMasterIntelligence(token);

console.log(JSON.stringify(result, null, 2));
