'use client';
import { useState } from 'react';
import { ConditionalRequireAuth } from '@components/helper';
import { useRole } from '@app/context/RoleContext';
import AccessDenied from '@components/AccessDenied';
import PageLoadingWrapper from '@components/PageLoadingWrapper';
import SecureFrontendAuthHelper from '@utils/auth/FrontendAuthHelper';
import { 
  MagnifyingGlassIcon, 
  CheckCircleIcon, 
  AcademicCapIcon, 
  ChartBarIcon, 
  DocumentArrowDownIcon,
  BookOpenIcon,
  ClockIcon,
  TrophyIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SparklesIcon,
  CreditCardIcon,
  LightBulbIcon
} from '@heroicons/react/24/outline';
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
	const [expandedPlanners, setExpandedPlanners] = useState({});
	const [hoveredPlanner, setHoveredPlanner] = useState(null);
	
	// State for Unit Recommendations Modal
	const [showUnitRecommendations, setShowUnitRecommendations] = useState(false);
	const [selectedPlanner, setSelectedPlanner] = useState(null);

	// Check if user has permission to access this page
	const hasAccess = isSuperadmin() || can('planner', 'read');

	// Toggle expanded view for planner units
	const toggleExpanded = (plannerId) => {
		setExpandedPlanners(prev => ({
			...prev,
			[plannerId]: !prev[plannerId]
		}));
	};

	// Open recommendations modal for a planner
	const openUnitRecommendations = (planner) => {
		setSelectedPlanner(planner);
		setShowUnitRecommendations(true);
	};

	// Close recommendations modal
	const closeUnitRecommendations = () => {
		setShowUnitRecommendations(false);
		setSelectedPlanner(null);
	};

	// Fetch student's completed units from UnitHistory
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
					creditPoints: unit.Unit?.CreditPoints || 0
				}));

			return passedUnits;
		} catch (err) {
			console.error('Error fetching student completed units:', err);
			throw err;
		}
	};

	// Fetch student enrollment information (Year, Semester, Course, Major)
	const fetchStudentEnrollment = async (studentId) => {
		try {
			const response = await SecureFrontendAuthHelper.authenticatedFetch(
				`${process.env.NEXT_PUBLIC_SERVER_URL}/api/students/${studentId}/enrollment`
			);
			
			if (!response.ok) {
				// If endpoint doesn't exist, return default values
				console.warn('Enrollment API not available, using defaults');
				return null;
			}
			
			const result = await response.json();
			if (result.success) {
				return result.data;
			}
			return null;
		} catch (err) {
			console.error('Error fetching student enrollment:', err);
			return null;
		}
	};

	// Calculate year and semester based on completed credits (fallback method)
	const calculateYearAndSemester = (totalCredits, completedUnitsList) => {
		// Calculate year based on credits (100 CP per year approx)
		let currentYear = 1;
		let currentSemester = 1;
		
		if (totalCredits >= 200) {
			currentYear = 3;
		} else if (totalCredits >= 100) {
			currentYear = 2;
		} else {
			currentYear = 1;
		}
		
		// Check for milestone units to determine semester
		const hasCOS20007 = completedUnitsList.some(u => u.code === 'COS20007');
		const hasCOS30019 = completedUnitsList.some(u => u.code === 'COS30019');
		const hasCOS40005 = completedUnitsList.some(u => u.code === 'COS40005');
		
		if (hasCOS40005) {
			currentSemester = 1;
		} else if (hasCOS30019 || hasCOS20007) {
			currentSemester = 2;
		}
		
		return { currentYear, currentSemester };
	};

	// Fetch all study planners
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

	// Compare student's completed units with a study planner
	const compareWithPlanner = (completedUnitsMap, planner) => {
		const plannerUnits = planner.units || [];
		
		const plannerUnitsMap = new Map();
		plannerUnits.forEach(unit => {
			plannerUnitsMap.set(unit.ID, {
				id: unit.ID,
				code: unit.UnitCode,
				name: unit.Name
			});
		});

		const matchingUnits = [];
		let overlapCount = 0;

		completedUnitsMap.forEach((completedUnit, unitId) => {
			if (plannerUnitsMap.has(unitId)) {
				overlapCount++;
				matchingUnits.push({
					id: unitId,
					code: completedUnit.code,
					name: completedUnit.name,
					plannerCode: plannerUnitsMap.get(unitId).code,
					plannerName: plannerUnitsMap.get(unitId).name,
					creditPoints: completedUnit.creditPoints
				});
			}
		});

		const completedCount = completedUnitsMap.size;
		const plannerUnitCount = plannerUnits.length;
		
		const matchStudentPct = completedCount > 0 ? (overlapCount / completedCount) * 100 : 0;
		const matchPlannerPct = plannerUnitCount > 0 ? (overlapCount / plannerUnitCount) * 100 : 0;
		const totalMatchedCredits = matchingUnits.reduce((sum, unit) => sum + (unit.creditPoints || 0), 0);
		const remainingUnits = plannerUnitCount - overlapCount;

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
			totalMatchedCredits,
			remainingUnits
		};
	};

	// Get rank badge color and icon
	const getRankStyle = (index) => {
		switch(index) {
			case 0: return { bg: 'bg-gradient-to-r from-yellow-400 to-yellow-500', text: 'text-yellow-900', icon: '🥇', border: 'border-yellow-400' };
			case 1: return { bg: 'bg-gradient-to-r from-gray-300 to-gray-400', text: 'text-gray-900', icon: '🥈', border: 'border-gray-400' };
			case 2: return { bg: 'bg-gradient-to-r from-amber-600 to-amber-700', text: 'text-amber-100', icon: '🥉', border: 'border-amber-600' };
			default: return { bg: 'bg-gradient-to-r from-blue-500 to-blue-600', text: 'text-white', icon: `#${index + 1}`, border: 'border-blue-500' };
		}
	};

	// Export to Excel function
	const exportToExcel = () => {
		try {
			setExporting(true);
			
			const workbook = XLSX.utils.book_new();
			
			// 1. Student Information Sheet
			const studentInfoData = [
				['Student Information'],
				['Student ID', studentInfo?.studentId || ''],
				['Current Year', studentInfo?.currentYear || ''],
				['Current Semester', studentInfo?.currentSemester || ''],
				['Course', studentInfo?.courseName || ''],
				['Major', studentInfo?.majorName || ''],
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
			
			// 2. Summary Sheet
			const summaryData = [
				['Study Planner Comparison Summary'],
				['Student ID:', studentInfo?.studentId || ''],
				['Generated:', new Date().toLocaleString()],
				[],
				['Rank', 'Planner Name', 'Planner ID', 'Matching Units', 'Total Student Units', 'Total Planner Units', 
				 '% of Student\'s Completed', '% of Planner\'s Units', 'Matched Credits', 'Remaining Units', 'Created Date']
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
					planner.remainingUnits,
					new Date(planner.createdAt).toLocaleDateString()
				]);
			});
			
			const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
			XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
			
			// 3. Detailed Matching Units for each planner
			matchedPlanners.forEach((planner, index) => {
				const detailData = [
					[`Planner #${index + 1}: ${planner.plannerName}`],
					[`Planner ID: ${planner.plannerId}`],
					[`Match Percentage: ${planner.matchStudentPct.toFixed(1)}% of student's completed units`],
					[`Total Matched Credits: ${planner.totalMatchedCredits}`],
					[`Remaining Units: ${planner.remainingUnits}`],
					[],
					['Matched Units', 'Unit Name', 'Credit Points', 'Status']
				];
				
				planner.matchingUnits.forEach(unit => {
					detailData.push([
						unit.code,
						unit.name || '',
						unit.creditPoints || 0,
						'✓ Matched'
					]);
				});
				
				detailData.push([], ['All Units in This Planner'], ['Unit Code', 'Unit Name', 'In Student\'s Completed']);
				planner.totalUnits.forEach(unit => {
					const isMatched = planner.matchingUnits.some(mu => mu.id === unit.ID);
					detailData.push([
						unit.UnitCode,
						unit.Name || '',
						isMatched ? 'Yes ✓' : 'No'
					]);
				});
				
				const detailSheet = XLSX.utils.aoa_to_sheet(detailData);
				let sheetName = `Planner_${index + 1}_${planner.plannerName}`.substring(0, 31);
				sheetName = sheetName.replace(/[\\/*?:[\]]/g, '');
				XLSX.utils.book_append_sheet(workbook, detailSheet, sheetName);
			});
			
			// 4. Comparison Matrix Sheet
			const matrixData = [
				['Comparison Matrix - All Units'],
				['Unit Code', 'Student Completed', ...matchedPlanners.map(p => `${p.plannerName} (ID: ${p.plannerId})`)],
			];
			
			const allUnitsMap = new Map();
			matchedPlanners.forEach(planner => {
				planner.totalUnits.forEach(unit => {
					if (!allUnitsMap.has(unit.ID)) {
						allUnitsMap.set(unit.ID, {
							code: unit.UnitCode,
							name: unit.Name
						});
					}
				});
			});
			
			studentInfo?.completedUnitsList?.forEach(unit => {
				if (!allUnitsMap.has(unit.id)) {
					allUnitsMap.set(unit.id, {
						code: unit.code,
						name: unit.name
					});
				}
			});
			
			Array.from(allUnitsMap.entries()).forEach(([unitId, unitInfo]) => {
				const row = [
					unitInfo.code,
					studentInfo?.completedUnitsList?.some(u => u.id === unitId) ? 'Yes' : 'No'
				];
				
				matchedPlanners.forEach(planner => {
					const hasUnit = planner.totalUnits.some(u => u.ID === unitId);
					row.push(hasUnit ? 'Yes' : 'No');
				});
				
				matrixData.push(row);
			});
			
			const matrixSheet = XLSX.utils.aoa_to_sheet(matrixData);
			XLSX.utils.book_append_sheet(workbook, matrixSheet, 'Comparison Matrix');
			
			// 5. Statistics Sheet
			const statsData = [
				['Statistics Summary'],
				['Metric', 'Value'],
				['Total Students Analyzed', '1'],
				['Total Planners Compared', matchedPlanners.length],
				['Average Match Percentage', `${(matchedPlanners.reduce((sum, p) => sum + p.matchStudentPct, 0) / matchedPlanners.length).toFixed(1)}%`],
				['Highest Match Percentage', `${Math.max(...matchedPlanners.map(p => p.matchStudentPct)).toFixed(1)}%`],
				['Total Matched Units Across All Planners', matchedPlanners.reduce((sum, p) => sum + p.overlapCount, 0)],
				['Total Matched Credits', matchedPlanners.reduce((sum, p) => sum + p.totalMatchedCredits, 0)],
				[],
				['Recommendations'],
				['Top Recommendation', matchedPlanners[0]?.plannerName || 'N/A'],
				['Recommended Next Steps', `Student has completed ${matchedPlanners[0]?.overlapCount || 0} out of ${matchedPlanners[0]?.plannerUnitCount || 0} units in the top planner.`],
				['Remaining Units to Graduate', matchedPlanners[0]?.remainingUnits || 'N/A']
			];
			
			const statsSheet = XLSX.utils.aoa_to_sheet(statsData);
			XLSX.utils.book_append_sheet(workbook, statsSheet, 'Statistics');
			
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

			// Fetch student's completed units
			const completedUnitsList = await fetchStudentCompletedUnits(studentId.trim());
			
			if (completedUnitsList.length === 0) {
				setError(`No completed units (status: 'pass') found for student ID "${studentId}". Please check if the student has any passed units.`);
				setStudentInfo(null);
				return;
			}

			// Create a map of completed units
			const completedUnitsMap = new Map();
			completedUnitsList.forEach(unit => {
				completedUnitsMap.set(unit.id, {
					id: unit.id,
					code: unit.code,
					name: unit.name,
					year: unit.year,
					termId: unit.termId,
					creditPoints: unit.creditPoints
				});
			});

			setCompletedUnits(Array.from(completedUnitsMap.values()));
			
			const totalCredits = completedUnitsList.reduce((sum, unit) => sum + (unit.creditPoints || 0), 0);
			
			// Fetch student enrollment information
			let enrollmentData = await fetchStudentEnrollment(studentId.trim());
			let currentYear = 1;
			let currentSemester = 1;
			let courseName = '';
			let majorName = '';
			
			if (enrollmentData) {
				currentYear = enrollmentData.currentYear || 1;
				currentSemester = enrollmentData.currentSemester || 1;
				courseName = enrollmentData.courseName || '';
				majorName = enrollmentData.majorName || '';
			} else {
				// Fallback: Calculate based on completed credits
				const calculated = calculateYearAndSemester(totalCredits, completedUnitsList);
				currentYear = calculated.currentYear;
				currentSemester = calculated.currentSemester;
			}
			
			// Set student info with all available data
			setStudentInfo({
				studentId: studentId.trim(),
				completedUnitsCount: completedUnitsMap.size,
				completedUnitsList: Array.from(completedUnitsMap.values()),
				totalCredits: totalCredits,
				currentYear: currentYear,
				currentSemester: currentSemester,
				courseName: courseName,
				majorName: majorName,
				enrollmentYear: enrollmentData?.enrollmentYear || null
			});

			// Fetch all study planners
			const allPlanners = await fetchAllStudyPlanners();
			
			if (allPlanners.length === 0) {
				setError('No study planners found in the system');
				return;
			}

			// Compare student with each planner
			const comparisons = allPlanners.map(planner => 
				compareWithPlanner(completedUnitsMap, planner)
			);

			const top5Planners = comparisons
				.sort((a, b) => {
					if (b.overlapCount !== a.overlapCount) return b.overlapCount - a.overlapCount;
					if (b.matchStudentPct !== a.matchStudentPct) return b.matchStudentPct - a.matchStudentPct;
					return b.matchPlannerPct - a.matchPlannerPct;
				})
				.slice(0, 5)
				.filter(planner => planner.overlapCount > 0);

			if (top5Planners.length === 0) {
				setError('No matching study planners found for this student\'s completed units');
			}

			setMatchedPlanners(top5Planners);

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

	return (
		<>
			<ConditionalRequireAuth>
				{!hasReadPermission ? (
					<AccessDenied requiredPermission="planner:read or system:superadmin" resourceName="study planner comparison" />
				) : (
					<PageLoadingWrapper
						requiredPermission={{ resource: 'dashboard', action: 'access' }}
						resourceName="study planner comparison"
						isLoading={false}
					>
						<div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
							<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
								
								{/* Header Section with Gradient */}
								<div className="mb-8">
									<div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl shadow-xl p-6 text-white">
										<div className="flex justify-between items-center flex-wrap gap-4">
											<div>
												<div className="flex items-center gap-3 mb-2">
													<div className="bg-white/20 p-2 rounded-xl">
														<AcademicCapIcon className="h-8 w-8" />
													</div>
													<h1 className="text-3xl font-bold">Study Planner Comparison</h1>
												</div>
												<p className="text-blue-100">
													Compare student's completed units with available study planners to find the best academic path
												</p>
											</div>
											{matchedPlanners.length > 0 && studentInfo && (
												<button
													onClick={exportToExcel}
													disabled={exporting}
													className="bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white font-semibold py-2 px-4 rounded-xl flex items-center gap-2 transition-all duration-200 hover:scale-105"
												>
													<DocumentArrowDownIcon className="h-5 w-5" />
													{exporting ? 'Exporting...' : 'Export Report'}
												</button>
											)}
										</div>
									</div>
								</div>

								{/* Search Card */}
								<div className="bg-white rounded-2xl shadow-lg p-6 mb-8 border border-gray-100">
									<form onSubmit={handleSearch}>
										<div className="flex flex-col md:flex-row gap-4">
											<div className="flex-1">
												<label className="block text-sm font-semibold text-gray-700 mb-2">
													Student ID
												</label>
												<div className="relative">
													<MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
													<input
														type="text"
														value={studentId}
														onChange={(e) => setStudentId(e.target.value)}
														placeholder="Enter student ID..."
														className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
													/>
												</div>
											</div>
											<div className="flex items-end">
												<button
													type="submit"
													disabled={loading}
													className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-semibold py-3 px-8 rounded-xl transition-all duration-200 flex items-center gap-2 shadow-md hover:shadow-lg"
												>
													{loading ? (
														<ArrowPathIcon className="h-5 w-5 animate-spin" />
													) : (
														<MagnifyingGlassIcon className="h-5 w-5" />
													)}
													{loading ? 'Searching...' : 'Search'}
												</button>
											</div>
										</div>
									</form>
								</div>

								{/* Error Message */}
								{error && (
									<div className="bg-red-50 border-l-4 border-red-500 rounded-lg p-4 mb-6">
										<div className="flex items-center gap-3">
											<div className="flex-shrink-0">
												<svg className="h-5 w-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
													<path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
												</svg>
											</div>
											<div>
												<h3 className="text-sm font-semibold text-red-800">Error</h3>
												<p className="text-sm text-red-700">{error}</p>
											</div>
										</div>
									</div>
								)}

								{/* Student Information Card - Updated with Year/Semester/Course/Major */}
								{studentInfo && (
									<div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl shadow-lg p-6 mb-8 border border-blue-100">
										<div className="flex items-center gap-3 mb-4">
											<div className="bg-blue-500 p-2 rounded-xl">
												<AcademicCapIcon className="h-6 w-6 text-white" />
											</div>
											<h2 className="text-xl font-bold text-gray-800">Student Overview</h2>
										</div>
										
										<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
											<div className="bg-white rounded-xl p-3 shadow-sm">
												<p className="text-xs text-gray-500 uppercase tracking-wide">Student ID</p>
												<p className="text-lg font-bold text-gray-800">{studentInfo.studentId}</p>
											</div>
											<div className="bg-white rounded-xl p-3 shadow-sm">
												<p className="text-xs text-gray-500 uppercase tracking-wide">Current Year</p>
												<p className="text-lg font-bold text-blue-600">Year {studentInfo.currentYear || '?'}</p>
											</div>
											<div className="bg-white rounded-xl p-3 shadow-sm">
												<p className="text-xs text-gray-500 uppercase tracking-wide">Current Semester</p>
												<p className="text-lg font-bold text-blue-600">Semester {studentInfo.currentSemester || '?'}</p>
											</div>
											<div className="bg-white rounded-xl p-3 shadow-sm">
												<p className="text-xs text-gray-500 uppercase tracking-wide">Completed Units</p>
												<p className="text-lg font-bold text-green-600">{studentInfo.completedUnitsCount}</p>
											</div>
										</div>
										
										<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
											<div className="bg-white rounded-xl p-3 shadow-sm">
												<p className="text-xs text-gray-500 uppercase tracking-wide">Course</p>
												<p className="font-semibold text-gray-800">{studentInfo.courseName || 'Not specified'}</p>
											</div>
											<div className="bg-white rounded-xl p-3 shadow-sm">
												<p className="text-xs text-gray-500 uppercase tracking-wide">Major / Specialization</p>
												<p className="font-semibold text-gray-800">{studentInfo.majorName || 'Not specified'}</p>
											</div>
										</div>
										
										<div className="bg-white rounded-xl p-4">
											<p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
												<CheckCircleIcon className="h-4 w-4 text-green-600" />
												Completed Units ({studentInfo.completedUnitsCount})
											</p>
											<div className="flex flex-wrap gap-2">
												{studentInfo.completedUnitsList.map((unit) => (
													<span
														key={unit.id}
														className="bg-green-100 text-green-800 text-sm font-medium px-3 py-1.5 rounded-full hover:bg-green-200 transition-colors cursor-help"
														title={`${unit.name || ''} (${unit.creditPoints} credits)`}
													>
														{unit.code}
													</span>
												))}
											</div>
										</div>
									</div>
								)}

								{/* Results Section */}
								{searched && !error && matchedPlanners.length === 0 && studentInfo ? (
									<div className="bg-white rounded-2xl shadow-lg p-12 text-center">
										<ChartBarIcon className="h-20 w-20 text-gray-300 mx-auto mb-4" />
										<p className="text-gray-500 text-lg font-medium">No matching study planners found</p>
										<p className="text-gray-400 text-sm mt-2">Try checking another student or create a new study planner.</p>
									</div>
								) : (
									matchedPlanners.length > 0 && (
										<div className="space-y-6">
											<div className="flex items-center justify-between mb-4">
												<div className="flex items-center gap-3">
													<div className="bg-gradient-to-r from-green-500 to-emerald-500 p-2 rounded-xl">
														<TrophyIcon className="h-6 w-6 text-white" />
													</div>
													<h2 className="text-2xl font-bold text-gray-800">
														Top {matchedPlanners.length} Matching Study Planners
													</h2>
												</div>
												<div className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
													Sorted by most matches
												</div>
											</div>
											
											{matchedPlanners.map((planner, index) => {
												const rankStyle = getRankStyle(index);
												const isExpanded = expandedPlanners[planner.plannerId];
												
												return (
													<div 
														key={planner.plannerId} 
														className={`bg-white rounded-2xl shadow-lg overflow-hidden transition-all duration-300 hover:shadow-xl border-l-4 ${rankStyle.border}`}
														onMouseEnter={() => setHoveredPlanner(planner.plannerId)}
														onMouseLeave={() => setHoveredPlanner(null)}
													>
														{/* Planner Header */}
														<div className={`p-6 ${rankStyle.bg} text-white`}>
															<div className="flex items-start justify-between flex-wrap gap-4">
																<div className="flex-1">
																	<div className="flex items-center gap-3 mb-2">
																		<span className="text-3xl font-bold drop-shadow-lg">
																			{rankStyle.icon}
																		</span>
																		<h3 className="text-2xl font-bold">
																			{planner.plannerName}
																		</h3>
																	</div>
																	<p className="text-white/80 text-sm">
																		ID: {planner.plannerId} | Created: {new Date(planner.createdAt).toLocaleDateString()}
																	</p>
																</div>
																<div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-2 text-center">
																	<p className="text-xs font-semibold">Completion</p>
																	<p className="text-2xl font-bold">{planner.matchPlannerPct.toFixed(1)}%</p>
																</div>
															</div>
														</div>

														{/* Statistics Grid */}
														<div className="p-6 border-b border-gray-100">
															<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
																<div className="text-center p-3 bg-blue-50 rounded-xl">
																	<p className="text-xs text-gray-500 mb-1">Matched Units</p>
																	<p className="text-2xl font-bold text-blue-600">
																		{planner.overlapCount}
																	</p>
																	<p className="text-xs text-gray-500">of {planner.completedCount}</p>
																</div>
																<div className="text-center p-3 bg-indigo-50 rounded-xl">
																	<p className="text-xs text-gray-500 mb-1">Matched Credits</p>
																	<p className="text-2xl font-bold text-indigo-600">
																		{planner.totalMatchedCredits}
																	</p>
																	<p className="text-xs text-gray-500">total points</p>
																</div>
																<div className="text-center p-3 bg-green-50 rounded-xl">
																	<p className="text-xs text-gray-500 mb-1">Remaining Units</p>
																	<p className="text-2xl font-bold text-green-600">
																		{planner.remainingUnits}
																	</p>
																	<p className="text-xs text-gray-500">to graduate</p>
																</div>
																<div className="text-center p-3 bg-purple-50 rounded-xl">
																	<p className="text-xs text-gray-500 mb-1">Student Match</p>
																	<p className="text-2xl font-bold text-purple-600">
																		{planner.matchStudentPct.toFixed(0)}%
																	</p>
																	<p className="text-xs text-gray-500">of completed units</p>
																</div>
															</div>
															
															{/* Progress Bars */}
															<div className="mt-4 space-y-3">
																<div>
																	<div className="flex justify-between text-sm mb-1">
																		<span className="text-gray-600">Progress toward this planner</span>
																		<span className="font-semibold text-purple-600">{planner.matchPlannerPct.toFixed(1)}%</span>
																	</div>
																	<div className="w-full bg-gray-200 rounded-full h-2.5">
																		<div 
																			className="bg-purple-600 h-2.5 rounded-full transition-all duration-500"
																			style={{ width: `${planner.matchPlannerPct}%` }}
																		></div>
																	</div>
																</div>
															</div>
														</div>

														{/* Matched Units Section */}
														<div className="p-6 border-b border-gray-100">
															<div className="flex items-center justify-between mb-4">
																<h4 className="font-semibold text-gray-800 flex items-center gap-2">
																	<CheckCircleIcon className="h-5 w-5 text-green-600" />
																	Matched Units ({planner.matchingUnits.length})
																</h4>
																<div className="flex gap-2">
																	<button
																		onClick={() => openUnitRecommendations(planner)}
																		className="bg-purple-100 hover:bg-purple-200 text-purple-700 text-sm font-medium px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
																	>
																		<LightBulbIcon className="h-4 w-4" />
																		Get Recommendations
																	</button>
																	<button
																		onClick={() => toggleExpanded(planner.plannerId)}
																		className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
																	>
																		{isExpanded ? (
																			<>Show Less <ChevronUpIcon className="h-4 w-4" /></>
																		) : (
																			<>View All Units <ChevronDownIcon className="h-4 w-4" /></>
																		)}
																	</button>
																</div>
															</div>
															
															{planner.matchingUnits.length > 0 ? (
																<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
																	{planner.matchingUnits.map((unit, idx) => (
																		<div key={idx} className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-3 hover:shadow-md transition-all hover:scale-[1.02]">
																			<div className="flex items-start justify-between">
																				<div className="flex-1">
																					<p className="font-mono text-sm font-bold text-green-800">
																						{unit.code}
																					</p>
																					{unit.name && (
																						<p className="text-xs text-green-700 mt-1 line-clamp-2">
																							{unit.name}
																						</p>
																					)}
																					{unit.creditPoints > 0 && (
																						<p className="text-xs text-green-600 mt-1 flex items-center gap-1">
																							<CreditCardIcon className="h-3 w-3" />
																							{unit.creditPoints} credits
																						</p>
																					)}
																				</div>
																				<CheckCircleIcon className="h-5 w-5 text-green-600 flex-shrink-0" />
																			</div>
																		</div>
																	))}
																</div>
															) : (
																<p className="text-gray-500 text-center py-4">No matching units found</p>
															)}
														</div>

														{/* All Planner Units (Expandable) */}
														{isExpanded && (
															<div className="p-6 bg-gray-50 border-t border-gray-100">
																<h5 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
																	<BookOpenIcon className="h-4 w-4" />
																	All Units in This Planner ({planner.totalUnits.length} total)
																</h5>
																<div className="flex flex-wrap gap-2">
																	{planner.totalUnits.map((unit) => {
																		const isMatched = planner.matchingUnits.some(mu => mu.id === unit.ID);
																		return (
																			<span
																				key={unit.ID}
																				className={`text-sm font-medium px-3 py-1.5 rounded-full transition-all ${
																					isMatched
																						? 'bg-green-100 text-green-800 border border-green-300 hover:bg-green-200'
																						: 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
																				}`}
																			>
																				{unit.UnitCode}
																				{isMatched && ' ✓'}
																			</span>
																		);
																	})}
																</div>
															</div>
														)}
													</div>
												);
											})}
										</div>
									)
								)}

								{/* Empty State */}
								{!searched && !studentInfo && !error && (
									<div className="bg-white rounded-2xl shadow-lg p-12 text-center">
										<div className="max-w-md mx-auto">
											<div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-full p-6 w-32 h-32 mx-auto mb-6 flex items-center justify-center">
												<MagnifyingGlassIcon className="h-16 w-16 text-blue-500" />
											</div>
											<p className="text-gray-600 text-lg font-medium">Find the Best Academic Path</p>
											<p className="text-gray-400 text-sm mt-2">
												Enter a student ID to analyze completed units and discover matching study planners
											</p>
										</div>
									</div>
								)}
							</div>
						</div>
					</PageLoadingWrapper>
				)}
			</ConditionalRequireAuth>
			
			{/* Unit Recommendations Modal */}
			<UnitRecommendations
				isOpen={showUnitRecommendations}
				onClose={closeUnitRecommendations}
				planner={selectedPlanner}
				completedUnits={completedUnits}
				studentInfo={studentInfo}
			/>
		</>
	);
}