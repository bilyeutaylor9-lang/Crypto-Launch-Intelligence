// src/engines/buyPressureEngine.js

/**
 * Crypto Launch Intelligence
 * Buy Pressure Engine
 *
 * Purpose:
 * Measure whether buyers are increasingly
 * dominating the market.
 */

export function calculateBuyPressure(project = {}) {

    const buys =
        Number(project.buyTransactions24h || 0);

    const sells =
        Number(project.sellTransactions24h || 0);

    const buyVolume =
        Number(project.buyVolume24h || 0);

    const sellVolume =
        Number(project.sellVolume24h || 0);

    const buyRatio =
        buys + sells === 0
            ? 0
            : buys / (buys + sells);

    const volumeRatio =
        buyVolume + sellVolume === 0
            ? 0
            : buyVolume / (buyVolume + sellVolume);

    return {

        buys,
        sells,
        buyVolume,
        sellVolume,
        buyRatio,
        volumeRatio

    };

}

export function scoreBuyPressure(project={}){

    const pressure =
        calculateBuyPressure(project);

    let score = 0;

    if(pressure.buyRatio >= .55) score += 20;

    if(pressure.buyRatio >= .65) score += 20;

    if(pressure.volumeRatio >= .60) score += 20;

    if(pressure.volumeRatio >= .75) score += 20;

    if(project.smartWalletScore >= 60)
        score += 10;

    if(project.whaleActivityScore >= 60)
        score += 10;

    return Math.min(score,100);

}

export function analyzeBuyPressure(project={}){

    const buyPressure =
        calculateBuyPressure(project);

    const buyPressureScore =
        scoreBuyPressure(project);

    return{

        ...project,

        buyPressure,

        buyPressureScore,

        buyPressureLevel:

            buyPressureScore>=85
                ? "Extreme"

            : buyPressureScore>=65
                ? "Strong"

            : buyPressureScore>=45
                ? "Building"

            : "Weak",

        evidence:[

            ...(project.evidence||[]),

            {

                engine:"Buy Pressure Engine",

                signal:"Buyer Dominance",

                confidence:
                    Math.min(
                        buyPressureScore/100,
                        1
                    ),

                impact:
                    buyPressureScore>=60
                        ? "Positive"
                        : "Neutral"

            }

        ],

        alerts:[

            ...(project.alerts||[]),

            ...(buyPressureScore>=80
                ? ["Strong buyer dominance detected."]
                : [])

        ]

    };

}

export function analyzeBuyPressureBatch(projects=[]){

    return projects

        .map(analyzeBuyPressure)

        .sort((a,b)=>

            b.buyPressureScore-a.buyPressureScore

        );

}
