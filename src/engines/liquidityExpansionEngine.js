// src/engines/liquidityExpansionEngine.js

/**
 * Crypto Launch Intelligence
 * Liquidity Expansion Engine
 *
 * Purpose:
 * Detect whether liquidity is expanding
 * fast enough to support sustainable growth.
 */

export function calculateLiquidityExpansion(project = {}) {

    const currentLiquidity =
        Number(project.liquidityUsd || 0);

    const previousLiquidity =
        Number(project.previousLiquidityUsd || 0);

    const expansionRate =
        previousLiquidity > 0
            ? ((currentLiquidity - previousLiquidity) /
                previousLiquidity) * 100
            : 0;

    return {

        currentLiquidity,

        previousLiquidity,

        expansionRate

    };

}

export function scoreLiquidityExpansion(project={}){

    const liquidity =
        calculateLiquidityExpansion(project);

    let score = 0;

    if(liquidity.expansionRate >= 10)
        score += 20;

    if(liquidity.expansionRate >= 25)
        score += 20;

    if(liquidity.expansionRate >= 50)
        score += 20;

    if(project.capitalFlowScore >= 60)
        score += 20;

    if(project.smartMoneyRotationScore >= 60)
        score += 10;

    if(project.buyPressureScore >= 60)
        score += 10;

    return Math.min(score,100);

}

export function analyzeLiquidityExpansion(project={}){

    const liquidityExpansion =
        calculateLiquidityExpansion(project);

    const liquidityExpansionScore =
        scoreLiquidityExpansion(project);

    return{

        ...project,

        liquidityExpansion,

        liquidityExpansionScore,

        liquidityExpansionLevel:

            liquidityExpansionScore>=85
                ? "Institutional Expansion"

            : liquidityExpansionScore>=65
                ? "Strong Expansion"

            : liquidityExpansionScore>=45
                ? "Growing"

            : "Stable",

        evidence:[

            ...(project.evidence||[]),

            {

                engine:"Liquidity Expansion Engine",

                signal:"Liquidity Growth",

                confidence:
                    Math.min(
                        liquidityExpansionScore/100,
                        1
                    ),

                impact:
                    liquidityExpansionScore>=60
                        ? "Positive"
                        : "Neutral"

            }

        ],

        alerts:[

            ...(project.alerts||[]),

            ...(liquidityExpansionScore>=80

                ? ["Rapid liquidity expansion detected."]

                : [])

        ]

    };

}

export function analyzeLiquidityExpansionBatch(projects=[]){

    return projects

        .map(analyzeLiquidityExpansion)

        .sort((a,b)=>

            b.liquidityExpansionScore-
            a.liquidityExpansionScore

        );

}
