// src/engines/testnetDiscoveryEngine.js

/**
 * Crypto Launch Intelligence
 * Testnet Discovery Engine
 *
 * Purpose:
 * Discover projects currently running
 * testnets before token launch.
 */

const TESTNET_KEYWORDS = [
    "testnet",
    "devnet",
    "public testnet",
    "closed beta",
    "beta",
    "incentivized testnet",
    "validator testnet",
    "early access",
    "alpha test"
];

export function detectTestnet(project = {}) {

    const text = [
        project.description,
        project.website,
        project.docs,
        project.twitterBio,
        project.announcement
    ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

    const keyword = TESTNET_KEYWORDS.find(word =>
        text.includes(word)
    );

    return keyword || null;
}

export function scoreTestnet(project = {}) {

    let score = 0;

    if (detectTestnet(project)) score += 40;

    if (project.github) score += 15;

    if (project.docs) score += 15;

    if (project.discord) score += 10;

    if (project.twitter) score += 10;

    if (project.validators) score += 10;

    return Math.min(score,100);
}

export function discoverTestnets(projects = []) {

    return projects
        .map(project => ({

            ...project,

            stage: "testnet",

            testnetScore: scoreTestnet(project),

            discoveryReason:
                "Active blockchain testnet detected."

        }))
        .filter(project => project.testnetScore >= 35)
        .sort((a,b)=>b.testnetScore-a.testnetScore);

}
