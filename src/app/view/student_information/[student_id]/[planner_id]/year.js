'use client'

import Semester from './semester';
import React, { useState } from 'react'
import InfoTooltip from '@components/InfoTooltip';

const Year = ({ year, studentStudyPlanner, updateStudentStudyPlanner, setStudentStudyPlanner, unitTypes, handleRemoveYear, isReadOnly, isDarkMode }) => {
	const [isYearExpanded, setIsYearExpanded] = useState(true);
	const [expandedSemesters, setExpandedSemesters] = useState({});

	// Initialize expanded state for each semester
	React.useEffect(() => {
		if (year.semesters.length > 0) {
			const initialState = {};
			year.semesters.forEach((_, index) => {
				initialState[index] = true;
			});
			setExpandedSemesters(initialState);
		}
	}, [year.semesters.length]);

	// Toggle a specific semester's expanded state
	const toggleSemesterExpanded = (semIndex) => {
		setExpandedSemesters(prev => ({
			...prev,
			[semIndex]: !prev[semIndex]
		}));
	};

	// Helper function to check if all units in a semester have "pass" status
	const allUnitsCompleted = (semester) => {
		// console.log("Checking all units completed for semester:", semester);
		if (!semester || !semester.units || semester.units.length === 0) {
			return false;
		}
		return semester.units.every(unit => unit.status === "pass" || unit.status === "fail");
	};

	// Helper function to calculate the semester number based on year and index
	const calculateSemesterNumber = (yearNum, semIndex) => {
		// Each year has 2 semesters, so year 1 has semester 1-2, year 2 has 3-4, etc.
		return (yearNum - 1) * 2 + semIndex + 1;
	};

	// Helper function to update conflicts after making changes
	const updateConflictsState = (updatedPlanner) => {
		// Get conflicts from the updated planner
		const conflicts = updatedPlanner.GetAllConflicts();

		// Return the updated planner with conflicts for state update
		return updatedPlanner;
	};

	// Helper function to check if semester has any conflicts
	const hasSemesterConflicts = (semester) => {
		return semester.units.some(unit => unit.has_conflict || unit.is_offered === false);
	};

	// Helper function to check if year has any conflicts (for use in this component)
	const hasYearConflicts = () => {
		return year.semesters.some(semester => hasSemesterConflicts(semester) && !allUnitsCompleted(semester));
	};

	// Helper function to check if the next semester is completed
	const hasNextSemesterCompleted = () => {
		// If we have more semesters in this year, check if any of them are completed
		const lastSemesterIndex = year.semesters.length - 1;
		if (lastSemesterIndex >= 0 && lastSemesterIndex < year.semesters.length - 1) {
			// Check next semester in the same year
			for (let i = lastSemesterIndex + 1; i < year.semesters.length; i++) {
				if (year.semesters[i] && year.semesters[i].complete) {
					return true;
				}
			}
		}

		// If we're at the last semester of the current year, check the first semester of the next year
		if (lastSemesterIndex == year.semesters.length - 1) {
			const nextYear = studentStudyPlanner.StudyPlanner.GetYearByIndex(year.year - 1);
			if (nextYear && nextYear.semesters && nextYear.semesters.length > 0 && nextYear.semesters[0]) {
				if (nextYear.semesters[0].sem_completed) {
					return true;
				}
			}
		}

		return false;
	};

	const handleAddSemester = async (type) => {
		try {
			const semType = type === 'long' ? 'Long Semester' : 'Short Semester';
			let updatedPlanner;
			// Get the last semester of the current year
			const lastSemester = year.semesters[year.semesters.length - 1];

			// Check if we should use current date
			const useCurrentDate = !lastSemester ||
				(lastSemester && allUnitsCompleted(lastSemester));

			// Create the sem_obj with appropriate values
			let sem_obj;

			if (useCurrentDate) {
				// Use current date for a new semester or after completed semester
				const currentDate = new Date();
				const currentMonth = currentDate.getMonth() + 1; // JavaScript months are 0-indexed
				const currentYear = currentDate.getFullYear();

				// Determine intake month and term based on current date
				let intakeMonth, semTerm;
				if (semType.toLowerCase() === 'long semester') {
					// For long semesters
					if (currentMonth >= 11 || currentMonth <= 4) {
						intakeMonth = "Feb/Mar";
						semTerm = "Semester 1";
					} else {
						intakeMonth = "Aug/Sept";
						semTerm = "Semester 2";
					}

					// Adjust year if needed
					let intakeYear = currentYear;
					const nextSemNameAndIntake = getNextSemesterName(type);
					let semNameMatch = nextSemNameAndIntake.match(/^(.+?) \((.*?) (\d{4})\)$/);

					let sem_name = nextSemNameAndIntake;

					if (semNameMatch) {
						sem_name = semNameMatch[1];
						intakeMonth = semNameMatch[2];
						intakeYear = parseInt(semNameMatch[3]);
					}
					sem_obj = {
						sem_name,
						sem_term: semTerm,
						sem_type: semType,
						intake: {
							month: intakeMonth,
							year: intakeYear
						}
					};
				} else {
					// For short semesters
					if (currentMonth >= 9 || currentMonth <= 3) {
						intakeMonth = "Jan";
						semTerm = "Summer";
					} else {
						intakeMonth = "Jul";
						semTerm = "Winter";
					}

					// Adjust year if needed
					const intakeYear = (currentMonth >= 9) ? currentYear + 1 : currentYear;

					const nextSemNameAndIntake = getNextSemesterName(type);
					let semNameMatch = nextSemNameAndIntake.match(/^(.+?) \((.*?) (\d{4})\)$/);

					let sem_name = nextSemNameAndIntake;

					if (semNameMatch) {
						sem_name = semNameMatch[1];
						intakeMonth = semNameMatch[2];
					}

					sem_obj = {
						sem_name,
						sem_term: semTerm,
						sem_type: semType,
						intake: {
							month: intakeMonth,
							year: intakeYear
						}
					};
				}

				updatedPlanner = studentStudyPlanner.StudyPlanner.AddNewSemester(
					year.year,
					semType,
					sem_obj,
					false,
					false // Set master_mode to false
				);
			} else {
				updatedPlanner = studentStudyPlanner.StudyPlanner.AddNewSemester(
					year.year,
					semType,
					null,
					false,
					false
				);
			}

			// Update conflicts state after adding semester
			const updatedPlannerWithConflicts = updateConflictsState(updatedPlanner);

			setStudentStudyPlanner(prev =>
				updateStudentStudyPlanner(prev, () => updatedPlannerWithConflicts)
			);
		} catch (error) {
			console.error('Failed to add semester:', error);
		}
	};

	const handleRemoveSemester = async (semIndex) => {
		try {
			const semester = year.semesters[semIndex];

			if (allUnitsCompleted(semester)) {
				alert("Cannot remove a semester with all completed units.");
				return;
			}
			const isLastSemester = year.semesters.length === 1;
			if (isLastSemester) {
				studentStudyPlanner.RemoveYearUnitAmendments(year.year);
			}

			const updatedPlanner = await studentStudyPlanner.StudyPlanner.RemoveSemester(year.year, semIndex, false);

			// Record amendments for removing this semester's units
			studentStudyPlanner.RemoveSemesterUnitAmendments(semester, year.year, semIndex);

			// Update conflicts state after removing semester
			const updatedPlannerWithConflicts = updateConflictsState(updatedPlanner);

			setStudentStudyPlanner(prev =>
				updateStudentStudyPlanner(prev, () => updatedPlannerWithConflicts)
			);
		} catch (error) {
			console.error('Failed to remove semester:', error);
		}
	};

	// Calculate semester counts
	const longSemCount = year.semesters.filter(sem => sem.sem_type === "Long Semester").length;
	const shortSemCount = year.semesters.filter(sem => sem.sem_type === "Short Semester").length;

	// Determine next semester name
	const getNextSemesterName = (type) => {
		let nextIntakeMonth;
		let nextIntakeYear;

		// Get the last semester of the current year
		const lastSemester = year.semesters[year.semesters.length - 1];

		if (!lastSemester) {
			// This is a new year, recursively check previous years
			let checkYear = year.year - 1;
			let foundLongSemester = false;
			let lastLongSemester = null;

			while (checkYear >= 1 && !foundLongSemester) {
				const previousYear = studentStudyPlanner.StudyPlanner.years.find(y => y.year === checkYear);
				if (previousYear && previousYear.semesters.length > 0) {
					// Check semesters in reverse order to find the last Long Semester
					for (let i = previousYear.semesters.length - 1; i >= 0; i--) {
						const semester = previousYear.semesters[i];
						if (semester.sem_type === "Long Semester") {
							lastLongSemester = semester;
							foundLongSemester = true;
							break;
						}
					}
				}
				checkYear--;
			}

			if (lastLongSemester) {
				const lastIntakeMonth = lastLongSemester.intake.month;
				nextIntakeYear = lastLongSemester.intake.year;

				if (type === 'long') {
					if (lastIntakeMonth === "Jan") {
						nextIntakeMonth = "Feb/Mar";
					} else if (lastIntakeMonth === "Jul") {
						nextIntakeMonth = "Aug/Sept";
					} else if (lastIntakeMonth === "Feb/Mar") {
						nextIntakeMonth = "Aug/Sept";
					} else if (lastIntakeMonth === "Aug/Sept") {
						nextIntakeMonth = "Feb/Mar";
						nextIntakeYear++;
					}
				} else {
					if (lastIntakeMonth === "Jan") {
						nextIntakeMonth = "Jul";
					} else if (lastIntakeMonth === "Jul") {
						nextIntakeMonth = "Jan";
						nextIntakeYear++;
					} else if (lastIntakeMonth === "Feb/Mar") {
						nextIntakeMonth = "Jul";
					} else if (lastIntakeMonth === "Aug/Sept") {
						nextIntakeMonth = "Jan";
						nextIntakeYear++;
					}
				}
			} else {
				// No previous year or no Long Semesters in previous years, use current date
				const currentDate = new Date();
				const currentMonth = currentDate.getMonth() + 1;
				nextIntakeYear = currentDate.getFullYear();
				if (type === 'long') {
					nextIntakeMonth = currentMonth < 6 ? "Feb/Mar" : "Aug/Sept";
				} else {
					nextIntakeMonth = currentMonth < 6 ? "Jan" : "Jul";
				}
			}
		} else {
			// Calculate based on last semester in current year
			const lastIntakeMonth = lastSemester.intake.month;
			nextIntakeYear = lastSemester.intake.year;

			if (type === 'long') {
				if (lastIntakeMonth === "Jan") {
					nextIntakeMonth = "Feb/Mar";
				} else if (lastIntakeMonth === "Jul") {
					nextIntakeMonth = "Aug/Sept";
				} else if (lastIntakeMonth === "Feb/Mar") {
					nextIntakeMonth = "Aug/Sept";
				} else if (lastIntakeMonth === "Aug/Sept") {
					nextIntakeMonth = "Feb/Mar";
					nextIntakeYear++;
				}
			} else {
				if (lastIntakeMonth === "Jan") {
					nextIntakeMonth = "Jul";
				} else if (lastIntakeMonth === "Jul") {
					nextIntakeMonth = "Jan";
					nextIntakeYear++;
				} else if (lastIntakeMonth === "Feb/Mar") {
					nextIntakeMonth = "Jul";
				} else if (lastIntakeMonth === "Aug/Sept") {
					nextIntakeMonth = "Jan";
					nextIntakeYear++;
				}
			}
		}

		// Determine semester name
		let semName;
		if (type === 'long') {
			// Find the last Long Semester's number
			let lastSemNumber = 0;
			let foundLongSemester = false;
			let checkYear = year.year;

			while (checkYear >= 1 && !foundLongSemester) {
				const currentYear = studentStudyPlanner.StudyPlanner.years.find(y => y.year === checkYear);
				if (currentYear && currentYear.semesters.length > 0) {
					// Check semesters in reverse order to find the last Long Semester
					for (let i = currentYear.semesters.length - 1; i >= 0; i--) {
						const semester = currentYear.semesters[i];
						if (semester.sem_type === "Long Semester") {
							const semNumber = parseInt(semester.sem_name.split(" ")[1]);
							lastSemNumber = semNumber;
							foundLongSemester = true;
							break;
						}
					}
				}
				checkYear--;
			}
			semName = `Semester ${lastSemNumber + 1}`;
		} else {
			if (nextIntakeMonth === "Jan") {
				semName = "Summer Term";
			} else if (nextIntakeMonth === "Jul") {
				semName = "Winter Term";
			}
		}

		return `${semName} (${nextIntakeMonth} ${nextIntakeYear})`;
	};

	return (
		<div className="plannerYearCard">
			<div className="border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all duration-200">
				<div
					onClick={() => setIsYearExpanded(!isYearExpanded)}
					className={` p-4 flex justify-between items-center cursor-pointer rounded-t-lg ${hasYearConflicts() ? 'border-l-4 border-red-500' : ''}`}
				>
					<h3 className="plannerYearTitle">
						Year {year.year}
						<InfoTooltip
							content={"A year has 2 semesters, usually with 4 units in each semester."}
							position='right'
							className='ml-2'
						/>
						{hasYearConflicts() && (
							<span className="ml-2 bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full inline-flex items-center">
								<svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
								</svg>
								Conflicts
							</span>
						)}
					</h3>
					<div className="flex items-center">
						{year.year !== 1 && year.semesters.length <= 0 && !isReadOnly && (
							<button
								onClick={async (e) => {
									e.stopPropagation(); // Prevent toggling the year expansion
									handleRemoveYear(year.year);
								}}
								className="px-4 py-1.5 bg-red-500 text-white rounded-md hover:bg-red-600 cursor-pointer transition-colors duration-200 flex items-center shadow-sm hover:shadow mr-3"
								title="Remove Year"
							>
								<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
								</svg>
								Remove Year
							</button>
						)}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							className={`h-6 w-6 text-red-500 transition-transform duration-300 ${isYearExpanded ? 'transform rotate-180' : ''}`}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
						</svg>
					</div>
				</div>

				<div
					className={`transition-all duration-300 ease-in-out  ${isYearExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
				>
					<div className="p-4 space-y-4">
						{year.semesters.map((semester, semIndex) => {
							return (
								<div key={semIndex} className="border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-all duration-200">
									<div
										onClick={() => toggleSemesterExpanded(semIndex)}
										className={`flex justify-between items-center p-3 cursor-pointer ${hasSemesterConflicts(semester) && !allUnitsCompleted(semester) ? ' border-l-4 border-red-500' : ''} rounded-t-lg`}
									>
										<h4 className="text-xl font-semibold flex items-center">
											{semester.sem_type === "Long Semester" ? (
												<span className="bg-blue-100 p-1 rounded-full mr-2 shadow-sm">
													<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
														<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
													</svg>
												</span>
											) : (
												<span className="bg-purple-100 p-1 rounded-full mr-2 shadow-sm">
													<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
														<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
													</svg>
												</span>
											)}
											{semester.sem_name} - {semester.intake.month} {semester.intake?.year}
											{allUnitsCompleted(semester) && (
												<span className="ml-2 bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full inline-flex items-center">
													<svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
														<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
													</svg>
													Completed in {semester.sem_completed}
												</span>
											)}
											{!allUnitsCompleted(semester) && hasSemesterConflicts(semester) && (
												<span className="ml-2 bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full inline-flex items-center">
													<svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
														<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
													</svg>
													Conflicts
												</span>
											)}
										</h4>
										<div className="flex items-center">
											{(!allUnitsCompleted(semester) && !(year.year === 1 && semIndex === 0) && !isReadOnly) && (
												<button
													onClick={(e) => {
														e.stopPropagation(); // Prevent toggling semester expansion
														handleRemoveSemester(semIndex);
													}}
													className="px-3 py-1.5 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors duration-200 flex items-center text-sm shadow-sm hover:shadow mr-2"
													title="Remove Semester"
												>
													<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
														<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
													</svg>
													Remove
												</button>
											)}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												className={`h-5 w-5 text-gray-500 transition-transform duration-300 ${expandedSemesters[semIndex] ? 'transform rotate-180' : ''}`}
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
											</svg>
										</div>
									</div>

									<div
										className={`transition-all duration-300 ease-in-out ${expandedSemesters[semIndex] ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}
									>
										<div className="border-t border-gray-200 text-black">
											<Semester
												sem={semester}
												yearNumber={year.year}
												semesterIndex={semIndex}
												studentStudyPlanner={studentStudyPlanner}
												setStudyPlanner={setStudentStudyPlanner}
												updateStudentStudyPlanner={updateStudentStudyPlanner}
												unitTypes={unitTypes}
												isComplete={allUnitsCompleted(semester)}
												isReadOnly={isReadOnly}
												isDarkMode={isDarkMode}
											/>
										</div>
									</div>
								</div>
							);
						})}
					</div>

					{!isReadOnly && !(year.semesters.length > 0 && allUnitsCompleted(year.semesters[year.semesters.length - 1]) && hasNextSemesterCompleted()) && (
						<div className="flex justify-center gap-3 p-4 border-t border-gray-200">
							<button
								onClick={() => handleAddSemester('long')}
								disabled={longSemCount >= 2}
								title={longSemCount >= 2 ? 'Maximum 2 long semesters allowed per year' : 'Add a long semester'}
								className={`px-4 py-2 rounded-md w-full flex items-center justify-center transition-all duration-200 ${longSemCount >= 2
									? 'bg-gray-400 cursor-not-allowed hidden'
									: 'bg-red-500 hover:bg-red-600 cursor-pointer shadow-sm hover:shadow'
									} text-white`}
							>
								<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
								</svg>
								Add {getNextSemesterName('long')}
							</button>
							<button
								onClick={() => handleAddSemester('short')}
								disabled={shortSemCount >= 2}
								title={shortSemCount >= 2 ? 'Maximum 2 short semesters allowed per year' : 'Add a short semester'}
								className={`px-4 py-2 rounded-md w-full flex items-center justify-center transition-all duration-200 ${shortSemCount >= 2
									? 'bg-gray-400 cursor-not-allowed hidden'
									: 'bg-red-500 hover:bg-red-600 cursor-pointer shadow-sm hover:shadow'
									} text-white`}
							>
								<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
								</svg>
								Add {getNextSemesterName('short')}
							</button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default Year;
