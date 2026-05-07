'use client';
import { useState } from 'react';
import { ConditionalRequireAuth } from '@components/helper';
import { useRole } from '@app/context/RoleContext';
import AccessDenied from '@components/AccessDenied';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import { MagnifyingGlassIcon, CheckCircleIcon, AcademicCapIcon, ChartBarIcon, DocumentArrowDownIcon, LightBulbIcon } from '@heroicons/react/24/outline';
import * as XLSX from 'xlsx';
import UnitRecommendations from '../unit_suggestion/UnitRecommendations';

// Helper to map unit type ID to category name (same as in UnitRecommendations)
const getUnitCategoryById = (typeId) => {
	switch (typeId) {
		case 2: return 'core';
		case 1: return 'elective';
		case 3: return 'major';
		case 4: return 'mpu';
		case 17: return 'wil';
		default: return 'elective';
	}
};

// Determine unit category from unit object (using unitTypeId or unitType relation)
const getUnitCategory = (unit) => {
	let typeId = null;
	if (unit.unitTypeId !== undefined) typeId = unit.unitTypeId;
	else if (unit.unit_type_id !== undefined) typeId = unit.unit_type_id;
	else if (unit.unitType?.ID !== undefined) typeId = unit.unitType.ID;
	else if (unit.unitType?.id !== undefined) typeId = unit.unitType.id;
	else if (unit.unitType?.Name) {
		const name = unit.unitType.Name.toLowerCase();
		if (name === 'core') return 'core';
		if (name === 'elective') return 'elective';
		if (name === 'major') return 'major';
		return 'elective';
	}
	return typeId !== null ? getUnitCategoryById(typeId) : 'elective';
};

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
	const [globalUnitTypeMap, setGlobalUnitTypeMap] = useState(new Map());
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
		// ... unchanged, keep your existing export logic
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
			const completedUnitsSet = new Set();
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
				completedUnitsSet.add(unit.code);
			});
			setCompletedUnits(Array.from(completedUnitsMap.values()));

			const totalCredits = completedUnitsList.reduce((sum, unit) => sum + (unit.creditPoints || 0), 0);
			setStudentInfo({
				studentId: studentId.trim(),
				completedUnitsCount: completedUnitsMap.size,
				completedUnitsList: Array.from(completedUnitsMap.values()),
				totalCredits: totalCredits,
				completedCoreCount: 0,
				completedElectiveCount: 0,
				completedMajorCount: 0
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

				// ---- Count categories directly from the units' own unitTypeId ----
				let core = 0, elective = 0, major = 0;
				for (const unit of completedUnitsList) {
					const typeId = unit.unitTypeId;
					if (typeId !== undefined && typeId !== null) {
						const cat = getUnitCategoryById(typeId);
						if (cat === 'core') core++;
						else if (cat === 'elective') elective++;
						else if (cat === 'major') major++;
						// MPU, WIL etc. are ignored (they are not core/elective/major)
					} else {
						// If a unit somehow has no type, fallback to elective (should not happen)
						elective++;
					}
				}
				setStudentInfo(prev => ({
					...prev,
					completedCoreCount: core,
					completedElectiveCount: elective,
					completedMajorCount: major
				}));
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
										<button
											onClick={() => setShowRecommendations(true)}
											className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition duration-150"
										>
											<LightBulbIcon className="h-5 w-5" />
											Unit Recommendations
										</button>
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
										<div className="card-bg p-6 rounded-theme shadow-theme mb-8 bg-gradient-to-r from-blue-50 to-indigo-50">
											<h2 className="text-lg font-semibold heading-text mb-4 flex items-center gap-2">
												<AcademicCapIcon className="h-5 w-5" />
												Student Information
											</h2>
											<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
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
											{/* New row for Core/Elective/Major counts */}
											<div className="grid grid-cols-3 gap-3 text-sm mb-4">
												<div className="bg-white rounded-lg p-2 text-center border border-gray-200">
													<span className="text-gray-500">Core Units</span>
													<p className="font-bold text-blue-600 text-lg">
														{studentInfo.completedCoreCount ?? 0} / 8
													</p>
												</div>
												<div className="bg-white rounded-lg p-2 text-center border border-gray-200">
													<span className="text-gray-500">Elective Units</span>
													<p className="font-bold text-green-600 text-lg">
														{studentInfo.completedElectiveCount ?? 0} / 8
													</p>
												</div>
												<div className="bg-white rounded-lg p-2 text-center border border-gray-200">
													<span className="text-gray-500">Major Units</span>
													<p className="font-bold text-purple-600 text-lg">
														{studentInfo.completedMajorCount ?? 0} / 8
													</p>
												</div>
											</div>
											<div className="mt-4 border-t border-gray-200 pt-3">
												<p className="text-sm font-semibold text-gray-700 mb-2">Completed Units by Type</p>
												<div className="grid grid-cols-1 md:grid-cols-3 gap-4">

													{/* Core Units */}
													<div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
														<h4 className="text-sm font-bold text-blue-700 mb-2">Core Units</h4>
														<div className="flex flex-wrap gap-1">
															{studentInfo.completedUnitsList
																.filter(unit => {
																	const typeId = unit.unitTypeId;
																	const cat = typeId !== undefined && typeId !== null ? getUnitCategoryById(typeId) : null;
																	return cat === 'core';
																})
																.map(unit => (
																	<span
																		key={unit.id}
																		className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full"
																		title={unit.name || ''}
																	>
																		{unit.code}
																	</span>
																))}
															{studentInfo.completedUnitsList.filter(unit => {
																const typeId = unit.unitTypeId;
																const cat = typeId !== undefined && typeId !== null ? getUnitCategoryById(typeId) : null;
																return cat === 'core';
															}).length === 0 && (
																	<span className="text-xs text-gray-400 italic">No core units yet</span>
																)}
														</div>
													</div>

													{/* Elective Units */}
													<div className="bg-green-50 rounded-lg p-3 border border-green-200">
														<h4 className="text-sm font-bold text-green-700 mb-2">Elective Units</h4>
														<div className="flex flex-wrap gap-1">
															{studentInfo.completedUnitsList
																.filter(unit => {
																	const typeId = unit.unitTypeId;
																	const cat = typeId !== undefined && typeId !== null ? getUnitCategoryById(typeId) : null;
																	return cat === 'elective';
																})
																.map(unit => (
																	<span
																		key={unit.id}
																		className="bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5 rounded-full"
																		title={unit.name || ''}
																	>
																		{unit.code}
																	</span>
																))}
															{studentInfo.completedUnitsList.filter(unit => {
																const typeId = unit.unitTypeId;
																const cat = typeId !== undefined && typeId !== null ? getUnitCategoryById(typeId) : null;
																return cat === 'elective';
															}).length === 0 && (
																	<span className="text-xs text-gray-400 italic">No elective units yet</span>
																)}
														</div>
													</div>

													{/* Major Units */}
													<div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
														<h4 className="text-sm font-bold text-purple-700 mb-2">Major Units</h4>
														<div className="flex flex-wrap gap-1">
															{studentInfo.completedUnitsList
																.filter(unit => {
																	const typeId = unit.unitTypeId;
																	const cat = typeId !== undefined && typeId !== null ? getUnitCategoryById(typeId) : null;
																	return cat === 'major';
																})
																.map(unit => (
																	<span
																		key={unit.id}
																		className="bg-purple-100 text-purple-800 text-xs font-medium px-2 py-0.5 rounded-full"
																		title={unit.name || ''}
																	>
																		{unit.code}
																	</span>
																))}
															{studentInfo.completedUnitsList.filter(unit => {
																const typeId = unit.unitTypeId;
																const cat = typeId !== undefined && typeId !== null ? getUnitCategoryById(typeId) : null;
																return cat === 'major';
															}).length === 0 && (
																	<span className="text-xs text-gray-400 italic">No major units yet</span>
																)}
														</div>
													</div>
												</div>
											</div>
										</div>
									)}
									{/* Planner results (unchanged) */}
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
														{/* ... planner details unchanged ... */}
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
																{/* stats cards */}
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
							planner={matchedPlanners[0]}
							completedUnits={completedUnits}
							studentInfo={studentInfo}
						/>
					)}
				</PageLoadingWrapper>
			)}
		</ConditionalRequireAuth>
	);
}