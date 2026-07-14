function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

function firstNumber(project = {}, paths = []) {
  for (const path of paths) {
    const value = path.split(".").reduce((acc, part) => (acc ? acc[part] : undefined), project);
    if (Number.isFinite(Number(value)) && Number(value) > 0) return Number(value);
  }
  return 0;
}

function firstValue(project = {}, paths = []) {
  for (const path of paths) {
    const value = path.split(".").reduce((acc, part) => (acc ? acc[part] : undefined), project);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

export function analyzeDeployerReputation(project = {}) {
  const history = project.deployerHistory || project.nativeLifecycle?.deployerHistory || {};
  const priorDeployments = firstNumber({ ...project, deployerHistory: history }, ["deployerHistory.priorDeployments", "priorDeployments"]);
  const priorRugs = firstNumber({ ...project, deployerHistory: history }, ["deployerHistory.priorRugs", "priorRugs"]);
  const successfulLaunches = firstNumber({ ...project, deployerHistory: history }, ["deployerHistory.successfulLaunches", "successfulLaunches"]);
  const walletAgeDays = firstNumber({ ...project, deployerHistory: history }, ["deployerHistory.walletAgeDays", "walletAgeDays"]);
  const lpRemovalHistory = firstNumber({ ...project, deployerHistory: history }, ["deployerHistory.lpRemovalHistory", "lpRemovalHistory"]);
  const reusedBytecodeRisk = firstNumber({ ...project, deployerHistory: history }, ["deployerHistory.reusedBytecodeRisk", "reusedBytecodeRisk"]);
  const deployerNetFlow = num(project.nativeLifecycle?.deployerNetFlow ?? project.deployerNetFlow);
  const fundingSourceRisk = firstNumber({ ...project, deployerHistory: history }, ["deployerHistory.fundingSourceRisk", "fundingSourceRisk"]);
  const deployer = firstValue(project, ["nativeLifecycle.deployer", "deployer", "creator"]);

  const ageScore = walletAgeDays >= 365 ? 18 : walletAgeDays >= 90 ? 12 : walletAgeDays >= 21 ? 7 : walletAgeDays > 0 ? 2 : 0;
  const successScore = Math.min(28, successfulLaunches * 8);
  const experienceScore = Math.min(10, priorDeployments * 1.5);
  const rugPenalty = priorRugs * 24 + lpRemovalHistory * 18;
  const flowPenalty = deployerNetFlow < -50_000 ? 18 : deployerNetFlow < -10_000 ? 10 : 0;
  const codePenalty = clamp(reusedBytecodeRisk * 0.35);
  const fundingPenalty = clamp(fundingSourceRisk * 0.3);
  const score = Math.round(clamp(48 + ageScore + successScore + experienceScore - rugPenalty - flowPenalty - codePenalty - fundingPenalty));
  const risk = Math.round(clamp(100 - score + priorRugs * 12 + lpRemovalHistory * 8 + (deployerNetFlow < 0 ? 6 : 0)));
  const warnings = [];

  if (priorRugs > 0) warnings.push("prior rug-linked deployer history");
  if (lpRemovalHistory > 0) warnings.push("prior liquidity removal history");
  if (deployerNetFlow < -10_000) warnings.push("developer sell or negative deployer flow");
  if (reusedBytecodeRisk >= 60) warnings.push("bytecode resembles risky prior deployments");
  if (!walletAgeDays) warnings.push("wallet age is unknown");

  return {
    ...project,
    deployerReputationScore: score,
    deployerRiskScore: risk,
    deployerReputationVerdict:
      risk >= 75 ? "Deployer Risk Block" : score >= 72 ? "Constructive Deployer History" : "Deployer Needs Verification",
    deployerReputation: {
      deployer,
      priorDeployments,
      priorRugs,
      successfulLaunches,
      walletAgeDays,
      lpRemovalHistory,
      reusedBytecodeRisk,
      fundingSourceRisk,
      deployerNetFlow,
      warnings,
    },
  };
}

export function analyzeDeployerReputationBatch(projects = []) {
  return projects.map((project) => analyzeDeployerReputation(project));
}

export function summarizeDeployerReputation(projects = []) {
  const analyzed = projects.map((project) => project.deployerReputation ? project : analyzeDeployerReputation(project));

  return {
    projectCount: analyzed.length,
    constructiveDeployers: analyzed.filter((project) => project.deployerReputationVerdict === "Constructive Deployer History").length,
    riskBlocks: analyzed.filter((project) => project.deployerReputationVerdict === "Deployer Risk Block").length,
    unknownWalletAge: analyzed.filter((project) => (project.deployerReputation?.warnings || []).includes("wallet age is unknown")).length,
  };
}
