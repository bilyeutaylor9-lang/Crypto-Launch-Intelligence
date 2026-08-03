function stamp(row = {}) {
  const parsed = new Date(row.scannedAt || row.decisionAt || row.timestamp || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function identity(row = {}) {
  return row.identityKey || null;
}

function utcDay(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function addDays(value, days) {
  return value + days * 86400000;
}

function uniqueDays(rows) {
  return [...new Set(rows.map((row) => stamp(row)).filter(Boolean).map(utcDay))].sort();
}

function rowsInWindow(rows, start, end) {
  return rows.filter((row) => stamp(row) >= start && stamp(row) < end);
}

function ids(rows) {
  return new Set(rows.map(identity).filter(Boolean));
}

function excludeIds(rows, excluded) {
  return rows.filter((row) => !excluded.has(identity(row)));
}

export function chronologicalSplit(rows = [], options = {}) {
  const trainPct = Number(options.trainPct ?? 0.6);
  const validationPct = Number(options.validationPct ?? 0.2);
  const embargoHours = Number(options.embargoHours ?? 168);
  const sorted = [...rows].filter((row) => stamp(row) > 0 && identity(row)).sort((a, b) => stamp(a) - stamp(b));
  if (!sorted.length) {
    return { status: "NO_TIMESTAMPED_ROWS", train: [], validation: [], test: [], boundaries: null };
  }

  const historyStart = stamp(sorted[0]);
  const historyEnd = stamp(sorted.at(-1));
  const historySpan = Math.max(1, historyEnd - historyStart);
  const trainEnd = historyStart + historySpan * trainPct;
  const validationEnd = historyStart + historySpan * (trainPct + validationPct);
  const embargoMs = embargoHours * 3600000;

  let train = sorted.filter((row) => stamp(row) < trainEnd);
  let validation = sorted.filter((row) => stamp(row) > trainEnd + embargoMs && stamp(row) <= validationEnd);
  let test = sorted.filter((row) => stamp(row) > validationEnd + embargoMs);

  const validationIds = ids(validation);
  train = excludeIds(train, validationIds);
  const testIds = ids(test);
  train = excludeIds(train, testIds);
  validation = excludeIds(validation, testIds);

  return {
    status: train.length && validation.length && test.length ? "READY" : "INSUFFICIENT_AFTER_EMBARGO",
    train,
    validation,
    test,
    boundaries: {
      trainEnd: new Date(trainEnd).toISOString(),
      validationEnd: new Date(validationEnd).toISOString(),
      embargoHours,
      boundaryBasis: "ELAPSED_CALENDAR_TIME",
    },
  };
}

export function buildExpandingWindowFolds(rows = [], options = {}) {
  const purgeDays = Number(options.purgeDays ?? 7);
  const embargoDays = Number(options.embargoDays ?? 7);
  const validationDays = Math.max(1, Number(options.validationDays ?? 1));
  const minimumTrainDays = Math.max(1, Number(options.minimumTrainDays ?? 3));
  const boundaryGapDays = Math.max(purgeDays, embargoDays);
  const testFraction = Math.max(0.1, Math.min(0.4, Number(options.testFraction ?? 0.2)));
  const sorted = [...rows].filter((row) => stamp(row) > 0 && identity(row)).sort((a, b) => stamp(a) - stamp(b));
  const days = uniqueDays(sorted);
  if (days.length < minimumTrainDays + boundaryGapDays + validationDays + 1) {
    return {
      folds: [],
      finalTrain: [],
      finalTest: [],
      boundaries: null,
      audit: {
        status: "INSUFFICIENT_CALENDAR_HISTORY",
        uniqueDays: days.length,
        purgeDays,
        embargoDays,
        identityOverlapCount: 0,
      },
    };
  }

  const testDayCount = Math.max(1, Math.ceil(days.length * testFraction));
  const testStartDayIndex = Math.max(minimumTrainDays + boundaryGapDays, days.length - testDayCount);
  const testStart = Date.parse(`${days[testStartDayIndex]}T00:00:00.000Z`);
  const validationDaysAvailable = days.slice(0, testStartDayIndex);
  const folds = [];
  const heldOutValidationIds = new Set();

  for (
    let index = minimumTrainDays + boundaryGapDays;
    index < validationDaysAvailable.length;
    index += validationDays + embargoDays
  ) {
    const validationStart = Date.parse(`${validationDaysAvailable[index]}T00:00:00.000Z`);
    const validationEnd = addDays(validationStart, validationDays);
    const trainCutoff = addDays(validationStart, -boundaryGapDays);
    let validation = rowsInWindow(sorted, validationStart, validationEnd);
    validation = validation.filter((row) => !heldOutValidationIds.has(identity(row)));
    const validationIds = ids(validation);
    let train = sorted.filter((row) => stamp(row) < trainCutoff);
    train = excludeIds(train, validationIds);
    train = excludeIds(train, heldOutValidationIds);
    if (!train.length || !validation.length) continue;
    validationIds.forEach((projectId) => heldOutValidationIds.add(projectId));
    folds.push({
      index: folds.length,
      train,
      validation,
      boundaries: {
        trainStart: new Date(stamp(train[0])).toISOString(),
        trainEndExclusive: new Date(trainCutoff).toISOString(),
        validationStart: new Date(validationStart).toISOString(),
        validationEndExclusive: new Date(validationEnd).toISOString(),
        purgeDays,
        embargoDays,
      },
    });
  }

  const pretest = sorted.filter((row) => stamp(row) < testStart);
  let finalTest = sorted.filter((row) => stamp(row) >= testStart);
  finalTest = finalTest.filter((row) => !heldOutValidationIds.has(identity(row)));
  const pretestIds = ids(pretest);
  finalTest = finalTest.filter((row) => !pretestIds.has(identity(row)));
  const finalTestIds = ids(finalTest);
  const finalTrainCutoff = addDays(testStart, -boundaryGapDays);
  let finalTrain = sorted.filter((row) => stamp(row) < finalTrainCutoff);
  finalTrain = excludeIds(finalTrain, heldOutValidationIds);
  finalTrain = excludeIds(finalTrain, finalTestIds);

  const foldIdSets = folds.map((fold) => ids(fold.validation));
  foldIdSets.push(finalTestIds);
  let identityOverlapCount = 0;
  for (let left = 0; left < foldIdSets.length; left += 1) {
    for (let right = left + 1; right < foldIdSets.length; right += 1) {
      for (const projectId of foldIdSets[left]) {
        if (foldIdSets[right].has(projectId)) identityOverlapCount += 1;
      }
    }
  }

  const temporalViolations = folds.filter((fold) => {
    const latestTrain = Math.max(...fold.train.map(stamp));
    const earliestValidation = Math.min(...fold.validation.map(stamp));
    return earliestValidation - latestTrain < boundaryGapDays * 86400000;
  }).length;

  return {
    folds,
    finalTrain,
    finalTest,
    boundaries: {
      historyStart: new Date(stamp(sorted[0])).toISOString(),
      historyEnd: new Date(stamp(sorted.at(-1))).toISOString(),
      finalTrainEndExclusive: new Date(finalTrainCutoff).toISOString(),
      finalTestStart: new Date(testStart).toISOString(),
      purgeDays,
      embargoDays,
      validationDays,
    },
    audit: {
      status: identityOverlapCount === 0 && temporalViolations === 0 ? "PASS" : "FAIL",
      uniqueDays: days.length,
      validationFoldCount: folds.length,
      heldOutValidationIdentityCount: heldOutValidationIds.size,
      finalTestIdentityCount: finalTestIds.size,
      identityOverlapCount,
      temporalPurgeViolationCount: temporalViolations,
      purgeDays,
      embargoDays,
      rules: [
        "Training windows expand chronologically.",
        "A seven-day gap removes training labels whose outcome horizon could overlap evaluation.",
        "An identity held out in validation never enters a later training or evaluation fold.",
        "Final test identities never appear in pre-test history.",
      ],
    },
  };
}

export { identity, stamp };
