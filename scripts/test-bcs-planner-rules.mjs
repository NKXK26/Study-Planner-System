import assert from 'node:assert/strict';
import { buildBcsPlan, getPlannerCompletionResult, parseTranscriptRows, scorePlannerMatch, rankTopPlannerMatches, deriveTranscriptAcademicPeriod, detectCompletedBcsDoubleMajors } from '../src/app/libs/bcsPlannerRules.mjs';
import { getWilQualifyingCompletedUnitCodes, scheduleRemainingUnits, scheduleWilBreakPlacement } from '../src/app/view/unit_suggestion/plannerHelpers.js';

const unit = (code, name, type) => ({ UnitCode: code, Name: name, CreditPoints: 12.5, unitType: { ID: type === 'Core' ? 2 : type === 'Major' ? 3 : type === 'WIL Placement' ? 17 : 1, Name: type }, offeredTerms: ['Semester 1', 'Semester 2'] });
const planner = {
  name: '25-Sep-CSCS',
  units: [
    ...Array.from({ length: 8 }, (_, i) => unit(`COR${String(i).padStart(5, '0')}`, `Core ${i}`, 'Core')),
    ...Array.from({ length: 8 }, (_, i) => unit(`MAJ${String(i).padStart(5, '0')}`, `Major ${i}`, 'Major')),
    unit('PRE00001', 'Prescribed 1*', 'Elective'), unit('PRE00002', 'Prescribed 2*', 'Elective'),
    ...Array.from({ length: 4 }, (_, i) => unit(`REC${String(i).padStart(5, '0')}`, `Recommended ${i}`, 'Elective')),
    unit('ICT20016', 'Work Integrated Learning Placement', 'WIL Placement'),
  ],
};

const passed = (code, term = '2024_SEP_S2') => ({ Course: code, 'Course Title': code, Credits: 12.5, Grade: 'P', Status: 'Complete', Term: term });
const allNewCompleted = [
  ...Array.from({ length: 8 }, (_, i) => passed(`COR${String(i).padStart(5, '0')}`)),
  ...Array.from({ length: 8 }, (_, i) => passed(`MAJ${String(i).padStart(5, '0')}`)),
  passed('PRE00001'), passed('PRE00002'), ...Array.from({ length: 4 }, (_, i) => passed(`REC${String(i).padStart(5, '0')}`)), passed('ICT20016'),
];

let transcript = parseTranscriptRows(allNewCompleted);
let plan = buildBcsPlan(planner, transcript.completed, transcript.intakeTerm);
assert.equal(transcript.isSep2024OrLater, true);
assert.equal(plan.eligible, true, 'Sep-2024 BCS completion needs 8 core, 8 major, 2 prescribed, 4 recommended and WIL');
const dataSciencePlanner = {
  id: 88,
  name: '25-Sep-CSDS',
  plannerTemplate: { requirements: [{ unitType: { Name: 'Data Science Major' }, requiredCount: 8 }] },
  units: [
    ...Array.from({ length: 4 }, (_, i) => unit(`MAJ${String(i).padStart(5, '0')}`, `Shared ${i}`, 'Data Science Major')),
    ...Array.from({ length: 4 }, (_, i) => unit(`DS${String(i).padStart(6, '0')}`, `Data Science ${i}`, 'Data Science Major')),
  ],
};
const detectedDoubleMajor = detectCompletedBcsDoubleMajors({
  primaryPlanner: { ...planner, id: 77 }, planners: [{ ...planner, id: 77 }, dataSciencePlanner],
  completedUnits: transcript.completed, studentIntake: transcript.intakeTerm, primaryEligible: true,
});
assert.equal(detectedDoubleMajor.status, 'single', 'a second major is not detected unless all four unique second-major units are passed');
const passedWithDataScience = parseTranscriptRows([...allNewCompleted, ...dataSciencePlanner.units.slice(4).map(item => passed(item.UnitCode))]);
const detectedCompletedDoubleMajor = detectCompletedBcsDoubleMajors({
  primaryPlanner: { ...planner, id: 77 }, planners: [{ ...planner, id: 77 }, dataSciencePlanner],
  completedUnits: passedWithDataScience.completed, studentIntake: passedWithDataScience.intakeTerm, primaryEligible: true,
});
assert.equal(detectedCompletedDoubleMajor.status, 'double', 'four shared and four passed unique units complete a compatible second major');
assert.deepEqual(detectedCompletedDoubleMajor.candidates[0].sharedUnits, ['MAJ00000', 'MAJ00001', 'MAJ00002', 'MAJ00003']);
assert.deepEqual(detectedCompletedDoubleMajor.candidates[0].uniqueUnits, ['DS000000', 'DS000001', 'DS000002', 'DS000003']);
assert.equal(detectCompletedBcsDoubleMajors({ primaryPlanner: { ...planner, id: 77 }, planners: [dataSciencePlanner], completedUnits: passedWithDataScience.completed, studentIntake: passedWithDataScience.intakeTerm, primaryEligible: false }).status, 'not-assessed', 'second-major detection is gated on primary-major eligibility');
assert.equal(parseTranscriptRows([{ ...passed('FAIL00001'), Grade: 'F' }]).completed.length, 0, 'failed transcript grades are not treated as passed units');
assert.equal(parseTranscriptRows([{ ...passed('FAIL00002'), Grade: 'FAIL' }]).completed.length, 0, 'FAIL transcript grades are not treated as passed units');
const plannerWithConfirmedMajor = { ...planner, plannerTemplate: { name: 'Bachelor of Computer Science – Cybersecurity' } };
const completedMajorResult = getPlannerCompletionResult({ planner: plannerWithConfirmedMajor, bcsPlan: buildBcsPlan(plannerWithConfirmedMajor, transcript.completed, transcript.intakeTerm) });
assert.deepEqual(completedMajorResult, { eligible: true, majorName: 'Cybersecurity', courseName: 'Bachelor of Computer Science', warning: null }, 'completion wording uses the selected planner template major, not a transcript/title guess');
const topPlannerIdentity = { ...planner, id: 77, name: '23-Feb-CSDS' };
const topPlannerCompletion = getPlannerCompletionResult({ planner: topPlannerIdentity, bcsPlan: buildBcsPlan(topPlannerIdentity, transcript.completed, transcript.intakeTerm) });
assert.equal(topPlannerCompletion.eligible, true, 'the top-ranked planner must pass all requirement checks before its exact name is used in a completion message');
assert.equal(topPlannerIdentity.name, '23-Feb-CSDS', 'the completion message source is the stored #1 planner name, without parsing unit titles');
const unconfirmedMajorResult = getPlannerCompletionResult({ planner, bcsPlan: plan });
assert.equal(unconfirmedMajorResult.eligible, true);
assert.equal(unconfirmedMajorResult.majorName, null, 'a completed planner without explicit major metadata stays generic');
const transcriptMissingCore = parseTranscriptRows(allNewCompleted.filter(row => row.Course !== 'COR00000'));
const incompleteWithoutMapping = buildBcsPlan(plannerWithConfirmedMajor, transcriptMissingCore.completed, transcriptMissingCore.intakeTerm);
assert.equal(getPlannerCompletionResult({ planner: plannerWithConfirmedMajor, bcsPlan: incompleteWithoutMapping }).eligible, false, 'removing a valid academic mapping leaves the planner incomplete');
const completeWithMappedCore = buildBcsPlan(plannerWithConfirmedMajor, transcriptMissingCore.completed, transcriptMissingCore.intakeTerm, { Core: [{ code: 'EXT00001', categoryLabel: 'Core' }] });
assert.equal(getPlannerCompletionResult({ planner: plannerWithConfirmedMajor, bcsPlan: completeWithMappedCore }).majorName, 'Cybersecurity', 'a confirmed academic mapping updates completed-major eligibility');

transcript = parseTranscriptRows([...Array.from({ length: 8 }, (_, i) => passed(`REC${String(i % 4).padStart(5, '0')}`, '2024_MAR_S1'))]);
plan = buildBcsPlan(planner, transcript.completed, transcript.intakeTerm);
assert.equal(plan.isNew, false);
assert.equal(plan.electiveTarget, 8, 'pre-Sep-2024 BCS student without WIL needs 8 electives');

transcript = parseTranscriptRows([passed('ICT20016', '2024_MAR_S1'), ...Array.from({ length: 6 }, (_, i) => passed(`REC${String(i % 4).padStart(5, '0')}`, '2024_MAR_S1'))]);
plan = buildBcsPlan(planner, transcript.completed, transcript.intakeTerm);
assert.equal(plan.electiveTarget, 6, 'passed pre-Sep-2024 WIL reduces elective requirement to 6');

transcript = parseTranscriptRows([{ ...passed('COR00000'), Grade: 'N' }, { ...passed('COR00001'), Grade: 'SN' }, passed('COR00000', '2025_MAR_S1')]);
assert.deepEqual(transcript.completed.map(row => row.code), ['COR00000'], 'N and SN never count, while a later pass counts once');

transcript = parseTranscriptRows([{ ...passed('ICT20016'), Status: 'Current' }]);
plan = buildBcsPlan(planner, transcript.completed, transcript.intakeTerm);
assert.equal(plan.passedWil, false, 'Current WIL cannot reduce any BCS requirement');

transcript = parseTranscriptRows([{ ...passed('TRANSFER', ''), Term: '' }, passed('COR00000', '2024_MAR_S1'), passed('COR00001', '2024_SEP_S2')]);
assert.equal(transcript.intakeTerm.raw, '2024_MAR_S1', 'intake comes from the earliest usable transcript Term, not row position');
assert.ok(plan.units.every(candidate => planner.units.some(source => source.UnitCode === candidate.UnitCode)), 'BCS recommendations remain inside the selected planner');

transcript = parseTranscriptRows([passed('COR00000', '2024_SEP_S2'), { ...passed('COR00001', '2024_SEP_S2'), Grade: 'N' }, { ...passed('COR00001', '2025_MAR_S1'), Grade: 'P' }]);
assert.equal(transcript.intakeTerm.raw, '2024_SEP_S2', 'later Sep-2024 terms remain valid intake terms');
assert.equal(transcript.completed.length, 2, 'a later pass after N counts once');
const periodTranscript = parseTranscriptRows([
  passed('FOUND0001', '2025_MAR_S1'),
  { Course: 'ICT20026', 'Course Title': 'Work Integrated Learning Placement and Professional Experience - ICT', Grade: '', Status: 'Scheduled', Term: '2026_JUN_WT' },
  { Course: 'CURR00001', 'Course Title': 'Current unit', Grade: '', Status: 'Current', Term: '2026_SEP_S2' },
]);
const period = deriveTranscriptAcademicPeriod(periodTranscript.attempts);
assert.equal(period.current.year, 2, 'teaching terms, not completed-unit count or Winter, determine current year');
assert.equal(period.current.semester, 2, 'latest current teaching term determines current semester');
assert.deepEqual(period.next, { year: 3, semester: 1 }, 'next teaching period follows Year 2 Semester 2');
assert.equal(periodTranscript.attempts.find(attempt => attempt.code === 'ICT20026').term.breakTerm, 'Winter', 'JUN_WT is retained as a Winter break term');

const exactPlanner = { id: 1, name: '24-Sep-CSCS', units: [unit('COR00000', 'Core', 'Core'), ...Array.from({ length: 19 }, (_, i) => unit(`EX${String(i).padStart(6, '0')}`, 'Extra', 'Elective'))] };
const incompatiblePlanner = { id: 2, name: '23-Mar-CSCS', units: [unit('COR00000', 'Core', 'Core'), unit('COR00001', 'Core', 'Core')] };
const exactScore = scorePlannerMatch(transcript.completed, exactPlanner, transcript.intakeTerm);
const incompatibleScore = scorePlannerMatch(transcript.completed, incompatiblePlanner, transcript.intakeTerm);
assert.equal(exactScore.intakeMatch, 'exact');
assert.equal(incompatibleScore.intakeMatch, 'fallback');
assert.ok(exactScore.compatibilityRank > incompatibleScore.compatibilityRank, 'an exact intake planner outranks incompatible curriculum fallback despite raw overlap');
const ranked = rankTopPlannerMatches(transcript.completed, [incompatiblePlanner, exactPlanner], transcript.intakeTerm);
assert.equal(ranked[0].plannerId, exactPlanner.id, 'compatible intake ranks ahead of an incompatible planner with more raw overlap');
assert.deepEqual(rankTopPlannerMatches(transcript.completed, [exactPlanner, incompatiblePlanner], transcript.intakeTerm).map(result => result.plannerId), ranked.map(result => result.plannerId), 'planner ranking is deterministic');
const mappedRanking = rankTopPlannerMatches([], [incompatiblePlanner, exactPlanner], { year: 2024, month: 9, order: 2024_092 }, 5, {
  mappedExternalUnits: { Core: [{ code: 'EXT00001', creditPoints: 12.5, categoryLabel: 'Core', plannerId: exactPlanner.id }] },
});
assert.equal(mappedRanking[0].plannerId, exactPlanner.id, 'an approved academic mapping contributes only to its selected planner ranking');
const otherOnlyRanking = rankTopPlannerMatches([], [incompatiblePlanner, exactPlanner], { year: 2024, month: 9, order: 2024_092 }, 5, {
  mappedExternalUnits: { __other__: [{ code: 'EXT00002', creditPoints: 12.5, categoryLabel: 'Other', plannerId: exactPlanner.id, isOtherMapping: true }] },
});
assert.equal(otherOnlyRanking[0].overlapCount, 0, 'Other mappings never contribute to planner ranking');

plan = buildBcsPlan(planner, parseTranscriptRows([{ ...passed('COR00000'), Term: '' }]).completed, null);
assert.equal(plan.eligible, false, 'missing intake metadata cannot produce a BCS eligibility result');

const externalCore = { code: 'EXT00001', categoryLabel: 'Core' };
const mappedCorePlan = buildBcsPlan(planner, [], { raw: '2024_SEP_S2', order: 2024_092 }, { '2': [externalCore] });
assert.equal(mappedCorePlan.counts.core, 1, 'a mapped Core completion reduces the BCS Core requirement');
const mappedOtherPlan = buildBcsPlan(planner, [], { raw: '2024_SEP_S2', order: 2024_092 }, { __other__: [{ code: 'EXT00002', categoryLabel: 'Other', isOtherMapping: true }] });
assert.equal(mappedOtherPlan.counts.core, 0, 'an Other mapping never satisfies an academic requirement');
assert.equal(getPlannerCompletionResult({ planner: plannerWithConfirmedMajor, bcsPlan: mappedOtherPlan }).eligible, false, 'Other mappings cannot produce a completed-major result');

let schedule = scheduleRemainingUnits([
  { ID: 1, UnitCode: 'COS40005', CreditPoints: 12.5, scheduleCategoryKey: 'core', offeredTerms: ['Semester 1', 'Semester 2'] },
  { ID: 2, UnitCode: 'COS40006', CreditPoints: 12.5, scheduleCategoryKey: 'core', offeredTerms: ['Semester 1', 'Semester 2'] },
], new Map(), 0, 1, 1, 0, { core: 2 }).schedule;
assert.equal(schedule[0].units[0].UnitCode, 'COS40005');
assert.equal(schedule[1].units[0].UnitCode, 'COS40006', 'Project B cannot be scheduled in the same or an earlier semester than Project A');

schedule = scheduleRemainingUnits([{ ID: 3, UnitCode: 'FAIL00001', CreditPoints: 12.5, scheduleCategoryKey: 'core', offeredTerms: ['Semester 2'], requireKnownAvailability: true }], new Map(), 0, 1, 1, 0, { core: 1 }).schedule;
assert.equal(schedule[0].semester, 2, 'an outstanding failed unit is placed in its next recorded available semester');

const wilUnit = { ...unit('ICT20016', 'Work Integrated Learning Placement', 'WIL Placement'), offeredTerms: [] };
const qualifyingPlannerUnits = [
  ...Array.from({ length: 11 }, (_, i) => unit(`COR${String(i).padStart(5, '0')}`, `Core ${i}`, 'Core')),
  unit('PRE00001', 'Prescribed 1*', 'Elective'),
  unit('MPU00001', 'MPU', 'MPU'),
  { ...unit('AIN00001', 'Academic Integrity', 'Core'), CreditPoints: 0 },
  wilUnit,
];
const qualifyingCompleted = [...qualifyingPlannerUnits.slice(0, 10).map((u, i) => ({ code: u.UnitCode, Grade: i === 0 ? 'HD' : 'P' })), { code: 'COR00010', Grade: 'N' }];
let qualifyingCodes = getWilQualifyingCompletedUnitCodes({ plannerUnits: qualifyingPlannerUnits, completedUnits: qualifyingCompleted });
assert.equal(qualifyingCodes.size, 10, 'only selected-planner Core/Major/Elective passes qualify for WIL');
qualifyingCodes = getWilQualifyingCompletedUnitCodes({
  plannerUnits: qualifyingPlannerUnits,
  completedUnits: [...qualifyingCompleted, { code: 'PRE00001', Grade: 'P' }, { code: 'MPU00001', Grade: 'P' }, { code: 'AIN00001', Grade: 'P' }, { code: 'ICT20016', Grade: 'P' }],
  mappedExternalUnits: {
    Elective: [{ code: 'EXT00001', name: 'Approved transfer elective', CreditPoints: 12.5, categoryKey: 'Elective' }],
    __other__: [{ code: 'EXT00002', name: 'Other transfer', CreditPoints: 12.5, categoryKey: '__other__', isOtherMapping: true }],
  },
});
assert.equal(qualifyingCodes.size, 12, 'prescribed electives and explicit academic mappings count, while MPU, zero-credit, WIL, and Other do not');

let wilResult = scheduleWilBreakPlacement({ wilUnits: [wilUnit], completedAcademicUnits: 11, currentYear: 2, currentSemester: 1 });
assert.equal(wilResult.placement, null, '11 passed academic units cannot receive WIL');
wilResult = scheduleWilBreakPlacement({ wilUnits: [wilUnit], completedAcademicUnits: 12, currentYear: 2, currentSemester: 1 });
assert.equal(wilResult.placement.year, 2, 'WIL is not artificially delayed until Year Three');
assert.equal(wilResult.placement.term, 'Winter', 'eligibility after Semester 1 uses the following Winter break');
assert.equal(wilResult.placement.totalCredits, 25, 'WIL break placement is 25 CP');
assert.equal(wilResult.placement.units.length, 1, 'WIL has its own dedicated break entry');
wilResult = scheduleWilBreakPlacement({ wilUnits: [wilUnit], completedAcademicUnits: 12, currentYear: 2, currentSemester: 2 });
assert.equal(wilResult.placement.term, 'Summer', 'eligibility after Semester 2 uses the following Summer break');
const summerOnlyWil = { ...wilUnit, offeredTerms: ['Summer'] };
wilResult = scheduleWilBreakPlacement({ wilUnits: [summerOnlyWil], completedAcademicUnits: 12, currentYear: 3, currentSemester: 1 });
assert.equal(wilResult.placement.term, 'Summer', 'explicit availability skips an unavailable Winter break');
schedule = scheduleRemainingUnits([wilUnit], new Map(), 0, 3, 1, 12, { wil: 1 }).schedule;
assert.equal(schedule.length, 0, 'WIL is never added to an ordinary teaching-semester schedule');

console.log('BCS planner rule tests: OK');
