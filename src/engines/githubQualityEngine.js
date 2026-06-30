// src/engines/githubQualityEngine.js

/**
 * Crypto Launch Intelligence
 * GitHub Quality Engine
 *
 * Purpose:
 * Evaluate the quality of a project's GitHub repository,
 * not just whether one exists.
 */

export function scoreGithubQuality(project = {}) {

    let score = 0;

    const stars = Number(project.githubStars || 0);
    const forks = Number(project.githubForks || 0);
    const contributors = Number(project.contributors || 0);
    const commits30d = Number(project.commits30d || 0);

    if (project.github) score += 15;

    if (stars >= 25) score += 10;
    if (stars >= 100) score += 10;
    if (stars >= 500) score += 10;

    if (forks >= 10) score += 5;
    if (forks >= 50) score += 5;

    if (contributors >= 3) score += 10;
    if (contributors >= 10) score += 10;

    if (commits30d >= 10) score += 10;
    if (commits30d >= 40) score += 10;

    if (project.documentation) score += 5;
    if (project.apiDocs) score += 5;
    if (project.sdk) score += 5;

    return Math.min(score,100);
}

export function classifyGithub(score){

    if(score>=85) return "excellent";

    if(score>=70) return "strong";

    if(score>=50) return "good";

    if(score>=30) return "basic";

    return "weak";

}

export function analyzeGithub(project={}){

    const githubQualityScore = scoreGithubQuality(project);

    return {

        ...project,

        githubQualityScore,

        githubQuality:

            classifyGithub(githubQualityScore),

        githubReason:

            githubQualityScore>=70

            ? "Repository appears active and professionally maintained."

            : "Repository quality is currently limited."

    };

}

export function analyzeGithubBatch(projects=[]){

    return projects

        .map(analyzeGithub)

        .sort((a,b)=>

            b.githubQualityScore-a.githubQualityScore

        );

}
