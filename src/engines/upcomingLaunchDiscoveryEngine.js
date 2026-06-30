// src/engines/upcomingLaunchDiscoveryEngine.js

/**
 * Upcoming Launch Discovery Engine
 *
 * Purpose:
 * Identifies crypto projects with upcoming TGEs, launches,
 * presales, mainnets, or exchange events.
 */

export function daysUntil(dateValue) {
  if (!dateValue) return null;

  const target = new Date(dateValue);
  const now = new Date();

  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

export function classifyUpcomingEvent(project = {}) {
  if (project.tgeDate) return "TGE";
  if (project.launchDate) return "Launch";
  if (project.presaleDate) return "Presale";
  if (project.mainnetDate) return "Mainnet";
  if (project.listingDate) return "Exchange Listing";
  return "Unknown Upcoming Event";
}

export function scoreUpcomingLaunch(project = {}) {
  const date =
    project.tgeDate ||
    project.launchDate ||
    project.presaleDate ||
    project.mainnetDate ||
    project.listingDate;

  const days = daysUntil(date);

  if (days === null) return 0;
  if (days < 0) return 10;
  if (days <= 3) return 100;
  if (days <= 7) return 90;
  if (days <= 14) return 75;
  if (days <= 30) return 60;
  if (days <= 60) return 40;

  return 20;
}

export function discoverUpcomingLaunches(projects = []) {
  return projects
    .map(project => ({
      ...project,
      stage: "upcoming-launch",
      upcomingEventType: classifyUpcomingEvent(project),
      daysUntilEvent: daysUntil(
        project.tgeDate ||
        project.launchDate ||
        project.presaleDate ||
        project.mainnetDate ||
        project.listingDate
      ),
      upcomingLaunchScore: scoreUpcomingLaunch(project),
      discoveryReason: "Upcoming crypto launch or catalyst event detected."
    }))
    .filter(project => project.upcomingLaunchScore >= 40)
    .sort((a, b) => b.upcomingLaunchScore - a.upcomingLaunchScore);
}
