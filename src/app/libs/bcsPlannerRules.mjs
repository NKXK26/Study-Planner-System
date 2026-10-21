const BCS_MAJOR_PATTERNS = [
  ['Cybersecurity', /(?:\bcybersecurity\b|CSCS)/i],
  ['Internet of Things', /(?:\binternet of things\b|CSIOT)/i],
  ['Data Science', /(?:\bdata science\b|CSDS)/i],
  ['Artificial Intelligence', /(?:\bartificial intelligence\b|CSAI)/i],
  ['Software Development', /(?:\bsoftware development\b|CSSD)/i],
];

const IN_PROGRESS_STATUSES = new Set(['current', 'scheduled', 'future', 'in progress', 'ip']);
const NON_PASSING_GRADES = new Set(['N', 'SN', 'F', 'FAIL', 'NCOM', 'WF']);
const MONTH_ORDER = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12, WINTER: 6, SUMMER: 7 };
const INTAKE_MONTHS = ['FEB', 'MAR', 'SEP'];
const NON_CURRENT_STATUSES = new Set(['future']);

export const unitCode = value => String(value ?? '').trim().toUpperCase();

export function parseTranscriptTerm(value) {
  const match = String(value ?? '').trim().toUpperCase().match(/^(\d{4})_(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|WINTER|SUMMER)(?:_(S[12]|WT|ST|WINTER|SUMMER))?$/);
  if (!match) return null;
  const token = match[3] || '';
  const semester = /^S[12]$/.test(token) ? Number(token[1]) : null;
  const breakTerm = token === 'WT' || token === 'WINTER' || match[2] === 'WINTER' ? 'Winter' : token === 'ST' || token === 'SUMMER' || match[2] === 'SUMMER' ? 'Summer' : null;
  const isTeaching = (semester === 1 && ['FEB', 'MAR'].includes(match[2])) || (semester === 2 && ['AUG', 'SEP'].includes(match[2]));
  return { raw: match[0], year: Number(match[1]), monthName: match[2], month: MONTH_ORDER[match[2]], semester, breakTerm, isTeaching, isBreak: Boolean(breakTerm), order: Number(match[1]) * 1000 + MONTH_ORDER[match[2]] * 10 + (semester || (breakTerm === 'Winter' ? 3 : breakTerm === 'Summer' ? 8 : 0)) };
}

export function isPassingTranscriptAttempt(row) {
  const grade = String(row?.Grade ?? row?.grade ?? '').trim().toUpperCase();
  const status = String(row?.Status ?? row?.status ?? '').trim().toLowerCase();
  return Boolean(grade) && !NON_PASSING_GRADES.has(grade) && !IN_PROGRESS_STATUSES.has(status);
}

export function parseTranscriptRows(rows = []) {
  const attempts = rows.map((row, index) => {
    const code = unitCode(row?.Course ?? row?.course ?? row?.code);
    const term = parseTranscriptTerm(row?.Term ?? row?.term);
    return {
      row: index + 2, code, term,
      name: String(row?.['Course Title'] ?? row?.name ?? '').trim(),
      creditPoints: Number(row?.Credits ?? row?.Earned ?? row?.creditPoints) || 0,
      grade: String(row?.Grade ?? row?.grade ?? '').trim(),
      status: String(row?.Status ?? row?.status ?? '').trim(),
      passing: isPassingTranscriptAttempt(row),
    };
  }).filter(attempt => attempt.code);

  const completedByCode = new Map();
  for (const attempt of attempts.filter(attempt => attempt.passing)) {
    const previous = completedByCode.get(attempt.code);
    if (!previous || (attempt.term?.order ?? -1) >= (previous.term?.order ?? -1)) completedByCode.set(attempt.code, attempt);
  }
  const intakeCandidates = attempts.filter(attempt => attempt.term?.isTeaching).map(attempt => attempt.term);
  const intakeTerm = (intakeCandidates.length ? intakeCandidates : attempts.map(attempt => attempt.term).filter(Boolean)).sort((a, b) => a.order - b.order)[0] || null;
  return {
    completed: [...completedByCode.values()],
    attempts,
    intakeTerm,
    isSep2024OrLater: Boolean(intakeTerm && intakeTerm.order >= 2024_092),
  };
}

export function deriveTranscriptAcademicPeriod(attempts = []) {
  const teaching = attempts.filter(attempt => attempt.term?.isTeaching && !NON_CURRENT_STATUSES.has(String(attempt.status ?? '').trim().toLowerCase()));
  if (!teaching.length) return null;
  const first = [...teaching].sort((a, b) => a.term.order - b.term.order)[0].term;
  const latest = [...teaching].sort((a, b) => b.term.order - a.term.order)[0].term;
  const firstIndex = first.year * 2 + first.semester;
  const latestIndex = latest.year * 2 + latest.semester;
  const currentYear = Math.floor((latestIndex - firstIndex) / 2) + 1;
  const next = latest.semester === 1 ? { year: currentYear, semester: 2 } : { year: currentYear + 1, semester: 1 };
  return { intakeTerm: first, current: { year: currentYear, semester: latest.semester, term: latest }, next };
}

// Planner records do not yet have structured course, major, or intake fields.
// Recognise only explicit intake tokens that administrators already include in a
// planner/template name (for example "25-Sep-CSCS" or "2025_SEP").
export function getPlannerIntakeMetadata(planner) {
  const source = `${planner?.name ?? ''} ${planner?.plannerTemplate?.name ?? ''}`.toUpperCase();
  const patterns = [
    /\b(20\d{2})[-_\s]+(FEB|MAR|SEP)\b/,
    /\b(\d{2})[-_\s]+(FEB|MAR|SEP)\b/,
    /\b(FEB|MAR|SEP)[-_\s]+(20\d{2}|\d{2})\b/,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    const monthName = INTAKE_MONTHS.includes(match[2]) ? match[2] : match[1];
    const yearValue = INTAKE_MONTHS.includes(match[2]) ? match[1] : match[2];
    const year = yearValue.length === 2 ? 2000 + Number(yearValue) : Number(yearValue);
    return { known: true, year, monthName, month: MONTH_ORDER[monthName], order: year * 1000 + MONTH_ORDER[monthName] * 10, source: 'planner-name' };
  }
  return { known: false, source: null };
}

export function classifyPlannerIntake(studentIntake, planner) {
  const plannerIntake = getPlannerIntakeMetadata(planner);
  if (!studentIntake || !plannerIntake.known) {
    return { level: 'fallback', label: 'Low-confidence fallback — planner intake is not structured or explicitly labelled.', rank: 1, intakeDistance: Number.POSITIVE_INFINITY, plannerIntake };
  }
  if (studentIntake.year === plannerIntake.year && studentIntake.month === plannerIntake.month) {
    return { level: 'exact', label: 'Exact intake match', rank: 3, intakeDistance: 0, plannerIntake };
  }
  const studentNewRules = studentIntake.order >= 2024_092;
  const plannerNewRules = plannerIntake.order >= 2024_092;
  if (studentNewRules === plannerNewRules) {
    return { level: 'compatible', label: 'Compatible curriculum period', rank: 2, intakeDistance: Math.abs(studentIntake.order - plannerIntake.order), plannerIntake };
  }
  return { level: 'fallback', label: 'Low-confidence fallback — planner intake is from a different curriculum period.', rank: 1, intakeDistance: Math.abs(studentIntake.order - plannerIntake.order), plannerIntake };
}

const academicMappingForPlanner = (mappedExternalUnits, plannerId) => Object.values(mappedExternalUnits || {}).flat().filter(unit => {
  const category = String(unit?.categoryLabel ?? unit?.categoryKey ?? '').toLowerCase();
  return !unit?.isOtherMapping && Number(unit?.plannerId) === Number(plannerId) && /core|major|elective|wil/.test(category);
});

export function scorePlannerMatch(completedUnits, planner, studentIntake, { mappedExternalUnits = {} } = {}) {
  const completed = completedUnits instanceof Map ? completedUnits : new Map((completedUnits || []).map(unit => [unitCode(unit.code ?? unit.UnitCode), unit]));
  const plannerMap = new Map((planner?.units || []).map(unit => [unitCode(unit.UnitCode ?? unit.code), unit]).filter(([code]) => code));
  const matchingUnits = [];
  let totalMatchedCredits = 0;
  for (const [code, unit] of completed) {
    if (!plannerMap.has(code)) continue;
    matchingUnits.push({ code: unitCode(unit.code ?? unit.UnitCode), name: unit.name ?? unit.Name ?? '', creditPoints: Number(unit.creditPoints ?? unit.CreditPoints) || 0 });
    totalMatchedCredits += Number(unit.creditPoints ?? unit.CreditPoints) || 0;
  }
  const mapped = academicMappingForPlanner(mappedExternalUnits, planner?.id).filter(unit => !completed.has(unitCode(unit.code ?? unit.UnitCode)));
  mapped.forEach(unit => {
    const creditPoints = Number(unit.creditPoints ?? unit.CreditPoints) || 0;
    matchingUnits.push({ code: unitCode(unit.code ?? unit.UnitCode), name: unit.name ?? unit.Name ?? '', creditPoints, mapped: true });
    totalMatchedCredits += creditPoints;
  });
  const overlapCount = matchingUnits.length;
  const completedCount = completed.size + mapped.length;
  const plannerUnitCount = plannerMap.size;
  const totalCompletedCredits = [...completed.values(), ...mapped].reduce((sum, unit) => sum + (Number(unit.creditPoints ?? unit.CreditPoints) || 0), 0);
  const studentCoverage = completedCount ? overlapCount / completedCount : 0;
  const plannerCoverage = plannerUnitCount ? overlapCount / plannerUnitCount : 0;
  const creditCoverage = totalCompletedCredits ? totalMatchedCredits / totalCompletedCredits : studentCoverage;
  const academicScore = (studentCoverage * 55 + plannerCoverage * 35 + creditCoverage * 10) * 100;
  const intake = classifyPlannerIntake(studentIntake, planner);
  return {
    plannerId: planner.id, plannerName: planner.name, createdAt: planner.createdAt,
    overlapCount, completedCount, plannerUnitCount, matchingUnits, totalMatchedCredits,
    matchStudentPct: studentCoverage * 100, matchPlannerPct: plannerCoverage * 100,
    creditCoveragePct: creditCoverage * 100, academicScore, intakeMatch: intake.level,
    intakeMatchLabel: intake.label, plannerIntake: intake.plannerIntake,
    compatibilityRank: intake.rank, intakeDistance: intake.intakeDistance,
    courseMajorMatch: 'unavailable',
  };
}

export function rankTopPlannerMatches(completedUnits, planners, studentIntake, limit = 5, options = {}) {
  const sort = (a, b) => b.compatibilityRank - a.compatibilityRank || a.intakeDistance - b.intakeDistance || b.academicScore - a.academicScore || b.overlapCount - a.overlapCount || a.plannerName.localeCompare(b.plannerName) || a.plannerId - b.plannerId;
  const scored = (planners || []).map(planner => scorePlannerMatch(completedUnits, planner, studentIntake, options));
  const compatible = scored.filter(result => result.compatibilityRank >= 2 && result.overlapCount > 0).sort(sort);
  const fallbackWithOverlap = scored.filter(result => result.compatibilityRank < 2 && result.overlapCount > 0).sort(sort);
  const zeroOverlapFallback = scored.filter(result => result.overlapCount === 0).sort(sort);
  return [...compatible, ...fallbackWithOverlap, ...(compatible.length < limit ? zeroOverlapFallback : [])].slice(0, limit);
}

export function getBcsMajor(planner) {
  const source = `${planner?.name ?? ''} ${planner?.plannerTemplate?.name ?? ''}`;
  return BCS_MAJOR_PATTERNS.find(([, pattern]) => pattern.test(source))?.[0] || null;
}

export function detectCompletedBcsDoubleMajors({ primaryPlanner, planners = [], completedUnits = [], studentIntake, primaryEligible = false, normalizeCode = unitCode } = {}) {
  const primaryMajor = getBcsMajor(primaryPlanner);
  const result = (status, extra = {}) => ({ status, primaryMajor, candidates: [], ...extra });
  if (!primaryMajor) return result('not-applicable');
  if (!primaryEligible) return result('not-assessed');

  const normalized = value => unitCode(normalizeCode(value));
  const majorCodes = planner => [...new Set((planner?.units || [])
    .filter(unit => /major/i.test(String(unit?.unitType?.Name ?? unit?.unitTypeName ?? '')))
    .map(unit => normalized(unit.UnitCode ?? unit.code))
    .filter(Boolean))];
  const hasUnambiguousMajorRequirement = planner => {
    const requirements = (planner?.plannerTemplate?.requirements || []).filter(req =>
      /major/i.test(String(req?.unitType?.Name ?? req?.unitTypeName ?? '')));
    return requirements.length === 0 || (requirements.length === 1 && Number(requirements[0].requiredCount ?? requirements[0].requiredUnits) === 8);
  };

  const primaryCodes = majorCodes(primaryPlanner);
  if (primaryCodes.length !== 8 || !hasUnambiguousMajorRequirement(primaryPlanner)) return result('not-assessed');
  const passed = new Set(completedUnits.map(unit => normalized(unit.code ?? unit.UnitCode)).filter(Boolean));
  if (!primaryCodes.every(code => passed.has(code))) return result('not-assessed');

  const qualifying = new Map();
  for (const planner of planners) {
    const secondMajor = getBcsMajor(planner);
    if (!secondMajor || secondMajor === primaryMajor || Number(planner.id) === Number(primaryPlanner?.id)) continue;
    if (classifyPlannerIntake(studentIntake, planner).rank < 2) continue;
    if (!hasUnambiguousMajorRequirement(planner)) continue;
    const candidateCodes = majorCodes(planner);
    if (candidateCodes.length !== 8) continue;
    const sharedUnits = candidateCodes.filter(code => primaryCodes.includes(code));
    const uniqueUnits = candidateCodes.filter(code => !primaryCodes.includes(code));
    if (sharedUnits.length !== 4 || uniqueUnits.length !== 4 || !uniqueUnits.every(code => passed.has(code))) continue;
    if (!qualifying.has(secondMajor)) qualifying.set(secondMajor, {
      secondMajor,
      plannerId: planner.id,
      plannerName: planner.name,
      sharedUnits,
      uniqueUnits,
    });
  }
  const candidates = [...qualifying.values()];
  return candidates.length === 1 ? result('double', { candidates })
    : candidates.length > 1 ? result('review', { candidates })
      : result('single');
}

export function isBcsPlanner(planner) { return Boolean(getBcsMajor(planner)); }

// The planner template is the only currently-linked planner metadata record.
// Use it only when it explicitly stores one BCS programme and one major; do not
// turn a shorthand planner title such as "25-Sep-CSCS" into an official label.
export function getConfirmedPlannerMajorMetadata(planner) {
  const templateName = String(planner?.plannerTemplate?.name ?? '').trim();
  const match = templateName.match(/^(Bachelor of Computer Science)\s*[–-]\s*([^/]+?)\s*$/i);
  if (!match) return null;
  return {
    courseName: match[1].trim(),
    majorName: match[2].trim(),
    source: 'planner-template',
  };
}

// Keep completion wording tied to the same requirement result that drives the
// schedule. A linked template with an explicit programme/major title is the
// only safe source for the congratulatory major name in the current schema.
export function getPlannerCompletionResult({ planner, bcsPlan, genericPlan } = {}) {
  const categoryNeeds = bcsPlan?.categoryNeeds ?? genericPlan?.categoryNeeds ?? {};
  const requirementsMet = genericPlan?.completionEligible ?? (Object.keys(categoryNeeds).length > 0 && Object.values(categoryNeeds).every(value => Number(value) === 0));
  const eligible = bcsPlan ? bcsPlan.eligible : requirementsMet;
  if (!eligible) return { eligible: false, majorName: null, warning: null };

  const major = bcsPlan?.confirmedMajor ?? getConfirmedPlannerMajorMetadata(planner);
  if (major?.majorName) {
    return { eligible: true, majorName: major.majorName, courseName: major.courseName, warning: null };
  }
  return {
    eligible: true,
    majorName: null,
    warning: 'All selected-planner requirements are met, but the linked planner metadata does not identify one major clearly enough to confirm it. Review the planner metadata and approved mappings.',
  };
}

export const BCS_WIL_UNIT_CODES = new Set(['ICT20016', 'ICT20026']);

export function isBcsCanonicalWilUnit(unit) {
  return BCS_WIL_UNIT_CODES.has(unitCode(unit?.UnitCode ?? unit?.code));
}

export function isWilRequirementsDescription(value) {
  const text = String(value ?? '').trim().toLowerCase();
  const hasWilLanguage = /\bwil\b|work[-\s]?integrated learning|internship|\bplacement\b/.test(text);
  return hasWilLanguage && (/at least\s+12\s+units/.test(text) || /equivalent to\s+2\s+elective/.test(text) || /year\s+three/.test(text));
}

export function getBcsWilDisplayName(unit) {
  const code = unitCode(unit?.UnitCode ?? unit?.code);
  const name = String(unit?.Name ?? unit?.name ?? '').trim();
  return code === 'ICT20016' && (!name || isWilRequirementsDescription(name))
    ? 'Work Integrated Learning Internship (WIL)'
    : name;
}

export function isWilUnit(unit, { bcsPlanner = false } = {}) {
  if (bcsPlanner && isBcsCanonicalWilUnit(unit)) return true;
  const type = String(unit?.unitType?.Name ?? unit?.unitTypeName ?? '').toLowerCase();
  const text = `${unit?.UnitCode ?? unit?.code ?? ''} ${unit?.Name ?? unit?.name ?? ''}`.toLowerCase();
  return /\bwil\b|work[-\s]?integrated learning|work integrated learning|internship|\bplacement\b/.test(type) || /\bwil\b|work[-\s]?integrated learning|work integrated learning|internship|\bplacement\b/.test(text);
}

const category = unit => String(unit?.unitType?.Name ?? unit?.unitTypeName ?? '').toLowerCase();
const isCore = unit => category(unit) === 'core';
const isMajor = unit => category(unit).includes('major');
const isElective = (unit, options = {}) => category(unit).includes('elective') && !isWilUnit(unit, options);
const isPrescribed = unit => /\*\s*$/.test(String(unit?.Name ?? unit?.name ?? ''));
const unique = units => [...new Map(units.map(unit => [unitCode(unit.UnitCode ?? unit.code), unit])).values()];

function missing(units, completedCodes, required, requirementKey, mappedCompleted = 0) {
  const completed = units.filter(unit => completedCodes.has(unitCode(unit.UnitCode ?? unit.code)));
  return {
    completed: Math.min(completed.length + mappedCompleted, required),
    units: units.filter(unit => !completedCodes.has(unitCode(unit.UnitCode ?? unit.code))).slice(0, Math.max(0, required - completed.length - mappedCompleted)).map(unit => ({ ...unit, scheduleCategoryKey: requirementKey })),
  };
}

export function buildBcsPlan(planner, completedUnits, intakeTerm, mappedExternalUnits = {}) {
  const major = getBcsMajor(planner);
  if (!major) return null;
  const plannerUnits = unique((planner?.units || []).filter(unit => unitCode(unit.UnitCode ?? unit.code)));
  const completedCodes = new Set((completedUnits || []).map(unit => unitCode(unit.code ?? unit.UnitCode)));
  const core = plannerUnits.filter(isCore);
  const majors = plannerUnits.filter(isMajor);
  const hasKnownIntake = Boolean(intakeTerm);
  const isNew = Boolean(intakeTerm && intakeTerm.order >= 2024_092);
  const wil = plannerUnits.filter(unit => isNew
    ? unitCode(unit.UnitCode ?? unit.code) === 'ICT20016'
    : isWilUnit(unit, { bcsPlanner: true }));
  const electives = plannerUnits.filter(unit => isElective(unit, { bcsPlanner: true }));
  const prescribed = electives.filter(isPrescribed);
  const recommended = electives.filter(unit => !isPrescribed(unit));
  const mappedCounts = { core: 0, major: 0, elective: 0, wil: 0 };
  Object.values(mappedExternalUnits || {}).flat().forEach(unit => {
    if (unit?.isOtherMapping) return;
    const categoryName = String(unit?.categoryLabel ?? '').toLowerCase();
    if (categoryName === 'core') mappedCounts.core++;
    else if (categoryName.includes('major')) mappedCounts.major++;
    else if (categoryName.includes('wil')) mappedCounts.wil++;
    else if (categoryName.includes('elective')) mappedCounts.elective++;
  });
  const metadataIssues = [];
  if (!hasKnownIntake) metadataIssues.push('No usable transcript Term was found, so the applicable BCS intake rules cannot be confirmed.');
  if (core.length < 8) metadataIssues.push('Selected BCS planner has fewer than 8 Core units.');
  if (majors.length < 8) metadataIssues.push('Selected BCS planner has fewer than 8 Major units.');
  if (isNew && prescribed.length !== 2) metadataIssues.push('Selected BCS planner must identify exactly two prescribed electives with the existing * marker.');
  if (isNew && recommended.length < 4) metadataIssues.push('Selected BCS planner has fewer than four recommended elective units.');
  if (isNew && wil.length !== 1) metadataIssues.push('Selected BCS planner must identify exactly one WIL placement.');

  const coreNeed = missing(core, completedCodes, 8, 'bcs-core', mappedCounts.core);
  const majorNeed = missing(majors, completedCodes, 8, 'bcs-major', mappedCounts.major);
  const wilNeed = missing(wil, completedCodes, 1, 'bcs-wil', mappedCounts.wil);
  const passedWil = mappedCounts.wil > 0 || wil.some(unit => completedCodes.has(unitCode(unit.UnitCode ?? unit.code))) || (!isNew && (completedUnits || []).some(isBcsCanonicalWilUnit));
  const electiveTarget = isNew ? 6 : (passedWil ? 6 : 8);
  const prescribedNeed = isNew ? missing(prescribed, completedCodes, 2, 'bcs-prescribed') : { completed: 0, units: [] };
  const recommendedNeed = isNew
    ? missing(recommended, completedCodes, 4, 'bcs-recommended', mappedCounts.elective)
    : missing(electives, completedCodes, electiveTarget, 'bcs-elective', mappedCounts.elective);
  const electiveCompleted = isNew ? prescribedNeed.completed + recommendedNeed.completed : recommendedNeed.completed;
  const needs = {
    'bcs-core': Math.max(0, 8 - coreNeed.completed),
    'bcs-major': Math.max(0, 8 - majorNeed.completed),
    ...(isNew ? { 'bcs-prescribed': Math.max(0, 2 - prescribedNeed.completed), 'bcs-recommended': Math.max(0, 4 - recommendedNeed.completed), 'bcs-wil': Math.max(0, 1 - wilNeed.completed) } : { 'bcs-elective': Math.max(0, electiveTarget - electiveCompleted) }),
  };
  const eligible = metadataIssues.length === 0 && Object.values(needs).every(value => value === 0);
  return {
    major, isNew, hasKnownIntake, intakeTerm, metadataIssues, electiveTarget, passedWil,
    confirmedMajor: getConfirmedPlannerMajorMetadata(planner),
    counts: { core: coreNeed.completed, major: majorNeed.completed, elective: electiveCompleted, prescribed: prescribedNeed.completed, recommended: recommendedNeed.completed, wil: wilNeed.completed },
    categoryNeeds: needs,
    units: [...coreNeed.units, ...majorNeed.units, ...prescribedNeed.units, ...recommendedNeed.units, ...(isNew ? wilNeed.units : [])],
    eligible,
  };
}
