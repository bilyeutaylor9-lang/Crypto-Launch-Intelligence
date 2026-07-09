import { writeRoadmapReport } from "./reports/roadmapReportEngine.js";

const { filePath, report } = writeRoadmapReport();

console.log(`Roadmap report written: ${filePath}`);
console.log(`Vision: ${report.vision}`);
console.log(`Current phase: Month ${report.currentPhase.month} - ${report.currentPhase.title}`);
