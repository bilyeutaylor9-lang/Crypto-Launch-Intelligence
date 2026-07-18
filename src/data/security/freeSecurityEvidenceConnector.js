import { getBlockscoutSecurityEvidence } from "./blockscoutConnector.js";
import { getGoPlusSecurityEvidence } from "./goplusSecurityConnector.js";
import { getSourcifySecurityEvidence } from "./sourcifyV2Connector.js";
import { summarizeSecurityEvidence } from "./securityEvidenceUtils.js";

const DEFAULT_PROVIDERS = [
  getGoPlusSecurityEvidence,
  getSourcifySecurityEvidence,
  getBlockscoutSecurityEvidence,
];

export async function getFreeSecurityEvidence(project = {}, options = {}) {
  const providers = options.providers || DEFAULT_PROVIDERS;
  const settled = await Promise.allSettled(
    providers.map((provider) => provider(project, options))
  );
  const evidence = settled.map((result, index) =>
    result.status === "fulfilled"
      ? result.value
      : {
          provider: providers[index]?.name || "security-provider",
          status: "UNKNOWN",
          observedAt: new Date().toISOString(),
          riskFindings: [],
          warnings: [result.reason?.message || "Security provider failed."],
          confidence: 0,
          raw: null,
        }
  );

  return {
    status: evidence.some((item) => item.status !== "UNKNOWN") ? "EVIDENCE_AVAILABLE" : "UNKNOWN",
    observedAt: new Date().toISOString(),
    evidence,
    summary: summarizeSecurityEvidence(evidence),
  };
}

if (process.argv[1]?.includes("freeSecurityEvidenceConnector.js")) {
  const [, , symbol = "UNKNOWN", chain = "base", address = ""] = process.argv;
  const result = await getFreeSecurityEvidence({ symbol, chain, address }, { useCache: false });
  console.log(JSON.stringify(result, null, 2));
}
