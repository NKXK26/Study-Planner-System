'use client';
import { useState, useRef } from 'react';
import { ConditionalRequireAuth } from '@components/helper';
import { useRole } from '@app/context/RoleContext';
import AccessDenied from '@components/AccessDenied';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import { CheckCircleIcon, AcademicCapIcon, ChartBarIcon, DocumentArrowDownIcon, LightBulbIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import * as XLSX from 'xlsx';
import UnitRecommendations from '../unit_suggestion/UnitRecommendations';

export default function CompareStudyPlannerPage() {
	const { can, isSuperadmin } = useRole();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);
	const [matchedPlanners, setMatchedPlanners] = useState([]);
	const [studentInfo, setStudentInfo] = useState(null);
	const [searched, setSearched] = useState(false);
	const [completedUnits, setCompletedUnits] = useState([]);
	const [exporting, setExporting] = useState(false);
	const [showRecommendations, setShowRecommendations] = useState(false);
	const [selectedSpecialisationPlanner, setSelectedSpecialisationPlanner] = useState(null);
	const [fileName, setFileName] = useState('');
	const fileInputRef = useRef(null);

	const hasAccess = isSuperadmin() || can('planner', 'read');
	const parseXlsxFile = (file) => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				try {
					const data = new Uint8Array(e.target.result);
					const workbook = XLSX.read(data, { type: 'array' });
					const sheet = workbook.Sheets[workbook.SheetNames[0]];
					const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

					const passed = rows.filter(row => {
						const grade = row['Grade'];
						if (grade === null || grade === undefined || grade === '') return false;
						const gradeStr = String(grade).trim().toUpperCase();
						return gradeStr !== 'N';
					});

					const units = passed.map((row) => {
						const code = String(row['Course'] || '').trim().toUpperCase();
						const title = String(row['Course Title'] || '').trim();
						// unitTypeId 17 = WIL. Requires BOTH the course code AND the
						// exact title to match, so a code reuse for a different unit
						// never gets misclassified as WIL.
						const isWil = code === 'ICT20016' &&
							title === 'Work Integrated Learning Placement - ICT (3 month)';
						const unitTypeId = isWil ? 17 : null;
						return {
							id: code,
							code,
							name: title,
							creditPoints: parseFloat(row['Credits'] || row['Earned'] || 0) || 0,
							grade: String(row['Grade'] || '').trim(),
							prerequisites: [],
							unitTypeId,
						};
					}).filter(u => u.code);

					resolve(units);
				} catch (err) {
					reject(new Error('Failed to parse XLSX file: ' + err.message));
				}
			};
			reader.onerror = () => reject(new Error('Failed to read file'));
			reader.readAsArrayBuffer(file);
		});
	};

	const fetchAllStudyPlanners = async () => {
		const response = await SecureFrontendAuthHelper.authenticatedFetch(
			`${process.env.NEXT_PUBLIC_SERVER_URL}/api/study-planner`
		);
		if (!response.ok) throw new Error(`Failed to fetch study planners: ${response.status}`);
		const result = await response.json();
		if (result.success) return result.data;
		throw new Error(result.message || 'Failed to fetch study planners');
	};

	const compareWithPlanner = (completedUnitsMap, planner) => {
		const plannerUnits = planner.units || [];
		const plannerUnitsMap = new Map();
		plannerUnits.forEach(unit => {
			// Index by UnitCode so it matches against the Course code from the XLSX
			const code = (unit.UnitCode || '').trim().toUpperCase();
			if (code) {
				plannerUnitsMap.set(code, {
					id: unit.ID,
					code: unit.UnitCode,
					name: unit.Name,
					creditPoints: unit.CreditPoints || 0,
					prerequisites: unit.Prerequisites || [],
					offeredIn: unit.OfferedIn || unit.offeredIn || ''
				});
			}
		});

		const matchingUnits = [];
		let overlapCount = 0;
		let totalMatchedCredits = 0;

		completedUnitsMap.forEach((completedUnit, unitCode) => {
			const key = unitCode.toUpperCase();
			if (plannerUnitsMap.has(key)) {
				overlapCount++;
				const plannerUnit = plannerUnitsMap.get(key);
				totalMatchedCredits += completedUnit.creditPoints || 0;
				matchingUnits.push({
					id: unitCode,
					code: completedUnit.code,
					name: completedUnit.name,
					plannerCode: plannerUnit.code,
					plannerName: plannerUnit.name,
					creditPoints: completedUnit.creditPoints
				});
			}
		});

		const plannerUnitCount = plannerUnits.length;
		const MAX_UNITS_FOR_100_PERCENT = 24;
		const MAX_CREDITS_FOR_100_PERCENT = 300;
		const unitPercentage = (overlapCount / MAX_UNITS_FOR_100_PERCENT) * 100;
		const creditPercentage = (totalMatchedCredits / MAX_CREDITS_FOR_100_PERCENT) * 100;
		let matchStudentPct = Math.min(Math.max(unitPercentage, creditPercentage), 100);
		const matchPlannerPct = plannerUnitCount > 0 ? (overlapCount / plannerUnitCount) * 100 : 0;

		return {
			plannerId: planner.id,
			plannerName: planner.name,
			createdAt: planner.createdAt,
			overlapCount,
			completedCount: completedUnitsMap.size,
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

			const studentRows = [
				['Student / File Information'],
				['File', studentInfo.studentId],
				['Completed Units', studentInfo.completedUnitsCount],
				['Total Credits Earned', studentInfo.totalCredits],
				[''],
				['Completed Units List'],
				['Unit Code', 'Unit Name', 'Grade', 'Credits']
			];
			studentInfo.completedUnitsList?.forEach(unit => {
				studentRows.push([unit.code, unit.name, unit.grade, unit.creditPoints]);
			});
			XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(studentRows), 'Completed Units');

			const plannerRows = [
				['Rank', 'Planner Name', 'Planner ID', 'Created', 'Matching Units', 'Matched Credits', "% of Student's Completed", "% of Planner's Units"]
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
			XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(plannerRows), 'Top Planners');

			matchedPlanners.forEach((planner, idx) => {
				const matchingRows = [
					[`Matched Units for ${planner.plannerName}`],
					['Unit Code', 'Unit Name', 'Credits']
				];
				planner.matchingUnits.forEach(unit => {
					matchingRows.push([unit.code, unit.name, unit.creditPoints]);
				});
				XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matchingRows), `Planner_${idx + 1}_Matches`.slice(0, 31));
			});

			XLSX.writeFile(workbook, `study_planner_comparison_${fileName.replace(/\.xlsx$/i, '')}.xlsx`);
		} catch (err) {
			console.error('Export error:', err);
			alert('Failed to export Excel. Check console for details.');
		} finally {
			setExporting(false);
		}
	};

	const handleFileChange = async (e) => {
		const file = e.target.files?.[0];
		if (!file) return;

		setSearched(true);
		setFileName(file.name);
		setError(null);
		setMatchedPlanners([]);
		setCompletedUnits([]);
		setStudentInfo(null);

		try {
			setLoading(true);

			const completedUnitsList = await parseXlsxFile(file);

			if (completedUnitsList.length === 0) {
				setError('No completed units found in the uploaded file. Make sure units have a grade other than "N".');
				return;
			}

			// De-duplicate by unit code (keep first occurrence)
			const completedUnitsMap = new Map();
			completedUnitsList.forEach(unit => {
				if (!completedUnitsMap.has(unit.code.toUpperCase())) {
					completedUnitsMap.set(unit.code.toUpperCase(), unit);
				}
			});

			setCompletedUnits(Array.from(completedUnitsMap.values()));

			const totalCredits = Array.from(completedUnitsMap.values()).reduce((sum, u) => sum + (u.creditPoints || 0), 0);
			setStudentInfo({
				studentId: file.name,
				completedUnitsCount: completedUnitsMap.size,
				totalCredits,
				completedUnitsList: Array.from(completedUnitsMap.values()).map(u => ({
					code: u.code,
					name: u.name,
					grade: u.grade,
					creditPoints: u.creditPoints
				}))
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
					return b.matchStudentPct - a.matchStudentPct;
				})
				.slice(0, 5)
				.filter(planner => planner.overlapCount > 0);

			if (top5Planners.length === 0) {
				setError("No matching study planners found for the units in this file.");
			} else {
				setMatchedPlanners(top5Planners);
			}
		} catch (err) {
			console.error('Error processing file:', err);
			setError(err.message || 'Failed to process the uploaded file');
		} finally {
			setLoading(false);
			// Reset file input so the same file can be re-uploaded
			if (fileInputRef.current) fileInputRef.current.value = '';
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
										Upload a student grid XLSX file to compare completed units with available study planners
									</p>
								</div>
								{matchedPlanners.length > 0 && studentInfo && (
									<div className="flex gap-3">
										<button
											onClick={exportToExcel}
											disabled={exporting}
											className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition duration-150"
										>
											<DocumentArrowDownIcon className="h-5 w-5" />
											{exporting ? 'Exporting...' : 'Export to Excel'}
										</button>
										<div className="relative">
											<button
												onClick={() => setShowRecommendations(true)}
												disabled={studentInfo.totalCredits >= 300}
												className={`bg-[#cc2131] hover:bg-[#b01d2c] text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition duration-150 ${studentInfo.totalCredits >= 300 ? 'opacity-50 cursor-not-allowed' : ''}`}
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
									{/* File Upload */}
									<div className="card-bg p-6 rounded-theme shadow-theme mb-8">
										<label className="label-text-alt block mb-2 text-sm font-medium">
											Upload Student Transcirpt (XLSX)
										</label>
										<div
											className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-8 cursor-pointer hover:border-[#cc2131] transition-colors bg-white"
											onClick={() => fileInputRef.current?.click()}
											onDragOver={(e) => e.preventDefault()}
											onDrop={(e) => {
												e.preventDefault();
												const file = e.dataTransfer.files?.[0];
												if (file) {
													const dt = new DataTransfer();
													dt.items.add(file);
													fileInputRef.current.files = dt.files;
													handleFileChange({ target: { files: dt.files } });
												}
											}}
										>
											<ArrowUpTrayIcon className="h-10 w-10 text-gray-400 mb-3" />
											<p className="text-sm font-medium text-gray-700">
												{loading ? 'Processing...' : fileName ? `Loaded: ${fileName}` : 'Click or drag & drop an XLSX file here'}
											</p>
											<p className="text-xs text-gray-400 mt-1">
												Completed units: grade = EXM or any grade except N
											</p>
											<input
												ref={fileInputRef}
												type="file"
												accept=".xlsx"
												className="hidden"
												onChange={handleFileChange}
												disabled={loading}
											/>
										</div>
									</div>

									{error && (
										<div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6">
											<strong>Error:</strong> {error}
										</div>
									)}

									{studentInfo && (
										<div className="card-bg p-6 rounded-theme shadow-theme mb-8 bg-gradient-to-r from-red-50 to-orange-50">
											<h2 className="text-lg font-semibold heading-text mb-4 flex items-center gap-2">
												<AcademicCapIcon className="h-5 w-5" />
												File Summary
											</h2>
											<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
												<div>
													<p className="text-sm text-muted">File</p>
													<p className="font-semibold text-[#cc2131] text-base break-all">{studentInfo.studentId}</p>
												</div>
												<div>
													<p className="text-sm text-muted">Completed Units</p>
													<p className="font-semibold text-[#cc2131] text-lg">{studentInfo.completedUnitsCount}</p>
												</div>
												<div>
													<p className="text-sm text-muted">Total Credits Earned</p>
													<p className="font-semibold text-[#cc2131] text-lg">{studentInfo.totalCredits}</p>
												</div>
											</div>
											<details className="mt-4 border-t border-gray-200 pt-3">
												<summary className="text-sm font-semibold text-gray-700 cursor-pointer hover:text-[#cc2131]">
													View Completed Units ({completedUnits.length} unit(s))
												</summary>
												<div className="flex flex-wrap gap-2 mt-3 max-h-64 overflow-y-auto p-2 bg-white rounded-md">
													{completedUnits.map(unit => (
														<div key={unit.code} className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-800 border border-red-200">
															{unit.code} – {unit.name}
															{unit.grade && <span className="ml-1 opacity-70">({unit.grade})</span>}
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
																		<span className="text-2xl font-bold text-[#cc2131]">#{index + 1}</span>
																		<h3 className="text-xl font-bold heading-text">{planner.plannerName}</h3>
																	</div>
																	<p className="text-sm text-muted">
																		Planner ID: {planner.plannerId} | Created: {new Date(planner.createdAt).toLocaleDateString()}
																	</p>
																</div>
															</div>
															<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
																<div className="border border-red-500 rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
																	<p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Matching Units</p>
																	<p className="text-2xl font-bold text-gray-800">{planner.overlapCount} / {planner.completedCount}</p>
																</div>
																<div className="border border-red-500 rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
																	<p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Matched Credits</p>
																	<p className="text-2xl font-bold text-gray-800">{planner.totalMatchedCredits}</p>
																</div>
																<div className="border border-red-500 rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
																	<p className="text-xs text-gray-500 uppercase tracking-wide mb-1">% of Student's Completed</p>
																	<p className="text-2xl font-bold text-gray-800">{planner.matchStudentPct.toFixed(1)}%</p>
																	<div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
																		<div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${Math.min(planner.matchStudentPct, 100)}%` }}></div>
																	</div>
																</div>
																<div className="border border-red-500 rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
																	<p className="text-xs text-gray-500 uppercase tracking-wide mb-1">% of Planner's Units</p>
																	<p className="text-2xl font-bold text-gray-800">{planner.matchPlannerPct.toFixed(1)}%</p>
																	<div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
																		<div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${Math.min(planner.matchPlannerPct, 100)}%` }}></div>
																	</div>
																</div>
															</div>
														</div>
														<div className="p-6">
															<h4 className="font-semibold text-sm text-gray-700 mb-3 flex items-center gap-2">
																<CheckCircleIcon className="h-4 w-4 text-red-600" />
																Matched Units ({planner.matchingUnits.length})
															</h4>
															{planner.matchingUnits.length > 0 ? (
																<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
																	{planner.matchingUnits.map((unit, idx) => (
																		<div key={idx} className="bg-white border border-red-500 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow">
																			<p className="font-mono text-sm font-semibold text-gray-800">{unit.code}</p>
																			{unit.name && <p className="text-xs text-gray-600 mt-1">{unit.name}</p>}
																			<p className="text-xs text-gray-500 mt-1">{unit.creditPoints} credits</p>
																		</div>
																	))}
																</div>
															) : (
																<p className="text-sm text-gray-500">No matching units found</p>
															)}
														</div>
													</div>
												))}
											</div>
										)
									)}
								</div>
							</div>

							{!searched && !studentInfo && !error && (
								<div className="card-bg p-12 rounded-theme shadow-theme text-center mt-6">
									<ArrowUpTrayIcon className="h-16 w-16 text-muted mx-auto mb-4 opacity-50" />
									<p className="text-muted text-lg">Upload a Student Transcript to compare completed units with available study planners</p>
								</div>
							)}
						</div>
					</div>

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