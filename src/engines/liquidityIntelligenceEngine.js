// src/engines/liquidityIntelligenceEngine.js

/**
 * Crypto Launch Intelligence
 * Liquidity Intelligence Engine
 *
 * Purpose:
 * Analyze liquidity quality, growth, and sustainability.
 * Good liquidity often matters more than simply having
 * a large liquidity number.
 */

export function scoreLiquidity(project = {}) {

    let score = 0;

    const liquidity = Number(project.liquidityUsd || 0);
    const volume = Number(project.volume24h || 0);
    const liquidityGrowth = Number(project.liquidityGrowth24h || 0);
    const buyVolume = Number(project.buyVolume24h || 0);
    const sellVolume = Number(project.sellVolume24h || 0);

    if (liquidity >= 25000) score += 10;
    if (liquidity >= 100000) score += 15;
    if (liquidity >= 500000) score += 20;

    if (volume >= liquidity * 0.50) score += 15;

    if (volume >= liquidity) score += 15;

    if (liquidityGrowth >= 10) score += 10;

    if (liquidityGrowth >= 30) score += 15;

    if (buyVolume > sellVolume) score += 10;

    return Math.min(score,100);

}

export function classifyLiquidity(score){

    if(score>=85) return "institutional";

    if(score>=70) return "excellent";

    if(score>=55) return "healthy";

    if(score>=40) return "developing";

    return "weak";

}

export function analyzeLiquidity(project={}){

    const liquidityScore = scoreLiquidity(project);

    return {

        ...project,

        liquidityScore,

        liquidityQuality:

            classifyLiquidity(liquidityScore),

        liquidityReason:

            liquidityScore>=70

            ? "Liquidity is healthy and improving."

            : "Liquidity needs additional monitoring."

    };

}

export function analyzeLiquidityBatch(projects=[]){

    return projects

        .map(analyzeLiquidity)

        .sort((a,b)=>

            b.liquidityScore-a.liquidityScore

        );

}
