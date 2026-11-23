import assert from 'node:assert/strict';
import { buildBcsPlan, getPlannerCompletionResult, getPlannerScopedMappings, parseTranscriptRows, scorePlannerMatch, rankTopPlannerMatches, deriveTranscriptAcademicPeriod, detectCompletedBcsDoubleMajors } from '../src/app/libs/bcsPlannerRules.mjs';
import { wilContext, withinWilWindow, finalTeachingOrder } from '../src/app/libs/wilWindow.mjs';
import { recordedWilAttempts, balanceSemesterLoads, getWilQualifyingCompletedUnitCodes, scheduleRemainingUnits, scheduleWilBreakPlacement } from '../src/app/view/unit_suggestion/plannerHelpers.js';

const unit = (code, name, type) => ({ UnitCode: code, Name: name, CreditPoints: 12.5, unitType: { ID: type === 'Core' ? 2 : type === 'Major' ? 3 : type === 'WIL Placement' ? 17 : 1, Name: type }, offeredTerms: ['Semester 1', 'Semester 2'] });
const planner = {
  id: 123,
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
for (const status of ['Current', 'Scheduled', 'Future', 'In Progress']) {
  assert.equal(parseTranscriptRows([{ ...passed(`STAT${String(status.length).padStart(5, '0')}`), Status: status, Grade: '' }]).completed.length, 0, `${status} units do not count as completed`);
}
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
const completeWithMappedCore = buildBcsPlan(plannerWithConfirmedMajor, transcriptMissingCore.completed, transcriptMissingCore.intakeTerm, { Core: [{ code: 'EXT00001', categoryLabel: 'Core', plannerId: plannerWithConfirmedMajor.id }] });
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
const mappedCorePlan = buildBcsPlan(planner, [], { raw: '2024_SEP_S2', order: 2024_092 }, { '2': [{ ...externalCore, plannerId: planner.id }] });
assert.equal(mappedCorePlan.counts.core, 1, 'a mapped Core completion reduces the BCS Core requirement');
const mappedOtherPlan = buildBcsPlan(planner, [], { raw: '2024_SEP_S2', order: 2024_092 }, { __other__: [{ code: 'EXT00002', categoryLabel: 'Other', isOtherMapping: true, plannerId: planner.id }] });
assert.equal(mappedOtherPlan.counts.core, 0, 'an Other mapping never satisfies an academic requirement');
assert.equal(getPlannerCompletionResult({ planner: plannerWithConfirmedMajor, bcsPlan: mappedOtherPlan }).eligible, false, 'Other mappings cannot produce a completed-major result');

const cssdRegressionPlanner = {
  id: 601, name: '23-Feb-CSSD',
  units: [
    ...['COS10004','COS10009','COS10025','COS10026','COS20007','COS40005','COS40006','TNE10006'].map(code => unit(code, code, 'Core')),
    ...['COS20019','COS20031','COS30008','COS30043','COS30049','COS40003','SWE30003','SWE30009'].map(code => unit(code, code, 'Major')),
    ...['COS10003','COS10022','COS10082','COS20015','COS20028','COS20030','COS20083','COS30015','COS30017','COS30018','COS30019','COS30020','SWE40006'].map(code => unit(code, code, 'Elective')),
  ],
};
const cssdPassedCodes = ['COS10004','COS10009','COS10025','COS10026','COS20007','COS40005','COS40006','TNE10006','COS20019','COS20031','COS30008','COS30043','COS30049','COS40003','SWE30003','SWE30009','COS10003','COS10022','COS30015','COS30017','COS30018','COS30019','COS30045','INF10024'];
const cssdPassed = cssdPassedCodes.map(code => ({ code, name: code, creditPoints: 12.5 }));
const cssdMappings = { Elective: [
  { code: 'COS30045', creditPoints: 12.5, categoryLabel: 'Elective', plannerId: cssdRegressionPlanner.id },
  { code: 'INF10024', creditPoints: 12.5, categoryLabel: 'Elective', plannerId: cssdRegressionPlanner.id },
] };
const cssdPlanWithMappings = buildBcsPlan(cssdRegressionPlanner, cssdPassed, { raw: '2023_FEB_S1', order: 2023_021 }, cssdMappings);
assert.equal(cssdPlanWithMappings.eligible, true, '23-Feb-CSSD plus its two mapped Elective units meets its recorded pre-Sep-2024 requirements');
assert.equal(getPlannerCompletionResult({ planner: cssdRegressionPlanner, bcsPlan: cssdPlanWithMappings }).eligible, true);
assert.equal(cssdPlanWithMappings.counts.elective, 8, 'passed external transcript units still count when mapped to CSSD Elective');
assert.equal(buildBcsPlan(cssdRegressionPlanner, cssdPassed, { raw: '2023_FEB_S1', order: 2023_021 }, { Elective: [{ ...cssdMappings.Elective[0] }] }).eligible, false, 'removing one mapping restores one outstanding Elective requirement');
assert.equal(buildBcsPlan(cssdRegressionPlanner, cssdPassed, { raw: '2023_FEB_S1', order: 2023_021 }, { Elective: [cssdMappings.Elective[0], { code: 'COS30015', categoryLabel: 'Elective', plannerId: cssdRegressionPlanner.id }] }).eligible, false, 'mapping a code already completed inside the selected planner does not count twice');
assert.equal(buildBcsPlan(cssdRegressionPlanner, cssdPassed, { raw: '2023_FEB_S1', order: 2023_021 }, { Elective: cssdMappings.Elective.map(mapping => ({ ...mapping, plannerId: 602 })) }).eligible, false, 'mappings assigned to another planner cannot complete CSSD');
assert.equal(buildBcsPlan(cssdRegressionPlanner, cssdPassed, { raw: '2023_FEB_S1', order: 2023_021 }, { __other__: cssdMappings.Elective.map(mapping => ({ ...mapping, categoryLabel: 'Other', isOtherMapping: true })) }).eligible, false, 'Other mappings never satisfy CSSD requirements');
assert.equal(getPlannerScopedMappings({ Elective: cssdMappings.Elective }, 602).Elective.length, 0, 'changing selected planner excludes mappings assigned to another planner');
const otherPlannerCopy = { ...cssdRegressionPlanner, id: 602, name: '23-Feb-CSAI' };
const cssdMappingRank = rankTopPlannerMatches([], [otherPlannerCopy, cssdRegressionPlanner], { year: 2023, month: 2, order: 2023_021 }, 5, { mappedExternalUnits: cssdMappings });
assert.equal(cssdMappingRank[0].plannerId, cssdRegressionPlanner.id, 'CSSD mappings improve CSSD ranking only, not another planner');

let schedule = scheduleRemainingUnits([
  { ID: 1, UnitCode: 'COS40005', CreditPoints: 12.5, scheduleCategoryKey: 'core', offeredTerms: ['Semester 1', 'Semester 2'] },
  { ID: 2, UnitCode: 'COS40006', CreditPoints: 12.5, scheduleCategoryKey: 'core', offeredTerms: ['Semester 1', 'Semester 2'] },
], new Map(), 0, 1, 1, 0, { core: 2 }).schedule;
assert.equal(schedule[0].units[0].UnitCode, 'COS40005');
assert.equal(schedule[1].units[0].UnitCode, 'COS40006', 'Project B cannot be scheduled in the same or an earlier semester than Project A');

const fourPlusTwoSchedule = [
  { year: 2, semester: 2, unitCount: 4, totalCredits: 50, units: ['A','B','C','D'].map(code => ({ UnitCode: code, CreditPoints: 12.5 })) },
  { year: 3, semester: 1, unitCount: 2, totalCredits: 25, units: ['E','F'].map(code => ({ UnitCode: code, CreditPoints: 12.5 })) },
];
assert.deepEqual(balanceSemesterLoads(fourPlusTwoSchedule, new Map()), fourPlusTwoSchedule, 'load balancing preserves a valid four-unit then two-unit plan');

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
  completedUnits: [...qualifyingCompleted, {code:'EXT00001',Grade:'P',creditPoints:12.5}, { code: 'PRE00001', Grade: 'P' }, { code: 'MPU00001', Grade: 'P' }, { code: 'AIN00001', Grade: 'P' }, { code: 'ICT20016', Grade: 'P' }],
  mappedExternalUnits: {
    Elective: [{ code: 'EXT00001', name: 'Approved transfer elective', CreditPoints: 12.5, categoryKey: 'Elective' }],
    __other__: [{ code: 'EXT00002', name: 'Other transfer', CreditPoints: 12.5, categoryKey: '__other__', isOtherMapping: true }],
  },
});
assert.equal(qualifyingCodes.size, 12, 'prescribed electives and explicit academic mappings count, while MPU, zero-credit, WIL, and Other do not');

const approvedElectiveMappings = ['AE1', 'AE2', 'AE3'].map((code, index) => ({
  code, name: `Approved Elective ${index + 1}`, creditPoints: 12.5, categoryLabel: 'Elective', plannerId: 22,
}));
const mar25Planner = {
  id: 22, name: '25-Mar-CSCS',
  units: [
    ...['COS10004','COS10009','COS10025','COS10026','COS20007','COS40005','COS40006','TNE10006'].map(code => unit(code, code, 'Core')),
    unit('COS10026', 'Web Technology Project', 'Core'),
    ...['COS20019','COS20030','COS20031','COS30015','COS30049','SWE30003','TNE20003','TNE30009'].map(code => unit(code, code, 'Cybersecurity Major')),
    unit('COS10003', 'Computer and Logic Essentials*', 'Elective'),
    ...['COS10022','COS10082','COS20028','COS20083','COS30018','COS30019','COS30020','COS30045','COS30047','ICT20016','INF10024','SWE30009','TNE10005'].map(code => unit(code, code, 'Elective')),
  ],
};
const mar25Transcript = parseTranscriptRows([
  ...['AE1','AE2','AE3','COS10003','COS10004','COS10009','COS20031','TNE10006','COS10025','COS10026','COS20019','COS10022','COS20007','COS20030'].map(code => passed(code, '2025_MAR_S1')),
  { ...passed('COS40005', '2026_MAR_S1'), Grade: '', Status: 'Current' },
  { ...passed('COS30015', '2026_MAR_S1'), Grade: '', Status: 'Current' },
  { ...passed('TNE30009', '2025_SEP_S2'), Grade: 'N' },
]);
const mar25Mappings = {
  Elective: approvedElectiveMappings,
  __other__: [{ code: 'AIMFECS', name: 'Academic Integrity Training Module', creditPoints: 0, categoryLabel: 'Other', isOtherMapping: true, plannerId: mar25Planner.id }],
};
const mar25Plan = buildBcsPlan(mar25Planner, mar25Transcript.completed, mar25Transcript.intakeTerm, mar25Mappings);
assert.equal(mar25Plan.counts.recommended, 4, 'three mapped Approved Electives plus passed COS10022 satisfy the recommended Elective count');
assert.deepEqual(mar25Plan.units.filter(candidate => ['COS30020','SWE30009','TNE10005'].includes(candidate.UnitCode)), [], 'mapped Electives prevent unnecessary elective recommendations');
assert.deepEqual(mar25Plan.units.map(candidate => candidate.UnitCode).sort(), ['COS30015','COS30049','COS40005','COS40006','ICT20016','SWE30003','TNE20003','TNE30009'].sort(), 'only the outstanding Core, Cybersecurity Major and WIL units remain');
const mar25WithEquivalentWil = parseTranscriptRows([
  ...mar25Transcript.completed.map(item => ({ Course: item.code, 'Course Title': item.name, Credits: item.creditPoints, Grade: 'P', Status: 'Complete', Term: '2025_MAR_S1' })),
  passed('ICT20026', '2024_SEP_S2'),
]);
const mar25PlanWithEquivalentWil = buildBcsPlan(mar25Planner, mar25WithEquivalentWil.completed, mar25WithEquivalentWil.intakeTerm, mar25Mappings);
assert.equal(mar25PlanWithEquivalentWil.counts.wil, 1, 'a passed equivalent ICT20026 satisfies the selected ICT20016 WIL requirement');
assert.equal(mar25PlanWithEquivalentWil.categoryNeeds['bcs-wil'], 0, 'a passed equivalent WIL code clears the new curriculum WIL requirement');
assert.equal(mar25PlanWithEquivalentWil.units.some(candidate => candidate.UnitCode === 'ICT20016'), false, 'do not recommend ICT20016 again after an equivalent WIL pass');
const mar25WithUnpassedEquivalentWil = parseTranscriptRows([{ ...passed('ICT20026', '2024_SEP_S2'), Grade: 'N' }]);
const mar25PlanWithUnpassedEquivalentWil = buildBcsPlan(mar25Planner, mar25WithUnpassedEquivalentWil.completed, mar25Transcript.intakeTerm, mar25Mappings);
assert.equal(mar25PlanWithUnpassedEquivalentWil.counts.wil, 0, 'an unsuccessful ICT20026 attempt does not satisfy WIL');
assert.equal(mar25PlanWithUnpassedEquivalentWil.units.some(candidate => candidate.UnitCode === 'ICT20016'), true, 'keep recommending ICT20016 when the equivalent WIL attempt is not passed');
const mar25WilQualifying = getWilQualifyingCompletedUnitCodes({ plannerUnits: mar25Planner.units, completedUnits: mar25Transcript.completed, mappedExternalUnits: mar25Mappings });
assert.equal(mar25WilQualifying.size, 14, 'explicit Elective mappings named Approved Elective count toward WIL while Other does not');
const mar25AcademicPeriod = deriveTranscriptAcademicPeriod(mar25Transcript.attempts);
const march = wilContext(mar25Planner,mar25Transcript.attempts,mar25Transcript.intakeTerm,mar25AcademicPeriod.next.year,mar25AcademicPeriod.next.semester);
const recommend = (context, units=[wilUnit], count=12, schedule=[]) => scheduleWilBreakPlacement({
  wilUnits:units, completedAcademicUnits:count, context, schedule,
});
assert.equal(march.currentOrder,2);
const transition = {...wilUnit, UnitCode:'ICT20016', plannedDates:'Winter Term | Jun/Jul 2025', offeredTerms:['Winter']};
const beforeTransition = {intake:{year:2023,semester:2}, firstSemester:2, currentOrder:3, labelOffset:-4};
assert.equal(recommend(beforeTransition,[transition],11).placement,null);
const winter2025 = recommend(beforeTransition,[transition],12).placement;
assert.deepEqual([winter2025.year,winter2025.term,winter2025.semester,winter2025.totalCredits],[2,'Winter',null,25]);
assert.equal(recommend({...beforeTransition,currentOrder:4},[transition],12).placement,null);
assert.equal(withinWilWindow({year:3,term:'Winter'},beforeTransition,6,true,transition),false);
assert.equal(withinWilWindow({year:2,term:'Winter'},beforeTransition,5,true,transition),true);
assert.equal(recommend(march,[wilUnit],11).placement,null);
const deferred = recommend(march,[wilUnit],mar25WilQualifying.size);
assert.equal(deferred.placement.year,3);
assert.equal(deferred.placement.term,'Winter');
assert.equal(deferred.placement.semester,null);
assert.equal(deferred.placement.isBreakTerm,true);
assert.equal(deferred.placement.totalCredits,25);
assert.equal(deferred.placement.units.length,1);
assert.match(deferred.warning,/provisional availability/i);
const inThirdYear = {...march,currentOrder:4};
const inFinal = {...march,currentOrder:5};
const summerOnly = [{...wilUnit,offeredTerms:['Summer']}];
const winterOnly = [{...wilUnit,offeredTerms:['Winter']}];
assert.equal(recommend(inThirdYear,winterOnly).placement.term,'Winter');
assert.equal(recommend(inThirdYear,summerOnly).placement,null);
assert.match(recommend(inFinal).warning,/academic review/i);
const extended = [{year:4,semester:1,units:[mar25Planner.units[0]]}];
assert.equal(recommend(inFinal,summerOnly,12,extended).placement.term,'Summer');
assert.equal(recommend({...march,currentOrder:6},summerOnly,12,extended).placement,null);
assert.equal(withinWilWindow({year:2,term:'Summer'},march,5),false);
assert.equal(withinWilWindow({year:3,term:'Summer'},march,5),false);
assert.equal(withinWilWindow({year:3,semester:1},march,5),false);
assert.equal(finalTeachingOrder([{year:3,semester:1,units:[wilUnit]}],march),4);
const september = parseTranscriptRows([passed('COR00000','2025_SEP_S2'),passed('COR00001','2027_SEP_S2')]);
const sepContext = wilContext(planner,september.attempts,september.intakeTerm,4,1);
assert.equal(sepContext.currentOrder,4);
assert.equal(recommend(sepContext,summerOnly).placement.term,'Summer');
assert.equal(recommend(sepContext,winterOnly).placement,null);
assert.equal(finalTeachingOrder([{year:4,semester:1,units:[wilUnit]}],sepContext),5);

const recorded = parseTranscriptRows([{...passed('ICT20026','2026_JUN_WT'),Grade:'',Status:'Scheduled'},
  {...passed('ICT20016','2026_SEP_S2'),Grade:'N'}]);
const records = recordedWilAttempts({attempts:recorded.attempts,wilUnits:[wilUnit],equivalents:['ICT20026'],
  context:march,schedule:[],plannerUnits:mar25Planner.units,mappedExternalUnits:{}});
assert.deepEqual(records.map(r=>[r.code,r.raw,r.year,r.term,r.active]),[
  ['ICT20026','2026_JUN_WT',2,'Winter',true],['ICT20016','2026_SEP_S2',2,null,false],
]);
assert(records.every(r=>r.warning.includes('Academic review')));
const badCompletions = [
  {code:'COR00000',Grade:'N'}, {code:'COR00001',Grade:'P',Status:'Current'},
  {code:'COR00002',Grade:'P',creditPoints:0}, {code:'ICT20026',Grade:'P'},
  {code:'MPU00001',Grade:'P'}, {code:'EXT00001',Grade:'N'},
];
assert.equal(getWilQualifyingCompletedUnitCodes({plannerUnits:qualifyingPlannerUnits,completedUnits:badCompletions,
  mappedExternalUnits:{Elective:[{code:'EXT00001',creditPoints:12.5,categoryLabel:'Elective'}]}}).size,0);
schedule = scheduleRemainingUnits([wilUnit], new Map(), 0, 3, 1, 12, { wil: 1 }).schedule;
assert.equal(schedule.length, 0, 'WIL is never added to an ordinary teaching-semester schedule');

console.log('BCS planner rule tests: OK');
