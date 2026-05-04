'use client'

import { useState, useEffect } from 'react'
import Semester from './semester'

const Year = ({ year, planner, setStudyPlanner, unitTypes, is_read_only }) => {
	const handleAddSemester = async (type) => {
		try {
			const semType = type === 'long' ? 'Long Semester' : 'Short Semester'
			const newPlanner = planner.AddNewSemester(year.year, semType)
			setStudyPlanner(newPlanner)
		} catch (error) {
			console.error('Failed to add semester:', error)
		}
	}

	const handleRemoveSemester = async (semIndex) => {
		try {
			const newPlanner = await planner.RemoveSemester(year.year, semIndex);
			setStudyPlanner(newPlanner);
		} catch (error) {
			console.error('Failed to remove semester:', error);
		}
	}

	// Calculate semester counts
	const longSemCount = year.semesters.filter(sem => sem.sem_type === "Long Semester").length;
	const shortSemCount = year.semesters.filter(sem => sem.sem_type === "Short Semester").length;

	// Determine next semester name
	const getNextSemesterName = (type) => {
		let nextIntakeMonth;
		let nextIntakeYear = planner.details.intake.year;

		// Get the last semester of the current year
		const lastSemester = year.semesters[year.semesters.length - 1];

		if (!lastSemester) {
			// This is a new year, recursively check previous years
			let checkYear = year.year - 1;
			let foundLongSemester = false;
			let lastLongSemester = null;

			while (checkYear >= 1 && !foundLongSemester) {
				const previousYear = planner.years.find(y => y.year === checkYear);
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
				// No previous year or no Long Semesters in previous years, use intake month
				const intakeMonth = parseInt(planner.details.intake.month);
				if (type === 'long') {
					nextIntakeMonth = intakeMonth < 6 ? "Feb/Mar" : "Aug/Sept";
				} else {
					nextIntakeMonth = intakeMonth < 6 ? "Jan" : "Jul";
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
				const currentYear = planner.years.find(y => y.year === checkYear);
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
	}

	return (
		<div className="space-y-4">
			{year.semesters.map((sem, semIndex) => (
				<div key={semIndex} className="plannerSemesterCard">
					<Semester
						sem={sem}
						yearNumber={year.year}
						semesterIndex={semIndex}
						planner={planner}
						setStudyPlanner={setStudyPlanner}
						handleRemoveSemester={handleRemoveSemester}
						unitTypes={unitTypes}
						is_read_only={is_read_only}
					/>
				</div>
			))}
			{!is_read_only && (
				<div className="flex justify-center gap-2">
					<button
						onClick={() => handleAddSemester('long')}
						disabled={longSemCount >= 2}
						title={longSemCount >= 2 ? 'Maximum 2 long semesters allowed per year' : 'Add a long semester'}
						className={`px-3 py-1 rounded w-full ${longSemCount >= 2
							? 'bg-gray-400 cursor-not-allowed hidden'
							: 'bg-red-400 hover:bg-red-600 cursor-pointer'
							} text-white`}
					>
						Add {getNextSemesterName('long')}
					</button>
					<button
						onClick={() => handleAddSemester('short')}
						disabled={shortSemCount >= 2}
						title={shortSemCount >= 2 ? 'Maximum 2 short semesters allowed per year' : 'Add a short semester'}
						className={`px-3 py-1 rounded w-full ${shortSemCount >= 2
							? 'bg-gray-400 cursor-not-allowed hidden'
							: 'bg-red-400 hover:bg-red-600 cursor-pointer'
							} text-white`}
					>
						Add {getNextSemesterName('short')}
					</button>
				</div>
			)}
		</div>
	)
}

export default Year