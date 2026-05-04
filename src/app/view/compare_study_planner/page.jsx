'use client';
import { useState } from 'react';
import { ConditionalRequireAuth } from '@components/helper';
import { useRole } from '@app/context/RoleContext';
import AccessDenied from '@components/AccessDenied';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import { MagnifyingGlassIcon, CheckCircleIcon, AcademicCapIcon, ChartBarIcon, DocumentArrowDownIcon, LightBulbIcon, ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import * as XLSX from 'xlsx';

export default function CompareStudyPlannerPage() {
	const { can, isSuperadmin } = useRole();
	const [studentId, setStudentId] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const [matchedPlanners, setMatchedPlanners] = useState([]);
	const [studentInfo, setStudentInfo] = useState(null);
	const [searched, setSearched] = useState(false);
	const [completedUnits, setCompletedUnits] = useState([]);
	const [exporting, setExporting] = useState(false);
	const [suggestedPath, setSuggestedPath] = useState({ orderedUnits: [], plan: [] });

	// Check if user has permission to access this page
	const hasAccess = isSuperadmin() || can('planner', 'read');

	const fetchStudentCompletedUnits = async (studentId) => {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch(
				`${process.env.NEXT_PUBLIC_SERVER_URL}/api/students/student_unit_history?studentId=${studentId}`
			);

			if (!response.ok) {
				throw new Error(`Failed to fetch student units: ${response.status}`);
			}

			const result = await response.json();

			const passedUnits = (result.units || [])
				.filter(unit => unit.Status?.toLowerCase() === 'pass')
				.map(unit => ({
					id: unit.UnitID,
					code: unit.Unit?.UnitCode || '',
					name: unit.Unit?.Name || '',
					status: unit.Status,
					year: unit.Year,
					termId: unit.TermID,
					creditPoints: unit.Unit?.CreditPoints || 0,
					prerequisites: unit.Unit?.Prerequisites || []
				}));

			return passedUnits;
		} catch (err) {
			console.error('Error fetching student completed units:', err);
			throw err;
		}
	};

	const fetchAllStudyPlanners = async () => {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch(
				`${process.env.NEXT_PUBLIC_SERVER_URL}/api/study-planner`
			);

			if (!response.ok) {
				throw new Error(`Failed to fetch study planners: ${response.status}`);
			}

			const result = await response.json();

			if (result.success) {
				return result.data;
			} else {
				throw new Error(result.message || 'Failed to fetch study planners');
			}
		} catch (err) {
			console.error('Error fetching study planners:', err);
			throw err;
		}
	};

	// Function to fetch prerequisites for a unit from the API
	const fetchUnitPrerequisites = async (unitCode) => {
		try {
			// First, get the unit ID from the unit code
			const unitResponse = await SecureFrontendAuthHelper.authenticatedFetch(
				`${process.env.NEXT_PUBLIC_SERVER_URL}/api/unit?unit_code=${JSON.stringify([unitCode])}`
			);

			if (!unitResponse.ok) {
				return [];
			}

			const unitResult = await unitResponse.json();
			let unitId = null;

			if (Array.isArray(unitResult) && unitResult.length > 0) {
				unitId = unitResult[0].ID;
			} else if (unitResult.data && unitResult.data.length > 0) {
				unitId = unitResult.data[0].ID;
			}

			if (!unitId) {
				return [];
			}

			// Now fetch prerequisites using unit_id
			const response = await SecureFrontendAuthHelper.authenticatedFetch(
				`${process.env.NEXT_PUBLIC_SERVER_URL}/api/unit/unit_requisite?unit_id=${unitId}&relationship=PREREQUISITE`
			);

			if (!response.ok) {
				return [];
			}

			const result = await response.json();

			// Extract prerequisite unit codes
			let prerequisites = [];

			if (Array.isArray(result)) {
				prerequisites = result
					.filter(item => item.UnitRelationship === 'PREREQUISITE')
					.map(item => {
						// The prerequisite unit is in RequisiteUnitID
						const prereqUnit = item.Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit;
						return prereqUnit?.UnitCode;
					})
					.filter(Boolean);
			} else if (result.data && Array.isArray(result.data)) {
				prerequisites = result.data
					.filter(item => item.UnitRelationship === 'PREREQUISITE')
					.map(item => {
						const prereqUnit = item.Unit_UnitRequisiteRelationship_RequisiteUnitIDToUnit;
						return prereqUnit?.UnitCode;
					})
					.filter(Boolean);
			}

			return [...new Set(prerequisites)];
		} catch (err) {
			console.error(`Error fetching prerequisites for ${unitCode}:`, err);
			return [];
		}
	};

	// Function to build prerequisite map for all units
	const buildPrerequisiteMap = async (units) => {
		const prereqMap = new Map();

		for (const unit of units) {
			const unitCode = unit.UnitCode || unit.code;
			if (unitCode && !prereqMap.has(unitCode)) {
				const prereqs = await fetchUnitPrerequisites(unitCode);
				prereqMap.set(unitCode, prereqs);
			}
		}

		return prereqMap;
	};

	// Function to suggest next units based on top planner with semester planning
	const suggestNextUnits = async (topPlanner, completedUnitsMap, completedUnitsSet, studentCompletedCredits, studentCompletedCount) => {
		const plannerUnits = topPlanner?.totalUnits || [];
		const completedUnitIds = new Set(completedUnitsMap.keys());
		const completedUnitCodes = new Set(completedUnitsSet);

		// Find units not yet completed by the student
		const missingUnits = plannerUnits.filter(unit => !completedUnitIds.has(unit.ID));

		// Build prerequisite map using your API
		const prereqMap = await buildPrerequisiteMap(missingUnits);

		// Parse semester availability from unit data
		const parseSemesterAvailability = (unit) => {
			const offeredIn = unit.OfferedIn || unit.offeredIn || '';
			const offeredText = offeredIn.toLowerCase();
			if (offeredText.includes('semester 1 only')) return [1];
			if (offeredText.includes('semester 2 only')) return [2];
			if (offeredText.includes('semester 1 & 2')) return [1, 2];
			return [1, 2];
		};

		// Get credit points for a unit
		const getCreditPoints = (unit) => unit.CreditPoints || unit.creditPoints || 12.5;

		// Check if prerequisites are met (including units planned in previous semesters)
		const arePrereqsMet = (unit, completedCodesSet, plannedSemesterUnits, prereqMapData) => {
			const unitCode = unit.UnitCode || unit.code;
			const prerequisites = prereqMapData.get(unitCode) || [];

			if (!prerequisites || prerequisites.length === 0) return true;

			// Check if all prerequisites are either:
			// 1. Already completed, OR
			// 2. Planned in a PREVIOUS semester (not the same semester)
			return prerequisites.every(preReq => {
				// Check if completed
				if (completedCodesSet.has(preReq)) return true;

				// Check if planned in previous semesters
				let foundInPrevious = false;
				for (const semester of plannedSemesterUnits) {
					const hasPrereq = semester.units.some(u => (u.UnitCode || u.code) === preReq);
					if (hasPrereq) {
						foundInPrevious = true;
						break;
					}
				}
				return foundInPrevious;
			});
		};

		// Calculate remaining needed for goal (24 units or 300 credits)
		const NEEDED_UNITS = 24;
		const NEEDED_CREDITS = 300;
		const remainingUnitsNeeded = Math.max(0, NEEDED_UNITS - studentCompletedCount);
		const remainingCreditsNeeded = Math.max(0, NEEDED_CREDITS - studentCompletedCredits);

		// Determine current semester (1 = Jan-June, 2 = July-Dec)
		let currentSemester = 1;
		const currentMonth = new Date().getMonth();
		if (currentMonth >= 6) currentSemester = 2;

		let plan = [];
		let accumulatedCredits = 0;
		let accumulatedUnits = 0;
		let semesterCounter = 0;
		let currentPlanSemester = currentSemester;
		let currentPlanYear = new Date().getFullYear();

		// Keep track of completed codes (including ones we schedule in previous semesters)
		let plannedCompletedCodes = new Set(completedUnitCodes);

		// Track all planned units by semester for prerequisite checking
		let plannedSemesterUnits = [];

		// Make a working copy of missing units
		let remainingMissing = [...missingUnits];

		// Build semester-by-semester plan
		while ((accumulatedUnits < remainingUnitsNeeded || accumulatedCredits < remainingCreditsNeeded) &&
			semesterCounter < 12 &&
			remainingMissing.length > 0) {

			const semesterKey = `${currentPlanYear} Semester ${currentPlanSemester}`;

			// Find available units for this semester
			// Unit can only be scheduled if:
			// 1. It's offered in current semester
			// 2. All prerequisites are already completed OR scheduled in PREVIOUS semesters (not same semester)
			// 3. It hasn't been planned yet
			const availableUnits = [];

			for (const unit of remainingMissing) {
				const semesters = parseSemesterAvailability(unit);
				const isAvailableThisSemester = semesters.includes(currentPlanSemester);

				// Check prerequisites (only against completed + previous semesters, NOT current semester)
				const arePrereqsSatisfied = arePrereqsMet(unit, plannedCompletedCodes, plannedSemesterUnits, prereqMap);

				if (isAvailableThisSemester && arePrereqsSatisfied) {
					availableUnits.push({
						...unit,
						creditPoints: getCreditPoints(unit),
						prereqsMet: true,
						prerequisites: prereqMap.get(unit.UnitCode || unit.code) || []
					});
				}
			}

			// Sort by credit points (higher credits first to reach goal faster)
			availableUnits.sort((a, b) => b.creditPoints - a.creditPoints);

			let semesterUnits = [];
			let semesterCredits = 0;
			const MAX_SEMESTER_UNITS = 4;
			const MAX_SEMESTER_CREDITS = 50;

			// Also track prerequisite relationships WITHIN the same semester
			// We need to ensure no unit depends on another in the same semester
			const canAddUnitToSemester = (unit, currentSemesterUnits, allSemesterUnits, prereqMapData) => {
				const unitCode = unit.UnitCode || unit.code;
				const prerequisites = prereqMapData.get(unitCode) || [];

				// Check if any prerequisite is in the SAME semester
				for (const prereq of prerequisites) {
					const isInSameSemester = currentSemesterUnits.some(u => (u.UnitCode || u.code) === prereq);
					if (isInSameSemester) {
						return false; // Can't add if prerequisite is in same semester
					}
				}
				return true;
			};

			// Select units for this semester
			for (const unit of availableUnits) {
				const unitCredits = unit.creditPoints;

				// Check limits AND intra-semester prerequisites
				if (semesterUnits.length < MAX_SEMESTER_UNITS &&
					semesterCredits + unitCredits <= MAX_SEMESTER_CREDITS &&
					(accumulatedUnits + semesterUnits.length < remainingUnitsNeeded ||
						accumulatedCredits + semesterCredits < remainingCreditsNeeded) &&
					canAddUnitToSemester(unit, semesterUnits, plannedSemesterUnits, prereqMap)) {

					semesterUnits.push(unit);
					semesterCredits += unitCredits;

					// Remove from remaining missing
					const index = remainingMissing.findIndex(u => u.ID === unit.ID);
					if (index !== -1) remainingMissing.splice(index, 1);
				}
			}

			// Only add semester if it has units
			if (semesterUnits.length > 0) {
				plan.push({
					year: currentPlanYear,
					semester: currentPlanSemester,
					semesterName: semesterKey,
					units: semesterUnits,
					totalCredits: semesterCredits,
					unitCount: semesterUnits.length
				});

				// Add this semester's units to plannedCompletedCodes for future semesters
				semesterUnits.forEach(unit => {
					plannedCompletedCodes.add(unit.UnitCode || unit.code);
				});

				// Track planned units by semester
				plannedSemesterUnits.push({
					semester: semesterKey,
					units: semesterUnits
				});

				accumulatedUnits += semesterUnits.length;
				accumulatedCredits += semesterCredits;
			}

			// Move to next semester
			semesterCounter++;
			if (currentPlanSemester === 1) {
				currentPlanSemester = 2;
			} else {
				currentPlanSemester = 1;
				currentPlanYear++;
			}
		}

		// Flatten the plan into ordered units
		const orderedUnits = [];
		plan.forEach(semester => {
			semester.units.forEach((unit, idx) => {
				orderedUnits.push({
					...unit,
					suggestedSemester: semester.semesterName,
					suggestedYear: semester.year,
					suggestedOrder: orderedUnits.length + 1,
					creditPoints: unit.creditPoints,
					prerequisites: unit.prerequisites
				});
			});
		});

		// Identify blocked units (prerequisites not met)
		const blockedUnits = [];
		const remainingUnscheduled = remainingMissing.filter(unit =>
			!orderedUnits.some(u => u.ID === unit.ID)
		);

		for (const unit of remainingUnscheduled) {
			const unitCode = unit.UnitCode || unit.code;
			const prerequisites = prereqMap.get(unitCode) || [];
			const missingPrereqs = prerequisites.filter(preReq => !completedUnitCodes.has(preReq));

			orderedUnits.push({
				...unit,
				creditPoints: getCreditPoints(unit),
				suggestedSemester: 'Prerequisites Required',
				suggestedOrder: orderedUnits.length + 1,
				blocked: true,
				reason: `Missing prerequisites: ${missingPrereqs.join(', ')}`,
				missingPrerequisites: missingPrereqs
			});

			blockedUnits.push({
				...unit,
				missingPrerequisites: missingPrereqs
			});
		}

		// Calculate progress
		const totalPlannedUnits = plan.reduce((sum, s) => sum + s.unitCount, 0);
		const totalPlannedCredits = plan.reduce((sum, s) => sum + s.totalCredits, 0);

		return {
			orderedUnits,
			plan,
			blockedUnits,
			remainingUnitsNeeded,
			remainingCreditsNeeded,
			accumulatedUnits: totalPlannedUnits,
			accumulatedCredits: totalPlannedCredits,
			neededUnits: NEEDED_UNITS,
			neededCredits: NEEDED_CREDITS,
			currentProgress: {
				units: studentCompletedCount,
				credits: studentCompletedCredits
			},
			plannedProgress: {
				units: totalPlannedUnits,
				credits: totalPlannedCredits
			}
		};
	};

	const compareWithPlanner = (completedUnitsMap, planner) => {
		const plannerUnits = planner.units || [];

		const plannerUnitsMap = new Map();
		plannerUnits.forEach(unit => {
			plannerUnitsMap.set(unit.ID, {
				id: unit.ID,
				code: unit.UnitCode,
				name: unit.Name,
				creditPoints: unit.CreditPoints || 0,
				prerequisites: unit.Prerequisites || [],
				offeredIn: unit.OfferedIn || unit.offeredIn || ''
			});
		});

		const matchingUnits = [];
		let overlapCount = 0;
		let totalMatchedCredits = 0;

		completedUnitsMap.forEach((completedUnit, unitId) => {
			if (plannerUnitsMap.has(unitId)) {
				overlapCount++;
				const plannerUnit = plannerUnitsMap.get(unitId);
				totalMatchedCredits += completedUnit.creditPoints || 0;
				matchingUnits.push({
					id: unitId,
					code: completedUnit.code,
					name: completedUnit.name,
					plannerCode: plannerUnit.code,
					plannerName: plannerUnit.name,
					creditPoints: completedUnit.creditPoints
				});
			}
		});

		const completedCount = completedUnitsMap.size;
		const plannerUnitCount = plannerUnits.length;

		const MAX_UNITS_FOR_100_PERCENT = 24;
		const MAX_CREDITS_FOR_100_PERCENT = 300;

		const unitPercentage = (overlapCount / MAX_UNITS_FOR_100_PERCENT) * 100;
		const creditPercentage = (totalMatchedCredits / MAX_CREDITS_FOR_100_PERCENT) * 100;

		let matchStudentPct = Math.max(unitPercentage, creditPercentage);
		matchStudentPct = Math.min(matchStudentPct, 100);

		const matchPlannerPct = plannerUnitCount > 0 ? (overlapCount / plannerUnitCount) * 100 : 0;

		return {
			plannerId: planner.id,
			plannerName: planner.name,
			createdAt: planner.createdAt,
			overlapCount,
			completedCount,
			plannerUnitCount,
			matchStudentPct,
			matchPlannerPct,
			matchingUnits,
			totalUnits: plannerUnits,
			totalMatchedCredits
		};
	};

	// Export to Excel function
	const exportToExcel = () => {
		try {
			setExporting(true);
			const workbook = XLSX.utils.book_new();

			// Student Information Sheet
			const studentInfoData = [
				['Student Information'],
				['Student ID', studentInfo?.studentId || ''],
				['Total Completed Units', studentInfo?.completedUnitsCount || 0],
				['Total Credits', studentInfo?.totalCredits || 0],
				['Report Generated', new Date().toLocaleString()],
				[],
				['Completed Units List'],
				['Unit Code', 'Unit Name', 'Credit Points', 'Year', 'Term ID']
			];

			studentInfo?.completedUnitsList?.forEach(unit => {
				studentInfoData.push([
					unit.code,
					unit.name || '',
					unit.creditPoints || 0,
					unit.year || '',
					unit.termId || ''
				]);
			});

			const studentSheet = XLSX.utils.aoa_to_sheet(studentInfoData);
			XLSX.utils.book_append_sheet(workbook, studentSheet, 'Student Information');

			// Summary Sheet
			const summaryData = [
				['Study Planner Comparison Summary'],
				['Student ID:', studentInfo?.studentId || ''],
				['Generated:', new Date().toLocaleString()],
				[],
				['Rank', 'Planner Name', 'Planner ID', 'Matching Units', 'Total Student Units', 'Total Planner Units',
					'% of Student\'s Completed', '% of Planner\'s Units', 'Matched Credits', 'Created Date']
			];

			matchedPlanners.forEach((planner, index) => {
				summaryData.push([
					`#${index + 1}`,
					planner.plannerName,
					planner.plannerId,
					planner.overlapCount,
					planner.completedCount,
					planner.plannerUnitCount,
					`${planner.matchStudentPct.toFixed(1)}%`,
					`${planner.matchPlannerPct.toFixed(1)}%`,
					planner.totalMatchedCredits,
					new Date(planner.createdAt).toLocaleDateString()
				]);
			});

			const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
			XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

			// Suggested Study Path Sheet
			if (suggestedPath.plan && suggestedPath.plan.length > 0) {
				const pathData = [
					['Suggested Study Path'],
					['Based on Planner:', matchedPlanners[0]?.plannerName || ''],
					['Generated:', new Date().toLocaleString()],
					[],
					['Semester Plan']
				];

				suggestedPath.plan.forEach(semester => {
					pathData.push([semester.semesterName]);
					pathData.push(['Unit Code', 'Unit Name', 'Credit Points']);
					semester.units.forEach(unit => {
						pathData.push([unit.UnitCode, unit.Name || '', unit.creditPoints]);
					});
					pathData.push([]);
				});

				const pathSheet = XLSX.utils.aoa_to_sheet(pathData);
				XLSX.utils.book_append_sheet(workbook, pathSheet, 'Suggested Study Path');
			}

			const fileName = `Study_Planner_Comparison_${studentInfo?.studentId}_${new Date().toISOString().split('T')[0]}.xlsx`;
			XLSX.writeFile(workbook, fileName);
			setExporting(false);
		} catch (err) {
			console.error('Error exporting to Excel:', err);
			setError('Failed to export data to Excel');
			setExporting(false);
		}
	};

	const handleSearch = async (e) => {
		e.preventDefault();
		setSearched(true);
		setSuggestedPath({ orderedUnits: [], plan: [] });

		if (!studentId.trim()) {
			setError('Please enter a student ID');
			setMatchedPlanners([]);
			setStudentInfo(null);
			return;
		}

		try {
			setLoading(true);
			setError(null);
			setMatchedPlanners([]);
			setCompletedUnits([]);

			const completedUnitsList = await fetchStudentCompletedUnits(studentId.trim());

			if (completedUnitsList.length === 0) {
				setError(`No completed units (status: 'pass') found for student ID "${studentId}".`);
				setStudentInfo(null);
				return;
			}

			const completedUnitsMap = new Map();
			const completedUnitsSet = new Set();

			completedUnitsList.forEach(unit => {
				completedUnitsMap.set(unit.id, {
					id: unit.id,
					code: unit.code,
					name: unit.name,
					year: unit.year,
					termId: unit.termId,
					creditPoints: unit.creditPoints,
					prerequisites: unit.prerequisites
				});
				completedUnitsSet.add(unit.code);
			});

			setCompletedUnits(Array.from(completedUnitsMap.values()));

			const totalCredits = completedUnitsList.reduce((sum, unit) => sum + (unit.creditPoints || 0), 0);

			setStudentInfo({
				studentId: studentId.trim(),
				completedUnitsCount: completedUnitsMap.size,
				completedUnitsList: Array.from(completedUnitsMap.values()),
				totalCredits: totalCredits
			});

			const allPlanners = await fetchAllStudyPlanners();

			if (allPlanners.length === 0) {
				setError('No study planners found in the system');
				return;
			}

			const comparisons = allPlanners.map(planner =>
				compareWithPlanner(completedUnitsMap, planner)
			);

			const top5Planners = comparisons
				.sort((a, b) => {
					if (b.overlapCount !== a.overlapCount) return b.overlapCount - a.overlapCount;
					if (b.matchStudentPct !== a.matchStudentPct) return b.matchStudentPct - a.matchStudentPct;
					return 0;
				})
				.slice(0, 5)
				.filter(planner => planner.overlapCount > 0);

			if (top5Planners.length === 0) {
				setError('No matching study planners found for this student\'s completed units');
			} else {
				setMatchedPlanners(top5Planners);

				const needsSuggestions = completedUnitsMap.size < 24 || totalCredits < 300;

				if (needsSuggestions && top5Planners[0]) {
					const suggestions = await suggestNextUnits(
						top5Planners[0],
						completedUnitsMap,
						completedUnitsSet,
						totalCredits,
						completedUnitsMap.size
					);
					setSuggestedPath(suggestions);
				}
			}

		} catch (err) {
			console.error('Error searching student:', err);
			setError(err.message || 'Failed to search student data');
			setMatchedPlanners([]);
			setStudentInfo(null);
		} finally {
			setLoading(false);
		}
	};

	const hasReadPermission = hasAccess;
	const needsSuggestions = studentInfo && (studentInfo.completedUnitsCount < 24 || studentInfo.totalCredits < 300);

	return (
		<ConditionalRequireAuth>
			{!hasReadPermission ? (
				<AccessDenied requiredPermission="planner:read or system:superadmin" resourceName="study planner comparison" />
			) : (
				<PageLoadingWrapper
					requiredPermission={{ resource: 'dashboard', action: 'access' }}
					resourceName="study planner comparison"
					isLoading={false}
				>
					<div className="page-bg p-6 min-h-screen">
						<div className="max-w-7xl mx-auto">
							<div className="mb-8 flex justify-between items-center">
								<div>
									<h1 className="title-text text-3xl font-bold">Compare Study Planner</h1>
									<p className="text-muted text-sm mt-1">
										Search for a student and compare their completed units with available study planners
									</p>
								</div>
								{matchedPlanners.length > 0 && studentInfo && (
									<button
										onClick={exportToExcel}
										disabled={exporting}
										className="bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition duration-150"
									>
										<DocumentArrowDownIcon className="h-5 w-5" />
										{exporting ? 'Exporting...' : 'Export to Excel'}
									</button>
								)}
							</div>

							<div className="flex gap-6">
								{/* Main Content */}
								<div className="flex-1">
									{/* Search Form */}
									<div className="card-bg p-6 rounded-theme shadow-theme mb-8">
										<form onSubmit={handleSearch}>
											<div className="flex flex-col md:flex-row gap-4">
												<div className="flex-1">
													<label className="label-text-alt block mb-2 text-sm font-medium">Student ID</label>
													<input
														type="text"
														value={studentId}
														onChange={(e) => setStudentId(e.target.value)}
														placeholder="Enter student ID..."
														className="input-field w-full border rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
													/>
												</div>
												<div className="flex items-end">
													<button
														type="submit"
														disabled={loading}
														className="bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-bold py-2 px-6 rounded-lg transition duration-150 ease-in-out flex items-center gap-2"
													>
														<MagnifyingGlassIcon className="h-5 w-5" />
														{loading ? 'Searching...' : 'Search'}
													</button>
												</div>
											</div>
										</form>
									</div>

									{/* Error Message */}
									{error && (
										<div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6">
											<strong>Error:</strong> {error}
										</div>
									)}

									{/* Student Information */}
									{studentInfo && (
										<div className="card-bg p-6 rounded-theme shadow-theme mb-8 bg-gradient-to-r from-blue-50 to-indigo-50">
											<h2 className="text-lg font-semibold heading-text mb-4 flex items-center gap-2">
												<AcademicCapIcon className="h-5 w-5" />
												Student Information
											</h2>
											<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
												<div>
													<p className="text-sm text-muted">Student ID</p>
													<p className="font-semibold text-primary text-lg">{studentInfo.studentId}</p>
												</div>
												<div>
													<p className="text-sm text-muted">Completed Units</p>
													<p className="font-semibold text-primary text-lg">{studentInfo.completedUnitsCount} / 24</p>
												</div>
												<div>
													<p className="text-sm text-muted">Total Credits</p>
													<p className="font-semibold text-primary text-lg">{studentInfo.totalCredits} / 300</p>
												</div>
											</div>

											{studentInfo.completedUnitsList && studentInfo.completedUnitsList.length > 0 && (
												<div className="mt-4">
													<p className="text-sm font-semibold text-muted mb-2">Completed Units:</p>
													<div className="flex flex-wrap gap-2">
														{studentInfo.completedUnitsList.map((unit) => (
															<span
																key={unit.id}
																className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full"
																title={`${unit.name || ''} (${unit.creditPoints} credits)`}
															>
																{unit.code}
															</span>
														))}
													</div>
												</div>
											)}
										</div>
									)}

									{/* Results */}
									{searched && !error && matchedPlanners.length === 0 && studentInfo ? (
										<div className="card-bg p-12 rounded-theme shadow-theme text-center">
											<ChartBarIcon className="h-16 w-16 text-muted mx-auto mb-4 opacity-50" />
											<p className="text-muted text-lg">No matching study planners found.</p>
										</div>
									) : (
										matchedPlanners.length > 0 && (
											<div className="space-y-6">
												<h2 className="text-xl font-semibold heading-text mb-4 flex items-center gap-2">
													<ChartBarIcon className="h-6 w-6" />
													Top {matchedPlanners.length} Matching Study Planners
												</h2>

												{matchedPlanners.map((planner, index) => (
													<div key={planner.plannerId} className="card-bg rounded-theme shadow-theme overflow-hidden">
														<div className="p-6 border-b bg-gradient-to-r from-gray-50 to-white">
															<div className="flex items-start justify-between">
																<div className="flex-1">
																	<div className="flex items-center gap-3 mb-2">
																		<span className="text-2xl font-bold text-blue-600">#{index + 1}</span>
																		<h3 className="text-xl font-bold heading-text">{planner.plannerName}</h3>
																	</div>
																	<p className="text-sm text-muted">
																		Planner ID: {planner.plannerId} | Created: {new Date(planner.createdAt).toLocaleDateString()}
																	</p>
																</div>
															</div>

															<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
																<div className="bg-blue-50 p-3 rounded-lg">
																	<p className="text-xs text-muted mb-1">Matching Units</p>
																	<p className="text-2xl font-bold text-blue-600">{planner.overlapCount} / {planner.completedCount}</p>
																</div>
																<div className="bg-indigo-50 p-3 rounded-lg">
																	<p className="text-xs text-muted mb-1">Matched Credits</p>
																	<p className="text-2xl font-bold text-indigo-600">{planner.totalMatchedCredits}</p>
																</div>
																<div className="bg-green-50 p-3 rounded-lg">
																	<p className="text-xs text-muted mb-1">% of Student's Completed</p>
																	<p className="text-2xl font-bold text-green-600">{planner.matchStudentPct.toFixed(1)}%</p>
																	<div className="w-full bg-green-200 rounded-full h-1.5 mt-2">
																		<div className="bg-green-600 h-1.5 rounded-full" style={{ width: `${Math.min(planner.matchStudentPct, 100)}%` }}></div>
																	</div>
																</div>
																<div className="bg-purple-50 p-3 rounded-lg">
																	<p className="text-xs text-muted mb-1">% of Planner's Units</p>
																	<p className="text-2xl font-bold text-purple-600">{planner.matchPlannerPct.toFixed(1)}%</p>
																	<div className="w-full bg-purple-200 rounded-full h-1.5 mt-2">
																		<div className="bg-purple-600 h-1.5 rounded-full" style={{ width: `${Math.min(planner.matchPlannerPct, 100)}%` }}></div>
																	</div>
																</div>
															</div>
														</div>

														<div className="p-6">
															<h4 className="font-semibold text-sm heading-text mb-3 flex items-center gap-2">
																<CheckCircleIcon className="h-4 w-4 text-green-600" />
																Matched Units ({planner.matchingUnits.length})
															</h4>
															{planner.matchingUnits.length > 0 ? (
																<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
																	{planner.matchingUnits.map((unit, idx) => (
																		<div key={idx} className="bg-green-50 border border-green-200 rounded-lg p-3">
																			<p className="font-mono text-sm font-semibold text-green-800">{unit.code}</p>
																			{unit.name && <p className="text-xs text-green-700 mt-1">{unit.name}</p>}
																			<p className="text-xs text-green-600 mt-1">{unit.creditPoints} credits</p>
																		</div>
																	))}
																</div>
															) : (
																<p className="text-sm text-muted">No matching units found</p>
															)}
														</div>

														<details className="border-t">
															<summary className="px-6 py-3 cursor-pointer hover:bg-gray-50 text-sm font-medium text-muted">
																View all units in this planner ({planner.totalUnits.length} total)
															</summary>
															<div className="px-6 pb-4 pt-2">
																<div className="flex flex-wrap gap-2">
																	{planner.totalUnits.map((unit) => {
																		const isMatched = planner.matchingUnits.some(mu => mu.id === unit.ID);
																		return (
																			<span key={unit.ID} className={`text-xs font-medium px-2.5 py-1 rounded-full ${isMatched ? 'bg-green-100 text-green-800 border border-green-300' : 'bg-gray-100 text-gray-600'}`}>
																				{unit.UnitCode}{isMatched && ' ✓'}
																			</span>
																		);
																	})}
																</div>
															</div>
														</details>
													</div>
												))}
											</div>
										)
									)}
								</div>

								{/* Sidebar - Suggested Study Path */}
								{needsSuggestions && suggestedPath.plan && suggestedPath.plan.length > 0 && (
									<div className="w-96 flex-shrink-0">
										<div className="sticky top-6">
											<div className="card-bg rounded-theme shadow-theme overflow-hidden bg-gradient-to-b from-amber-50 to-orange-50 border-l-4 border-amber-500">
												<div className="p-4 bg-amber-100 border-b border-amber-200">
													<div className="flex items-center gap-2">
														<LightBulbIcon className="h-6 w-6 text-amber-600" />
														<h2 className="font-bold text-amber-800">Suggested Study Path</h2>
													</div>
													<p className="text-xs text-amber-700 mt-1">
														Based on: {matchedPlanners[0]?.plannerName}
													</p>
												</div>

												<div className="p-4 max-h-[600px] overflow-y-auto">
													{/* Progress */}
													<div className="mb-4 p-3 bg-amber-100 rounded-lg">
														<p className="text-sm font-semibold text-amber-800">Progress to Goal:</p>
														<div className="mt-2 space-y-2">
															<div>
																<div className="flex justify-between text-xs text-amber-700">
																	<span>Units:</span>
																	<span>{studentInfo.completedUnitsCount} / 24</span>
																</div>
																<div className="w-full bg-amber-200 rounded-full h-2 mt-1">
																	<div className="bg-amber-600 h-2 rounded-full" style={{ width: `${Math.min((studentInfo.completedUnitsCount / 24) * 100, 100)}%` }}></div>
																</div>
															</div>
															<div>
																<div className="flex justify-between text-xs text-amber-700">
																	<span>Credits:</span>
																	<span>{studentInfo.totalCredits} / 300</span>
																</div>
																<div className="w-full bg-amber-200 rounded-full h-2 mt-1">
																	<div className="bg-amber-600 h-2 rounded-full" style={{ width: `${Math.min((studentInfo.totalCredits / 300) * 100, 100)}%` }}></div>
																</div>
															</div>
														</div>
													</div>

													{/* Semester Plan */}
													<h3 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
														<ArrowPathIcon className="h-4 w-4" />
														Recommended Semester Plan
													</h3>

													<div className="space-y-4">
														{suggestedPath.plan.map((semester, idx) => (
															<div key={idx} className="border border-amber-200 rounded-lg overflow-hidden">
																<div className="bg-amber-200 px-3 py-2">
																	<p className="font-semibold text-amber-800 text-sm">{semester.semesterName}</p>
																	<p className="text-xs text-amber-700">{semester.unitCount} units · {semester.totalCredits} credits</p>
																</div>
																<div className="p-3 space-y-2 bg-white">
																	{semester.units.map((unit, unitIdx) => (
																		<div key={unit.ID} className="text-sm">
																			<p className="font-mono font-semibold text-amber-800">{unit.UnitCode}</p>
																			<p className="text-xs text-gray-600">{unit.Name}</p>
																			<p className="text-xs text-gray-500">{unit.creditPoints} credits</p>
																		</div>
																	))}
																</div>
															</div>
														))}
													</div>

													{/* Blocked Units */}
													{suggestedPath.orderedUnits && suggestedPath.orderedUnits.some(u => u.blocked) && (
														<div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
															<p className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-1">
																<ExclamationTriangleIcon className="h-4 w-4" /> Units with Unmet Prerequisites:
															</p>
															<div className="space-y-1">
																{suggestedPath.orderedUnits.filter(u => u.blocked).map((unit, idx) => (
																	<p key={idx} className="text-xs text-red-600">{unit.UnitCode}: {unit.reason}</p>
																))}
															</div>
														</div>
													)}
												</div>

												<div className="p-3 bg-amber-100 border-t border-amber-200 text-center">
													<p className="text-xs text-amber-700">Max 4 units (50 credits) per semester</p>
												</div>
											</div>
										</div>
									</div>
								)}
							</div>

							{/* Initial State */}
							{!searched && !studentInfo && !error && (
								<div className="card-bg p-12 rounded-theme shadow-theme text-center mt-6">
									<MagnifyingGlassIcon className="h-16 w-16 text-muted mx-auto mb-4 opacity-50" />
									<p className="text-muted text-lg">Enter a student ID to search and compare study planners</p>
								</div>
							)}
						</div>
					</div>
				</PageLoadingWrapper>
			)}
		</ConditionalRequireAuth>
	);
}