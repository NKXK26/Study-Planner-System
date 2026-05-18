'use client';
import { useState, useEffect } from 'react';
import { ConditionalRequireAuth } from '@components/helper';
import { useRole } from '@app/context/RoleContext';
import AccessDenied from '@components/AccessDenied';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import { MagnifyingGlassIcon, CheckCircleIcon, AcademicCapIcon, ChartBarIcon, DocumentArrowDownIcon, LightBulbIcon } from '@heroicons/react/24/outline';
import * as XLSX from 'xlsx';
import UnitRecommendations from '../unit_suggestion/UnitRecommendations';

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
	const [showRecommendations, setShowRecommendations] = useState(false);
	const [showUnitTypeDebug, setShowUnitTypeDebug] = useState(false);
	const hasAccess = isSuperadmin() || can('planner', 'read');
	const [selectedSpecialisationPlanner, setSelectedSpecialisationPlanner] = useState(null);

	const fetchStudentCompletedUnits = async (studentId) => {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch(
				`${process.env.NEXT_PUBLIC_SERVER_URL}/api/students/student_unit_history?studentId=${studentId}`
			);
			if (!response.ok) throw new Error(`Failed to fetch student units: ${response.status}`);
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
					prerequisites: unit.Unit?.Prerequisites || [],
					unitTypeId: unit.Unit?.unitTypeId,
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
			if (!response.ok) throw new Error(`Failed to fetch study planners: ${response.status}`);
			const result = await response.json();
			if (result.success) return result.data;
			else throw new Error(result.message || 'Failed to fetch study planners');
		} catch (err) {
			console.error('Error fetching study planners:', err);
			throw err;
		}
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

	const exportToExcel = () => {
		if (!matchedPlanners.length || !studentInfo) {
			alert('No data to export');
			return;
		}

		setExporting(true);
		try {
			const workbook = XLSX.utils.book_new();

			// 1. Student Info sheet
			const studentRows = [
				['Student Information'],
				['Student ID', studentInfo.studentId],
				['Completed Units (Passed)', studentInfo.completedUnitsCount],
				['Total Credits Earned', studentInfo.totalCredits],
				[''],
				['Completed Units List'],
				['Unit Code', 'Unit Name', 'Credits']
			];
			studentInfo.completedUnitsList?.forEach(unit => {
				studentRows.push([unit.code, unit.name, unit.creditPoints]);
			});
			const studentSheet = XLSX.utils.aoa_to_sheet(studentRows);
			XLSX.utils.book_append_sheet(workbook, studentSheet, 'Student Info');

			// 2. Top Planners sheet
			const plannerRows = [
				['Rank', 'Planner Name', 'Planner ID', 'Created', 'Matching Units', 'Matched Credits', '% of Student\'s Completed', '% of Planner\'s Units']
			];
			matchedPlanners.forEach((planner, idx) => {
				plannerRows.push([
					idx + 1,
					planner.plannerName,
					planner.plannerId,
					new Date(planner.createdAt).toLocaleDateString(),
					planner.overlapCount,
					planner.totalMatchedCredits,
					planner.matchStudentPct.toFixed(1) + '%',
					planner.matchPlannerPct.toFixed(1) + '%'
				]);
			});
			const plannerSheet = XLSX.utils.aoa_to_sheet(plannerRows);
			XLSX.utils.book_append_sheet(workbook, plannerSheet, 'Top Planners');

			// 3. Detailed matching units for each planner (optional, one sheet per planner)
			matchedPlanners.forEach((planner, idx) => {
				const matchingRows = [
					[`Matched Units for ${planner.plannerName}`],
					['Unit Code', 'Unit Name', 'Credits']
				];
				planner.matchingUnits.forEach(unit => {
					matchingRows.push([unit.code, unit.name, unit.creditPoints]);
				});
				const sheet = XLSX.utils.aoa_to_sheet(matchingRows);
				const sheetName = `Planner_${idx + 1}_Matches`.slice(0, 31);
				XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
			});

			XLSX.writeFile(workbook, `study_planner_comparison_${studentInfo.studentId}.xlsx`);
		} catch (err) {
			console.error('Export error:', err);
			alert('Failed to export Excel. Check console for details.');
		} finally {
			setExporting(false);
		}
	};

	const handleSearch = async (e) => {
		e.preventDefault();
		setSearched(true);
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
			completedUnitsList.forEach(unit => {
				completedUnitsMap.set(unit.id, {
					id: unit.id,
					code: unit.code,
					name: unit.name,
					year: unit.year,
					termId: unit.termId,
					creditPoints: unit.creditPoints,
					prerequisites: unit.prerequisites,
					unitTypeId: unit.unitTypeId
				});
			});
			setCompletedUnits(Array.from(completedUnitsMap.values()));

			const totalCredits = completedUnitsList.reduce((sum, unit) => sum + (unit.creditPoints || 0), 0);
			setStudentInfo({
				studentId: studentId.trim(),
				completedUnitsCount: completedUnitsMap.size,
				totalCredits: totalCredits,
			});

			const allPlanners = await fetchAllStudyPlanners();
			if (allPlanners.length === 0) {
				setError('No study planners found in the system');
				return;
			}

			const comparisons = allPlanners.map(planner => compareWithPlanner(completedUnitsMap, planner));
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

	return (
		<ConditionalRequireAuth>
			{!hasAccess ? (
				<AccessDenied requiredPermission="planner:read or system:superadmin" resourceName="study planner comparison" />
			) : (
				<PageLoadingWrapper
					requiredPermission={{ resource: 'dashboard', action: 'access' }}
					resourceName="study planner comparison"
					isLoading={false}
				>
					<div className="page-bg p-6 min-h-screen">
						<div className="max-w-7xl mx-auto">
							<div className="mb-8 flex justify-between items-center flex-wrap gap-3">
								<div>
									<h1 className="title-text text-3xl font-bold">Compare Study Planner</h1>
									<p className="text-muted text-sm mt-1">
										Search for a student and compare their completed units with available study planners
									</p>
								</div>
								{matchedPlanners.length > 0 && studentInfo && (
									<div className="flex gap-3">
										<button
											onClick={exportToExcel}
											disabled={exporting}
											className="bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition duration-150"
										>
											<DocumentArrowDownIcon className="h-5 w-5" />
											{exporting ? 'Exporting...' : 'Export to Excel'}
										</button>
										<div className="relative">
											<button
												onClick={() => setShowRecommendations(true)}
												disabled={studentInfo.totalCredits >= 300}
												className={`bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition duration-150 ${studentInfo.totalCredits >= 300 ? 'opacity-50 cursor-not-allowed' : ''
													}`}
											>
												<LightBulbIcon className="h-5 w-5" />
												Unit Recommendations
											</button>
											{studentInfo.totalCredits >= 300 && (
												<div className="mt-2 text-xs text-green-600 bg-green-50 border border-green-200 rounded-md px-2 py-1 inline-block">
													🎓 Student has already completed 300 credits – no recommendations needed.
												</div>
											)}
										</div>
									</div>
								)}
							</div>

							<div className="flex gap-6">
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

									{error && (
										<div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6">
											<strong>Error:</strong> {error}
										</div>
									)}

									{studentInfo && (
										<div className="card-bg p-6 rounded-theme shadow-theme mb-8 bg-gradient-to-r from-blue-50 to-red-50">
											<h2 className="text-lg font-semibold heading-text mb-4 flex items-center gap-2">
												<AcademicCapIcon className="h-5 w-5" />
												Student Information
											</h2>
											<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
												<div>
													<p className="text-sm text-muted">Student ID</p>
													<p className="font-semibold text-primary text-lg">{studentInfo.studentId}</p>
												</div>
												<div>
													<p className="text-sm text-muted">Completed Units (Passed)</p>
													<p className="font-semibold text-primary text-lg">{studentInfo.completedUnitsCount}</p>
												</div>
												<div>
													<p className="text-sm text-muted">Total Credits Earned</p>
													<p className="font-semibold text-primary text-lg">{studentInfo.totalCredits}</p>
												</div>
											</div>
											<details className="mt-4 border-t border-gray-200 pt-3">
												<summary className="text-sm font-semibold text-gray-700 cursor-pointer hover:text-blue-600">
													View Completed Units ({completedUnits.length} unit(s))
												</summary>
												<div className="flex flex-wrap gap-2 mt-3 max-h-64 overflow-y-auto p-2 bg-white rounded-md">
													{completedUnits.map(unit => (
														<div key={unit.id} className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
															{unit.code} – {unit.name}
														</div>
													))}
												</div>
											</details>
										</div>
									)}

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
																<div className="bg-red-50 p-3 rounded-lg">
																	<p className="text-xs text-muted mb-1">Matched Credits</p>
																	<p className="text-2xl font-bold text-red-600">{planner.totalMatchedCredits}</p>
																</div>
																<div className="bg-green-50 p-3 rounded-lg">
																	<p className="text-xs text-muted mb-1">% of Student's Completed</p>
																	<p className="text-2xl font-bold text-green-600">{planner.matchStudentPct.toFixed(1)}%</p>
																	<div className="w-full bg-green-200 rounded-full h-1.5 mt-2">
																		<div className="bg-green-600 h-1.5 rounded-full" style={{ width: `${Math.min(planner.matchStudentPct, 100)}%` }}></div>
																	</div>
																</div>
																<div className="bg-gray-100 p-3 rounded-lg">
																	<p className="text-xs text-muted mb-1">% of Planner's Units</p>
																	<p className="text-2xl font-bold text-gray-700">{planner.matchPlannerPct.toFixed(1)}%</p>
																	<div className="w-full bg-gray-300 rounded-full h-1.5 mt-2">
																		<div className="bg-gray-700 h-1.5 rounded-full" style={{ width: `${Math.min(planner.matchPlannerPct, 100)}%` }}></div>
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
							</div>

							{!searched && !studentInfo && !error && (
								<div className="card-bg p-12 rounded-theme shadow-theme text-center mt-6">
									<MagnifyingGlassIcon className="h-16 w-16 text-muted mx-auto mb-4 opacity-50" />
									<p className="text-muted text-lg">Enter a student ID to search and compare study planners</p>
								</div>
							)}
						</div>
					</div>

					{/* Unit Recommendations Modal */}
					{showRecommendations && matchedPlanners.length > 0 && studentInfo && (
						<UnitRecommendations
							isOpen={showRecommendations}
							onClose={() => setShowRecommendations(false)}
							planner={selectedSpecialisationPlanner || matchedPlanners[0]}
							availablePlanners={matchedPlanners.map(p => ({ ...p, name: p.plannerName }))}
							onSwitchPlanner={(planner) => setSelectedSpecialisationPlanner(planner)}
							completedUnits={completedUnits}
							studentInfo={studentInfo}
						/>
					)}
				</PageLoadingWrapper>
			)}
		</ConditionalRequireAuth>
	);
}