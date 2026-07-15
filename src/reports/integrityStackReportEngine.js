import fs from "fs";
import path from "path";
import { attachProjectIdentity, identityKeyForProject } from "../discovery/projectIdentityGraph.js";
import { analyzeEvidenceCalibratedKernel } from "../kernel/evidenceCalibratedKernel.js";
import { validateFinalSelectionInvariants } from "../engines/finalSelectionIntegrityEngine.js";
import { validateSniperIntegrityInvariants } from "../engines/sniperIntegrityGateEngine.js";

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function statusFor({ fail = 0, warn = 0, pass = true } = {}) {
  if (!pass || fail > 0) return "FAIL";
  if (warn > 0) return "WARN";
  return "PASS";
}

function componentScore(status = "PASS", warningCount = 0) {
  if (status === "FAIL") return 25;
  if (status === "WARN") return Math.max(55, 85 - warningCount * 5);
  return 100;
}

function finalSelectionComponent(projects = []) {
  const validation = validateFinalSelectionInvariants(projects);
  const selectedContradictions = projects.filter((project) =>
    project.finalSelectionQualified === true &&
    (project.finalSelectionState !== "QUALIFIED" || project.aiDecision === "Reject" || project.identityConflict)
  );
  const status = statusFor({
    fail: validation.violationCount + selectedContradictions.length,
  });

  return {
    id: "final-selection-integrity",
    label: "Final Selection Integrity",
    status,
    score: componentScore(status, validation.violationCount),
    metrics: {
      qualified: projects.filter((project) => project.finalSelectionQualified === true).length,
      blocked: projects.filter((project) => project.finalSelectionState === "BLOCKED").length,
      invariantViolations: validation.violationCount,
      selectedContradictions: selectedContradictions.length,
    },
    findings: [
      ...validation.violations.slice(0, 10).map((violation) => violation.reason || violation.violation || String(violation)),
      ...selectedContradictions.slice(0, 5).map((project) => `${project.symbol || project.name || "Unknown"} has conflicting qualified state.`),
    ],
  };
}

function sniperComponent(projects = []) {
  const validation = validateSniperIntegrityInvariants(projects);
  const armed = projects.filter((project) => project.sniperQualified && project.sniperState === "ARMED");
  const armedWithBlockers = armed.filter((project) => (project.sniperBlockingReasons || []).length > 0);
  const status = statusFor({
    fail: validation.violationCount + armedWithBlockers.length,
  });

  return {
    id: "sniper-integrity-gate",
    label: "Sniper Integrity Gate",
    status,
    score: componentScore(status, validation.violationCount),
    metrics: {
      armed: armed.length,
      blocked: projects.filter((project) => project.sniperState === "BLOCKED").length,
      invariantViolations: validation.violationCount,
      armedWithBlockers: armedWithBlockers.length,
    },
    findings: [
      ...validation.violations.slice(0, 10).map((violation) => violation.reason || violation.violation || String(violation)),
      ...armedWithBlockers.slice(0, 5).map((project) => `${project.symbol || project.name || "Unknown"} is ARMED with blockers.`),
    ],
  };
}

function kernelComponent(projects = [], meta = {}) {
  const kernel = analyzeEvidenceCalibratedKernel(projects, meta);
  const status = statusFor({
    fail: kernel.engineManifestAudit.fail + kernel.fixtureAudit.failed.length,
    warn: kernel.engineManifestAudit.warn,
  });

  return {
    id: "evidence-calibrated-kernel",
    label: "Evidence-Calibrated Kernel",
    status,
    score: Math.round(
      (num(kernel.summary.averageFinalScore) * 0.25) +
        (num(kernel.summary.averageContractPassRate) * 0.25) +
        (num(kernel.summary.averageEvidenceCoverage) * 0.2) +
        (num(kernel.summary.manifestScore) * 0.2) +
        (num(kernel.summary.fixtureAuditPassRate) * 0.1)
    ),
    metrics: {
      armed: kernel.summary.armed,
      watch: kernel.summary.watch,
      blocked: kernel.summary.blocked,
      averageFinalScore: kernel.summary.averageFinalScore,
      averageContractPassRate: kernel.summary.averageContractPassRate,
      averageEvidenceCoverage: kernel.summary.averageEvidenceCoverage,
      manifestScore: kernel.summary.manifestScore,
      fixtureAuditPassRate: kernel.summary.fixtureAuditPassRate,
    },
    findings: [
      ...kernel.engineManifestAudit.contracts
        .filter((contract) => contract.status === "FAIL")
        .slice(0, 10)
        .map((contract) => `${contract.id}: ${contract.issues.join("; ")}`),
      ...kernel.fixtureAudit.failed.slice(0, 10).map((fixture) => `Fixture failed: ${fixture.fixture}`),
    ],
    kernel,
  };
}

function advancedBrainComponent(kernelComponentReport = {}) {
  const brain = kernelComponentReport.kernel?.summary?.brain || {};
  const demotions = num(brain.demotions);
  const highContradictions = num(brain.highContradictionCount);
  const status = statusFor({
    warn: demotions + highContradictions,
  });

  return {
    id: "advanced-brain-kernel",
    label: "Advanced Brain Kernel",
    status,
    score: componentScore(status, demotions + highContradictions),
    metrics: {
      armed: brain.armed || 0,
      watch: brain.watch || 0,
      researchOnly: brain.researchOnly || 0,
      blocked: brain.blocked || 0,
      demotions,
      averageBrainScore: brain.averageBrainScore || 0,
      averageUncertainty: brain.averageUncertainty || 0,
      highContradictionCount: highContradictions,
      regimes: brain.regimes || {},
    },
    findings: demotions || highContradictions
      ? [`Brain demoted ${demotions} project(s) and found ${highContradictions} high-contradiction project(s).`]
      : [],
  };
}

function universeLedgerComponent(meta = {}) {
  const ledger = meta.discovery?.universeLedger || meta.universeLedger || {};
  const totals = ledger.totals || ledger.persistentLedger?.totals || {};
  const tracked = num(ledger.savedProjects || ledger.trackedProjects || ledger.persistentLedger?.trackedProjects);
  const status = statusFor({
    warn: tracked ? 0 : 1,
  });

  return {
    id: "universe-ledger",
    label: "Universe Ledger",
    status,
    score: componentScore(status, tracked ? 0 : 1),
    metrics: {
      trackedProjects: tracked,
      promoted: num(totals.promoted),
      researchOnly: num(totals.researchOnly),
      blocked: num(totals.blocked),
      targetMet: Boolean(totals.targetMet),
      targetShortfall: num(totals.targetShortfall),
    },
    findings: tracked ? [] : ["Universe ledger has no saved/tracked project count in this run metadata."],
  };
}

function nativeDiscoveryComponent(projects = [], meta = {}) {
  const report = meta.discovery?.sourceReports?.nativeDiscoveryMesh || {};
  const projectCount = projects.filter((project) =>
    num(project.nativeDiscoveryScore) > 0 ||
    (project.discoverySources || []).includes("native-discovery-mesh") ||
    project.source === "native-discovery-mesh"
  ).length;
  const enabled = report.enabled !== false;
  const status = statusFor({
    warn: enabled && (num(report.scannedTokens) > 0 || projectCount > 0) ? 0 : 1,
  });

  return {
    id: "native-discovery-mesh",
    label: "Native Discovery Mesh",
    status,
    score: componentScore(status, status === "WARN" ? 1 : 0),
    metrics: {
      enabled,
      sourceStatus: report.status || "UNKNOWN",
      scannedTokens: num(report.scannedTokens),
      projectsWithNativeEvidence: projectCount,
    },
    findings: status === "WARN" ? ["Native discovery did not contribute candidates or project evidence in this run."] : [],
  };
}

function providerFailureComponent(kernelComponentReport = {}) {
  const sourceHealth = kernelComponentReport.kernel?.sourceHealth || {};
  const failed =
    num(sourceHealth.sourcesFailed) +
    num(sourceHealth.sourcesRateLimited) +
    num(sourceHealth.sourcesRegionBlocked) +
    num(sourceHealth.sourcesAuthMissing);
  const usableEvidence = num(sourceHealth.sourcesWithUsableEvidence);
  const status = statusFor({
    fail: usableEvidence ? 0 : 1,
    warn: failed,
  });

  return {
    id: "provider-failure-tests",
    label: "Provider Failure Tests",
    status,
    score: componentScore(status, failed),
    metrics: {
      sourcesConfigured: num(sourceHealth.sourcesConfigured),
      sourcesAttempted: num(sourceHealth.sourcesAttempted),
      sourcesSucceeded: num(sourceHealth.sourcesSucceeded),
      sourcesFailed: num(sourceHealth.sourcesFailed),
      sourcesRateLimited: num(sourceHealth.sourcesRateLimited),
      sourcesRegionBlocked: num(sourceHealth.sourcesRegionBlocked),
      sourcesAuthMissing: num(sourceHealth.sourcesAuthMissing),
      sourcesWithUsableEvidence: usableEvidence,
    },
    findings: usableEvidence ? [] : ["No provider has usable evidence in the kernel source-health summary."],
  };
}

function symbolCollisionComponent(projects = []) {
  const enriched = projects.map((project) => attachProjectIdentity(project));
  const groups = enriched.reduce((acc, project) => {
    const symbol = project.symbolIdentity?.canonicalSymbol || "UNKNOWN";
    acc[symbol] = acc[symbol] || [];
    acc[symbol].push(project);
    return acc;
  }, {});
  const collisions = Object.entries(groups)
    .filter(([, group]) => group.length > 1)
    .map(([symbol, group]) => {
      const projectKeys = new Set(group.map(identityKeyForProject));
      const chainSymbolIds = new Set(group.map((project) => project.chainSymbolIdentityId));
      const instanceIds = new Set(group.map((project) => project.symbolInstanceId));
      return {
        symbol,
        count: group.length,
        projectKeyCount: projectKeys.size,
        chainSymbolIdentityCount: chainSymbolIds.size,
        symbolInstanceCount: instanceIds.size,
        protected: projectKeys.size === group.length && instanceIds.size === group.length,
      };
    });
  const unprotected = collisions.filter((collision) => !collision.protected);
  const status = statusFor({ fail: unprotected.length });

  return {
    id: "symbol-collision-protection",
    label: "Symbol Collision Protection",
    status,
    score: componentScore(status, unprotected.length),
    metrics: {
      totalSymbols: Object.keys(groups).length,
      collisionSymbols: collisions.length,
      protectedCollisions: collisions.filter((collision) => collision.protected).length,
      unprotectedCollisions: unprotected.length,
    },
    findings: unprotected.map((collision) => `${collision.symbol} collision is not fully separated.`),
    collisions,
  };
}

function reportConsistencyComponent(projects = [], kernelComponentReport = {}) {
  const kernelProjects = kernelComponentReport.kernel?.topDecisions || [];
  const projectIds = new Set(projects.map((project) => project.projectId || project.identityKey || `${project.chain || "unknown"}:${project.symbol || project.name || "UNKNOWN"}`));
  const missingKernelIds = kernelProjects.filter((project) => !project.projectId).length;
  const qualifiedContradictions = projects.filter((project) =>
    project.finalSelectionQualified === true && project.finalSelectionState !== "QUALIFIED"
  );
  const status = statusFor({
    fail: missingKernelIds + qualifiedContradictions.length,
    warn: projects.length && projectIds.size === 0 ? 1 : 0,
  });

  return {
    id: "report-consistency-tests",
    label: "Report Consistency Tests",
    status,
    score: componentScore(status, missingKernelIds + qualifiedContradictions.length),
    metrics: {
      projects: projects.length,
      distinctProjectIds: projectIds.size,
      kernelTopDecisions: kernelProjects.length,
      missingKernelIds,
      qualifiedContradictions: qualifiedContradictions.length,
    },
    findings: [
      ...qualifiedContradictions.slice(0, 5).map((project) => `${project.symbol || project.name || "Unknown"} qualified/report state mismatch.`),
      ...(missingKernelIds ? [`${missingKernelIds} kernel top decision(s) missing projectId.`] : []),
    ],
  };
}

export function buildIntegrityStackReport(projects = [], meta = {}) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const finalSelection = finalSelectionComponent(safeProjects);
  const sniper = sniperComponent(safeProjects);
  const kernel = kernelComponent(safeProjects, meta);
  const components = [
    finalSelection,
    sniper,
    kernel,
    advancedBrainComponent(kernel),
    universeLedgerComponent(meta),
    nativeDiscoveryComponent(safeProjects, meta),
    providerFailureComponent(kernel),
    symbolCollisionComponent(safeProjects),
    reportConsistencyComponent(safeProjects, kernel),
  ];
  const fail = components.filter((component) => component.status === "FAIL").length;
  const warn = components.filter((component) => component.status === "WARN").length;
  const readinessScore = Math.round(
    components.reduce((sum, component) => sum + component.score, 0) / Math.max(1, components.length)
  );

  return {
    generatedAt: new Date().toISOString(),
    name: "Crypto Launch Intelligence Integrity Stack",
    status: fail ? "FAIL" : warn ? "WARN" : "PASS",
    readinessScore,
    summary: {
      components: components.length,
      pass: components.filter((component) => component.status === "PASS").length,
      warn,
      fail,
      projectsAnalyzed: safeProjects.length,
    },
    doctrine: [
      "Final picks must pass final selection integrity.",
      "ARMED labels must pass sniper integrity.",
      "Scores must survive evidence calibration and brain contradiction checks.",
      "Symbol identities may connect tickers, but project identities must remain collision-safe.",
      "Provider failures must be visible instead of hidden behind source lists.",
    ],
    components,
    nextActions: components
      .filter((component) => component.status !== "PASS")
      .map((component) => ({
        component: component.label,
        action: component.findings[0] || "Review component warnings.",
      })),
  };
}

export function writeIntegrityStackReport(projects = [], meta = {}) {
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const report = buildIntegrityStackReport(projects, meta);
  const filePath = path.join(reportsDir, "integrity-stack.json");
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));

  return {
    filePath,
    report,
  };
}
