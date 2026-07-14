function lower(value = "") {
  return String(value || "").trim().toLowerCase();
}

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function resolveBytecodeLineage(project = {}) {
  const bytecodeHash = lower(project.bytecodeHash || project.contractBytecodeHash || project.implementationHash);
  const implementation = lower(project.implementationAddress || project.proxyImplementation);
  const factory = lower(project.factoryAddress || project.factory || project.nativeLifecycle?.factoryAddress);
  const lineage = project.bytecodeLineage || {};
  const relatedProjects = Array.isArray(lineage.relatedProjects)
    ? lineage.relatedProjects
    : Array.isArray(project.relatedBytecodeProjects)
    ? project.relatedBytecodeProjects
    : [];
  const priorRugs = num(lineage.priorRugs || project.bytecodePriorRugs);
  const priorFailures = num(lineage.priorFailures || project.bytecodePriorFailures);
  const successfulDeployments = num(lineage.successfulDeployments || project.bytecodeSuccessfulDeployments);
  const reusedBytecodeRisk = Math.max(num(project.reusedBytecodeRisk), num(lineage.reusedBytecodeRisk), priorRugs * 30 + priorFailures * 12);
  const bytecodeLineageScore = Math.round(
    Math.max(0, Math.min(100, 42 + (bytecodeHash ? 16 : 0) + successfulDeployments * 8 - reusedBytecodeRisk * 0.55))
  );

  return {
    bytecodeHash,
    implementation,
    factory,
    relatedProjects,
    priorRugs,
    priorFailures,
    successfulDeployments,
    reusedBytecodeRisk: Math.round(Math.min(100, reusedBytecodeRisk)),
    bytecodeLineageScore,
    warnings: [
      ...(priorRugs > 0 ? ["bytecode lineage linked to prior rugs"] : []),
      ...(reusedBytecodeRisk >= 70 ? ["high-risk reused bytecode"] : []),
      ...(!bytecodeHash && !implementation && !factory ? ["missing bytecode/factory lineage"] : []),
    ],
  };
}
