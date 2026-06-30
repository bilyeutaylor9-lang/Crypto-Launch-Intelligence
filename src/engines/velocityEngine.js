// src/engines/velocityEngine.js

/**
 * Crypto Launch Intelligence
 * Velocity Engine
 *
 * Purpose:
 * Measures how quickly important metrics are changing.
 * This is the first layer of early momentum detection.
 */

function calculateVelocity(current = 0, previous = 0, hours = 24) {
    if (previous <= 0 || hours <= 0) return 0;

    return (current - previous) / hours;
}

export function analyzeVelocity(project = {}) {

    const velocity = {

        volumeVelocity:
            calculateVelocity(
                Number(project.volume24h || 0),
                Number(project.previousVolume24h || 0)
            ),

        liquidityVelocity:
            calculateVelocity(
                Number(project.liquidityUsd || 0),
                Number(project.previousLiquidityUsd || 0)
            ),

        holderVelocity:
            calculateVelocity(
                Number(project.holders || 0),
                Number(project.previousHolders || 0)
            ),

        followerVelocity:
            calculateVelocity(
                Number(project.followers || 0),
                Number(project.previousFollowers || 0)
            ),

        developerVelocity:
            calculateVelocity(
                Number(project.commits30d || 0),
                Number(project.previousCommits30d || 0),
                30
            ),

        smartWalletVelocity:
            calculateVelocity(
                Number(project.smartWalletBuys24h || 0),
                Number(project.previousSmartWalletBuys24h || 0)
            )

    };

    let score = 0;

    Object.values(velocity).forEach(value => {

        if (value > 0) score += 8;

        if (value > 10) score += 4;

    });

    score = Math.min(score,100);

    return {

        ...project,

        velocity,

        velocityScore: score,

        velocityLevel:

            score >= 85
                ? "Explosive"

            : score >= 65
                ? "Accelerating"

            : score >= 45
                ? "Growing"

            : "Stable",

        evidence: [
            {
                engine: "Velocity Engine",
                signal: "Growth Velocity",
                confidence: Math.min(score / 100,1),
                impact: score >= 60 ? "Positive" : "Neutral"
            }
        ],

        alerts:
            score >= 75
                ? ["Velocity spike detected."]
                : []

    };

}

export function analyzeVelocityBatch(projects = []) {

    return projects

        .map(analyzeVelocity)

        .sort((a,b)=>

            b.velocityScore-a.velocityScore

        );

}
