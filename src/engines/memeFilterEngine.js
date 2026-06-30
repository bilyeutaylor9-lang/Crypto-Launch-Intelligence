// src/engines/memeFilterEngine.js

const MEME_WORDS = [
  "doge", "shib", "inu", "pepe", "frog", "cat", "dog", "bull",
  "bonk", "wif", "testi", "elon", "trump", "pump", "moon",
  "meme", "wojak", "chad", "bro", "boss", "baby", "based"
];

function text(project = {}) {
  return [
    project.name,
    project.symbol,
    project.description
  ].filter(Boolean).join(" ").toLowerCase();
}

export function isLikelyMeme(project = {}) {
  const combined = text(project);
  return MEME_WORDS.some(word => combined.includes(word));
}

export function filterMemes(projects = []) {
  const accepted = [];
  const rejected = [];

  for (const project of projects) {
    const meme = isLikelyMeme(project);

    if (meme) {
      rejected.push({
        ...project,
        memeFilterRejected: true,
        memeFilterReason: "Likely meme token"
      });
    } else {
      accepted.push({
        ...project,
        memeFilterRejected: false
      });
    }
  }

  return {
    accepted,
    rejected,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length
  };
}
