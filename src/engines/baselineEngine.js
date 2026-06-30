// src/engines/baselineEngine.js

/**
 * Crypto Launch Intelligence
 * Baseline Engine
 *
 * Purpose:
 * Build a historical baseline for every project.
 * Future engines compare current activity against
 * this baseline to detect abnormal behavior.
 */

export function createBaseline(project = {}) {

    return {

        volume24h:
            Number(project.averageVolume24h || 0),

        liquidity:
            Number(project.averageLiquidity || 0),

        holders:
            Number(project.averageHolders || 0),

        transactions:
            Number(project.averageTransactions || 0),

        followers:
            Number(project.averageFollowers || 0),

        githubCommits:
            Number(project.averageGithubCommits || 0),

        developerActivity:
            Number(project.averageDeveloperActivity || 0),

        smartWalletActivity:
            Number(project.averageSmartWalletActivity || 0)

    };

}

export function calculateDeviation(current, baseline){

    if(!baseline || baseline===0){

        return 0;

    }

    return ((current-baseline)/baseline)*100;

}

export function analyzeBaseline(project={}){

    const baseline=createBaseline(project);

    return{

        ...project,

        baseline,

        baselineDeviation:{

            volume:

                calculateDeviation(

                    Number(project.volume24h||0),

                    baseline.volume24h

                ),

            liquidity:

                calculateDeviation(

                    Number(project.liquidityUsd||0),

                    baseline.liquidity

                ),

            holders:

                calculateDeviation(

                    Number(project.holders||0),

                    baseline.holders

                ),

            followers:

                calculateDeviation(

                    Number(project.followers||0),

                    baseline.followers

                )

        }

    };

}

export function analyzeBaselineBatch(projects=[]){

    return projects.map(analyzeBaseline);

}
