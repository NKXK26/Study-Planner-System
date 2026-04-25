import prisma from "@utils/db/db";
import UnitTermOfferedDB from "../UnitTermOffered/UnitTermOfferedDB";
import MasterStudyPlannerDB from "../MasterStudyPlanner/MasterStudyPlannerDB";
import SemesterInStudyPlannerYear from "../SemesterInStudyPlannerYear/SemesterInStudyPlannerYear";
import UnitDB from "../Unit/UnitDB";
import UnitTypeDB from "../UnitType/UnitTypeDB";
/**
 * Checks if a unit is offered in a specific term
 * @param {Object} unit - The unit to check
 * @param {string} termType - The term type to check against
 * @returns {Promise<boolean>} - Whether the unit is offered in the term
 */

let unit_term_offered_arr = []
async function FetchUnitTermOffered() {
	const unitTermOffered = await UnitTermOfferedDB.FetchTermOffered({})
	if (unitTermOffered.data) {
		if (unitTermOffered.data.length > 0) {
			unit_term_offered_arr = unitTermOffered.data;
		}
	}
}
// Ensure this only runs on the client to avoid SSR invoking client-only auth/session
if (typeof window !== 'undefined') {
	// Fire and forget; consumers read from unit_term_offered_arr when available
	FetchUnitTermOffered();
}

function CheckUnitOffering(unit_obj, termType) {
	const unit = unit_obj.unit;
	if (!unit || !unit.code) {
		return true; // If unit is null or has no code, consider it offered
	}
	if (unit_obj.type == "Elective" && unit.code.toLowerCase().includes("elective")) {
		return true;
	}

	try {
		return unit_term_offered_arr.some(
			(entry) => entry.unit_id === unit.unit_id && entry._term_type === termType
		);
	} catch (error) {
		console.error("Error checking unit offering:", error);
		return false;
	}
}

class StudyPlanner {
	constructor() {
		this.details = {
			id: -1,
			status: '',
			course: {
				course_name: "",
				course_code: "",
				credits_required: 0,
				major_name: "",
				major_id: -1
			},
			intake: {
				month: 0,
				name: "",
				sem_type: "",
				year: 0,
			},
			unit_types: [],
			recommended_electives: []
		};

		// Total credits counter
		this.total_combined_credits = 0;

		// Elective counter
		this.elective_counter = 0;
		this.years = [];
		this.last_modified = null; // Store last modified info
		this.semester_state = {
			added: [], //Should the Year and the Semester type
			removed: [], //Should be the ID that it wants to be removed
		}
		this.units_state = {
			added: [], //The semester_id that it will be added to
			edited: [], //Only if both is existing in database, it can be edited
			removed: [], //Only if it existing in database, it can be removed
		}
	}

	// Getters for course details
	get courseName() {
		return this.details.course.course_name;
	}
	get courseCode() {
		return this.details.course.course_code;
	}

	get status() {
		return this.details.status;
	}

	set status(status) {
		this.details.status = status;
	}

	get majorID() {
		return this.details.course.major_id;
	}

	get majorName() {
		return this.details.course.major_name;
	}

	get creditsRequired() {
		return this.details.course.credits_required;
	}

	// Getters for intake details
	get intakeName() {
		return this.details.intake.name;
	}

	get intakeSemType() {
		return this.details.intake.sem_type
	}

	get intakeMonth() {
		return this.details.intake.month
	}

	get intakeYear() {
		return this.details.intake.year;
	}

	// Getters for unit types
	get unit_types() {
		return this.details.unit_types;
	}

	// Getters for electives
	get recommendedElectives() {
		return this.details.recommended_electives;
	}

	// Getters for credits and years
	get totalCredits() {
		return this.total_combined_credits;
	}

	get allYears() {
		return this.years;
	}

	get courseIntakeID() {
		return this.details.course_intake_id;
	}

	InitDetails(course_name, course_code, credits_required, major_name, major_id, intake_name, intake_month, intake_year, sem_type, course_intake_status) {
		this.details.course = {
			course_name: course_name,
			course_code: course_code,
			credits_required: credits_required,
			major_name: major_name,
			major_id: major_id
		};

		this.details.intake = {
			name: intake_name,
			month: intake_month,
			year: intake_year,
			sem_type: sem_type,
			course_intake_status: course_intake_status
		};
	}

	async Init(master_study_planner_id, master_mode = true) {
		const ctx = await FetchMasterPlannerContext(master_study_planner_id);
		if (!ctx) { return { success: false, message: "Master Study Planner not found" }; }

		this.details.id = ctx.master_study_planner_data._id;
		this.details.status = ctx.master_study_planner_data._status;
		this.details.course_intake_id = ctx.master_study_planner_data._course_intake_id;

		// Store last modified info
		if (ctx.last_modified) {
			this.last_modified = ctx.last_modified;
		}

		this.InitDetails(
			ctx.course_data._name,
			ctx.course_data._code,
			ctx.course_data._credits_required,
			ctx.major_data._name,
			ctx.major_data._id,
			ctx.term_data._name,
			ctx.term_data._month,
			ctx.term_data._year,
			ctx.term_data._semtype,
			ctx.course_intake_data._Status
		);

		const built = BuildYearsFromData({
			semester_in_study_planner_year_res: ctx.semester_in_study_planner_year_res,
			units_in_semester_res: ctx.units_in_semester_res,
			units_res: ctx.units_res,
			unit_types_res: ctx.unit_types_res,
			term_data: ctx.term_data,
			initialIntakeYear: this.details.intake.year
		});

		console.log('ctx', ctx)

		this.years = built.years;
		// Add 4 unit rows to each empty semester
		// for (const year of this.years) {
		// 	for (const semester of year.semesters) {
		// 		const yearNum = year.year;
		// 		const semIndex = year.semesters.indexOf(semester);
		// 		if (semester.units.length === 0) {
		// 			// Add 4 unit rows, updating the planner state each time
		// 			let updatedPlanner = this;
		// 			for (let i = 0; i < 4; i++) {
		// 				updatedPlanner = updatedPlanner.AddNewUnitRowIntoSemester(yearNum, semIndex);
		// 			}
		// 			Object.assign(this, updatedPlanner);
		// 		} else {
		// 			for (const unit of semester.units) {
		// 				if (unit.requisites.length > 0) {
		// 					const requisiteResult = this.CheckUnitRequisites(unit, yearNum, semIndex);
		// 					unit.has_conflict = !requisiteResult.isValid;
		// 				}
		// 			}
		// 		}
		// 	}
		// }

		this.total_combined_credits = built.total_combined_credits;

		// Set unit types
		this.details.unit_types = built.unit_types_list;

		Object.assign(this, this.CleanStudyPlanner(master_mode));
		// Recalculate elective numbers
		Object.assign(this, RecalculateElectiveNumbers(this));

		console.log('this', this);
		return { success: true, message: "Succesfully Initialised MSP" }
	}

	IsCourseIntakeComplete() {
		return this.details.intake.course_intake_status.toLowerCase() === 'complete';
	}

	GetYearByIndex(index) {
		return this.years[index];
	}

	GetAllYearsAndSemesters() {
		const allYearsAndSemesters = [];

		for (const year of this.years) {
			const yearEntry = {
				year: year.year,
				semester: year.semesters.map(semester => ({
					sem_id: semester.sem_id,
					sem_type: semester.sem_type,
					units: [],
					unit_count: semester.units.length
				}))
			};
			allYearsAndSemesters.push(yearEntry);
		}

		return allYearsAndSemesters;
	}

	GetAllUnits() {
		let allUnits = [];
		for (const year of this.years) {
			for (const semester of year.semesters) {
				for (const unit of semester.units) {
					allUnits.push(unit);
				}
			}
		}
		return allUnits;
	}

	isEmpty() {
		// Check if there's only 1 year
		if (this.years.length !== 1) {
			return false;
		}

		// Check if the first year has any semesters with units
		const firstYear = this.years[0];
		for (const semester of firstYear.semesters) {
			if (semester.units.length > 0) {
				return false;
			}
		}

		return true;
	}

	UpdateStatus(ignore_conflicts = false) {
		// Check if empty
		if (this.isEmpty()) {
			this.status = 'Empty';
			return { status: this.status, message: "Study Planner Is Empty", is_complete: false }
		}

		let message = '';
		let is_complete = false;

		// Check for empty unit slots or unit types
		let has_empty_slots = false;
		let has_conflict = false;

		for (const year of this.years) {
			for (const semester of year.semesters) {
				// Skip completed semesters in student mode
				if (semester.sem_completed) continue;

				for (const unit of semester.units) {
					// Skip passed/failed units in student mode
					if (unit.status === 'pass' || unit.status === 'fail') continue;

					if (!unit.unit_type || !unit.unit?.name) {
						has_empty_slots = true;
						break;
					}

					if (!ignore_conflicts) {
						if (unit.has_conflict || !unit.is_offered) {
							has_conflict = true;
							break;
						}
					}
				}
				if (has_empty_slots) break;
			}
			if (has_empty_slots) break;
		}

		// Check if total credits match required credits
		const creditsMatch = this.total_combined_credits >= this.details.course.credits_required;

		// Set status based on conditions
		if (has_empty_slots) {
			message = 'Please make sure all unit slots and unit types are selected'
			this.status = 'Draft';
		}
		else if (has_conflict) {
			this.status = 'Draft';
			message = 'Please make sure there are no conflicting units'
		}
		else if (creditsMatch) {
			this.status = 'Complete';
			is_complete = true;
		} else {
			message = `Please make sure the total combined credit points has met the required credit point ${this.total_combined_credits}/${this.details.course.credits_required}`;
			this.status = 'Draft';
		}

		return { status: this.status, message: message, is_complete: is_complete }
	}

	IsFullyCompleted() {
		// Check if total credits match required credits
		if (this.total_combined_credits !== this.details.course.credits_required) {
			return false;
		}

		// Check for empty slots and unit conflicts
		for (const year of this.years) {
			for (const semester of year.semesters) {
				for (const unit of semester.units) {
					// Check if unit slot is empty
					if (!unit.unit_type || !unit.unit?.name) {
						return false;
					}

					// Check if unit has conflicts
					if (unit.has_conflict) {
						return false;
					}

					// Check if unit is offered
					if (!unit.is_offered) {
						return false;
					}
				}
			}
		}

		return true;
	}

	/**
	 * Adds a new year to the study planner, automatically incrementing from the latest year
	 * @returns {Object} The newly created year object
	 */
	AddNewYear() {
		// Find the latest year number
		const latestYear = this.years.length > 0
			? Math.max(...this.years.map(year => year.year))
			: 0;

		// Create new year object with next year number
		const newYear = {
			year: latestYear + 1,
			semesters: []
		};

		const newPlanner = this.Clone();

		// Add to years array
		newPlanner.years.push(newYear);

		return newPlanner;
	}

	/**
	 * Removes a year and shifts all subsequent years up by one
	 * @param {number} yearNumber - The year number to remove
	 * @returns {Promise<boolean>} True if year was removed, false if year not found
	 */
	RemoveYear(yearNumber) {
		// Find the index of the year to remove
		if (yearNumber === 1) {
			return false;
		}

		const newPlanner = this.Clone();

		// Get the year we're about to remove
		const yearToRemove = newPlanner.years[yearNumber - 1];
		if (!yearToRemove) {
			throw new Error(`Year ${yearNumber} not found`);
		}

		// Remove the sem
		let sem_to_remove = newPlanner.years.splice(yearNumber - 1, 1);

		// Shift all subsequent years up by one
		for (let i = yearNumber - 1; i < newPlanner.years.length; i++) {
			newPlanner.years[i].year -= 1;
		}

		// Track removed semesters and update added semesters
		const RemovedSemesterIds = [];
		const UpdatedAddedSemesters = [];

		// Process each semester in the removed year
		yearToRemove.semesters.forEach(semester => {
			const existing_unit_ids = (semester.units || [])
				.filter(unit => unit.unit_id)
				.map(unit => unit.unit_id);

			const total_units_cp = semester.units.reduce((total, unit) => {
				if (unit.unit && unit.unit.credit_points) {
					return total + unit.unit.credit_points;
				}
				return total;
			}, 0);

			newPlanner.RemoveAllUnusedUnitTypes();
			newPlanner.total_combined_credits -= total_units_cp;

			newPlanner.units_state.edited = newPlanner.units_state.edited.filter(
				(unit) => !existing_unit_ids.includes(unit.unit_id)
			);

			if (semester.sem_id) {
				RemovedSemesterIds.push(semester.sem_id);
			}
		});

		// Update the added semesters array to:
		// 1. Remove any semesters that were in the removed year
		// 2. Adjust indexes for semesters in subsequent years
		newPlanner.semester_state.added.forEach(addedSem => {
			if (addedSem.year < yearNumber) {
				// Keep semesters from previous years unchanged
				UpdatedAddedSemesters.push(addedSem);
			} else if (addedSem.year > yearNumber) {
				// For semesters in later years, decrement the year number and adjust semester index
				UpdatedAddedSemesters.push({
					...addedSem,
					year: addedSem.year - 1
				});
			}
			// Semesters in the removed year are filtered out
		});

		// Update the state
		newPlanner.semester_state = {
			...newPlanner.semester_state,
			added: UpdatedAddedSemesters,
			removed: [
				...newPlanner.semester_state.removed,
				...RemovedSemesterIds
			]
		};

		// Filter out units from deleted year
		newPlanner.units_state.added = newPlanner.units_state.added.filter(unit => unit.year_to_add !== yearNumber);

		// Update units_state.added to:
		// 2. Adjust year and semester indices for units in subsequent years
		newPlanner.units_state.added = newPlanner.units_state.added
			.map(unit => {
				if (unit.year_to_add > yearNumber) {
					// For units in later years, decrement the year number
					return {
						...unit,
						year_to_add: unit.year_to_add - 1
					};
				}
				return unit;
			});

		// Recalculate all semesters starting from the current year
		let currentYearIndex = yearNumber - 1;
		let prev_sem = null;

		while (currentYearIndex < newPlanner.years.length) {
			const currentYear = newPlanner.years[currentYearIndex];
			const startIndex = 0;

			for (let i = startIndex; i < currentYear.semesters.length; i++) {
				const semester = currentYear.semesters[i];
				let nextIntakeMonth;
				let nextIntakeYear;

				if (prev_sem) {
					const last_intake_month = prev_sem.intake.month;
					nextIntakeYear = prev_sem.intake.year;

					if (semester.sem_type === "Short Semester") {
						if (last_intake_month === "Jan") {
							nextIntakeMonth = "Jul";
						} else if (last_intake_month === "Jul") {
							nextIntakeMonth = "Jan";
							nextIntakeYear++;
						} else if (last_intake_month === "Feb/Mar") {
							nextIntakeMonth = "Jul";
						} else if (last_intake_month === "Aug/Sept") {
							nextIntakeMonth = "Jan";
							nextIntakeYear++;
						}
					} else {
						if (last_intake_month === "Jan") {
							nextIntakeMonth = "Feb/Mar";
						} else if (last_intake_month === "Jul") {
							nextIntakeMonth = "Aug/Sept";
						} else if (last_intake_month === "Feb/Mar") {
							nextIntakeMonth = "Aug/Sept";
						} else if (last_intake_month === "Aug/Sept") {
							nextIntakeMonth = "Feb/Mar";
							nextIntakeYear++;
						}
					}
				} else {
					// First semester after removal
					if (currentYearIndex === 0 && i === 0) {
						// First semester of first year
						nextIntakeYear = newPlanner.details.intake.year;
						const intakeMonth = parseInt(newPlanner.details.intake.month);
						if (semester.sem_type === "Short Semester") {
							nextIntakeMonth = intakeMonth < 6 ? "Jan" : "Jul";
						} else {
							nextIntakeMonth = intakeMonth < 6 ? "Feb/Mar" : "Aug/Sept";
						}
					} else {
						// Recursively check previous years until we find a semester
						let foundSemester = false;
						let checkYear = currentYearIndex - 1;

						while (checkYear >= 0 && !foundSemester) {
							const previousYear = newPlanner.years[checkYear];
							if (previousYear && previousYear.semesters.length > 0) {
								const lastSemOfPrevYear = previousYear.semesters[previousYear.semesters.length - 1];
								nextIntakeYear = lastSemOfPrevYear.intake.year;
								const last_intake_month = lastSemOfPrevYear.intake.month;

								if (semester.sem_type === "Short Semester") {
									if (last_intake_month === "Jan") {
										nextIntakeMonth = "Jul";
									} else if (last_intake_month === "Jul") {
										nextIntakeMonth = "Jan";
										nextIntakeYear++;
									} else if (last_intake_month === "Feb/Mar") {
										nextIntakeMonth = "Jul";
									} else if (last_intake_month === "Aug/Sept") {
										nextIntakeMonth = "Jan";
										nextIntakeYear++;
									}
								} else {
									if (last_intake_month === "Jan") {
										nextIntakeMonth = "Feb/Mar";
									} else if (last_intake_month === "Jul") {
										nextIntakeMonth = "Aug/Sept";
									} else if (last_intake_month === "Feb/Mar") {
										nextIntakeMonth = "Aug/Sept";
									} else if (last_intake_month === "Aug/Sept") {
										nextIntakeMonth = "Feb/Mar";
										nextIntakeYear++;
									}
								}
								foundSemester = true;
							}
							checkYear--;
						}

						// If no semester found in previous years, use intake month
						if (!foundSemester) {
							nextIntakeYear = newPlanner.details.intake.year;
							const intakeMonth = parseInt(newPlanner.details.intake.month);
							if (semester.sem_type === "Short Semester") {
								nextIntakeMonth = intakeMonth < 6 ? "Jan" : "Jul";
							} else {
								nextIntakeMonth = intakeMonth < 6 ? "Feb/Mar" : "Aug/Sept";
							}
						}
					}
				}

				// Update semester's intake
				semester.intake.month = nextIntakeMonth;
				semester.intake.year = nextIntakeYear;

				// Update semester term and name
				if (semester.sem_type === "Short Semester") {
					if (nextIntakeMonth === "Jan") {
						semester.sem_term = "Summer";
					} else if (nextIntakeMonth === "Jul") {
						semester.sem_term = "Winter";
					}
					semester.sem_name = semester.sem_term;
				} else {
					if (nextIntakeMonth === "Feb/Mar") {
						semester.sem_term = "Semester 1";
					} else if (nextIntakeMonth === "Aug/Sept") {
						semester.sem_term = "Semester 2";
					}
					// Count total long semesters up to this point to get the correct semester number
					let totalLongSemCount = 0;
					for (let y = 0; y <= currentYearIndex; y++) {
						const year = newPlanner.years[y];
						for (let s = 0; s < (y === currentYearIndex ? i + 1 : year.semesters.length); s++) {
							if (year.semesters[s].sem_type === "Long Semester") {
								totalLongSemCount++;
							}
						}
					}
					semester.sem_name = `Semester ${totalLongSemCount}`;
				}

				prev_sem = semester;
			}

			currentYearIndex++;
		}

		// Check for conflicts in all subsequent units and update offered status
		for (let y = yearNumber; y <= newPlanner.years.length; y++) {
			const currentYear = newPlanner.years.find(yr => yr.year === y);
			if (!currentYear) continue;

			for (let s = 0; s < currentYear.semesters.length; s++) {
				const semester = currentYear.semesters[s];
				const sem_term = semester.sem_term;

				// Update is_offered status for each unit in the semester
				for (let u = 0; u < semester.units.length; u++) {
					const unit = semester.units[u];
					if (unit.unit && unit.code) {
						unit.is_offered = CheckUnitOffering(unit, sem_term);
					}
					if (unit.unit && unit.requisites && unit.requisites.length > 0) {
						const requisiteResult = newPlanner.CheckUnitRequisites(unit, y, s);
						unit.has_conflict = !requisiteResult.isValid;
					}
				}
			}
		}
		return newPlanner;
	}

	/**
	 * Adds a new semester to a specific year, following the semester scheduling rules
	 * @param {number} yearNumber - The year number to add the semester to
	 * @param {string} semType - Type of semester ("Long Semester" or "Short Semester")
	 * @returns {Object} The newly created semester object
	 * @throws {Error} If year not found or semester cannot be added
	 */
	AddNewSemester(yearNumber, semType, semester = null, auto_add_units = true, master_mode = true) {
		const newPlanner = this.Clone();

		const year = newPlanner.years.find(y => y.year === yearNumber);
		if (!year) {
			throw new Error(`Year ${yearNumber} not found`);
		}

		// Check if we've reached the maximum semesters per year (2 long + 2 short)
		const longSemCount = year.semesters.filter(sem => sem.sem_type === "Long Semester").length;
		const shortSemCount = year.semesters.filter(sem => sem.sem_type === "Short Semester").length;

		if ((semType === "Long Semester" && longSemCount >= 2) ||
			(semType === "Short Semester" && shortSemCount >= 2)) {
			throw new Error(`Maximum number of ${semType}s reached for year ${yearNumber}`);
		}

		// Always append at the end
		const insertIndex = year.semesters.length;
		let prev_semester = null;

		// If there are existing semesters, get the last one
		if (year.semesters.length > 0) {
			prev_semester = year.semesters[year.semesters.length - 1];
		}


		// Determine the next semester's intake month and year
		let nextIntakeMonth;
		let nextIntakeYear;

		if (insertIndex === 0) {
			// Inserting at the beginning
			if (yearNumber === 1) {
				// First year, use intake details
				const initialIntake = GetInitialIntake(semType, this.details);
				nextIntakeMonth = initialIntake.nextIntakeMonth;
				nextIntakeYear = initialIntake.nextIntakeYear;
			} else {
				// Recursively check previous years until we find a semester
				const lastSemester = FindLastSemesterFromPreviousYears(yearNumber, this.years);
				if (lastSemester) {
					const nextIntake = DetermineNextIntake(
						lastSemester.intake.month,
						lastSemester.intake.year,
						semType
					);
					nextIntakeMonth = nextIntake.nextIntakeMonth;
					nextIntakeYear = nextIntake.nextIntakeYear;
				} else {
					// No previous year or no semesters in previous years, use intake month
					const initialIntake = GetInitialIntake(semType, this.details);
					nextIntakeMonth = initialIntake.nextIntakeMonth;
					nextIntakeYear = initialIntake.nextIntakeYear;
				}
			}
		} else {
			// Appending after the last semester
			const nextIntake = DetermineNextIntake(
				prev_semester.intake.month,
				prev_semester.intake.year,
				semType
			);
			nextIntakeMonth = nextIntake.nextIntakeMonth;
			nextIntakeYear = nextIntake.nextIntakeYear;
		}

		// Determine semester term and name based on intake month and type
		let semTerm;
		let semName;


		if (semType.toLowerCase() === "short semester") {
			if (nextIntakeMonth === "Jan") {
				semTerm = "Summer";
			} else if (nextIntakeMonth === "Jul") {
				semTerm = "Winter";
			}
			semName = semTerm + " Term";
		} else {
			if (nextIntakeMonth === "Feb/Mar") {
				semTerm = "Semester 1";
			} else if (nextIntakeMonth === "Aug/Sept") {
				semTerm = "Semester 2";
			}
			// Get the semester number of the semester before the one we're adding
			let prev_semNumber = 0;
			let foundLongSemester = false;
			let checkYear = yearNumber;

			while (checkYear >= 1 && !foundLongSemester) {
				const currentYear = this.years.find(y => y.year === checkYear);
				if (currentYear && currentYear.semesters.length > 0) {
					// Check semesters in reverse order to find the last Long Semester
					for (let i = currentYear.semesters.length - 1; i >= 0; i--) {
						const semester = currentYear.semesters[i];
						if (semester.sem_type === "Long Semester") {
							const semNumber = parseInt(semester.sem_name.split(" ")[1]);
							prev_semNumber = semNumber;
							foundLongSemester = true;
							break;
						}
					}
				}
				checkYear--;
			}
			semName = `Semester ${prev_semNumber + 1}`;
		}

		// Create the new semester
		let newSemester;

		if (semester) {
			newSemester = {
				...(semester.sem_id !== undefined && { sem_id: semester.sem_id }),
				sem_name: semester.sem_name,
				sem_term: semester.sem_term,
				sem_type: semester.sem_type,
				intake: {
					month: semester.intake.month,
					year: semester.intake.year
				},
				units: []
			}

			if (semester.sem_completed) {
				newSemester.sem_completed = semester.sem_completed;
			}
		} else {
			newSemester = {
				sem_name: semName,
				sem_term: semTerm,
				sem_type: semType,
				intake: {
					month: nextIntakeMonth,
					year: nextIntakeYear
				},
				units: [
				]
			};
		}

		// this.AddNewUnitRowIntoSemester(yearNumber, insertIndex);
		// Insert the new semester at the end
		year.semesters.push(newSemester);

		// Recalculate all subsequent semesters
		let currentYearIndex = newPlanner.years.findIndex(y => y.year === yearNumber);
		let currentSemIndex = insertIndex + 1;
		let prev_sem = newSemester;

		while (currentYearIndex < newPlanner.years.length) {
			const currentYear = newPlanner.years[currentYearIndex];
			const startIndex = currentYearIndex === newPlanner.years.findIndex(y => y.year === yearNumber) ? currentSemIndex : 0;

			for (let i = startIndex; i < currentYear.semesters.length; i++) {
				const semester = currentYear.semesters[i];
				const nextIntake = DetermineNextIntake(
					prev_sem.intake.month,
					prev_sem.intake.year,
					semester.sem_type
				);

				// Update semester's intake
				semester.intake.month = nextIntake.nextIntakeMonth;
				semester.intake.year = nextIntake.nextIntakeYear;

				// Update semester term and name
				if (semester.sem_type === "Short Semester") {
					if (nextIntake.nextIntakeMonth === "Jan") {
						semester.sem_term = "Summer";
					} else if (nextIntake.nextIntakeMonth === "Jul") {
						semester.sem_term = "Winter";
					}
					semester.sem_name = semester.sem_term;
				} else {
					if (nextIntake.nextIntakeMonth === "Feb/Mar") {
						semester.sem_term = "Semester 1";
					} else if (nextIntake.nextIntakeMonth === "Aug/Sept") {
						semester.sem_term = "Semester 2";
					}
					// Count total long semesters up to this point to get the correct semester number
					let totalLongSemCount = 0;
					for (let y = 0; y <= currentYearIndex; y++) {
						const year = newPlanner.years[y];
						for (let s = 0; s < (y === currentYearIndex ? i + 1 : year.semesters.length); s++) {
							if (year.semesters[s].sem_type === "Long Semester") {
								totalLongSemCount++;
							}
						}
					}
					semester.sem_name = `Semester ${totalLongSemCount}`;
				}

				prev_sem = semester;
			}

			currentYearIndex++;
			currentSemIndex = 0;
		}

		// Check for conflicts and offerings in all subsequent units
		for (let y = yearNumber; y <= newPlanner.years.length; y++) {
			const currentYear = newPlanner.years.find(yr => yr.year === y);
			if (!currentYear) continue;

			for (let s = 0; s < currentYear.semesters.length; s++) {
				const semester = currentYear.semesters[s];
				for (let u = 0; u < semester.units.length; u++) {
					const unit = semester.units[u];

					// Check unit requisites
					if (unit.unit && unit.requisites && unit.requisites.length > 0) {
						const requisiteResult = newPlanner.CheckUnitRequisites(unit, y, s, master_mode);
						unit.has_conflict = !requisiteResult.isValid;
					}

					// Check unit offering
					if (unit.unit && unit.unit.code) {
						try {
							unit.is_offered = CheckUnitOffering(unit, semester.sem_term);
						} catch (error) {
							console.error("Error checking unit offering:", error);
							unit.is_offered = false;
						}
					} else {
						unit.is_offered = true; // If unit is null or has no code, consider it offered
					}
				}
			}
		}

		let new_sem = {
			year: yearNumber,
			sem_index: insertIndex,
			sem_type: semType
		}
		newPlanner.semester_state.added.push(new_sem);

		let currentPlanner = newPlanner;
		if (auto_add_units) {
			for (let i = 0; i < 4; i++) {
				currentPlanner = currentPlanner.AddNewUnitRowIntoSemester(yearNumber, insertIndex, master_mode);
			}
		}

		return currentPlanner;
	}

	/**
	 * Adds a new semester to a specific year, following the semester scheduling rules
	 * @param {number} yearNumber - The year number to remove the semester from
	 * @param {number} semesterIndex - The semester index to remove
	 * @param {boolean} master_mode - Is this the master study planner?
	 * @returns {Object} The newly created semester object
	 * @throws {Error} If year not found or semester cannot be added
	 */
	RemoveSemester(yearNumber, semesterIndex, master_mode = true) {
		// Check if trying to remove the first semester of the first year
		if (yearNumber === 1 && semesterIndex === 0) {
			throw new Error("Cannot remove the first semester of the first year");
		}

		const newPlanner = this.Clone();

		// Find the year in the cloned planner
		const yearIndex = newPlanner.years.findIndex(y => y.year === yearNumber);
		if (yearIndex === -1) {
			throw new Error(`Year ${yearNumber} not found`);
		}

		const year = newPlanner.years[yearIndex];

		// Check if semester exists
		if (semesterIndex < 0 || semesterIndex >= year.semesters.length) {
			throw new Error(`Semester ${semesterIndex} not found in year ${yearNumber}`);
		}

		// Remove the semester from the cloned planner
		let sem_to_remove = year.semesters.splice(semesterIndex, 1);
		const total_units_cp = sem_to_remove[0].units.reduce((total, unit) => {
			if (unit.unit && unit.unit.credit_points) {
				return total + unit.unit.credit_points;
			}
			return total;
		}, 0);
		newPlanner.total_combined_credits -= total_units_cp;

		newPlanner.RemoveAllUnusedUnitTypes();

		// If the year is now empty (except first year), remove it
		if (year.semesters.length === 0 && yearNumber !== 1) {
			newPlanner.years.splice(yearIndex, 1);

			// Shift all subsequent years up by one
			for (let i = yearIndex; i < newPlanner.years.length; i++) {
				newPlanner.years[i].year -= 1;
			}
		}

		// Recalculate all semesters starting from the current year
		let currentYearIndex = yearIndex;
		let prev_sem = null;

		// If we're removing from first year, set prev_sem to the semester before the removed one
		if (semesterIndex > 0) {
			prev_sem = year.semesters[semesterIndex - 1];
		} else if (yearIndex > 0) {
			const previousYear = newPlanner.years[yearIndex - 1];
			if (previousYear && previousYear.semesters.length > 0) {
				prev_sem = previousYear.semesters[previousYear.semesters.length - 1];
			}
		}

		// Check if non-master mode and if previous semester is completed
		const prev_semIsCompleted = !master_mode && prev_sem && prev_sem.units &&
			prev_sem.units.length > 0 &&
			prev_sem.units.every(unit => unit.status === "pass" || unit.status === "fail");

		// If we're in non-master mode and previous semester is completed, use current date for scheduling
		let useCurrentDate = !master_mode && prev_semIsCompleted;

		while (currentYearIndex < newPlanner.years.length) {
			const currentYear = newPlanner.years[currentYearIndex];
			const startIndex = currentYearIndex === yearIndex ? semesterIndex : 0;

			for (let i = startIndex; i < currentYear.semesters.length; i++) {
				const semester = currentYear.semesters[i];

				if(!master_mode && semester.sem_completed) {
					continue;
				}
				let nextIntakeMonth;
				let nextIntakeYear;

				if (useCurrentDate) {
					// Use current date to determine next semester scheduling
					const currentDate = new Date();
					const currentMonth = currentDate.getMonth() + 1; // JavaScript months are 0-indexed
					const currentYear = currentDate.getFullYear();

					if (semester.sem_type === "Short Semester") {
						// For short semesters
						if (currentMonth >= 9 || currentMonth <= 3) {
							nextIntakeMonth = "Jan";
							nextIntakeYear = currentMonth >= 9 ? currentYear + 1 : currentYear;
						} else {
							nextIntakeMonth = "Jul";
							nextIntakeYear = currentYear;
						}
					} else {
						// For long semesters
						if (currentMonth >= 11 || currentMonth <= 4) {
							nextIntakeMonth = "Feb/Mar";
							nextIntakeYear = currentMonth >= 11 ? currentYear + 1 : currentYear;
						} else {
							nextIntakeMonth = "Aug/Sept";
							nextIntakeYear = currentYear;
						}
					}

					// After using current date once, switch to regular sequencing
					useCurrentDate = false;
				} else if (prev_sem) {
					const last_intake_month = prev_sem.intake.month;
					nextIntakeYear = prev_sem.intake.year;

					if (semester.sem_type === "Short Semester") {
						if (last_intake_month === "Jan") {
							nextIntakeMonth = "Jul";
						} else if (last_intake_month === "Jul") {
							nextIntakeMonth = "Jan";
							nextIntakeYear++;
						} else if (last_intake_month === "Feb/Mar") {
							nextIntakeMonth = "Jul";
						} else if (last_intake_month === "Aug/Sept") {
							nextIntakeMonth = "Jan";
							nextIntakeYear++;
						}
					} else {
						if (last_intake_month === "Jan") {
							nextIntakeMonth = "Feb/Mar";
						} else if (last_intake_month === "Jul") {
							nextIntakeMonth = "Aug/Sept";
						} else if (last_intake_month === "Feb/Mar") {
							nextIntakeMonth = "Aug/Sept";
						} else if (last_intake_month === "Aug/Sept") {
							nextIntakeMonth = "Feb/Mar";
							nextIntakeYear++;
						}
					}
				} else {
					// First semester after removal
					if (currentYearIndex === 0 && i === 0) {
						// First semester of first year
						nextIntakeYear = newPlanner.details.intake.year;
						const intakeMonth = parseInt(newPlanner.details.intake.month);
						if (semester.sem_type === "Short Semester") {
							nextIntakeMonth = intakeMonth < 6 ? "Jan" : "Jul";
						} else {
							nextIntakeMonth = intakeMonth < 6 ? "Feb/Mar" : "Aug/Sept";
						}
					} else {
						// Recursively check previous years until we find a semester
						let foundSemester = false;
						let checkYear = currentYearIndex - 1;

						while (checkYear >= 0 && !foundSemester) {
							const previousYear = newPlanner.years[checkYear];
							if (previousYear && previousYear.semesters.length > 0) {
								const lastSemOfPrevYear = previousYear.semesters[previousYear.semesters.length - 1];

								// If in non-master mode and this last semester is completed, use current date
								const lastSemCompleted = !master_mode && lastSemOfPrevYear.units &&
									lastSemOfPrevYear.units.length > 0 &&
									lastSemOfPrevYear.units.every(unit => unit.status === "pass" || unit.status === "fail");

								if (!master_mode && lastSemCompleted) {
									// Use current date for scheduling
									const currentDate = new Date();
									const currentMonth = currentDate.getMonth() + 1;

									if (semester.sem_type === "Short Semester") {
										if (currentMonth >= 9 || currentMonth <= 3) {
											nextIntakeMonth = "Jan";
											nextIntakeYear = currentMonth >= 9 ? currentDate.getFullYear() + 1 : currentDate.getFullYear();
										} else {
											nextIntakeMonth = "Jul";
											nextIntakeYear = currentDate.getFullYear();
										}
									} else {
										if (currentMonth >= 11 || currentMonth <= 4) {
											nextIntakeMonth = "Feb/Mar";
											nextIntakeYear = currentMonth >= 11 ? currentDate.getFullYear() + 1 : currentDate.getFullYear();
										} else {
											nextIntakeMonth = "Aug/Sept";
											nextIntakeYear = currentDate.getFullYear();
										}
									}
								} else {
									// Regular sequencing based on last semester
									nextIntakeYear = lastSemOfPrevYear.intake.year;
									const last_intake_month = lastSemOfPrevYear.intake.month;

									if (semester.sem_type === "Short Semester") {
										if (last_intake_month === "Jan") {
											nextIntakeMonth = "Jul";
										} else if (last_intake_month === "Jul") {
											nextIntakeMonth = "Jan";
											nextIntakeYear++;
										} else if (last_intake_month === "Feb/Mar") {
											nextIntakeMonth = "Jul";
										} else if (last_intake_month === "Aug/Sept") {
											nextIntakeMonth = "Jan";
											nextIntakeYear++;
										}
									} else {
										if (last_intake_month === "Jan") {
											nextIntakeMonth = "Feb/Mar";
										} else if (last_intake_month === "Jul") {
											nextIntakeMonth = "Aug/Sept";
										} else if (last_intake_month === "Feb/Mar") {
											nextIntakeMonth = "Aug/Sept";
										} else if (last_intake_month === "Aug/Sept") {
											nextIntakeMonth = "Feb/Mar";
											nextIntakeYear++;
										}
									}
								}
								foundSemester = true;
							}
							checkYear--;
						}

						// If no semester found in previous years, use intake month
						if (!foundSemester) {
							nextIntakeYear = newPlanner.details.intake.year;
							const intakeMonth = parseInt(newPlanner.details.intake.month);
							if (semester.sem_type === "Short Semester") {
								nextIntakeMonth = intakeMonth < 6 ? "Jan" : "Jul";
							} else {
								nextIntakeMonth = intakeMonth < 6 ? "Feb/Mar" : "Aug/Sept";
							}
						}
					}
				}

				// Update semester's intake
				semester.intake.month = nextIntakeMonth;
				semester.intake.year = nextIntakeYear;

				// Update semester term and name
				if (semester.sem_type === "Short Semester") {
					if (nextIntakeMonth === "Jan") {
						semester.sem_term = "Summer";
					} else if (nextIntakeMonth === "Jul") {
						semester.sem_term = "Winter";
					}
					semester.sem_name = semester.sem_term;
				} else {
					if (nextIntakeMonth === "Feb/Mar") {
						semester.sem_term = "Semester 1";
					} else if (nextIntakeMonth === "Aug/Sept") {
						semester.sem_term = "Semester 2";
					}
					// Count total long semesters up to this point to get the correct semester number
					let totalLongSemCount = 0;
					for (let y = 0; y <= currentYearIndex; y++) {
						const year = newPlanner.years[y];
						for (let s = 0; s < (y === currentYearIndex ? i + 1 : year.semesters.length); s++) {
							if (year.semesters[s].sem_type === "Long Semester") {
								totalLongSemCount++;
							}
						}
					}
					semester.sem_name = `Semester ${totalLongSemCount}`;
				}

				prev_sem = semester;
			}

			currentYearIndex++;
		}

		// Check for conflicts and offerings in all subsequent units
		for (let y = yearNumber; y <= newPlanner.years.length; y++) {
			const currentYear = newPlanner.years.find(yr => yr.year === y);
			if (!currentYear) continue;

			for (let s = 0; s < currentYear.semesters.length; s++) {
				const semester = currentYear.semesters[s];
				for (let u = 0; u < semester.units.length; u++) {
					const unit = semester.units[u];

					// Check unit requisites
					if (unit.unit && unit.requisites && unit.requisites.length > 0) {
						const requisiteResult = newPlanner.CheckUnitRequisites(unit, y, s, master_mode);
						unit.has_conflict = !requisiteResult.isValid;
					}

					// Check unit offering
					if (unit.unit && unit.unit.code) {
						try {
							unit.is_offered = CheckUnitOffering(unit, semester.sem_term);
						} catch (error) {
							console.error("Error checking unit offering:", error);
							unit.is_offered = false;
						}
					} else {
						unit.is_offered = true; // If unit is null or has no code, consider it offered
					}
				}
			}
		}
		if (sem_to_remove[0].sem_id) {
			//If the semester is already in db(it has a sem_id), add it to the removed array
			newPlanner.semester_state.removed.push(sem_to_remove[0].sem_id);
		} else {
			//If the semester is not in db(it doesn't have a sem_id), remove it from the added array
			newPlanner.semester_state.added = newPlanner.semester_state.added.filter(sem => !(sem.year === yearNumber && sem.sem_index === semesterIndex));
		}

		const existing_unit_ids = sem_to_remove
			.flatMap(sem => sem.units)
			.filter(unit => unit.unit_id)
			.map(unit => unit.unit_id);
		newPlanner.units_state.edited = newPlanner.units_state.edited.filter(
			(unit) => !existing_unit_ids.includes(unit.unit_id)
		);

		// Shift the sem_index of the semesters that are after the removed semester
		for (let i = 0; i < newPlanner.semester_state.added.length; i++) {
			if (newPlanner.semester_state.added[i].year === yearNumber &&
				newPlanner.semester_state.added[i].sem_index > semesterIndex) {
				newPlanner.semester_state.added[i].sem_index--;
			}
		}

		// Remove the units that is in the removed semester
		newPlanner.units_state.added = newPlanner.units_state.added.filter(unit =>
			!(unit.year_to_add === yearNumber && unit.sem_index_to_add === semesterIndex)
		);

		// Shift the sem_index_to_add of the units that are after the removed semester
		for (let i = 0; i < newPlanner.units_state.added.length; i++) {
			if (newPlanner.units_state.added[i].year_to_add === yearNumber &&
				newPlanner.units_state.added[i].sem_index_to_add > semesterIndex
			) {
				newPlanner.units_state.added[i].sem_index_to_add--;
			}
		}

		return newPlanner;
	}

	AddNewUnitRowIntoSemester(year, sem_index, master_mode = true, append = true) {
		const newPlanner = this.Clone();
		const targetYear = newPlanner.years.find(y => y.year === year);
		if (!targetYear) {
			throw new Error(`Year ${year} not found`);
		}

		const targetSemester = targetYear.semesters[sem_index];
		if (!targetSemester) {
			throw new Error(`Semester ${sem_index} not found in year ${year}`);
		}


		// Create a new unit with default values
		const new_unit = {
			unit_type: null,
			unit: {
				code: null,
				name: null,
				credit_points: 0
			},
			requisites: [],
			has_conflict: false,
			is_offered: true
		};
		if (!master_mode) {
			new_unit.status = 'planned'
		}

		let unit_data_to_add = {
			unit_type_id: new_unit.unit_type?._type_id ?? null,
			unit_code: new_unit.unit?.code ?? null,
			year_to_add: targetYear.year,
			sem_index_to_add: sem_index,
			unit_index_to_add: append ? targetSemester.units.length : 0
		}

		append ? newPlanner.units_state.added.push(unit_data_to_add) : newPlanner.units_state.added.unshift(unit_data_to_add);
		append ? targetSemester.units.push(new_unit) : targetSemester.units.unshift(new_unit);

		// Add the new unit to the semester
		return newPlanner;
	}

	DeleteUnitRowFromSemester(year, sem_index, unit_index) {
		const newPlanner = this.Clone();
		const targetYear = newPlanner.years.find(y => y.year === year);
		if (!targetYear) {
			throw new Error(`Year ${year} not found`);
		}

		const targetSemester = targetYear.semesters[sem_index];
		if (!targetSemester) {
			throw new Error(`Semester ${sem_index} not found in year ${year}`);
		}

		const targetUnit = targetSemester.units[unit_index];
		if (!targetUnit) {
			throw new Error(`Unit ${unit_index} not found in semester ${sem_index} of year ${year}`);
		}

		// Deduct credit points from total
		let deleted_unit = targetSemester.units.splice(unit_index, 1);
		const unitCP = targetUnit.unit?.credit_points || 0;
		newPlanner.total_combined_credits -= unitCP;
		if (deleted_unit[0].unit_row_id) {
			// Remove the unit from the semester
			unit => unit.unit_row_id !== deleted_unit[0].unit_row_id
			newPlanner.units_state.removed.push(deleted_unit[0].unit_row_id);

			//If it is in edited, it should be removed from edited
			newPlanner.units_state.edited = newPlanner.units_state.edited.filter(
				unit => unit.unit_row_id !== deleted_unit[0].unit_row_id
			);
		}
		if (deleted_unit[0].unit_type) {
			const unit_types_removed = [deleted_unit[0].unit_type._name];
			if (unit_types_removed.length > 0) {
				newPlanner.RemoveUnusedUnitTypes(unit_types_removed);
			}
		}

		// Remove the unit from units_state.added if it exists
		newPlanner.units_state.added = newPlanner.units_state.added.filter(unit =>
			!(unit.year_to_add === year &&
				unit.sem_index_to_add === sem_index &&
				unit.unit_index_to_add === unit_index)
		);

		// Adjust indices of subsequent units in the same semester
		newPlanner.units_state.added = newPlanner.units_state.added.map(unit => {
			if (unit.year_to_add === year &&
				unit.sem_index_to_add === sem_index &&
				unit.unit_index_to_add > unit_index) {
				return {
					...unit,
					unit_index_to_add: unit.unit_index_to_add - 1
				};
			}
			return unit;
		});

		// Check for conflicts in all subsequent units
		for (let y = year; y <= newPlanner.years.length; y++) {
			const currentYear = newPlanner.years.find(yr => yr.year === y);
			if (!currentYear) continue;

			for (let s = 0; s < currentYear.semesters.length; s++) {
				const semester = currentYear.semesters[s];
				for (let u = 0; u < semester.units.length; u++) {
					const unit = semester.units[u];
					if (unit.unit && unit.requisites && unit.requisites.length > 0) {
						const requisiteResult = newPlanner.CheckUnitRequisites(unit, y, s);
						unit.has_conflict = !requisiteResult.isValid;
					}
				}
			}
		}

		// Recalculate elective numbers
		return RecalculateElectiveNumbers(newPlanner);
	}

	//UPDATE ALL REFERENCES TO THIS TO HAVE UNIT_DATA TO HAVE UNIT_ID
	EditUnitInUnitRow(year, sem_index, unit_index, unit_data, status = null, master_mode = true) {
		const newPlanner = this.Clone();
		const targetYear = newPlanner.years.find(y => y.year === year);
		if (!targetYear) {
			throw new Error(`Year ${year} not found`);
		}

		const targetSemester = targetYear.semesters[sem_index];
		if (!targetSemester) {
			throw new Error(`Semester ${sem_index} not found in year ${year}`);
		}

		const targetUnit = targetSemester.units[unit_index];
		if (!targetUnit) {
			throw new Error(`Unit ${unit_index} not found in semester ${sem_index} of year ${year}`);
		}

		// Calculate credit point difference
		const oldCP = targetUnit.unit?.credit_points || 0;

		let newCP = 0;

		if (master_mode) {
			newCP = unit_data?.unit_cp || 0;
		} else {
			if (status != 'fail') {
				newCP = unit_data?.unit_cp || 0;
			} else {
				newCP = 0;
			}
		}

		if (unit_data?.unit_type?._name?.toLowerCase() === "elective") {
			if (unit_data?.unit_name) {
				if (unit_data?.unit_name.startsWith("Elective")) {
					newCP = 12.5;
				}
			} else {
				newCP = 12.5;
			}
		}
		const cpDifference = newCP - oldCP;

		if (
			unit_data?.unit_type?._name?.toLowerCase() === "elective" &&
			(
				(typeof unit_data?.unit_name === "string" && unit_data.unit_name.toLowerCase().includes("elective")) ||
				unit_data?.unit_name == null
			)
		) {
			unit_data.unit_availability = 'published'
			unit_data.is_offered = true;
		}

		// Check for requisite conflicts
		const requisiteResult = this.CheckUnitRequisites({
			unit: {
				code: unit_data?.unit_code || null,
				name: unit_data?.unit_name || null,
				credit_points: newCP
			},
			requisites: unit_data?.unit_requisites || []
		}, year, sem_index, master_mode);

		// Update the unit data
		targetUnit.unit_type = unit_data?.unit_type;
		targetUnit.is_offered = unit_data?.is_offered;
		targetUnit.unit = {
			unit_id: unit_data.unit_id,
			code: unit_data?.unit_code || null,
			name: unit_data?.unit_name || null,
			credit_points: newCP,
			availability: unit_data?.unit_availability || null
		};
		targetUnit.requisites = unit_data?.unit_requisites || [];
		targetUnit.has_conflict = !requisiteResult.isValid;

		if (status) {
			targetUnit.status = status;
		}

		// Update details.unit_types
		if (targetUnit.unit_type && targetUnit.unit_type._name) {
			// Add new unit type to details.unit_types if it doesn't exist
			const typeExists = newPlanner.details.unit_types.some(type => type._name === targetUnit.unit_type._name);
			if (!typeExists) {
				newPlanner.details.unit_types.push(targetUnit.unit_type);
			}
		}

		// Update total combined credits
		newPlanner.total_combined_credits += cpDifference;

		// Check for conflicts in all subsequent units
		// First, check remaining semesters in current year
		for (let s = sem_index; s < targetYear.semesters.length; s++) {
			const semester = targetYear.semesters[s];
			for (let u = 0; u < semester.units.length; u++) {
				const unit = semester.units[u];
				if (unit.unit && unit.requisites && unit.requisites.length > 0) {
					const requisiteResult = newPlanner.CheckUnitRequisites(unit, year, s, master_mode);
					unit.has_conflict = !requisiteResult.isValid;
				}
			}
		}

		// Then check all semesters in subsequent years
		for (let y = year + 1; y <= newPlanner.years.length; y++) {
			const currentYear = newPlanner.years.find(yr => yr.year === y);
			if (!currentYear) continue;

			for (let s = 0; s < currentYear.semesters.length; s++) {
				const semester = currentYear.semesters[s];
				for (let u = 0; u < semester.units.length; u++) {
					const unit = semester.units[u];
					if (unit.unit && unit.requisites && unit.requisites.length > 0) {
						const requisiteResult = newPlanner.CheckUnitRequisites(unit, y, s, master_mode);
						unit.has_conflict = !requisiteResult.isValid;
					}
				}
			}
		}

		if (targetUnit.unit_row_id) {
			const index = newPlanner.units_state.edited.findIndex(
				(unit) => unit.unit_row_id === targetUnit.unit_row_id
			);

			const updatedUnit = {
				unit_row_id: targetUnit.unit_row_id,
				unit_id: unit_data?.unit_id ?? null,
				unit_type_id: targetUnit.unit_type?._type_id ?? null,
				unit_code: targetUnit.unit?.code ?? null,
			};

			console.log('updatedUnit', updatedUnit)

			if (index !== -1) {
				// Unit already exists, update it
				newPlanner.units_state.edited[index] = updatedUnit;
			} else {
				// Unit does not exist, push it
				newPlanner.units_state.edited.push(updatedUnit);
			}
		}

		// Update the unit in units_state.added if it exists
		const addedUnitIndex = newPlanner.units_state.added.findIndex(unit =>
			unit.year_to_add === year &&
			unit.sem_index_to_add === sem_index &&
			unit.unit_index_to_add === unit_index
		);

		if (addedUnitIndex !== -1) {
			newPlanner.units_state.added[addedUnitIndex] = {
				...newPlanner.units_state.added[addedUnitIndex],
				unit_id: unit_data?.unit_id,
				unit_type_id: targetUnit.unit_type?._type_id ?? null,
				unit_code: targetUnit.unit?.code ?? null
			};
		}
		newPlanner.RemoveAllUnusedUnitTypes();

		// Recalculate elective numbers
		return RecalculateElectiveNumbers(newPlanner);
	}

	// Returns an array of all conflict units with their year, semester, and unit index
	GetConflictingUnitsIndex(include_status = false) {
		let conflicts = [];

		for (let year_index = 0; year_index < this.years.length; year_index++) {
			const year = this.years[year_index];
			let year_num = year_index + 1;

			for (let sem_index = 0; sem_index < year.semesters.length; sem_index++) {
				const sem = year.semesters[sem_index];
				if (sem.sem_completed) continue;

				for (let unit_index = 0; unit_index < sem.units.length; unit_index++) {
					const unit = sem.units[unit_index];
					console.log('unit with status', unit);

					if (!unit.unit || !unit.unit.code) continue;
					if (unit.status === 'pass' || unit.status === 'fail') continue;

					if (include_status && unit.unit.availability !== "published") {
						conflicts.push({ year_num, sem_index, unit_index });
						break;
					}

					if (unit.has_conflict || !unit.is_offered) {
						conflicts.push({ year_num, sem_index, unit_index });
					}
				}
			}
		}

		return conflicts;
	}

	SwapUnits(sourceYear, sourceSemIndex, sourceUnitIndex, targetYear, targetSemIndex, targetUnitIndex, master_mode = true) {
		const newPlanner = this.Clone();

		// Get source unit data
		const sourceYearObj = newPlanner.years.find(y => y.year === sourceYear);
		if (!sourceYearObj) {
			throw new Error(`Source year ${sourceYear} not found`);
		}

		const sourceSem = sourceYearObj.semesters[sourceSemIndex];
		if (!sourceSem) {
			throw new Error(`Source semester ${sourceSemIndex} not found in year ${sourceYear}`);
		}

		const sourceUnit = sourceSem.units[sourceUnitIndex];
		if (!sourceUnit) {
			throw new Error(`Source unit ${sourceUnitIndex} not found in semester ${sourceSemIndex} of year ${sourceYear}`);
		}

		// Get target unit data
		const targetYearObj = newPlanner.years.find(y => y.year === targetYear);
		if (!targetYearObj) {
			throw new Error(`Target year ${targetYear} not found`);
		}

		const targetSem = targetYearObj.semesters[targetSemIndex];
		if (!targetSem) {
			throw new Error(`Target semester ${targetSemIndex} not found in year ${targetYear}`);
		}

		const targetUnit = targetSem.units[targetUnitIndex];
		if (!targetUnit) {
			throw new Error(`Target unit ${targetUnitIndex} not found in semester ${targetSemIndex} of year ${targetYear}`);
		}

		// Create unit data objects for swapping
		const sourceUnitData = {
			unit_id: sourceUnit.unit?.unit_id,
			unit_code: sourceUnit.unit?.code || null,
			unit_name: sourceUnit.unit?.name || null,
			unit_cp: sourceUnit.unit?.credit_points || 0,
			unit_requisites: sourceUnit.requisites || [],
			unit_type: sourceUnit.unit_type,
			is_offered: CheckUnitOffering(sourceUnit, targetSem.sem_term),
			unit_availability: sourceUnit.unit?.availability
		};

		const targetUnitData = {
			unit_id: targetUnit.unit?.unit_id,
			unit_code: targetUnit.unit?.code || null,
			unit_name: targetUnit.unit?.name || null,
			unit_cp: targetUnit.unit?.credit_points || 0,
			unit_requisites: targetUnit.requisites || [],
			unit_type: targetUnit.unit_type,
			is_offered: CheckUnitOffering(targetUnit, sourceSem.sem_term),
			unit_availability: targetUnit.unit?.availability
		};
		let final_swap;
		// Swap the units by chaining the edits
		if (targetUnitData.unit_name == null) {
			const firstSwap = newPlanner.EditUnitInUnitRow(targetYear, targetSemIndex, targetUnitIndex, sourceUnitData, null, master_mode);
			final_swap = firstSwap.DeleteUnitRowFromSemester(sourceYear, sourceSemIndex, sourceUnitIndex);
		} else {
			const firstSwap = newPlanner.EditUnitInUnitRow(sourceYear, sourceSemIndex, sourceUnitIndex, targetUnitData, null, master_mode);
			final_swap = firstSwap.EditUnitInUnitRow(targetYear, targetSemIndex, targetUnitIndex, sourceUnitData, null, master_mode);
		}

		return final_swap;
	}

	/**
	 * Gets the position of a unit in the planner
	 * @param {string} unitCode - The code of the unit to find
	 * @returns {Object|null} Returns an object with year, semesterIndex, and unitIndex if found, null otherwise
	 */
	GetUnitPosition(unitCode = null, master_mode = true, get_empty = false, unitID = null) {
		for (let yearIndex = 0; yearIndex < this.years.length; yearIndex++) {
			const year = this.years[yearIndex];
			for (let semIndex = 0; semIndex < year.semesters.length; semIndex++) {
				const semester = year.semesters[semIndex];
				for (let unitIndex = 0; unitIndex < semester.units.length; unitIndex++) {
					const unit = semester.units[unitIndex];
					if (get_empty) {
						if (!unit.unit_type) {
							return {
								year: year.year,
								semesterIndex: semIndex,
								unitIndex: unitIndex,
								semID: semester.sem_id ?? null
							};
						} else if (unit.unit.name == null) {
							return {
								year: year.year,
								semesterIndex: semIndex,
								unitIndex: unitIndex,
								semID: semester.sem_id ?? null
							};
						}
						continue;
					}
					if (unitID) {
						if (unit.unit?.unit_id === unitID) {
							console.log('unit in planner', unit)
							if (master_mode) {
								return {
									year: year.year,
									semesterIndex: semIndex,
									unitIndex: unitIndex,
									semID: semester.sem_id ?? null

								};
							} else {
								if (unit.status == 'planned') {
									return {
										year: year.year,
										semesterIndex: semIndex,
										unitIndex: unitIndex,
										semID: semester.sem_id ?? null
									};
								}
							}
						}
					}
				}
			}
		}

		if (!unitID) {
			return null;
		}
		return null;
	}

	GetUnit(unitCode, master_mode = true) {
		for (let yearIndex = 0; yearIndex < this.years.length; yearIndex++) {
			const year = this.years[yearIndex];
			for (let semIndex = 0; semIndex < year.semesters.length; semIndex++) {
				const semester = year.semesters[semIndex];
				for (let unitIndex = 0; unitIndex < semester.units.length; unitIndex++) {
					const unit = semester.units[unitIndex];
					if (unit.unit?.code === unitCode) {
						if (master_mode) {
							return {
								unit
							};
						} else {
							if (unit.status == 'planned') {
								return {
									unit
								};
							}
						}
					}
				}
			}
		}
		if (!unitCode) {
			return null;
		}
		return null;
	}

	CleanStudyPlanner(master_mode = true) {
		const newPlanner = this.Clone();
		const semestersToRemove = [];
		const yearToRemove = []

		// Identify empty semesters to remove
		for (let yearIndex = 0; yearIndex < newPlanner.years.length; yearIndex++) {
			const year = newPlanner.years[yearIndex];

			if (year.semesters.length == 0) {
				yearToRemove.push(year.year)
			}

			for (let semIndex = 0; semIndex < year.semesters.length; semIndex++) {
				const semester = year.semesters[semIndex];
				// Update unit has_conflict or is_offered status
				for (let u = 0; u < semester.units.length; u++) {
					const unit = semester.units[u];

					// Check unit requisites
					if (unit.unit && unit.requisites && unit.requisites.length > 0) {
						const requisiteResult = newPlanner.CheckUnitRequisites(unit, yearIndex + 1, semIndex, master_mode);
						unit.has_conflict = !requisiteResult.isValid;
					}

					// Check unit offering
					if (unit.unit && unit.unit.code) {
						try {
							unit.is_offered = CheckUnitOffering(unit, semester.sem_term);
						} catch (error) {
							console.error("Error checking unit offering:", error);
							unit.is_offered = false;
						}
					} else {
						unit.is_offered = true; // If unit is null or has no code, consider it offered
					}
				}

				// Skip the first semester of the first year (this should always exist)
				if (year.year === 1 && semIndex === 0) continue;

				// Check if the semester has any valid units
				const hasRealUnits = semester.units.some(unit => {
					// Regular units with code are valid
					if ((unit.unit && unit.unit.code) || (unit.unit_row_id)) {
						return true;
					}

					// Elective units with no code but "Elective" in name are also valid
					// if the unit type is also an elective
					if (unit.unit && unit.unit.name &&
						unit.unit.name.toLowerCase().includes('elective') &&
						unit.unit_type && unit.unit_type._name &&
						unit.unit_type._name.toLowerCase().includes('elective')) {
						return true;
					}

					return false;
				});

				if (!hasRealUnits) {
					semestersToRemove.push({
						year: year.year,
						semIndex: semIndex
					});
				}
			}
		}

		console.log('yearToRemove', yearToRemove)
		for (let x = yearToRemove.length - 1; x >= 0; x--) {
			const year_to_remove = yearToRemove[x];
			const result = newPlanner.RemoveYear(year_to_remove);
			Object.assign(newPlanner, result);
		}

		// Remove empty semesters in reverse order to avoid index shifting issues
		for (let i = semestersToRemove.length - 1; i >= 0; i--) {
			const { year, semIndex } = semestersToRemove[i];
			try {
				// Use the existing RemoveSemester method
				const result = newPlanner.RemoveSemester(year, semIndex, false);

				console.log('test', result.GetYearByIndex(year))
				if (result) {
					Object.assign(newPlanner, result);
				}
			} catch (error) {
				console.error(`Failed to remove semester ${semIndex} in year ${year}:`, error.message);
			}
		}

		return newPlanner;
	}

	/**
	 * Creates a clone of the current StudyPlanner instance
	 * @returns {StudyPlanner} A new StudyPlanner instance with the same data
	 */
	Clone() {
		const newPlanner = new StudyPlanner();
		let currentElectiveNumber = 1;

		// Deep clone details
		newPlanner.details = {
			...this.details,
			course: { ...this.details.course },
			intake: { ...this.details.intake },
			unit_types: this.details.unit_types.map(type => ({ ...type })),
			recommended_electives: this.details.recommended_electives.map(elective => ({ ...elective }))
		};

		// Deep clone years and their nested objects
		newPlanner.years = this.years.map(year => ({
			year: year.year,
			semesters: year.semesters.map(semester => ({
				...semester,
				intake: { ...semester.intake },
				units: semester.units.map(unit => {
					// Create the cloned unit
					const clonedUnit = {
						...unit,
						unit_type: unit.unit_type ? { ...unit.unit_type } : null,
						unit: unit.unit ? { ...unit.unit } : null,
						requisites: unit.requisites ? [...unit.requisites] : []
					};

					return clonedUnit;
				})
			}))
		}));

		// Clone other properties
		newPlanner.total_combined_credits = this.total_combined_credits;
		newPlanner.elective_counter = currentElectiveNumber - 1;
		newPlanner.last_modified = this.last_modified ? { ...this.last_modified } : null; // Clone last modified info

		// Deep clone states
		newPlanner.semester_state = {
			added: this.semester_state.added.map(added => ({ ...added })),
			removed: [...this.semester_state.removed]
		};

		newPlanner.units_state = {
			added: this.units_state.added.map(added => ({ ...added })),
			edited: this.units_state.edited.map(edited => ({ ...edited })),
			removed: [...this.units_state.removed]
		};

		return newPlanner;
	}

	/**
	 * Checks if a unit can be added to a specific semester based on its requisites
	 * @param {Object} unit - The unit to check
	 * @param {number} targetYear - Target year number
	 * @param {number} targetSemIndex - Target semester index
	 * @returns {Object} Result containing isValid and messages
	 */
	CheckUnitRequisites(unit, targetYear, targetSemIndex, master_mode = true) {
		if (!master_mode) {
			if (unit.status == 'pass' || unit.status == 'fail') {
				return { isValid: true, messages: [] };
			}
		}
		const results = {
			isValid: true,
			messages: []
		};

		let requisites = unit.requisites ? unit.requisites : unit._requisites;
		if (requisites.length === 0) {
			return results;
		}

		// First, evaluate each requisite individually
		const evaluatedRequisites = requisites.map(req => {
			let result;
			switch (req._unit_relationship?.toLowerCase()) {
				case 'pre':
					result = CheckPrerequisite(this.years, req, targetYear, targetSemIndex, master_mode);
					break;
				case 'co':
					result = CheckCorequisite(this.years, req, targetYear, targetSemIndex, master_mode);
					break;
				case 'anti':
					result = CheckAntirequisite(this.years, req, targetYear, targetSemIndex, master_mode);
					break;
				case 'min':
					result = CheckMinCP(this.years, req, targetYear, targetSemIndex, master_mode);
					break;
				default:
					result = { isValid: true, messages: [] };
			}
			return {
				...result,
				operator: req._operator?.toLowerCase() || 'or'
			};
		});

		// Now build the evaluation tree properly
		let currentResult = evaluatedRequisites[0].isValid;
		let currentMessages = evaluatedRequisites[0].messages;

		// We'll track OR groups separately
		const messageGroups = [];
		let currentOrGroup = {
			isValid: currentResult,
			messages: currentMessages.length > 0 ? [...currentMessages] : []
		};

		for (let i = 1; i < evaluatedRequisites.length; i++) {
			const req = evaluatedRequisites[i];
			const prevOperator = evaluatedRequisites[i - 1].operator;

			if (prevOperator === 'and') {
				// AND operation - both sides must be true

				// First, finalize any existing OR group
				if (currentOrGroup.messages.length > 0 && !currentOrGroup.isValid) {
					messageGroups.push({
						type: 'or',
						messages: [...currentOrGroup.messages]
					});
				}
				currentOrGroup = { isValid: false, messages: [] };

				currentResult = currentResult && req.isValid;

				// For AND, we always track the message if invalid
				if (!req.isValid) {
					messageGroups.push({
						type: 'single',
						messages: [...req.messages]
					});
				}
			} else {
				// OR operation - either side can be true
				const newValid = currentResult || req.isValid;

				// If the OR group becomes valid, clear it
				if (newValid && !currentResult) {
					currentOrGroup = { isValid: true, messages: [] };
				}
				// Only add to OR group if not valid
				else if (!req.isValid) {
					if (currentOrGroup.messages.length > 0) {
						currentOrGroup.messages.push('OR');
					}
					currentOrGroup.messages.push(...req.messages);
				}

				currentResult = newValid;
			}
		}

		// Add any remaining OR group if invalid
		if (currentOrGroup.messages.length > 0 && !currentOrGroup.isValid) {
			messageGroups.push({
				type: 'or',
				messages: [...currentOrGroup.messages]
			});
		}

		// Format the final messages only if overall result is invalid
		if (!currentResult && messageGroups.length > 0) {
			const formattedMessages = [];

			for (const group of messageGroups) {
				if (group.type === 'or') {
					const orStatements = [];
					let currentStatement = [];

					for (const item of group.messages) {
						if (item === 'OR') {
							orStatements.push(currentStatement.join(' '));
							currentStatement = [];
						} else {
							currentStatement.push(item);
						}
					}
					orStatements.push(currentStatement.join(' '));

					formattedMessages.push(
						`At least one of the following must be satisfied:\n` +
						orStatements.join('\nOR\n')
					);
				} else {
					formattedMessages.push(group.messages.join(' '));
				}
			}

			// Join groups with AND
			results.messages = [];
			for (let i = 0; i < formattedMessages.length; i++) {
				results.messages.push(formattedMessages[i]);
				if (i < formattedMessages.length - 1) {
					results.messages.push('AND');
				}
			}
		}

		results.isValid = currentResult;
		return results;
	}

	GetAllPassedUnits() {
		const passedUnits = [];
		for (const year of this.years) {
			for (const semester of year.semesters) {
				for (const unit of semester.units) {
					if (unit.status === 'pass') {
						passedUnits.push(unit);
					}
				}
			}
		}
		return passedUnits;
	}

	GetAllConflicts() {
		const conflicts = [];

		// Process all units across all years and semesters
		for (const year of this.years) {
			for (const semester of year.semesters) {
				// Skip completed semesters
				if (semester.sem_completed) continue;

				for (const unit of semester.units) {

					if (unit.status) {
						// If its either pass or fail, then dont count it as conflict because its taken already
						if (unit.status != 'planned') {
							continue;
						}
					}


					// Skip empty unit slots
					if (!unit.unit_type || !unit.unit || !unit.unit.code) continue;

					if (unit.unit.availability != 'published') {
						conflicts.push({
							unit_code: unit.unit.code,
							unit_name: unit.unit.name,
							year: year.year,
							semester: semester.sem_name,
							semester_term: semester.sem_term,
							unit_type: unit.unit_type?._name || 'Unknown',
							unit_type_color: unit.unit_type?._color || '#CCCCCC',
							issue: unit.unit.availability.charAt(0).toUpperCase() + unit.unit.availability.slice(1),
							issue_type: 'not_available'
						});
						continue
					}

					// Check if unit has a conflict (prerequisite issue) or is not offered
					if (unit.has_conflict || !unit.is_offered) {
						conflicts.push({
							unit_code: unit.unit.code,
							unit_name: unit.unit.name,
							year: year.year,
							semester: semester.sem_name,
							semester_term: semester.sem_term,
							unit_type: unit.unit_type?._name || 'Unknown',
							unit_type_color: unit.unit_type?._color || '#CCCCCC',
							issue: unit.has_conflict ? 'Requisite conflict' : 'Not offered in semester',
							issue_type: unit.has_conflict ? 'conflict' : 'not_offered'
						});
					}
				}
			}
		}
		return conflicts;
	}

	/**
	 * Gets all unit types that are currently in use in the study planner
	 * @returns {Set<string>} Set of unit type names that are in use
	 */
	GetAllUnitTypeUsed() {
		const usedUnitTypes = new Set();

		// Check all units in the planner
		for (const year of this.years) {
			for (const semester of year.semesters) {
				for (const unit of semester.units) {
					if (unit.unit_type && unit.unit_type._name) {
						usedUnitTypes.add(unit.unit_type._name);
					}
				}
			}
		}

		return usedUnitTypes;
	}

	/**
	 * Removes unit types that are no longer in use from the planner's unit_types array
	 * @param {string[]} unit_typesToCheck - Array of unit type names to check for removal
	 */
	RemoveUnusedUnitTypes(unit_typesToCheck) {
		if (!unit_typesToCheck || unit_typesToCheck.length === 0) {
			return;
		}

		const usedUnitTypes = this.GetAllUnitTypeUsed();

		// Filter out unused unit types
		this.details.unit_types = this.details.unit_types.filter(type =>
			usedUnitTypes.has(type._name) || !unit_typesToCheck.includes(type._name)
		);
	}

	/**
	 * Checks and removes all unused unit types from the planner
	 * This function will scan through all units in the planner and remove any unit types
	 * that are not currently being used by any unit
	 */
	RemoveAllUnusedUnitTypes() {
		// Get all unit types that are currently in use
		const usedUnitTypes = this.GetAllUnitTypeUsed();

		// Filter out any unit types that are not in use
		this.details.unit_types = this.details.unit_types.filter(type =>
			usedUnitTypes.has(type._name)
		);
	}

	async ImportPlannerData(target_course_intake_id) {
		const target_planner_data_res = await MasterStudyPlannerDB.GetPlannerData(this.majorID, target_course_intake_id)
		const target_planner_data = target_planner_data_res.data;
		console.log('target_planner_data', target_planner_data)

		const rawSemesters = target_planner_data.semesters || [];
		target_planner_data.semesters = ConvertSemArrayToSemesterObject(rawSemesters)

		let { units_res, unit_types_res } = await GetUnitsAndUnitTypesRes(target_planner_data.units_in_semester);

		const built = BuildYearsFromData({
			semester_in_study_planner_year_res: target_planner_data.semesters,
			units_in_semester_res: target_planner_data.units_in_semester,
			units_res: units_res,
			unit_types_res: unit_types_res,
			term_data: {
				"_name": this.intakeName,
				"_year": this.intakeYear,
				"_month": this.intakeMonth,
				"_semtype": this.intakeSemType
			},
			initialIntakeYear: this.details.intake.year
		});

		let empty_planner = this.RemoveAllPlannerData()
		console.log('built', built)

		let imported_planner = AddImportedDataIntoPlanner(built.years, empty_planner);
		console.log('imported_planner', imported_planner)

		imported_planner.total_combined_credits = built.total_combined_credits;

		// Set unit types
		imported_planner.details.unit_types = built.unit_types_list;

		imported_planner = imported_planner.CleanStudyPlanner(false);
		imported_planner.UpdateStatus()

		return imported_planner
	}

	async FetchAvailablePlanner() {
		return await MasterStudyPlannerDB.GetAvailableIntakes(this.majorID, this.courseIntakeID, this.intakeSemType);
	}

	RemoveAllPlannerData() {
		let planner = this.Clone();
		const total_years = planner.years.length

		//Remove all the year except the first year
		for (let x = total_years; x > 1; x--) {
			planner = planner.RemoveYear(x);
		}

		//Remove all the semesters before the first semester for the first year
		for (let x = planner.years[0].semesters.length; x > 1; x--) {
			let sem_index = x - 1;
			planner = planner.RemoveSemester(1, sem_index, false)
		}

		let first_year_units_length = planner.years[0].semesters[0].units.length
		while (first_year_units_length != 0) {
			planner = planner.DeleteUnitRowFromSemester(1, 0, 0)
			first_year_units_length = planner.years[0].semesters[0].units.length
		}
		return planner;
	}

	GetCPSummaryByUnitType() {
		const cp_summary = {};
		for (const year of this.years) {
			for (const semester of year.semesters) {
				for (const unit of semester.units) {
					if (unit.unit_type && unit.unit_type._name && unit.unit && unit.unit.credit_points) {
						console.log('unit.unit_type', unit.unit_type)
						const typeName = unit.unit_type._name;
						const type_id = unit.unit_type._type_id;
						const cp = unit.unit.credit_points;

						if (!cp_summary[type_id]) {
							cp_summary[type_id] = {
								type_id: type_id,
								name: typeName,
								color: unit.unit_type._color,
								total_cp: cp,
								count: 1
							};
						} else {
							cp_summary[type_id].total_cp += cp;
							cp_summary[type_id].count += 1;
						}
					}
				}
			}
		}
		return cp_summary;
	}

	async SaveToDB(toPublish = false) {
		let new_status = this.UpdateStatus();
		if (!new_status.is_complete && !new_status.status === "Empty") {
			return { success: false, message: new_status.message };
		}

		return await MasterStudyPlannerDB.SaveToDB(this, toPublish);
	}
}
export default StudyPlanner;

// ------------------------------
// Helper functions extracted from StudyPlanner.Init
// ------------------------------

async function FetchMasterPlannerContext(master_study_planner_id) {
	const response = await MasterStudyPlannerDB.FetchMasterStudyPlanners({ id: master_study_planner_id, get_all: true });
	const master_study_planner_data = response[0];
	if (!master_study_planner_data) return null;

	const rawSemesters = master_study_planner_data.full_data.semesters || [];
	master_study_planner_data.full_data.semesters = ConvertSemArrayToSemesterObject(rawSemesters)

	let { units_res, unit_types_res } = await GetUnitsAndUnitTypesRes(master_study_planner_data.full_data.units_in_semester);

	const units_in_semester_res = master_study_planner_data.full_data.units_in_semester;
	const course_data = master_study_planner_data.full_data.course_data;
	const course_intake_data = master_study_planner_data.full_data.course_intake;
	const major_data = master_study_planner_data.full_data.major_data;
	const term_data = master_study_planner_data.full_data.term_data;
	const semester_in_study_planner_year_res = master_study_planner_data.full_data.semesters;

	return {
		master_study_planner_data,
		course_data,
		major_data,
		term_data,
		semester_in_study_planner_year_res,
		units_in_semester_res,
		units_res,
		unit_types_res,
		last_modified: master_study_planner_data.last_modified || null,
		course_intake_data
	};
}

function BuildYearsFromData({ semester_in_study_planner_year_res, units_in_semester_res, units_res, unit_types_res, term_data, initialIntakeYear }) {
	const all_units_offered = unit_term_offered_arr;

	const years_map = new Map();
	const intial_intake_year = initialIntakeYear;
	let lastLongSemesterNumber = 0;

	const max_year = Math.max(...semester_in_study_planner_year_res.map(sem => sem.year));
	for (let y = 1; y <= max_year; y++) {
		years_map.set(y, { year: y, semesters: [] });
	}

	const sorted_sems = [...semester_in_study_planner_year_res].sort((a, b) => {
		if (a.year !== b.year) return a.year - b.year;
		return a._id - b._id;
	});


	sorted_sems.forEach(sem => {
		let prev_sem = null;
		let is_found_prev_sem = false;

		const currentYearSemesters = years_map.get(sem.year).semesters;
		if (currentYearSemesters.length > 0) {
			prev_sem = currentYearSemesters[currentYearSemesters.length - 1];
			is_found_prev_sem = true;
		}

		if (!is_found_prev_sem) {
			for (let y = sem.year - 1; y >= 1; y--) {
				const prevYear = years_map.get(y);
				if (prevYear && prevYear.semesters && prevYear.semesters.length > 0) {
					const lastSem = prevYear.semesters[prevYear.semesters.length - 1];
					prev_sem = lastSem;
					is_found_prev_sem = true;
					break;
				}
			}
		}

		let sem_name = '';
		let intake_month = '';
		let intake_year = intial_intake_year + (sem.year - 1);
		let sem_term = '';

		if (!is_found_prev_sem) {
			if (term_data._semtype === "Short Semester") {
				if (term_data._month < 6) {
					intake_month = "Jan";
					sem_name = 'Summer Term';
					sem_term = 'Summer'
				} else {
					intake_month = "Jul";
					sem_name = "Winter Term";
					sem_term = "Winter";
				}
				lastLongSemesterNumber = 0;
				sem._sem_type = "Short Semester"
			} else {
				if (term_data._month < 6) {
					intake_month = "Feb/Mar";
					sem_name = 'Semester 1';
					sem_term = 'Semester 1'
				} else {
					intake_month = "Aug/Sept";
					sem_name = "Semester 1";
					sem_term = "Semester 1";
				}
				lastLongSemesterNumber = 1;
				sem._sem_type = "Long Semester"
			}
		} else {
			const last_intake_month = prev_sem.intake.month;
			const last_intake_year = prev_sem.intake.year;

			if (sem.sem_type === "Short Semester") {
				if (last_intake_month === "Jan") {
					intake_month = "Jul";
					sem_name = "Winter Term";
					sem_term = "Winter";
				} else if (last_intake_month === "Jul") {
					intake_month = "Jan";
					sem_name = "Summer Term";
					sem_term = "Summer";
					intake_year = last_intake_year + 1;
				} else if (last_intake_month === "Feb/Mar") {
					intake_month = "Jul";
					sem_name = "Winter Term";
					sem_term = "Winter";
				} else if (last_intake_month === "Aug/Sept") {
					intake_month = "Jan";
					sem_name = "Summer Term";
					sem_term = "Summer";
					intake_year = last_intake_year + 1;
				}
			} else {
				if (last_intake_month === "Jan") {
					intake_month = "Feb/Mar";
					lastLongSemesterNumber++;
					sem_name = `Semester ${lastLongSemesterNumber}`;
					sem_term = "Semester 1";
				} else if (last_intake_month === "Jul") {
					intake_month = "Aug/Sept";
					lastLongSemesterNumber++;
					sem_name = `Semester ${lastLongSemesterNumber}`;
					sem_term = "Semester 2";
				} else if (last_intake_month === "Feb/Mar") {
					intake_month = "Aug/Sept";
					lastLongSemesterNumber++;
					sem_name = `Semester ${lastLongSemesterNumber}`;
					sem_term = "Semester 2";
				} else if (last_intake_month === "Aug/Sept") {
					intake_month = "Feb/Mar";
					lastLongSemesterNumber++;
					sem_name = `Semester ${lastLongSemesterNumber}`;
					sem_term = "Semester 1";
					intake_year = last_intake_year + 1;
				}
			}
		}

		const semester = {
			sem_id: sem._id,
			sem_name: sem_name,
			sem_term: sem_term,
			sem_type: sem._sem_type,
			intake: { month: intake_month, year: intake_year },
			units: []
		};

		const units_in_semesters = units_in_semester_res.filter(unit => unit._semester_in_study_planner_year_id === sem._id);
		console.log('units_in_semesters', units_in_semesters)
		const unique_units_map = new Map();

		units_in_semesters.forEach(unit => {
			if (!unique_units_map.has(unit._id)) {
				let unit_data, unit_type;
				if (units_res) {
					unit_data = units_res.data.find(u => u._id === unit._unit_id);
				}
				if (unit_types_res && Array.isArray(unit_types_res.data)) {
					unit_type = unit_types_res.data.find(t => t.id === unit._unit_type_id);
				}

				const is_elective = unit_type?._name?.toLowerCase().includes('elective');
				let is_offered = true;

				if (is_elective) {
					if (!unit_data) {
						is_offered = true;
					} else {
						is_offered = all_units_offered.some(
							(offered) => offered._unit_code === unit._unit_code && offered._term_type === semester.sem_term
						);
					}
				} else {
					is_offered = all_units_offered.some(
						(offered) => offered._unit_code === unit._unit_code && offered._term_type === semester.sem_term
					);
				}

				const new_unit = {
					unit_row_id: unit._id,
					unit_type: unit_type ? { _type_id: unit_type._id, _name: unit_type._name || null, _color: unit_type._colour || null } : null,
					unit: null,
					requisites: [],
					has_conflict: false,
					is_offered: is_offered
				};

				if (unit_type?._name?.toLowerCase().includes('elective')) {
					if (!unit_data) {
						new_unit.unit = { unit_id: null, code: null, name: null, credit_points: 12.5 };
					} else {
						new_unit.unit = { unit_id: unit._unit_id, code: unit._unit_code, name: unit_data._name || '', credit_points: unit_data._credit_points, availability: unit_data._availability };
						new_unit.requisites = unit_data._requisites || [];
					}
				} else if (unit_data) {
					new_unit.unit = { unit_id: unit._unit_id, code: unit._unit_code, name: unit_data._name || '', credit_points: unit_data._credit_points, availability: unit_data._availability };
					new_unit.requisites = unit_data._requisites || [];
				}

				unique_units_map.set(unit._id, new_unit);
			}
		});

		semester.units = Array.from(unique_units_map.values()).sort((a, b) => (a.unit_row_id || 0) - (b.unit_row_id || 0));
		if (semester.units.length === 0) {
			semester.units = [];
		}

		years_map.get(sem.year).semesters.push(semester);
	});

	const years = Array.from(years_map.values()).sort((a, b) => a.year - b.year);

	const total_combined_credits = years.reduce((total, year) => {
		return year.semesters.reduce((yearSum, semester) => {
			return semester.units.reduce((semesterSum, unit) => {
				return semesterSum + (unit.unit?.credit_points || 0);
			}, yearSum);
		}, total);
	}, 0);

	const seen = new Set();
	const unit_types_list = units_in_semester_res
		.map(unit => {
			let unit_type;
			if (unit_types_res && Array.isArray(unit_types_res.data)) {
				unit_type = unit_types_res.data.find(t => t.id === unit._unit_type_id);
			}
			if (!unit_type) return null;
			const key = unit_type._id;
			if (seen.has(key)) return null;
			seen.add(key);
			return { _name: unit_type._name, _color: unit_type._colour };
		})
		.filter(Boolean);

	return { years, total_combined_credits, unit_types_list };
}

/**
 * Checks if minimum credit points requirement is satisfied
 * @param {Object} req - The requisite to check
 * @param {number} targetYear - Target year number
 * @param {number} targetSemIndex - Target semester index
 * @returns {Object} Result containing isValid and messages
 */
function CheckMinCP(years, req, targetYear, targetSemIndex, master_mode = true) {
	const result = { isValid: true, messages: [] };
	const minCP = req._minCP;
	if (!minCP) return result;
	// Calculate total credit points from previous semesters
	let totalCP = 0;
	for (let year = 1; year < targetYear; year++) {
		const yearObj = years.find(y => y.year === year);
		if (!yearObj) continue;
		for (const semester of yearObj.semesters) {
			if (master_mode) {
				totalCP += semester.units.reduce((sum, unit) => sum + (unit.unit?.credit_points || 0), 0);
			} else {
				totalCP += semester.units
					.filter(unit => unit.status !== 'fail')
					.reduce((sum, unit) => sum + (unit.unit?.credit_points || 0), 0);
			}
		}
	}

	// Add credit points from current year up to target semester
	const targetYearObj = years.find(y => y.year === targetYear);
	if (targetYearObj) {
		for (let semIndex = 0; semIndex < targetSemIndex; semIndex++) {
			const semester = targetYearObj.semesters[semIndex];
			if (semIndex == targetSemIndex) break;

			if (master_mode) {
				totalCP += semester.units.reduce((sum, unit) => sum + (unit.unit?.credit_points || 0), 0);
			} else {
				totalCP += semester.units
					.filter(unit => unit.status !== 'fail')
					.reduce((sum, unit) => sum + (unit.unit?.credit_points || 0), 0);
			}
		}
	}
	if (totalCP < minCP) {
		result.isValid = false;
		result.messages.push(`Minimum credit points (${minCP}) not satisfied. Current total: ${totalCP}`);
	}
	return result;
}

/**
	 * Checks if a prerequisite is satisfied
	 * @param {Object} req - The requisite to check
	 * @param {number} targetYear - Target year number
	 * @param {number} targetSemIndex - Target semester index
	 * @returns {Object} Result containing isValid and messages
	 */
function CheckPrerequisite(years, req, targetYear, targetSemIndex, master_mode = true) {
	const result = { isValid: true, messages: [] };
	const unitCode = req._requisite_unit_code;
	// Check if unit exists in previous semesters
	let found = false;
	for (let year = 1; year < targetYear; year++) {
		const yearObj = years.find(y => y.year === year);
		if (!yearObj) continue;
		for (let semIndex = 0; semIndex < yearObj.semesters.length; semIndex++) {
			const semester = yearObj.semesters[semIndex];
			if (master_mode) {
				if (semester.units.some((unit) => unit.unit?.code === unitCode)) {
					found = true;
					break;
				}
			} else {
				if (semester.units.some((unit) => unit.unit?.code === unitCode && unit.status != 'fail')) {
					found = true;
					break;
				}
			}
		}
		if (found) break;
	}

	// Also check current year up to target semester
	if (!found) {
		const currentYear = years.find(y => y.year === targetYear);
		if (currentYear) {
			for (let semIndex = 0; semIndex < targetSemIndex; semIndex++) {
				const semester = currentYear.semesters[semIndex];
				if (master_mode) {
					if (semester.units.some((unit) => unit.unit?.code === unitCode)) {
						found = true;
						break;
					}
				} else {
					if (semester.units.some((unit) => unit.unit?.code === unitCode && unit.status != 'fail')) {
						found = true;
						break;
					}
				}
			}
		}
	}

	if (!found) {
		result.isValid = false;
		result.messages.push(`Pre-Requisite ${unitCode}`);
	}
	return result;
}
/**
 * Checks if a corequisite is satisfied
 * @param {Object} req - The requisite to check
 * @param {number} targetYear - Target year number
 * @param {number} targetSemIndex - Target semester index
 * @returns {Object} Result containing isValid and messages
 */
function CheckCorequisite(years, req, targetYear, targetSemIndex, master_mode = true) {
	const result = { isValid: true, messages: [] };
	const unitCode = req._requisite_unit_code;
	// Check if unit exists in current or previous semesters
	let found = false;
	for (let year = 1; year <= targetYear; year++) {
		const yearObj = years.find(y => y.year === year);
		if (!yearObj) continue;
		for (let semIndex = 0; semIndex < yearObj.semesters.length; semIndex++) {
			// Skip if we're past the target semester in the current year
			if (year === targetYear && semIndex > targetSemIndex) break;
			const semester = yearObj.semesters[semIndex];
			if (master_mode) {
				if (semester.units.some((unit) => unit.unit?.code === unitCode)) {
					found = true;
					break;
				}
			} else {
				if (semester.units.some((unit) => unit.unit?.code === unitCode && unit.status != 'fail')) {
					found = true;
					break;
				}
			}
		}
		if (found) break;
	}
	if (!found) {
		result.isValid = false;
		result.messages.push(`Co-Requisite ${unitCode}`);
	}
	return result;
}
/**
 * Checks if an antirequisite is satisfied
 * @param {Object} req - The requisite to check
 * @param {number} targetYear - Target year number
 * @param {number} targetSemIndex - Target semester index
 * @returns {Object} Result containing isValid and messages
 */
function CheckAntirequisite(years, req, targetYear, targetSemIndex, master_mode = true) {
	const result = { isValid: true, messages: [] };
	const unitCode = req._requisite_unit_code;
	// Check if unit exists in the same semester
	const targetYearObj = years.find(y => y.year === targetYear);
	if (targetYearObj) {
		const targetSemester = targetYearObj.semesters[targetSemIndex];
		if (targetSemester.units.some(unit => unit.unit?.code === unitCode)) {
			result.isValid = false;
			result.messages.push(`Antirequisite ${unitCode}`);
		}
	}
	return result;
}
/**
	* Determines the next intake month and year based on the last semester's intake month
	* @param {string} last_intake_month - The last semester's intake month
	* @param {number} last_intake_year - The last semester's intake year
	* @param {string} semType - Type of semester ("Long Semester" or "Short Semester")
	* @returns {Object} Object containing nextIntakeMonth and nextIntakeYear
	*/
function DetermineNextIntake(last_intake_month, last_intake_year, semType) {
	let nextIntakeMonth;
	let nextIntakeYear = last_intake_year;

	if (semType === "Short Semester") {
		if (last_intake_month === "Jan") {
			nextIntakeMonth = "Jul";
		} else if (last_intake_month === "Jul") {
			nextIntakeMonth = "Jan";
			nextIntakeYear++;
		} else if (last_intake_month === "Feb/Mar") {
			nextIntakeMonth = "Jul";
		} else if (last_intake_month === "Aug/Sept") {
			nextIntakeMonth = "Jan";
			nextIntakeYear++;
		}
	} else {
		if (last_intake_month === "Jan") {
			nextIntakeMonth = "Feb/Mar";
		} else if (last_intake_month === "Jul") {
			nextIntakeMonth = "Aug/Sept";
		} else if (last_intake_month === "Feb/Mar") {
			nextIntakeMonth = "Aug/Sept";
		} else if (last_intake_month === "Aug/Sept") {
			nextIntakeMonth = "Feb/Mar";
			nextIntakeYear++;
		}
	}

	return { nextIntakeMonth, nextIntakeYear };
}

/**
 * Recursively finds the last semester from previous years
 * @param {number} startYear - The year to start checking from
 * @returns {Object|null} The last semester found or null if none found
 */
function FindLastSemesterFromPreviousYears(startYear, years) {
	let checkYear = startYear - 1;
	while (checkYear >= 1) {
		const previousYear = years.find(y => y.year === checkYear);
		if (previousYear && previousYear.semesters.length > 0) {
			return previousYear.semesters[previousYear.semesters.length - 1];
		}
		checkYear--;
	}
	return null;
}

/**
 * Gets the initial intake month based on the planner's intake month
 * @param {string} semType - Type of semester ("Long Semester" or "Short Semester")
 * @returns {Object} Object containing nextIntakeMonth and nextIntakeYear
 */
function GetInitialIntake(semType, details) {
	const nextIntakeYear = details.intake.year;
	const intakeMonth = parseInt(details.intake.month);
	let nextIntakeMonth;
	if (semType === "Short Semester") {
		nextIntakeMonth = intakeMonth < 6 ? "Jan" : "Jul";
	} else {
		nextIntakeMonth = intakeMonth < 6 ? "Feb/Mar" : "Aug/Sept";
	}
	return { nextIntakeMonth, nextIntakeYear };
}

async function GetUnitsAndUnitTypesRes(units) {
	let units_res, unit_types_res;
	//Update this to IDs
	const all_unit_ids = units.map(unit => unit._unit_id).filter(id => id !== null);
	const all_unit_types_ids = units.map(unit => unit._unit_type_id).filter(id => id !== null);
	if (all_unit_ids.length > 0) {
		units_res = await UnitDB.FetchUnits({ id: all_unit_ids });
	}
	if (all_unit_types_ids.length > 0) {
		unit_types_res = await UnitTypeDB.FetchUnitTypes({ ids: JSON.stringify(all_unit_types_ids) });
	}

	return { units_res, unit_types_res }
}

function ConvertSemArrayToSemesterObject(semester_arr) {
	return semester_arr.map(semData =>
		new SemesterInStudyPlannerYear({
			id: semData.ID ?? semData._id,
			master_study_planner_id: semData.MasterStudyPlannerID ?? semData._master_study_planner_id,
			year: semData.Year ?? semData._year,
			sem_type: semData.SemType ?? semData._sem_type
		})
	);
}

/**
 * Recalculates elective numbers based on current state
 * @param {StudyPlanner} planner - The planner instance to update
 * @returns {StudyPlanner} Updated planner with recalculated elective numbers
 */
function RecalculateElectiveNumbers(planner) {
	const newPlanner = planner.Clone();
	let currentElectiveNumber = 1;

	// First pass: Reset all elective names
	newPlanner.years.forEach(year => {
		year.semesters.forEach(semester => {
			semester.units.forEach(unit => {
				if (unit.unit_type?._name?.toLowerCase() === "elective" && !unit.unit?.code) {
					unit.unit.name = null; // Reset name to be recalculated
				}
			});
		});
	});

	// Second pass: Assign new numbers
	newPlanner.years.forEach(year => {
		year.semesters.forEach(semester => {
			semester.units.forEach(unit => {
				if (unit.unit_type?._name?.toLowerCase() === "elective" && !unit.unit?.code) {
					unit.unit.name = `Elective ${currentElectiveNumber}`;
					currentElectiveNumber++;
				}
			});
		});
	});

	// Update the elective counter
	newPlanner.elective_counter = currentElectiveNumber - 1;
	return newPlanner;
}

function AddImportedDataIntoPlanner(years, empty_planner) {
	let planner = empty_planner.Clone();
	//Add the years, the semsters, and then the units, ensure to remove the unit id and sem_id
	for (let year_index = 0; year_index < years.length; year_index++) {
		let year_count = year_index + 1;
		if (year_index != 0) {
			planner = planner.AddNewYear();
		}

		let year_obj = years[year_index];
		//Add the semesters
		for (let sem_index = 0; sem_index < year_obj.semesters.length; sem_index++) {
			let sem_obj = year_obj.semesters[sem_index]
			let sem_type = sem_obj.sem_type;

			//If NOT (first year and first sem)
			if (!(year_count === 1 && sem_index === 0)) {
				planner = planner.AddNewSemester(year_count, sem_type, null, false);
			}

			for (let unit_index = 0; unit_index < sem_obj.units.length; unit_index++) {
				let unit_obj = sem_obj.units[unit_index];

				//TODO: Might have to update here as well
				let unit_to_add_obj = {
					unit_id: unit_obj?.unit?.unit_id,
					unit_code: unit_obj?.unit?.code,
					unit_name: unit_obj?.unit?.name,
					unit_cp: unit_obj?.unit?.credit_points,
					unit_requisites: unit_obj.requisites,
					unit_type: unit_obj?.unit_type,
					is_offered: CheckUnitOffering(unit_obj, sem_type),
					has_conflict: unit_obj.has_conflict,
					unit_availability: unit_obj?.unit?.availability
				}
				planner = planner.AddNewUnitRowIntoSemester(year_count, sem_index);
				planner = planner.EditUnitInUnitRow(year_count, sem_index, unit_index, unit_to_add_obj);
			}
		}
	}
	return planner;
}
