// src/engines/upcomingLaunchDiscoveryEngine.js

function num(value = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value = 0, min = 0, max = 100) {
  return Math.max(min, Math.min(max, num(value)));
}

export function daysUntil(dateValue) {
  if (!dateValue) return null;

  const target = new Date(dateValue).getTime();
  if (!Number.isFinite(target)) return null;

  return Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24));
}

function getUpcomingEvents(project = {}) {
  return [
    { type: "TGE", date: project.tgeDate, weight: 100 },
    { type: "Launch", date: project.launchDate, weight: 90 },
    { type: "Presale", date: project.presaleDate, weight: 75 },
    { type: "Mainnet", date: project.mainnetDate, weight: 95 },
    { type: "Exchange Listing", date: project.listingDate, weight: 90 },
    { type: "Airdrop", date: project.airdropDate, weight: 75 },
    { type: "Claim", date: project.claimDate, weight: 70 },
    { type: "Product Release", date: project.productLaunchDate, weight: 65 },
  ]
    .map((event) => {
      const days = daysUntil(event.date);

      if (days === null) return null;

      return {
        ...event,
        daysUntil: days,
        urgency:
          days < 0
            ? "past/recent"
            : days <= 3
            ? "immediate"
            : days <= 7
            ? "very high"
            : days <= 14
            ? "high"
            : days <= 30
            ? "medium"
            : "low",
      };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(a.daysUntil) - Math.abs(b.daysUntil));
}

function timeMultiplier(days) {
  if (days === null) return 0;
  if (days < -30) return 0.1;
  if (days < 0) return 0.25;
  if (days <= 3) return 1;
  if (days <= 7) return 0.9;
  if (days <= 14) return 0.75;
  if (days <= 30) return 0.6;
  if (days <= 60) return 0.4;
  return 0.2;
}

export function classifyUpcomingEvent(project = {}) {
  const events = getUpcomingEvents(project);
  return events[0]?.type || "Unknown Upcoming Event";
}

export function scoreUpcomingLaunch(project = {}) {
  const events = getUpcomingEvents(project);

  if (!events.length) return 0;

  const primary = events[0];

  let score = primary.weight * timeMultiplier(primary.daysUntil);

  if (events.length >= 2) score += 8;
  if (events.length >= 3) score += 12;
  if (project.exchange || project.listingExchange) score += 8;
  if (project.pointsProgram || project.airdropDate || project.claimDate) score += 6;
  if (project.mainnetDate && project.tgeDate) score += 8;

  return clamp(Math.round(score));
}

function levelForScore(score = 0) {
  if (score >= 90) return "immediate major launch";
  if (score >= 75) return "strong near-term launch";
  if (score >= 60) return "developing launch window";
  if (score >= 40) return "early upcoming launch";
  return "limited launch visibility";
}

function buildReasons(events = [], project = {}) {
  const reasons = [];

  if (events[0]) {
    reasons.push(`${events[0].type} event is ${events[0].daysUntil} day(s) away.`);
  }

  if (events.length >= 2) reasons.push("Multiple upcoming launch-related events detected.");
  if (project.exchange || project.listingExchange) reasons.push("Exchange venue is associated with the event.");
  if (project.pointsProgram) reasons.push("Points program may convert into token launch interest.");
  if (project.mainnetDate && project.tgeDate) reasons.push("Mainnet and TGE timing are both visible.");

  if (!reasons.length) reasons.push("No clear upcoming launch event detected.");

  return reasons;
}

export function analyzeUpcomingLaunch(project = {}) {
  const events = getUpcomingEvents(project);
  const score = scoreUpcomingLaunch(project);
  const level = levelForScore(score);
  const reasons = buildReasons(events, project);

  return {
    ...project,

    stage: project.stage || (score >= 40 ? "upcoming-launch" : project.stage),
    upcomingEvents: events,
    upcomingEventType: events[0]?.type || "Unknown Upcoming Event",
    daysUntilEvent: events[0]?.daysUntil ?? null,
    upcomingLaunchScore: score,
    upcomingLaunchLevel: level,
    upcomingLaunchReasons: reasons,

    intelligenceSignals: {
      ...(project.intelligenceSignals || {}),
      upcomingLaunch: {
        score,
        level,
        events,
        reasons,
      },
    },

    evidence: [
      ...(project.evidence || []),
      {
        engine: "Upcoming Launch Discovery Engine",
        signal: "Upcoming crypto launch or catalyst event",
        score,
        confidence: clamp(score / 100, 0, 1),
        impact: score >= 75 ? "Strong Positive" : score >= 40 ? "Positive" : "Neutral",
        reasons,
      },
    ],

    alerts: [
      ...(project.alerts || []),
      ...(score >= 90
        ? ["Immediate major launch event detected."]
        : score >= 75
        ? ["Strong near-term launch window detected."]
        : []),
    ],

    discoveryReason:
      score >= 40
        ? "Upcoming crypto launch or catalyst event detected."
        : project.discoveryReason,
  };
}

export function analyzeUpcomingLaunchBatch(projects = []) {
  return projects
    .map(analyzeUpcomingLaunch)
    .sort((a, b) => Number(b.upcomingLaunchScore || 0) - Number(a.upcomingLaunchScore || 0));
}

export function discoverUpcomingLaunches(projects = []) {
  return analyzeUpcomingLaunchBatch(projects).filter(
    (project) => Number(project.upcomingLaunchScore || 0) >= 40
  );
}
