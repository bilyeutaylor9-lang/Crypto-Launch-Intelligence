// src/engines/tokenomicsEngine.js

/**
 * Crypto Launch Intelligence
 * Tokenomics Engine
 *
 * Purpose:
 * Evaluate whether a project's token economics support
 * long-term growth and healthy market structure.
 */

export function scoreTokenomics(project = {}) {

    let score = 0;

    const circulatingSupply =
        Number(project.circulatingSupply || 0);

    const totalSupply =
        Number(project.totalSupply || 0);

    const fdv =
        Number(project.fdv || 0);

    const marketCap =
        Number(project.marketCap || 0);

    const liquidity =
        Number(project.liquidityUsd || 0);

    if (circulatingSupply > 0 && totalSupply > 0) {

        const circulatingRatio =
            circulatingSupply / totalSupply;

        if (circulatingRatio >= 0.25) score += 15;

        if (circulatingRatio >= 0.50) score += 15;

    }

    if (marketCap > 0 && fdv > 0) {

        const fdvRatio = marketCap / fdv;

        if (fdvRatio >= 0.50) score += 15;

        if (fdvRatio >= 0.80) score += 10;

    }

    if (liquidity >= 100000) score += 10;

    if (project.teamAllocation <= 20) score += 10;

    if (project.vestingMonths >= 24) score += 10;

    if (project.burnMechanism) score += 5;

    if (project.staking) score += 5;

    if (project.maxSupply) score += 5;

    return Math.min(score,100);

}

export function classifyTokenomics(score){

    if(score>=85) return "excellent";

    if(score>=70) return "strong";

    if(score>=55) return "healthy";

    if(score>=40) return "average";

    return "weak";

}

export function analyzeTokenomics(project={}){

    const tokenomicsScore =
        scoreTokenomics(project);

    return {

        ...project,

        tokenomicsScore,

        tokenomicsQuality:
            classifyTokenomics(tokenomicsScore),

        tokenomicsReason:

            tokenomicsScore>=70

            ? "Tokenomics appear balanced and sustainable."

            : "Tokenomics require additional review."

    };

}

export function analyzeTokenomicsBatch(projects=[]){

    return projects

        .map(analyzeTokenomics)

        .sort((a,b)=>

            b.tokenomicsScore-a.tokenomicsScore

        );

}
