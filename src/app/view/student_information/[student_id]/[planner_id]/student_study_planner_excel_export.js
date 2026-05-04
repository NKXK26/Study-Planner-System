import * as XLSX from 'xlsx';
import MasterStudyPlannerDB from '@app/class/MasterStudyPlanner/MasterStudyPlannerDB';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';

const formatRequisiteRelationship = (relationship) => {
	if (!relationship) return '';
	switch (String(relationship).toLowerCase()) {
		case 'pre':
			return 'Pre';
		case 'co':
			return 'Co';
		case 'anti':
			return 'Anti';
		case 'min':
			return 'Min';
		default:
			return relationship;
	}
};

const formatRequisites = (requisites) => {
	if (!requisites || requisites.length === 0) return 'NIL';
	return requisites.reduce((acc, req, index, array) => {
		const part =
			req._minCP != null && req._minCP !== ''
				? `Min(${req._minCP}CP)`
				: (() => {
						const relationship = formatRequisiteRelationship(req._unit_relationship);
						const code = req._requisite_unit_code ?? '';
						return `${relationship}(${code})`;
					})();
		if (index < array.length - 1) {
			return acc + part + ` ${req._operator === 'and' ? '&' : '|'} `;
		}
		return acc + part;
	}, '');
};

const getStatusDisplay = (status) => {
	const s = (status ?? 'planned').toString().toLowerCase().trim();
	if (s === 'pass') return 'Pass';
	if (s === 'fail') return 'Fail';
	if (s === 'planned') return 'Planned';
	return String(status).charAt(0).toUpperCase() + String(status).slice(1);
};

/** Plain-language label for HoD: completed vs any form of incomplete */
const getCompletionCategory = (status) => {
	const s = (status ?? 'planned').toString().toLowerCase().trim();
	if (s === 'pass') return 'Completed';
	if (s === 'fail') return 'Incomplete (failed — retake required)';
	return 'Incomplete (not yet passed)';
};

const getIncompleteNote = (status) => {
	const s = (status ?? '').toString().toLowerCase().trim();
	if (s === 'fail') return 'Must retake';
	if (s === 'planned' || !s) return 'Not yet taken / planned';
	return '';
};

const unitDisplayCode = (unit) => {
	const typeName = (unit.unit_type?._name || '').toLowerCase();
	const code = unit.unit?.code;
	if (!code && typeName === 'elective') return 'Elective';
	if (!code && typeName === 'empty') return '';
	return code || '';
};

const unitDisplayName = (unit) => {
	const typeName = (unit.unit_type?._name || '').toLowerCase();
	if (typeName === 'empty') return '(empty slot)';
	return unit.unit?.name || '';
};

const MATCHING_PLANNER_COLUMNS = [
	'Planner rank',
	'Planner ID',
	'Matched Units',
];
const ALL_PLANNERS_COLUMNS = [
	'Planner rank',
	'Planner ID',
	'Course intake ID',
	'Status',
	'Units in planner',
	'Current planner',
];

function buildPlannerRows(years) {
	const rows = [];
	(years || []).forEach((year) => {
		(year.semesters || []).forEach((sem, semIndex) => {
			const semPeriod =
				sem.intake != null
					? [sem.intake.month, sem.intake.year].filter(Boolean).join(' ')
					: '';
			(sem.units || []).forEach((unit, unitIndex) => {
				const statusRaw = unit.status || 'planned';
				const cp = unit.unit?.credit_points;
				rows.push({
					Year: `Year ${year.year}`,
					Semester: sem.sem_name || `Semester ${semIndex + 1}`,
					'Semester period': semPeriod,
					'Semester completed': sem.sem_completed || '',
					'Row in semester': unitIndex + 1,
					'Unit type': unit.unit_type?._name || '',
					'Unit code': unitDisplayCode(unit),
					'Unit name': unitDisplayName(unit),
					CP: cp != null ? cp : '',
					Requisites: formatRequisites(unit.requisites),
					Status: getStatusDisplay(statusRaw),
					'Complete / Incomplete (HoD)': getCompletionCategory(statusRaw),
					Note: getIncompleteNote(statusRaw),
					'Schedule conflict': unit.has_conflict ? 'Yes' : 'No',
					'Offered this term': unit.is_offered === false ? 'No' : 'Yes',
				});
			});
		});
	});
	return rows;
}

function sheetFromOrderedJson(rows, columns) {
	if (!rows.length) {
		const empty = {};
		columns.forEach((c) => {
			empty[c] = '';
		});
		return XLSX.utils.json_to_sheet([empty], { header: columns });
	}
	return XLSX.utils.json_to_sheet(rows, { header: columns });
}

function setColumnWidths(ws, widths) {
	ws['!cols'] = widths.map((wch) => ({ wch }));
}

function readCellAddress(colName, rowNumber1Indexed, headerColumns) {
	const colIndex = headerColumns.indexOf(colName);
	if (colIndex < 0) return null;
	return XLSX.utils.encode_cell({ r: rowNumber1Indexed - 1, c: colIndex });
}

function applyHighlight(ws, address, colorHex = 'FFF59D') {
	if (!address || !ws[address]) return;
	// May be ignored by some xlsx writer builds, but kept for compatible viewers.
	ws[address].s = {
		fill: {
			patternType: 'solid',
			fgColor: { rgb: colorHex },
		},
	};
}

function collectCompletedUnitIds(sp) {
	const unitMap = new Map(); // unitID -> { id, code, name }
	(sp?.years || []).forEach((year) => {
		(year.semesters || []).forEach((sem) => {
			(sem.units || []).forEach((unit) => {
				const status = (unit.status || '').toLowerCase().trim();
				const unitId = unit.unit?.id || unit.unit_id || unit.unit?.unit_id;
				if (status === 'pass' && unitId) {
					unitMap.set(unitId, {
						id: unitId,
						code: unit.unit?.code || unit.unit?.unit_code || '',
						name: unit.unit?.name || '',
					});
				}
			});
		});
	});
	console.log('collectCompletedUnitIds: found', unitMap.size, 'completed units');
	return unitMap;
}

function getPlannerUnitIdsFromDB(plannerRecord) {
	const units = plannerRecord?.full_data?.units_in_semester || [];
	const unitMap = new Map(); // unitID -> { id, code, name }
	
	units.forEach((u) => {
		const unitId = u.unit_id; // Direct property from UnitInSemesterStudyPlanner
		const unitCode = u.unit_code; // Direct property from UnitInSemesterStudyPlanner

		if (unitId) {
			unitMap.set(unitId, {
				id: unitId,
				code: unitCode || '',
				name: '',
			});
		}
	});

	return unitMap;
}

async function getMatchingPlanners(currentPlannerId, completedUnitMap) {
	const completedCount = completedUnitMap.size;

	console.log('getMatchingPlanners: completedUnitMap size:', completedCount);
	console.log('getMatchingPlanners: completedUnitMap:', Array.from(completedUnitMap.keys()));

	const response = await SecureFrontendAuthHelper.authenticatedFetch(
		`${process.env.NEXT_PUBLIC_SERVER_URL}/api/course/master_study_planner?status=Complete&get_all=true`
	);

	if (!response.ok) {
		console.error('getMatchingPlanners: API call failed:', response.status, response.statusText);
		return [];
	}

	const planners = await response.json();
	console.log('getMatchingPlanners: fetched', Array.isArray(planners) ? planners.length : 0, 'planners');

	const rows = (planners || [])
		.filter((p) => p?.ID != null && p.ID !== currentPlannerId)
		.map((p) => {
			const plannerUnitMap = getPlannerUnitIdsFromDB(p);
			let overlapCount = 0;
			const overlapUnits = [];

			completedUnitMap.forEach((completedUnit, unitId) => {
				if (plannerUnitMap.has(unitId)) {
					overlapCount += 1;
					const plannerUnit = plannerUnitMap.get(unitId);
					const displayCode = completedUnit.code || plannerUnit.code || `[ID: ${unitId}]`;
					const displayName = completedUnit.name || plannerUnit.name || '';
					overlapUnits.push({ id: unitId, code: displayCode, name: displayName });
				}
			});

			const plannerUnitCount = plannerUnitMap.size;
			const matchStudentPct = completedCount > 0 ? (overlapCount / completedCount) * 100 : 0;
			const matchPlannerPct = plannerUnitCount > 0 ? (overlapCount / plannerUnitCount) * 100 : 0;

			return {
				plannerId: p.ID,
				courseIntakeId: p.CourseIntakeID,
				overlapCount,
				completedCount,
				plannerUnitCount,
				matchStudentPct,
				matchPlannerPct,
				overlapUnits,
			};
		})
		.sort((a, b) => {
			if (b.overlapCount !== a.overlapCount) return b.overlapCount - a.overlapCount;
			if (b.matchStudentPct !== a.matchStudentPct) return b.matchStudentPct - a.matchStudentPct;
			return b.matchPlannerPct - a.matchPlannerPct;
		});

	return rows.slice(0, 5).filter(r => r.overlapCount > 0).map((r, index) => {
		const unitDetails = r.overlapUnits
			.map((u) => (u.name ? `${u.code} — ${u.name}` : u.code))
			.join('; ');

	return {
		'Planner rank': index + 1,
		'Planner ID': r.plannerId,
		'Matched Units': unitDetails,
	};
	});
}

async function getAllStudyPlannersRows(currentPlannerId) {
	const planners = await MasterStudyPlannerDB.FetchMasterStudyPlanners({
		get_all: true,
	});

	const list = Array.isArray(planners) ? planners : [];
	const rows = list
		.filter((p) => p?.id != null)
		.sort((a, b) => Number(a.id) - Number(b.id))
		.map((p, index) => {
			const plannerUnitMap = getPlannerUnitIdsFromDB(p);
			return {
				'Planner rank': index + 1,
				'Planner ID': p.id,
				'Course intake ID': p.course_intake_id ?? '',
				Status: p.status ?? '',
				'Units in planner': plannerUnitMap.size,
				'Current planner': p.id === currentPlannerId ? 'Yes' : 'No',
			};
		});

	return rows;
}

/** @param planner StudentStudyPlanner instance (same object as Export Excel on the planner page) */
export const exportStudyPlannerToExcel = async (planner) => {
	if (!planner?.StudyPlanner) {
		console.warn('exportStudyPlannerToExcel: missing StudyPlanner data');
		return;
	}

	const student = planner.student_info || {};
	const sp = planner.StudyPlanner;
	const details = sp.details || {};
	const course = details.course || {};
	const intake = details.intake || {};
	const years = sp.years || [];
	const completedUnitMap = collectCompletedUnitIds(sp);
	const completedUnitRows = Array.from(completedUnitMap.values())
		.sort((a, b) => (a.code || a.id).localeCompare(b.code || b.id))
		.map((unit) => ({
			'Unit ID': unit.id,
			'Unit code': unit.code || '(no code)',
			'Unit name': unit.name || '(no name)',
		}));

	const now = new Date();
	const generated = now.toLocaleString('en-AU', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});

	const requiredCp = planner.required_cp ?? course.credits_required ?? '';
	const creditsDone = student.credits_completed ?? '';

	const summary = [
		['STUDY PLANNER EXPORT (HoD review + DB matching)'],
		['Generated', generated],
		[],
		['STUDENT'],
		['Student ID', student.student_id || ''],
		['Name', student.name || ''],
		[],
		['PROGRAMME'],
		['Course', [course.course_name, course.course_code].filter(Boolean).join(' — ') || ''],
		['Major / specialisation', course.major_name || ''],
		['Intake', [intake.name, intake.year].filter(Boolean).join(' | ') || ''],
		[],
		['ACADEMIC PROGRESS (from student record)'],
		['Credits completed (record)', creditsDone],
		['Credits required (course)', requiredCp],
		['MPU credits completed', student.mpu_credits_completed ?? 0],
		[],
		['DB COMPARISON INPUT'],
		['Unique completed unit IDs', completedUnitMap.size],
		[],
		['Note', 'Unofficial planner export — same caveat as PDF printout.'],
	];

	const wb = XLSX.utils.book_new();

	const wsSummary = XLSX.utils.aoa_to_sheet(summary);
	setColumnWidths(wsSummary, [28, 52]);
	XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

	const completedRows = completedUnitRows.length ? completedUnitRows : [{ 'Unit ID': '', 'Unit code': '', 'Unit name': '' }];
	const wsCompleted = sheetFromOrderedJson(completedRows, ['Unit ID', 'Unit code', 'Unit name']);
	setColumnWidths(wsCompleted, [12, 15, 40]);
	XLSX.utils.book_append_sheet(wb, wsCompleted, 'Completed Units');

	const matching = await getMatchingPlanners(details.id, completedUnitMap);
	const topMatchingRows = matching.map(({ _rawOverlapUnits, ...safe }) => safe);
	const wsMatching = sheetFromOrderedJson(topMatchingRows, MATCHING_PLANNER_COLUMNS);
	setColumnWidths(wsMatching, [12, 10, 80]);
	XLSX.utils.book_append_sheet(wb, wsMatching, 'Top 5 DB planner match');

	const allPlannerRows = await getAllStudyPlannersRows(details.id);
	const wsAllPlanners = sheetFromOrderedJson(allPlannerRows, ALL_PLANNERS_COLUMNS);
	setColumnWidths(wsAllPlanners, [12, 10, 14, 12, 16, 14]);
	XLSX.utils.book_append_sheet(wb, wsAllPlanners, 'All DB study planners');

	const safeId = String(student.student_id || 'student').replace(/[/\\?*[\]]/g, '_');
	const intakePart = [intake.name, intake.year].filter(Boolean).join('_') || 'planner';
	const filename = `${safeId}_${intakePart}_study_planner.xlsx`.replace(/\s+/g, '_');

	XLSX.writeFile(wb, filename);
};

export const exportStudyPlannerMatchAnalysisToExcel = exportStudyPlannerToExcel;
