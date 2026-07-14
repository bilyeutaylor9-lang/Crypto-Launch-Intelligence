function lower(value = "") {
  return String(value || "").trim().toLowerCase();
}

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function unique(values = []) {
  return [...new Set(values.map(lower).filter(Boolean))];
}

export function resolveWalletRelationshipGraph(project = {}) {
  const lifecycle = project.nativeLifecycle || {};
  const buyerState = lifecycle.buyerState || {};
  const deployers = unique([
    project.deployer,
    project.deployerAddress,
    project.creator,
    lifecycle.deployer,
    ...(Array.isArray(project.deployerWallets) ? project.deployerWallets : []),
  ]);
  const fundingWallets = unique([
    project.fundingWallet,
    project.funder,
    ...(Array.isArray(project.fundingWallets) ? project.fundingWallets : []),
  ]);
  const treasuryWallets = unique([
    project.treasury,
    project.treasuryWallet,
    project.multisig,
    project.multisigWallet,
    ...(Array.isArray(project.treasuryWallets) ? project.treasuryWallets : []),
  ]);
  const buyerWallets = unique([
    ...(Array.isArray(project.buyerWallets) ? project.buyerWallets : []),
    ...(Array.isArray(project.earlyBuyerWallets) ? project.earlyBuyerWallets : []),
  ]);
  const sameFunderBuyers = num(project.sameFunderBuyers24h || buyerState.sameFunderBuyers);
  const deployerConnectedBuyers = num(project.deployerConnectedBuyers || buyerState.deployerConnectedBuyers);
  const sniperBuyers = num(project.sniperBuyers24h || buyerState.sniperBuyers);
  const independentBuyers = num(project.independentBuyers24h || buyerState.independentBuyers);
  const uniqueBuyers = Math.max(num(project.uniqueBuyers24h || buyerState.uniqueBuyers), independentBuyers + sameFunderBuyers + deployerConnectedBuyers + sniperBuyers);
  const unclassifiedBuyers = Math.max(0, uniqueBuyers - independentBuyers - sameFunderBuyers - deployerConnectedBuyers - sniperBuyers);
  const clusteredBuyers = sameFunderBuyers + deployerConnectedBuyers + sniperBuyers;
  const clusterRiskScore = uniqueBuyers > 0
    ? Math.round(Math.min(100, (clusteredBuyers / uniqueBuyers) * 100 + deployerConnectedBuyers * 0.5))
    : 35;
  const nodes = [
    ...deployers.map((wallet) => ({ id: wallet, type: "deployer" })),
    ...fundingWallets.map((wallet) => ({ id: wallet, type: "funder" })),
    ...treasuryWallets.map((wallet) => ({ id: wallet, type: "treasury" })),
    ...buyerWallets.map((wallet) => ({ id: wallet, type: "buyer" })),
  ];
  const edges = [
    ...fundingWallets.flatMap((wallet) => deployers.map((deployer) => ({ from: wallet, to: deployer, type: "funded_deployer", confidence: 0.72 }))),
    ...treasuryWallets.flatMap((wallet) => deployers.map((deployer) => ({ from: deployer, to: wallet, type: "controls_treasury", confidence: 0.64 }))),
  ];

  return {
    deployers,
    fundingWallets,
    treasuryWallets,
    buyerWallets,
    nodes,
    edges,
    buyerBreakdown: {
      totalBuyers: uniqueBuyers,
      independentBuyers,
      sameFunderBuyers,
      sniperBuyers,
      deployerConnectedBuyers,
      unclassifiedBuyers,
    },
    clusterRiskScore,
    walletRelationshipScore: Math.round(Math.max(0, Math.min(100, 70 + independentBuyers * 0.18 - clusterRiskScore * 0.55))),
    warnings: [
      ...(deployerConnectedBuyers > 0 ? ["deployer-connected buyers detected"] : []),
      ...(sameFunderBuyers > independentBuyers * 0.5 ? ["same-funder cluster dominates early buyers"] : []),
      ...(sniperBuyers > independentBuyers * 0.35 ? ["sniper-heavy launch"] : []),
      ...(!deployers.length ? ["missing deployer wallet"] : []),
    ],
  };
}
