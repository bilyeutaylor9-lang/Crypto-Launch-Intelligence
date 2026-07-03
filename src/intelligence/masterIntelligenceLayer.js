import { getTokenData } from "../data/dataOrchestrator.js";

export async function buildMasterIntelligence(token = {}) {
  const market = await getTokenData(token, {
    limit: 250,
    minConfidence: 70
  });

  return {
    token,

    status: market.status === "SUCCESS" ? "READY" : "PARTIAL",

    data: {
      market,
      social: null,
      github: null,
      onchain: null,
      news: null,
      wallets: null
    },

    health: {
      marketReady: market.status === "SUCCESS",
      socialReady: false,
      githubReady: false,
      onchainReady: false,
      newsReady: false,
      walletReady: false
    },

    engineInput: {
      token,
      market,
      social: {},
      github: {},
      onchain: {},
      news: {},
      wallets: {}
    }
  };
}
